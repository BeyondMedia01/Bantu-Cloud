import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const updateProfileSchema = z.object({
  homeAddress: z.string().optional(),
  nextOfKin: z.string().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
});

router.get('/profile', requirePermission('view_employees'), async (c) => {
  const employeeId = c.get('employeeId');
  if (!employeeId) return c.json({ message: 'Employee context missing' }, 400);

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true, employeeCode: true, title: true,
        firstName: true, lastName: true, maidenName: true,
        email: true, phone: true,
        nationality: true, nationalId: true,
        dateOfBirth: true, gender: true, maritalStatus: true,
        homeAddress: true, postalAddress: true,
        nextOfKin: true, nextOfKinName: true, nextOfKinContact: true,
        occupation: true, position: true, employmentType: true,
        startDate: true,
        paymentMethod: true, paymentBasis: true, baseRate: true,
        currency: true, bankName: true, bankBranch: true, accountNumber: true,
        taxMethod: true,
        leaveBalance: true, leaveTaken: true, leaveEntitlement: true,
        companyId: true, branchId: true, departmentId: true,
        createdAt: true, updatedAt: true,
        company: { select: { name: true } },
        branch: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    if (!employee) return c.json({ message: 'Employee record not found' }, 404);
    return c.json(employee);
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/profile', requirePermission('view_employees'), validateBody(updateProfileSchema), async (c) => {
  const employeeId = c.get('employeeId');
  if (!employeeId) return c.json({ message: 'Employee context missing' }, 400);

  const { homeAddress, nextOfKin, bankName, accountNumber } = c.req.valid('json');

  try {
    const employee = await prisma.employee.update({
      where: { id: employeeId },
      data: { homeAddress, nextOfKin, bankName, accountNumber },
      select: {
        id: true, firstName: true, lastName: true, employeeCode: true,
        homeAddress: true, nextOfKin: true,
        bankName: true, accountNumber: true,
        updatedAt: true,
      },
    });
    return c.json(employee);
  } catch (error: any) {
    if (error.code === 'P2025') return c.json({ message: 'Employee record not found' }, 404);
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/payslips', requirePermission('view_payroll'), async (c) => {
  const employeeId = c.get('employeeId');
  if (!employeeId) return c.json({ message: 'Employee context missing' }, 400);

  try {
    const payslips = await prisma.payslip.findMany({
      where: { employeeId },
      include: { payrollRun: { select: { startDate: true, endDate: true, currency: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return c.json(payslips);
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/leave', requirePermission('view_leave'), async (c) => {
  const employeeId = c.get('employeeId');
  if (!employeeId) return c.json({ message: 'Employee context missing' }, 400);

  try {
    const [records, requests] = await Promise.all([
      prisma.leaveRecord.findMany({ where: { employeeId }, orderBy: { startDate: 'desc' } }),
      prisma.leaveRequest.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' } }),
    ]);
    return c.json({ records, requests });
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/attendance', requirePermission('view_employees'), async (c) => {
  const employeeId = c.get('employeeId');
  if (!employeeId) return c.json({ message: 'Employee context missing' }, 400);

  try {
    const { from, to } = c.req.query();
    const where: Record<string, unknown> = { employeeId };
    if (from || to) {
      where.date = {} as Record<string, Date>;
      if (from) (where.date as Record<string, Date>).gte = new Date(from);
      if (to) (where.date as Record<string, Date>).lte = new Date(to);
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 90,
      select: {
        id: true, date: true, clockIn: true, clockOut: true,
        totalMinutes: true, normalMinutes: true, ot1Minutes: true, ot2Minutes: true,
        status: true, isPublicHoliday: true, notes: true,
        shift: { select: { name: true } },
      },
    });
    return c.json(records);
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/documents', requirePermission('view_employees'), async (c) => {
  const employeeId = c.get('employeeId');
  if (!employeeId) return c.json({ message: 'Employee context missing' }, 400);

  try {
    const docs = await prisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, type: true, fileUrl: true, createdAt: true },
    });
    return c.json(docs);
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
