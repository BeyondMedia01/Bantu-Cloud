import { Hono } from 'hono';
import { prisma, getSql } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

async function getRunForCompany(runId: string, companyId: string | undefined) {
  const sql = getSql();
  const rows = await sql`
    SELECT pr.id, pr."companyId", pr."startDate", pr."endDate", pr."dualCurrency", pr.currency,
      pc.year AS cal_year, pc.month AS cal_month
    FROM "PayrollRun" pr
    LEFT JOIN "PayrollCalendar" pc ON pc.id = pr."payrollCalendarId"
    WHERE pr.id = ${runId}
  `;
  if (!rows.length) return null;
  const r = rows[0] as any;
  if (!companyId || r.companyId !== companyId) return null;
  return {
    id: r.id, companyId: r.companyId, startDate: r.startDate, endDate: r.endDate,
    dualCurrency: r.dualCurrency, currency: r.currency,
    payrollCalendar: r.cal_year ? { year: r.cal_year, month: r.cal_month } : null,
  };
}

router.get('/zimra-paye/:runId', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const companyForCheck = await prisma.company.findUnique({
      where: { id: companyId },
      select: { taxId: true, registrationNumber: true },
    });
    if (!companyForCheck?.taxId) {
      return c.json({ message: 'Company TIN (taxId) is required for ZIMRA e-filing export. Configure it under Company Settings.' }, 422);
    }
    if (!companyForCheck?.registrationNumber) {
      return c.json({ message: 'Company BP Number (registrationNumber) is required for ZIMRA e-filing export. Configure it under Company Settings.' }, 422);
    }

    const runId = c.req.param('runId');
    if (!runId) return c.json({ message: 'Run ID is required' }, 400);
    const run = await getRunForCompany(runId, companyId);
    if (!run) return c.json({ message: 'Payroll run not found' }, 404);

    const sql = getSql();
    const payslips = await sql`
      SELECT ps.*,
        e."employeeCode", e."firstName", e."lastName", e.tin, e."nationalId", e."passportNumber"
      FROM "Payslip" ps
      JOIN "Employee" e ON e.id = ps."employeeId"
      WHERE ps."payrollRunId" = ${runId}
      ORDER BY ps."employeeId" ASC
    `;

    const period = run.startDate ? new Date(run.startDate) : new Date();
    const month = String(run.payrollCalendar?.month || (period.getMonth() + 1)).padStart(2, '0');
    const year = run.payrollCalendar?.year || period.getFullYear();

    const header = [
      'EmployeeCode', 'TIN', 'Surname', 'OtherNames', 'IDPassport',
      'Month', 'Year', 'GrossIncome', 'AllowableDeductions', 'TaxableIncome',
      'TaxableIncomeAnnual', 'PAYE', 'AIDSLevy', 'TotalTaxDeducted',
    ].join(',');

    const rows = (payslips as any[]).map((p) => {
      const gross = p.gross ?? 0;
      const paye = p.paye ?? 0;
      const aidsLevy = p.aidsLevy ?? 0;
      const nssa = p.nssaEmployee ?? 0;
      const pension = p.pensionApplied ?? 0;
      const allowableDeductions = nssa + pension;
      const taxable = Math.max(0, gross - allowableDeductions);
      const annualTaxable = (taxable * 12).toFixed(2);
      const totalTax = (paye + aidsLevy).toFixed(2);

      return [
        p.employeeCode || '',
        p.tin || '',
        `"${(p.lastName || '').replace(/"/g, '""')}"`,
        `"${(p.firstName || '').replace(/"/g, '""')}"`,
        p.nationalId || p.passportNumber || '',
        month,
        year,
        gross.toFixed(2),
        allowableDeductions.toFixed(2),
        taxable.toFixed(2),
        annualTaxable,
        paye.toFixed(2),
        aidsLevy.toFixed(2),
        totalTax,
      ].join(',');
    });

    const filename = `ZIMRA-PAYE-P2-${year}-${month}.csv`;
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body([header, ...rows].join('\n'));
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/nssa/:runId', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const runId = c.req.param('runId');
    if (!runId) return c.json({ message: 'Run ID is required' }, 400);
    const run = await getRunForCompany(runId, companyId);
    if (!run) return c.json({ message: 'Payroll run not found' }, 404);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, registrationNumber: true, taxId: true, nssaNumber: true },
    });

    if (!company?.nssaNumber) {
      return c.json({ message: 'NSSA employer registration number is required for NSSA CSV export. Configure it under Company Settings.' }, 422);
    }

    const sql = getSql();
    const payslips = await sql`
      SELECT ps.*,
        e."employeeCode", e."firstName", e."lastName",
        e."nationalId", e."passportNumber", e."socialSecurityNum"
      FROM "Payslip" ps
      JOIN "Employee" e ON e.id = ps."employeeId"
      WHERE ps."payrollRunId" = ${c.req.param('runId')}
      ORDER BY ps."employeeId" ASC
    `;

    const period = run.startDate ? new Date(run.startDate) : new Date();
    const month = String(run.payrollCalendar?.month || (period.getMonth() + 1)).padStart(2, '0');
    const year = run.payrollCalendar?.year || period.getFullYear();
    const employerCode = company.nssaNumber;

    const header = [
      'EmployerCode', 'NSSANumber', 'NationalID', 'Surname', 'Firstname',
      'Month', 'Year', 'PensionableEarnings', 'EmployeeContribution',
      'EmployerContribution', 'TotalContribution',
    ].join(',');

    const rows = (payslips as any[]).map((p) => {
      const nssaEmp = p.nssaEmployee ?? 0;
      const nssaEmpr = p.nssaEmployer ?? nssaEmp;
      const total = (nssaEmp + nssaEmpr).toFixed(2);
      const gross = p.gross ?? 0;
      const pensionable = (p.nssaBasis != null && p.nssaBasis > 0)
        ? p.nssaBasis.toFixed(2)
        : gross.toFixed(2);

      return [
        employerCode,
        p.socialSecurityNum || '',
        p.nationalId || p.passportNumber || '',
        `"${(p.lastName || '').replace(/"/g, '""')}"`,
        `"${(p.firstName || '').replace(/"/g, '""')}"`,
        month,
        year,
        pensionable,
        nssaEmp.toFixed(2),
        nssaEmpr.toFixed(2),
        total,
      ].join(',');
    });

    const filename = `NSSA-${year}-${month}.csv`;
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body([header, ...rows].join('\n'));
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
