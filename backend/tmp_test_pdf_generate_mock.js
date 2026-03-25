const { generatePayslipSummaryBuffer } = require('./utils/pdfService');

async function test() {
  try {
    const data = {
      companyName: 'Test Company',
      period: '2023/10',
      groups: [
        {
          name: 'Engineering',
          payslips: [{
            employee: { firstName: 'John', lastName: 'Doe', employeeCode: 'E01' },
            displayLines: [
              { name: 'Basic', allowance: 1000 },
              { name: 'PAYE', deduction: 100 },
              { name: 'NSSA', deduction: 50, employer: 50 }
            ]
          }]
        }
      ]
    };

    console.log('Generating buffer...');
    const buffer = await generatePayslipSummaryBuffer(data);
    console.log(`Generated buffer of length ${buffer.length}`);
    require('fs').writeFileSync('test-out-static.pdf', buffer);
    console.log('Saved to test-out-static.pdf');
  } catch (err) {
    console.error('Error generating:', err);
  }
}

test();
