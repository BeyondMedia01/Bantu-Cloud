import { Hono } from 'hono';
import { prisma, cache } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

router.get('/reminders', requirePermission('view_reports'), async (c) => {
  try {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const employees = await prisma.employee.findMany({ where: { companyId, dischargeDate: null }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true, startDate: true, position: true } ,
  });

  const isWithinNext30Days = (date: Date | null | undefined) => {
    if (!date) return false;
    const d = new Date(date);
    const m = d.getMonth();
    const day = d.getDate();
    const thisYearDate = new Date(today.getFullYear(), m, day);
    const nextYearDate = new Date(today.getFullYear() + 1, m, day);
    return (thisYearDate >= today && thisYearDate <= thirtyDaysFromNow) ||
           (nextYearDate >= today && nextYearDate <= thirtyDaysFromNow);
  };

  const upcomingBirthdays = employees
    .filter(emp => isWithinNext30Days(emp.dateOfBirth))
    .map(emp => ({ id: emp.id, name: `${emp.firstName} ${emp.lastName}`, date: emp.dateOfBirth, type: 'BIRTHDAY', position: emp.position }));

  const upcomingAnniversaries = employees
    .filter(emp => isWithinNext30Days(emp.startDate))
    .map(emp => {
      const start = new Date(emp.startDate!);
      const anniversaryThisYear = new Date(today.getFullYear(), start.getMonth(), start.getDate());
      const fullYears = today.getFullYear() - start.getFullYear();
      return { id: emp.id, name: `${emp.firstName} ${emp.lastName}`, date: emp.startDate, years: anniversaryThisYear <= today ? fullYears : fullYears - 1, type: 'ANNIVERSARY', position: emp.position };
    });

  const sortReminders = (a: any, b: any) => {
    const getDist = (date: Date) => {
      const d = new Date(date);
      let target = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      if (target < today) target.setFullYear(today.getFullYear() + 1);
      return target.getTime() - today.getTime();
    };
    return getDist(a.date) - getDist(b.date);
  };

  return c.json({ data: { birthdays: upcomingBirthdays.sort(sortReminders), anniversaries: upcomingAnniversaries.sort(sortReminders) } });
  } catch (err: any) {
    console.error('[dashboard/reminders]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
