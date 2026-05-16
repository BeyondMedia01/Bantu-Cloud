import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { calculatePaye } from '../lib/taxEngine';
import { getSettings } from '../services/settings.service';
import { validateBody } from '../lib/validate';

const EmployeeRateSchema = z.object({
  employeeId: z.string(),
  oldRate: z.number().nonnegative(),
  newRate: z.number().nonnegative(),
});

const BackPayBodySchema = z.object({
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveDate must be YYYY-MM-DD'),
  employeeIds: z.array(z.string()).min(1),
  employeeRates: z.array(EmployeeRateSchema).optional(),
  uniformNewRate: z.number().nonnegative().optional(),
  currency: z.enum(['USD', 'ZiG']).default('USD'),
});

const NegativeRunSchema = z.object({
  sourceRunId: z.string().min(1),
  employeeIds: z.array(z.string()).optional(),
  employeeRates: z.array(EmployeeRateSchema).optional(),
  uniformNewRate: z.number().nonnegative().optional(),
  currency: z.enum(['USD', 'ZiG']).default('USD'),
});

const router = new Hono();

async function getAffectedRuns(companyId: string, effectiveDate: string) {
  const from = new Date(effectiveDate);
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return prisma.payrollRun.findMany({
    where: {
      companyId,
      status: 'COMPLETED' as any,
      runDate: { gte: from, lt: currentMonthStart },
    },
    orderBy: { runDate: 'asc' },
    select: { id: true, runDate: true, currency: true, dualCurrency: true },
  });
}

async function buildRateMap(
  employeeIds: string[],
  companyId: string,
  employeeRates?: { employeeId: string; oldRate: number; newRate: number }[],
  uniformNewRate?: number,
) {
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, companyId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true, baseRate: true, currency: true },
  });

  const rateMap: Record<string, any> = {};
  for (const emp of employees) {
    const custom = employeeRates?.find((r) => r.employeeId === emp.id);
    rateMap[emp.id] = {
      ...emp,
      oldRate: custom ? custom.oldRate : emp.baseRate,
      newRate: custom ? custom.newRate : (uniformNewRate ?? emp.baseRate),
    };
  }
  return rateMap;
}

async function getTaxBrackets(companyId: string, currency: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return [];

  const taxTable = await prisma.taxTable.findFirst({
    where: {
      clientId: company.clientId,
      currency,
      effectiveDate: { lte: new Date() },
      OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
    },
    include: { brackets: true },
    orderBy: { effectiveDate: 'desc' },
  });
  return taxTable?.brackets ?? [];
}

async function calculateBackPay(params: {
  companyId: string;
  effectiveDate: string;
  employeeIds: string[];
  employeeRates?: { employeeId: string; oldRate: number; newRate: number }[];
  uniformNewRate?: number;
  currency: string;
}) {
  const { companyId, effectiveDate, employeeIds, employeeRates, uniformNewRate, currency } = params;
  const runs = await getAffectedRuns(companyId, effectiveDate);

  if (runs.length === 0) {
    return { affectedRuns: [], results: [], summary: { totalEmployees: 0, totalRuns: 0, totalGross: 0, currency } };
  }

  const rateMap = await buildRateMap(employeeIds, companyId, employeeRates, uniformNewRate);
  const taxBrackets = await getTaxBrackets(companyId, 'USD');

  const statutorySettings = await getSettings([
    'AIDS_LEVY_RATE',
    'NSSA_EMPLOYEE_RATE',
    'NSSA_CEILING_USD',
    'MEDICAL_AID_CREDIT_RATE',
  ]);
  const ss = (key: string) => parseFloat(statutorySettings[key] ?? '0');
  const aidsLevyRate = ss('AIDS_LEVY_RATE') / 100;
  const nssaEmployeeRate = ss('NSSA_EMPLOYEE_RATE') / 100;
  const nssaCeiling = ss('NSSA_CEILING_USD');
  const medicalAidCreditRate = ss('MEDICAL_AID_CREDIT_RATE') / 100;

  const runIds = runs.map((r) => r.id);
  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: { in: runIds }, employeeId: { in: employeeIds } },
    select: { employeeId: true, payrollRunId: true, gross: true },
  });

  const payslipIndex: Record<string, Record<string, any>> = {};
  for (const p of payslips) {
    if (!payslipIndex[p.employeeId]) payslipIndex[p.employeeId] = {};
    payslipIndex[p.employeeId][p.payrollRunId] = p;
  }

  const results: any[] = [];
  let totalGross = 0;

  for (const empId of employeeIds) {
    const emp = rateMap[empId];
    if (!emp) continue;

    const diff = emp.newRate - emp.oldRate;

    if (diff <= 0) {
      results.push({
        employeeId: empId,
        name: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        oldRate: emp.oldRate,
        newRate: emp.newRate,
        runBreakdown: [],
        affectedRunCount: 0,
        totalGross: 0,
        taxEstimate: 0,
        netEstimate: 0,
        note: 'No shortfall — new rate ≤ old rate',
      });
      continue;
    }

    const runBreakdown: any[] = [];
    let empGross = 0;

    for (const run of runs) {
      if (!payslipIndex[empId]?.[run.id]) continue;
      empGross += diff;
      runBreakdown.push({ runId: run.id, runDate: run.runDate, shortfall: diff });
    }

    const taxResult = empGross > 0
      ? calculatePaye({
          baseSalary: empGross,
          currency: 'USD',
          taxBrackets: taxBrackets as any,
          aidsLevyRate,
          nssaEmployeeRate,
          nssaCeiling,
          medicalAidCreditRate,
        })
      : { totalPaye: 0, nssaEmployee: 0, netSalary: empGross };

    totalGross += empGross;
    results.push({
      employeeId: empId,
      name: `${emp.firstName} ${emp.lastName}`,
      employeeCode: emp.employeeCode,
      oldRate: emp.oldRate,
      newRate: emp.newRate,
      runBreakdown,
      affectedRunCount: runBreakdown.length,
      totalGross: empGross,
      taxEstimate: taxResult.totalPaye,
      netEstimate: taxResult.netSalary,
    });
  }

  return {
    affectedRuns: runs,
    results,
    summary: {
      totalEmployees: results.filter((r) => r.totalGross > 0).length,
      totalRuns: runs.length,
      totalGross,
      currency,
    },
  };
}

