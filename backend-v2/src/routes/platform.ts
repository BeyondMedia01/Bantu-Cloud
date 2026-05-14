import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { issueLicense, revokeLicense, reactivateLicense, validateLicense } from '../lib/license';

const router = new Hono();

router.get('/dashboard/reminders', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ birthdays: [], anniversaries: [] });
  const where: Record<string, unknown> = { companyId };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [birthdays, anniversaries] = await Promise.all([
    prisma.employee.findMany({
      where: { ...where, dateOfBirth: { not: null }, dischargeDate: null },
      select: { id: true, firstName: true, lastName: true, dateOfBirth: true, position: true },
    }),
    prisma.employee.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, startDate: true, position: true },
    }),
  ]);

  const birthdayList = birthdays
    .filter(e => e.dateOfBirth && e.dateOfBirth.getMonth() === today.getMonth() && e.dateOfBirth.getDate() === today.getDate())
    .map(e => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, date: e.dateOfBirth!.toISOString(), position: e.position || '' }));

  const anniversaryList = anniversaries
    .filter(e => e.startDate.getMonth() === today.getMonth() && e.startDate.getDate() === today.getDate())
    .map(e => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, date: e.startDate.toISOString(), position: e.position || '', years: now.getFullYear() - e.startDate.getFullYear() }));

  return c.json({ birthdays: birthdayList, anniversaries: anniversaryList });
});

router.get('/companies', async (c) => {
  try {
    const clientId = c.get('clientId');
    if (!clientId) return c.json([]);
    const companies = await prisma.company.findMany({ where: { clientId }, orderBy: { name: 'asc' } });
    return c.json(companies);
  } catch (err: any) {
    console.error('[companies GET]', err?.message);
    return c.json({ message: 'Failed to load companies' }, 500);
  }
});

router.get('/companies/:id', async (c) => {
  try {
    const clientId = c.get('clientId');
    const company = await prisma.company.findUnique({ where: { id: c.req.param('id') } });
    if (!company) return c.json({ message: 'Company not found' }, 404);
    if (!clientId || company.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);
    return c.json(company);
  } catch (err: any) {
    console.error('[companies GET/:id]', err?.message);
    return c.json({ message: 'Failed to load company' }, 500);
  }
});

router.put('/companies/:id', requirePermission('manage_companies'), async (c) => {
  try {
    const clientId = c.get('clientId');
    const existing = await prisma.company.findUnique({ where: { id: c.req.param('id') } });
    if (!existing) return c.json({ message: 'Company not found' }, 404);
    if (!clientId || existing.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);
    const body = await c.req.json();
    const updated = await prisma.company.update({ where: { id: c.req.param('id') }, data: body });
    return c.json(updated);
  } catch (err: any) {
    console.error('[companies PUT]', err?.message);
    return c.json({ message: 'Failed to update company' }, 500);
  }
});

router.delete('/companies/:id', requirePermission('manage_companies'), async (c) => {
  try {
    const clientId = c.get('clientId');
    const existing = await prisma.company.findUnique({ where: { id: c.req.param('id') } });
    if (!existing) return c.json({ message: 'Company not found' }, 404);
    if (!clientId || existing.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);
    await prisma.company.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err: any) {
    console.error('[companies DELETE]', err?.message);
    return c.json({ message: 'Failed to delete company' }, 500);
  }
});

router.post('/companies', requirePermission('manage_companies'), async (c) => {
  try {
    const clientId = c.get('clientId');
    if (!clientId) return c.json({ message: 'Client context required' }, 400);
    const body = await c.req.json();
    const company = await prisma.company.create({ data: { ...body, clientId } });
    return c.json(company, 201);
  } catch (err: any) {
    console.error('[companies POST]', err?.message);
    return c.json({ message: 'Failed to create company' }, 500);
  }
});

router.get('/roster', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json([]);
  const where: Record<string, unknown> = { companyId };
  const roster = await prisma.shiftAssignment.findMany({ where, include: { employee: { select: { firstName: true, lastName: true } }, shift: true }, orderBy: { startDate: 'desc' } });
  return c.json(roster);
});

router.get('/license', async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json(null);
  const license = await prisma.licenseToken.findUnique({ where: { clientId } });
  return c.json(license);
});

router.post('/license/validate', async (c) => {
  const body = await c.req.json();
  const token = await prisma.licenseToken.findUnique({ where: { token: body.token }, include: { client: true } });
  if (!token || !token.active || token.expiresAt < new Date()) return c.json({ valid: false });
  return c.json({ valid: true, client: token.client });
});

