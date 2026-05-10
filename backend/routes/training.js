const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();


// ─── Courses ──────────────────────────────────────────────────────────────────

router.get('/courses', async (req, res) => {
  const { status } = req.query;
  try {
    const courses = await prisma.trainingCourse.findMany({
      where: { ...(req.companyId && { companyId: req.companyId }), ...(status && { status }) },
      include: { _count: { select: { enrollments: true, certificates: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: courses });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/courses', requirePermission('manage_employees'), async (req, res) => {
  const { title, description, provider, duration, type, cost, currency, maxAttendees, startDate, endDate } = req.body;
  if (!title) return res.status(400).json({ message: 'title is required' });

  try {
    const course = await prisma.trainingCourse.create({
      data: {
        companyId: req.companyId, title, description, provider, duration, type, cost,
        currency: currency || 'USD', maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });
    await audit({ req, action: 'TRAINING_COURSE_CREATED', resource: 'trainingCourse', resourceId: course.id, details: { title } });
    res.status(201).json({ data: course });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/courses/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.trainingCourse.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const allowed = ['title', 'description', 'provider', 'duration', 'type', 'cost', 'currency', 'maxAttendees', 'status', 'startDate', 'endDate'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'startDate' || key === 'endDate') data[key] = req.body[key] ? new Date(req.body[key]) : null;
        else if (key === 'maxAttendees') data[key] = req.body[key] ? parseInt(req.body[key]) : null;
        else data[key] = req.body[key];
      }
    }

    const course = await prisma.trainingCourse.update({
      where: { id: req.params.id },
      data,
      include: { _count: { select: { enrollments: true } } },
    });
    res.json({ data: course });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/courses/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.trainingCourse.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.trainingCourse.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Enrollments ──────────────────────────────────────────────────────────────

router.get('/courses/:id/enrollments', async (req, res) => {
  try {
    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { courseId: req.params.id },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { enrolledAt: 'desc' },
    });
    res.json({ data: enrollments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/courses/:id/enroll', requirePermission('manage_employees'), async (req, res) => {
  const { employeeIds } = req.body;
  if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
    return res.status(400).json({ message: 'employeeIds array is required' });
  }

  try {
    const course = await prisma.trainingCourse.findUnique({ where: { id: req.params.id }, select: { maxAttendees: true, companyId: true } });
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (req.companyId && course.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const currentCount = await prisma.trainingEnrollment.count({ where: { courseId: req.params.id } });
    if (course.maxAttendees && (currentCount + employeeIds.length) > course.maxAttendees) {
      return res.status(400).json({ message: `Max ${course.maxAttendees} attendees. ${currentCount} already enrolled.` });
    }

    const created = [];
    for (const empId of employeeIds) {
      const existing = await prisma.trainingEnrollment.findFirst({
        where: { courseId: req.params.id, employeeId: empId },
      });
      if (existing) continue;
      const enrollment = await prisma.trainingEnrollment.create({
        data: { courseId: req.params.id, employeeId: empId },
        include: { employee: { select: { firstName: true, lastName: true } } },
      });
      created.push(enrollment);
    }

    await audit({ req, action: 'TRAINING_ENROLLED', resource: 'trainingCourse', resourceId: req.params.id, details: { count: created.length } });
    res.status(201).json({ data: created });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/enrollments/:id', requirePermission('manage_employees'), async (req, res) => {
  const { status, score, notes } = req.body;
  try {
    const existing = await prisma.trainingEnrollment.findUnique({
      where: { id: req.params.id },
      include: { course: { select: { companyId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.course.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const data = {};
    if (status) {
      data.status = status;
      if (status === 'PASSED' || status === 'COMPLETED') data.completedAt = new Date();
    }
    if (score !== undefined) data.score = score;
    if (notes !== undefined) data.notes = notes;

    const enrollment = await prisma.trainingEnrollment.update({
      where: { id: req.params.id },
      data,
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    res.json({ data: enrollment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Certificates ─────────────────────────────────────────────────────────────

router.post('/courses/:id/certificate', requirePermission('manage_employees'), async (req, res) => {
  const { employeeId, expiryDate, certificateNo, certificateUrl } = req.body;
  if (!employeeId) return res.status(400).json({ message: 'employeeId is required' });

  try {
    const course = await prisma.trainingCourse.findUnique({ where: { id: req.params.id }, select: { companyId: true } });
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (req.companyId && course.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const certificate = await prisma.trainingCertificate.create({
      data: {
        courseId: req.params.id, employeeId,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        certificateNo, certificateUrl,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    // Auto-update enrollment to PASSED
    await prisma.trainingEnrollment.updateMany({
      where: { courseId: req.params.id, employeeId },
      data: { status: 'PASSED', completedAt: new Date() },
    });

    await audit({ req, action: 'TRAINING_CERTIFICATE_ISSUED', resource: 'trainingCourse', resourceId: req.params.id, details: { employeeId } });
    res.status(201).json({ data: certificate });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/courses/:id/certificates', async (req, res) => {
  try {
    const certs = await prisma.trainingCertificate.findMany({
      where: { courseId: req.params.id },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { issuedAt: 'desc' },
    });
    res.json({ data: certs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Employees ────────────────────────────────────────────────────────────────

router.get('/employees/list', async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: req.companyId ? { companyId: req.companyId } : {},
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      orderBy: { firstName: 'asc' },
    });
    res.json({ data: employees });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
