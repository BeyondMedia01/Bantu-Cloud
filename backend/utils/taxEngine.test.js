import { describe, it, expect } from 'vitest';
const { calculatePaye } = require('./taxEngine');

describe('Tax Engine — Zimbabwean PAYE (FDS)', () => {
  it('should calculate 0 tax for low income (under $100 USD)', () => {
    const result = calculatePaye({ baseSalary: 80, currency: 'USD' });
    expect(result.totalPaye).toBe(0);
    expect(result.aidsLevy).toBe(0);
  });

  it('should calculate correct tax for medium income ($1500 USD)', () => {
    // 1500 USD:
    // NSSA: min(1500, 700) * 0.045 = 31.5
    // Taxable Income: 1500 - 31.5 = 1468.5
    // Band 1000-2000: 215 + (1468.5 - 1000) * 0.30 = 215 + 140.55 = 355.55
    // Aids levy: 355.55 * 0.03 = 10.6665
    // Total paye: 355.55 + 10.6665 = 366.2165
    
    const taxBrackets = [
      { lowerBound: 0, upperBound: 1000, rate: 0.215, fixedAmount: 0 },
      { lowerBound: 1000, upperBound: 2000, rate: 0.30, fixedAmount: 215 },
    ];
    
    const result = calculatePaye({ baseSalary: 1500, currency: 'USD', taxBrackets });
    expect(result.payeBeforeLevy).toBeCloseTo(355.55, 2);
    expect(result.aidsLevy).toBeCloseTo(10.67, 2);
    expect(result.totalPaye).toBeCloseTo(366.22, 2);
  });

  it('should apply NSSA ceiling correctly', () => {
    // USD Ceiling is 700. 700 * 0.045 = 31.5
    const resultHigh = calculatePaye({ baseSalary: 5000, currency: 'USD' });
    expect(resultHigh.nssaEmployee).toBe(31.5);

    const resultLow = calculatePaye({ baseSalary: 500, currency: 'USD' });
    expect(resultLow.nssaEmployee).toBe(500 * 0.045);
  });

  it('should include motor vehicle benefit in taxable income but not in NSSA basis', () => {
    // base 1000, mv benefit 200
    // nssa basis: min(1000, 700) -> 31.5
    // taxable income: 1000 + 200 - 31.5 = 1168.5
    const result = calculatePaye({ 
      baseSalary: 1000, 
      currency: 'USD',
      motorVehicleBenefit: 200 
    });
    expect(result.nssaEmployee).toBe(31.5);
    expect(result.taxableIncome).toBe(1168.5);
  });
});
