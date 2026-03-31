import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  configPath: string,
  pool?: Pool | null,
): Promise<StoredLobbyGameUiConfig> => {
  const stored = await loadAppSettingJson<StoredLobbyGameUiConfig>(pool, GAME_UI_CONFIG_KEY);
  if (stored) {
    const normalized = normalizeLobbyGameUiConfig(stored);
    return { ...normalized, updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : 0 };
  }
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeLobbyGameUiConfig(parsed);
    const updatedAt = parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'number'
      ? (parsed as { updatedAt: number }).updatedAt
      : 0;
    const migrated: StoredLobbyGameUiConfig = { ...normalized, updatedAt };
    if (pool) {
      await saveAppSettingJson(pool, GAME_UI_CONFIG_KEY, migrated, 'migration-game-ui');
    }
    return migrated;
  } catch {
    return { ...DEFAULT_LOBBY_GAME_UI_CONFIG, updatedAt: 0 };
  }
};

export const saveLobbyGameUiConfig = async (
  configPath: string,
  value: unknown,
  pool?: Pool | null,
): Promise<StoredLobbyGameUiConfig> => {
  const normalized = normalizeLobbyGameUiConfig(value);
  const stored: StoredLobbyGameUiConfig = {
    ...normalized,
    updatedAt: Date.now(),
  };
  if (pool) {
    await saveAppSettingJson(pool, GAME_UI_CONFIG_KEY, stored, 'admin-game-ui');
    return stored;
  }
  const dir = configPath.replace(/[\\/][^\\/]+$/, '');
  await mkdir(dir, { recursive: true });
  await writeFile(configPath, JSON.stringify(stored, null, 2), 'utf8');
  return stored;
};
