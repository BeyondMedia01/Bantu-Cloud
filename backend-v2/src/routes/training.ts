import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const createCourseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  provider: z.string().optional(),
  duration: z.string().optional(),
  type: z.string().optional(),
  cost: z.number().optional(),
  currency: z.string().optional(),
  maxAttendees: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const updateCourseSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  provider: z.string().optional(),
  duration: z.string().optional(),
  type: z.string().optional(),
  cost: z.number().optional(),
  currency: z.string().optional(),
  maxAttendees: z.number().nullable().optional(),
  status: z.string().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

const enrollSchema = z.object({
  employeeIds: z.array(z.string()).min(1),
});

const updateEnrollmentSchema = z.object({
  status: z.string().optional(),
  score: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createCertificateSchema = z.object({
  employeeId: z.string().min(1),
  expiryDate: z.string().optional(),
  certificateNo: z.string().optional(),
  certificateUrl: z.string().optional(),
});

// ─── Courses ──────────────────────────────────────────────────────────────────

router.get('/courses', requirePermission('view_training'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { status } = c.req.query();
  const where: any = { companyId };
  if (status) where.status = status;

  const courses = await prisma.trainingCourse.findMany({
    where,
    include: { _count: { select: { TrainingEnrollment: true, TrainingCertificate: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(courses);
});

router.post('/courses', requirePermission('manage_employees'), validateBody(createCourseSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { startDate, endDate, maxAttendees, ...data } = c.req.valid('json');
  const course = await prisma.trainingCourse.create({
    data: {
      id: uuid(),
      companyId,
      ...data,
      maxAttendees: maxAttendees ?? null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      updatedAt: new Date(),
    },
  });
  await audit({ c, action: 'TRAINING_COURSE_CREATED', resource: 'trainingCourse', resourceId: course.id, details: { title: data.title } });
  return c.json(course, 201);
});

router.put('/courses/:id', requirePermission('manage_training'), validateBody(updateCourseSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.trainingCourse.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const { startDate, endDate, maxAttendees, ...data } = c.req.valid('json');
  const course = await prisma.trainingCourse.update({
    where: { id },
    data: {
      ...data,
      ...(maxAttendees !== undefined && { maxAttendees }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      updatedAt: new Date(),
    },
    include: { _count: { select: { TrainingEnrollment: true } } },
  });
  return c.json(course);
});

router.delete('/courses/:id', requirePermission('manage_training'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.trainingCourse.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.trainingCourse.delete({ where: { id } });
  return c.json({ message: 'Course deleted' });
});

// ─── Enrollments ──────────────────────────────────────────────────────────────

router.get('/courses/:id/enrollments', requirePermission('view_training'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const course = await prisma.trainingCourse.findUnique({ where: { id }, select: { companyId: true } });
  if (!course || course.companyId !== companyId) return c.json({ message: 'Not found' }, 404);

  const enrollments = await prisma.trainingEnrollment.findMany({
    where: { courseId: id },
    include: { Employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { enrolledAt: 'desc' },
  });
  return c.json(enrollments);
});

router.post('/courses/:id/enroll', requirePermission('manage_training'), validateBody(enrollSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const { employeeIds } = c.req.valid('json');

  const course = await prisma.trainingCourse.findUnique({
    where: { id },
    select: { maxAttendees: true, companyId: true },
  });
  if (!course) return c.json({ message: 'Course not found' }, 404);
  if (course.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const currentCount = await prisma.trainingEnrollment.count({ where: { courseId: id } });
  if (course.maxAttendees && (currentCount + employeeIds.length) > course.maxAttendees) {
    return c.json({ message: `Max ${course.maxAttendees} attendees. ${currentCount} already enrolled.` }, 400);
  }

  const created = [];
  for (const empId of employeeIds) {
    const existing = await prisma.trainingEnrollment.findFirst({
      where: { courseId: id, employeeId: empId },
    });
    if (existing) continue;
    const enrollment = await prisma.trainingEnrollment.create({
      data: { id: uuid(), courseId: id, employeeId: empId, updatedAt: new Date() },
      include: { Employee: { select: { firstName: true, lastName: true } } },
    });
    created.push(enrollment);
  }

  await audit({ c, action: 'TRAINING_ENROLLED', resource: 'trainingCourse', resourceId: id, details: { count: created.length } });
  return c.json(created, 201);
});

router.put('/enrollments/:id', requirePermission('manage_training'), validateBody(updateEnrollmentSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.trainingEnrollment.findUnique({
    where: { id },
    include: { TrainingCourse: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.TrainingCourse.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const { status, score, notes } = c.req.valid('json');
  const data: any = { updatedAt: new Date() };
  if (status) {
    data.status = status;
    if (status === 'PASSED' || status === 'COMPLETED') data.completedAt = new Date();
  }
  if (score !== undefined) data.score = score;
  if (notes !== undefined) data.notes = notes;

  const enrollment = await prisma.trainingEnrollment.update({
    where: { id },
    data,
    include: { Employee: { select: { firstName: true, lastName: true } } },
  });
  return c.json(enrollment);
});

// ─── Certificates ─────────────────────────────────────────────────────────────

router.post('/courses/:id/certificate', requirePermission('manage_training'), validateBody(createCertificateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const { employeeId, expiryDate, certificateNo, certificateUrl } = c.req.valid('json');

  const course = await prisma.trainingCourse.findUnique({ where: { id }, select: { companyId: true } });
  if (!course) return c.json({ message: 'Course not found' }, 404);
  if (course.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const certificate = await prisma.trainingCertificate.create({
    data: {
      id: uuid(),
      courseId: id,
      employeeId,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      certificateNo,
      certificateUrl,
    },
    include: { Employee: { select: { firstName: true, lastName: true } } },
  });

  await prisma.trainingEnrollment.updateMany({
    where: { courseId: id, employeeId },
    data: { status: 'PASSED', completedAt: new Date(), updatedAt: new Date() },
  });

  await audit({ c, action: 'TRAINING_CERTIFICATE_ISSUED', resource: 'trainingCourse', resourceId: id, details: { employeeId } });
  return c.json(certificate, 201);
});

router.get('/courses/:id/certificates', requirePermission('view_training'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const course = await prisma.trainingCourse.findUnique({ where: { id }, select: { companyId: true } });
  if (!course || course.companyId !== companyId) return c.json({ message: 'Not found' }, 404);

  const certs = await prisma.trainingCertificate.findMany({
    where: { courseId: id },
    include: { Employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { issuedAt: 'desc' },
  });
  return c.json(certs);
});

// ─── Employees ────────────────────────────────────────────────────────────────

router.get('/employees/list', requirePermission('view_training'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
    orderBy: { firstName: 'asc' },
  });
  return c.json(employees);
});

router.get('/', async (c) => {
  return c.json({ message: 'Training API. Use /courses, /enrollments, /employees/list sub-routes.' });
});

export default router;
