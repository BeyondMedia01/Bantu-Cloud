import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import * as authService from '../services/auth.service';

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

router.post('/reset-password', validateBody(resetPasswordSchema), async (c) => {
  try {
    const { token, password } = c.req.valid('json');
    await authService.resetPassword(token, password);
    return c.json({ message: 'Password updated successfully. All other devices have been logged out. You can now log in.' });
  } catch (err: any) {
    const status = err.status || 500;
    return c.json({ message: err.message || 'Failed to reset password' }, status);
  }
});

export default router;
