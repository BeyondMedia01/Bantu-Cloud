import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { calculatePaye, calculateSplitSalaryPaye, grossUpNet } from '../lib/taxEngine';
import { getSettings } from '../services/settings.service';
import { audit } from '../lib/audit';
import { denyUnlessCompany } from '../lib/ownership';
import { getYtdStartDate } from '../lib/ytdCalculator';

const router = new Hono();

router.post('/preview', requirePermission('process_payroll'), async (c) => {
  const { inputs, currency = 'USD', period } = await c.req.json() as any;
  if (!inputs?.length) return c.json({ data: [] });

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

router.post('/:runId/process', requirePermission('process_payroll'), async (c) => {
  try {
    const companyId = c.get('companyId');
    const clientId = c.get('clientId');
    const runId = c.req.param('runId');
    const body = await c.req.json().catch(() => ({}));
    const adjustments = body?.adjustments || {};

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
    const resolveVehicleBenefit = (emp: any, runCurrency: string) => {
      const cat = emp.vehicleEngineCategory;
      if (!cat || cat === 'NONE') return emp.motorVehicleBenefit || 0;
      const ccy = runCurrency === 'ZiG' ? 'ZiG' : 'USD';
      return vehicleBenefitTable[ccy][cat] ?? emp.motorVehicleBenefit ?? 0;
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

    const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

    const toRunCcy = (usd: number, zig: number) => round2(run.currency === 'ZiG'
      ? (zig || 0) + (usd || 0) * xr
      : (usd || 0) + (zig || 0) / xr);

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

      let totalLoanBenefit = 0;
      let totalLoanBenefitUSD = 0;
      let totalLoanBenefitZIG = 0;

      if (run.dualCurrency) {
        const empPrescribedRate = emp.currency === 'USD' ? prescribedRateUSD : prescribedRateZIG;
        for (const loan of empLoans) {
          const loanRate = (loan.interestRate != null && !isNaN(loan.interestRate)) ? loan.interestRate : 0;
          if (loanRate < empPrescribedRate) {
            const paidAmt = loan.repayments.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
            const currentBalance = Math.max(0, loan.amount - paidAmt);
            if (currentBalance > 0) {
              const monthlyBenefit = round2((currentBalance * (empPrescribedRate - loanRate)) / 100 / 12);
              if (emp.currency === 'USD') totalLoanBenefitUSD += monthlyBenefit;
              else totalLoanBenefitZIG += monthlyBenefit;
            }
          }
        }
      } else {
        const empPrescribedRate = emp.currency === 'ZiG' ? prescribedRateZIG : prescribedRateUSD;
        for (const loan of empLoans) {
          const loanRate = (loan.interestRate != null && !isNaN(loan.interestRate)) ? loan.interestRate : 0;
          if (loanRate < empPrescribedRate) {
            const paidAmt = loan.repayments.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
            const currentBalance = Math.max(0, loan.amount - paidAmt);
            if (currentBalance > 0) {
              let monthlyBenefit = round2((currentBalance * (empPrescribedRate - loanRate)) / 100 / 12);
              if (emp.currency === 'ZiG' && run.currency === 'USD') monthlyBenefit = round2(monthlyBenefit / xr);
              else if (emp.currency === 'USD' && run.currency === 'ZiG') monthlyBenefit = round2(monthlyBenefit * xr);
              totalLoanBenefit += monthlyBenefit;
            }
          }
        }
      }

      const unpaidLeave = unpaidLeaveByEmployee[emp.id];

      let inputEarnings = 0, inputDeductions = 0, inputPension = 0;
      let inputMedicalAid = 0, inputMedicalAidUSD = 0, inputMedicalAidZIG = 0;
      let inputEarningsUSD = 0, inputEarningsZIG = 0;
      let inputDeductionsUSD = 0, inputDeductionsZIG = 0;
      let inputPensionUSD = 0, inputPensionZIG = 0;
      let inputNssaExcluded = 0, inputPayeExcluded = 0;
      let inputNssaExcludedUSD = 0, inputNssaExcludedZIG = 0;
      let inputPayeExcludedUSD = 0, inputPayeExcludedZIG = 0;

      for (const i of empInputs) {
        if (i.transactionCode.code === '201' && i.units > 0 && (i.employeeUSD || 0) === 0 && (i.employeeZiG || 0) === 0) {
          const divisor = emp.daysPerPeriod || workingDaysPerPeriodDefault || 22;
          const dayRate = emp.baseRate / divisor;
          const amt = round2(dayRate * i.units);
          if (emp.currency === 'ZiG') i.employeeZiG = amt;
          else i.employeeUSD = amt;
        }
      }

      for (const i of empInputs) {
        const tc = i.transactionCode;
        const isOvertime = tc.incomeCategory === 'OVERTIME' || tc.name.toLowerCase().includes('overtime');

        if (isOvertime && i.units > 0 && (i.employeeUSD || 0) === 0 && (i.employeeZiG || 0) === 0) {
          const divisor = emp.daysPerPeriod || workingDaysPerPeriodDefault || 22;
          const dayRate = emp.baseRate / divisor;
          const hourlyRate = dayRate / 8;
          const nameMatch = tc.name.match(/(\d+(?:\.\d+)?)x/i);
          const multiplier = tc.defaultValue != null ? parseFloat(tc.defaultValue) : (nameMatch ? parseFloat(nameMatch[1]) : 1.5);
          const amt = round2(hourlyRate * i.units * multiplier);

          if (emp.currency === 'ZiG') i.employeeZiG = amt;
          else i.employeeUSD = amt;
        }
      }

      for (const input of empInputs) {
        const tc = input.transactionCode;
        const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
        const isPreTaxDeduction = tc.type === 'DEDUCTION' && tc.preTax === true;
        const tcName = tc.name || '';
        const tcCode = tc.code || '';
        const isMedicalAid = tc.type === 'DEDUCTION' && tc.preTax === false &&
          (tc.incomeCategory === 'MEDICAL_AID' ||
            /medical\s*aid|med\s*aid/i.test(tcName) ||
            /MED_AID|MEDICAL_AID/i.test(tcCode) ||
            (tcName.toLowerCase().includes('medical') && /^\d+$/.test(tcCode)));

        if (run.dualCurrency) {
          if (isEarning) {
            inputEarningsUSD += input.employeeUSD || 0;
            inputEarningsZIG += input.employeeZiG || 0;
            if (tc.affectsNssa === false) {
              inputNssaExcludedUSD += input.employeeUSD || 0;
              inputNssaExcludedZIG += input.employeeZiG || 0;
            }
            if (tc.affectsPaye === false || tc.taxable === false) {
              inputPayeExcludedUSD += input.employeeUSD || 0;
              inputPayeExcludedZIG += input.employeeZiG || 0;
            }
            if (isEarning && tc.deemedBenefitPercent != null && tc.deemedBenefitPercent > 0 && tc.deemedBenefitPercent < 100) {
              const exemptFraction = (100 - tc.deemedBenefitPercent) / 100;
              inputPayeExcludedUSD += (input.employeeUSD || 0) * exemptFraction;
              inputPayeExcludedZIG += (input.employeeZiG || 0) * exemptFraction;
            }
          } else if (isPreTaxDeduction) {
            inputPensionUSD += input.employeeUSD || 0;
            inputPensionZIG += input.employeeZiG || 0;
          } else if (isMedicalAid) {
            inputMedicalAidUSD += input.employeeUSD || 0;
            inputMedicalAidZIG += input.employeeZiG || 0;
          } else {
            inputDeductionsUSD += input.employeeUSD || 0;
            inputDeductionsZIG += input.employeeZiG || 0;
          }
        } else {
          const amt = toRunCcy(input.employeeUSD, input.employeeZiG);
          if (isEarning) {
            inputEarnings += amt;
            if (tc.affectsNssa === false) inputNssaExcluded += amt;
            if (tc.affectsPaye === false || tc.taxable === false) inputPayeExcluded += amt;
            if (isEarning && tc.deemedBenefitPercent != null && tc.deemedBenefitPercent > 0 && tc.deemedBenefitPercent < 100) {
              const exemptFraction = (100 - tc.deemedBenefitPercent) / 100;
              inputPayeExcluded += amt * exemptFraction;
            }
          } else if (isPreTaxDeduction) {
            inputPension += amt;
          } else if (isMedicalAid) {
            inputMedicalAid += amt;
          } else {
            inputDeductions += amt;
          }
        }
      }

      for (const sd of empDefaults) {
        const tc = sd.transactionCode;
        const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
        const isPreTaxDeduction = tc.type === 'DEDUCTION' && tc.preTax === true;
        const tcName = tc.name || '';
        const tcCode = tc.code || '';
        const isMedicalAid = tc.type === 'DEDUCTION' && tc.preTax === false &&
          (tc.incomeCategory === 'MEDICAL_AID' ||
            /medical\s*aid|med\s*aid/i.test(tcName) ||
            /MED_AID|MEDICAL_AID/i.test(tcCode) ||
            (tcName.toLowerCase().includes('medical') && /^\d+$/.test(tcCode)));

        const empUSD = sd.currency === 'USD' ? sd.value : 0;
        const empZIG = sd.currency === 'ZiG' ? sd.value : 0;

        if (run.dualCurrency) {
          if (isEarning) {
            inputEarningsUSD += empUSD;
            inputEarningsZIG += empZIG;
            if (tc.affectsNssa === false) {
              inputNssaExcludedUSD += empUSD;
              inputNssaExcludedZIG += empZIG;
            }
            if (tc.affectsPaye === false || tc.taxable === false) {
              inputPayeExcludedUSD += empUSD;
              inputPayeExcludedZIG += empZIG;
            }
            if (isEarning && tc.deemedBenefitPercent != null && tc.deemedBenefitPercent > 0 && tc.deemedBenefitPercent < 100) {
              const exemptFraction = (100 - tc.deemedBenefitPercent) / 100;
              inputPayeExcludedUSD += empUSD * exemptFraction;
              inputPayeExcludedZIG += empZIG * exemptFraction;
            }
          } else if (isPreTaxDeduction) {
            inputPensionUSD += empUSD;
            inputPensionZIG += empZIG;
          } else if (isMedicalAid) {
            inputMedicalAidUSD += empUSD;
            inputMedicalAidZIG += empZIG;
          } else {
            inputDeductionsUSD += empUSD;
            inputDeductionsZIG += empZIG;
          }
        } else {
          const amt = toRunCcy(empUSD, empZIG);
          if (isEarning) {
            inputEarnings += amt;
            if (tc.affectsNssa === false) inputNssaExcluded += amt;
            if (tc.affectsPaye === false || tc.taxable === false) inputPayeExcluded += amt;
            if (isEarning && tc.deemedBenefitPercent != null && tc.deemedBenefitPercent > 0 && tc.deemedBenefitPercent < 100) {
              const exemptFraction = (100 - tc.deemedBenefitPercent) / 100;
              inputPayeExcluded += amt * exemptFraction;
            }
          } else if (isPreTaxDeduction) {
            inputPension += amt;
          } else if (isMedicalAid) {
            inputMedicalAid += amt;
          } else {
            inputDeductions += amt;
          }
        }
      }

      let effectiveBaseRate = emp.baseRate;
      if (unpaidLeave) {
        const unpaidDays = unpaidLeave.totalDays || 0;
        const wDays = emp.daysPerPeriod || workingDaysPerPeriodDefault || 22;
        if (unpaidDays >= wDays) {
          effectiveBaseRate = 0;
        } else {
          effectiveBaseRate = emp.baseRate * (1 - unpaidDays / wDays);
        }
      }

      if (emp.dischargeDate && effectiveBaseRate > 0) {
        const dDate = new Date(emp.dischargeDate);
        if (dDate >= run.startDate && dDate <= run.endDate) {
          const workedDays = Math.ceil((dDate.getTime() - run.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const periodDays = Math.ceil((run.endDate.getTime() - run.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const prorationFactor = Math.min(1, workedDays / periodDays);
          effectiveBaseRate = effectiveBaseRate * prorationFactor;
        } else if (dDate < run.startDate) {
          effectiveBaseRate = 0;
        }
      }

      let baseRate = effectiveBaseRate;
      if (effectiveBaseRate > 0 && emp.currency && emp.currency !== run.currency && run.exchangeRate && run.exchangeRate !== 1 && !run.dualCurrency) {
        if (run.currency === 'ZiG' && emp.currency === 'USD') baseRate = round2(effectiveBaseRate * run.exchangeRate);
        else if (run.currency === 'USD' && emp.currency === 'ZiG') baseRate = round2(effectiveBaseRate / run.exchangeRate);
      }

      let necLevy = 0;
      let necEmployer = 0;
      if (emp.rateSource === 'NEC_GRADE' && emp.necGrade) {
        const necMinRate = emp.necGrade.minRate;
        if (baseRate < necMinRate) baseRate = necMinRate;
        necLevy = baseRate * (emp.necGrade.necLevyRate || 0);
        necEmployer = necLevy;
      }

      const ytd = fdsYtdByEmployee[emp.id] || {
        cumGross: 0,
        uniqueMonths: new Set<string>(),
        cumExemptBonus: 0,
        cumExemptBonusUSD: 0,
        cumExemptBonusZIG: 0,
        cumExemptSeverance: 0,
      };

      const runStart = new Date(run.startDate);

      let elderlyCredit = 0, elderlyCreditUSD_val = 0, elderlyCreditZIG_val = 0;
      let effectiveNssaEmpRate = nssaEmployeeRate;
      let effectiveNssaEmprRate = nssaEmployerRate;

      if (emp.dateOfBirth) {
        const dob = new Date(emp.dateOfBirth);
        const age = runStart.getFullYear() - dob.getFullYear();
        const birthdayThisYear = new Date(runStart.getFullYear(), dob.getMonth(), dob.getDate());
        const isElderly = age > 65 || (age === 65 && runStart >= birthdayThisYear);
        if (isElderly) {
          elderlyCredit = run.currency === 'ZiG' ? elderlyCreditZIG : elderlyCreditUSD;
          elderlyCreditUSD_val = elderlyCreditUSD;
          elderlyCreditZIG_val = elderlyCreditZIG;
          effectiveNssaEmpRate = 0;
          effectiveNssaEmprRate = 0;
        }
      }

      const remBonusExUSD = Math.max(0, bonusExemptionUSD - ytd.cumExemptBonusUSD);
      const remBonusExZIG = Math.max(0, bonusExemptionZIG - ytd.cumExemptBonusZIG);
      const remBonusEx = run.currency === 'ZiG' ? remBonusExZIG : remBonusExUSD;

      const remSevExUSD = Math.max(0, severanceExemptionUSD - (ytd.cumExemptSeveranceUSD || ytd.cumExemptSeverance));
      const remSevExZIG = Math.max(0, severanceExemptionZIG - (ytd.cumExemptSeveranceZIG || ytd.cumExemptSeverance));
      const remSevEx = run.currency === 'ZiG' ? remSevExZIG : remSevExUSD;

      let fdsAvgPAYEBasis: number | null = null;
      if (emp.taxMethod === 'FDS_AVERAGE') {
        const provisionalBaseZIG = (run.dualCurrency && emp.splitZigMode === 'FIXED' && (emp.splitZigValue || 0) > 0)
          ? (emp.splitZigValue || 0)
          : 0;
        const currGross = run.dualCurrency
          ? baseRate + inputEarningsUSD + (inputEarningsZIG / xr) + (provisionalBaseZIG / xr)
          : baseRate + inputEarnings;
        fdsAvgPAYEBasis = round2((ytd.cumGross + currGross) / (ytd.uniqueMonths.size + 1));
      }

      const directiveActive =
        (!emp.taxDirectiveEffective || new Date(emp.taxDirectiveEffective) <= runStart) &&
        (!emp.taxDirectiveExpiry || new Date(emp.taxDirectiveExpiry) >= runStart);
      const effectiveTaxDirectivePerc = directiveActive ? (emp.taxDirectivePerc || 0) : 0;
      const effectiveTaxDirectiveAmt = directiveActive ? (emp.taxDirectiveAmt || 0) : 0;

      const effectiveBaseSalary = emp.grossingUp
        ? (() => {
            const isZIG = run.currency === 'ZiG';
            const pensionContribution = (adj.pensionContribution || 0) + (isZIG ? inputPensionZIG : inputPensionUSD || inputPension);
            const pensionCap = isZIG ? monthlyPensionCapZIG : monthlyPensionCapUSD;
            const cappedPension = pensionCap != null
              ? Math.min(pensionContribution, pensionCap)
              : pensionContribution;
            const medForGrossUp = isZIG
              ? 0
              : ((adj.medicalAid || 0) + (inputMedicalAidUSD || inputMedicalAid || 0) +
                 (run.dualCurrency ? (inputMedicalAidZIG || 0) / xr : 0));
            const grossUpTargetNet = baseRate + cappedPension + medForGrossUp;
            const solved = grossUpNet({
              targetNet: grossUpTargetNet,
              currency: isZIG ? 'ZiG' : 'USD',
              taxBrackets: taxBracketsUSD,
              annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : annualBracketsUSD,
              nssaCeiling: isZIG ? effectiveNssaCeilingZIG : nssaCeilingUSD,
              pensionContribution, pensionCap,
              medicalAid: medForGrossUp,
              taxCredits: elderlyCredit > 0 ? elderlyCredit : (emp.taxCredits || 0),
              nssaEmployeeRate, nssaEmployerRate,
            } as any);
            return solved ? solved.grossSalary : baseRate;
          })()
        : baseRate;

      let taxResult: any, taxResultUSD: any, taxResultZIG: any;

      if (run.dualCurrency) {
        let baseUSD = 0, baseZIG = 0;
        const totalBasicUSD = emp.currency === 'USD' ? effectiveBaseSalary : effectiveBaseSalary / xr;

        if (emp.splitZigMode === 'PERCENTAGE' && (emp.splitZigValue || 0) > 0) {
          const splitPerc = Math.min(100, Math.max(0, emp.splitZigValue || 0));
          baseUSD = totalBasicUSD * (1 - splitPerc / 100);
          baseZIG = totalBasicUSD * (splitPerc / 100) * xr;
        } else if (emp.splitZigMode === 'FIXED' && (emp.splitZigValue || 0) > 0) {
          baseZIG = emp.splitZigValue || 0;
          baseUSD = totalBasicUSD;
        } else {
          if (emp.currency === 'ZiG') {
            baseZIG = effectiveBaseSalary;
            baseUSD = 0;
          } else {
            baseUSD = effectiveBaseSalary;
            baseZIG = 0;
          }
        }

        const resolvedMV = resolveVehicleBenefit(emp, run.currency);
        const mvBenefitUSD = emp.currency !== 'ZiG' ? resolvedMV : 0;
        const mvBenefitZIG = emp.currency === 'ZiG' ? resolvedMV : 0;

        const splitResult = calculateSplitSalaryPaye({
          usdParams: {
            baseSalary: baseUSD,
            taxableBenefits: adj.taxableBenefits || 0,
            motorVehicleBenefit: mvBenefitUSD,
            overtimeAmount: (adj.overtimeAmount || 0) + inputEarningsUSD,
            bonus: adj.bonus || 0, bonusExemption: remBonusExUSD,
            severanceAmount: adj.severanceAmount || 0, severanceExemption: remSevExUSD,
            pensionContribution: (adj.pensionContribution || 0) + inputPensionUSD,
            pensionCap: monthlyPensionCapUSD,
            medicalAid: (adj.medicalAid || 0) + inputMedicalAidUSD,
            taxCredits: elderlyCreditUSD_val > 0 ? elderlyCreditUSD_val : (emp.taxCredits || 0),
            nssaCeiling: nssaCeilingUSD,
            nssaExcludedEarnings: inputNssaExcludedUSD,
            payeExcludedEarnings: inputPayeExcludedUSD,
            loanBenefit: totalLoanBenefitUSD,
            fdsAveragePAYEBasis: fdsAvgPAYEBasis,
          },
          zigParams: {
            baseSalary: baseZIG,
            taxableBenefits: 0,
            motorVehicleBenefit: mvBenefitZIG,
            overtimeAmount: inputEarningsZIG,
            bonus: 0, bonusExemption: remBonusExZIG,
            severanceAmount: 0, severanceExemption: remSevExZIG,
            pensionContribution: inputPensionZIG,
            pensionCap: monthlyPensionCapZIG,
            medicalAid: inputMedicalAidZIG,
            taxCredits: elderlyCreditZIG_val > 0 ? elderlyCreditZIG_val : (emp.taxCredits || 0),
            nssaCeiling: effectiveNssaCeilingZIG,
            nssaExcludedEarnings: inputNssaExcludedZIG,
            payeExcludedEarnings: inputPayeExcludedZIG,
            loanBenefit: totalLoanBenefitZIG,
            fdsAveragePAYEBasis: null,
          },
          exchangeRate: xr,
          taxBracketsUSD,
          annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : annualBracketsUSD,
          wcifRate,
          sdfRate,
          zimdefRate,
          aidsLevyRate,
          medicalAidCreditRate,
          nssaEmployeeRate: effectiveNssaEmpRate,
          nssaEmployerRate: effectiveNssaEmprRate,
          taxDirectivePerc: effectiveTaxDirectivePerc,
          taxDirectiveAmt: effectiveTaxDirectiveAmt,
        });

        taxResultUSD = splitResult.usd;
        taxResultZIG = splitResult.zig;
        taxResult = splitResult.totalResult;
      } else {
        taxResult = calculatePaye({
          baseSalary: effectiveBaseSalary, currency: run.currency,
          taxableBenefits: adj.taxableBenefits || 0,
          motorVehicleBenefit: resolveVehicleBenefit(emp, run.currency),
          overtimeAmount: (adj.overtimeAmount || 0) + inputEarnings,
          bonus: adj.bonus || 0, bonusExemption: remBonusEx,
          severanceAmount: adj.severanceAmount || 0, severanceExemption: remSevEx,
          pensionContribution: (adj.pensionContribution || 0) + inputPension,
          pensionCap: run.currency === 'ZiG' ? monthlyPensionCapZIG : monthlyPensionCapUSD,
          medicalAid: (adj.medicalAid || 0) + inputMedicalAid,
          taxCredits: elderlyCredit > 0 ? elderlyCredit : (emp.taxCredits || 0),
          wcifRate, sdfRate,
          taxBrackets,
          annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : annualBrackets,
          nssaCeiling,
          nssaEmployeeRate: effectiveNssaEmpRate,
          nssaEmployerRate: effectiveNssaEmprRate,
          nssaExcludedEarnings: inputNssaExcluded,
          payeExcludedEarnings: inputPayeExcluded,
          taxDirectivePerc: effectiveTaxDirectivePerc,
          taxDirectiveAmt: effectiveTaxDirectiveAmt,
          aidsLevyRate, medicalAidCreditRate,
          loanBenefit: totalLoanBenefit,
          fdsAveragePAYEBasis: fdsAvgPAYEBasis,
          zimdefRate,
        });
      }

      let netPayAfterLoans: number, netPayUSD: number | null, netPayZIG: number | null, dualFields: any;
      let loanDeductions = 0;

      if (run.dualCurrency) {
        let availableUSD = Math.max(0, taxResultUSD.netSalary - inputDeductionsUSD);
        for (const rep of empRepayments) {
          if (rep.amount > availableUSD + 0.001) {
            console.warn(`[LOANS] Skipped repayment ${rep.id} (${rep.amount} USD) for employee ${emp.id} — insufficient net pay (available: ${availableUSD.toFixed(2)})`);
            continue;
          }
          appliedRepaymentIds.add(rep.id);
          loanDeductions += rep.amount;
          availableUSD -= rep.amount;
        }
        const netUSD = Math.max(0, taxResultUSD.netSalary - loanDeductions - inputDeductionsUSD);
        const netZIG = Math.max(0, taxResultZIG.netSalary - inputDeductionsZIG);
        netPayAfterLoans = netUSD;
        netPayUSD = netUSD;
        netPayZIG = netZIG;
        dualFields = {
          grossUSD: taxResultUSD.gross, grossZIG: taxResultZIG.gross,
          payeUSD: taxResultUSD.paye, payeZIG: taxResultZIG.paye,
          aidsLevyUSD: taxResultUSD.aidsLevy, aidsLevyZIG: taxResultZIG.aidsLevy,
          nssaUSD: taxResultUSD.nssaEmployee, nssaZIG: taxResultZIG.nssaEmployee,
        };
      } else {
        let availableNet = Math.max(0, taxResult.netSalary - inputDeductions);
        for (const rep of empRepayments) {
          if (rep.amount > availableNet + 0.001) {
            console.warn(`[LOANS] Skipped repayment ${rep.id} (${rep.amount}) for employee ${emp.id} — insufficient net pay (available: ${availableNet.toFixed(2)})`);
            continue;
          }
          appliedRepaymentIds.add(rep.id);
          loanDeductions += rep.amount;
          availableNet -= rep.amount;
        }
        netPayAfterLoans = Math.max(0, taxResult.netSalary - loanDeductions - inputDeductions);
        netPayUSD = null;
        netPayZIG = null;
        const splitPct = emp.splitUsdPercent;
        if (splitPct && splitPct > 0 && splitPct < 100 && run.exchangeRate && run.exchangeRate !== 1) {
          const usdShare = splitPct / 100;
          if (run.currency === 'USD') {
            netPayUSD = round2(netPayAfterLoans * usdShare);
            netPayZIG = round2(netPayAfterLoans * (1 - usdShare) * run.exchangeRate);
          } else {
            netPayZIG = round2(netPayAfterLoans * (1 - usdShare));
            netPayUSD = round2((netPayAfterLoans * usdShare) / run.exchangeRate);
          }
        }
        dualFields = {};
      }

      payslipData.push({
        employeeId: emp.id,
        payrollRunId: run.id,
        gross: taxResult.grossSalary,
        paye: taxResult.payeBeforeLevy,
        aidsLevy: taxResult.aidsLevy,
        nssaEmployee: taxResult.nssaEmployee,
        nssaEmployer: taxResult.nssaEmployer,
        nssaBasis: taxResult.nssaBasis,
        pensionApplied: taxResult.pensionApplied,
        basicSalaryApplied: run.dualCurrency
          ? Math.max(baseRate > 0 ? 0.01 : 0, round2(emp.currency === 'USD' ? baseRate : baseRate / xr))
          : round2(baseRate),
        wcifEmployer: taxResult.wcifEmployer,
        sdfContribution: taxResult.sdfContribution,
        zimdefEmployer: taxResult.zimdefEmployer,
        necLevy,
        necEmployer,
        loanDeductions,
        netPay: netPayAfterLoans,
        netPayUSD,
        netPayZIG,
        exchangeRate: (run.dualCurrency || run.currency === 'ZiG') ? (run.exchangeRate || null) : null,
        ...dualFields,
        exemptBonus: taxResult.exemptBonus,
        exemptBonusUSD: run.dualCurrency ? (taxResultUSD?.exemptBonus ?? null) : null,
        exemptBonusZIG: run.dualCurrency ? (taxResultZIG?.exemptBonus ?? null) : null,
        exemptSeverance: taxResult.exemptSeverance,
        exemptSeveranceUSD: run.dualCurrency ? (taxResultUSD?.exemptSeverance ?? null) : (run.currency === 'USD' ? taxResult.exemptSeverance : null),
        exemptSeveranceZIG: run.dualCurrency ? (taxResultZIG?.exemptSeverance ?? null) : (run.currency === 'ZiG' ? taxResult.exemptSeverance : null),
        medicalAidCredit: taxResult.medicalAidCredit,
        taxCreditsApplied: taxResult.taxCreditsApplied,
      });

      const allEmpItems: any[] = [];

      for (const i of empInputs) {
        if (run.dualCurrency) {
          if ((i.employeeUSD || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: i.transactionCodeId,
              amount: i.employeeUSD,
              currency: 'USD',
              description: i.notes,
            });
          }
          if ((i.employeeZiG || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: i.transactionCodeId,
              amount: i.employeeZiG,
              currency: 'ZiG',
              description: i.notes,
            });
          }
        } else {
          const amt = toRunCcy(i.employeeUSD, i.employeeZiG);
          if (amt !== 0) {
            allEmpItems.push({
              transactionCodeId: i.transactionCodeId,
              amount: amt,
              currency: run.currency,
              description: i.notes,
            });
          }
        }
      }

      for (const sd of empDefaults) {
        if (run.dualCurrency) {
          if (sd.currency === 'USD' && (sd.value || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: sd.transactionCodeId,
              amount: sd.value,
              currency: 'USD',
              description: sd.notes,
            });
          } else if (sd.currency === 'ZiG' && (sd.value || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: sd.transactionCodeId,
              amount: sd.value,
              currency: 'ZiG',
              description: sd.notes,
            });
          }
        } else {
          const amt = toRunCcy(sd.currency === 'USD' ? sd.value : 0, sd.currency === 'ZiG' ? sd.value : 0);
          if (amt !== 0) {
            allEmpItems.push({
              transactionCodeId: sd.transactionCodeId,
              amount: amt,
              currency: run.currency,
              description: sd.notes,
            });
          }
        }
      }

      for (const item of allEmpItems) {
        payrollTxData.push({
          employeeId: emp.id,
          payrollRunId: run.id,
          transactionCodeId: item.transactionCodeId,
          amount: item.amount,
          currency: item.currency,
          description: item.description,
        });
      }
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
