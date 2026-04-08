const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// ─── Helper: verify run belongs to company ────────────────────────────────────

async function getRunForCompany(runId, companyId) {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    select: { 
      id: true, companyId: true, startDate: true, endDate: true, dualCurrency: true, currency: true,
      payrollCalendar: { select: { year: true, month: true } }
    },
  });
  if (!run) return null;
  if (companyId && run.companyId !== companyId) return null;
  return run;
}

// ─── GET /api/statutory-exports/zimra-paye/:runId ────────────────────────────
// ZIMRA P2 Monthly PAYE Return upload format (CSV)

router.get('/zimra-paye/:runId', requirePermission('export_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    // Gate: company must have ZIMRA BP number and TIN configured
    const companyForCheck = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { taxId: true, registrationNumber: true },
    });
    if (!companyForCheck?.taxId) {
      return res.status(422).json({ message: 'Company TIN (taxId) is required for ZIMRA e-filing export. Configure it under Company Settings.' });
    }
    if (!companyForCheck?.registrationNumber) {
      return res.status(422).json({ message: 'Company BP Number (registrationNumber) is required for ZIMRA e-filing export. Configure it under Company Settings.' });
    }

    const run = await getRunForCompany(req.params.runId, req.companyId);
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: req.params.runId },
      include: {
        employee: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
            tin: true,
            nationalId: true,
            passportNumber: true,
          },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    const period = run.startDate ? new Date(run.startDate) : new Date();
    const month = String(run.payrollCalendar?.month || (period.getMonth() + 1)).padStart(2, '0');
    const year = run.payrollCalendar?.year || period.getFullYear();

    // ZIMRA P2 CSV header — matches ZIMRA e-Tax bulk upload template
    const header = [
      'EmployeeCode',
      'TIN',
      'Surname',
      'OtherNames',
      'IDPassport',
      'Month',
      'Year',
      'GrossIncome',
      'AllowableDeductions',
      'TaxableIncome',
      'TaxableIncomeAnnual',
      'PAYE',
      'AIDSLevy',
      'TotalTaxDeducted',
    ].join(',');

    const rows = payslips.map((p) => {
      // For apportionment-method dual-currency runs, payslip.gross/paye/aidsLevy already hold the
      // consolidated USD-equivalent totals — use them directly for all run types.
      const gross = p.gross ?? 0;
      const paye = p.paye ?? 0;
      const aidsLevy = p.aidsLevy ?? 0;
      const nssa = p.nssaEmployee ?? 0;
      // AllowableDeductions = NSSA + pension (ZIMRA P2 spec: both are pre-tax deductions)
      const pension = p.pensionApplied ?? 0;
      const allowableDeductions = nssa + pension;
      const taxable = Math.max(0, gross - allowableDeductions);
      const annualTaxable = (taxable * 12).toFixed(2);
      const totalTax = (paye + aidsLevy).toFixed(2);

      return [
        p.employee.employeeCode || '',
        p.employee.tin || '',
        `"${(p.employee.lastName || '').replace(/"/g, '""')}"`,
        `"${(p.employee.firstName || '').replace(/"/g, '""')}"`,
        p.employee.nationalId || p.employee.passportNumber || '',
        month,
        year,
        gross.toFixed(2),
        allowableDeductions.toFixed(2),
        taxable.toFixed(2),
        annualTaxable,
        paye.toFixed(2),
        aidsLevy.toFixed(2),
        totalTax,
      ].join(',');
    });

    const filename = `ZIMRA-PAYE-P2-${year}-${month}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send([header, ...rows].join('\n'));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/statutory-exports/nssa/:runId ───────────────────────────────────
// NSSA Contribution Schedule upload format (CSV)

router.get('/nssa/:runId', requirePermission('export_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const run = await getRunForCompany(req.params.runId, req.companyId);
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    // Fetch company to get employer NSSA registration number (stored in registrationNumber or taxId)
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { name: true, registrationNumber: true, taxId: true, nssaNumber: true },
    });

    if (!company?.nssaNumber) {
      return res.status(422).json({
        message: 'NSSA employer registration number is required for NSSA CSV export. Configure it under Company Settings.',
      });
    }

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: req.params.runId },
      include: {
        employee: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
            nationalId: true,
            passportNumber: true,
            socialSecurityNum: true,
          },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    const period = run.startDate ? new Date(run.startDate) : new Date();
    const month = String(run.payrollCalendar?.month || (period.getMonth() + 1)).padStart(2, '0');
    const year = run.payrollCalendar?.year || period.getFullYear();
    const employerCode = company.nssaNumber;

    // NSSA CSV header — matches NSSA bulk upload template
    const header = [
      'EmployerCode',
      'NSSANumber',
      'NationalID',
      'Surname',
      'Firstname',
      'Month',
      'Year',
      'PensionableEarnings',
      'EmployeeContribution',
      'EmployerContribution',
      'TotalContribution',
    ].join(',');

    const rows = payslips.map((p) => {
      // Consolidated USD-equivalent totals — correct for both single and dual-currency runs.
      const nssaEmp  = p.nssaEmployee ?? 0;
      const nssaEmpr = p.nssaEmployer ?? nssaEmp; // stored employer contribution; fallback to employee amount
      const total = (nssaEmp + nssaEmpr).toFixed(2);

      // Pensionable earnings: use stored nssaBasis (ceiling-capped base used at processing time).
      // Avoids fragility of back-calculating from contribution when the rate changes between runs.
      const gross = p.gross ?? 0;
      const pensionable = (p.nssaBasis != null && p.nssaBasis > 0)
        ? p.nssaBasis.toFixed(2)
        : gross.toFixed(2);

      return [
        employerCode,
        p.employee.socialSecurityNum || '',
        p.employee.nationalId || p.employee.passportNumber || '',
        `"${(p.employee.lastName || '').replace(/"/g, '""')}"`,
        `"${(p.employee.firstName || '').replace(/"/g, '""')}"`,
        month,
        year,
        pensionable,
        nssaEmp.toFixed(2),
        nssaEmpr.toFixed(2),
        total,
      ].join(',');
    });

    const filename = `NSSA-${year}-${month}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send([header, ...rows].join('\n'));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
