const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const speakeasy = require('speakeasy');
const QRCode   = require('qrcode');
const prisma   = require('../lib/prisma');
const { signToken, authenticateToken } = require('../lib/auth');
const { validateLicense } = require('../lib/license');
const { sendPasswordReset } = require('../lib/mailer');

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_BASE_MS    = 15 * 60 * 1000; // 15 min, doubles with each over-limit attempt
const REFRESH_TTL_MS     = 7 * 24 * 60 * 60 * 1000; // 7 days

/** HMAC-SHA256 tied to JWT_SECRET — avoids plain-SHA256 rainbow-table risk. */
function hmacToken(raw) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(raw).digest('hex');
}

/** Issue a new opaque refresh token, persist its HMAC, return the raw value. */
async function rotateRefreshToken(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: userId },
    data: {
      refreshToken:       hmacToken(raw),
      refreshTokenExpiry: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return raw;
}

/** Write the httpOnly refresh-token cookie to the response. */
function setRefreshCookie(res, raw) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('bantu_rt', raw, {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge:   REFRESH_TTL_MS,
    path:     '/api/auth',          // cookie is only sent to /api/auth/* routes
  });
}

/** Clear the refresh-token cookie. */
function clearRefreshCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('bantu_rt', {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    path:     '/api/auth',
  });
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { firstName, lastName, phone, email, password, licenseToken } = req.body;

  if (!firstName || !lastName || !email || !password || !licenseToken) {
    return res.status(400).json({ message: 'firstName, lastName, email, password, and licenseToken are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  const { valid, license, reason } = await validateLicense(licenseToken);
  if (!valid) return res.status(400).json({ message: `Invalid license: ${reason}` });

  const existingAdmin = await prisma.clientAdmin.findFirst({ where: { clientId: license.clientId } });
  if (existingAdmin) return res.status(403).json({ message: 'A client admin already exists for this license' });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        name:      fullName,
        phone:     phone?.trim() || null,
        email,
        password:  hashedPassword,
        role:      'CLIENT_ADMIN',
        clientAdmin: { create: { clientId: license.clientId } },
      },
    });

    const freshClient    = await prisma.client.findUnique({ where: { id: license.clientId }, select: { enabledModules: true } });
    const enabledModules = freshClient?.enabledModules ?? null;
    const token          = await signToken({ userId: user.id, role: user.role, clientId: license.clientId, enabledModules });

    const raw = await rotateRefreshToken(user.id);
    setRefreshCookie(res, raw);

    res.status(201).json({ token, role: user.role, clientId: license.clientId });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        clientAdmin: true,
        employee: { select: { id: true, companyId: true, clientId: true } },
      },
    });

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    // Database-backed lockout (survives restarts and works across instances)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ message: `Account locked. Try again in ${remaining} minute(s).` });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const attempts  = user.loginAttempts + 1;
      const overLimit = Math.max(0, attempts - MAX_LOGIN_ATTEMPTS);
      const lockUntil = attempts >= MAX_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_BASE_MS * Math.pow(2, overLimit))
        : null;
      await prisma.user.update({
        where: { id: user.id },
        data:  { loginAttempts: attempts, lockedUntil: lockUntil },
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Success — clear lockout counters
    await prisma.user.update({
      where: { id: user.id },
      data:  { loginAttempts: 0, lockedUntil: null },
    });

    if (process.env.APP_MODE === 'desktop' && user.role === 'PLATFORM_ADMIN') {
      return res.status(403).json({ message: 'Platform admin accounts cannot log in on the desktop app' });
    }

    // 2FA check — if enabled, issue a short-lived temp token instead
    if (user.totpEnabled) {
      const tempToken = crypto.randomBytes(16).toString('hex');
      await prisma.user.update({
        where: { id: user.id },
        data:  { passwordResetToken: `2fa:${tempToken}`, passwordResetExpiry: new Date(Date.now() + 5 * 60 * 1000) },
      });
      return res.json({ requires2FA: true, tempToken });
    }

    const clientId   = user.clientAdmin?.clientId ?? user.employee?.clientId ?? null;
    const companyId  = user.employee?.companyId ?? null;
    const employeeId = user.employee?.id ?? null;

    let enabledModules = null;
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { enabledModules: true } });
      enabledModules = client?.enabledModules ?? null;
    }

    const token = await signToken({ userId: user.id, role: user.role, clientId, companyId, employeeId, enabledModules });
    const raw   = await rotateRefreshToken(user.id);
    setRefreshCookie(res, raw);

    res.json({ token, role: user.role, clientId, companyId, employeeId, name: user.name ?? 'User', userId: user.id });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

