'use strict';

/**
 * Pure function — no database or PDF dependencies.
 * Builds the ordered array of payslip line items from a computed payslip record,
 * its transactions, and pre-calculated YTD accumulators.
 */
function buildPayslipLineItems({ payslip, transactions, ytdStat, ytdMap, ytdStatZIG, ytdMapZIG, basicSalary }) {
  const isDual = payslip.payrollRun?.dualCurrency || false;

  const isMedicalAidTc = (tc) => {
    const name = (tc.name || '').toLowerCase();
    const code = (tc.code || '').toUpperCase();
    return tc.incomeCategory === 'MEDICAL_AID' ||
      /medical\s*aid|med\s*aid/.test(name) ||
      /MED_AID|MEDICAL_AID/.test(code) ||
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
    // taxCredit: true — display-only, must NOT be summed into earnings/gross totals
    lines.push({ name: 'Medical Aid Credit', allowance: payslip.medicalAidCredit, allowanceZIG: null, deduction: 0, deductionZIG: null, employer: 0, ytd: ytdStat.medicalAidCredit, ytdZIG: null, taxCredit: true });
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
  if (payslip.tradeUnionEmployee > 0) {
    lines.push({ name: 'Trade Union (EE)', allowance: 0, allowanceZIG: null, deduction: payslip.tradeUnionEmployee, deductionZIG: null, employer: 0, ytd: ytdStat.tradeUnionEmployee ?? 0, ytdZIG: null });
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
    const amtUSD = g.amountUSD;
    const amtZIG = g.amountZIG ?? null;
    lines.push({
      name: g.tc.name,
      allowance: 0, allowanceZIG: null,
      deduction: amtUSD,
      deductionZIG: isDual ? amtZIG : null,
      employer: amtUSD,
      ytd: ytdMap[g.tcId] ?? amtUSD,
      ytdZIG: isDual ? (ytdMapZIG[g.tcId] ?? amtZIG ?? null) : null,
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
  if (payslip.tradeUnionEmployer > 0) {
    lines.push({ name: 'Trade Union (ER)', allowance: 0, allowanceZIG: null, deduction: 0, deductionZIG: null, employer: payslip.tradeUnionEmployer, ytd: ytdStat.tradeUnionEmployer ?? 0, ytdZIG: null });
  }

  return lines;
}

module.exports = { buildPayslipLineItems };
