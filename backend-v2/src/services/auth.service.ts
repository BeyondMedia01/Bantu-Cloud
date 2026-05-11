import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/auth';
import { validateLicense } from '../lib/license';
import { sendPasswordReset } from '../lib/mailer';

const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;
const loginFailures = new Map<string, { count: number; lockedUntil: number | null }>();

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
  const failure = loginFailures.get(email);
  if (failure?.lockedUntil && failure.lockedUntil > Date.now()) {
    const remaining = Math.ceil((failure.lockedUntil - Date.now()) / 60000);
    throw new Object.assign(new Error(`Account temporarily locked. Try again in ${remaining} minute(s).`), { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      clientAdmin: true,
      employee: { select: { id: true, companyId: true, clientId: true } },
    },
  });

  if (!user) throw new Object.assign(new Error('Invalid credentials'), { status: 401 });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const rec = loginFailures.get(email) || { count: 0, lockedUntil: null };
    rec.count += 1;
    if (rec.count >= MAX_LOGIN_ATTEMPTS) {
      rec.lockedUntil = Date.now() + LOCKOUT_MS;
      rec.count = 0;
    }
    loginFailures.set(email, rec);
    throw new Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  loginFailures.delete(email);

  const clientId = user.clientAdmin?.clientId ?? user.employee?.clientId ?? null;
  const companyId = user.employee?.companyId ?? null;
  const employeeId = user.employee?.id ?? null;

  const token = await signToken({ userId: user.id, email: user.email, role: user.role, clientId, companyId, employeeId });
  return { token, role: user.role, clientId, companyId, employeeId, name: user.name ?? 'User' };
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: hashedToken, passwordResetExpiry: expiry },
    });

    const resetUrl = `https://app.bantu.io/reset-password?token=${rawToken}`;
    await sendPasswordReset(email, resetUrl);
  }
}

export async function resetPassword(token: string, password: string) {
  const hashedToken = createHash('sha256').update(token).digest('hex');
  const user = await prisma.user.findUnique({ where: { passwordResetToken: hashedToken } });

  if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
    throw new Object.assign(new Error('Reset link is invalid or has expired'), { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, passwordResetToken: null, passwordResetExpiry: null },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
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
      role: data.role || undefined,
    },
    create: {
      email: data.email,
      password: hashedPassword,
      name: data.name || data.email,
      firstName: data.firstName || data.name || data.email,
      lastName: data.lastName || '',
      role: data.role || 'CLIENT_ADMIN',
    },
  });
}
