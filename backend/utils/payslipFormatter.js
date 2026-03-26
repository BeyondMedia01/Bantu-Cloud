const prisma = require('../lib/prisma');
const { calculateYTD, getYtdStartDate } = require('./ytdCalculator');
const { generatePayslipBuffer } = require('./pdfService');

/**
 * Shared logic to build payslip line items.
 */
function buildPayslipLineItems({ payslip, transactions, ytdStat, ytdMap, basicSalary }) {
  const earningTxs = transactions.filter(
    (t) => t.transactionCode.type === 'EARNING' || t.transactionCode.type === 'BENEFIT'
  );
  const deductionTxs = transactions.filter(
    (t) => t.transactionCode.type === 'DEDUCTION'
  );

  const lines = [
    { name: 'Basic Salary', allowance: basicSalary, deduction: 0, employer: 0, ytd: ytdStat.basicSalary },
  ];

  // Add Earnings/Benefits
  earningTxs.forEach(t => {
    lines.push({
      name: t.transactionCode.name,
      description: t.description,
      allowance: t.amount,
      deduction: 0,
      employer: 0,
      ytd: ytdMap[t.transactionCodeId] ?? t.amount,
      units: t.units ?? null,
      unitsType: t.unitsType ?? null,
    });
  });

  // Add Statutory rows with YTD
  lines.push({ name: 'PAYE', allowance: 0, deduction: payslip.paye, employer: 0, ytd: ytdStat.paye });
  lines.push({ name: 'AIDS Levy', allowance: 0, deduction: payslip.aidsLevy, employer: 0, ytd: ytdStat.aidsLevy });
  lines.push({ name: 'NSSA Employee', allowance: 0, deduction: payslip.nssaEmployee, employer: 0, ytd: ytdStat.nssaEmployee });

  if (payslip.necLevy > 0) {
    lines.push({ name: 'NEC Employee', allowance: 0, deduction: payslip.necLevy, employer: 0, ytd: ytdStat.necLevy });
  }

  // Add Voluntary/Other Deductions
  deductionTxs.forEach(t => {
    lines.push({
      name: t.transactionCode.name,
      allowance: 0,
      deduction: t.amount,
      employer: 0,
      ytd: ytdMap[t.transactionCodeId] ?? t.amount,
      units: t.units ?? null,
      unitsType: t.unitsType ?? null,
    });
  });

  if (payslip.loanDeductions > 0) {
    lines.push({ name: 'Loan Repayments', allowance: 0, deduction: payslip.loanDeductions, employer: 0, ytd: ytdStat.loanDeductions });
  }

  // Employer Contributions
  if (payslip.nssaEmployer > 0) {
    lines.push({ name: 'NSSA Employer', allowance: 0, deduction: 0, employer: payslip.nssaEmployer, ytd: ytdStat.nssaEmployer });
  }
  if (payslip.zimdefEmployer > 0) {
    lines.push({ name: 'ZIMDEF (Manpower)', allowance: 0, deduction: 0, employer: payslip.zimdefEmployer, ytd: ytdStat.zimdefEmployer });
  }
  if (payslip.sdfContribution > 0) {
    lines.push({ name: 'SDF (Training)', allowance: 0, deduction: 0, employer: payslip.sdfContribution, ytd: ytdStat.sdfContribution });
  }
  if (payslip.wcifEmployer > 0) {
    lines.push({ name: 'WCIF (Insurance)', allowance: 0, deduction: 0, employer: payslip.wcifEmployer, ytd: ytdStat.wcifEmployer });
  }
  if (payslip.necEmployer > 0) {
    lines.push({ name: 'NEC Employer', allowance: 0, deduction: 0, employer: payslip.necEmployer, ytd: ytdStat.necEmployer });
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

  const transactions = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: payslip.payrollRunId, employeeId: payslip.employeeId },
    include: { transactionCode: { select: { id: true, code: true, name: true, type: true, preTax: true } } },
    orderBy: { createdAt: 'asc' },
  });

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
      select: { transactionCodeId: true, amount: true }
    }),
    prisma.payslip.findMany({
      where: { employeeId: payslip.employeeId, payrollRunId: { in: historicRunIds } }
    })
  ]);

  const { ytdMap, ytdStat } = calculateYTD({
    currentPayslip: payslip,
    historicalPayslips,
    currentTransactions: transactions,
    historicalTransactions: historicalTxs
  });

  const basicSalary = payslip.basicSalaryApplied > 0 ? payslip.basicSalaryApplied : (payslip.employee.baseRate ?? 0);
  const lineItems = buildPayslipLineItems({ payslip, transactions, ytdStat, ytdMap, basicSalary });

  const leaveBal = await prisma.leaveBalance.findFirst({
    where: {
      employeeId: payslip.employeeId,
      year: ytdStart.getFullYear(),
      leaveType: { contains: 'ANNUAL', mode: 'insensitive' },
    },
    select: { balance: true, taken: true },
    orderBy: { balance: 'desc' },
  });

  const pdfData = {
    companyName: payslip.payrollRun.company.name,
    period: `${payslip.payrollRun.startDate.toLocaleDateString('en-GB')} – ${payslip.payrollRun.endDate.toLocaleDateString('en-GB')}`,
    issuedDate: new Date().toLocaleDateString('en-GB'),
    employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
    employeeCode: payslip.employee.employeeCode || '',
    nationalId: payslip.employee.idPassport || payslip.employee.nationalId || '',
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
