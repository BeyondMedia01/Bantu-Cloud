import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { calculatePaye, calculateSplitSalaryPaye, grossUpNet } from '../lib/taxEngine';
import { getSettings } from '../services/settings.service';
import { audit } from '../lib/audit';
import { denyUnlessCompany } from '../lib/ownership';
import { getYtdStartDate } from '../lib/ytdCalculator';
import { validateBody } from '../lib/validate';
import { processEmployee, type EngineSettings, type FdsYtd } from '../lib/payrollEngine';

const PreviewSchema = z.object({
  inputs: z.array(z.object({
    employeeId: z.string(),
    transactionCodeId: z.string(),
    amount: z.union([z.number(), z.string()]),
    units: z.number().optional(),
    employeeUSD: z.number().optional(),
    employeeZiG: z.number().optional(),
    notes: z.string().optional(),
  })).min(1),
  currency: z.enum(['USD', 'ZiG']).default('USD'),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM').optional(),
});

const ProcessSchema = z.object({
  adjustments: z.record(z.object({
    taxableBenefits: z.number().optional(),
    overtimeAmount: z.number().optional(),
    bonus: z.number().optional(),
    severanceAmount: z.number().optional(),
    pensionContribution: z.number().optional(),
    medicalAid: z.number().optional(),
  })).optional().default({}),
});

const router = new Hono();

