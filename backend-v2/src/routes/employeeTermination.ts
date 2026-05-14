import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

router.get('/', requirePermission('manage_employees'), async (c) => {
  const employee = await prisma.employee.findUnique({
    where: { id: c.req.param('id') },
    include: { leaveBalances: { where: { leaveType: 'ANNUAL' }, orderBy: { year: 'desc' }, take: 1 } },
  });
  if (!employee) return c.json({ message: 'Employee not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && employee.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const terminationDate = c.req.query('terminationDate') ? new Date(c.req.query('terminationDate')!) : new Date();
  const noticeDays = parseInt(c.req.query('noticeDays') || '30');
  const noticeGiven = c.req.query('noticeGiven') === 'true';
  const currency = c.req.query('currency') || employee.currency || 'USD';

  const lastPayslip = await prisma.payslip.findFirst({
    where: { employeeId: employee.id },
    orderBy: { createdAt: 'desc' },
  });
  const lastGross = lastPayslip?.gross ?? employee.baseRate;
  const monthlyPay = lastGross;
  const termDay = terminationDate.getDate();
  const daysInTermMonth = new Date(terminationDate.getFullYear(), terminationDate.getMonth() + 1, 0).getDate();
  const proRataSalary = monthlyPay * (termDay / daysInTermMonth);

  const daysPerMonth = 30;
  const divisor = employee.daysPerPeriod || 22;

  let noticePay = 0;
  if (!noticeGiven) {
    if (employee.paymentBasis === 'DAILY') {
      noticePay = noticeDays * Number(employee.baseRate);
    } else if (employee.paymentBasis === 'HOURLY') {
      const hoursPerDay = employee.hoursPerPeriod ? employee.hoursPerPeriod / divisor : 8;
      noticePay = noticeDays * hoursPerDay * Number(employee.baseRate);
    } else {
      noticePay = noticeDays * (monthlyPay / daysPerMonth);
    }
  }

  const leaveBalance = employee.leaveBalances?.[0]?.balance ?? employee.leaveBalance ?? 0;
  const dailyRate = monthlyPay / daysPerMonth;
  const leavePayment = Number(leaveBalance) * dailyRate;
  const yearsOfService = Math.max(0, (terminationDate.getTime() - new Date(employee.startDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  const totalGross = proRataSalary + noticePay + leavePayment;

  return c.json({
    data: {
      employeeId: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      employeeCode: employee.employeeCode,
      currency,
      terminationDate: terminationDate.toISOString().slice(0, 10),
      yearsOfService: parseFloat(yearsOfService.toFixed(2)),
      lastGross,
      monthlyPay,
      proRataSalary: parseFloat(proRataSalary.toFixed(2)),
      noticeDays,
      noticeGiven,
      noticePay: parseFloat(noticePay.toFixed(2)),
      leaveBalance: parseFloat(leaveBalance.toFixed(2)),
      leavePayment: parseFloat(leavePayment.toFixed(2)),
      totalGross: parseFloat(totalGross.toFixed(2)),
      note: 'Tax on termination payments should be computed in the payroll run using the SEVERANCE transaction code.',
    },
  });
});

export default router;
