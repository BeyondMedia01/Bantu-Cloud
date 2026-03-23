const { payslipToBuffer } = require('../utils/payslipFormatter');
const mailer = require('./mailer');

/**
 * Processes a single job from the queue.
 * @param {Object} job - The job record from Prisma.
 */
async function processJob(job) {
  console.log(`[worker] Processing job ${job.id} (type: ${job.type})`);

  switch (job.type) {
    case 'EMAIL_PAYSLIP':
      await processEmailPayslip(job);
      break;
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

/**
 * Specifically handles the EMAIL_PAYSLIP job.
 * payload: { payslipId: string }
 */
async function processEmailPayslip(job) {
  const { payslipId } = job.payload;

  if (!payslipId) {
    throw new Error('Missing payslipId in job payload');
  }

  // Use the shared formatter to get the PDF buffer and metadata
  const result = await payslipToBuffer(payslipId);

  if (!result) {
    throw new Error(`Payslip not found or data missing for ID: ${payslipId}`);
  }

  if (!result.email) {
    console.warn(`[worker] Skipping payslip ${payslipId}: Employee has no email address`);
    return;
  }

  // 4. Send Email
  await mailer.sendPayslip(result.email, {
    employeeName: result.employeeName,
    companyName: result.companyName,
    period: result.period,
    pdfBuffer: result.buffer,
  });

  console.log(`[worker] Email sent for payslip ${payslipId} to ${result.email}`);
}

module.exports = { processJob };
