require('dotenv').config();
const prisma = require('./lib/prisma');
const { generatePayslipSummaryBuffer } = require('./utils/pdfService');

async function test() {
  try {
    const run = await prisma.payrollRun.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { company: true },
    });
    if (!run) return console.log('No run');

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: run.id },
      include: {
        employee: { include: { department: true } },
        transactions: { include: { transactionCode: true } }
      },
    });

    console.log(`Found ${payslips.length} payslips for run ${run.id}`);
    
    // We can't import buildPayslipLineItems easily because it's inside payroll.js which is a router
    // We'll just define a mock groups logic
    const groupsMap = {};
    for (const ps of payslips) {
      const gName = ps.employee.department?.name || ps.employee.costCenter || 'General';
      if (!groupsMap[gName]) groupsMap[gName] = [];
      groupsMap[gName].push({
        ...ps,
        displayLines: [{ name: 'Basic', allowance: 1000 }] // mock lines
      });
    }

    const sortedGroups = Object.keys(groupsMap).sort().map(name => ({
      name,
      payslips: groupsMap[name]
    }));

    const buffer = await generatePayslipSummaryBuffer({
      companyName: run.company?.name || 'Bantu - HR & Payroll',
      period: `${run.startDate.getFullYear()}/${(run.startDate.getMonth() + 1).toString().padStart(2, '0')}`,
      groups: sortedGroups,
    });

    console.log(`Generated buffer of length ${buffer.length}`);
    require('fs').writeFileSync('test-out.pdf', buffer);
    console.log('Saved to test-out.pdf');
  } catch (err) {
    console.error('Error generating:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
