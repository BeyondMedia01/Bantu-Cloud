import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';

const router = new Hono();

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ─── GET /api/trial/status ────────────────────────────────────────────────────

router.get('/status', async (c) => {
  const clientId = c.get('clientId') ?? (c.get('user') as any)?.clientId;
  if (!clientId) return c.json({ trial: null });

  const row: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT * FROM "Trial" WHERE "clientId" = $1 LIMIT 1`,
    clientId,
  );
  if (!row.length) return c.json({ trial: null });

  const trial = row[0];
  const employeeCount = await prisma.employee.count({ where: { clientId } });
  const msRemaining = new Date(trial.expiresAt).getTime() - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86400000));

  return c.json({
    trial: {
      status: trial.status,
      expiresAt: trial.expiresAt,
      daysRemaining,
      onboardingStep: trial.onboardingStep,
      employeeCap: trial.employeeCap,
      employeeCount,
    },
  });
});

// ─── PATCH /api/trial/onboarding-step ────────────────────────────────────────

router.patch('/onboarding-step', validateBody(z.object({ step: z.number() })), async (c) => {
  const clientId = c.get('clientId') ?? (c.get('user') as any)?.clientId;
  if (!clientId) return c.json({ message: 'Client context missing' }, 400);

  const { step } = c.req.valid('json');

  const row: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT * FROM "Trial" WHERE "clientId" = $1 LIMIT 1`,
    clientId,
  );
  if (!row.length) return c.json({ message: 'No trial found' }, 404);

  const trial = row[0];
  if (step !== trial.onboardingStep + 1) {
    return c.json({ message: 'Steps must advance sequentially' }, 400);
  }

  await (prisma as any).$queryRawUnsafe(
    `UPDATE "Trial" SET "onboardingStep" = $1, "updatedAt" = NOW() WHERE "clientId" = $2`,
    step,
    clientId,
  );

  return c.json({ onboardingStep: step });
});

// ─── POST /api/trial/upgrade-request ─────────────────────────────────────────

router.post('/upgrade-request', validateBody(z.object({ name: z.string().min(1), message: z.string().min(1) })), async (c) => {
  const user = c.get('user');
  const { name, message } = c.req.valid('json');
  const to = 'bechanibeyond@gmail.com';

  try {
    const { Resend } = await import('resend');
    const env = (c as any).env as Record<string, string>;
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Bantu Payroll <no-reply@thinkbantu.com>',
      to,
      subject: `Trial Upgrade Request from ${name}`,
      text: `Name: ${name}\nUser: ${user?.email}\n\n${message}`,
    });
    return c.json({ sent: true });
  } catch (err) {
    console.error('[upgrade-request]', err);
    return c.json({ error: 'Failed to send request. Please email us directly.' }, 500);
  }
});

export default router;
