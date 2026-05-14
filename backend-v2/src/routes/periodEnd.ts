import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

router.post('/', requirePermission('approve_payroll'), async (c) => {
  const clientId = c.get('clientId');
  const { payrollCalendarId } = await c.req.json();
  if (!payrollCalendarId) return c.json({ message: 'payrollCalendarId is required' }, 400);

  try {
    const calendar = await prisma.payrollCalendar.findUnique({ where: { id: payrollCalendarId } });
    if (!calendar) return c.json({ message: 'Payroll calendar not found' }, 404);
    if (calendar.isClosed) return c.json({ message: 'Period is already closed' }, 400);
    if (!clientId || calendar.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);

    await prisma.payrollCalendar.update({
      where: { id: payrollCalendarId },
      data: { isClosed: true },
    });

    const { count: runsCompleted } = await prisma.payrollRun.updateMany({
      where: { payrollCalendarId, status: 'PROCESSING' },
      data: { status: 'COMPLETED' },
    });

    const { count: repaymentsMarked } = await prisma.loanRepayment.updateMany({
      where: {
        status: 'UNPAID',
        dueDate: { gte: calendar.startDate, lte: calendar.endDate },
        loan: { employee: { clientId: calendar.clientId } },
      },
      data: { status: 'OVERDUE' },
    });

    const activeEmployees = await prisma.employee.findMany({
      where: { clientId: calendar.clientId, dischargeDate: null },
      select: { id: true, leaveEntitlement: true, leaveBalance: true },
    });

    for (const emp of activeEmployees) {
      const annualEntitlement = emp.leaveEntitlement || 30;
      const monthlyAccrual = annualEntitlement / 12;
      await prisma.employee.update({
        where: { id: emp.id },
        data: { leaveBalance: { increment: monthlyAccrual }, leaveTaken: 0 },
      });
    }

    await prisma.employee.updateMany({
      where: { clientId: calendar.clientId, dischargeDate: { not: null } },
      data: { leaveTaken: 0 },
    });

    return c.json({
      message: 'Period-end processing completed',
      calendarId: payrollCalendarId,
      runsCompleted,
      repaymentsMarked,
    });
  } catch (error: any) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/status', requirePermission('approve_payroll'), async (c) => {
  const clientId = c.get('clientId');
  const payrollCalendarId = c.req.query('payrollCalendarId');
  if (!payrollCalendarId) return c.json({ message: 'payrollCalendarId is required' }, 400);

  try {
    const [calendar, runsInProgress] = await Promise.all([
      prisma.payrollCalendar.findUnique({ where: { id: payrollCalendarId } }),
      prisma.payrollRun.count({ where: { payrollCalendarId, status: { in: ['PROCESSING', 'DRAFT'] } } }),
    ]);

    if (!calendar) return c.json({ message: 'Payroll calendar not found' }, 404);
    if (!clientId || calendar.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);

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

    return c.json({
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
  } catch (error: any) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/un-close', requirePermission('approve_payroll'), async (c) => {
  const clientId = c.get('clientId');
  const { payrollCalendarId } = await c.req.json();
  if (!payrollCalendarId) return c.json({ message: 'payrollCalendarId is required' }, 400);

  try {
    const calendar = await prisma.payrollCalendar.findUnique({ where: { id: payrollCalendarId } });
    if (!calendar) return c.json({ message: 'Payroll calendar not found' }, 404);
    if (!calendar.isClosed) return c.json({ message: 'Period is not closed' }, 400);
    if (!clientId || calendar.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);

    await prisma.payrollCalendar.update({
      where: { id: payrollCalendarId },
      data: { isClosed: false },
    });

    return c.json({ message: 'Period re-opened successfully', calendarId: payrollCalendarId });
  } catch (error: any) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
