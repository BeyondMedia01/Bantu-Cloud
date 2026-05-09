import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import jwt from 'jsonwebtoken';

// ── Prisma mock (created before app loads) ────────────────────────────────────

const session = { id: 'session-1', expiresAt: new Date(Date.now() + 3600000) };
const company1 = { id: 'company-1', clientId: 'client-1', name: 'Acme Corp' };
const company2 = { id: 'company-2', clientId: 'client-2', name: 'Rival Corp' };
const role1 = {
  id: 'role-1', companyId: 'company-1', name: 'HR Manager',
  description: null, isActive: true,
  permissions: [{ module: 'PEOPLE', actions: ['VIEW', 'EDIT'] }],
  _count: { userRoles: 1 }, updatedAt: new Date(),
};
const invite1 = {
  id: 'invite-1', companyId: 'company-1', email: 'jane@acme.com',
  roleIds: ['role-1'], token: 'valid-token-abc', status: 'PENDING',
  expiresAt: new Date(Date.now() + 86400000), invitedBy: 'admin-user-1',
};

// prismaMock is exported so tests can call mockResolvedValueOnce on individual fns
export const prismaMock = {
  session:              { findUnique: vi.fn().mockResolvedValue(session) },
  company:              { findUnique: vi.fn(({ where }) => {
    if (where.id === 'company-1') return Promise.resolve(company1);
    if (where.id === 'company-2') return Promise.resolve(company2);
    return Promise.resolve(null);
  }) },
  role:                 {
    findMany:   vi.fn().mockResolvedValue([role1]),
    findUnique: vi.fn().mockResolvedValue(role1),
    create:     vi.fn().mockResolvedValue(role1),
    update:     vi.fn().mockResolvedValue(role1),
    delete:     vi.fn().mockResolvedValue(role1),
  },
  roleModulePermission: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
  userCompanyRole:      { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
  invite:               {
    findUnique: vi.fn().mockResolvedValue(invite1),
    findMany:   vi.fn().mockResolvedValue([invite1]),
    updateMany: vi.fn().mockResolvedValue({}),
    create:     vi.fn().mockResolvedValue(invite1),
    update:     vi.fn().mockResolvedValue({ ...invite1, status: 'CANCELLED' }),
  },
  user:                 { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'u-1' }) },
  publicHoliday:        { findFirst: vi.fn().mockResolvedValue({ id: 'h-1' }), create: vi.fn().mockResolvedValue({}) },
  client:               { findMany: vi.fn().mockResolvedValue([]) },
  transactionCode:      { findFirst: vi.fn().mockResolvedValue({ id: 'tc-1' }) },
  systemSetting:        { findFirst: vi.fn().mockResolvedValue({ id: 'ss-1' }), upsert: vi.fn().mockResolvedValue({}) },
  $transaction:         vi.fn(async (fn) => fn(prismaMock)),
  $connect:             vi.fn(),
  $disconnect:          vi.fn(),
};

// ── Inject mocks into Node.js require.cache before app loads ──────────────────
// Using createRequire gives us access to the native CJS module cache,
// which all transitive require() calls share regardless of Vitest's module system.

const _require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));

function stubCache(relPath, exports) {
  const abs = resolve(__dir, relPath);
  _require.cache[abs] = { id: abs, filename: abs, loaded: true, exports, children: [], paths: [] };
}

stubCache('../../lib/prisma.js', prismaMock);
stubCache('../../lib/mailer.js', { sendEmployeeInvite: vi.fn().mockResolvedValue(true) });

// Load app via CJS require (respects require.cache we just populated)
const { app } = _require('../../index.js');

// Supertest also loaded via _require so it shares the same Node.js runtime
const request = _require('supertest');

// ── Token helpers ─────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

