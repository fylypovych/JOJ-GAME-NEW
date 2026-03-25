export type PasswordResetDeliveryHealth = {
  ok: boolean;
  lastDegradedAt: string | null;
  lastDegradedMode: 'log' | 'error' | null;
  lastError: string | null;
};

export type PublicPasswordResetDeliveryHealth = Omit<PasswordResetDeliveryHealth, 'lastError'>;

const state: PasswordResetDeliveryHealth = {
  ok: true,
  lastDegradedAt: null,
  lastDegradedMode: null,
  lastError: null,
};

export const markPasswordResetDeliveryHealthy = () => {
  state.ok = true;
  state.lastDegradedAt = null;
  state.lastDegradedMode = null;
  state.lastError = null;
};

export const markPasswordResetDeliveryDegraded = (args: {
  mode: 'log' | 'error';
  error?: string;
  now?: string;
}) => {
  state.ok = false;
  state.lastDegradedAt = args.now ?? new Date().toISOString();
  state.lastDegradedMode = args.mode;
  state.lastError = args.error ?? null;
};

export const getPasswordResetDeliveryHealth = (): PasswordResetDeliveryHealth => ({ ...state });

export const getPublicPasswordResetDeliveryHealth = (): PublicPasswordResetDeliveryHealth => ({
  ok: state.ok,
  lastDegradedAt: state.lastDegradedAt,
  lastDegradedMode: state.lastDegradedMode,
});