router.post('/preview', requirePermission('process_payroll'), validateBody(PreviewSchema), async (c) => {
  const { inputs, currency, period } = c.req.valid('json' as any);

  try {
    const clientId = c.get('clientId');
    const companyId = c.get('companyId');

    const overlappingClosedCal = clientId ? await prisma.payrollCalendar.findFirst({
      where: {
        clientId,
        isClosed: true,
        startDate: { lte: new Date() },
        ...(period && {
          startDate: { lte: new Date(period + '-31') },
          endDate: { gte: new Date(period + '-01') },
        }),
      },
    }) : null;
    if (overlappingClosedCal) return c.json({ message: 'This period is closed' }, 400);

    const tcIds = [...new Set<string>(inputs.map((i: any) => i.transactionCodeId))];
    const tcs = await prisma.transactionCode.findMany({
      where: { id: { in: tcIds } },
      select: { id: true, type: true, taxable: true, preTax: true, name: true, code: true, incomeCategory: true },
    });
    const tcMap = Object.fromEntries(tcs.map((t: any) => [t.id, t]));

    const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;

    const taxTable = company ? await (async () => {
      const active = await prisma.taxTable.findFirst({
        where: { clientId: company.clientId, currency: 'USD', isActive: true },
        include: { brackets: true },
      });
      if (active) return active;
      return prisma.taxTable.findFirst({
        where: {
          clientId: company.clientId, currency: 'USD',
          effectiveDate: { lte: new Date() },
          OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
        },
        include: { brackets: true },
        orderBy: { effectiveDate: 'desc' },
      });
    })() : null;

    const taxBrackets = taxTable?.brackets ?? [];
    const annualBrackets = taxBrackets.length > 0 && (taxTable?.isAnnual ?? true);

    if (!taxBrackets || taxBrackets.length === 0) {
      return c.json({ error: 'No tax brackets configured for this company' }, 422);
    }

    const previewSettings = await getSettings([
      'AIDS_LEVY_RATE', 'MEDICAL_AID_CREDIT_RATE', 'NSSA_EMPLOYEE_RATE',
      'NSSA_CEILING_USD', 'NSSA_CEILING_ZIG',
    ]);
    const ps = (key: string) => parseFloat(previewSettings[key] ?? '0');

    const previewAidsLevyRate = ps('AIDS_LEVY_RATE') / 100;
    const previewMedicalAidCreditRate = ps('MEDICAL_AID_CREDIT_RATE') / 100;
    const previewNssaEmployeeRate = ps('NSSA_EMPLOYEE_RATE') / 100;
    const previewNssaCeilingUSD = ps('NSSA_CEILING_USD');
    const previewNssaCeiling = currency === 'ZiG' ? ps('NSSA_CEILING_ZIG') : previewNssaCeilingUSD;

    const byEmployee: Record<string, any[]> = {};
    for (const inp of inputs) {
      if (!byEmployee[inp.employeeId]) byEmployee[inp.employeeId] = [];
      byEmployee[inp.employeeId].push(inp);
    }

    const results: any[] = [];
    for (const [empId, empInputs] of Object.entries(byEmployee)) {
      let earnings = 0, preTaxDeductions = 0, postTaxDeductions = 0, medicalAidAmt = 0;

      for (const inp of empInputs as any[]) {
        const tc = tcMap[inp.transactionCodeId];
        const amt = parseFloat(inp.amount) || 0;

        const tcName = tc?.name || '';
        const tcCode = tc?.code || '';
        const isMedAid = tc && tc.type === 'DEDUCTION' && tc.preTax === false &&
          (tc.incomeCategory === 'MEDICAL_AID' ||
            /medical\s*aid|med\s*aid/i.test(tcName) ||
            /MED_AID|MEDICAL_AID/i.test(tcCode) ||
            (tcName.toLowerCase().includes('medical') && /^\d+$/.test(tcCode)));

        if (!tc || tc.type === 'EARNING' || tc.type === 'BENEFIT') {
          earnings += amt;
        } else if (tc.type === 'DEDUCTION') {
          if (tc.preTax) preTaxDeductions += amt;
          else if (isMedAid) medicalAidAmt += amt;
          else postTaxDeductions += amt;
        }
      }

      const gross = Math.max(0, earnings);
      const taxResult = calculatePaye({
        baseSalary: gross,
        pensionContribution: preTaxDeductions,
        currency,
        taxBrackets,
        annualBrackets,
        nssaEmployeeRate: previewNssaEmployeeRate,
        nssaCeiling: previewNssaCeiling,
        aidsLevyRate: previewAidsLevyRate,
        medicalAidCreditRate: previewMedicalAidCreditRate,
        medicalAid: medicalAidAmt,
      });

      results.push({
        employeeId: empId,
        gross,
        paye: taxResult.payeBeforeLevy,
        aidsLevy: taxResult.aidsLevy,
        nssa: taxResult.nssaEmployee,
        net: Math.max(0, taxResult.netSalary - postTaxDeductions),
      });
    }

    return c.json({ data: results });
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/:runId/process', requirePermission('process_payroll'), validateBody(ProcessSchema), async (c) => {
  try {
    const companyId = c.get('companyId');
    const clientId = c.get('clientId');
    const runId = c.req.param('runId');
    const { adjustments } = c.req.valid('json' as any);

    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { company: true, payrollCalendar: true },
    });
    if (!run) return c.json({ message: 'Payroll run not found' }, 404);
    if (!companyId || run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

    if (run.payrollCalendar?.isClosed) {
      return c.json({ message: 'Cannot process payroll for a closed period' }, 400);
    }
    const overlappingClosedCal = run.company?.clientId ? await prisma.payrollCalendar.findFirst({
      where: {
        clientId: run.company.clientId,
        isClosed: true,
        startDate: { lte: run.endDate },
        endDate: { gte: run.startDate },
      },
    }) : null;
    if (overlappingClosedCal) {
      return c.json({ message: 'A closed calendar period overlaps with this payroll run dates' }, 400);
    }

    if (!['DRAFT', 'APPROVED', 'ERROR', 'COMPLETED'].includes(run.status)) {
      return c.json({ message: 'Only DRAFT, APPROVED, ERROR, or COMPLETED runs can be processed' }, 400);
    }

    const fetchTaxTable = async (clientId: string, currency: string, date: Date) => {
      const active = await prisma.taxTable.findFirst({
        where: { clientId, currency, isActive: true },
        include: { brackets: true },
      });
      if (active) return active;
      const matched = await prisma.taxTable.findFirst({
        where: {
          clientId, currency,
          effectiveDate: { lte: date },
          OR: [{ expiryDate: null }, { expiryDate: { gte: date } }],
        },
        include: { brackets: true },
        orderBy: { effectiveDate: 'desc' },
      });
      if (matched) return matched;
      return prisma.taxTable.findFirst({
        where: { clientId, currency },
        include: { brackets: true },
        orderBy: { createdAt: 'desc' },
      });
    };

    const taxTableUSD = await fetchTaxTable(run.company.clientId, 'USD', run.startDate);
    const taxBracketsUSD = taxTableUSD?.brackets ?? [];
    const annualBracketsUSD = taxBracketsUSD.length > 0 && (taxTableUSD?.isAnnual ?? true);

    const taxTableZIG = await fetchTaxTable(run.company.clientId, 'ZiG', run.startDate);
    const taxBracketsZIG = taxTableZIG?.brackets ?? [];
    const annualBracketsZIG = taxBracketsZIG.length > 0 && (taxTableZIG?.isAnnual ?? true);

    const taxBrackets = run.currency === 'ZiG' ? taxBracketsZIG : taxBracketsUSD;
    const annualBrackets = run.currency === 'ZiG' ? annualBracketsZIG : annualBracketsUSD;

    if (taxBracketsUSD.length === 0) {
      return c.json({
        message: 'No active USD tax table found. Configure and activate a USD tax table under Tax Configuration before processing payroll.',
      }, 422);
    }
    if (run.currency === 'ZiG' && taxBracketsZIG.length === 0) {
      return c.json({
        message: 'No active ZiG tax table found. Configure and activate a ZiG tax table under Tax Configuration before processing this ZiG payroll run.',
      }, 422);
    }

    const settings = await getSettings([
      'NSSA_CEILING_USD', 'NSSA_CEILING_ZIG',
      'BONUS_EXEMPTION_USD', 'BONUS_EXEMPTION_ZIG',
      'SEVERANCE_EXEMPTION_USD', 'SEVERANCE_EXEMPTION_ZIG',
      'WCIF_RATE', 'SDF_RATE',
      'NSSA_EMPLOYEE_RATE', 'NSSA_EMPLOYER_RATE',
      'NSSA_EMPLOYEE_RATE_ZIG', 'NSSA_EMPLOYER_RATE_ZIG',
      'AIDS_LEVY_RATE', 'MEDICAL_AID_CREDIT_RATE',
      'PENSION_CAP_USD', 'PENSION_CAP_ZIG',
      'LOAN_PRESCRIBED_RATE_USD', 'LOAN_PRESCRIBED_RATE_ZIG',
      'ELDERLY_TAX_CREDIT_USD', 'ELDERLY_TAX_CREDIT_ZIG',
      'VEHICLE_BENEFIT_CC_1500_USD', 'VEHICLE_BENEFIT_CC_2000_USD', 'VEHICLE_BENEFIT_ABOVE_2000_USD',
      'VEHICLE_BENEFIT_CC_1500_ZIG', 'VEHICLE_BENEFIT_CC_2000_ZIG', 'VEHICLE_BENEFIT_ABOVE_2000_ZIG',
      'ZIMDEF_RATE',
      'WORKING_DAYS_PER_PERIOD', 'WORKING_DAYS_PER_MONTH',
    ]);
    const s = (key: string) => parseFloat(settings[key] ?? '0');

    const nssaCeilingUSD = s('NSSA_CEILING_USD');
    const effectiveNssaCeilingZIG = s('NSSA_CEILING_ZIG');
    const nssaCeiling = run.currency === 'ZiG' ? effectiveNssaCeilingZIG : nssaCeilingUSD;

    const bonusExemptionUSD = s('BONUS_EXEMPTION_USD');
    const bonusExemptionZIG = s('BONUS_EXEMPTION_ZIG');
    const bonusExemption = run.currency === 'ZiG' ? bonusExemptionZIG : bonusExemptionUSD;

    const severanceExemptionUSD = s('SEVERANCE_EXEMPTION_USD');
    const severanceExemptionZIG = s('SEVERANCE_EXEMPTION_ZIG');
    const severanceExemption = run.currency === 'ZiG' ? severanceExemptionZIG : severanceExemptionUSD;

    const globalWcifRate = s('WCIF_RATE') / 100;
    const globalSdfRate = s('SDF_RATE') / 100;
    const wcifRate = run.company.wcifRate != null ? run.company.wcifRate / 100 : globalWcifRate;
    const sdfRate = run.company.sdfRate != null ? run.company.sdfRate / 100 : globalSdfRate;

    const nssaEmployeeRateUSD = s('NSSA_EMPLOYEE_RATE') / 100;
    const nssaEmployerRateUSD = s('NSSA_EMPLOYER_RATE') / 100;
    const nssaEmployeeRateZIG = (s('NSSA_EMPLOYEE_RATE_ZIG') || s('NSSA_EMPLOYEE_RATE')) / 100;
    const nssaEmployerRateZIG = (s('NSSA_EMPLOYER_RATE_ZIG') || s('NSSA_EMPLOYER_RATE')) / 100;
    const nssaEmployeeRate = run.currency === 'ZiG' ? nssaEmployeeRateZIG : nssaEmployeeRateUSD;
    const nssaEmployerRate = run.currency === 'ZiG' ? nssaEmployerRateZIG : nssaEmployerRateUSD;

    const aidsLevyRate = s('AIDS_LEVY_RATE') / 100;
    const medicalAidCreditRate = s('MEDICAL_AID_CREDIT_RATE') / 100;

    const pensionCapUSD = s('PENSION_CAP_USD');
    const pensionCapZIG = s('PENSION_CAP_ZIG');
    const monthlyPensionCapUSD = pensionCapUSD > 0 ? Math.round((pensionCapUSD / 12) * 100) / 100 : null;
    const monthlyPensionCapZIG = pensionCapZIG > 0 ? Math.round((pensionCapZIG / 12) * 100) / 100 : null;

    const prescribedRateUSD = s('LOAN_PRESCRIBED_RATE_USD');
    const prescribedRateZIG = s('LOAN_PRESCRIBED_RATE_ZIG');

    const elderlyCreditUSD = s('ELDERLY_TAX_CREDIT_USD');
    const elderlyCreditZIG = s('ELDERLY_TAX_CREDIT_ZIG');

    const vehicleBenefitTable: Record<string, Record<string, number>> = {
      USD: {
        UP_TO_1500CC: s('VEHICLE_BENEFIT_CC_1500_USD'),
        CC_1501_TO_2000: s('VEHICLE_BENEFIT_CC_2000_USD'),
        ABOVE_2000CC: s('VEHICLE_BENEFIT_ABOVE_2000_USD'),
      },
      ZiG: {
        UP_TO_1500CC: s('VEHICLE_BENEFIT_CC_1500_ZIG'),
        CC_1501_TO_2000: s('VEHICLE_BENEFIT_CC_2000_ZIG'),
        ABOVE_2000CC: s('VEHICLE_BENEFIT_ABOVE_2000_ZIG'),
      },
    };
    const globalZimdefRate = s('ZIMDEF_RATE') / 100;
    const zimdefRate = run.company.zimdefRate != null ? run.company.zimdefRate / 100 : globalZimdefRate;

    const workingDaysPerPeriodDefault = s('WORKING_DAYS_PER_PERIOD') || s('WORKING_DAYS_PER_MONTH');

    console.log(`[PAYROLL] Processing run ${runId} for company ${companyId}`);

    const employees = await prisma.employee.findMany({
      where: { companyId: run.companyId },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        baseRate: true, currency: true, taxMethod: true,
        taxDirectivePerc: true, taxDirectiveAmt: true,
        taxDirectiveEffective: true, taxDirectiveExpiry: true,
        taxCredits: true,
        dateOfBirth: true, dischargeDate: true,
        hoursPerPeriod: true, daysPerPeriod: true,
        paymentBasis: true, rateSource: true,
        necGradeId: true, gradeId: true,
        splitUsdPercent: true, splitZigMode: true, splitZigValue: true, motorVehicleBenefit: true,
        vehicleEngineCategory: true,
        grossingUp: true,
        leaveBalance: true, leaveTaken: true,
        necGrade: { select: { id: true, minRate: true, necLevyRate: true } },
      },
    });

    if (employees.length === 0) {
      return c.json({ message: 'No employees found for this company' }, 400);
    }

    if ((run.dualCurrency || run.currency === 'ZiG') && !(run.exchangeRate > 1)) {
      console.warn(`[PAYROLL] Run ${run.id} is ZiG/dual but exchangeRate is ${run.exchangeRate} — falling back to 1. All ZiG conversions will be wrong.`);
    }
    const xr = (run.exchangeRate > 0) ? run.exchangeRate : 1;

    const runPeriod = `${new Date(run.startDate).getFullYear()}-${String(new Date(run.startDate).getMonth() + 1).padStart(2, '0')}`;
    const allInputs = await prisma.payrollInput.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        OR: [
          { payrollRunId: run.id },
          { payrollRunId: null, period: { lte: runPeriod }, processed: false },
        ],
      },
      include: { transactionCode: { select: { type: true, taxable: true, preTax: true, affectsNssa: true, affectsPaye: true, name: true, code: true, incomeCategory: true, defaultValue: true, deemedBenefitPercent: true } } },
    });
    const inputsByEmployee: Record<string, any[]> = {};
    for (const inp of allInputs) {
      (inputsByEmployee[inp.employeeId] = inputsByEmployee[inp.employeeId] || []).push(inp);
    }

    const employeeIds = employees.map((e) => e.id);

    const allSalaryDefaults = await prisma.employeeTransaction.findMany({
      where: {
        employeeId: { in: employeeIds },
        isRecurring: true,
        effectiveFrom: { lte: run.endDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.startDate } }],
      },
      include: { transactionCode: { select: { type: true, taxable: true, preTax: true, affectsNssa: true, affectsPaye: true, name: true, code: true, incomeCategory: true, defaultValue: true, deemedBenefitPercent: true } } },
    });

    const coveredKeys = new Set(allInputs.map((i) => `${i.employeeId}:${i.transactionCodeId}`));

    const latestDefaultByKey: Record<string, any> = {};
    for (const sd of allSalaryDefaults) {
      const key = `${sd.employeeId}:${sd.transactionCodeId}`;
      if (!latestDefaultByKey[key] ||
        new Date(sd.effectiveFrom) > new Date(latestDefaultByKey[key].effectiveFrom)) {
        latestDefaultByKey[key] = sd;
      }
    }

    const defaultsByEmployee: Record<string, any[]> = {};
    for (const sd of Object.values(latestDefaultByKey)) {
      const key = `${sd.employeeId}:${sd.transactionCodeId}`;
      if (coveredKeys.has(key)) continue;
      (defaultsByEmployee[sd.employeeId] = defaultsByEmployee[sd.employeeId] || []).push(sd);
    }

    const allDueRepayments = await prisma.loanRepayment.findMany({
      where: {
        OR: [
          { status: 'UNPAID' },
          { payrollRunId: run.id },
        ],
        dueDate: { lte: new Date(run.endDate) },
        loan: { employeeId: { in: employeeIds }, status: { in: ['ACTIVE', 'PAID_OFF'] }, repaymentMethod: 'SALARY_DEDUCTION' },
      },
      include: { loan: { select: { id: true, employeeId: true } } },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
    const repaymentsByEmployee: Record<string, any[]> = {};
    for (const rep of allDueRepayments) {
      const empId = rep.loan.employeeId;
      (repaymentsByEmployee[empId] = repaymentsByEmployee[empId] || []).push(rep);
    }

    const affectedLoanIds = [...new Set(allDueRepayments.map((r: any) => r.loanId))];
    const remainingRepaymentCounts: Record<string, number> = {};
    if (affectedLoanIds.length > 0) {
      const dueRepaymentIds = new Set(allDueRepayments.map((r: any) => r.id));
      const allUnpaid = await prisma.loanRepayment.findMany({
        where: { loanId: { in: affectedLoanIds }, status: 'UNPAID' },
        select: { id: true, loanId: true },
      });
      for (const loanId of affectedLoanIds) {
        const remaining = allUnpaid.filter((r: any) => r.loanId === loanId && !dueRepaymentIds.has(r.id));
        remainingRepaymentCounts[loanId] = remaining.length;
      }
    }

    const allActiveLoans = await prisma.loan.findMany({
      where: { employeeId: { in: employeeIds }, status: 'ACTIVE' },
      include: { repayments: { where: { status: 'PAID' } } },
    });
    const loansByEmployee: Record<string, any[]> = {};
    for (const loan of allActiveLoans) {
      loansByEmployee[loan.employeeId] = loansByEmployee[loan.employeeId] || [];
      loansByEmployee[loan.employeeId].push(loan);
    }

    const UNPAID_LEAVE_TYPES = ['UNPAID', 'UNPAID_SICK', 'UNPAID_MATERNITY'];

    const activeLeaveRecords = await prisma.leaveRecord.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        type: { in: UNPAID_LEAVE_TYPES },
        startDate: { lte: new Date(run.endDate) },
        endDate: { gte: new Date(run.startDate) },
      },
      select: { employeeId: true, type: true, totalDays: true },
    });
    const unpaidLeaveByEmployee: Record<string, any> = {};
    for (const rec of activeLeaveRecords) {
      unpaidLeaveByEmployee[rec.employeeId] = rec;
    }

    const fdsAvgEmpIds = employees
      .filter((e) => e.taxMethod === 'FDS_AVERAGE')
      .map((e) => e.id);

    const fdsYtdByEmployee: Record<string, any> = {};
    if (fdsAvgEmpIds.length > 0) {
      const firstRunRecord = await prisma.payrollRun.findFirst({
        where: { companyId: run.companyId },
        orderBy: { startDate: 'asc' },
        select: { startDate: true },
      });
      const yearStart = getYtdStartDate(run.startDate, firstRunRecord?.startDate ?? null);
      const ytdPayslips = await prisma.payslip.findMany({
        where: {
          employeeId: { in: fdsAvgEmpIds },
          payrollRun: {
            companyId: run.companyId,
            status: 'COMPLETED',
            startDate: { gte: yearStart, lt: new Date(run.startDate) },
          },
        },
        select: {
          employeeId: true, gross: true,
          exemptBonus: true, exemptBonusUSD: true, exemptBonusZIG: true,
          exemptSeverance: true, exemptSeveranceUSD: true, exemptSeveranceZIG: true, medicalAidCredit: true,
          payrollRun: { select: { startDate: true } },
        },
      });
      for (const ps of ytdPayslips) {
        const rec = (fdsYtdByEmployee[ps.employeeId] ??= {
          cumGross: 0,
          uniqueMonths: new Set(),
          cumExemptBonus: 0,
          cumExemptBonusUSD: 0,
          cumExemptBonusZIG: 0,
          cumExemptSeverance: 0,
          cumExemptSeveranceUSD: 0,
          cumExemptSeveranceZIG: 0,
        });
        rec.cumGross += ps.gross ?? 0;
        if (ps.payrollRun?.startDate) {
          const d = new Date(ps.payrollRun.startDate);
          rec.uniqueMonths.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
        }
        rec.cumExemptBonus += ps.exemptBonus || 0;
        rec.cumExemptBonusUSD += ps.exemptBonusUSD || 0;
        rec.cumExemptBonusZIG += ps.exemptBonusZIG || 0;
        rec.cumExemptSeverance += ps.exemptSeverance || 0;
        rec.cumExemptSeveranceUSD += ps.exemptSeveranceUSD || 0;
        rec.cumExemptSeveranceZIG += ps.exemptSeveranceZIG || 0;
      }
    }

    const engineSettings: EngineSettings = {
      nssaCeilingUSD, nssaCeilingZIG: effectiveNssaCeilingZIG,
      bonusExemptionUSD, bonusExemptionZIG,
      severanceExemptionUSD, severanceExemptionZIG,
      wcifRate, sdfRate,
      nssaEmployeeRateUSD, nssaEmployerRateUSD,
      nssaEmployeeRateZIG, nssaEmployerRateZIG,
      aidsLevyRate, medicalAidCreditRate,
      monthlyPensionCapUSD, monthlyPensionCapZIG,
      prescribedRateUSD, prescribedRateZIG,
      elderlyCreditUSD, elderlyCreditZIG,
      vehicleBenefitTable,
      zimdefRate, workingDaysPerPeriodDefault,
    };

    const runContext = {
      id: run.id, currency: run.currency, dualCurrency: run.dualCurrency,
      exchangeRate: xr, startDate: run.startDate, endDate: run.endDate,
      company: run.company,
      taxBracketsUSD, taxBracketsZIG: taxBracketsZIG,
      annualBracketsUSD, annualBracketsZIG,
    };

    const payslipData: any[] = [];
    const payrollTxData: any[] = [];
    const now = new Date();
    const appliedRepaymentIds = new Set<string>();

    for (const emp of employees) {
      const adj = adjustments[emp.id] || {};
      const empInputs = inputsByEmployee[emp.id] || [];
      const empDefaults = defaultsByEmployee[emp.id] || [];
      const empRepayments = repaymentsByEmployee[emp.id] || [];
      const empLoans = loansByEmployee[emp.id] || [];
      const unpaidLeave = unpaidLeaveByEmployee[emp.id];
      const ytd: FdsYtd = fdsYtdByEmployee[emp.id] || {
        cumGross: 0, uniqueMonths: new Set<string>(),
        cumExemptBonus: 0, cumExemptBonusUSD: 0, cumExemptBonusZIG: 0,
        cumExemptSeverance: 0, cumExemptSeveranceUSD: 0, cumExemptSeveranceZIG: 0,
      };

      const result = processEmployee({
        emp, run: runContext, adj, empInputs, empDefaults, empRepayments, empLoans,
        unpaidLeave, ytd, settings: engineSettings,
      });

      payslipData.push(result.payslip);
      payrollTxData.push(...result.transactions);
      for (const id of result.appliedRepaymentIds) appliedRepaymentIds.add(id);
    }


    const paidOffLoanIds = affectedLoanIds.filter((loanId: string) => {
      if (remainingRepaymentCounts[loanId] !== 0) return false;
      return allDueRepayments.filter((r: any) => r.loanId === loanId).every((r: any) => appliedRepaymentIds.has(r.id));
    });

    const linkedRepaymentIds = allDueRepayments.filter((r: any) => r.payrollRunId === run.id).map((r: any) => r.id);
    if (linkedRepaymentIds.length > 0) {
      await prisma.loanRepayment.updateMany({
        where: { id: { in: linkedRepaymentIds } },
        data: { status: 'UNPAID', paidDate: null, payrollRunId: null },
      });

      const loanIdsToReset = [...new Set(allDueRepayments.filter((r: any) => r.payrollRunId === run.id).map((r: any) => r.loanId))];
      await prisma.loan.updateMany({
        where: { id: { in: loanIdsToReset } },
        data: { status: 'ACTIVE' },
      });
    }

    const locked = await prisma.payrollRun.updateMany({
      where: { id: run.id, status: { in: ['DRAFT', 'APPROVED', 'ERROR', 'COMPLETED'] } },
      data: { status: 'PROCESSING' },
    });
    if (locked.count === 0) {
      throw new Error('Payroll run is already being processed by another request');
    }

    // Validate payslip data for NaN/Infinity before writing
    const invalidPayslips = payslipData.filter((p: any) =>
      Object.values(p).some((v) => typeof v === 'number' && !isFinite(v))
    );
    if (invalidPayslips.length > 0) {
      const empIds = invalidPayslips.map((p: any) => p.employeeId).join(', ');
      console.error(`[PAYROLL] Invalid (NaN/Inf) values in payslipData for employees: ${empIds}`, JSON.stringify(invalidPayslips[0]));
      throw new Error(`Calculation produced invalid values for employees: ${empIds}. Check employee salary configuration.`);
    }

    console.log(`[PAYROLL] Writing ${payslipData.length} payslips and ${payrollTxData.length} transactions`);

    await prisma.payslip.deleteMany({ where: { payrollRunId: run.id } });
    await prisma.payrollTransaction.deleteMany({ where: { payrollRunId: run.id } });

    for (const d of payslipData) {
      await prisma.payslip.create({ data: d });
    }
    for (const d of payrollTxData) {
      await prisma.payrollTransaction.create({ data: d });
    }

    if (allInputs.length > 0) {
      const idsToProcess = allInputs.filter((i: any) => i.duration !== 'Indefinite').map((i: any) => i.id);
      if (idsToProcess.length > 0) {
        await prisma.payrollInput.updateMany({
          where: { id: { in: idsToProcess } },
          data: { processed: true, payrollRunId: run.id },
        });
      }
    }

    if (appliedRepaymentIds.size > 0) {
      await prisma.loanRepayment.updateMany({
        where: { id: { in: [...appliedRepaymentIds] } },
        data: { status: 'PAID', paidDate: now, payrollRunId: run.id },
      });
    }

    if (paidOffLoanIds.length > 0) {
      await prisma.loan.updateMany({
        where: { id: { in: paidOffLoanIds } },
        data: { status: 'PAID_OFF' },
      });
    }

    await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'COMPLETED' } });
    const resultCount = payslipData.length;

    await audit({
      c,
      action: 'PAYROLL_RUN_PROCESSED',
      resource: 'payroll_run',
      resourceId: run.id,
      details: { employeeCount: resultCount, currency: run.currency },
    });

    return c.json({ message: 'Payroll processed successfully', runId: run.id, count: resultCount });
  } catch (error) {
    await prisma.payrollRun.update({
      where: { id: c.req.param('runId') },
      data: { status: 'ERROR' },
    }).catch(() => {});
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Payroll process error:', errorMessage, errorStack);
    return c.json({ message: 'Payroll processing failed', error: errorMessage }, 500);
  }
});

export default router;
