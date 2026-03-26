
const { processDailyLogs, buildPayrollInputsFromAttendance } = require('./backend/lib/attendanceEngine');

// Mock Data
const mockShift = {
  normalHours: 8,
  ot1Threshold: 2,
  ot1Multiplier: 1.5,
  ot2Multiplier: 2.0,
  breakMinutes: 60
};

const mockEmployee = {
  id: 'emp-1',
  firstName: 'John',
  lastName: 'Doe',
  baseRate: 1000,
  hoursPerPeriod: 160,
  currency: 'USD'
};

const date = new Date('2026-03-25'); // A Wednesday

const mockLogs = [
  { punchTime: '2026-03-25T08:00:00', punchType: 'IN' },
  { punchTime: '2026-03-25T20:00:00', punchType: 'OUT' }
];

console.log('--- DIAGNOSTIC CALCULATION ---');
console.log('Employee Base Rate:', mockEmployee.baseRate);
console.log('Hours per Period:', mockEmployee.hoursPerPeriod);
const hourlyRate = mockEmployee.baseRate / mockEmployee.hoursPerPeriod;
console.log('Calculated Hourly Rate:', hourlyRate);

const dailyResult = processDailyLogs(mockLogs, mockShift, date);
console.log('\nDaily Result (Wednesday):');
console.log('Total Work Minutes:', dailyResult.totalMinutes);
console.log('Normal Minutes:', dailyResult.normalMinutes, `(${dailyResult.normalMinutes/60} hrs)`);
console.log('OT1 Minutes (1.5x):', dailyResult.ot1Minutes, `(${dailyResult.ot1Minutes/60} hrs)`);
console.log('OT2 Minutes (2.0x):', dailyResult.ot2Minutes, `(${dailyResult.ot2Minutes/60} hrs)`);

const records = [{
  ...dailyResult,
  employeeId: mockEmployee.id,
  employee: mockEmployee,
  shift: mockShift
}];

const inputs = buildPayrollInputsFromAttendance(records, { normalTcId: 'normal', ot1TcId: 'ot1', ot2TcId: 'ot2' }, '2026-03');

console.log('\nGenerated Payroll Inputs:');
inputs.forEach(inp => {
  console.log(`- ${inp.notes}: $${inp.employeeUSD}`);
});

// Saturday test
console.log('\n--- Saturday Test ---');
const satDate = new Date('2026-03-28');
const satResult = processDailyLogs(mockLogs, mockShift, satDate);
const satRecords = [{ ...satResult, employeeId: mockEmployee.id, employee: mockEmployee, shift: mockShift }];
const satInputs = buildPayrollInputsFromAttendance(satRecords, { normalTcId: 'normal', ot1TcId: 'ot1', ot2TcId: 'ot2' }, '2026-03');
satInputs.forEach(inp => {
  console.log(`- ${inp.notes}: $${inp.employeeUSD}`);
});
