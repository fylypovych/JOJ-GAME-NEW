import type { Pool } from 'pg';
import {
  DEFAULT_LOBBY_GAME_UI_CONFIG,
  normalizeLobbyGameUiConfig,
  type LobbyGameUiConfig,
} from '../../src/game/lobbyConfig';
import { loadAppSettingJson, saveAppSettingJson } from './app-settings-store';

export type StoredLobbyGameUiConfig = LobbyGameUiConfig & {
  updatedAt: number;
};

const GAME_UI_CONFIG_KEY = 'game_ui_config';

export const loadLobbyGameUiConfig = async (
  _configPath: string,
  pool?: Pool | null,
): Promise<StoredLobbyGameUiConfig> => {
  void _configPath;
  if (!pool) {
    throw new Error('PostgreSQL pool is required for game UI config.');
  }
  const stored = await loadAppSettingJson<StoredLobbyGameUiConfig>(pool, GAME_UI_CONFIG_KEY);
  if (stored) {
    const normalized = normalizeLobbyGameUiConfig(stored);
    return { ...normalized, updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : 0 };
  }
  const initial: StoredLobbyGameUiConfig = {
    ...DEFAULT_LOBBY_GAME_UI_CONFIG,
    updatedAt: 0,
  };
  await saveAppSettingJson(pool, GAME_UI_CONFIG_KEY, initial, 'init-game-ui');
  return initial;
};

export const saveLobbyGameUiConfig = async (
  _configPath: string,
  value: unknown,
  pool?: Pool | null,
): Promise<StoredLobbyGameUiConfig> => {
  void _configPath;
  if (!pool) {
    throw new Error('PostgreSQL pool is required for game UI config.');
  }
  const normalized = normalizeLobbyGameUiConfig(value);
  const stored: StoredLobbyGameUiConfig = {
    ...normalized,
    updatedAt: Date.now(),
  };
  await saveAppSettingJson(pool, GAME_UI_CONFIG_KEY, stored, 'admin-game-ui');
  return stored;
};
