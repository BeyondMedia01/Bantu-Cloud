const { Worker } = require('bullmq');
const connection = require('../lib/redis');
const prisma = require('../lib/prisma');
const { emailQueue } = require('./index');

const { calculatePaye, calculateSplitSalaryPaye, grossUpNet } = require('../utils/taxEngine');
const { getSettings } = require('../lib/systemSettings');
const { audit } = require('../lib/audit');
const { getYtdStartDate } = require('../utils/ytdCalculator');

/**
 * BullMQ processor for the `payroll-processing` queue.
 *
 * This is the background-worker counterpart of the legacy HTTP handler at
 * routes/payroll/process.js (POST /:runId/process). It performs the exact same
 * computation (PAYE/NSSA/AIDS/loans/dual-currency/FDS-average) but:
 *
 *   1. Claims the run atomically (QUEUED -> PROCESSING) so two workers never
 *      run the same job.
 *   2. Performs compensating cleanup of any prior partial writes before it
 *      starts (Payslip + PayrollTransaction rows).
 *   3. Emits BullMQ progress updates (10/20/25 -> 95) so the UI can poll.
 *   4. Replaces the inline `sendPayslip` calls with a bulk enqueue onto the
 *      `email-dispatch` queue.
 *   5. Throws on failure (BullMQ handles retry/backoff); the `failed`
 *      handler below marks the PayrollRun as ERROR after the final attempt.
 *
 * Job data shape: { runId, companyId, clientId, userId }
 */
