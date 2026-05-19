import { prisma } from '../lib/prisma';

export interface TrialStatus {
  isActive: boolean;
  isExpired: boolean;
  employeeCount: number;
  employeeCap: number;
  expiresAt: Date | null;
}

export async function getTrialStatus(clientId: string): Promise<TrialStatus | null> {
  const trial = await prisma.$queryRaw<any[]`
    SELECT "expiresAt", "employeeCap", "status" FROM "Trial" WHERE "clientId" = ${clientId} LIMIT 1
  `;

  if (!trial.length) return null;

  const t = trial[0];
  const now = new Date();
  const isExpired = new Date(t.expiresAt) < now;
  const isActive = t.status === 'ACTIVE' && !isExpired;

  const empCount = await prisma.employee.count({ where: { clientId } });

  return {
    isActive,
    isExpired,
    employeeCount: empCount,
    employeeCap: Number(t.employeeCap),
    expiresAt: new Date(t.expiresAt),
  };
}

export async function enforceTrial(clientId: string): Promise<{ allowed: boolean; message?: string }> {
  const trial = await getTrialStatus(clientId);

  if (!trial) return { allowed: true };

  if (!trial.isActive) {
    return {
      allowed: false,
      message: trial.isExpired
        ? 'Your trial has expired. Please upgrade to continue.'
        : 'Trial is not active.',
    };
  }

  if (trial.employeeCount >= trial.employeeCap) {
    return {
      allowed: false,
      message: `Employee cap reached (${trial.employeeCap}). Upgrade your plan to add more employees.`,
    };
  }

  return { allowed: true };
}

export async function enforceTrialOnCompany(companyId: string): Promise<{ allowed: boolean; message?: string }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { clientId: true },
  });

  if (!company) return { allowed: true };

  return enforceTrial(company.clientId);
}