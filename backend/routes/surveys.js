const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission, requireModule } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requireModule('SURVEYS'));

// ─── Surveys ──────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { status } = req.query;
  try {
    const surveys = await prisma.survey.findMany({
      where: { ...(req.companyId && { companyId: req.companyId }), ...(status && { status }) },
      include: { _count: { select: { questions: true, responses: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: surveys });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', requirePermission('manage_employees'), async (req, res) => {
  const { title, description, anonymous, dueDate } = req.body;
  if (!title) return res.status(400).json({ message: 'title is required' });

  try {
    const survey = await prisma.survey.create({
      data: {
        companyId: req.companyId, title, description, anonymous: anonymous || false,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });
    await audit({ req, action: 'SURVEY_CREATED', resource: 'survey', resourceId: survey.id, details: { title } });
    res.status(201).json({ data: survey });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const survey = await prisma.survey.findUnique({
      where: { id: req.params.id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!survey) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && survey.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    res.json({ data: survey });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.survey.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const allowed = ['title', 'description', 'anonymous', 'status', 'dueDate'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        data[key] = key === 'dueDate' ? (req.body[key] ? new Date(req.body[key]) : null) : req.body[key];
      }
    }

    if (req.body.questions) {
      await prisma.surveyQuestion.deleteMany({ where: { surveyId: req.params.id } });
      if (req.body.questions.length > 0) {
        await prisma.surveyQuestion.createMany({
          data: req.body.questions.map((q, i) => ({
            surveyId: req.params.id, text: q.text, type: q.type || 'TEXT',
            options: q.options || null, required: q.required || false, order: q.order ?? i,
          })),
        });
      }
    }

    const survey = await prisma.survey.update({
      where: { id: req.params.id },
      data,
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    res.json({ data: survey });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.survey.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    await prisma.survey.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Responses ────────────────────────────────────────────────────────────────

router.post('/:id/respond', async (req, res) => {
  const { employeeId, answers } = req.body;
  if (!answers || !Array.isArray(answers)) return res.status(400).json({ message: 'answers array is required' });

  try {
    const survey = await prisma.survey.findUnique({ where: { id: req.params.id }, select: { status: true, anonymous: true, companyId: true } });
    if (!survey) return res.status(404).json({ message: 'Survey not found' });
    if (survey.status !== 'ACTIVE') return res.status(400).json({ message: 'Survey is not active' });
    if (req.companyId && survey.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    // Check if already responded
    if (!survey.anonymous && employeeId) {
      const existing = await prisma.surveyResponse.findFirst({ where: { surveyId: req.params.id, employeeId } });
      if (existing) return res.status(400).json({ message: 'Already responded' });
    }

    const response = await prisma.surveyResponse.create({
      data: {
        surveyId: req.params.id,
        employeeId: survey.anonymous ? null : (employeeId || null),
        answers: { create: answers.map(a => ({ questionId: a.questionId, value: a.value })) },
      },
    });
    res.status(201).json({ data: { id: response.id } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id/results', async (req, res) => {
  try {
    const survey = await prisma.survey.findUnique({
      where: { id: req.params.id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!survey) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && survey.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const responses = await prisma.surveyResponse.findMany({
      where: { surveyId: req.params.id },
      include: { answers: true },
    });

    // Aggregate results per question
    const results = survey.questions.map(q => {
      const qAnswers = responses.flatMap(r => r.answers.filter(a => a.questionId === q.id));
      const values = qAnswers.map(a => a.value).filter(Boolean);

      if (q.type === 'RATING') {
        const nums = values.map(Number).filter(n => !isNaN(n));
        return {
          questionId: q.id, text: q.text, type: q.type,
          count: nums.length, average: nums.length > 0 ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : null,
          distribution: [1, 2, 3, 4, 5].map(n => ({ value: n, count: nums.filter(v => v === n).length })),
        };
      }

      if (q.type === 'YES_NO') {
        const yes = values.filter(v => v.toLowerCase() === 'yes').length;
        const no = values.filter(v => v.toLowerCase() === 'no').length;
        return { questionId: q.id, text: q.text, type: q.type, yes, no, total: yes + no };
      }

      // TEXT / MULTIPLE_CHOICE
      const freq = {};
      values.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      return {
        questionId: q.id, text: q.text, type: q.type,
        count: values.length,
        responses: Object.entries(freq).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
      };
    });

    res.json({ data: { totalResponses: responses.length, results } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
