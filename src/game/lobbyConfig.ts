import { normalizeImagePath } from './imagePaths';
import { defaultResourceImagePaths } from './resourceMeta';
import type { ResourceKey } from './types';

export const LOBBY_BOT_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;
export const LOBBY_ROOM_CAPACITY_OPTIONS = [2, 3, 4, 5, 6] as const;

export type LobbyBotCountOption = typeof LOBBY_BOT_COUNT_OPTIONS[number];
export type LobbyRoomCapacityOption = typeof LOBBY_ROOM_CAPACITY_OPTIONS[number];

export type LobbyGameUiConfig = {
  allowedRoomCapacities: LobbyRoomCapacityOption[];
  defaultRoomCapacity: LobbyRoomCapacityOption;
  allowedBotCounts: LobbyBotCountOption[];
  defaultBotCount: LobbyBotCountOption;
  resourceImagePaths: Record<ResourceKey, string>;
};

export const DEFAULT_LOBBY_GAME_UI_CONFIG: LobbyGameUiConfig = {
  allowedRoomCapacities: [...LOBBY_ROOM_CAPACITY_OPTIONS],
  defaultRoomCapacity: 4,
  allowedBotCounts: [...LOBBY_BOT_COUNT_OPTIONS],
  defaultBotCount: 3,
  resourceImagePaths: { ...defaultResourceImagePaths },
};

const normalizeAllowedRoomCapacities = (value: unknown): LobbyRoomCapacityOption[] => {
  const source = Array.isArray(value) ? value : [];
  const allowed = new Set<LobbyRoomCapacityOption>(LOBBY_ROOM_CAPACITY_OPTIONS);
  const normalized = source
    .map((item) => Number(item))
    .filter((item): item is LobbyRoomCapacityOption => Number.isInteger(item) && allowed.has(item as LobbyRoomCapacityOption));
  const unique = Array.from(new Set(normalized)).sort((a, b) => a - b) as LobbyRoomCapacityOption[];
  return unique.length > 0 ? unique : [...DEFAULT_LOBBY_GAME_UI_CONFIG.allowedRoomCapacities];
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

const normalizeResourceImagePaths = (value: unknown): Record<ResourceKey, string> => {
  const raw = value && typeof value === 'object' ? value as Partial<Record<ResourceKey, unknown>> : {};
  return {
    time: normalizeImagePath(typeof raw.time === 'string' ? raw.time : undefined) ?? defaultResourceImagePaths.time,
    reputation: normalizeImagePath(typeof raw.reputation === 'string' ? raw.reputation : undefined) ?? defaultResourceImagePaths.reputation,
    discipline: normalizeImagePath(typeof raw.discipline === 'string' ? raw.discipline : undefined) ?? defaultResourceImagePaths.discipline,
    documents: normalizeImagePath(typeof raw.documents === 'string' ? raw.documents : undefined) ?? defaultResourceImagePaths.documents,
    tech: normalizeImagePath(typeof raw.tech === 'string' ? raw.tech : undefined) ?? defaultResourceImagePaths.tech,
  };
};

export const normalizeLobbyGameUiConfig = (value: unknown): LobbyGameUiConfig => {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const allowedRoomCapacities = normalizeAllowedRoomCapacities(raw.allowedRoomCapacities);
  const requestedDefaultRoomCapacity = Number(raw.defaultRoomCapacity);
  const defaultRoomCapacity = allowedRoomCapacities.includes(requestedDefaultRoomCapacity as LobbyRoomCapacityOption)
    ? requestedDefaultRoomCapacity as LobbyRoomCapacityOption
    : allowedRoomCapacities[0];
  const allowedBotCounts = normalizeAllowedBotCounts(raw.allowedBotCounts);
  const requestedDefault = Number(raw.defaultBotCount);
  const defaultBotCount = allowedBotCounts.includes(requestedDefault as LobbyBotCountOption)
    ? requestedDefault as LobbyBotCountOption
    : allowedBotCounts[0];
  const resourceImagePaths = normalizeResourceImagePaths(raw.resourceImagePaths);
  return {
    allowedRoomCapacities,
    defaultRoomCapacity,
    allowedBotCounts,
    defaultBotCount,
    resourceImagePaths,
  };
};

export const clampRoomCapacityToAllowed = (
  requestedRoomCapacity: number,
  allowedRoomCapacities: readonly number[],
): LobbyRoomCapacityOption => {
  const available = normalizeAllowedRoomCapacities(allowedRoomCapacities);
  const normalizedRequested = Math.max(2, Math.floor(requestedRoomCapacity || available[0]));
  if (available.includes(normalizedRequested as LobbyRoomCapacityOption)) return normalizedRequested as LobbyRoomCapacityOption;
  return ([...available].reverse().find((count) => count <= normalizedRequested) ?? available[0]) as LobbyRoomCapacityOption;
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
