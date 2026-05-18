import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/mailer', () => ({
  getTransporter: vi.fn(() => ({ sendMail: vi.fn(async () => ({ messageId: 'test' })) })),
  sendPasswordReset: vi.fn(),
}));

import request from 'supertest';
import express from 'express';
import trialRouter from '../routes/trial';

const prismaModule = await import('../lib/prisma');
const prisma = prismaModule.default ?? prismaModule;

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.clientId = 'c1'; req.userId = 'u1'; next(); });
app.use('/api/trial', trialRouter);

describe('GET /api/trial/status', () => {
  let trialFindUnique, employeeCount;
  beforeEach(() => {
    trialFindUnique = vi.spyOn(prisma.trial, 'findUnique');
    employeeCount = vi.spyOn(prisma.employee, 'count');
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns { trial: null } when no trial record exists', async () => {
    trialFindUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/trial/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trial: null });
  });

  it('returns trial status with daysRemaining >= 0', async () => {
    trialFindUnique.mockResolvedValue({ status: 'ACTIVE', expiresAt: new Date(Date.now() + 5 * 86400000), onboardingStep: 1, employeeCap: 10 });
    employeeCount.mockResolvedValue(3);
    const res = await request(app).get('/api/trial/status');
    expect(res.status).toBe(200);
    expect(res.body.trial.daysRemaining).toBeGreaterThanOrEqual(0);
    expect(res.body.trial.employeeCount).toBe(3);
  });

  it('clamps daysRemaining to 0 when expired', async () => {
    trialFindUnique.mockResolvedValue({ status: 'EXPIRED', expiresAt: new Date(Date.now() - 86400000), onboardingStep: 3, employeeCap: 10 });
    employeeCount.mockResolvedValue(5);
    const res = await request(app).get('/api/trial/status');
    expect(res.status).toBe(200);
    expect(res.body.trial.daysRemaining).toBe(0);
  });
});

describe('PATCH /api/trial/onboarding-step', () => {
  let trialFindUnique, trialUpdate;
  beforeEach(() => {
    trialFindUnique = vi.spyOn(prisma.trial, 'findUnique');
    trialUpdate = vi.spyOn(prisma.trial, 'update');
  });
  afterEach(() => vi.restoreAllMocks());

  it('rejects missing step field', async () => {
    const res = await request(app).patch('/api/trial/onboarding-step').send({});
    expect(res.status).toBe(400);
  });

  it('rejects non-sequential step advances', async () => {
    trialFindUnique.mockResolvedValue({ onboardingStep: 0 });
    const res = await request(app).patch('/api/trial/onboarding-step').send({ step: 2 });
    expect(res.status).toBe(400);
  });

  it('advances step by 1', async () => {
    trialFindUnique.mockResolvedValue({ onboardingStep: 0 });
    trialUpdate.mockResolvedValue({ onboardingStep: 1 });
    const res = await request(app).patch('/api/trial/onboarding-step').send({ step: 1 });
    expect(res.status).toBe(200);
    expect(res.body.onboardingStep).toBe(1);
  });
});

describe('POST /api/trial/upgrade-request', () => {
  it('returns 400 when name or message missing', async () => {
    const res = await request(app).post('/api/trial/upgrade-request').send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('sends email and returns { sent: true }', async () => {
    const res = await request(app).post('/api/trial/upgrade-request').send({ name: 'Test User', message: 'I want to upgrade' });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
  });
});
