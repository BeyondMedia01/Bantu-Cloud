const nodemailer = require('nodemailer');

// Configured via environment variables:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  — standard SMTP (SendGrid, Mailgun, etc.)
//   EMAIL_FROM                                  — sender address
//
// If SMTP_HOST is not set, mail is silently logged in dev / test environments.

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      console.error('WARNING: SMTP_HOST not configured. Emails will NOT be delivered.');
    }
    // Ethereal-style dev fallback — logs to console
    transporter = {
      sendMail: (opts) => {
        console.log('[mailer] DEV mode — email not sent:', {
          to: opts.to,
          subject: opts.subject,
        });
        console.log('[mailer] Body:', opts.text || opts.html);
        return Promise.resolve({ messageId: 'dev-no-op' });
      },
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

const FROM = process.env.EMAIL_FROM || 'Bantu Payroll <no-reply@bantu.io>';

/**
 * Send password reset email.
 * @param {string} to - recipient email
 * @param {string} resetUrl - full URL with token, e.g. https://app.bantu.io/reset-password?token=xxx
 */
async function sendPasswordReset(to, resetUrl) {
  return getTransporter().sendMail({
    from: FROM,
    to,
    subject: 'Reset your Bantu Payroll password',
    text: `You requested a password reset.\n\nClick the link below to set a new password (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
        <h2 style="color:#0f172a;">Reset your password</h2>
        <p>You requested a password reset for your Bantu Payroll account.</p>
        <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#0f172a;color:#fff;border-radius:9999px;text-decoration:none;font-weight:bold;">
          Reset Password
        </a>
        <p style="color:#64748b;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

/**
 * Send employee invitation email.
 * @param {string} to - recipient email
 * @param {string} inviteUrl - full URL with token
 * @param {string} companyName - company display name
 */
async function sendEmployeeInvite(to, inviteUrl, companyName) {
  return getTransporter().sendMail({
    from: FROM,
    to,
    subject: `You've been invited to ${companyName} on Bantu Payroll`,
    text: `You've been invited to access your payslips and HR information on Bantu Payroll.\n\nClick the link below to set up your account:\n\n${inviteUrl}\n\nThis link expires in 72 hours.`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
        <h2 style="color:#0f172a;">Welcome to Bantu Payroll</h2>
        <p>You've been invited to access your payslips and HR information at <strong>${companyName}</strong>.</p>
        <p>Click the button below to set up your account. This link expires in <strong>72 hours</strong>.</p>
        <a href="${inviteUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#0f172a;color:#fff;border-radius:9999px;text-decoration:none;font-weight:bold;">
          Set Up Account
        </a>
      </div>
    `,
  });
}

/**
 * Send payroll completion notification to CLIENT_ADMIN.
 */
async function sendPayrollComplete(to, { companyName, period, employeeCount, runId }) {
  return getTransporter().sendMail({
    from: FROM,
    to,
    subject: `Payroll processed — ${companyName} (${period})`,
    text: `Your payroll run for ${companyName} (${period}) has completed successfully.\n\n${employeeCount} payslips generated.\n\nView run: ${process.env.FRONTEND_URL}/payroll/${runId}/payslips`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
        <h2 style="color:#0f172a;">Payroll Processed ✓</h2>
        <p>Your payroll run for <strong>${companyName}</strong> (${period}) has completed successfully.</p>
        <p><strong>${employeeCount}</strong> payslips were generated.</p>
        <a href="${process.env.FRONTEND_URL}/payroll/${runId}/payslips" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#0f172a;color:#fff;border-radius:9999px;text-decoration:none;font-weight:bold;">
          View Payslips
        </a>
      </div>
    `,
  });
}

/**
 * Send an individual payslip to an employee as a PDF attachment.
 * @param {string} to - recipient email
 * @param {{ employeeName: string, companyName: string, period: string, pdfBuffer: Buffer }} opts
 */
async function sendPayslip(to, { employeeName, companyName, period, pdfBuffer }) {
  const safeFilename = `payslip-${period.replace(/[^a-z0-9]/gi, '-')}.pdf`;
  return getTransporter().sendMail({
    from: FROM,
    to,
    subject: `Your payslip — ${companyName} (${period})`,
    text: `Dear ${employeeName},\n\nPlease find your payslip for ${period} attached.\n\nRegards,\n${companyName}`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
        <h2 style="color:#0f172a;">Your Payslip</h2>
        <p>Dear <strong>${employeeName}</strong>,</p>
        <p>Please find your payslip for <strong>${period}</strong> attached to this email.</p>
        <p style="color:#64748b;font-size:13px;">This is an automated email. Please do not reply directly to this message.</p>
        <p>— ${companyName}</p>
      </div>
    `,
    attachments: [{
      filename: safeFilename,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}

module.exports = { sendPasswordReset, sendEmployeeInvite, sendPayrollComplete, sendPayslip };
