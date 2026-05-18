import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  default: {
    trial: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    employee: { count: vi.fn() },
  },
}));

vi.mock('../lib/mailer', () => ({
  getTransporter: vi.fn(() => ({ sendMail: vi.fn(async () => ({ messageId: 'test' })) })),
}));

import request from 'supertest';
import express from 'express';
import trialRouter from '../routes/trial';
import prisma from '../lib/prisma';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.clientId = 'c1'; req.userId = 'u1'; next(); });
app.use('/api/trial', trialRouter);

describe('GET /api/trial/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns { trial: null } when no trial record exists', async () => {
    prisma.trial.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/trial/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trial: null });
  });

  it('returns trial status with daysRemaining >= 0', async () => {
    prisma.trial.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 5 * 86400000),
      onboardingStep: 1,
      employeeCap: 10,
    });
    prisma.employee.count.mockResolvedValue(3);
    const res = await request(app).get('/api/trial/status');
    expect(res.status).toBe(200);
    expect(res.body.trial.daysRemaining).toBeGreaterThanOrEqual(0);
    expect(res.body.trial.employeeCount).toBe(3);
    expect(res.body.trial.status).toBe('ACTIVE');
    expect(res.body.trial.onboardingStep).toBe(1);
    expect(res.body.trial.employeeCap).toBe(10);
  });

  it('clamps daysRemaining to 0 when expired', async () => {
    prisma.trial.findUnique.mockResolvedValue({
      status: 'EXPIRED',
      expiresAt: new Date(Date.now() - 86400000),
      onboardingStep: 3,
      employeeCap: 10,
    });
    prisma.employee.count.mockResolvedValue(5);
    const res = await request(app).get('/api/trial/status');
    expect(res.status).toBe(200);
    expect(res.body.trial.daysRemaining).toBe(0);
  });
});

describe('PATCH /api/trial/onboarding-step', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects non-sequential step advances', async () => {
    prisma.trial.findUnique.mockResolvedValue({ onboardingStep: 0 });
    const res = await request(app).patch('/api/trial/onboarding-step').send({ step: 2 });
    expect(res.status).toBe(400);
  });

  it('rejects missing step field', async () => {
    const res = await request(app).patch('/api/trial/onboarding-step').send({});
    expect(res.status).toBe(400);
  });

  it('advances step by 1', async () => {
    prisma.trial.findUnique.mockResolvedValue({ onboardingStep: 0 });
    prisma.trial.update.mockResolvedValue({ onboardingStep: 1 });
    const res = await request(app).patch('/api/trial/onboarding-step').send({ step: 1 });
    expect(res.status).toBe(200);
    expect(res.body.onboardingStep).toBe(1);
  });
});

describe('POST /api/trial/upgrade-request', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when name or message missing', async () => {
    const res = await request(app).post('/api/trial/upgrade-request').send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('sends email and returns { sent: true }', async () => {
    const res = await request(app).post('/api/trial/upgrade-request').send({
      name: 'Test User', message: 'I want to upgrade',
    });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
  });
});
