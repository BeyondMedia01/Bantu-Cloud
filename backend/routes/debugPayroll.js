/**
 * Temporary debug endpoint — remove after use.
 * GET /api/debug-paye/:employeeNumber
 * Returns a full PAYE breakdown for the employee's most recent payslip.
 */
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

router.get('/:employeeNumber', async (req, res) => {
  try {
    const { employeeNumber } = req.params;

    const emp = await prisma.employee.findFirst({
      where: { employeeNumber, companyId: req.companyId },
      include: { company: true },
    });
    if (!emp) return res.status(404).json({ error: `Employee ${employeeNumber} not found` });

    const run = await prisma.payrollRun.findFirst({
      where: { companyId: emp.companyId },
      orderBy: { createdAt: 'desc' },
    });
    if (!run) return res.status(404).json({ error: 'No payroll run found' });

    const payslip = await prisma.payslip.findFirst({
      where: { employeeId: emp.id, payrollRunId: run.id },
    });
    if (!payslip) return res.status(404).json({ error: 'No payslip in this run' });

    const txns = await prisma.payrollTransaction.findMany({
      where: { payslipId: payslip.id },
      include: { transactionCode: true },
    });

    const taxTable = await prisma.taxTable.findFirst({
      where: { companyId: emp.companyId, currency: 'USD', isActive: true },
      include: { brackets: { orderBy: { lowerBound: 'asc' } } },
    });

    const nssaKeys = [
      'NSSA_EMPLOYEE_RATE', 'NSSA_EMPLOYER_RATE',
      'NSSA_EMPLOYEE_RATE_ZIG', 'NSSA_EMPLOYER_RATE_ZIG',
      'NSSA_CEILING_USD', 'NSSA_CEILING_ZIG', 'AIDS_LEVY_RATE',
    ];
    const settingRows = await prisma.systemSetting.findMany({
      where: { settingName: { in: nssaKeys }, isActive: true },
    });
    const cfg = Object.fromEntries(settingRows.map(r => [r.settingName, parseFloat(r.settingValue)]));

    const isZIG = run.currency === 'ZiG';
    const nssaRate    = isZIG ? (cfg.NSSA_EMPLOYEE_RATE_ZIG ?? cfg.NSSA_EMPLOYEE_RATE ?? 4.5) : (cfg.NSSA_EMPLOYEE_RATE ?? 4.5);
    const nssaCeiling = isZIG ? (cfg.NSSA_CEILING_ZIG ?? 18000) : (cfg.NSSA_CEILING_USD ?? 700);
    const aidsLevyRate = (cfg.AIDS_LEVY_RATE ?? 3) / 100;

    const p = payslip;
    const gross       = Number(p.grossSalary) || 0;
    const nssaStored  = Number(p.nssaEmployee) || 0;
    const pension     = Number(p.pensionApplied) || 0;

    // Re-trace band-by-band
    const taxableIncome = r2(gross - nssaStored - pension);
    const taxBase       = taxTable?.isAnnual ? r2(taxableIncome * 12) : taxableIncome;

    let bands = [];
    let annualPaye = 0;
    if (taxTable) {
      for (const b of taxTable.brackets) {
        const lower = b.lowerBound;
        const upper = b.upperBound ?? null;
        if (taxBase <= lower - 1) break;
        const taxableInBand = r2(Math.min(taxBase, upper ?? Infinity) - (lower - 1));
        const tax = r2(taxableInBand * b.rate);
        annualPaye += tax;
        bands.push({ lower, upper, rate: r2(b.rate * 100), taxableInBand, tax, cumulative: r2(annualPaye) });
      }
    }

    const monthlyPaye  = taxTable?.isAnnual ? r2(annualPaye / 12) : r2(annualPaye);
    const aidsLevy     = r2(monthlyPaye * aidsLevyRate);
    const totalPayeCalc = r2(monthlyPaye + aidsLevy);

    res.json({
      employee: {
        number: emp.employeeNumber,
        name: `${emp.firstName} ${emp.lastName}`,
        currency: emp.currency,
        baseRate: emp.baseRate,
        taxMethod: emp.taxMethod,
      },
      run: {
        id: run.id,
        currency: run.currency,
        dualCurrency: run.dualCurrency,
        exchangeRate: run.exchangeRate,
        period: `${run.startDate?.toISOString().slice(0,10)} → ${run.endDate?.toISOString().slice(0,10)}`,
      },
      payslip_stored: {
        basicSalaryApplied: p.basicSalaryApplied,
        grossSalary: p.grossSalary,
        grossUSD: p.grossUSD,
        grossZIG: p.grossZIG,
        nssaEmployee: p.nssaEmployee,
        nssaUSD: p.nssaUSD,
        nssaZIG: p.nssaZIG,
        pensionApplied: p.pensionApplied,
        taxableIncome: p.taxableIncome,
        payeBeforeLevy: p.payeBeforeLevy,
        aidsLevy: p.aidsLevy,
        totalPaye: p.totalPaye,
        payeUSD: p.payeUSD,
        payeZIG: p.payeZIG,
        netPay: p.netPay,
      },
      transactions: txns.map(t => ({
        code: t.transactionCode?.code,
        name: t.transactionCode?.name,
        type: t.type,
        amount: t.amount,
        taxable: t.transactionCode?.taxable,
        affectsPaye: t.transactionCode?.affectsPaye,
        affectsNssa: t.transactionCode?.affectsNssa,
      })),
      settings_used: {
        nssaRate_pct: nssaRate,
        nssaCeiling,
        aidsLevyRate_pct: cfg.AIDS_LEVY_RATE ?? 3,
      },
      tax_table: taxTable ? {
        name: taxTable.name,
        isAnnual: taxTable.isAnnual,
        brackets: taxTable.brackets.map(b => ({
          lower: b.lowerBound, upper: b.upperBound, rate_pct: r2(b.rate * 100),
        })),
      } : null,
      paye_retrace: {
        gross,
        nssa_basis: r2(Math.min(gross, nssaCeiling)),
        nssa_calc: r2(Math.min(gross, nssaCeiling) * nssaRate / 100),
        nssa_stored: nssaStored,
        pension,
        taxable_income: taxableIncome,
        tax_base_annualised: taxTable?.isAnnual ? taxBase : null,
        bands,
        monthly_paye: monthlyPaye,
        aids_levy: aidsLevy,
        total_paye_recalculated: totalPayeCalc,
        total_paye_stored: Number(p.totalPaye),
        match: totalPayeCalc === Number(p.totalPaye),
      },
    });
  } catch (err) {
    console.error('[debug-paye]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
