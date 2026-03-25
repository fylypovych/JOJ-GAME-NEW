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

type RecoveryEnv = NodeJS.ProcessEnv;
type SmtpConfigKey = string;
export type PasswordResetDeliveryResult = {
  mode: 'smtp' | 'webhook' | 'log';
  resetLink: string;
};

const transporterPromises = new Map<SmtpConfigKey, Promise<MailTransporter>>();

const hasSmtpConfig = (env: RecoveryEnv) => Boolean((env.SMTP_HOST ?? '').trim() && (env.SMTP_FROM ?? '').trim());

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

const getValidatedWebhookUrl = (env: RecoveryEnv) => {
  const rawValue = (env.PASSWORD_RESET_WEBHOOK_URL ?? '').trim();
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
  const isProduction = (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
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

const getSmtpConfigKey = (env: RecoveryEnv) => JSON.stringify({
  host: env.SMTP_HOST ?? '',
  port: String(env.SMTP_PORT ?? 587),
  secure: String(env.SMTP_SECURE ?? '').trim(),
  user: env.SMTP_USER ?? '',
  pass: env.SMTP_PASS ?? '',
});

const getTransporter = async (env: RecoveryEnv) => {
  const configKey = getSmtpConfigKey(env);
  const existing = transporterPromises.get(configKey);
  if (existing) return existing;

  const created = import('nodemailer').then((module) => module.default.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT ?? 587),
    secure: String(env.SMTP_SECURE ?? '').trim() === 'true',
    auth: (env.SMTP_USER ?? '').trim()
        ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        }
        : undefined,
  }) as MailTransporter);
  transporterPromises.set(configKey, created);
  return created;
};

export const deliverPasswordReset = async (args: {
  usernameOrEmail: string;
  token: string;
  expiresAt: string;
  logLine: LogLine;
  env?: RecoveryEnv;
  fetchImpl?: typeof fetch;
  getTransporterFn?: (env: RecoveryEnv) => Promise<MailTransporter>;
}): Promise<PasswordResetDeliveryResult> => {
  const {
    usernameOrEmail,
    token,
    expiresAt,
    logLine,
    env = process.env,
    fetchImpl = fetch,
    getTransporterFn = getTransporter,
  } = args;
  const webhookUrl = getValidatedWebhookUrl(env);
  const frontendBaseUrl = (env.FRONTEND_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '');
  const resetLink = `${frontendBaseUrl}/?resetToken=${encodeURIComponent(token)}`;
  if (hasSmtpConfig(env)) {
    const transporter = await getTransporterFn(env);
    await transporter.sendMail({
      from: env.SMTP_FROM,
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
    const response = await fetchImpl(webhookUrl, {
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
  await logLine('WARN', `password reset delivery fallback for ${usernameOrEmail}: expiresAt=${expiresAt}`);
  return { mode: 'log' as const, resetLink };
};