router.post('/license/issue', requirePermission('manage_licenses'), async (c) => {
  const body = await c.req.json();
  const token = await prisma.licenseToken.create({
    data: { clientId: body.clientId, token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), employeeCap: body.employeeCap || 10 },
  });
  return c.json(token, 201);
});

router.post('/license/revoke', requirePermission('manage_licenses'), async (c) => {
  const body = await c.req.json();
  await prisma.licenseToken.update({ where: { id: body.id }, data: { active: false } });
  return c.json({ message: 'License revoked' });
});

router.post('/license/reactivate', requirePermission('manage_licenses'), async (c) => {
  const body = await c.req.json();
  await prisma.licenseToken.update({ where: { id: body.id }, data: { active: true } });
  return c.json({ message: 'License reactivated' });
});

router.post('/license/issue', requirePermission('manage_licenses'), async (c) => {
  const { clientId, expiryMonths } = await c.req.json();
  const license = await issueLicense(clientId, 10, expiryMonths || 12);
  return c.json(license);
});

router.post('/license/revoke', requirePermission('manage_licenses'), async (c) => {
  const { clientId } = await c.req.json();
  await revokeLicense(clientId);
  return c.json({ message: 'License revoked' });
});

router.get('/subscription', async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json(null);
  const sub = await prisma.subscription.findUnique({ where: { clientId } });
  return c.json(sub);
});

router.get('/intelligence/alerts', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ alerts: [] });

  const alerts: { message: string; actionLink?: string; actionText?: string }[] = [];

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, clientId: true },
  });
  if (!company) return c.json({ alerts: [] });

  const clientId = c.get('clientId') || company.clientId;

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    employees,
    draftRuns,
    unprocessedLogs,
    taxTables,
    upcomingHolidays,
  ] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId, dischargeDate: null },
      select: { id: true, tin: true, bankAccounts: { select: { id: true } } },
    }),
    prisma.payrollRun.findMany({
      where: { companyId, status: 'DRAFT' },
      select: { id: true, startDate: true, endDate: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.attendanceLog.count({
      where: { companyId, processed: false },
    }),
    prisma.taxTable.findMany({
      where: { clientId, isActive: true },
      select: { id: true, name: true, expiryDate: true },
    }),
    prisma.publicHoliday.findMany({
      where: { date: { gte: now, lte: thirtyDays } },
      orderBy: { date: 'asc' },
    }),
  ]);

  const missingTin = employees.filter(e => !e.tin);
  if (missingTin.length > 0) {
    alerts.push({
      message: `${missingTin.length} active employee${missingTin.length > 1 ? 's' : ''} missing ZIMRA TIN`,
      actionLink: '/employees',
      actionText: 'Update TINs',
    });
  }

  const missingBank = employees.filter(e => e.bankAccounts.length === 0);
  if (missingBank.length > 0) {
    alerts.push({
      message: `${missingBank.length} active employee${missingBank.length > 1 ? 's' : ''} have no bank account details`,
      actionLink: '/employees',
      actionText: 'Add bank accounts',
    });
  }

  if (unprocessedLogs > 100) {
    alerts.push({
      message: `${unprocessedLogs} attendance logs not yet processed — payroll inputs may be inaccurate`,
      actionLink: '/attendance',
      actionText: 'Process attendance',
    });
  }

  for (const table of taxTables) {
    if (table.expiryDate) {
      const daysUntilExpiry = Math.ceil((table.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry < 0) {
        alerts.push({
          message: `Tax table "${table.name}" expired ${Math.abs(daysUntilExpiry)} day${Math.abs(daysUntilExpiry) > 1 ? 's' : ''} ago`,
          actionLink: '/utilities/tax-tables',
          actionText: 'Update tax table',
        });
      } else if (daysUntilExpiry <= 30) {
        alerts.push({
          message: `Tax table "${table.name}" expires in ${daysUntilExpiry} day${daysUntilExpiry > 1 ? 's' : ''}`,
          actionLink: '/utilities/tax-tables',
          actionText: 'Review',
        });
      }
    }
  }

  if (draftRuns.length > 2) {
    alerts.push({
      message: `${draftRuns.length} payroll run${draftRuns.length > 1 ? 's' : ''} in draft status — pending completion`,
      actionLink: '/payroll',
      actionText: 'Review payroll runs',
    });
  }

  if (upcomingHolidays.length > 0) {
    alerts.push({
      message: `${upcomingHolidays.length} public holiday${upcomingHolidays.length > 1 ? 's' : ''} in the next 30 day${upcomingHolidays.length > 1 ? 's' : ''}`,
      actionLink: '/utilities/public-holidays',
      actionText: 'View holidays',
    });
  }

  return c.json({ alerts });
});

