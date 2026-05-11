import { Resend } from 'resend';

let RESEND_API_KEY = '';
let FROM = 'Bantu Payroll <no-reply@bantu.io>';
let FRONTEND_URL = 'https://app.bantu.io';
export function initMailer(apiKey: string): void { RESEND_API_KEY = apiKey; resend = null; }

let resend: Resend | null = null;

function getClient(): Resend {
  if (!resend) {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resend = new Resend(RESEND_API_KEY);
  }
  return resend;
}

function buildHtml(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">${body}</body></html>`;
}

export async function sendPasswordReset(to: string, resetUrl: string): Promise<void> {
  await getClient().emails.send({
    from: FROM,
    to,
    subject: 'Reset your Bantu Payroll password',
    html: buildHtml(`
      <h2 style="color:#0f172a;">Reset your password</h2>
      <p>You requested a password reset for your Bantu Payroll account.</p>
      <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#0f172a;color:#fff;border-radius:9999px;text-decoration:none;font-weight:bold;">Reset Password</a>
      <p style="color:#64748b;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
    `),
  });
}

export async function sendEmployeeInvite(to: string, inviteUrl: string, companyName: string): Promise<void> {
  await getClient().emails.send({
    from: FROM,
    to,
    subject: `You've been invited to ${companyName} on Bantu Payroll`,
    html: buildHtml(`
      <h2 style="color:#0f172a;">Welcome to Bantu Payroll</h2>
      <p>You've been invited to access your payslips and HR information at <strong>${companyName}</strong>.</p>
      <p>Click the button below to set up your account. This link expires in <strong>72 hours</strong>.</p>
      <a href="${inviteUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#0f172a;color:#fff;border-radius:9999px;text-decoration:none;font-weight:bold;">Set Up Account</a>
    `),
  });
}

export async function sendPayrollComplete(to: string, opts: { companyName: string; period: string; employeeCount: number; runId: string }): Promise<void> {
  await getClient().emails.send({
    from: FROM,
    to,
    subject: `Payroll processed — ${opts.companyName} (${opts.period})`,
    html: buildHtml(`
      <h2 style="color:#0f172a;">Payroll Processed ✓</h2>
      <p>Your payroll run for <strong>${opts.companyName}</strong> (${opts.period}) has completed successfully.</p>
      <p><strong>${opts.employeeCount}</strong> payslips were generated.</p>
      <a href="${FRONTEND_URL}/payroll/${opts.runId}/payslips" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#0f172a;color:#fff;border-radius:9999px;text-decoration:none;font-weight:bold;">View Payslips</a>
    `),
  });
}

export async function sendPayslip(
  to: string,
  opts: { employeeName: string; companyName: string; period: string; pdfBuffer: Buffer }
): Promise<void> {
  const safeFilename = `payslip-${opts.period.replace(/[^a-z0-9]/gi, '-')}.pdf`;
  await getClient().emails.send({
    from: FROM,
    to,
    subject: `Your payslip — ${opts.companyName} (${opts.period})`,
    html: buildHtml(`
      <h2 style="color:#0f172a;">Your Payslip</h2>
      <p>Dear <strong>${opts.employeeName}</strong>,</p>
      <p>Please find your payslip for <strong>${opts.period}</strong> attached to this email.</p>
      <p style="color:#64748b;font-size:13px;">This is an automated email. Please do not reply directly to this message.</p>
      <p>— ${opts.companyName}</p>
    `),
    attachments: [{ filename: safeFilename, content: opts.pdfBuffer }],
  });
}
