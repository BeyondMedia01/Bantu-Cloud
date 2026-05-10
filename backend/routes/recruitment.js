const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');
const { parseResume, scoreCandidate } = require('../lib/resumeParser');

const router = express.Router();


const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'resumes');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Job Postings ─────────────────────────────────────────────────────────────

// GET /api/recruitment/postings
router.get('/postings', async (req, res) => {
  const { status, department } = req.query;
  try {
    const where = {
      ...(req.companyId && { companyId: req.companyId }),
      ...(status && { status }),
      ...(department && { department }),
      ...(req.user.role === 'EMPLOYEE' && { status: 'PUBLISHED' }),
    };
    const postings = await prisma.jobPosting.findMany({
      where,
      include: { _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: postings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/recruitment/postings
router.post('/postings', requirePermission('manage_employees'), async (req, res) => {
  const { title, department, location, type, description, requirements, salaryRange, closesAt } = req.body;
  if (!title || !description) return res.status(400).json({ message: 'title and description are required' });

  try {
    const posting = await prisma.jobPosting.create({
      data: {
        companyId: req.companyId,
        title, department, location, type, description, requirements, salaryRange,
        closesAt: closesAt ? new Date(closesAt) : null,
      },
    });
    await audit({ req, action: 'JOB_POSTING_CREATED', resource: 'jobPosting', resourceId: posting.id, details: { title } });
    res.status(201).json(posting);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/recruitment/postings/:id
router.get('/postings/:id', async (req, res) => {
  try {
    const posting = await prisma.jobPosting.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { applications: true } },
        applications: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, candidateName: true, candidateEmail: true, status: true, createdAt: true,
          },
        },
      },
    });
    if (!posting) return res.status(404).json({ message: 'Job posting not found' });
    if (req.companyId && posting.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    res.json({ data: posting });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/recruitment/postings/:id
router.put('/postings/:id', requirePermission('manage_employees'), async (req, res) => {
  const { title, department, location, type, description, requirements, salaryRange, status, closesAt } = req.body;
  try {
    const existing = await prisma.jobPosting.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Job posting not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const posting = await prisma.jobPosting.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }), ...(department !== undefined && { department }),
        ...(location !== undefined && { location }), ...(type && { type }),
        ...(description && { description }), ...(requirements !== undefined && { requirements }),
        ...(salaryRange !== undefined && { salaryRange }), ...(status && { status }),
        ...(closesAt !== undefined && { closesAt: closesAt ? new Date(closesAt) : null }),
        ...(status === 'PUBLISHED' && !existing.postedAt && { postedAt: new Date() }),
      },
    });
    await audit({ req, action: 'JOB_POSTING_UPDATED', resource: 'jobPosting', resourceId: posting.id, details: { status } });
    res.json({ data: posting });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/recruitment/postings/:id
router.delete('/postings/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.jobPosting.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Job posting not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.jobPosting.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Applications ─────────────────────────────────────────────────────────────

// GET /api/recruitment/applications
router.get('/applications', async (req, res) => {
  const { postingId, status } = req.query;
  try {
    const where = {
      ...(postingId && { jobPostingId: postingId }),
      ...(status && { status }),
      ...(req.companyId && { jobPosting: { companyId: req.companyId } }),
    };
    const applications = await prisma.jobApplication.findMany({
      where,
      include: { jobPosting: { select: { title: true, department: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: applications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/recruitment/applications
router.post('/applications', async (req, res) => {
  const { jobPostingId, candidateName, candidateEmail, candidatePhone, resumeUrl, coverLetter, source } = req.body;
  if (!jobPostingId || !candidateName || !candidateEmail) {
    return res.status(400).json({ message: 'jobPostingId, candidateName, and candidateEmail are required' });
  }

  try {
    const posting = await prisma.jobPosting.findUnique({ where: { id: jobPostingId }, select: { status: true } });
    if (!posting) return res.status(404).json({ message: 'Job posting not found' });
    if (posting.status !== 'PUBLISHED') return res.status(400).json({ message: 'Job posting is not accepting applications' });

    const application = await prisma.jobApplication.create({
      data: { jobPostingId, candidateName, candidateEmail, candidatePhone, resumeUrl, coverLetter, source },
      include: { jobPosting: { select: { title: true } } },
    });
    res.status(201).json(application);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/recruitment/applications/:id/status
router.put('/applications/:id/status', requirePermission('manage_employees'), async (req, res) => {
  const { status, notes } = req.body;
  if (!status) return res.status(400).json({ message: 'status is required' });

  const valid = ['NEW', 'SCREENING', 'INTERVIEWING', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN'];
  if (!valid.includes(status)) return res.status(400).json({ message: `Invalid status: ${status}` });

  try {
    const existing = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      include: { jobPosting: { select: { companyId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Application not found' });
    if (req.companyId && existing.jobPosting.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const application = await prisma.jobApplication.update({
      where: { id: req.params.id },
      data: { status, ...(notes !== undefined && { notes }) },
      include: { jobPosting: { select: { title: true } } },
    });

    // If hired, mark the posting as filled
    if (status === 'HIRED') {
      await prisma.jobPosting.update({
        where: { id: existing.jobPostingId },
        data: { status: 'FILLED' },
      });
    }

    await audit({ req, action: 'APPLICATION_STATUS_UPDATED', resource: 'jobApplication', resourceId: application.id, details: { status } });
    res.json({ data: application });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── ATS: Resume Upload ───────────────────────────────────────────────────────

// POST /api/recruitment/applications/:id/resume
router.post('/applications/:id/resume', requirePermission('manage_employees'), upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Resume file is required' });

  try {
    const existing = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      include: { jobPosting: { select: { companyId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Application not found' });
    if (req.companyId && existing.jobPosting.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const resumeUrl = '/uploads/resumes/' + req.file.filename;
    await prisma.jobApplication.update({
      where: { id: req.params.id },
      data: { resumeUrl },
    });
    await audit({ req, action: 'RESUME_UPLOADED', resource: 'jobApplication', resourceId: req.params.id });
    res.json({ data: { resumeUrl } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── ATS: Parse Resume ─────────────────────────────────────────────────────────

// POST /api/recruitment/applications/:id/parse
router.post('/applications/:id/parse', requirePermission('manage_employees'), async (req, res) => {
  try {
    const app = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      include: { jobPosting: { select: { companyId: true, title: true } } },
    });
    if (!app) return res.status(404).json({ message: 'Application not found' });
    if (req.companyId && app.jobPosting.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (!app.resumeUrl) return res.status(400).json({ message: 'No resume uploaded. Upload a resume first.' });

    const filePath = path.join(__dirname, '..', app.resumeUrl);
    if (!fs.existsSync(filePath)) return res.status(400).json({ message: 'Resume file not found on server' });

    const parsed = await parseResume(filePath);

    // Save extracted data
    await prisma.jobApplication.update({
      where: { id: req.params.id },
      data: {
        resumeText: parsed.text,
        candidateEmail: parsed.email || app.candidateEmail,
        candidatePhone: parsed.phone || app.candidatePhone,
      },
    });

    // Upsert skills
    await prisma.candidateSkill.deleteMany({ where: { applicationId: req.params.id } });
    if (parsed.skills.length > 0) {
      await prisma.candidateSkill.createMany({
        data: parsed.skills.map(s => ({ applicationId: req.params.id, name: s.name, level: s.level })),
      });
    }

    // Upsert experiences
    await prisma.candidateExperience.deleteMany({ where: { applicationId: req.params.id } });
    if (parsed.experiences.length > 0) {
      await prisma.candidateExperience.createMany({
        data: parsed.experiences.map(e => ({
          applicationId: req.params.id, title: e.title, company: e.company || null,
          startDate: e.startDate ? new Date(e.startDate) : null,
          endDate: e.endDate ? new Date(e.endDate) : null,
          current: e.current || false, durationMonths: e.durationMonths || null,
          description: e.description || null,
        })),
      });
    }

    // Upsert education
    await prisma.candidateEducation.deleteMany({ where: { applicationId: req.params.id } });
    if (parsed.educations.length > 0) {
      await prisma.candidateEducation.createMany({
        data: parsed.educations.map(e => ({
          applicationId: req.params.id, institution: e.institution || 'Unknown',
          degree: e.degree || null, field: e.field || null,
        })),
      });
    }

    await audit({ req, action: 'RESUME_PARSED', resource: 'jobApplication', resourceId: req.params.id, details: { skills: parsed.skills.length, experience: parsed.totalYears } });
    res.json({ data: { skills: parsed.skills, experiences: parsed.experiences, educations: parsed.educations, totalYears: parsed.totalYears } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to parse resume: ' + error.message });
  }
});

// ─── ATS: Screen Posting ───────────────────────────────────────────────────────

// POST /api/recruitment/postings/:id/screen
router.post('/postings/:id/screen', requirePermission('manage_employees'), async (req, res) => {
  const { threshold } = req.body;

  try {
    const posting = await prisma.jobPosting.findUnique({
      where: { id: req.params.id },
      include: {
        applications: {
          where: { status: { notIn: ['REJECTED', 'WITHDRAWN'] } },
          include: { skills: true, experiences: true, educations: true },
        },
      },
    });
    if (!posting) return res.status(404).json({ message: 'Job posting not found' });
    if (req.companyId && posting.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const minThreshold = threshold || 50;
    const results = [];
    const shortlisted = [];

    for (const app of posting.applications) {
      const parsed = {
        text: app.resumeText || '',
        skills: app.skills.map(s => ({ name: s.name, level: s.level })),
        experiences: app.experiences.map(e => ({ title: e.title, company: e.company, durationMonths: e.durationMonths, startDate: e.startDate, endDate: e.endDate, current: e.current })),
        educations: app.educations.map(e => ({ institution: e.institution, degree: e.degree, field: e.field })),
        totalYears: app.experiences.reduce((sum, e) => sum + (e.durationMonths || 0), 0) / 12,
      };

      const score = scoreCandidate(parsed, posting.requirements, posting.title);
      const isShortlisted = score >= minThreshold;

      results.push({ applicationId: app.id, candidateName: app.candidateName, score, shortlisted: isShortlisted });

      if (isShortlisted) {
        shortlisted.push(app.id);
      }
    }

    // Update scores and shortlist status
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

    // Sort by descending score
    results.sort((a, b) => b.score - a.score);

    await audit({ req, action: 'POSTING_SCREENED', resource: 'jobPosting', resourceId: req.params.id, details: { total: results.length, shortlisted: shortlisted.length, threshold: minThreshold } });
    res.json({ data: { results, total: results.length, shortlisted: shortlisted.length, threshold: minThreshold } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to screen applications: ' + error.message });
  }
});

// ─── ATS: Shortlist Management ────────────────────────────────────────────────

// GET /api/recruitment/postings/:id/shortlist
router.get('/postings/:id/shortlist', async (req, res) => {
  try {
    const posting = await prisma.jobPosting.findUnique({
      where: { id: req.params.id },
      select: { companyId: true, title: true },
    });
    if (!posting) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && posting.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const applications = await prisma.jobApplication.findMany({
      where: { jobPostingId: req.params.id, shortlisted: true },
      include: {
        skills: { select: { name: true, level: true } },
        experiences: {
          select: { title: true, company: true, durationMonths: true, current: true },
          orderBy: { startDate: 'desc' },
          take: 3,
        },
        educations: { select: { institution: true, degree: true, field: true }, take: 1 },
      },
      orderBy: { matchScore: 'desc' },
    });
    res.json({ data: applications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/recruitment/applications/:id/shortlist
router.put('/applications/:id/shortlist', requirePermission('manage_employees'), async (req, res) => {
  const { shortlisted } = req.body;
  if (typeof shortlisted !== 'boolean') return res.status(400).json({ message: 'shortlisted must be boolean' });

  try {
    const existing = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      include: { jobPosting: { select: { companyId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Application not found' });
    if (req.companyId && existing.jobPosting.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const app = await prisma.jobApplication.update({
      where: { id: req.params.id },
      data: { shortlisted, shortlistedAt: shortlisted ? new Date() : null },
      include: {
        skills: { select: { name: true, level: true } },
        experiences: { select: { title: true, company: true, durationMonths: true }, orderBy: { startDate: 'desc' }, take: 3 },
        educations: { select: { institution: true, degree: true, field: true } },
      },
    });
    await audit({ req, action: 'SHORTLIST_UPDATED', resource: 'jobApplication', resourceId: req.params.id, details: { shortlisted } });
    res.json({ data: app });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/recruitment/applications/:id/screening-notes
router.put('/applications/:id/screening-notes', requirePermission('manage_employees'), async (req, res) => {
  const { screeningNotes } = req.body;
  if (screeningNotes === undefined) return res.status(400).json({ message: 'screeningNotes is required' });

  try {
    const existing = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      include: { jobPosting: { select: { companyId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Application not found' });
    if (req.companyId && existing.jobPosting.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.jobApplication.update({
      where: { id: req.params.id },
      data: { screeningNotes },
    });
    res.json({ message: 'Notes updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/recruitment/postings/:id/screening-summary
router.get('/postings/:id/screening-summary', async (req, res) => {
  try {
    const posting = await prisma.jobPosting.findUnique({
      where: { id: req.params.id },
      select: { companyId: true },
    });
    if (!posting) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && posting.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const [total, screened, shortlisted] = await Promise.all([
      prisma.jobApplication.count({ where: { jobPostingId: req.params.id } }),
      prisma.jobApplication.count({ where: { jobPostingId: req.params.id, matchScore: { not: null } } }),
      prisma.jobApplication.count({ where: { jobPostingId: req.params.id, shortlisted: true } }),
    ]);
    res.json({ data: { total, screened, shortlisted } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
