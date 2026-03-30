export const LOBBY_BOT_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

export type LobbyBotCountOption = typeof LOBBY_BOT_COUNT_OPTIONS[number];

export type LobbyGameUiConfig = {
  allowedBotCounts: LobbyBotCountOption[];
  defaultBotCount: LobbyBotCountOption;
};

export const DEFAULT_LOBBY_GAME_UI_CONFIG: LobbyGameUiConfig = {
  allowedBotCounts: [...LOBBY_BOT_COUNT_OPTIONS],
  defaultBotCount: 3,
};

const normalizeAllowedBotCounts = (value: unknown): LobbyBotCountOption[] => {
  const source = Array.isArray(value) ? value : [];
  const allowed = new Set<LobbyBotCountOption>(LOBBY_BOT_COUNT_OPTIONS);
  const normalized = source
    .map((item) => Number(item))
    .filter((item): item is LobbyBotCountOption => Number.isInteger(item) && allowed.has(item as LobbyBotCountOption));
  const unique = Array.from(new Set(normalized)).sort((a, b) => a - b) as LobbyBotCountOption[];
  return unique.length > 0 ? unique : [...DEFAULT_LOBBY_GAME_UI_CONFIG.allowedBotCounts];
};

export const normalizeLobbyGameUiConfig = (value: unknown): LobbyGameUiConfig => {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const allowedBotCounts = normalizeAllowedBotCounts(raw.allowedBotCounts);
  const requestedDefault = Number(raw.defaultBotCount);
  const defaultBotCount = allowedBotCounts.includes(requestedDefault as LobbyBotCountOption)
    ? requestedDefault as LobbyBotCountOption
    : allowedBotCounts[0];
  return {
    allowedBotCounts,
    defaultBotCount,
  };
};

export const getAvailableBotCounts = (
  allowedBotCounts: readonly number[],
  roomCapacity: number,
): LobbyBotCountOption[] => {
  const seatLimit = Math.max(0, Math.floor(roomCapacity) - 1);
  return normalizeAllowedBotCounts(allowedBotCounts).filter((count) => count <= seatLimit);
};

export const clampBotCountToAllowed = (
  requestedBotCount: number,
  allowedBotCounts: readonly number[],
  roomCapacity: number,
): number => {
  const available = getAvailableBotCounts(allowedBotCounts, roomCapacity);
  if (available.length === 0) return 0;
  const normalizedRequested = Math.max(0, Math.floor(requestedBotCount || 0));
  if (available.includes(normalizedRequested as LobbyBotCountOption)) return normalizedRequested;
  const fallback = [...available].reverse().find((count) => count <= normalizedRequested) ?? available[0];
  return fallback;
};
