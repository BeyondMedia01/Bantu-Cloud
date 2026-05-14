import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import * as storage from '../lib/storage';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const createPostingSchema = z.object({
  title: z.string().min(1),
  department: z.string().optional(),
  location: z.string().optional(),
  type: z.string().optional(),
  description: z.string().min(1),
  requirements: z.string().optional(),
  salaryRange: z.string().optional(),
  closesAt: z.string().optional(),
});

const updatePostingSchema = z.object({
  title: z.string().min(1).optional(),
  department: z.string().optional(),
  location: z.string().optional(),
  type: z.string().optional(),
  description: z.string().min(1).optional(),
  requirements: z.string().optional(),
  salaryRange: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'FILLED']).optional(),
  closesAt: z.string().optional(),
});

const createApplicationSchema = z.object({
  jobPostingId: z.string().min(1),
  candidateName: z.string().min(1),
  candidateEmail: z.string().email(),
  candidatePhone: z.string().optional(),
  resumeUrl: z.string().optional(),
  coverLetter: z.string().optional(),
  source: z.string().optional(),
});

const updateApplicationStatusSchema = z.object({
  status: z.enum(['NEW', 'SCREENING', 'INTERVIEWING', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN']),
  notes: z.string().optional(),
});

const screenPostingSchema = z.object({
  threshold: z.number().min(0).max(100).optional(),
});

const shortlistSchema = z.object({
  shortlisted: z.boolean(),
});

const screeningNotesSchema = z.object({
  screeningNotes: z.string(),
});

const postings = new Hono();

postings.get('/', async (c) => {
  const companyId = c.get('companyId');
  const user = c.get('user');
  const status = c.req.query('status');
  const department = c.req.query('department');

  const where: Record<string, unknown> = {};
  if (companyId) where.companyId = companyId;
  else if (user.role !== 'EMPLOYEE') return c.json({ data: [] });
  if (status) where.status = status;
  if (department) where.department = department;
  if (user.role === 'EMPLOYEE') where.status = 'PUBLISHED';

  const data = await prisma.jobPosting.findMany({
    where,
    include: { _count: { select: { JobApplication: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ data });
});

postings.post('/', requirePermission('manage_employees'), validateBody(createPostingSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const body = c.req.valid('json');

  const posting = await prisma.jobPosting.create({
    data: {
      id: uuid(),
      companyId,
      updatedAt: new Date(),
      title: body.title,
      department: body.department || null,
      location: body.location || null,
      type: body.type || null,
      description: body.description,
      requirements: body.requirements || null,
      salaryRange: body.salaryRange || null,
      closesAt: body.closesAt ? new Date(body.closesAt) : null,
    },
  });

  await audit({ c, action: 'JOB_POSTING_CREATED', resource: 'jobPosting', resourceId: posting.id, details: { title: body.title } });
  return c.json(posting, 201);
});

postings.get('/:id', async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  const posting = await prisma.jobPosting.findUnique({
    where: { id },
    include: {
      _count: { select: { JobApplication: true } },
      JobApplication: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, candidateName: true, candidateEmail: true, status: true, createdAt: true,
        },
      },
    },
  });
  if (!posting) return c.json({ message: 'Job posting not found' }, 404);
  if (!companyId || posting.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json({ data: posting });
});

postings.put('/:id', requirePermission('manage_employees'), validateBody(updatePostingSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const body = c.req.valid('json');

  const existing = await prisma.jobPosting.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Job posting not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const data: Record<string, unknown> = {};
  if (body.title) data.title = body.title;
  if (body.department !== undefined) data.department = body.department;
  if (body.location !== undefined) data.location = body.location;
  if (body.type) data.type = body.type;
  if (body.description) data.description = body.description;
  if (body.requirements !== undefined) data.requirements = body.requirements;
  if (body.salaryRange !== undefined) data.salaryRange = body.salaryRange;
  if (body.status) data.status = body.status;
  if (body.closesAt !== undefined) data.closesAt = body.closesAt ? new Date(body.closesAt) : null;
  if (body.status === 'PUBLISHED' && !existing.postedAt) data.postedAt = new Date();

  const posting = await prisma.jobPosting.update({ where: { id }, data });

  await audit({ c, action: 'JOB_POSTING_UPDATED', resource: 'jobPosting', resourceId: posting.id, details: { status: body.status } });
  return c.json({ data: posting });
});

postings.delete('/:id', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  const existing = await prisma.jobPosting.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Job posting not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.jobPosting.delete({ where: { id } });
  return c.json({ message: 'Job posting deleted' });
});

postings.post('/:id/screen', requirePermission('manage_employees'), validateBody(screenPostingSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const { threshold } = c.req.valid('json');

  const posting = await prisma.jobPosting.findUnique({
    where: { id },
    include: {
      JobApplication: {
        where: { status: { notIn: ['REJECTED', 'WITHDRAWN'] } },
        include: { CandidateSkill: true, CandidateExperience: true, CandidateEducation: true },
      },
    },
  });
  if (!posting) return c.json({ message: 'Job posting not found' }, 404);
  if (!companyId || posting.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const minThreshold = threshold ?? 50;
  const results: Array<{ applicationId: string; candidateName: string; score: number; shortlisted: boolean }> = [];

  for (const app of posting.JobApplication) {
    const totalMonths = app.CandidateExperience.reduce((sum, e) => sum + (e.durationMonths || 0), 0);
    const score = Math.min(100, Math.round(
      (app.CandidateSkill.length * 10) + (totalMonths * 0.5)
    ));
    const shortlisted = score >= minThreshold;
    results.push({ applicationId: app.id, candidateName: app.candidateName, score, shortlisted });
  }

  for (const r of results) {
    await prisma.jobApplication.update({
      where: { id: r.applicationId },
      data: {
        matchScore: r.score,
        shortlisted: r.shortlisted,
        ...(r.shortlisted ? { shortlistedAt: new Date() } : {}),
      },
    });
  }

  results.sort((a, b) => b.score - a.score);
  const shortlistedCount = results.filter(r => r.shortlisted).length;

  await audit({
    c, action: 'POSTING_SCREENED', resource: 'jobPosting', resourceId: id,
    details: { total: results.length, shortlisted: shortlistedCount, threshold: minThreshold },
  });
  return c.json({ data: { results, total: results.length, shortlisted: shortlistedCount, threshold: minThreshold } });
});

postings.get('/:id/shortlist', async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  const posting = await prisma.jobPosting.findUnique({
    where: { id },
    select: { companyId: true, title: true },
  });
  if (!posting) return c.json({ message: 'Not found' }, 404);
  if (!companyId || posting.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const applications = await prisma.jobApplication.findMany({
    where: { jobPostingId: id, shortlisted: true },
    include: {
      CandidateSkill: { select: { name: true, level: true } },
      CandidateExperience: {
        select: { title: true, company: true, durationMonths: true, current: true },
        orderBy: { startDate: 'desc' },
        take: 3,
      },
      CandidateEducation: { select: { institution: true, degree: true, field: true }, take: 1 },
    },
    orderBy: { matchScore: 'desc' },
  });
  return c.json({ data: applications });
});

postings.get('/:id/screening-summary', async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  const posting = await prisma.jobPosting.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!posting) return c.json({ message: 'Not found' }, 404);
  if (!companyId || posting.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const [total, screened, shortlisted] = await Promise.all([
    prisma.jobApplication.count({ where: { jobPostingId: id } }),
    prisma.jobApplication.count({ where: { jobPostingId: id, matchScore: { not: null } } }),
    prisma.jobApplication.count({ where: { jobPostingId: id, shortlisted: true } }),
  ]);
  return c.json({ data: { total, screened, shortlisted } });
});

const applications = new Hono();

applications.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ data: [] });
  const postingId = c.req.query('postingId');
  const status = c.req.query('status');

  const where: Record<string, unknown> = { JobPosting: { companyId } };
  if (postingId) where.jobPostingId = postingId;
  if (status) where.status = status;

  const data = await prisma.jobApplication.findMany({
    where,
    include: { JobPosting: { select: { title: true, department: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ data });
});

applications.post('/', validateBody(createApplicationSchema), async (c) => {
  const body = c.req.valid('json');

  const posting = await prisma.jobPosting.findUnique({
    where: { id: body.jobPostingId },
    select: { status: true },
  });
  if (!posting) return c.json({ message: 'Job posting not found' }, 404);
  if (posting.status !== 'PUBLISHED') return c.json({ message: 'Job posting is not accepting applications' }, 400);

  const application = await prisma.jobApplication.create({
    data: {
      id: uuid(),
      jobPostingId: body.jobPostingId,
      updatedAt: new Date(),
      candidateName: body.candidateName,
      candidateEmail: body.candidateEmail,
      candidatePhone: body.candidatePhone || null,
      resumeUrl: body.resumeUrl || null,
      coverLetter: body.coverLetter || null,
      source: body.source || null,
    },
    include: { JobPosting: { select: { title: true } } },
  });
  return c.json(application, 201);
});

applications.put('/:id/status', requirePermission('manage_employees'), validateBody(updateApplicationStatusSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const body = c.req.valid('json');

  const existing = await prisma.jobApplication.findUnique({
    where: { id },
    include: { JobPosting: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Application not found' }, 404);
  if (!companyId || existing.JobPosting.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const application = await prisma.jobApplication.update({
    where: { id },
    data: {
      status: body.status,
      ...(body.notes !== undefined && { notes: body.notes }),
    },
    include: { JobPosting: { select: { title: true } } },
  });

  if (body.status === 'HIRED') {
    await prisma.jobPosting.update({
      where: { id: existing.jobPostingId },
      data: { status: 'FILLED' },
    });
  }

  await audit({ c, action: 'APPLICATION_STATUS_UPDATED', resource: 'jobApplication', resourceId: id, details: { status: body.status } });
  return c.json({ data: application });
});

applications.post('/:id/resume', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  const existing = await prisma.jobApplication.findUnique({
    where: { id },
    include: { JobPosting: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Application not found' }, 404);
  if (!companyId || existing.JobPosting.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const formData = await c.req.parseBody();
  const file = formData.resume as File | undefined;
  if (!file) return c.json({ message: 'Resume file is required' }, 400);

  const ext = file.name.split('.').pop() || 'pdf';
  const key = `resumes/${id}/${Date.now()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage.upload(key, buffer, file.type);

  const resumeUrl = key;
  await prisma.jobApplication.update({ where: { id }, data: { resumeUrl } });

  await audit({ c, action: 'RESUME_UPLOADED', resource: 'jobApplication', resourceId: id });
  return c.json({ data: { resumeUrl } });
});

applications.post('/:id/parse', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  const app = await prisma.jobApplication.findUnique({
    where: { id },
    include: { JobPosting: { select: { companyId: true, title: true } } },
  });
  if (!app) return c.json({ message: 'Application not found' }, 404);
  if (!companyId || app.JobPosting.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (!app.resumeUrl) return c.json({ message: 'No resume uploaded. Upload a resume first.' }, 400);

  const parsed = {
    text: 'Parsed resume text',
    email: app.candidateEmail,
    phone: app.candidatePhone || '',
    skills: [] as Array<{ name: string; level?: string }>,
    experiences: [] as Array<{ title: string; company?: string; startDate?: string; endDate?: string; current?: boolean; durationMonths?: number; description?: string }>,
    educations: [] as Array<{ institution: string; degree?: string; field?: string }>,
    totalYears: 0,
  };

  await prisma.jobApplication.update({
    where: { id },
    data: {
      resumeText: parsed.text,
      candidateEmail: parsed.email || app.candidateEmail,
      candidatePhone: parsed.phone || app.candidatePhone,
    },
  });

  await prisma.candidateSkill.deleteMany({ where: { applicationId: id } });
  for (const s of parsed.skills as any[]) {
    await prisma.candidateSkill.create({ data: { id: uuid(), applicationId: id, name: s.name, level: s.level || null } });
  }

  await prisma.candidateExperience.deleteMany({ where: { applicationId: id } });
  for (const e of parsed.experiences as any[]) {
    await prisma.candidateExperience.create({ data: { id: uuid(), applicationId: id, title: e.title, company: e.company || null, startDate: e.startDate ? new Date(e.startDate) : null, endDate: e.endDate ? new Date(e.endDate) : null, current: e.current || false, durationMonths: e.durationMonths || null, description: e.description || null } });
  }

  await prisma.candidateEducation.deleteMany({ where: { applicationId: id } });
  for (const e of parsed.educations as any[]) {
    await prisma.candidateEducation.create({ data: { id: uuid(), applicationId: id, institution: e.institution, degree: e.degree || null, field: e.field || null, startDate: e.startDate ? new Date(e.startDate) : null, endDate: e.endDate ? new Date(e.endDate) : null, gpa: e.gpa || null } });
  }

  await audit({
    c, action: 'RESUME_PARSED', resource: 'jobApplication', resourceId: id,
    details: { skills: parsed.skills.length },
  });
  return c.json({ data: { skills: parsed.skills, experiences: parsed.experiences, educations: parsed.educations, totalYears: parsed.totalYears } });
});

applications.put('/:id/shortlist', requirePermission('manage_employees'), validateBody(shortlistSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const { shortlisted } = c.req.valid('json');

  const existing = await prisma.jobApplication.findUnique({
    where: { id },
    include: { JobPosting: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Application not found' }, 404);
  if (!companyId || existing.JobPosting.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const app = await prisma.jobApplication.update({
    where: { id },
    data: { shortlisted, shortlistedAt: shortlisted ? new Date() : null },
    include: {
      CandidateSkill: { select: { name: true, level: true } },
      CandidateExperience: {
        select: { title: true, company: true, durationMonths: true },
        orderBy: { startDate: 'desc' },
        take: 3,
      },
      CandidateEducation: { select: { institution: true, degree: true, field: true } },
    },
  });

  await audit({ c, action: 'SHORTLIST_UPDATED', resource: 'jobApplication', resourceId: id, details: { shortlisted } });
  return c.json({ data: app });
});

applications.put('/:id/screening-notes', requirePermission('manage_employees'), validateBody(screeningNotesSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const { screeningNotes } = c.req.valid('json');

  const existing = await prisma.jobApplication.findUnique({
    where: { id },
    include: { JobPosting: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Application not found' }, 404);
  if (!companyId || existing.JobPosting.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.jobApplication.update({
    where: { id },
    data: { screeningNotes },
  });
  return c.json({ message: 'Notes updated' });
});

router.get('/', async (c) => {
  return c.json({ message: 'Recruitment API. Use /postings and /applications sub-routes.' });
});

router.route('/postings', postings);
router.route('/applications', applications);

export default router;
