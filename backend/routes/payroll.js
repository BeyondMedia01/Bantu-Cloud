const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { calculatePaye } = require('../utils/taxEngine');
const { generatePayrollSummaryPDF, generatePayslipSummaryPDF, generatePayslipSummaryBuffer } = require('../utils/pdfService');
const { getSettingAsNumber } = require('../lib/systemSettings');
const { audit } = require('../lib/audit');
const { validateBody } = require('../lib/validate');
const { sendPayslip } = require('../lib/mailer');
const { getYtdStartDate } = require('../utils/ytdCalculator');
const { payslipToBuffer, buildPayslipLineItems } = require('../utils/payslipFormatter');

const router = express.Router();


// --- Sub-Routers ---
router.use('/', require('./payroll/process'));
router.use('/', require('./payroll/reports'));
router.use('/', require('./payroll/payslips'));

// --- Base CRUD ---
// ─── GET /api/payroll ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { status } = req.query;
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });

  try {
    const [runs, employeeCount] = await Promise.all([
      prisma.payrollRun.findMany({
        where: {
          companyId: req.companyId,
          ...(status && { status }),
        },
        include: { 
          _count: { select: { payslips: true } },
          payrollCalendar: true
        },
        orderBy: { runDate: 'desc' },
      }),
      prisma.employee.count({ where: { companyId: req.companyId } }),
    ]);
    res.json({ data: runs.map((r) => ({ ...r, employeeCount })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/payroll — create a DRAFT run (no payslips yet) ─────────────────

router.post(
  '/',
  requirePermission('manage_payroll'),
  validateBody({
    startDate: { required: true, isDate: true },
    endDate: { required: true, isDate: true },
  }),
  async (req, res) => {
    const { startDate, endDate, currency, exchangeRate, dualCurrency, payrollCalendarId, notes } = req.body;
    if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });

    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({ message: 'endDate must be after startDate' });
    }

    const isDual = dualCurrency === true || dualCurrency === 'true';
    if (isDual && (!exchangeRate || parseFloat(exchangeRate) <= 1)) {
      return res.status(400).json({ message: 'A valid USD→ZiG exchange rate (>1) is required for dual-currency runs' });
    }

    try {
      // Period-lock check: block if any overlapping calendar for this client is closed
      const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
        where: {
          clientId: req.clientId, // assumes clientId is resolved in companyContext
          isClosed: true,
          startDate: { lte: new Date(endDate) },
          endDate: { gte: new Date(startDate) },
        },
      });
      if (overlappingClosedCal) {
        return res.status(400).json({ message: `Cannot create payroll for a closed period (${overlappingClosedCal.year}-${overlappingClosedCal.month || ''})` });
      }

      const run = await prisma.payrollRun.create({
        data: {
          companyId: req.companyId,
          payrollCalendarId: payrollCalendarId || null,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          currency: isDual ? 'USD' : (currency || 'USD'),
          exchangeRate: parseFloat(exchangeRate || 1),
          dualCurrency: isDual,
          status: 'DRAFT',
          notes: notes || null,
        },
      });

      await audit({
        req,
        action: 'PAYROLL_RUN_CREATED',
        resource: 'payroll_run',
        resourceId: run.id,
        details: { currency: run.currency, startDate, endDate, status: 'DRAFT' },
      });

      res.status(201).json(run);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ─── POST /api/payroll/:runId/submit — DRAFT → PENDING_APPROVAL ───────────────

router.post('/:runId/submit', requirePermission('manage_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { payrollCalendar: true }
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    if (run.payrollCalendar?.isClosed) {
      return res.status(400).json({ message: 'Cannot submit a payroll run for a closed period' });
    }
    // Date-based fallback: check any closed calendar for this client that overlaps the run's dates
    const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: req.clientId,
        isClosed: true,
        startDate: { lte: run.endDate },
        endDate: { gte: run.startDate },
      },
    });
    if (overlappingClosedCal) {
      return res.status(400).json({ message: 'A closed calendar period overlaps with this payroll run dates' });
    }

    if (run.status !== 'DRAFT') return res.status(400).json({ message: 'Only DRAFT runs can be submitted for approval' });

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'PENDING_APPROVAL' },
    });

    await audit({ req, action: 'PAYROLL_RUN_SUBMITTED', resource: 'payroll_run', resourceId: run.id });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/payroll/:runId/approve — PENDING_APPROVAL → APPROVED ──────────

router.post('/:runId/approve', requirePermission('approve_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { payrollCalendar: true }
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    if (run.payrollCalendar?.isClosed) {
      return res.status(400).json({ message: 'Cannot approve a payroll run for a closed period' });
    }
    const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: req.clientId,
        isClosed: true,
        startDate: { lte: run.endDate },
        endDate: { gte: run.startDate },
      },
    });
    if (overlappingClosedCal) {
      return res.status(400).json({ message: 'A closed calendar period overlaps with this payroll run dates' });
    }

    if (!['PENDING_APPROVAL', 'DRAFT'].includes(run.status)) {
      return res.status(400).json({ message: 'Only DRAFT or PENDING_APPROVAL runs can be approved' });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'APPROVED' },
    });

    await audit({ req, action: 'PAYROLL_RUN_APPROVED', resource: 'payroll_run', resourceId: run.id });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId ───────────────────────────────────────────────────

router.get('/:runId', async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: {
        payslips: {
          include: { employee: { select: { firstName: true, lastName: true, position: true } } },
        },
        _count: { select: { payslips: true } },
        payrollCalendar: true,
      },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    res.json({ data: run });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/payroll/:runId ──────────────────────────────────────────────────

router.put('/:runId', requirePermission('approve_payroll'), async (req, res) => {
  const { status, notes } = req.body;
  const VALID_TRANSITIONS = {
    DRAFT: ['PENDING_APPROVAL', 'APPROVED'],
    PENDING_APPROVAL: ['APPROVED', 'DRAFT'],
    APPROVED: ['DRAFT'],
  };

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { payrollCalendar: true }
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    if (run.payrollCalendar?.isClosed) {
      return res.status(400).json({ message: 'Cannot update a payroll run for a closed period' });
    }
    const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: run.company?.clientId,
        isClosed: true,
        startDate: { lte: run.endDate },
        endDate: { gte: run.startDate },
      },
    });
    if (overlappingClosedCal) {
      return res.status(400).json({ message: 'A closed calendar period overlaps with this payroll run dates' });
    }

    if (status && VALID_TRANSITIONS[run.status] && !VALID_TRANSITIONS[run.status].includes(status)) {
      return res.status(400).json({
        message: `Cannot transition from ${run.status} to ${status}`,
      });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      },
    });

    if (status) {
      await audit({ req, action: `PAYROLL_STATUS_${status}`, resource: 'payroll_run', resourceId: run.id });
    }

    res.json({ data: updated });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Payroll run not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── DELETE /api/payroll/:runId — DRAFT only ─────────────────────────────────

router.delete('/:runId', requirePermission('manage_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.status !== 'DRAFT') return res.status(400).json({ message: 'Only DRAFT runs can be deleted' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.payrollRun.delete({ where: { id: run.id } });
    await audit({ req, action: 'PAYROLL_RUN_DELETED', resource: 'payroll_run', resourceId: run.id });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


module.exports = router;
