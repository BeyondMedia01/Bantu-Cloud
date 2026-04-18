const prisma = require('../lib/prisma');
const { calculateYTD, getYtdStartDate } = require('./ytdCalculator');
const { generatePayslipBuffer } = require('./pdfService');

/**
 * Shared logic to build payslip line items.
 */
function buildPayslipLineItems({ payslip, transactions, ytdStat, ytdMap, ytdStatZIG, ytdMapZIG, basicSalary }) {
  const isDual = payslip.payrollRun?.dualCurrency || false;

  const isMedicalAidTc = (tc) => {
    const name = (tc.name || '').toLowerCase();
    const code = (tc.code || '').toLowerCase();
    return tc.incomeCategory === 'MEDICAL_AID' ||
      /medical\s*aid|med\s*aid/.test(name) ||
      code === '301';
  };

  // For dual runs, group USD and ZiG transactions by TC into merged rows.
  // For single-currency runs, all transactions are single-currency so no grouping needed.
  const groupTxsByTc = (txs) => {
    if (!isDual) return txs.map(t => ({ tc: t.transactionCode, tcId: t.transactionCodeId, amountUSD: t.amount, amountZIG: null, description: t.description, units: t.units, unitsType: t.unitsType }));
    const map = new Map();
    for (const t of txs) {
      if (!map.has(t.transactionCodeId)) {
        map.set(t.transactionCodeId, { tc: t.transactionCode, tcId: t.transactionCodeId, amountUSD: 0, amountZIG: 0, description: t.description, units: t.units, unitsType: t.unitsType });
      }
      const entry = map.get(t.transactionCodeId);
      if (t.currency === 'ZiG') entry.amountZIG += t.amount;
      else entry.amountUSD += t.amount;
    }
    return [...map.values()];
  };

  const isEarningTc = (tc) => tc.type === 'EARNING' || tc.type === 'BENEFIT';
  const isDeductionTc = (tc) => tc.type === 'DEDUCTION' && !isMedicalAidTc(tc);
  const isMedAidTc   = (tc) => tc.type === 'DEDUCTION' && isMedicalAidTc(tc);

  const earningGroups   = groupTxsByTc(transactions.filter(t => isEarningTc(t.transactionCode)));
  const deductionGroups = groupTxsByTc(transactions.filter(t => isDeductionTc(t.transactionCode)));
  const medicalAidGroups = groupTxsByTc(transactions.filter(t => isMedAidTc(t.transactionCode)));

  // Derive ZiG basic salary for dual runs: grossZIG minus ZiG earning transactions
  const zigEarningsSum = isDual ? earningGroups.reduce((s, g) => s + (g.amountZIG || 0), 0) : 0;
  const basicSalaryZIG = isDual ? Math.max(0, (payslip.grossZIG || 0) - zigEarningsSum) : null;

  const lines = [
    {
      name: 'Basic Salary',
      allowance: basicSalary, allowanceZIG: basicSalaryZIG,
      deduction: 0, deductionZIG: null,
      employer: 0, ytd: ytdStat.basicSalary, ytdZIG: isDual ? (basicSalaryZIG ?? null) : null,
    },
  ];

  // Earnings/Benefits
  earningGroups.forEach(g => {
    lines.push({
      name: g.tc.name,
      description: g.description,
      allowance: g.amountUSD,
      allowanceZIG: isDual ? g.amountZIG : null,
      deduction: 0, deductionZIG: null,
      employer: 0,
      ytd: ytdMap[g.tcId] ?? g.amountUSD,
      ytdZIG: isDual ? (ytdMapZIG[g.tcId] ?? g.amountZIG ?? null) : null,
      units: g.units ?? null,
      unitsType: g.unitsType ?? null,
    });
  });

  // Statutory deductions — show USD and ZiG splits for dual runs
  lines.push({
    name: 'PAYE',
    allowance: 0, allowanceZIG: null,
    deduction: isDual ? (payslip.payeUSD ?? payslip.paye) : payslip.paye,
    deductionZIG: isDual ? (payslip.payeZIG ?? null) : null,
    employer: 0, ytd: ytdStat.paye, ytdZIG: isDual ? (ytdStatZIG?.paye ?? null) : null,
  });
  if ((payslip.medicalAidCredit || 0) > 0) {
    lines.push({ name: 'Medical Aid Credit', allowance: payslip.medicalAidCredit, allowanceZIG: null, deduction: 0, deductionZIG: null, employer: 0, ytd: ytdStat.medicalAidCredit, ytdZIG: null });
  }
  lines.push({
    name: 'AIDS Levy',
    allowance: 0, allowanceZIG: null,
    deduction: isDual ? (payslip.aidsLevyUSD ?? payslip.aidsLevy) : payslip.aidsLevy,
    deductionZIG: isDual ? (payslip.aidsLevyZIG ?? null) : null,
    employer: 0, ytd: ytdStat.aidsLevy, ytdZIG: isDual ? (ytdStatZIG?.aidsLevy ?? null) : null,
  });
  lines.push({
    name: 'NSSA Employee',
    allowance: 0, allowanceZIG: null,
    deduction: isDual ? (payslip.nssaUSD ?? payslip.nssaEmployee) : payslip.nssaEmployee,
    deductionZIG: isDual ? (payslip.nssaZIG ?? null) : null,
    employer: 0, ytd: ytdStat.nssaEmployee, ytdZIG: isDual ? (ytdStatZIG?.nssaEmployee ?? null) : null,
  });

  if (payslip.necLevy > 0) {
    lines.push({ name: 'NEC Employee', allowance: 0, allowanceZIG: null, deduction: payslip.necLevy, deductionZIG: null, employer: 0, ytd: ytdStat.necLevy, ytdZIG: null });
  }

  // Voluntary/Other Deductions
  deductionGroups.forEach(g => {
    lines.push({
      name: g.tc.name,
      allowance: 0, allowanceZIG: null,
      deduction: g.amountUSD,
      deductionZIG: isDual ? g.amountZIG : null,
      employer: 0,
      ytd: ytdMap[g.tcId] ?? g.amountUSD,
      ytdZIG: isDual ? (ytdMapZIG[g.tcId] ?? g.amountZIG ?? null) : null,
      units: g.units ?? null,
      unitsType: g.unitsType ?? null,
    });
  });

  if (payslip.loanDeductions > 0) {
    lines.push({ name: 'Loan Repayments', allowance: 0, allowanceZIG: null, deduction: payslip.loanDeductions, deductionZIG: null, employer: 0, ytd: ytdStat.loanDeductions, ytdZIG: null });
  }

  // Medical Aid
  medicalAidGroups.forEach(g => {
    const amt = g.amountUSD;
    lines.push({
      name: g.tc.name,
      allowance: 0, allowanceZIG: null,
      deduction: amt,
      deductionZIG: isDual ? g.amountZIG : null,
      employer: amt,
      ytd: ytdMap[g.tcId] ?? amt,
      ytdZIG: isDual ? (ytdMapZIG[g.tcId] ?? g.amountZIG ?? null) : null,
      units: g.units ?? null,
      unitsType: g.unitsType ?? null,
    });
  });

  // Employer Contributions
  if (payslip.nssaEmployer > 0) {
    lines.push({ name: 'NSSA Employer', allowance: 0, allowanceZIG: null, deduction: 0, deductionZIG: null, employer: payslip.nssaEmployer, ytd: ytdStat.nssaEmployer });
  }
  if (payslip.zimdefEmployer > 0) {
    lines.push({ name: 'ZIMDEF (Manpower)', allowance: 0, allowanceZIG: null, deduction: 0, deductionZIG: null, employer: payslip.zimdefEmployer, ytd: ytdStat.zimdefEmployer });
  }
  if (payslip.sdfContribution > 0) {
    lines.push({ name: 'SDF (Training)', allowance: 0, allowanceZIG: null, deduction: 0, deductionZIG: null, employer: payslip.sdfContribution, ytd: ytdStat.sdfContribution });
  }
  if (payslip.wcifEmployer > 0) {
    lines.push({ name: 'WCIF (Insurance)', allowance: 0, allowanceZIG: null, deduction: 0, deductionZIG: null, employer: payslip.wcifEmployer, ytd: ytdStat.wcifEmployer });
  }
  if (payslip.necEmployer > 0) {
    lines.push({ name: 'NEC Employer', allowance: 0, allowanceZIG: null, deduction: 0, deductionZIG: null, employer: payslip.necEmployer, ytd: ytdStat.necEmployer });
  }

  return lines;
}