// ─── POST /api/auth/2fa/authenticate ─────────────────────────────────────────

router.post('/2fa/authenticate', async (req, res) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) return res.status(400).json({ message: 'tempToken and code are required' });

  try {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: `2fa:${tempToken}`,
        passwordResetExpiry: { gt: new Date() },
      },
      include: {
        clientAdmin: true,
        employee: { select: { id: true, companyId: true, clientId: true } },
      },
    });

    if (!user) return res.status(401).json({ message: 'Invalid or expired 2FA session' });

    // Verify TOTP code
    const verified = speakeasy.totp.verify({
      secret:   user.totpSecret,
      encoding: 'base32',
      token:    code,
      window:   1,
    });

    if (!verified) return res.status(401).json({ message: 'Invalid 2FA code' });

    // Clear the temp token
    await prisma.user.update({
      where: { id: user.id },
      data:  { passwordResetToken: null, passwordResetExpiry: null },
    });

    const clientId   = user.clientAdmin?.clientId ?? user.employee?.clientId ?? null;
    const companyId  = user.employee?.companyId ?? null;
    const employeeId = user.employee?.id ?? null;

    let enabledModules = null;
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { enabledModules: true } });
      enabledModules = client?.enabledModules ?? null;
    }

    const token = await signToken({ userId: user.id, role: user.role, clientId, companyId, employeeId, enabledModules });
    const raw   = await rotateRefreshToken(user.id);
    setRefreshCookie(res, raw);

    res.json({ token, role: user.role, clientId, companyId, employeeId, userId: user.id });
  } catch (error) {
    console.error('2FA error:', error);
    res.status(500).json({ message: '2FA verification failed' });
  }
});

// ─── POST /api/auth/2fa/setup ────────────────────────────────────────────────
// Generates a new TOTP secret for the authenticated user and returns the
// otpauth:// URI so the frontend can render a QR code.
// Does NOT enable 2FA yet — the user must call /2fa/verify first.

router.post('/2fa/setup', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { email: true, totpEnabled: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.totpEnabled) return res.status(400).json({ message: '2FA is already enabled' });

    const secret = speakeasy.generateSecret({
      name:   `Bantu (${user.email})`,
      length: 20,
    });

    // Persist the secret immediately — it is harmless without totpEnabled=true
    // and avoids needing a separate staging field in the schema.
    await prisma.user.update({
      where: { id: req.user.userId },
      data:  { totpSecret: secret.base32 },
    });

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({ secret: secret.base32, uri: secret.otpauth_url, qr: qrDataUrl });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ message: '2FA setup failed' });
  }
});

// ─── POST /api/auth/2fa/verify ────────────────────────────────────────────────
// Confirms the user's authenticator app is configured correctly, then enables
// 2FA on the account.  Requires a valid code from the app.

router.post('/2fa/verify', authenticateToken, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: 'code is required' });

  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.totpEnabled) return res.status(400).json({ message: '2FA is already enabled' });
    if (!user.totpSecret) return res.status(400).json({ message: 'Run /2fa/setup first' });

    const verified = speakeasy.totp.verify({
      secret:   user.totpSecret,
      encoding: 'base32',
      token:    String(code),
      window:   1,
    });

    if (!verified) return res.status(401).json({ message: 'Invalid code — check your authenticator app and try again' });

    await prisma.user.update({
      where: { id: req.user.userId },
      data:  { totpEnabled: true },
    });

    res.json({ message: '2FA enabled successfully' });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ message: '2FA verification failed' });
  }
});

// ─── POST /api/auth/2fa/disable ───────────────────────────────────────────────
// Disables 2FA.  Requires the current password AND a valid TOTP code to prevent
// an attacker with a stolen session from silently removing 2FA.

