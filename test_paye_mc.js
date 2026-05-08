const { calculatePaye } = require('./backend/utils/taxEngine.js');
console.log("PAYE calculation logic:");

// mock some tax brackets
const taxBracketsUSD = [
  { lowerBound: 0, upperBound: 100, rate: 0, fixedAmount: 0 },
  { lowerBound: 100, upperBound: 500, rate: 0.2, fixedAmount: 0 },
  { lowerBound: 500, upperBound: 9999999, rate: 0.3, fixedAmount: 80 }
];

const taxBracketsZIG = [
  { lowerBound: 0, upperBound: 1500, rate: 0, fixedAmount: 0 },
  { lowerBound: 1500, upperBound: 7500, rate: 0.2, fixedAmount: 0 },
  { lowerBound: 7500, upperBound: 9999999, rate: 0.3, fixedAmount: 1200 }
];

const baseRate = 1000;
const xr = 15;
const emp = { currency: 'USD' };
const baseUSD = emp.currency === 'USD' ? baseRate : baseRate / xr;
const baseZIG = emp.currency === 'ZiG' ? baseRate : baseRate * xr;

console.log("baseUSD:", baseUSD);
console.log("baseZIG:", baseZIG);

const resultUSD = calculatePaye({
  baseSalary: baseUSD, currency: 'USD',
  taxBrackets: taxBracketsUSD,
  nssaCeiling: 700,
});
console.log("resultUSD PAYE:", resultUSD.payeBeforeLevy);
console.log("resultUSD net:", resultUSD.netSalary);

const resultZIG = calculatePaye({
  baseSalary: baseZIG, currency: 'ZiG',
  taxBrackets: taxBracketsZIG,
  nssaCeiling: 20000,
});
console.log("resultZIG PAYE:", resultZIG.payeBeforeLevy);
console.log("resultZIG net:", resultZIG.netSalary);