function makeToken(overrides = {}) {
  return jwt.sign(
    { userId: 'admin-1', role: 'CLIENT_ADMIN', clientId: 'client-1', isClientAdmin: true, sessionId: 'session-1', ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const ADMIN_A = makeToken();
const ADMIN_B = makeToken({ clientId: 'client-2' });
const USER_NO_PEOPLE = makeToken({ role: 'COMPANY_USER', isClientAdmin: false, permissions: { PAYROLL: ['VIEW'] } });
const USER_WITH_PEOPLE = makeToken({ role: 'COMPANY_USER', isClientAdmin: false, permissions: { PEOPLE: ['VIEW', 'EDIT'] } });

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// ── /api/roles ────────────────────────────────────────────────────────────────

describe('RBAC — /api/roles', () => {
  describe('GET /?companyId', () => {
    it('200 — CLIENT_ADMIN reads own company roles', async () => {
      const res = await request(app).get('/api/roles?companyId=company-1').set(auth(ADMIN_A));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('403 — CLIENT_ADMIN from different client is blocked', async () => {
      const res = await request(app).get('/api/roles?companyId=company-1').set(auth(ADMIN_B));
      expect(res.status).toBe(403);
    });

    it('401 — unauthenticated request is rejected', async () => {
      const res = await request(app).get('/api/roles?companyId=company-1');
      expect(res.status).toBe(401);
    });

    it('403 — COMPANY_USER cannot access roles management', async () => {
      const res = await request(app).get('/api/roles?companyId=company-1').set(auth(USER_WITH_PEOPLE));
      expect(res.status).toBe(403);
    });
  });

  describe('POST /', () => {
    it('201 — CLIENT_ADMIN creates role in own company', async () => {
      const res = await request(app)
        .post('/api/roles')
        .set(auth(ADMIN_A))
        .send({ companyId: 'company-1', name: 'HR Manager', permissions: [] });
      expect(res.status).toBe(201);
    });

    it("403 — CLIENT_ADMIN blocked from creating role in another client's company", async () => {
      const res = await request(app)
        .post('/api/roles')
        .set(auth(ADMIN_B))
        .send({ companyId: 'company-1', name: 'Backdoor', permissions: [] });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /:id', () => {
    it('200 — CLIENT_ADMIN deletes role in own company', async () => {
      const res = await request(app).delete('/api/roles/role-1').set(auth(ADMIN_A));
      expect(res.status).toBe(200);
    });

    it("403 — CLIENT_ADMIN blocked from deleting role in another client's company", async () => {
      const res = await request(app).delete('/api/roles/role-1').set(auth(ADMIN_B));
      expect(res.status).toBe(403);
    });
  });

  describe('POST /assign', () => {
    it('200 — assigns valid roles to user in own company', async () => {
      const res = await request(app)
        .post('/api/roles/assign')
        .set(auth(ADMIN_A))
        .send({ userId: 'user-x', companyId: 'company-1', roleIds: ['role-1'] });
      expect(res.status).toBe(200);
    });

    it('400 — blocked when roleIds do not belong to target company (cross-company injection)', async () => {
      prismaMock.role.findMany.mockResolvedValueOnce([]);
      const res = await request(app)
        .post('/api/roles/assign')
        .set(auth(ADMIN_A))
        .send({ userId: 'user-x', companyId: 'company-1', roleIds: ['foreign-role-uuid'] });
      expect(res.status).toBe(400);
    });

    it("403 — blocked from assigning to another client's company", async () => {
      const res = await request(app)
        .post('/api/roles/assign')
        .set(auth(ADMIN_B))
        .send({ userId: 'user-x', companyId: 'company-1', roleIds: ['role-1'] });
      expect(res.status).toBe(403);
    });
  });
});

// ── /api/invites ──────────────────────────────────────────────────────────────

describe('RBAC — /api/invites', () => {
  describe('POST /', () => {
    it('201 — CLIENT_ADMIN sends invite for own company', async () => {
      const res = await request(app)
        .post('/api/invites')
        .set(auth(ADMIN_A))
        .send({ companyId: 'company-1', email: 'jane@acme.com', roleIds: ['role-1'] });
      expect(res.status).toBe(201);
    });

    it("403 — blocked from inviting into another client's company", async () => {
      const res = await request(app)
        .post('/api/invites')
        .set(auth(ADMIN_B))
        .send({ companyId: 'company-1', email: 'attacker@evil.com', roleIds: ['role-1'] });
      expect(res.status).toBe(403);
    });

    it('400 — blocked when roleIds do not belong to target company', async () => {
      prismaMock.role.findMany.mockResolvedValueOnce([]);
      const res = await request(app)
        .post('/api/invites')
        .set(auth(ADMIN_A))
        .send({ companyId: 'company-1', email: 'jane@acme.com', roleIds: ['foreign-role-uuid'] });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /', () => {
    it('200 — CLIENT_ADMIN lists invites for own company', async () => {
      const res = await request(app).get('/api/invites?companyId=company-1').set(auth(ADMIN_A));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("403 — blocked from listing another client's invites", async () => {
      const res = await request(app).get('/api/invites?companyId=company-1').set(auth(ADMIN_B));
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /:id', () => {
    it('200 — CLIENT_ADMIN cancels invite in own company', async () => {
      const res = await request(app).delete('/api/invites/invite-1').set(auth(ADMIN_A));
      expect(res.status).toBe(200);
    });

    it("403 — blocked from cancelling another client's invite", async () => {
      const res = await request(app).delete('/api/invites/invite-1').set(auth(ADMIN_B));
      expect(res.status).toBe(403);
    });
  });
});

// ── requireModule middleware ──────────────────────────────────────────────────

describe('Module access control — requireModule', () => {
  it('403 — COMPANY_USER without PEOPLE module cannot access /api/employees', async () => {
    const res = await request(app)
      .get('/api/employees')
      .set({ ...auth(USER_NO_PEOPLE), 'x-company-id': 'company-1' });
    expect(res.status).toBe(403);
  });

  it('non-403 — COMPANY_USER with PEOPLE module passes requireModule guard', async () => {
    const res = await request(app)
      .get('/api/employees')
      .set({ ...auth(USER_WITH_PEOPLE), 'x-company-id': 'company-1' });
    expect(res.status).not.toBe(403);
  });

  it('non-403 — CLIENT_ADMIN always passes requireModule on any route', async () => {
    const res = await request(app)
      .get('/api/employees')
      .set({ ...auth(ADMIN_A), 'x-company-id': 'company-1' });
    expect(res.status).not.toBe(403);
  });
});
