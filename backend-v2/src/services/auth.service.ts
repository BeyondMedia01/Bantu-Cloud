import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/auth';
import { validateLicense } from '../lib/license';
import { sendPasswordReset } from '../lib/mailer';

const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function register(data: {
  firstName: string;
  lastName: string;
  phone?: string;
  email: string;
  password: string;
  licenseToken: string;
}) {
  const { firstName, lastName, phone, email, password, licenseToken } = data;

  const licenseResult = await validateLicense(licenseToken);
  if (!licenseResult.valid) {
    throw new Error(`Invalid license: ${licenseResult.reason}`);
  }

  const existingAdmin = await prisma.clientAdmin.findFirst({
    where: { clientId: licenseResult.license.clientId },
  });
  if (existingAdmin) {
    throw new Error('A client admin already exists for this license');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const fullName = `${firstName.trim()} ${lastName.trim()}`;

  const user = await prisma.user.create({
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: fullName,
      phone: phone?.trim() || null,
      email,
      password: hashedPassword,
      role: 'CLIENT_ADMIN',
      clientAdmin: { create: { clientId: licenseResult.license.clientId } },
    },
  });

  const token = await signToken({ userId: user.id, email: user.email, role: user.role, clientId: licenseResult.license.clientId });
  return { token, role: user.role, clientId: licenseResult.license.clientId };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      clientAdmin: true,
      employee: { select: { id: true, companyId: true, clientId: true } },
    },
  });

  if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

  // DB-based brute-force lockout (stateless-safe for Workers)
  const prefs = (user.preferences as Record<string, unknown>) || {};
  if (prefs.lockedUntil && new Date(prefs.lockedUntil as string) > new Date()) {
    const remaining = Math.ceil((new Date(prefs.lockedUntil as string).getTime() - Date.now()) / 60000);
    throw Object.assign(new Error(`Account locked. Try again in ${remaining} min.`), { status: 429 });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    // Atomic JSON update prevents race conditions from concurrent requests
    await prisma.$executeRaw`
      UPDATE "User"
      SET preferences = CASE
        WHEN COALESCE((preferences->>'loginAttempts')::int, 0) + 1 >= ${MAX_LOGIN_ATTEMPTS}
        THEN preferences
          || jsonb_build_object('lockedUntil', ${new Date(Date.now() + LOCKOUT_MS).toISOString()})
          || jsonb_build_object('loginAttempts', 0)
        ELSE preferences
          || jsonb_build_object('loginAttempts', COALESCE((preferences->>'loginAttempts')::int, 0) + 1)
      END
      WHERE email = ${email}
    `;
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  // Clear lockout on successful login
  await prisma.$executeRaw`
    UPDATE "User"
    SET preferences = preferences - 'loginAttempts' - 'lockedUntil'
    WHERE email = ${email}
  `;

  const clientId = user.clientAdmin?.clientId ?? user.employee?.clientId ?? null;
  const companyId = user.employee?.companyId ?? null;
  const employeeId = user.employee?.id ?? null;

  const token = await signToken({ userId: user.id, email: user.email, role: user.role, clientId: clientId ?? undefined, companyId: companyId ?? undefined, employeeId: employeeId ?? undefined });
  return { token, role: user.role, clientId, companyId, employeeId, name: user.name ?? 'User' };
}

export async function forgotPassword(email: string, frontendUrl?: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: hashedToken, passwordResetExpiry: expiry },
    });

    const url = frontendUrl || 'https://payroll.thinkbantu.com';
    const resetUrl = `${url}/reset-password?token=${rawToken}`;
    await sendPasswordReset(email, resetUrl);
  }
}

export async function resetPassword(token: string, password: string) {
  const hashedToken = createHash('sha256').update(token).digest('hex');
  const user = await prisma.user.findUnique({ where: { passwordResetToken: hashedToken } });

  if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
    throw Object.assign(new Error('Reset link is invalid or has expired'), { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword, passwordResetToken: null, passwordResetExpiry: null },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
}

export async function trialSignup(data: {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  password: string;
}) {
  const { firstName, lastName, companyName, email, password } = data;

  const hashedPassword = await bcrypt.hash(password, 12);
  const fullName = `${firstName.trim()} ${lastName.trim()}`;

  const client = await prisma.client.create({
    data: {
      name: companyName.trim(),
      companies: {
        create: { name: companyName.trim() },
      },
    },
    include: { companies: { take: 1 } },
  });

  const company = client.companies[0];

  const user = await prisma.user.create({
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: fullName,
      email,
      password: hashedPassword,
      role: 'CLIENT_ADMIN',
      clientAdmin: { create: { clientId: client.id } },
    },
  });

  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  await prisma.licenseToken.create({
    data: {
      clientId: client.id,
      token,
      expiresAt,
      employeeCap: 5,
      active: true,
    },
  });

  const jwt = await signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    clientId: client.id,
    companyId: company.id,
  });

  return { token: jwt, role: user.role, clientId: client.id, companyId: company.id, name: fullName };
}

export async function syncCredentials(data: {
  email: string;
  password: string;
  name?: string;
  role?: string;
  firstName?: string;
  lastName?: string;
  clientId?: string;
  companyId?: string;
  employeeId?: string;
}) {
  const hashedPassword = await bcrypt.hash(data.password, 12);

  await prisma.user.upsert({
    where: { email: data.email },
    update: {
      password: hashedPassword,
      name: data.name || undefined,
      firstName: data.firstName || undefined,
      lastName: data.lastName || undefined,
      role: data.role as UserRole | undefined || undefined,
    },
    create: {
      email: data.email,
      password: hashedPassword,
      name: data.name || data.email,
      firstName: data.firstName || data.name || data.email,
      lastName: data.lastName || '',
      role: (data.role || 'CLIENT_ADMIN') as UserRole,
    },
  });
}