router.post('/', requirePermission('process_payroll'), validateBody(BackPayBodySchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { effectiveDate, employeeIds, employeeRates, uniformNewRate, currency } = c.req.valid('json' as any);

  try {
    const result = await calculateBackPay({ companyId, effectiveDate, employeeIds, employeeRates, uniformNewRate, currency });
    return c.json(result);
  } catch (error: any) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/commit', requirePermission('process_payroll'), validateBody(BackPayBodySchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { effectiveDate, employeeIds, employeeRates, uniformNewRate, currency } = c.req.valid('json' as any);

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return c.json({ message: 'Company not found' }, 404);

    let tc = await prisma.transactionCode.findFirst({
      where: { clientId: company.clientId, code: 'BACK_PAY' },
    });
    if (!tc) {
      tc = await prisma.transactionCode.create({
        data: {
          clientId: company.clientId,
          code: 'BACK_PAY',
          name: 'Back Pay Adjustment',
          description: 'Auto-generated retroactive pay adjustment for prior period rate changes',
          type: 'EARNING',
          taxable: true,
          pensionable: false,
        },
      });
    }

    const runs = await getAffectedRuns(companyId, effectiveDate);
    const rateMap = await buildRateMap(employeeIds, companyId, employeeRates, uniformNewRate);

    const runIds = runs.map((r) => r.id);
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: { in: runIds }, employeeId: { in: employeeIds } },
      select: { employeeId: true, payrollRunId: true },
    });

    const payslipSet: Record<string, Set<string>> = {};
    for (const p of payslips) {
      if (!payslipSet[p.employeeId]) payslipSet[p.employeeId] = new Set();
      payslipSet[p.employeeId].add(p.payrollRunId);
    }

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const createdInputs: any[] = [];

    for (const empId of employeeIds) {
      const emp = rateMap[empId];
      if (!emp) continue;

      const diff = emp.newRate - emp.oldRate;
      if (diff <= 0) continue;

      let totalShortfall = 0;
      let affectedRunCount = 0;

      for (const run of runs) {
        if (payslipSet[empId]?.has(run.id)) {
          totalShortfall += diff;
          affectedRunCount++;
        }
      }

      if (totalShortfall <= 0) continue;

      const amountField = currency === 'ZiG' ? 'employeeZiG' : 'employeeUSD';

      const input = await prisma.payrollInput.create({
        data: {
          employeeId: empId,
          transactionCodeId: tc.id,
          [amountField]: totalShortfall,
          period,
          processed: false,
          notes: `Back pay: ${affectedRunCount} run(s) × ${currency} ${diff.toFixed(2)}/month (effective ${effectiveDate})`,
        },
      });

      createdInputs.push({
        ...input,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        totalShortfall,
        affectedRunCount,
        currency,
      });
    }

    await audit({
      c,
      action: 'BACK_PAY_COMMITTED',
      resource: 'payroll_input',
      details: {
        effectiveDate,
        period,
        currency,
        inputCount: createdInputs.length,
        employees: createdInputs.map((i: any) => ({
          employeeId: i.employeeId,
          name: i.employeeName,
          employeeCode: i.employeeCode,
          totalShortfall: i.totalShortfall,
          affectedRunCount: i.affectedRunCount,
        })),
      },
    });

    return c.json({
      transactionCodeId: tc.id,
      transactionCodeName: tc.name,
      inputs: createdInputs,
      period,
      message: `Created ${createdInputs.length} PayrollInput(s) for period ${period}`,
    });
  } catch (error: any) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/negative-run', requirePermission('process_payroll'), validateBody(NegativeRunSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { sourceRunId, employeeIds: reqEmployeeIds, employeeRates, uniformNewRate, currency } = c.req.valid('json' as any);

  try {
    const sourceRun = await prisma.payrollRun.findUnique({
      where: { id: sourceRunId },
      select: { id: true, companyId: true, status: true, startDate: true, currency: true },
    });
    if (!sourceRun) return c.json({ message: 'Source payroll run not found' }, 404);
    if (sourceRun.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    if (sourceRun.status !== 'COMPLETED') {
      return c.json({ message: 'Only COMPLETED runs can be reversed' }, 400);
    }

    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRunId: sourceRunId,
        ...(reqEmployeeIds?.length && { employeeId: { in: reqEmployeeIds } }),
      },
      select: { employeeId: true, gross: true, paye: true, nssaEmployee: true, netPay: true },
    });

    if (payslips.length === 0) {
      return c.json({ message: 'No payslips found in source run for the given employees' }, 400);
    }

    const employeeIds = payslips.map((p) => p.employeeId);
    const company = await prisma.company.findUnique({ where: { id: sourceRun.companyId } });
    if (!company) return c.json({ message: 'Company not found' }, 404);

    const ensureCode = async (code: string, name: string, description: string) => {
      let tc = await prisma.transactionCode.findFirst({
        where: { clientId: company.clientId, code },
      });
      if (!tc) {
        tc = await prisma.transactionCode.create({
          data: { clientId: company.clientId, code, name, description, type: 'EARNING', taxable: true, pensionable: false },
        });
      }
      return tc;
    };

    const reversalTc = await ensureCode('CORRECTION_REVERSAL', 'Payroll Correction — Reversal', 'Auto-generated reversal of prior-period payslip gross');
    const correctionTc = await ensureCode('CORRECTION_PAY', 'Payroll Correction — Corrected Pay', 'Auto-generated corrected pay for prior-period reversal');

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const rateMap = (employeeRates || uniformNewRate)
      ? await buildRateMap(employeeIds, sourceRun.companyId, employeeRates, uniformNewRate)
      : null;

    const amountField = currency === 'ZiG' ? 'employeeZiG' : 'employeeUSD';
    const negativeInputs: any[] = [];
    const correctionInputs: any[] = [];

    for (const ps of payslips) {
      const reversalInput = await prisma.payrollInput.create({
        data: {
          employeeId: ps.employeeId,
          transactionCodeId: reversalTc.id,
          [amountField]: -(ps.gross),
          period,
          processed: false,
          notes: `Reversal of run ${sourceRunId} gross ${currency} ${ps.gross.toFixed(2)}`,
        },
      });
      negativeInputs.push(reversalInput);

      const emp = rateMap?.[ps.employeeId];
      const correctedGross = emp && emp.newRate > 0
        ? ps.gross * (emp.newRate / (emp.oldRate || emp.newRate))
        : ps.gross;

      const correctionInput = await prisma.payrollInput.create({
        data: {
          employeeId: ps.employeeId,
          transactionCodeId: correctionTc.id,
          [amountField]: correctedGross,
          period,
          processed: false,
          notes: `Correction for run ${sourceRunId} — corrected gross ${currency} ${correctedGross.toFixed(2)}`,
        },
      });
      correctionInputs.push(correctionInput);
    }

    await audit({
      c,
      action: 'BACKPAY_NEGATIVE_RUN_CREATED',
      resource: 'payroll_input',
      details: { sourceRunId, period, currency, reversalCount: negativeInputs.length, correctionCount: correctionInputs.length },
    });

    return c.json({
      sourceRunId,
      period,
      message: `Created ${negativeInputs.length} reversal + ${correctionInputs.length} correction input(s) for period ${period}. Include them in the next payroll run.`,
      negativeInputs,
      correctionInputs,
    });
  } catch (error: any) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
