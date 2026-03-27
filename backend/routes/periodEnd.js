const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

/**
 * POST /api/period-end
 * Runs period-end processing for a payroll calendar period.
 * - Closes the payroll calendar
 * - Marks all PROCESSING payroll runs as COMPLETED
 * - Marks all pending loan repayments for the period as DUE
 *
 * Body: { payrollCalendarId: string }
 */
router.post('/', requirePermission('approve_payroll'), async (req, res) => {
  const { payrollCalendarId } = req.body;
  if (!payrollCalendarId) return res.status(400).json({ message: 'payrollCalendarId is required' });

  try {
    const calendar = await prisma.payrollCalendar.findUnique({
      where: { id: payrollCalendarId },
    });

    if (!calendar) return res.status(404).json({ message: 'Payroll calendar not found' });
    if (calendar.isClosed) return res.status(400).json({ message: 'Period is already closed' });

    // Verify the calendar belongs to this client
    if (req.clientId && calendar.clientId !== req.clientId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const results = await prisma.$transaction(async (tx) => {
      // Close the calendar period
      const closedCalendar = await tx.payrollCalendar.update({
        where: { id: payrollCalendarId },
        data: { isClosed: true },
      });

      // Finalise any runs still in PROCESSING state for this calendar
      const { count: runsCompleted } = await tx.payrollRun.updateMany({
        where: { payrollCalendarId, status: 'PROCESSING' },
        data: { status: 'COMPLETED' },
      });

      // Mark any UNPAID loan repayments within the period as OVERDUE
      // (catches repayments not collected via salary deduction, e.g. cash-based loans)
      const { count: repaymentsMarked } = await tx.loanRepayment.updateMany({
        where: {
          status: 'UNPAID',
          dueDate: {
            gte: calendar.startDate,
            lte: calendar.endDate,
          },
        },
        data: { status: 'OVERDUE' },
      });

      // Clear current-period leaveTaken counter for all employees under this client
      // (ensures next period starts with 0 "taken" days on payslips while YTD LeaveBalance remains intact)
      await tx.employee.updateMany({
        where: { clientId: calendar.clientId },
        data: { leaveTaken: 0 },
      });

      return { closedCalendar, runsCompleted, repaymentsMarked };
    });

    res.json({
      message: 'Period-end processing completed',
      calendarId: payrollCalendarId,
      runsCompleted: results.runsCompleted,
      repaymentsMarked: results.repaymentsMarked,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/period-end/status?payrollCalendarId= — check period status
router.get('/status', async (req, res) => {
  const { payrollCalendarId } = req.query;
  if (!payrollCalendarId) return res.status(400).json({ message: 'payrollCalendarId is required' });

  try {
    const [calendar, runsInProgress] = await Promise.all([
      prisma.payrollCalendar.findUnique({ where: { id: payrollCalendarId } }),
      prisma.payrollRun.count({ where: { payrollCalendarId, status: { in: ['PROCESSING', 'DRAFT'] } } }),
    ]);

    if (!calendar) return res.status(404).json({ message: 'Payroll calendar not found' });

    // Find all unprocessed inputs for this client (any period) — includes stale inputs from prior months
    const clientCompanyIds = await prisma.company.findMany({
      where: { clientId: calendar.clientId },
      select: { id: true },
    }).then((cs) => cs.map((c) => c.id));

    const pendingInputRecords = await prisma.payrollInput.findMany({
      where: {
        payrollRunId: null,
        processed: false,
        employee: { companyId: { in: clientCompanyIds } },
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        transactionCode: { select: { code: true, name: true } },
      },
    });

    res.json({
      calendar,
      runsInProgress,
      pendingInputs: pendingInputRecords.length,
      pendingInputDetails: pendingInputRecords.map((i) => ({
        id: i.id,
        employee: `${i.employee.firstName} ${i.employee.lastName} (${i.employee.employeeCode})`,
        transactionCode: `${i.transactionCode.code} — ${i.transactionCode.name}`,
        period: i.period,
        amount: i.employeeUSD ?? i.employeeZiG ?? 0,
        currency: i.employeeZiG ? 'ZiG' : 'USD',
      })),
      readyToClose: runsInProgress === 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/period-end/un-close
 * Re-opens a closed payroll calendar period.
 */
router.post('/un-close', requirePermission('approve_payroll'), async (req, res) => {
  const { payrollCalendarId } = req.body;
  if (!payrollCalendarId) return res.status(400).json({ message: 'payrollCalendarId is required' });

  try {
    const calendar = await prisma.payrollCalendar.findUnique({
      where: { id: payrollCalendarId },
    });

    if (!calendar) return res.status(404).json({ message: 'Payroll calendar not found' });
    if (!calendar.isClosed) return res.status(400).json({ message: 'Period is not closed' });

    // Verify ownership
    if (req.clientId && calendar.clientId !== req.clientId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updated = await prisma.payrollCalendar.update({
      where: { id: payrollCalendarId },
      data: { isClosed: false },
    });

    res.json({ message: 'Period re-opened successfully', calendarId: updated.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
