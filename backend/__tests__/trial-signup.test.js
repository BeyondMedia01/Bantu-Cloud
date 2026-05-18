import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../lib/auth', () => ({
  signToken: vi.fn(async () => 'mock-token'),
  authenticateToken: (_r, _s, n) => n(),
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }));
vi.mock('../lib/mailer', () => ({ sendPasswordReset: vi.fn() }));
vi.mock('../lib/license', () => ({ validateLicense: vi.fn() }));
vi.mock('speakeasy', () => ({ default: {} }));
vi.mock('qrcode', () => ({ default: {} }));

import request from 'supertest';
import express from 'express';
import authRouter from '../routes/auth';

// Import the real prisma module — the route uses the same require() cached instance.
// We'll spy on / replace its methods directly.
const prismaModule = await import('../lib/prisma');
const prisma = prismaModule.default ?? prismaModule;

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('POST /api/auth/trial-signup', () => {
  let findUniqueSpy;

  beforeEach(() => {
    // Replace methods on the shared instance so the route picks up the spy
    findUniqueSpy = vi.fn();
    prisma.user.findUnique = findUniqueSpy;
    prisma.$transaction = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('returns 409 when email already exists', async () => {
    findUniqueSpy.mockResolvedValue({ id: 'existing' });
    const res = await request(app).post('/api/auth/trial-signup').send({
      firstName: 'John', lastName: 'Doe', companyName: 'Acme',
      email: 'existing@test.com', password: 'password123',
    });
    expect(res.status).toBe(409);
  });
});
