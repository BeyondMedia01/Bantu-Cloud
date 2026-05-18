import { prisma } from '../lib/prisma';
import type { LeaveTxType } from '@prisma/client';

export interface LedgerEntryParams {
  employeeId: string;
  leaveTypeId: string;
  transactionType: LeaveTxType;
  amount: number;
  referenceDocType?: string;
  referenceId?: string;
  description?: string;
  createdBy?: string;
  expiryDate?: Date;
}

export async function getBalance(employeeId: string, leaveTypeId: string): Promise<number> {
  const result = await prisma.leaveTransaction.aggregate({
    where: {
      employeeId,
      leaveTypeId,
      OR: [
        { expiryDate: null },
        { expiryDate: { gt: new Date() } },
      ],
    },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export async function getBalanceByTypeName(employeeId: string, companyId: string, typeName: string): Promise<number> {
  const lt = await prisma.leaveType.findUnique({
    where: { companyId_name: { companyId, name: typeName } },
  });
  if (!lt) return 0;
  return getBalance(employeeId, lt.id);
}

export async function addLedgerEntry(params: LedgerEntryParams): Promise<{ newBalance: number; transaction: Awaited<ReturnType<typeof prisma.leaveTransaction.create>> }> {
  const { employeeId, leaveTypeId, transactionType, amount, ...meta } = params;

  const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
  if (!leaveType) throw new Error(`LeaveType ${leaveTypeId} not found`);

  const currentBalance = await getBalance(employeeId, leaveTypeId);

  if (amount < 0 && !leaveType.allowNegative) {
    const newBalance = currentBalance + amount;
    if (newBalance < 0) {
      throw new Error(`Insufficient leave balance. Available: ${currentBalance}, requested: ${Math.abs(amount)}`);
    }
  }

  if (leaveType.maxAccumulation !== null && leaveType.maxAccumulation > 0 && amount > 0) {
    const cappedAmount = Math.min(amount, leaveType.maxAccumulation - currentBalance);
    if (cappedAmount <= 0) {
      throw new Error(`Maximum accumulation (${leaveType.maxAccumulation}) reached for this leave type`);
    }
  }

  const newBalance = currentBalance + (amount < 0 && leaveType.maxAccumulation !== null && leaveType.maxAccumulation > 0
    ? Math.min(amount, leaveType.maxAccumulation - currentBalance)
    : amount);

  const transaction = await prisma.leaveTransaction.create({
    data: {
      employeeId,
      leaveTypeId,
      transactionType,
      amount: amount < 0 && leaveType.maxAccumulation !== null && leaveType.maxAccumulation > 0
        ? Math.min(amount, leaveType.maxAccumulation - currentBalance)
        : amount,
      balance: newBalance,
      expiryDate: meta.expiryDate,
      referenceDocType: meta.referenceDocType,
      referenceId: meta.referenceId,
      description: meta.description,
      createdBy: meta.createdBy,
    },
  });

  return { newBalance, transaction };
}

export async function reverseTransaction(referenceId: string, reversalType: LeaveTxType = 'ADJUSTMENT'): Promise<void> {
  const original = await prisma.leaveTransaction.findFirst({ where: { referenceId } });
  if (!original) return;

  await addLedgerEntry({
    employeeId: original.employeeId,
    leaveTypeId: original.leaveTypeId,
    transactionType: reversalType,
    amount: -original.amount,
    referenceDocType: original.referenceDocType ?? undefined,
    referenceId: `REVERSAL_${original.id}`,
    description: `Reversal of ${original.transactionType} transaction ${original.id}`,
  });
}

export async function getLedgerHistory(
  employeeId: string,
  leaveTypeId: string,
  opts?: { fromDate?: Date; toDate?: Date; limit?: number }
): Promise<Awaited<ReturnType<typeof prisma.leaveTransaction.findMany>>> {
  const where: Record<string, unknown> = { employeeId, leaveTypeId };
  if (opts?.fromDate) where.transactionDate = { ...where.transactionDate as object, gte: opts.fromDate };
  if (opts?.toDate) where.transactionDate = { ...where.transactionDate as object, lte: opts.toDate };

  return prisma.leaveTransaction.findMany({
    where,
    orderBy: { transactionDate: 'desc' },
    take: opts?.limit ?? 50,
  });
}

export async function processYearEndCarryForward(
  companyId: string,
  fromYear: number,
  toYear: number
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  const leaveTypes = await prisma.leaveType.findMany({ where: { companyId } });
  let processed = 0;

  for (const lt of leaveTypes) {
    const carryForwardLimit = lt.carryForwardDays ?? lt.maxAccumulation ?? 30;

    const employees = await prisma.employee.findMany({
      where: { companyId, dischargeDate: null },
      select: { id: true },
    });

    for (const emp of employees) {
      try {
        const currentBalance = await getBalance(emp.id, lt.id);
        if (currentBalance <= 0) continue;

        const carryForwardAmount = Math.min(currentBalance, carryForwardLimit);

        await addLedgerEntry({
          employeeId: emp.id,
          leaveTypeId: lt.id,
          transactionType: 'CARRY_FORWARD',
          amount: -currentBalance,
          referenceDocType: 'YEAR_END',
          referenceId: `YEAR_END_${fromYear}_${emp.id}_${lt.id}`,
          description: `Expiry of ${fromYear} leave balance`,
        });

        const expiryDate = new Date(toYear, 3, 1);

        await addLedgerEntry({
          employeeId: emp.id,
          leaveTypeId: lt.id,
          transactionType: 'CARRY_FORWARD',
          amount: carryForwardAmount,
          referenceDocType: 'YEAR_END',
          referenceId: `CARRY_FORWARD_${fromYear}_${emp.id}_${lt.id}`,
          description: `Carry forward from ${fromYear}, limited to ${carryForwardLimit} days`,
          expiryDate,
        });

        if (currentBalance > carryForwardLimit) {
          await addLedgerEntry({
            employeeId: emp.id,
            leaveTypeId: lt.id,
            transactionType: 'EXPIRY',
            amount: -(currentBalance - carryForwardAmount),
            referenceDocType: 'YEAR_END',
            referenceId: `EXPIRY_${fromYear}_${emp.id}_${lt.id}`,
            description: `Forfeited ${fromYear} leave exceeding carry forward limit`,
          });
        }

        processed++;
      } catch (err) {
        errors.push(`${emp.id}/${lt.name}: ${(err as Error).message}`);
      }
    }
  }

  return { processed, errors };
}