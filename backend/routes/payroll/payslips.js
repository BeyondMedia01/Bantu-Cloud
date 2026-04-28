const express = require('express');
const prisma = require('../../lib/prisma');
const { requirePermission } = require('../../lib/permissions');
const { calculatePaye } = require('../../utils/taxEngine');
const { generatePayrollSummaryPDF, generatePayslipSummaryPDF, generatePayslipSummaryBuffer } = require('../../utils/pdfService');
const { audit } = require('../../lib/audit');
const { validateBody } = require('../../lib/validate');
const { sendPayslip } = require('../../lib/mailer');
const { getYtdStartDate } = require('../../utils/ytdCalculator');
const { payslipToBuffer, buildPayslipLineItems } = require('../../utils/payslipFormatter');

const router = express.Router({ mergeParams: true });

// ─── GET /api/payroll/:runId/payslips ─────────────────────────────────────────

router.get('/:runId/payslips', async (req, res) => {
  try {
    if (req.companyId) {
      const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId }, select: { companyId: true } });
      if (!run) return res.status(404).json({ message: 'Payroll run not found' });
      if (run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    }

    const [payslips, transactions] = await Promise.all([
      prisma.payslip.findMany({
        where: { payrollRunId: req.params.runId },
        include: {
          employee: {
            select: { firstName: true, lastName: true, position: true, employeeCode: true, currency: true, baseRate: true },
          },
        },
        orderBy: [{ employee: { lastName: 'asc' } }],
      }),
      prisma.payrollTransaction.findMany({
        where: { payrollRunId: req.params.runId },
        include: { transactionCode: { select: { type: true, code: true, name: true, preTax: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Group transactions by employeeId
    const txByEmp = {};
    for (const t of transactions) {
      (txByEmp[t.employeeId] = txByEmp[t.employeeId] || []).push(t);
    }

    const result = payslips.map((p) => {
      const empTxs = txByEmp[p.employeeId] || [];
      const earningTxs = empTxs.filter(
        (t) => t.transactionCode.type === 'EARNING' || t.transactionCode.type === 'BENEFIT'
      );
      const deductionTxs = empTxs.filter(
        (t) => t.transactionCode.type === 'DEDUCTION'
      );
      return {
        ...p,
        basicSalary: p.employee?.baseRate ?? 0,
        allowancesTotal: earningTxs.reduce((s, t) => s + t.amount, 0),
        earningLines: earningTxs.map((t) => ({
          tcId: t.transactionCodeId,
          code: t.transactionCode.code,
          name: t.transactionCode.name,
          amount: t.amount,
          currency: t.currency,
        })),
        deductionLines: deductionTxs.map((t) => ({
          tcId: t.transactionCodeId,
          code: t.transactionCode.code,
          name: t.transactionCode.name,
          amount: t.amount,
          currency: t.currency,
        })),
      };
    });

    res.json({ data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId/payslips/:id/pdf ─────────────────────────────────

router.get('/:runId/payslips/:id/pdf', async (req, res) => {
  try {
    const payslip = await prisma.payslip.findUnique({
      where: { id: req.params.id },
      include: {
        employee: true,
        payrollRun: { include: { company: true } },
      },
    });

    if (!payslip) return res.status(404).json({ message: 'Payslip not found' });
    if (req.companyId && payslip.payrollRun.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (req.user?.role === 'EMPLOYEE' && req.employeeId && payslip.employeeId !== req.employeeId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const result = await payslipToBuffer(req.params.id);
    if (!result) return res.status(404).json({ message: 'Payslip not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=payslip-${result.employeeName.replace(/\s+/g, '-')}.pdf`
    );
    res.send(result.buffer);
  } catch (error) {
    console.error('[PDF] payslip PDF generation failed:', error?.message || error);
    res.status(500).json({ message: error?.message || 'Internal server error' });
  }
});

/**
 * Shared logic to build the professional table lines with YTD data.
 */
// buildPayslipLineItems refactored to ../utils/payslipFormatter.js

// ─── GET /api/payroll/:runId/summary/pdf ─────────────────────────────────────

router.get('/:runId/summary/pdf', requirePermission('export_reports'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { company: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: run.id },
      include: {
        employee: {
          include: { department: true }
        }
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    // Fetch transactions for this run to provide breakdown (pension vs other)
    const transactions = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: run.id },
      include: { transactionCode: { select: { type: true, incomeCategory: true, preTax: true } } },
    });
    const txByPayslip = {};
    for (const t of transactions) {
      const key = `${t.employeeId}`;
      if (!txByPayslip[key]) txByPayslip[key] = { pension: 0, otherDeductions: 0 };

      const isPension = t.transactionCode.incomeCategory === 'PENSION';
      if (t.transactionCode.type === 'DEDUCTION') {
        if (isPension) txByPayslip[key].pension += t.amount;
        else txByPayslip[key].otherDeductions += t.amount;
      }
    }

    // Grouping by Department/CostCenter (Belina style)
    const groupsMap = {};
    for (const ps of payslips) {
      const gName = ps.employee.department?.name || ps.employee.costCenter || 'General';
      if (!groupsMap[gName]) groupsMap[gName] = [];

      // Inject breakdown into payslip object for the PDF generator
      const breakdown = txByPayslip[ps.employeeId] || { pension: 0, otherDeductions: 0 };
      groupsMap[gName].push({
        ...ps,
        pensionActual: breakdown.pension,
        otherDeductionsActual: breakdown.otherDeductions,
      });
    }
    const sortedGroups = Object.keys(groupsMap).sort().map(name => ({
      name,
      payslips: groupsMap[name]
    }));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Master-Roll-${run.id}.pdf`);

    generatePayrollSummaryPDF({
      companyName: run.company?.name || 'Master Roll',
      period: `${run.startDate.toLocaleDateString()} – ${run.endDate.toLocaleDateString()}`,
      currency: run.dualCurrency ? 'USD + ZiG' : (run.currency || 'USD'),
      isDual: !!run.dualCurrency,
      groups: sortedGroups,
    }, res);
  } catch (error) {
    console.error('Payroll summary PDF error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate PDF' });
  }
});

// ─── GET /api/payroll/:runId/payslip-summary ─────────────────────────────
router.get('/:runId/payslip-summary', requirePermission('export_reports'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { company: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    // Fetch payslips (NO transactions relation on Payslip model)
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: run.id },
      include: {
        employee: { include: { department: true } },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    // Fetch transactions separately via PayrollTransaction model
    const allTransactions = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: run.id },
      include: { transactionCode: true },
      orderBy: { createdAt: 'asc' },
    });

    // Fetch PayrollInput records to get units/unitsType (not stored on PayrollTransaction)
    const allInputs = await prisma.payrollInput.findMany({
      where: { payrollRunId: run.id },
      select: { employeeId: true, transactionCodeId: true, units: true, unitsType: true },
    });
    // Build lookup: `${employeeId}:${transactionCodeId}` → { units, unitsType }
    const inputUnitsMap = {};
    for (const inp of allInputs) {
      inputUnitsMap[`${inp.employeeId}:${inp.transactionCodeId}`] = {
        units: inp.units ?? null,
        unitsType: inp.unitsType ?? null,
      };
    }

    // Group transactions by employeeId for quick lookup
    const txByEmployee = {};
    for (const tx of allTransactions) {
      if (!txByEmployee[tx.employeeId]) txByEmployee[tx.employeeId] = [];
      txByEmployee[tx.employeeId].push(tx);
    }

    // Helper to safely convert Prisma Decimal to Number
    const num = (v) => Number(v ?? 0);

    const groupsMap = {};
    for (const ps of payslips) {
      try {
        const gName = ps.employee?.department?.name || ps.employee?.costCenter || 'General';
        if (!groupsMap[gName]) groupsMap[gName] = [];
        
        const basicSalary = num(ps.basicSalaryApplied) > 0
          ? num(ps.basicSalaryApplied)
          : num(ps.employee?.baseRate);

        // Normalise payslip numeric fields
        const normPs = {
          ...ps,
          paye: num(ps.paye),
          aidsLevy: num(ps.aidsLevy),
          nssaEmployee: num(ps.nssaEmployee),
          nssaEmployer: num(ps.nssaEmployer),
          wcifEmployer: num(ps.wcifEmployer),
          sdfContribution: num(ps.sdfContribution),
          zimdefEmployer: num(ps.zimdefEmployer),
          necLevy: num(ps.necLevy),
          necEmployer: num(ps.necEmployer),
          loanDeductions: num(ps.loanDeductions),
          netPay: num(ps.netPay),
          gross: num(ps.gross),
          medicalAidCredit: num(ps.medicalAidCredit),
          pensionApplied: num(ps.pensionApplied),
        };

        // Get transactions for this employee, normalise amounts, and attach units from PayrollInput
        const empTxs = (txByEmployee[ps.employeeId] || [])
          .filter(t => t.transactionCode)
          .map(t => {
            const key = `${ps.employeeId}:${t.transactionCodeId}`;
            const unitsData = inputUnitsMap[key] || {};
            return { ...t, amount: num(t.amount), ...unitsData };
          });

        const displayLines = buildPayslipLineItems({
          payslip: { ...normPs, payrollRun: run },
          transactions: empTxs,
          basicSalary,
          ytdStat: {},
          ytdMap: {}
        });

        groupsMap[gName].push({
          ...normPs,
          displayLines,
          currency: run.currency,
          isDual: !!run.dualCurrency,
        });
      } catch (lineErr) {
        console.error('Skipping payslip in summary:', ps.id, lineErr.message);
      }
    }

    const sortedGroups = Object.keys(groupsMap).sort().map(name => ({
      name,
      payslips: groupsMap[name]
    }));

    const buffer = await generatePayslipSummaryBuffer({
      companyName: run.company?.name || 'Bantu - HR & Payroll',
      period: `${run.startDate.getFullYear()}/${(run.startDate.getMonth() + 1).toString().padStart(2, '0')}`,
      isDual: !!run.dualCurrency,
      currency: run.currency || 'USD',
      exchangeRate: run.exchangeRate ?? null,
      groups: sortedGroups,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Payslip-Summary-${run.id}.pdf`);
    res.send(buffer);

  } catch (error) {
    console.error('Payslip Summary error:', error);
    if (!res.headersSent) res.status(500).json({ message: error.message || 'Failed to generate PDF' });
  }
});

// ─── Payslip Send Helpers ─────────────────────────────────────────────────────

/**
 * Fetches all data for a payslip, generates the PDF, and returns a buffer
 * along with metadata needed for the email (recipient address, names, period).
 */
// payslipToBuffer refactored to ../utils/payslipFormatter.js

// ─── POST /api/payroll/:runId/payslips/:id/send ───────────────────────────────

router.post('/:runId/payslips/:id/send', requirePermission('export_reports'), async (req, res) => {
  try {
    const result = await payslipToBuffer(req.params.id);
    if (!result) return res.status(404).json({ message: 'Payslip not found' });
    if (req.companyId && result.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!result.email) {
      return res.status(400).json({ message: 'Employee has no email address on file' });
    }

    await sendPayslip(result.email, {
      employeeName: result.employeeName,
      companyName: result.companyName,
      period: result.period,
      pdfBuffer: result.buffer,
    });

    res.json({ message: 'Payslip sent', to: result.email });
  } catch (error) {
    console.error('Send payslip error:', error);
    res.status(500).json({ message: 'Failed to send payslip' });
  }
});

// ─── POST /api/payroll/:runId/send-all ────────────────────────────────────────

router.post('/:runId/send-all', requirePermission('export_reports'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Fetch all payslip IDs for this run
    const payslipIds = (await prisma.payslip.findMany({
      where: { payrollRunId: run.id },
      select: { id: true },
    })).map((p) => p.id);

    if (payslipIds.length === 0) {
      return res.status(400).json({ message: 'No payslips found for this run' });
    }

    // Queue a job for each payslip
    await prisma.job.createMany({
      data: payslipIds.map(id => ({
        type: 'EMAIL_PAYSLIP',
        payload: { payslipId: id },
        status: 'PENDING',
      })),
    });

    await audit({
      req,
      action: 'BULK_PAYSLIP_EMAILS_QUEUED',
      resource: 'payroll_run',
      resourceId: run.id,
      details: { count: payslipIds.length },
    });

    res.json({
      message: `${payslipIds.length} payslip emails have been queued and will be sent in the background.`,
      count: payslipIds.length
    });
  } catch (error) {
    console.error('Queue bulk payslips error:', error);
    res.status(500).json({ message: 'Failed to queue payslip emails' });
  }
});

module.exports = router;
