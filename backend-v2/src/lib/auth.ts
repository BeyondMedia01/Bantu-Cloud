import { jwt, sign as jwtSign, verify as jwtVerify } from 'hono/jwt';
import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { prisma } from './prisma';

let SECRET = 'desktop-dummy-secret';
export function initAuth(jwtSecret: string): void { SECRET = jwtSecret; }

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  clientId?: string;
  companyId?: string;
  employeeId?: string;
  sessionId: string;
}

export async function signToken(payload: Omit<TokenPayload, 'sessionId'>): Promise<string> {
  const sessionId = crypto.randomUUID();
  const token = await jwtSign({ ...payload, sessionId }, SECRET, { algorithm: 'HS256' });

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: payload.userId,
      token,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });

  return token;
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  return jwtVerify(token, SECRET, { algorithm: 'HS256' }) as Promise<TokenPayload>;
}

export const authenticateToken = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return c.json({ message: 'Authentication required' }, 401);
  }

  try {
    const decoded = await verifyToken(token);
    const session = await prisma.session.findUnique({
      where: { id: decoded.sessionId },
    });

    if (!session || session.expiresAt < new Date()) {
      return c.json({ message: 'Session expired or invalidated' }, 401);
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
