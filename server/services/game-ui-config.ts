import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  DEFAULT_LOBBY_GAME_UI_CONFIG,
  normalizeLobbyGameUiConfig,
  type LobbyGameUiConfig,
} from '../../src/game/lobbyConfig';

export type StoredLobbyGameUiConfig = LobbyGameUiConfig & {
  updatedAt: number;
};

export const loadLobbyGameUiConfig = async (configPath: string): Promise<StoredLobbyGameUiConfig> => {
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeLobbyGameUiConfig(parsed);
    const updatedAt = parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'number'
      ? (parsed as { updatedAt: number }).updatedAt
      : 0;
    return { ...normalized, updatedAt };
  } catch {
    return { ...DEFAULT_LOBBY_GAME_UI_CONFIG, updatedAt: 0 };
  }
};

export const saveLobbyGameUiConfig = async (
  configPath: string,
  value: unknown,
): Promise<StoredLobbyGameUiConfig> => {
  const normalized = normalizeLobbyGameUiConfig(value);
  const stored: StoredLobbyGameUiConfig = {
    ...normalized,
    updatedAt: Date.now(),
  };
  const dir = configPath.replace(/[\\/][^\\/]+$/, '');
  await mkdir(dir, { recursive: true });
  await writeFile(configPath, JSON.stringify(stored, null, 2), 'utf8');
  return stored;
};
