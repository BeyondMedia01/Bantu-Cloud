import { Resend } from 'resend';

let RESEND_API_KEY = '';
let FROM = 'Bantu Payroll <no-reply@thinkbantu.com>';
let FRONTEND_URL = 'https://payroll.thinkbantu.com';
export function initMailer(apiKey: string, fromEmail?: string, frontendUrl?: string): void {
  RESEND_API_KEY = apiKey;
  if (fromEmail) FROM = fromEmail;
  if (frontendUrl) FRONTEND_URL = frontendUrl;
  resend = null;
}

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
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#0f172a;padding:24px 32px;text-align:center;">
            <img src="https://payroll.thinkbantu.com/logo.svg" alt="Bantu Payroll" width="40" height="40" style="display:inline-block;vertical-align:middle;margin-right:10px;">
            <span style="color:#ffffff;font-size:18px;font-weight:bold;vertical-align:middle;letter-spacing:0.02em;">Bantu Payroll</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Bantu Payroll · <a href="https://payroll.thinkbantu.com" style="color:#94a3b8;">payroll.thinkbantu.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail(opts: any): Promise<void> {
  const { data, error } = await getClient().emails.send(opts);
  if (error) {
    console.error('[mailer] Failed to send email:', error);
    throw new Error(`Email send failed: ${error.message}`);
  }
}

export async function sendPasswordReset(to: string, resetUrl: string): Promise<void> {
  await sendEmail({
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
  await sendEmail({
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
  await sendEmail({
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

export async function sendNotification(to: string, opts: { subject: string; body: string }): Promise<void> {
  await sendEmail({
    from: FROM,
    to,
    subject: opts.subject,
    html: buildHtml(`
      <h2 style="color:#0f172a;">Notification</h2>
      <p>${opts.body}</p>
    `),
  });
}

export async function sendTrialSignupWelcome(to: string, name: string, companyName: string): Promise<void> {
  await sendEmail({
    from: FROM,
    to,
    subject: `Welcome to Bantu Payroll, ${name.split(' ')[0]}! Complete your setup`,
    html: buildHtml(`
      <h2 style="color:#0f172a;">Welcome to Bantu Payroll!</h2>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your account for <strong>${companyName}</strong> has been created. You're almost ready to start managing payroll!</p>
      <p>Click the button below to complete your onboarding and set up your first employee.</p>
      <a href="${FRONTEND_URL}/trial-onboarding" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#0f172a;color:#fff;border-radius:9999px;text-decoration:none;font-weight:bold;">Complete Setup</a>
      <p style="color:#64748b;font-size:13px;">Your 30-day free trial starts now. Complete onboarding to get the most out of your trial.</p>
    `),
  });
}

export async function sendPayslip(
  to: string,
  opts: { employeeName: string; companyName: string; period: string; pdfBuffer?: Buffer; pdfUrl?: string | null; payslipHtml?: string }
): Promise<void> {
  const safeFilename = `payslip-${opts.period.replace(/[^a-z0-9]/gi, '-')}.pdf`;
  const hasAttachment = !!opts.pdfBuffer;
  const hasLink = !!opts.pdfUrl;
  const hasInline = !!opts.payslipHtml;

  let bodyHtml = `<h2 style="color:#0f172a;">Your Payslip</h2>
    <p>Dear <strong>${opts.employeeName}</strong>,</p>`;

  if (hasAttachment) {
    bodyHtml += `<p>Please find your payslip for <strong>${opts.period}</strong> attached to this email.</p>`;
  } else if (hasLink) {
    bodyHtml += `<p>Your payslip for <strong>${opts.period}</strong> is ready.</p>`;
  } else {
    bodyHtml += `<p>Your payslip for <strong>${opts.period}</strong> is now available. Please log in to view it.</p>`;
  }

  if (hasInline) {
    bodyHtml += opts.payslipHtml;
  }

  if (hasLink) {
    bodyHtml += `<p style="margin-top:16px"><a href="${opts.pdfUrl}" style="display:inline-block;padding:10px 20px;background:#0f172a;color:#fff;border-radius:9999px;text-decoration:none;font-weight:bold;">Download Payslip</a></p>`;
  }

  if (!hasInline && !hasAttachment) {
    bodyHtml += `<p><a href="${FRONTEND_URL}" style="display:inline-block;padding:10px 20px;background:#0f172a;color:#fff;border-radius:9999px;text-decoration:none;font-weight:bold;">Log In to Bantu Payroll</a></p>`;
  }

  bodyHtml += `<p style="color:#64748b;font-size:13px;">This is an automated email. Please do not reply directly to this message.</p>
    <p>— ${opts.companyName}</p>`;

  const emailOpts: any = {
    from: FROM,
    to,
    subject: `Your payslip — ${opts.companyName} (${opts.period})`,
    html: buildHtml(bodyHtml),
  };

  if (hasAttachment) {
    emailOpts.attachments = [{ filename: safeFilename, content: opts.pdfBuffer }];
  }

  await sendEmail(emailOpts);
}
