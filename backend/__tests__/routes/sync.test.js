import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Mock PrismaClient
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    employee: { findMany: vi.fn().mockResolvedValue([]) },
    company: { findMany: vi.fn().mockResolvedValue([]) },
    payrollRun: { findMany: vi.fn().mockResolvedValue([]) },
    payslip: { findMany: vi.fn().mockResolvedValue([]) },
  })),
}));

// Mock operations
vi.mock('../../sync_queue/operations.js', () => ({
  executeOperation: vi.fn().mockResolvedValue({ id: 'server-id-1' }),
  isKnownOperation: vi.fn().mockReturnValue(true),
}));

// Import app after mocks
import { app } from '../../index.js';

describe('POST /api/sync', () => {
  it('returns 401 if unauthenticated', async () => {
    // Sync routes are behind authenticateToken; unauthenticated requests must be rejected
    process.env.APP_MODE = '';
    const res = await request(app).post('/api/sync').send({ payload: {} });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/sync/initial', () => {
  it('returns 401 if unauthenticated', async () => {
    // Sync routes are behind authenticateToken; unauthenticated requests must be rejected
    process.env.APP_MODE = '';
    const res = await request(app).get('/api/sync/initial');
    expect(res.status).toBe(401);
  });
});