router.get('/intelligence/fraud', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ flags: [] });

  const flags: { message: string; employees?: { id: string; name: string; code: string }[] }[] = [];

  const [employees, attendanceRecords] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId, dischargeDate: null },
      select: {
        id: true, firstName: true, lastName: true, employeeCode: true,
        phone: true, email: true, tin: true,
        bankAccounts: { select: { accountNumber: true, bankName: true } },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: { companyId },
      select: { employeeId: true, ot1Minutes: true, ot2Minutes: true, status: true },
    }),
  ]);

  const duplicateAccounts = new Map<string, { id: string; name: string; code: string }[]>();
  for (const emp of employees) {
    for (const acc of emp.bankAccounts) {
      if (!acc.accountNumber) continue;
      const key = `${acc.bankName}:${acc.accountNumber}`;
      if (!duplicateAccounts.has(key)) duplicateAccounts.set(key, []);
      duplicateAccounts.get(key)!.push({ id: emp.id, name: `${emp.firstName} ${emp.lastName}`, code: emp.employeeCode || '' });
    }
  }
  for (const [, emps] of duplicateAccounts) {
    if (emps.length >= 2) {
      flags.push({
        message: `Duplicate bank account shared by ${emps.length} employees`,
        employees: emps,
      });
    }
  }

  const phoneMap = new Map<string, { id: string; name: string; code: string }[]>();
  for (const emp of employees) {
    if (!emp.phone) continue;
    if (!phoneMap.has(emp.phone)) phoneMap.set(emp.phone, []);
    phoneMap.get(emp.phone)!.push({ id: emp.id, name: `${emp.firstName} ${emp.lastName}`, code: emp.employeeCode || '' });
  }
  for (const [, emps] of phoneMap) {
    if (emps.length >= 3) {
      flags.push({
        message: `${emps.length} employees share the same phone number`,
        employees: emps,
      });
    }
  }

  const empOvertime: Record<string, { id: string; name: string; code: string; totalOt: number }> = {};
  for (const rec of attendanceRecords) {
    if (!empOvertime[rec.employeeId]) {
      const emp = employees.find(e => e.id === rec.employeeId);
      if (!emp) continue;
      empOvertime[rec.employeeId] = {
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        code: emp.employeeCode || '',
        totalOt: 0,
      };
    }
    empOvertime[rec.employeeId].totalOt += (rec.ot1Minutes || 0) + (rec.ot2Minutes || 0);
  }

  const highOtEmployees = Object.values(empOvertime)
    .filter(e => e.totalOt > 2400)
    .map(e => ({ id: e.id, name: e.name, code: e.code }));

  if (highOtEmployees.length > 0) {
    flags.push({
      message: `${highOtEmployees.length} employee${highOtEmployees.length > 1 ? 's' : ''} with over 40 hours of overtime — verify accuracy`,
      employees: highOtEmployees,
    });
  }

  return c.json({ flags });
});

router.get('/intelligence/cashflow', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({});

  const [completedRuns, activeEmployees] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { companyId, status: 'COMPLETED' },
      select: { id: true, currency: true, endDate: true, payslips: { select: { netPay: true, gross: true } } },
      orderBy: { endDate: 'desc' },
      take: 6,
    }),
    prisma.employee.count({
      where: { companyId, dischargeDate: null },
    }),
  ]);

  if (completedRuns.length === 0) {
    return c.json({ predictedTotal: 0, currency: 'USD', variance: 0 });
  }

  const averages = completedRuns.map(run => {
    const totalNet = run.payslips.reduce((sum, p) => sum + p.netPay, 0);
    const totalGross = run.payslips.reduce((sum, p) => sum + p.gross, 0);
    return { currency: run.currency, totalNet, totalGross, headcount: run.payslips.length };
  });

  const latest = averages[0];
  const historicalAvg = averages.length > 1
    ? averages.slice(1).reduce((s, r) => s + r.totalNet, 0) / (averages.length - 1)
    : latest.totalNet;

  const predictedTotal = averages.length >= 2
    ? averages.slice(0, 2).reduce((s, r) => s + r.totalNet, 0) / 2
    : latest.totalNet;

  const variance = historicalAvg > 0 ? (predictedTotal - historicalAvg) / historicalAvg : 0;

  return c.json({
    predictedTotal: Math.round(predictedTotal * 100) / 100,
    currency: latest.currency,
    variance: Math.round(variance * 1000) / 1000,
  });
});

router.get('/payroll-logs', async (c) => {
  const where: Record<string, unknown> = {};
  // PayrollLog model not yet in Prisma schema — return empty list until model is added.
  return c.json([]);
});

export default router;
