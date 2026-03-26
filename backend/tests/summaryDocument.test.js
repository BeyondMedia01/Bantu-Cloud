import { describe, it, expect } from 'vitest';
import { generatePayslipSummaryBuffer } from '../utils/summaryDocument.jsx';

const MOCK = {
  companyName: 'Test Co', period: '2026/03',
  date: '26/03/2026', time: '09:00',
  groups: [
    {
      name: 'Engineering',
      payslips: [
        {
          currency: 'USD', netPay: 490,
          employee: { employeeCode: 'EMP001', firstName: 'Jane', lastName: 'Smith' },
          displayLines: [
            { name: 'Basic Salary', allowance: 600, deduction: 0,   employer: 0,    ytd: 600 },
            { name: 'PAYE',         allowance: 0,   deduction: 100, employer: 0,    ytd: 100 },
            { name: 'NSSA Employer',allowance: 0,   deduction: 0,   employer: 11.3, ytd: 11.3 },
          ],
        },
      ],
    },
  ],
};

describe('summaryDocument', () => {
  it('generates a non-empty buffer', async () => {
    const buf = await generatePayslipSummaryBuffer(MOCK);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('handles empty groups array', async () => {
    const buf = await generatePayslipSummaryBuffer({ ...MOCK, groups: [] });
    expect(buf).toBeInstanceOf(Buffer);
  });
});
