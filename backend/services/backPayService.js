'use strict';

const prisma = require('../lib/prisma');
const { calculatePaye } = require('../utils/taxEngine');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAffectedRuns(companyId, effectiveDate) {
  const from = new Date(effectiveDate);
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return prisma.payrollRun.findMany({
    where: {
      companyId,
      status: 'COMPLETED',
      runDate: { gte: from, lt: currentMonthStart },
    },
    orderBy: { runDate: 'asc' },
    select: { id: true, runDate: true, currency: true, dualCurrency: true },
  });
}

async function buildRateMap(employeeIds, companyId, employeeRates, uniformNewRate) {
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, companyId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true, baseRate: true, currency: true },
  });

  const rateMap = {};
  for (const emp of employees) {
    const custom = employeeRates?.find((r) => r.employeeId === emp.id);
    rateMap[emp.id] = {
      ...emp,
      oldRate: custom ? parseFloat(custom.oldRate) : emp.baseRate,
      newRate: custom ? parseFloat(custom.newRate) : parseFloat(uniformNewRate ?? emp.baseRate),
    };
  }
  return rateMap;
}

async function getTaxBrackets(companyId, currency) {
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

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Calculate back-pay preview results for a set of employees across affected runs.
 *
 * @param {object} params
 * @param {string} params.companyId
 * @param {string} params.effectiveDate
 * @param {string[]} params.employeeIds
 * @param {Array|undefined} params.employeeRates  — [{employeeId, oldRate, newRate}]
 * @param {number|undefined} params.uniformNewRate
 * @param {string} params.currency
 * @returns {{ affectedRuns, results, summary }}
 */
async function calculateBackPay({ companyId, effectiveDate, employeeIds, employeeRates, uniformNewRate, currency = 'USD' }) {
  const runs = await getAffectedRuns(companyId, effectiveDate);

  if (runs.length === 0) {
    return {
      affectedRuns: [],
      results: [],
      summary: { totalEmployees: 0, totalRuns: 0, totalGross: 0, currency },
    };
  }

  const rateMap = await buildRateMap(employeeIds, companyId, employeeRates, uniformNewRate);
  // Always fetch USD brackets: back-pay tax estimates use the USD apportionment basis
  // regardless of whether individual employees are ZiG-denominated.
  const taxBrackets = await getTaxBrackets(companyId, 'USD');

  const runIds = runs.map((r) => r.id);
  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: { in: runIds }, employeeId: { in: employeeIds } },
    select: { employeeId: true, payrollRunId: true, gross: true },
  });

  const payslipIndex = {};
  for (const p of payslips) {
    if (!payslipIndex[p.employeeId]) payslipIndex[p.employeeId] = {};
    payslipIndex[p.employeeId][p.payrollRunId] = p;
  }

  const results = [];
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

    const runBreakdown = [];
    let empGross = 0;

    for (const run of runs) {
      if (!payslipIndex[empId]?.[run.id]) continue;
      empGross += diff;
      runBreakdown.push({
        runId: run.id,
        runDate: run.runDate,
        shortfall: diff,
      });
    }

    // Estimate uses USD as the apportionment basis — convert ZiG employees to USD-equivalent.
    const taxResult =
      empGross > 0
        ? calculatePaye({ baseSalary: empGross, currency: 'USD', taxBrackets })
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

module.exports = { getAffectedRuns, buildRateMap, getTaxBrackets, calculateBackPay };
