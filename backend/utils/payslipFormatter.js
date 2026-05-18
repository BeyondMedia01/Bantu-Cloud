const prisma = require('../lib/prisma');
const { calculateYTD, getYtdStartDate } = require('./ytdCalculator');
const { generatePayslipBuffer } = require('./pdfService');
const { buildPayslipLineItems } = require('./payslipLineItems');

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

  const runPeriod = `${new Date(payslip.payrollRun.startDate).getFullYear()}-${String(new Date(payslip.payrollRun.startDate).getMonth() + 1).padStart(2, '0')}`;

  const [transactions, payrollInputs] = await Promise.all([
    prisma.payrollTransaction.findMany({
      where: { payrollRunId: payslip.payrollRunId, employeeId: payslip.employeeId },
      include: { transactionCode: { select: { id: true, code: true, name: true, type: true, preTax: true, incomeCategory: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.payrollInput.findMany({
      where: {
        employeeId: payslip.employeeId,
        OR: [
          { payrollRunId: payslip.payrollRunId },
          { payrollRunId: null, period: { lte: runPeriod } },
        ],
      },
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
    isDualCurrency: payslip.payrollRun.dualCurrency || false,
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
