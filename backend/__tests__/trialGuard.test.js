import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockTrial = { expiresAt: new Date(Date.now() + 86400000), status: 'ACTIVE', employeeCap: 10 };

import trialGuard from '../middleware/trialGuard';

// Import the real prisma module — the middleware uses the same require() cached instance.
// We'll spy on / replace its methods directly.
const prismaModule = await import('../lib/prisma');
const prisma = prismaModule.default ?? prismaModule;

function mockReqRes(method = 'GET', clientId = 'client-1', path = '/api/employees') {
  const req = { method, clientId, path, url: path, trial: null };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return { req, res, next };
}

describe('trialGuard', () => {
  let findUniqueSpy;
  let updateSpy;

  beforeEach(() => {
    findUniqueSpy = vi.spyOn(prisma.trial, 'findUnique');
    updateSpy = vi.spyOn(prisma.trial, 'update');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes through when no clientId (unauthenticated)', async () => {
    const { req, res, next } = mockReqRes('POST', undefined);
    req.clientId = undefined;
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(findUniqueSpy).not.toHaveBeenCalled();
  });

  it('passes through when no trial record (paid account)', async () => {
    findUniqueSpy.mockResolvedValue(null);
    const { req, res, next } = mockReqRes('POST', 'client-1');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes through GET when trial is active', async () => {
    findUniqueSpy.mockResolvedValue(mockTrial);
    const { req, res, next } = mockReqRes('GET', 'client-1');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.trial).toEqual(mockTrial);
  });

  it('blocks POST when trial is expired', async () => {
    const expiredTrial = { ...mockTrial, expiresAt: new Date(Date.now() - 86400000), status: 'ACTIVE' };
    findUniqueSpy.mockResolvedValue(expiredTrial);
    updateSpy.mockResolvedValue({});
    const { req, res, next } = mockReqRes('POST', 'client-1');
    await trialGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ trialExpired: true }));
  });

  it('allows GET when trial is expired (read-only)', async () => {
    const expiredTrial = { ...mockTrial, expiresAt: new Date(Date.now() - 86400000), status: 'ACTIVE' };
    findUniqueSpy.mockResolvedValue(expiredTrial);
    updateSpy.mockResolvedValue({});
    const { req, res, next } = mockReqRes('GET', 'client-1');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows POST to /upgrade-request even when expired', async () => {
    const expiredTrial = { ...mockTrial, expiresAt: new Date(Date.now() - 86400000), status: 'ACTIVE' };
    findUniqueSpy.mockResolvedValue(expiredTrial);
    updateSpy.mockResolvedValue({});
    const { req, res, next } = mockReqRes('POST', 'client-1', '/upgrade-request');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes through CONVERTED trial without restriction', async () => {
    const convertedTrial = { ...mockTrial, status: 'CONVERTED' };
    findUniqueSpy.mockResolvedValue(convertedTrial);
    const { req, res, next } = mockReqRes('POST', 'client-1');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
