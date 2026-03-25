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

const isPrivateIpLiteral = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
    const parts = normalized.split('.').map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return true;
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true;
  return false;
};

const getValidatedWebhookUrl = () => {
  const rawValue = (process.env.PASSWORD_RESET_WEBHOOK_URL ?? '').trim();
  if (!rawValue) return '';
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error('PASSWORD_RESET_WEBHOOK_URL must be a valid absolute URL.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('PASSWORD_RESET_WEBHOOK_URL must not include credentials.');
  }
  const isProduction = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.trim().toLowerCase();
  const localTarget = isPrivateIpLiteral(hostname);
  if (isProduction) {
    if (protocol !== 'https:') {
      throw new Error('PASSWORD_RESET_WEBHOOK_URL must use HTTPS in production.');
    }
    if (localTarget) {
      throw new Error('PASSWORD_RESET_WEBHOOK_URL must not target localhost or private IP ranges in production.');
    }
  } else if (protocol !== 'https:' && !(protocol === 'http:' && localTarget)) {
    throw new Error('PASSWORD_RESET_WEBHOOK_URL must use HTTPS unless it targets localhost/private IPs in development.');
  }
  return parsed.toString();
};

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
  const webhookUrl = getValidatedWebhookUrl();
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
