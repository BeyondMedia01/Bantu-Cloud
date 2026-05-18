import { Hono } from 'hono';
import type { ExportedHandler } from '@cloudflare/workers-types';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import * as Sentry from '@sentry/cloudflare';
import { initPrisma, prisma } from './lib/prisma';
import { initAuth, authenticateToken } from './lib/auth';
import { initMailer } from './lib/mailer';
import { initStorage } from './lib/storage';
import { companyContext } from './middleware/companyContext';
import { trialGuard } from './middleware/trialGuard';

import authDomain from './domains/auth.domain';
import userDomain from './domains/user.domain';
import employeesDomain from './domains/employees.domain';
import payrollDomain from './domains/payroll.domain';
import leaveDomain from './domains/leave.domain';
import loansDomain from './domains/loans.domain';
import attendanceDomain from './domains/attendance.domain';
import settingsDomain from './domains/settings.domain';
import statutoryDomain from './domains/statutory.domain';
import documentsDomain from './domains/documents.domain';
import adminDomain from './domains/admin.domain';
import advancedDomain from './domains/advanced.domain';

const PROD_ORIGINS = [
  'https://payroll.thinkbantu.com',
  'https://bantu-cloud.vercel.app',
];
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

function getAllowedOrigins(env: Bindings): string[] {
  return env.ENVIRONMENT === 'production' ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS];
}

type Bindings = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  FROM_EMAIL?: string;
  FRONTEND_URL?: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME?: string;
  STORAGE: R2Bucket;
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (c, next) => {
  initPrisma(c.env.DATABASE_URL);
  initAuth(c.env.JWT_SECRET);
  initMailer(c.env.RESEND_API_KEY, c.env.FROM_EMAIL || 'Bantu Payroll <no-reply@thinkbantu.com>', c.env.FRONTEND_URL || 'https://payroll.thinkbantu.com');
  initStorage(c.env.R2_ACCOUNT_ID, c.env.R2_ACCESS_KEY_ID, c.env.R2_SECRET_ACCESS_KEY, c.env.R2_BUCKET_NAME || 'bantu-production');
  await next();
});

app.use('*', async (c, next) => {
  const allowed = getAllowedOrigins(c.env);
  return cors({
    origin: allowed,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-company-id'],
    maxAge: 86400,
  })(c, next);
});
app.use('*', secureHeaders({
  crossOriginResourcePolicy: 'cross-origin',
  crossOriginOpenerPolicy: 'cross-origin',
}));
app.use('*', logger());

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  const origin = c.req.header('origin');
  if (origin && getAllowedOrigins(c.env).includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
  }
  return c.json({ message: 'Internal server error' }, 500);
});

app.get('/health', (c) => c.json({ status: 'ok' }));

// Public holidays — country-wide data, no auth or company context needed
app.get('/api/public-holidays', async (c) => {
  try {
    const year = parseInt(c.req.query('year') || '') || new Date().getFullYear();
    const holidays = await prisma.publicHoliday.findMany({ where: { year, country: 'ZW' }, orderBy: { date: 'asc' } });
    return c.json(holidays);
  } catch (err: any) {
    console.error('[publicHolidays GET]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// Public domain (no auth required)
app.route('/api', authDomain);

// Auth-only routes (no company context required — used to bootstrap session)
import trialRoutes from './routes/trial';
const userApi = new Hono();
userApi.use('*', authenticateToken);
userApi.route('/', userDomain);
userApi.route('/trial', trialRoutes);
app.route('/api', userApi);

// Protected API sub-app — auth & company context applied to all routes inside
const api = new Hono();
api.use('*', authenticateToken);
api.use('*', companyContext);
api.use('*', trialGuard);
api.route('/', employeesDomain);
api.route('/', payrollDomain);
api.route('/', leaveDomain);
api.route('/', loansDomain);
api.route('/', attendanceDomain);
api.route('/', settingsDomain);
api.route('/', statutoryDomain);
api.route('/', documentsDomain);
api.route('/', adminDomain);
api.route('/', advancedDomain);

app.route('/api', api);

async function fetchWithCors(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('origin');
  const isAllowed = origin && getAllowedOrigins(env).includes(origin);

  // Handle OPTIONS at the outermost level so CORS headers are never missing
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: isAllowed ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-company-id',
        'Access-Control-Max-Age': '86400',
      } : {},
    });
  }

  try {
    // app.fetch already has cors() middleware + onError both setting CORS headers
    const res = await app.fetch(request, env, ctx);
    console.log(`[fetchWithCors] ${request.method} ${new URL(request.url).pathname} → ${res.status}`);
    return res;
  } catch (err) {
    console.error('[fetchWithCors] CRASH:', (err as Error)?.message, (err as Error)?.stack?.split('\n')[1]);
    console.error('[fetchWithCors] Unhandled exception from app.fetch:', err);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isAllowed && origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return new Response(
      JSON.stringify({ message: (err as Error).message ?? 'Internal server error' }),
      { status: 500, headers },
    );
  }
}

