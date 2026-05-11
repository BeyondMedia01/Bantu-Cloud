import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import * as authService from '../services/auth.service';

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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

router.post('/register', validateBody(registerSchema), async (c) => {
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

router.post('/login', validateBody(loginSchema), async (c) => {
  try {
    const { email, password } = c.req.valid('json');
    const result = await authService.login(email, password);
    return c.json(result);
  } catch (err: any) {
    const status = err.status || 500;
    return c.json({ message: err.message || 'Login failed' }, status);
  }
});

router.post('/forgot-password', validateBody(forgotPasswordSchema), async (c) => {
  try {
    const { email } = c.req.valid('json');
    await authService.forgotPassword(email);
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

router.post('/sync', async (c) => {
  return c.json({ message: 'Not found' }, 404);

  try {
    const body = await c.req.json();
    await authService.syncCredentials(body);
    return c.json({ message: 'Credentials synced' });
  } catch (err) {
    console.error('Desktop sync error:', err);
    return c.json({ message: 'Failed to sync credentials' }, 500);
  }
});

export default router;
