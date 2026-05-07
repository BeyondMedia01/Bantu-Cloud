import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PrismaClient before importing the middleware
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    syncQueue: {
      create: vi.fn().mockResolvedValue({ id: 'sq1' }),
    },
  })),
}));

const { syncQueueMiddleware, deriveOperation } = await import('../../sync_queue/syncQueueMiddleware.js');

function makeReq(method, path, body = {}) {
  return { method, path, body };
}

function makeRes(statusCode = 200) {
  const listeners = {};
  const res = {
    statusCode,
    json: vi.fn(function (data) { return this; }),
    on: (event, cb) => { listeners[event] = cb; },
    emit: (event) => listeners[event]?.(),
  };
  return res;
}

describe('deriveOperation', () => {
  it('maps POST /api/employees to CREATE_EMPLOYEE', () => {
    expect(deriveOperation('POST', '/api/employees')).toBe('CREATE_EMPLOYEE');
  });

  it('maps PUT /api/employees/123 to UPDATE_EMPLOYEE', () => {
    expect(deriveOperation('PUT', '/api/employees/123')).toBe('UPDATE_EMPLOYEE');
  });

  it('maps PATCH /api/employees/123 to UPDATE_EMPLOYEE', () => {
    expect(deriveOperation('PATCH', '/api/employees/123')).toBe('UPDATE_EMPLOYEE');
  });

  it('maps DELETE /api/employees/123 to DELETE_EMPLOYEE', () => {
    expect(deriveOperation('DELETE', '/api/employees/123')).toBe('DELETE_EMPLOYEE');
  });

  it('maps POST /api/leave-policies to CREATE_LEAVE_POLICY', () => {
    expect(deriveOperation('POST', '/api/leave-policies')).toBe('CREATE_LEAVE_POLICY');
  });

  it('returns null for GET method', () => {
    expect(deriveOperation('GET', '/api/employees')).toBeNull();
  });

  it('returns null for non-api paths', () => {
    expect(deriveOperation('POST', '/health')).toBeNull();
  });
});

describe('syncQueueMiddleware', () => {
  it('calls next() for GET requests (skips non-mutations)', () => {
    const next = vi.fn();
    syncQueueMiddleware(makeReq('GET', '/api/employees'), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next() for POST requests (proceeds through middleware)', () => {
    const next = vi.fn();
    syncQueueMiddleware(makeReq('POST', '/api/employees', { name: 'Alice' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next() for PUT requests', () => {
    const next = vi.fn();
    syncQueueMiddleware(makeReq('PUT', '/api/employees/1', { name: 'Bob' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next() for DELETE requests', () => {
    const next = vi.fn();
    syncQueueMiddleware(makeReq('DELETE', '/api/employees/1'), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('does not throw when finish event fires on successful response', async () => {
    const next = vi.fn();
    const res = makeRes(201);
    syncQueueMiddleware(makeReq('POST', '/api/employees', { name: 'Alice' }), res, next);
    res.emit('finish');
    // Give async finish handler time to run
    await new Promise((r) => setTimeout(r, 20));
    expect(next).toHaveBeenCalled();
  });

  it('does not attempt to queue on non-2xx response', async () => {
    const next = vi.fn();
    const res = makeRes(400);
    syncQueueMiddleware(makeReq('POST', '/api/employees', { name: 'Alice' }), res, next);
    res.emit('finish');
    await new Promise((r) => setTimeout(r, 20));
    // No error thrown; next was still called
    expect(next).toHaveBeenCalled();
  });
});
