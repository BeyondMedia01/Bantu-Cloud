import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    client: { create: vi.fn() },
    trial: { create: vi.fn() },
    clientAdmin: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../lib/auth', () => ({ signToken: vi.fn(() => 'mock-token'), authenticateToken: (_r, _s, n) => n() }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }));
vi.mock('../lib/mailer', () => ({ sendPasswordReset: vi.fn() }));
vi.mock('../lib/license', () => ({ validateLicense: vi.fn() }));
vi.mock('speakeasy', () => ({ default: {} }));
vi.mock('qrcode', () => ({ default: {} }));

import request from 'supertest';
import express from 'express';
import authRouter from '../routes/auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('POST /api/auth/trial-signup', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/auth/trial-signup').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app).post('/api/auth/trial-signup').send({
      firstName: 'John', lastName: 'Doe', companyName: 'Acme',
      email: 'not-an-email', password: 'password123',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const res = await request(app).post('/api/auth/trial-signup').send({
      firstName: 'John', lastName: 'Doe', companyName: 'Acme',
      email: 'a@b.com', password: 'short',
    });
    expect(res.status).toBe(400);
  });
});
