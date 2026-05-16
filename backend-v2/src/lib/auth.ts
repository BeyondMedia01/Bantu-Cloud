import { sign as jwtSign, verify as jwtVerify } from 'hono/jwt';
import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { prisma } from './prisma';

let SECRET: string | null = null;
export function initAuth(jwtSecret: string): void { SECRET = jwtSecret; }
function getSecret(): string {
  if (!SECRET) throw new Error('[auth] initAuth not called — JWT_SECRET missing');
  return SECRET;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  clientId?: string;
  companyId?: string;
  employeeId?: string;
  sessionId: string;
  pending2fa?: boolean;
}

export async function signToken(payload: Omit<TokenPayload, 'sessionId'>, ttlSeconds = 15 * 60): Promise<string> {
  const sessionId = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await jwtSign({ ...payload, sessionId, exp }, getSecret(), 'HS256');

  if (!payload.pending2fa) {
    await prisma.session.create({
      data: {
        id: sessionId,
        userId: payload.userId,
        token,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
  }

  return token;
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  return jwtVerify(token, getSecret(), 'HS256') as unknown as Promise<TokenPayload>;
}

// ---------- Refresh tokens ----------

async function hashToken(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createRefreshToken(userId: string): Promise<string> {
  const rawBytes = new Uint8Array(48);
  crypto.getRandomValues(rawBytes);
  const raw = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await hashToken(raw);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return raw;
}

export async function rotateRefreshToken(
  raw: string,
  payload: Omit<TokenPayload, 'sessionId' | 'pending2fa'>,
): Promise<{ token: string; refreshToken: string }> {
  const tokenHash = await hashToken(raw);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.userId !== payload.userId || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired refresh token'), { status: 401 });
  }

  await prisma.refreshToken.delete({ where: { id: stored.id } });

  const [token, refreshToken] = await Promise.all([
    signToken(payload),
    createRefreshToken(payload.userId),
  ]);

  return { token, refreshToken };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const tokenHash = await hashToken(raw);
  await prisma.refreshToken.deleteMany({ where: { tokenHash } }).catch(() => {});
}

// ---------- Middleware ----------

export const authenticateToken = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return c.json({ message: 'Authentication required' }, 401);
  }

  try {
    const decoded = await verifyToken(token);
    if (decoded.pending2fa) {
      return c.json({ message: 'Two-factor authentication required' }, 401);
    }
    c.set('user', decoded);
    await next();
  } catch {
    return c.json({ message: 'Invalid or expired token' }, 401);
  }
});

export function requireRole(...roles: string[]) {
  return createMiddleware(async (c: Context, next: Next) => {
    const user: TokenPayload | undefined = c.get('user');
    if (!user) {
      return c.json({ message: 'Unauthorized' }, 401);
    }
    if (!roles.includes(user.role)) {
      return c.json({ message: `Access denied: requires role ${roles.join(' or ')}` }, 403);
    }
    await next();
  });
}