router.post('/2fa/disable', authenticateToken, async (req, res) => {
  const { password, code } = req.body;
  if (!password || !code) return res.status(400).json({ message: 'password and code are required' });

  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { password: true, totpSecret: true, totpEnabled: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.totpEnabled) return res.status(400).json({ message: '2FA is not enabled' });

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) return res.status(401).json({ message: 'Incorrect password' });

    const codeOk = speakeasy.totp.verify({
      secret:   user.totpSecret,
      encoding: 'base32',
      token:    String(code),
      window:   1,
    });
    if (!codeOk) return res.status(401).json({ message: 'Invalid 2FA code' });

    await prisma.user.update({
      where: { id: req.user.userId },
      data:  { totpEnabled: false, totpSecret: null },
    });

    res.json({ message: '2FA disabled' });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ message: 'Failed to disable 2FA' });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  const rawToken = req.cookies?.bantu_rt;
  if (!rawToken) return res.status(401).json({ message: 'No refresh token' });

  try {
    const hashed = hmacToken(rawToken);
    const user   = await prisma.user.findFirst({
      where: { refreshToken: hashed },
      include: {
        clientAdmin: true,
        employee: { select: { id: true, companyId: true, clientId: true } },
      },
    });

    if (!user || !user.refreshTokenExpiry || user.refreshTokenExpiry < new Date()) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Refresh token invalid or expired' });
    }

    const clientId   = user.clientAdmin?.clientId ?? user.employee?.clientId ?? null;
    const companyId  = user.employee?.companyId ?? null;
    const employeeId = user.employee?.id ?? null;

    let enabledModules = null;
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { enabledModules: true } });
      enabledModules = client?.enabledModules ?? null;
    }

    const token = await signToken({ userId: user.id, role: user.role, clientId, companyId, employeeId, enabledModules });
    const raw   = await rotateRefreshToken(user.id);   // rotate every time
    setRefreshCookie(res, raw);

    res.json({ token, role: user.role, clientId, companyId, employeeId, userId: user.id });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ message: 'Refresh failed' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: req.user.userId } }),
      prisma.user.update({
        where: { id: req.user.userId },
        data:  { refreshToken: null, refreshTokenExpiry: null },
      }),
    ]);
  } catch {
    // best-effort — clear cookie regardless
  }
  clearRefreshCookie(res);
  res.json({ message: 'Logged out' });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'email is required' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const rawToken   = crypto.randomBytes(32).toString('hex');
      const hashedToken = hmacToken(rawToken);   // HMAC instead of plain SHA-256
      const expiry     = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data:  { passwordResetToken: hashedToken, passwordResetExpiry: expiry },
      });

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
      await sendPasswordReset(email, resetUrl);
    }
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Failed to process request' });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ message: 'token and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    const hashedToken = hmacToken(token);
    const user        = await prisma.user.findUnique({ where: { passwordResetToken: hashedToken } });

    if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password:           hashedPassword,
          passwordResetToken: null,
          passwordResetExpiry: null,
          refreshToken:       null,    // revoke all refresh tokens
          refreshTokenExpiry: null,
        },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    clearRefreshCookie(res);
    res.json({ message: 'Password updated. All other devices have been logged out. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// ─── POST /api/auth/sync (desktop-only) ──────────────────────────────────────

router.post('/sync', async (req, res) => {
  if (process.env.APP_MODE !== 'desktop') {
    return res.status(404).json({ message: 'Not found' });
  }

  const { email, password, name, role, firstName, lastName, clientId, companyId, employeeId } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.upsert({
      where:  { email },
      update: {
        password:  hashedPassword,
        name:      name || undefined,
        firstName: firstName || undefined,
        lastName:  lastName || undefined,
        role:      role || undefined,
      },
      create: {
        email,
        password:  hashedPassword,
        name:      name || email,
        firstName: firstName || name || email,
        lastName:  lastName || '',
        role:      role || 'CLIENT_ADMIN',
      },
    });

    if (clientId) {
      await prisma.client.upsert({
        where:  { id: clientId },
        update: {},
        create: { id: clientId, name: name || email },
      });
      await prisma.clientAdmin.upsert({
        where:  { userId: user.id },
        update: { clientId },
        create: { userId: user.id, clientId },
      });
    }

    res.json({ message: 'Credentials synced' });
  } catch (error) {
    console.error('Desktop sync error:', error);
    res.status(500).json({ message: 'Failed to sync credentials' });
  }
});

// ─── POST /api/auth/trial-signup ─────────────────────────────────────────────

router.post('/trial-signup', async (req, res) => {
  const { firstName, lastName, companyName, email, password } = req.body;

  if (!firstName || !lastName || !companyName || !email || !password) {
    return res.status(400).json({ message: 'firstName, lastName, companyName, email, and password are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const client = await prisma.client.create({
      data: { name: companyName.trim() },
    });

    await prisma.trial.create({
      data: {
        clientId: client.id,
        expiresAt,
        employeeCap: 10,
        status: 'ACTIVE',
        onboardingStep: 0,
      },
    });

    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        email,
        password: hashedPassword,
        role: 'CLIENT_ADMIN',
        clientAdmin: { create: { clientId: client.id } },
      },
    });

    const token = signToken({ userId: user.id, clientId: client.id, role: user.role });
    const refreshToken = await rotateRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);

    return res.status(201).json({
      token,
      refreshToken,
      role: user.role,
      clientId: client.id,
      companyId: null,
      name: user.name,
      requiresOnboarding: true,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }
    console.error('[trial-signup]', err);
    return res.status(500).json({ message: 'Failed to create trial account' });
  }
});

module.exports = router;
