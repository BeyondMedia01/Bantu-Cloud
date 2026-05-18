import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const createSurveySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  anonymous: z.boolean().optional(),
  dueDate: z.string().optional(),
});

const updateSurveySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  anonymous: z.boolean().optional(),
  status: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  questions: z.array(z.object({
    text: z.string(),
    type: z.string().optional(),
    options: z.array(z.string()).nullable().optional(),
    required: z.boolean().optional(),
    order: z.number().optional(),
  })).optional(),
});

const respondSchema = z.object({
  employeeId: z.string().optional(),
  answers: z.array(z.object({
    questionId: z.string(),
    value: z.string(),
  })).min(1),
});

// ─── Surveys ──────────────────────────────────────────────────────────────────

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { status } = c.req.query();
  const where: any = { companyId };
  if (status) where.status = status;

  const surveys = await prisma.survey.findMany({
    where,
    include: { _count: { select: { questions: true, responses: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(surveys);
});

router.post('/', requirePermission('manage_surveys'), validateBody(createSurveySchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { dueDate, ...data } = c.req.valid('json');
  const survey = await prisma.survey.create({
    data: {
      id: uuid(),
      companyId,
      ...data,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  await audit({ c, action: 'SURVEY_CREATED', resource: 'survey', resourceId: survey.id, details: { title: data.title } });
  return c.json(survey, 201);
});

router.get('/:id', requirePermission('view_surveys'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const survey = await prisma.survey.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  if (!survey) return c.json({ message: 'Not found' }, 404);
  if (survey.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json(survey);
});

router.put('/:id', requirePermission('manage_surveys'), validateBody(updateSurveySchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.survey.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const { questions, dueDate, ...body } = c.req.valid('json');
  const data: any = { ...body };
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

  if (questions !== undefined) {
    await prisma.surveyQuestion.deleteMany({ where: { surveyId: id } });
    if (questions.length > 0) {
      for (const [i, q] of (questions as any[]).entries()) {
        await prisma.surveyQuestion.create({ data: { id: uuid(), surveyId: id, text: q.text, type: q.type || 'TEXT', options: q.options ?? null, required: q.required || false, order: q.order ?? i } });
      }
    }
  }

  const survey = await prisma.survey.update({
    where: { id },
    data,
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  return c.json(survey);
});

router.delete('/:id', requirePermission('manage_surveys'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.survey.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.survey.delete({ where: { id } });
  return c.json({ message: 'Survey deleted' });
});

// ─── Responses ────────────────────────────────────────────────────────────────

router.post('/:id/respond', validateBody(respondSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const { employeeId, answers } = c.req.valid('json');

  const survey = await prisma.survey.findUnique({
    where: { id },
    select: { status: true, anonymous: true, companyId: true },
  });
  if (!survey) return c.json({ message: 'Survey not found' }, 404);
  if (survey.status !== 'ACTIVE') return c.json({ message: 'Survey is not active' }, 400);
  if (survey.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  if (!survey.anonymous && employeeId) {
    const existing = await prisma.surveyResponse.findFirst({
      where: { surveyId: id, employeeId },
    });
    if (existing) return c.json({ message: 'Already responded' }, 400);
  }

  const response = await prisma.surveyResponse.create({
    data: {
      id: uuid(),
      surveyId: id,
      employeeId: survey.anonymous ? null : (employeeId || null),
      answers: { create: answers.map((a: any) => ({ id: uuid(), questionId: a.questionId, value: a.value })) },
    },
  });
  return c.json({ id: response.id }, 201);
});

router.get('/:id/results', requirePermission('view_surveys'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const survey = await prisma.survey.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  if (!survey) return c.json({ message: 'Not found' }, 404);
  if (survey.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const responses = await prisma.surveyResponse.findMany({
    where: { surveyId: id },
    include: { answers: true },
  });

  const results = survey.questions.map(q => {
    const qAnswers = responses.flatMap(r => r.answers.filter(a => a.questionId === q.id));
    const values = qAnswers.map(a => a.value).filter(Boolean);

    if (q.type === 'RATING') {
      const nums = values.map(Number).filter(n => !isNaN(n));
      return {
        questionId: q.id,
        text: q.text,
        type: q.type,
        count: nums.length,
        average: nums.length > 0 ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : null,
        distribution: [1, 2, 3, 4, 5].map(n => ({ value: n, count: nums.filter(v => v === n).length })),
      };
    }

    if (q.type === 'YES_NO') {
      const yes = values.filter(v => v.toLowerCase() === 'yes').length;
      const no = values.filter(v => v.toLowerCase() === 'no').length;
      return { questionId: q.id, text: q.text, type: q.type, yes, no, total: yes + no };
    }

    const freq: Record<string, number> = {};
    values.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    return {
      questionId: q.id,
      text: q.text,
      type: q.type,
      count: values.length,
      responses: Object.entries(freq).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    };
  });

  return c.json({ totalResponses: responses.length, results });
});

export default router;