async function processPayrollRun(job) {
  const { runId, companyId, clientId, userId } = job.data;

  // STEP 1: Compensating cleanup — wipe partial writes from any prior crashed attempt
  await prisma.payrollTransaction.deleteMany({ where: { payrollRunId: runId } });
  await prisma.payslip.deleteMany({ where: { payrollRunId: runId } });

  // STEP 2: Atomic claim — single SQL UPDATE prevents two workers claiming the same run
  const claimed = await prisma.$executeRaw`
    UPDATE "PayrollRun"
    SET status = 'PROCESSING', "updatedAt" = now()
    WHERE id = ${runId} AND status = 'QUEUED'
  `;
  if (claimed === 0) {
    throw new Error(`Run ${runId} already claimed or not in QUEUED state`);
  }
  await job.updateProgress(10);

  // ── Load the run and validate period locks ────────────────────────────────
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { company: true, payrollCalendar: true },
  });
  if (!run) throw new Error('Payroll run not found');
  if (companyId && run.companyId !== companyId) throw new Error('Access denied');

  if (run.payrollCalendar?.isClosed) {
    throw new Error('Cannot process payroll for a closed period');
  }
  const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
    where: {
      clientId: run.company.clientId,
      isClosed: true,
      startDate: { lte: run.endDate },
      endDate: { gte: run.startDate },
    },
  });
  if (overlappingClosedCal) {
    throw new Error('A closed calendar period overlaps with this payroll run dates');
  }

  // ── Tax tables ───────────────────────────────────────────────────────────
  const fetchTaxTable = async (clientIdArg, currency, date) => {
    const active = await prisma.taxTable.findFirst({
      where: { clientId: clientIdArg, currency, isActive: true },
      include: { brackets: true },
    });
    if (active) return active;
    const matched = await prisma.taxTable.findFirst({
      where: {
        clientId: clientIdArg,
        currency,
        effectiveDate: { lte: date },
        OR: [{ expiryDate: null }, { expiryDate: { gte: date } }],
      },
      include: { brackets: true },
      orderBy: { effectiveDate: 'desc' },
    });
    if (matched) return matched;
    return prisma.taxTable.findFirst({
      where: { clientId: clientIdArg, currency },
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
    throw new Error('No active USD tax table found. Configure and activate a USD tax table under Tax Configuration before processing payroll.');
  }
  if (run.currency === 'ZiG' && taxBracketsZIG.length === 0) {
    throw new Error('No active ZiG tax table found. Configure and activate a ZiG tax table under Tax Configuration before processing this ZiG payroll run.');
  }

  // ── System settings ──────────────────────────────────────────────────────
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
    'VEHICLE_BENEFIT_CC_1500_USD', 'VEHICLE_BENEFIT_CC_2000_USD', 'VEHICLE_BENEFIT_CC_3000_USD', 'VEHICLE_BENEFIT_ABOVE_3000_USD', 'VEHICLE_BENEFIT_ABOVE_2000_USD',
    'VEHICLE_BENEFIT_CC_1500_ZIG', 'VEHICLE_BENEFIT_CC_2000_ZIG', 'VEHICLE_BENEFIT_CC_3000_ZIG', 'VEHICLE_BENEFIT_ABOVE_3000_ZIG', 'VEHICLE_BENEFIT_ABOVE_2000_ZIG',
    'ZIMDEF_RATE',
    'TRADE_UNION_EMPLOYEE_RATE', 'TRADE_UNION_EMPLOYER_RATE',
    'WORKING_DAYS_PER_PERIOD', 'WORKING_DAYS_PER_MONTH',
  ]);
  const s = (key) => parseFloat(settings[key] ?? 0);
  await job.updateProgress(20);

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

  const vehicleBenefitTable = {
    USD: {
      UP_TO_1500CC:    s('VEHICLE_BENEFIT_CC_1500_USD'),
      CC_1501_TO_2000: s('VEHICLE_BENEFIT_CC_2000_USD'),
      CC_2001_TO_3000: s('VEHICLE_BENEFIT_CC_3000_USD'),
      ABOVE_3000CC:    s('VEHICLE_BENEFIT_ABOVE_3000_USD'),
      ABOVE_2000CC:    s('VEHICLE_BENEFIT_ABOVE_2000_USD'), // legacy
    },
    ZiG: {
      UP_TO_1500CC:    s('VEHICLE_BENEFIT_CC_1500_ZIG'),
      CC_1501_TO_2000: s('VEHICLE_BENEFIT_CC_2000_ZIG'),
      CC_2001_TO_3000: s('VEHICLE_BENEFIT_CC_3000_ZIG'),
      ABOVE_3000CC:    s('VEHICLE_BENEFIT_ABOVE_3000_ZIG'),
      ABOVE_2000CC:    s('VEHICLE_BENEFIT_ABOVE_2000_ZIG'), // legacy
    },
  };
  const resolveVehicleBenefit = (emp, runCurrency) => {
    const cat = emp.vehicleEngineCategory;
    const ccy = runCurrency === 'ZiG' ? 'ZiG' : 'USD';
    const fullBenefit = (!cat || cat === 'NONE')
      ? (emp.motorVehicleBenefit || 0)
      : (vehicleBenefitTable[ccy][cat] ?? emp.motorVehicleBenefit ?? 0);

    if (!fullBenefit) return 0;

    // Prorate if the vehicle was not available for the entire payroll month
    const periodStart = new Date(run.startDate);
    const periodEnd   = new Date(run.endDate);
    const daysInMonth = Math.round((periodEnd - periodStart) / 86400000) + 1;

    const availFrom = emp.vehicleStartDate ? new Date(emp.vehicleStartDate) : null;
    const availTo   = emp.vehicleEndDate   ? new Date(emp.vehicleEndDate)   : null;

    const effectiveFrom = availFrom && availFrom > periodStart ? availFrom : periodStart;
    const effectiveTo   = availTo   && availTo   < periodEnd   ? availTo   : periodEnd;

    if (effectiveFrom > periodEnd || (availTo && effectiveTo < periodStart)) return 0;

    const daysAvailable = Math.round((effectiveTo - effectiveFrom) / 86400000) + 1;
    if (daysAvailable >= daysInMonth) return fullBenefit;
    return Math.round((fullBenefit * daysAvailable / daysInMonth) * 100) / 100;
  };

  const globalZimdefRate = s('ZIMDEF_RATE') / 100;
  const zimdefRate = run.company.zimdefRate != null ? run.company.zimdefRate / 100 : globalZimdefRate;

  const workingDaysPerPeriodDefault = s('WORKING_DAYS_PER_PERIOD') || s('WORKING_DAYS_PER_MONTH');

  // ── Employees ────────────────────────────────────────────────────────────
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
      vehicleEngineCategory: true, vehicleStartDate: true, vehicleEndDate: true,
      grossingUp: true,
      leaveBalance: true, leaveTaken: true,
      necGrade: { select: { id: true, minRate: true, necLevyRate: true, necEmployeeRate: true } },
    },
  });

  if (employees.length === 0) {
    throw new Error('No employees found for this company');
  }

  await prisma.payrollRun.update({
    where: { id: runId },
    data: { totalEmployees: employees.length },
  });
  await job.updateProgress(25);

  // Per-employee adjustments passed in the job payload by POST /process
  const adjustments = job.data.adjustments || {};

  if ((run.dualCurrency || run.currency === 'ZiG') && !(run.exchangeRate > 1)) {
    console.warn(`[PAYROLL] Run ${run.id} is ZiG/dual but exchangeRate is ${run.exchangeRate} — falling back to 1. All ZiG conversions will be wrong.`);
  }
  const xr = (run.exchangeRate > 0) ? run.exchangeRate : 1;

  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  const toRunCcy = (usd, zig) => round2(run.currency === 'ZiG'
    ? (zig || 0) + (usd || 0) * xr
    : (usd || 0) + (zig || 0) / xr);

  // ── Batch-fetch all data BEFORE the transaction ──────────────────────────
  const runPeriod = `${new Date(run.startDate).getFullYear()}-${String(new Date(run.startDate).getMonth() + 1).padStart(2, '0')}`;
  const allInputs = await prisma.payrollInput.findMany({
    where: {
      employeeId: { in: employees.map((e) => e.id) },
      OR: [
        { payrollRunId: run.id },
        { payrollRunId: null, period: { lte: runPeriod }, processed: false },
      ],
    },
    include: { transactionCode: { select: { type: true, taxable: true, preTax: true, affectsNssa: true, affectsPaye: true, name: true, code: true, incomeCategory: true, defaultValue: true, deemedBenefitPercent: true, employerRate: true } } },
  });
  const inputsByEmployee = {};
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
    include: { transactionCode: { select: { type: true, taxable: true, preTax: true, affectsNssa: true, affectsPaye: true, name: true, code: true, incomeCategory: true, defaultValue: true, deemedBenefitPercent: true, employerRate: true } } },
  });

  const coveredKeys = new Set(allInputs.map((i) => `${i.employeeId}:${i.transactionCodeId}`));

  const latestDefaultByKey = {};
  for (const sd of allSalaryDefaults) {
    const key = `${sd.employeeId}:${sd.transactionCodeId}`;
    if (!latestDefaultByKey[key] ||
      new Date(sd.effectiveFrom) > new Date(latestDefaultByKey[key].effectiveFrom)) {
      latestDefaultByKey[key] = sd;
    }
  }

  const defaultsByEmployee = {};
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
  const repaymentsByEmployee = {};
  for (const rep of allDueRepayments) {
    const empId = rep.loan.employeeId;
    (repaymentsByEmployee[empId] = repaymentsByEmployee[empId] || []).push(rep);
  }

  const affectedLoanIds = [...new Set(allDueRepayments.map((r) => r.loanId))];
  const remainingRepaymentCounts = {};
  if (affectedLoanIds.length > 0) {
    const dueRepaymentIds = new Set(allDueRepayments.map((r) => r.id));
    const allUnpaid = await prisma.loanRepayment.findMany({
      where: { loanId: { in: affectedLoanIds }, status: 'UNPAID' },
      select: { id: true, loanId: true },
    });
    for (const loanId of affectedLoanIds) {
      const remaining = allUnpaid.filter((r) => r.loanId === loanId && !dueRepaymentIds.has(r.id));
      remainingRepaymentCounts[loanId] = remaining.length;
    }
  }

  const allActiveLoans = await prisma.loan.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: 'ACTIVE',
    },
    include: {
      repayments: { where: { status: 'PAID' } }
    },
  });
  const loansByEmployee = {};
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
  const unpaidLeaveByEmployee = {};
  for (const rec of activeLeaveRecords) {
    unpaidLeaveByEmployee[rec.employeeId] = rec;
  }

  const fdsAvgEmpIds = employees
    .filter((e) => e.taxMethod === 'FDS_AVERAGE')
    .map((e) => e.id);

  const fdsYtdByEmployee = {};
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
        payrollRun: { select: { startDate: true } }
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

  // ── Compute payslips ─────────────────────────────────────────────────────
  const payslipData = [];
  const payrollTxData = [];
  const now = new Date();
  const appliedRepaymentIds = new Set();
  let processedCount = 0;

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
          const paidAmt = loan.repayments.reduce((sum, r) => sum + (r.amount || 0), 0);
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
          const paidAmt = loan.repayments.reduce((sum, r) => sum + (r.amount || 0), 0);
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
        const workedDays = Math.ceil((dDate - run.startDate) / (1000 * 60 * 60 * 24)) + 1;
        const periodDays = Math.ceil((run.endDate - run.startDate) / (1000 * 60 * 60 * 24)) + 1;
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
      necLevy    = baseRate * (emp.necGrade.necEmployeeRate ?? emp.necGrade.necLevyRate ?? 0);
      necEmployer = baseRate * (emp.necGrade.necLevyRate || 0);
    }

    const tradeUnionEmployeeRate = s('TRADE_UNION_EMPLOYEE_RATE') / 100;
    const tradeUnionEmployerRate = s('TRADE_UNION_EMPLOYER_RATE') / 100;

    const ytd = fdsYtdByEmployee[emp.id] || {
      cumGross: 0,
      uniqueMonths: new Set(),
      cumExemptBonus: 0,
      cumExemptBonusUSD: 0,
      cumExemptBonusZIG: 0,
      cumExemptSeverance: 0
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

    let fdsAvgPAYEBasis = null;
    if (emp.taxMethod === 'FDS_AVERAGE') {
      const provisionalBaseZIG = (run.dualCurrency && emp.splitZigMode === 'FIXED' && (emp.splitZigValue || 0) > 0)
        ? emp.splitZigValue
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
          });
          return solved ? solved.grossSalary : baseRate;
        })()
      : baseRate;

    let taxResult, taxResultUSD, taxResultZIG;

    if (run.dualCurrency) {
      let baseUSD = 0, baseZIG = 0;
      const totalBasicUSD = emp.currency === 'USD' ? effectiveBaseSalary : effectiveBaseSalary / xr;

      if (emp.splitZigMode === 'PERCENTAGE' && (emp.splitZigValue || 0) > 0) {
        const splitPerc = Math.min(100, Math.max(0, emp.splitZigValue));
        baseUSD = totalBasicUSD * (1 - splitPerc / 100);
        baseZIG = totalBasicUSD * (splitPerc / 100) * xr;
      } else if (emp.splitZigMode === 'FIXED' && (emp.splitZigValue || 0) > 0) {
        baseZIG = emp.splitZigValue;
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

      const resolvedMV   = resolveVehicleBenefit(emp, run.currency);
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
        taxBracketsUSD: taxBracketsUSD,
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
      taxResult    = splitResult.totalResult;
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

    let loanDeductions = 0;
    let netPayAfterLoans, netPayUSD, netPayZIG, dualFields;

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

    const tradeUnionEmployee = round2(baseRate * tradeUnionEmployeeRate);
    const tradeUnionEmployer = round2(baseRate * tradeUnionEmployerRate);

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
      tradeUnionEmployee,
      tradeUnionEmployer,
      loanDeductions,
      netPay: netPayAfterLoans,
      netPayUSD,
      netPayZIG,
      exchangeRate: (run.dualCurrency || run.currency === 'ZiG') ? (run.exchangeRate || null) : null,
      ...dualFields,
      exemptBonus: taxResult.exemptBonus,
      exemptBonusUSD: run.dualCurrency ? (taxResultUSD.exemptBonus ?? null) : null,
      exemptBonusZIG: run.dualCurrency ? (taxResultZIG.exemptBonus ?? null) : null,
      exemptSeverance: taxResult.exemptSeverance,
      exemptSeveranceUSD: run.dualCurrency ? (taxResultUSD.exemptSeverance ?? null) : (run.currency === 'USD' ? taxResult.exemptSeverance : null),
      exemptSeveranceZIG: run.dualCurrency ? (taxResultZIG.exemptSeverance ?? null) : (run.currency === 'ZiG' ? taxResult.exemptSeverance : null),
      medicalAidCredit: taxResult.medicalAidCredit,
      taxCreditsApplied: taxResult.taxCreditsApplied,
    });

    const allEmpItems = [];

    for (const i of empInputs) {
      const erRate = i.transactionCode?.employerRate || 0;
      if (run.dualCurrency) {
        if ((i.employeeUSD || 0) !== 0) {
          allEmpItems.push({
            transactionCodeId: i.transactionCodeId,
            amount: i.employeeUSD,
            currency: 'USD',
            description: i.notes,
            employerUSD: erRate > 0 ? round2(effectiveBaseRate * erRate / 100) : 0,
            employerZiG: 0,
          });
        }
        if ((i.employeeZiG || 0) !== 0) {
          allEmpItems.push({
            transactionCodeId: i.transactionCodeId,
            amount: i.employeeZiG,
            currency: 'ZiG',
            description: i.notes,
            employerUSD: 0,
            employerZiG: erRate > 0 ? round2(effectiveBaseRate * erRate / 100) : 0,
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
            employerUSD: run.currency === 'USD' && erRate > 0 ? round2(baseRate * erRate / 100) : 0,
            employerZiG: run.currency === 'ZiG' && erRate > 0 ? round2(baseRate * erRate / 100) : 0,
          });
        }
      }
    }

    for (const sd of empDefaults) {
      const erRate = sd.transactionCode?.employerRate || 0;
      if (run.dualCurrency) {
        if (sd.currency === 'USD' && (sd.value || 0) !== 0) {
          allEmpItems.push({
            transactionCodeId: sd.transactionCodeId,
            amount: sd.value,
            currency: 'USD',
            description: sd.notes,
            employerUSD: erRate > 0 ? round2(effectiveBaseRate * erRate / 100) : 0,
            employerZiG: 0,
          });
        } else if (sd.currency === 'ZiG' && (sd.value || 0) !== 0) {
          allEmpItems.push({
            transactionCodeId: sd.transactionCodeId,
            amount: sd.value,
            currency: 'ZiG',
            description: sd.notes,
            employerUSD: 0,
            employerZiG: erRate > 0 ? round2(effectiveBaseRate * erRate / 100) : 0,
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
            employerUSD: run.currency === 'USD' && erRate > 0 ? round2(baseRate * erRate / 100) : 0,
            employerZiG: run.currency === 'ZiG' && erRate > 0 ? round2(baseRate * erRate / 100) : 0,
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
        employerUSD: item.employerUSD || 0,
        employerZiG: item.employerZiG || 0,
      });
    }

    processedCount++;
    // Update DB progress every N employees to avoid hammering — but always update BullMQ job progress
    if (processedCount % 10 === 0 || processedCount === employees.length) {
      await prisma.payrollRun.update({
        where: { id: runId },
        data: { employeesProcessed: processedCount },
      }).catch(() => {});
    }
    await job.updateProgress(Math.floor(25 + 70 * (processedCount / employees.length)));
  }

  // ── Determine which loans are fully paid off ────────────────────────────
  const paidOffLoanIds = affectedLoanIds.filter((loanId) => {
    if (remainingRepaymentCounts[loanId] !== 0) return false;
    return allDueRepayments.filter((r) => r.loanId === loanId).every((r) => appliedRepaymentIds.has(r.id));
  });

  // ── Short transaction: bulk writes only ─────────────────────────────────
  const result = await prisma.$transaction(async (tx) => {
    const linkedRepaymentIds = allDueRepayments.filter(r => r.payrollRunId === run.id).map(r => r.id);
    if (linkedRepaymentIds.length > 0) {
      await tx.loanRepayment.updateMany({
        where: { id: { in: linkedRepaymentIds } },
        data: { status: 'UNPAID', paidDate: null, payrollRunId: null },
      });
      const loanIdsToReset = [...new Set(allDueRepayments.filter(r => r.payrollRunId === run.id).map(r => r.loanId))];
      await tx.loan.updateMany({
        where: { id: { in: loanIdsToReset } },
        data: { status: 'ACTIVE' },
      });
    }

    // Re-delete inside the tx — the run is in PROCESSING from our atomic claim, so any
    // partials we just wrote (above) get removed before the bulk createMany call.
    await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
    await tx.payrollTransaction.deleteMany({ where: { payrollRunId: run.id } });

    await tx.payslip.createMany({ data: payslipData });
    if (payrollTxData.length > 0) {
      await tx.payrollTransaction.createMany({ data: payrollTxData });
    }

    if (allInputs.length > 0) {
      const idsToProcess = allInputs.filter(i => i.duration !== 'Indefinite').map(i => i.id);
      if (idsToProcess.length > 0) {
        await tx.payrollInput.updateMany({
          where: { id: { in: idsToProcess } },
          data: { processed: true, payrollRunId: run.id },
        });
      }
    }

    if (appliedRepaymentIds.size > 0) {
      await tx.loanRepayment.updateMany({
        where: { id: { in: [...appliedRepaymentIds] } },
        data: { status: 'PAID', paidDate: now, payrollRunId: run.id },
      });
    }

    if (paidOffLoanIds.length > 0) {
      await tx.loan.updateMany({
        where: { id: { in: paidOffLoanIds } },
        data: { status: 'PAID_OFF' },
      });
    }

    return { count: payslipData.length };
  });

  await audit({
    req: { user: { userId } },
    action: 'PAYROLL_RUN_PROCESSED',
    resource: 'payroll_run',
    resourceId: run.id,
    details: { employeeCount: result.count, currency: run.currency, queued: true },
  });

  // ── Trigger post-payroll leave accrual (non-fatal) ──────────────────────
  const { runLeaveAccrual } = require('../jobs/leaveAccrual');
  try {
    const accrualResult = await runLeaveAccrual(run.companyId, run.endDate);
    console.log(`[LeaveAccrual] post-payroll accrual complete for company ${run.companyId}:`, accrualResult);
  } catch (err) {
    console.error(`[LeaveAccrual] post-payroll accrual failed for company ${run.companyId}:`, err.message);
    if (err.accrualErrors) {
      console.error('[LeaveAccrual] Per-employee errors:', JSON.stringify(err.accrualErrors));
    }
  }

  await job.updateProgress(95);

  // STEP 6: Enqueue email jobs BEFORE marking COMPLETED so a worker crash here
  // can be detected (run still PROCESSING) and replayed without losing emails.
  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    select: { id: true },
  });
  if (payslips.length > 0) {
    await emailQueue.addBulk(payslips.map(p => ({
      name: 'EMAIL_PAYSLIP',
      data: { payslipId: p.id },
      opts: { jobId: `email-payslip-${p.id}` },
    })));
  }

  await prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'COMPLETED', progress: 100 },
  });

  console.log(`[PayrollWorker] runId=${runId} companyId=${companyId} clientId=${clientId} completed (${result.count} payslips)`);
  return { count: result.count };
}

function createPayrollWorker() {
  const worker = new Worker('payroll-processing', processPayrollRun, {
    connection,
    concurrency: 5,
  });

  worker.on('failed', async (job, err) => {
    console.error(`[PayrollWorker] Job ${job?.id} failed after all retries:`, err.message);
    if (job?.data?.runId) {
      await prisma.payrollRun.update({
        where: { id: job.data.runId },
        data: { status: 'ERROR', errorMessage: err.message },
      }).catch(() => {});
    }
  });

  worker.on('active', (job) => {
    console.log(`[PayrollWorker] Starting runId=${job.data.runId} companyId=${job.data.companyId}`);
  });

  return worker;
}

module.exports = { createPayrollWorker, processPayrollRun };
