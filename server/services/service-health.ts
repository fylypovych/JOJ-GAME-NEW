type HealthEntry = Record<string, unknown> & { ok?: boolean };

export type ServiceHealthSnapshot = Record<string, HealthEntry>;

export const getReadinessFromServices = (services: ServiceHealthSnapshot) =>
  Object.values(services).every((entry) => entry.ok !== false);

export const buildPublicHealthPayload = (args: {
  adminAuthEnabled: boolean;
  passwordResetDelivery: Record<string, unknown>;
  services: ServiceHealthSnapshot;
}) => ({
  service: 'joj-game-server',
  now: new Date().toISOString(),
  uptimeSec: Math.round(process.uptime()),
  port: Number(process.env.PORT ?? 8000),
  adminAuthEnabled: args.adminAuthEnabled,
  passwordResetDelivery: args.passwordResetDelivery,
  services: args.services,
});