const handler = {
  fetch: fetchWithCors,
  scheduled,
};

export default Sentry.withSentry(
  (env: Record<string, any>) => ({
    dsn: env.SENTRY_DSN,
    environment: env.ENVIRONMENT || 'development',
    tracesSampleRate: env.ENVIRONMENT === 'production' ? 0.1 : 0.0,
  }),
  handler as any,
) as ExportedHandler<Bindings>;

async function scheduled(event: { cron?: string }, env: Bindings, _ctx: ExecutionContext) {
  if (!env.DATABASE_URL) {
    console.error('[Scheduled] DATABASE_URL missing — aborting');
    return;
  }

  const { initPrisma: initP } = await import('./lib/prisma');
  initP(env.DATABASE_URL);
  const { prisma: p } = await import('./lib/prisma');
  if (env.RESEND_API_KEY) {
    const { initMailer: initM } = await import('./lib/mailer');
    initM(env.RESEND_API_KEY, env.FROM_EMAIL, env.FRONTEND_URL);
  }

  if (event.cron === '5 0 1 * *') {
    const { seedAll } = await import('./services/seed.service');
    await seedAll().catch((err: Error) => console.error('[Scheduled] Seed failed:', err.message));

    const now = new Date();
    const policies = await p.leavePolicy.findMany({ where: { isActive: true } });

    for (const policy of policies) {
      const balances = await p.leaveBalance.findMany({
        where: {
          leavePolicyId: policy.id,
          year: now.getFullYear(),
          OR: [{ lastAccrualDate: null }, { lastAccrualDate: { lt: new Date(now.getFullYear(), now.getMonth(), 1) } }],
          employee: { dischargeDate: null },
        },
        include: { employee: { select: { employmentType: true } } },
      });

      if (balances.length === 0) continue;

      // All balance updates for this policy are atomic — partial accrual is worse than no accrual
      const updates = balances.map((bal) => {
        const rate = bal.employee.employmentType === 'PART_TIME' ? policy.accrualRate / 2 : policy.accrualRate;
        const newAccrued = bal.accrued + rate;
        const newBalance = bal.openingBalance + newAccrued - bal.taken - bal.encashed - bal.forfeited;
        const capped = policy.maxAccumulation > 0 ? Math.min(newBalance, policy.maxAccumulation) : newBalance;
        return p.leaveBalance.update({
          where: { id: bal.id },
          data: { accrued: newAccrued, balance: capped, lastAccrualDate: now },
        });
      });

      try {
        await p.$transaction(updates);
        console.log(`[Scheduled] Accrued leave for policy ${policy.id}: ${balances.length} balances updated`);
      } catch (err: unknown) {
        console.error(`[Scheduled] Leave accrual failed for policy ${policy.id}:`, (err as Error).message);
      }
    }
  } else if (event.cron === '0 7 * * *') {
    const pending = await p.leaveRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: { select: { companyId: true } } },
    });
    if (pending.length === 0) return;

    const companyIds = [...new Set(pending.map((r) => r.employee.companyId))];
    const companies = await p.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    });
    const companyNames = new Map(companies.map((c) => [c.id, c.name]));
    const counts = new Map<string, number>();
    for (const r of pending) {
      counts.set(r.employee.companyId, (counts.get(r.employee.companyId) || 0) + 1);
    }

    const { sendNotification } = await import('./lib/mailer');
    for (const [companyId, count] of counts) {
      const admins = await p.user.findMany({
        where: { role: 'CLIENT_ADMIN', UserCompanyRole: { some: { companyId } } },
      });
      const name = companyNames.get(companyId) || 'Unknown';
      for (const admin of admins) {
        if (admin.email) {
          await sendNotification(admin.email, {
            subject: `Pending leave requests (${count})`,
            body: `${count} pending leave request(s) for ${name}.`,
          }).catch((err: Error) => console.error(`[Scheduled] Notification failed for ${admin.email}:`, err.message));
        }
      }
    }
  }
}
