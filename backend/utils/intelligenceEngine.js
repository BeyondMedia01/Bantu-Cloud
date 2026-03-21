const prisma = require('../lib/prisma');

async function detectFraud(clientId, companyId, skip = 0, take = 500) {
  const alerts = [];
  const accountsMap = {};
  const idsMap = {};

  const employees = await prisma.employee.findMany({
    where: {
      clientId,
      companyId,
      dischargeDate: null
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      idPassport: true,
      accountNumber: true,
      employeeCode: true
    },
    skip,
    take
  });

  if (employees.length === 0) return [];

  employees.forEach(emp => {
    // 1. Duplicate Bank Accounts
    if (emp.accountNumber && emp.accountNumber.trim() !== '') {
      const acc = emp.accountNumber.trim().replace(/\s/g, '');
      if (!accountsMap[acc]) accountsMap[acc] = [];
      accountsMap[acc].push(emp);
    }

    // 2. Duplicate IDs/Passports
    if (emp.idPassport && emp.idPassport.trim() !== '') {
      const idStr = emp.idPassport.trim().toUpperCase();
      if (!idsMap[idStr]) idsMap[idStr] = [];
      idsMap[idStr].push(emp);
    }
  });

  // Generate alerts from maps
  Object.values(accountsMap).forEach(duplicates => {
    if (duplicates.length > 1) {
      alerts.push({
        type: 'DUPLICATE_BANK_ACCOUNT',
        severity: 'high',
        message: 'Multiple employees share the same bank account number.',
        employees: duplicates.map(d => ({ id: d.id, name: `${d.firstName} ${d.lastName}`, code: d.employeeCode }))
      });
    }
  });

  Object.values(idsMap).forEach(duplicates => {
    if (duplicates.length > 1) {
      alerts.push({
        type: 'DUPLICATE_ID_PASSPORT',
        severity: 'critical',
        message: 'Multiple employees share the same ID/Passport number.',
        employees: duplicates.map(d => ({ id: d.id, name: `${d.firstName} ${d.lastName}`, code: d.employeeCode }))
      });
    }
  });

  return alerts;
}

async function generateSmartAlerts(clientId, companyId) {
  const alerts = [];

  // 1. Check for payroll cost variance (>15% increase)
  const recentRuns = await prisma.payrollRun.findMany({
    where: {
      companyId,
      status: { in: ['COMPLETED', 'APPROVED', 'PROCESSING'] }
    },
    orderBy: {
      runDate: 'desc'
    },
    take: 2,
    include: {
      payslips: {
        select: {
          gross: true
        }
      }
    }
  });

  if (recentRuns.length === 2) {
    const latestRun = recentRuns[0];
    const previousRun = recentRuns[1];
    const latestTotal = latestRun.payslips.reduce((sum, p) => sum + p.gross, 0);
    const previousTotal = previousRun.payslips.reduce((sum, p) => sum + p.gross, 0);

    if (previousTotal > 0) {
      const variance = (latestTotal - previousTotal) / previousTotal;
      if (variance > 0.15) {
        alerts.push({
          type: 'PAYROLL_COST_INCREASE',
          severity: 'warning',
          message: `Payroll costs increased by ${(variance * 100).toFixed(1)}% compared to the previous run.`,
          actionLink: `/payroll/runs/${latestRun.id}`,
          actionText: 'Review Run'
        });
      }
    }
  }

  // 2. Unusual Overtime Alerts (>20% of employees with high OT)
  const highOtRecords = await prisma.attendanceRecord.findMany({
    where: {
      companyId,
      ot1Minutes: { gt: 120 }, // 2+ hours of OT in a day
      date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // past 7 days
    },
    select: { employeeId: true }
  });

  const uniqueOtEmps = new Set(highOtRecords.map(r => r.employeeId));
  const activeCount = await prisma.employee.count({ where: { companyId, dischargeDate: null } });

  if (activeCount > 0 && (uniqueOtEmps.size / activeCount) > 0.2) {
    alerts.push({
      type: 'HIGH_OVERTIME_VOLUME',
      severity: 'medium',
      message: `${((uniqueOtEmps.size / activeCount) * 100).toFixed(0)}% of employees recorded significant overtime this week.`,
      actionLink: `/attendance/reports`,
      actionText: 'View OT Report'
    });
  }

  // 3. Employees missing bank details where paymentMethod = BANK
  const missingBankEmps = await prisma.employee.findMany({
    where: {
      clientId,
      companyId,
      dischargeDate: null,
      paymentMethod: 'BANK',
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      accountNumber: true,
      bankAccounts: {
        select: { id: true }
      }
    }
  });

  const trulyMissing = missingBankEmps.filter(emp => {
    const hasLegacyAccount = emp.accountNumber && emp.accountNumber.trim() !== '';
    const hasLinkedAccounts = emp.bankAccounts && emp.bankAccounts.length > 0;
    return !hasLegacyAccount && !hasLinkedAccounts;
  });

  if (trulyMissing.length > 0) {
    alerts.push({
      type: 'MISSING_BANK_DETAILS',
      severity: 'medium',
      message: `${trulyMissing.length} employee(s) lack bank details for electronic payment.`,
      actionLink: '/employees',
      actionText: 'Update Profiles'
    });
  }

  return alerts;
}

async function predictCashflow(clientId, companyId) {
  // 1. Get historical average (last 3 completed runs)
  const historicalRuns = await prisma.payrollRun.findMany({
    where: { companyId, status: 'COMPLETED' },
    orderBy: { runDate: 'desc' },
    take: 3,
    include: { payslips: { select: { netPay: true, taxTotal: true, nssaTotal: true } } }
  });

  let historicalAverage = 0;
  if (historicalRuns.length > 0) {
    const totals = historicalRuns.map(run => 
      run.payslips.reduce((s, p) => s + (p.netPay || 0) + (p.taxTotal || 0) + (p.nssaTotal || 0), 0)
    );
    historicalAverage = totals.reduce((a, b) => a + b, 0) / totals.length;
  }

  // 2. Get staged inputs for currently open runs
  const openRuns = await prisma.payrollRun.findMany({
    where: { companyId, status: { in: ['OPEN', 'DRAFT'] } },
    include: { 
      payrollInputs: { include: { transactionCode: true } }
    }
  });

  // Calculate "staged" cost based on inputs (simplified)
  let stagedInputsTotal = 0;
  openRuns.forEach(run => {
    run.payrollInputs.forEach(input => {
      if (input.transactionCode.type === 'EARNING') stagedInputsTotal += input.amount;
      // Deductions/Pension are usually part of Net Pay calculation later, 
      // but for "total cash requirement" we look at Gross + ER Costs.
    });
  });

  // 3. Base Salary anchor
  const activeEmployees = await prisma.employee.findMany({
    where: { companyId, dischargeDate: null },
    select: { baseRate: true }
  });
  const baselineGross = activeEmployees.reduce((s, e) => s + e.baseRate, 0);

  const predictedTotal = baselineGross + stagedInputsTotal;
  const variance = historicalAverage > 0 ? (predictedTotal - historicalAverage) / historicalAverage : 0;

  return {
    historicalAverage,
    baselineGross,
    stagedInputsTotal,
    predictedTotal,
    variance,
    currency: activeEmployees[0]?.currency || 'USD'
  };
}

module.exports = {
  detectFraud,
  generateSmartAlerts,
  predictCashflow
};
