import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import * as authService from '../services/auth.service';
import { authenticateToken, verifyToken, rotateRefreshToken, revokeRefreshToken } from '../lib/auth';
import { prisma } from '../lib/prisma';

// Per-isolate rate limiter — best-effort protection; complements CF-level rules
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return async (c: any, next: () => Promise<void>) => {
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const key = `${c.req.path}:${ip}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);
    if (!record || record.resetAt < now) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    } else if (record.count >= maxRequests) {
      return c.json({ message: 'Too many requests, please try again later.' }, 429);
    } else {
      record.count++;
    }
    await next();
  };
}

const router = new Hono();

const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8),
  licenseToken: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const trialSignupSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  companyName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/trial-signup', rateLimit(5, 15 * 60 * 1000), validateBody(trialSignupSchema), async (c) => {
  try {
    const body = c.req.valid('json');
    const result = await authService.trialSignup(body);
    return c.json(result, 201);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return c.json({ message: 'Email already registered' }, 409);
    }
    console.error('Trial signup error:', err);
    return c.json({ message: 'Trial signup failed' }, 500);
  }
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

router.post('/register', rateLimit(5, 15 * 60 * 1000), validateBody(registerSchema), async (c) => {
  try {
    const body = c.req.valid('json');
    const result = await authService.register(body);
    return c.json(result, 201);
  } catch (err: any) {
    if (err.message?.startsWith('Invalid license:')) {
      return c.json({ message: err.message }, 400);
    }
    if (err.message === 'A client admin already exists for this license') {
      return c.json({ message: err.message }, 403);
    }
    if (err.code === 'P2002') {
      return c.json({ message: 'Email already registered' }, 409);
    }
    console.error('Registration error:', err);
    return c.json({ message: 'Registration failed' }, 500);
  }
});

router.post('/login', rateLimit(10, 15 * 60 * 1000), validateBody(loginSchema), async (c) => {
  try {
    const { email, password } = c.req.valid('json');
    const result = await authService.login(email, password);
    return c.json(result);
  } catch (err: any) {
    const status = err.status || 500;
    return c.json({ message: err.message || 'Login failed' }, status);
  }
});

router.post('/forgot-password', rateLimit(5, 15 * 60 * 1000), validateBody(forgotPasswordSchema), async (c) => {
  try {
    const { email } = c.req.valid('json');
    const frontendUrl = (c as any).env?.FRONTEND_URL;
    await authService.forgotPassword(email, frontendUrl);
    return c.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return c.json({ message: 'Failed to process request' }, 500);
  }
});

router.post('/reset-password', rateLimit(5, 15 * 60 * 1000), validateBody(resetPasswordSchema), async (c) => {
  try {
    const { token, password } = c.req.valid('json');
    await authService.resetPassword(token, password);
    return c.json({ message: 'Password updated successfully. All other devices have been logged out. You can now log in.' });
  } catch (err: any) {
    const status = err.status || 500;
    return c.json({ message: err.message || 'Failed to reset password' }, status);
  }
});

// ---------- Refresh tokens ----------

const logoutSchema = z.object({ refreshToken: z.string().min(1) });

const refreshSchema = z.object({
  userId: z.string().min(1),
  refreshToken: z.string().min(1),
});

router.post('/refresh', rateLimit(30, 15 * 60 * 1000), validateBody(refreshSchema), async (c) => {
  try {
    const { userId, refreshToken } = c.req.valid('json');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        clientAdmin: true,
        employee: { select: { id: true, companyId: true, clientId: true } },
      },
    });
    if (!user) return c.json({ message: 'User not found' }, 404);

    const clientId = user.clientAdmin?.clientId ?? user.employee?.clientId ?? undefined;
    const companyId = user.employee?.companyId ?? undefined;
    const employeeId = user.employee?.id ?? undefined;

    const result = await rotateRefreshToken(refreshToken, {
      userId: user.id,
      email: user.email,
      role: user.role,
      clientId,
      companyId,
      employeeId,
    });
    return c.json(result);
  } catch (err: any) {
    return c.json({ message: err.message }, err.status || 500);
  }
});

router.post('/logout', validateBody(logoutSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');
  await revokeRefreshToken(refreshToken);
  return c.json({ message: 'Logged out' });
});

// ---------- 2FA ----------

const twoFACodeSchema = z.object({ code: z.string().length(6) });
const twoFAAuthSchema = z.object({ tempToken: z.string().min(1), code: z.string().length(6) });
const twoFADisableSchema = z.object({ password: z.string().min(1), code: z.string().length(6) });

router.post('/2fa/authenticate', rateLimit(10, 15 * 60 * 1000), validateBody(twoFAAuthSchema), async (c) => {
  try {
    const { tempToken, code } = c.req.valid('json');
    const payload = await verifyToken(tempToken);
    if (!payload.pending2fa) return c.json({ message: 'Invalid token' }, 400);
    const result = await authService.completeTwoFactorLogin(payload.userId, code);
    return c.json(result);
  } catch (err: any) {
    return c.json({ message: err.message }, err.status || 401);
  }
});

router.post('/2fa/setup', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const result = await authService.setupTOTP(user.userId);
    return c.json(result);
  } catch (err: any) {
    return c.json({ message: err.message }, err.status || 500);
  }
});

router.post('/2fa/verify', authenticateToken, validateBody(twoFACodeSchema), async (c) => {
  try {
    const user = c.get('user');
    const { code } = c.req.valid('json');
    await authService.enableTOTP(user.userId, code);
    return c.json({ message: '2FA enabled successfully' });
  } catch (err: any) {
    return c.json({ message: err.message }, err.status || 500);
  }
});

router.post('/2fa/disable', authenticateToken, validateBody(twoFADisableSchema), async (c) => {
  try {
    const user = c.get('user');
    const { password, code } = c.req.valid('json');
    await authService.disableTOTP(user.userId, password, code);
    return c.json({ message: '2FA disabled successfully' });
  } catch (err: any) {
    return c.json({ message: err.message }, err.status || 500);
  }
});

export default router;
