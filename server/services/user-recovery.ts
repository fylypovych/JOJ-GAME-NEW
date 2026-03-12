import type { LogLine } from '../routes/types';

type MailTransporter = {
  sendMail: (message: {
    from: string | undefined;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<unknown>;
};

let transporterPromise: Promise<MailTransporter> | null = null;

const hasSmtpConfig = () => Boolean((process.env.SMTP_HOST ?? '').trim() && (process.env.SMTP_FROM ?? '').trim());

const getTransporter = async () => {
  if (!transporterPromise) {
    transporterPromise = import('nodemailer').then((module) => module.default.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: String(process.env.SMTP_SECURE ?? '').trim() === 'true',
      auth: (process.env.SMTP_USER ?? '').trim()
        ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
        : undefined,
    }) as MailTransporter);
  }
  return transporterPromise;
};

export const deliverPasswordReset = async (args: {
  usernameOrEmail: string;
  token: string;
  expiresAt: string;
  logLine: LogLine;
}) => {
  const { usernameOrEmail, token, expiresAt, logLine } = args;
  const webhookUrl = (process.env.PASSWORD_RESET_WEBHOOK_URL ?? '').trim();
  const frontendBaseUrl = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '');
  const resetLink = `${frontendBaseUrl}/?resetToken=${encodeURIComponent(token)}`;
  if (hasSmtpConfig()) {
    const transporter = await getTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: usernameOrEmail,
      subject: 'JOJ password reset',
      text: [
        'You requested a password reset for your JOJ account.',
        `Reset link: ${resetLink}`,
        `Reset token: ${token}`,
        `Expires at: ${expiresAt}`,
      ].join('\n'),
      html: [
        '<p>You requested a password reset for your JOJ account.</p>',
        `<p><a href="${resetLink}">Reset password</a></p>`,
        `<p>Reset token: <code>${token}</code></p>`,
        `<p>Expires at: ${expiresAt}</p>`,
      ].join(''),
    });
    return { mode: 'smtp' as const, resetLink };
  }
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'password_reset',
        recipient: usernameOrEmail,
        token,
        expiresAt,
        resetLink,
      }),
    });
    if (!response.ok) {
      throw new Error(`Password reset delivery failed with status ${response.status}.`);
    }
    return { mode: 'webhook' as const, resetLink };
  }
  await logLine('WARN', `password reset token for ${usernameOrEmail}: token=${token} expiresAt=${expiresAt} link=${resetLink}`);
  return { mode: 'log' as const, resetLink };
};
