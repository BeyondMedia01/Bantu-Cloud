import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

async function getRunForCompany(runId: string, companyId: string | undefined) {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    select: {
      id: true, companyId: true, startDate: true, endDate: true, dualCurrency: true, currency: true,
      payrollCalendar: { select: { year: true, month: true } },
    },
  });
  if (!run) return null;
  if (!companyId || run.companyId !== companyId) return null;
  return run;
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

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: runId },
      include: {
        employee: {
          select: {
            employeeCode: true, firstName: true, lastName: true,
            tin: true, nationalId: true, passportNumber: true,
          },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    const period = run.startDate ? new Date(run.startDate) : new Date();
    const month = String(run.payrollCalendar?.month || (period.getMonth() + 1)).padStart(2, '0');
    const year = run.payrollCalendar?.year || period.getFullYear();

    const header = [
      'EmployeeCode', 'TIN', 'Surname', 'OtherNames', 'IDPassport',
      'Month', 'Year', 'GrossIncome', 'AllowableDeductions', 'TaxableIncome',
      'TaxableIncomeAnnual', 'PAYE', 'AIDSLevy', 'TotalTaxDeducted',
    ].join(',');

    const rows = payslips.map((p) => {
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
        p.employee.employeeCode || '',
        p.employee.tin || '',
        `"${(p.employee.lastName || '').replace(/"/g, '""')}"`,
        `"${(p.employee.firstName || '').replace(/"/g, '""')}"`,
        p.employee.nationalId || p.employee.passportNumber || '',
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

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: c.req.param('runId') },
      include: {
        employee: {
          select: {
            employeeCode: true, firstName: true, lastName: true,
            nationalId: true, passportNumber: true, socialSecurityNum: true,
          },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    const period = run.startDate ? new Date(run.startDate) : new Date();
    const month = String(run.payrollCalendar?.month || (period.getMonth() + 1)).padStart(2, '0');
    const year = run.payrollCalendar?.year || period.getFullYear();
    const employerCode = company.nssaNumber;

    const header = [
      'EmployerCode', 'NSSANumber', 'NationalID', 'Surname', 'Firstname',
      'Month', 'Year', 'PensionableEarnings', 'EmployeeContribution',
      'EmployerContribution', 'TotalContribution',
    ].join(',');

    const rows = payslips.map((p) => {
      const nssaEmp = p.nssaEmployee ?? 0;
      const nssaEmpr = p.nssaEmployer ?? nssaEmp;
      const total = (nssaEmp + nssaEmpr).toFixed(2);
      const gross = p.gross ?? 0;
      const pensionable = (p.nssaBasis != null && p.nssaBasis > 0)
        ? p.nssaBasis.toFixed(2)
        : gross.toFixed(2);

      return [
        employerCode,
        p.employee.socialSecurityNum || '',
        p.employee.nationalId || p.employee.passportNumber || '',
        `"${(p.employee.lastName || '').replace(/"/g, '""')}"`,
        `"${(p.employee.firstName || '').replace(/"/g, '""')}"`,
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
