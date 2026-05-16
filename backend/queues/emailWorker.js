const { Worker } = require('bullmq');
const connection = require('../lib/redis');
const { payslipToBuffer } = require('../utils/payslipFormatter');
const { sendPayslip } = require('../lib/mailer');

function createEmailWorker() {
  const worker = new Worker('email-dispatch', async (job) => {
    const { payslipId } = job.data;
    if (!payslipId) throw new Error('Missing payslipId in job data');

    const result = await payslipToBuffer(payslipId);
    if (!result) throw new Error(`Payslip not found: ${payslipId}`);

    if (!result.email) {
      console.warn(`[EmailWorker] Skipping payslip ${payslipId}: no email address`);
      return;
    }

    await sendPayslip(result.email, {
      employeeName: result.employeeName,
      companyName: result.companyName,
      period: result.period,
      pdfBuffer: result.buffer,
    });

    console.log(`[EmailWorker] Sent payslip ${payslipId} to ${result.email}`);
  }, {
    connection,
    concurrency: 10,
  });

  worker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} failed after all retries:`, err.message);
  });

  return worker;
}

module.exports = { createEmailWorker };
