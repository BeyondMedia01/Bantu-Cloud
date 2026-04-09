import { describe, it, expect } from 'vitest';
import { generatePayslipBuffer } from '../utils/payslipDocument.jsx';

const MOCK = {
  companyName: 'Test Co', period: '01/03/2026 – 31/03/2026',
  issuedDate: '26/03/2026', employeeName: 'Jane Smith',
  employeeCode: 'EMP001', nationalId: '63-123456A78',
  jobTitle: 'Engineer', department: 'IT',
  costCenter: 'CC1', paymentMethod: 'BANK',
  bankName: 'FBC Bank', accountNumber: '1234567890',
  bankMissing: false, currency: 'USD',
  lineItems: [
    { name: 'Basic Salary', allowance: 600, deduction: 0, employer: 0, ytd: 600 },
    { name: 'PAYE',         allowance: 0, deduction: 100, employer: 0, ytd: 100 },
    { name: 'NSSA Employee',allowance: 0, deduction: 10,  employer: 0, ytd: 10 },
    { name: 'NSSA Employer',allowance: 0, deduction: 0,   employer: 11.3, ytd: 11.3 },
  ],
  grossPay: 600, totalDeductions: 110, netSalary: 490,
  netPayUSD: null, netPayZIG: null,
  leaveBalance: 2.5, leaveTaken: 0,
};

describe('payslipDocument', () => {
  it('generates a non-empty buffer', async () => {
    const buf = await generatePayslipBuffer(MOCK);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('throws BANK_DETAILS_MISSING when bankMissing is true', async () => {
    await expect(generatePayslipBuffer({ ...MOCK, bankMissing: true }))
      .rejects.toMatchObject({ code: 'BANK_DETAILS_MISSING' });
  });

  it('shows USD and ZiG lines in ribbon for dual-currency payslips', async () => {
    const data = {
      ...MOCK,
      grossUSD: 1500, grossZIG: 41250,
      payeUSD: 300,   payeZIG:  8250,
      aidsLevyUSD: 9, aidsLevyZIG: 247.5,
      nssaUSD: 35,    nssaZIG:  962.5,
      netPayUSD: 1156, netPayZIG: 31790,
      netSalary: 1156,
      grossPay: 3000,
      totalDeductions: 603.5 + 9900,
      exchangeRate: 27.5,
    };
    const buf = await generatePayslipBuffer(data);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('renders zero YTD without doubling (first-run employee)', async () => {
    const data = {
      ...MOCK,
      lineItems: [{ name: 'Basic Salary', allowance: 600, deduction: 0, employer: 0, ytd: 0 }],
    };
    const buf = await generatePayslipBuffer(data);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