/**
 * Fetches all data for a payslip, generates the PDF, and returns a buffer
 * along with metadata needed for the email.
 */
async function payslipToBuffer(payslipId) {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      employee: {
        include: {
          user: true,
          department: true,
          bankAccounts: { orderBy: { priority: 'asc' } },
        },
      },
      payrollRun: { include: { company: true } },
    },
  });
  if (!payslip) return null;

  const [transactions, payrollInputs] = await Promise.all([
    prisma.payrollTransaction.findMany({
      where: { payrollRunId: payslip.payrollRunId, employeeId: payslip.employeeId },
      include: { transactionCode: { select: { id: true, code: true, name: true, type: true, preTax: true, incomeCategory: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.payrollInput.findMany({
      where: { payrollRunId: payslip.payrollRunId, employeeId: payslip.employeeId },
      select: { transactionCodeId: true, units: true, unitsType: true },
    }),
  ]);

  // Build units lookup by transactionCodeId
  const inputUnitsMap = {};
  for (const inp of payrollInputs) {
    inputUnitsMap[inp.transactionCodeId] = {
      units: inp.units ?? null,
      unitsType: inp.unitsType ?? null,
    };
  }

  // Merge units into transaction rows
  const transactionsWithUnits = transactions.map(t => ({
    ...t,
    ...( inputUnitsMap[t.transactionCodeId] || {} ),
  }));

  // Calculate YTD data using Zimbabwe tax year boundary
  // Find the company's earliest payroll run to handle mid-year company starts
  const firstRunRecord = await prisma.payrollRun.findFirst({
    where: { companyId: payslip.payrollRun.companyId },
    orderBy: { startDate: 'asc' },
    select: { startDate: true },
  });
  const ytdStart = getYtdStartDate(payslip.payrollRun.startDate, firstRunRecord?.startDate ?? null);

  const historicRunIds = (await prisma.payrollRun.findMany({
    where: {
      companyId: payslip.payrollRun.companyId,
      status: 'COMPLETED',
      startDate: { gte: ytdStart, lte: payslip.payrollRun.startDate },
      id: { not: payslip.payrollRunId }
    },
    select: { id: true }
  })).map(r => r.id);

  const [historicalTxs, historicalPayslips] = await Promise.all([
    prisma.payrollTransaction.findMany({
      where: { employeeId: payslip.employeeId, payrollRunId: { in: historicRunIds } },
      select: { transactionCodeId: true, amount: true, currency: true }
    }),
    prisma.payslip.findMany({
      where: { employeeId: payslip.employeeId, payrollRunId: { in: historicRunIds } }
    })
  ]);

  const { ytdMap, ytdMapZIG, ytdStat, ytdStatZIG } = calculateYTD({
    currentPayslip: payslip,
    historicalPayslips,
    currentTransactions: transactions,
    historicalTransactions: historicalTxs
  });

  const basicSalary = payslip.basicSalaryApplied > 0 ? payslip.basicSalaryApplied : (payslip.employee.baseRate ?? 0);
  const lineItems = buildPayslipLineItems({ payslip, transactions: transactionsWithUnits, ytdStat, ytdMap, ytdStatZIG, ytdMapZIG, basicSalary });

  // Leave balances are stored per calendar year (not tax year).
  const leaveYear = new Date(payslip.payrollRun.startDate).getFullYear();
  const companyId = payslip.payrollRun.companyId;

  // Resolve the active annual leave policy first so we can query by its exact leaveType.
  // Using contains:'ANNUAL' on the balance table can match multiple types (e.g. ANNUAL_PAID,
  // ANNUAL_UNPAID) and return the wrong record.
  const annualPolicy = await prisma.leavePolicy.findFirst({
    where: { companyId, isActive: true, accrualRate: { gt: 0 }, leaveType: { contains: 'ANNUAL', mode: 'insensitive' } },
  });

  let leaveBal = null;
  if (annualPolicy) {
    leaveBal = await prisma.leaveBalance.findFirst({
      where: {
        employeeId: payslip.employeeId,
        companyId,
        year: leaveYear,
        leaveType: annualPolicy.leaveType,  // exact match via policy
      },
    });
  }


  const pdfData = {
    companyName: payslip.payrollRun.company.name,
    period: `${payslip.payrollRun.startDate.toLocaleDateString('en-GB')} – ${payslip.payrollRun.endDate.toLocaleDateString('en-GB')}`,
    issuedDate: new Date().toLocaleDateString('en-GB'),
    employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
    employeeCode: payslip.employee.employeeCode || '',
    nationalId: payslip.employee.nationalId || payslip.employee.passportNumber || '',
    jobTitle: payslip.employee.position || '',
    department: payslip.employee.department?.name || '',
    costCenter: payslip.employee.costCenter || '',
    paymentMethod: payslip.employee.paymentMethod || 'BANK',
    bankName: (() => {
      if (payslip.employee.bankName) return payslip.employee.bankName;
      return payslip.employee.bankAccounts?.[0]?.bankName || '';
    })(),
    accountNumber: (() => {
      if (payslip.employee.accountNumber) return payslip.employee.accountNumber;
      return payslip.employee.bankAccounts?.[0]?.accountNumber || '';
    })(),
    bankMissing: (
      (payslip.employee.paymentMethod === 'BANK' || !payslip.employee.paymentMethod) &&
      (
        (!payslip.employee.bankName && !(payslip.employee.bankAccounts?.[0]?.bankName)) ||
        (!payslip.employee.accountNumber && !(payslip.employee.bankAccounts?.[0]?.accountNumber))
      )
    ),
    currency: payslip.payrollRun.currency,
    lineItems,
    grossPay: payslip.gross,
    totalDeductions: (payslip.gross - payslip.netPay),
    netSalary: payslip.netPay,
    netPayUSD: payslip.netPayUSD,
    netPayZIG: payslip.netPayZIG,
    exchangeRate: payslip.exchangeRate ?? null,
    // Dual-currency breakdown — null for single-currency runs
    grossUSD:     payslip.grossUSD     ?? null,
    grossZIG:     payslip.grossZIG     ?? null,
    payeUSD:      payslip.payeUSD      ?? null,
    payeZIG:      payslip.payeZIG      ?? null,
    aidsLevyUSD:  payslip.aidsLevyUSD  ?? null,
    aidsLevyZIG:  payslip.aidsLevyZIG  ?? null,
    nssaUSD:      payslip.nssaUSD      ?? null,
    nssaZIG:      payslip.nssaZIG      ?? null,
    leaveBalance: leaveBal?.balance ?? (payslip.employee.leaveBalance || 0),
    leaveTaken: leaveBal?.taken ?? (payslip.employee.leaveTaken || 0),
  };

  // Hard stop: bank details are mandatory for BANK-payment employees.
  // Throw before generating the PDF so the API returns a clear 422 error.
  if (pdfData.bankMissing) {
    const err = new Error(
      `Bank details incomplete for ${pdfData.employeeName} (${pdfData.employeeCode}). ` +
      `Both Bank Name and Account Number must be set before generating a payslip PDF.`
    );
    err.code = 'BANK_DETAILS_MISSING';
    throw err;
  }

  const buffer = await generatePayslipBuffer(pdfData);

  return {
    buffer,
    email: payslip.employee.user?.email ?? payslip.employee.email ?? null,
    employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
    companyName: payslip.payrollRun.company.name,
    period: pdfData.period,
    companyId: payslip.payrollRun.companyId,
  };
}

module.exports = { payslipToBuffer, buildPayslipLineItems };
