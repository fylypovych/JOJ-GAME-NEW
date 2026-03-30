import { useState } from 'react';
import type { Language } from '../i18n';
import {
  DEFAULT_LOBBY_GAME_UI_CONFIG,
  normalizeLobbyGameUiConfig,
  type LobbyBotCountOption,
  type LobbyRoomCapacityOption,
} from '../../game/lobbyConfig';

type AdminJsonFetch = (url: string, init?: RequestInit) => Promise<Response>;

const createErrors = (lang: Language) => ({
  load: lang === 'uk' ? 'Не вдалося завантажити налаштування ботів.' : 'Failed to load bot settings.',
  save: lang === 'uk' ? 'Не вдалося зберегти налаштування ботів.' : 'Failed to save bot settings.',
  saved: lang === 'uk' ? 'Налаштування ботів збережено.' : 'Bot settings saved.',
});

export const useGameUiConfig = (args: {
  lang: Language;
  serverUrl: string;
  adminJsonFetch: AdminJsonFetch;
}) => {
  const { lang, serverUrl, adminJsonFetch } = args;
  const errors = createErrors(lang);
  const [allowedRoomCapacities, setAllowedRoomCapacities] = useState<LobbyRoomCapacityOption[]>(DEFAULT_LOBBY_GAME_UI_CONFIG.allowedRoomCapacities);
  const [defaultRoomCapacity, setDefaultRoomCapacity] = useState<LobbyRoomCapacityOption>(DEFAULT_LOBBY_GAME_UI_CONFIG.defaultRoomCapacity);
  const [allowedBotCounts, setAllowedBotCounts] = useState<LobbyBotCountOption[]>(DEFAULT_LOBBY_GAME_UI_CONFIG.allowedBotCounts);
  const [defaultBotCount, setDefaultBotCount] = useState<LobbyBotCountOption>(DEFAULT_LOBBY_GAME_UI_CONFIG.defaultBotCount);
  const [gameUiConfigLoading, setGameUiConfigLoading] = useState(false);
  const [gameUiConfigError, setGameUiConfigError] = useState('');
  const [gameUiConfigStatus, setGameUiConfigStatus] = useState('');

  const applyConfig = (value: unknown) => {
    const normalized = normalizeLobbyGameUiConfig(value);
    setAllowedRoomCapacities(normalized.allowedRoomCapacities);
    setDefaultRoomCapacity(normalized.defaultRoomCapacity);
    setAllowedBotCounts(normalized.allowedBotCounts);
    setDefaultBotCount(normalized.defaultBotCount);
    return normalized;
  };

  const loadGameUiConfig = async () => {
    setGameUiConfigLoading(true);
    setGameUiConfigError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/game/ui-config`);
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.load);
      applyConfig(payload);
    } catch (error) {
      setGameUiConfigError(String(error instanceof Error ? error.message : error));
    } finally {
      setGameUiConfigLoading(false);
    }
  };

  const saveGameUiConfig = async () => {
    setGameUiConfigLoading(true);
    setGameUiConfigError('');
    setGameUiConfigStatus('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/game/ui-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowedRoomCapacities,
          defaultRoomCapacity,
          allowedBotCounts,
          defaultBotCount,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.save);
      applyConfig(payload);
      setGameUiConfigStatus(errors.saved);
    } catch (error) {
      setGameUiConfigError(String(error instanceof Error ? error.message : error));
    } finally {
      setGameUiConfigLoading(false);
    }
  };

  return {
    allowedRoomCapacities,
    setAllowedRoomCapacities,
    defaultRoomCapacity,
    setDefaultRoomCapacity,
    allowedBotCounts,
    setAllowedBotCounts,
    defaultBotCount,
    setDefaultBotCount,
    gameUiConfigLoading,
    gameUiConfigError,
    gameUiConfigStatus,
    loadGameUiConfig,
    saveGameUiConfig,
  };
};
