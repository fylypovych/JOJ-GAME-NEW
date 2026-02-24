import type { JojGameState, RankDefinition, ResourceKey } from '../../game/types';
import type { Language } from '../i18n';

type PromptDeps = {
  G: JojGameState;
  currentPlayerID: string;
  lang: Language;
  sharedRanks: RankDefinition[];
  resourceLabels: Record<ResourceKey, string>;
  resources: Record<ResourceKey, number>;
  playerLabelById: (id: string | null | undefined) => string;
  chooseLyapTargetPrompt: string;
};

const rankSeatLimit = (playerCount: number): number => {
  if (playerCount <= 2) return 1;
  if (playerCount <= 4) return 2;
  return 3;
};

export const createBoardPrompts = ({
  G,
  currentPlayerID,
  lang,
  sharedRanks,
  resourceLabels,
  resources,
  playerLabelById,
  chooseLyapTargetPrompt,
}: PromptDeps) => {
  const promptLyapTarget = (): string | null => {
    const playerIds = Object.keys(G?.players ?? {}).filter((pid) => pid !== currentPlayerID);
    if (playerIds.length === 0) return null;
    const options = playerIds
      .map((pid, index) => `${index + 1}: ${playerLabelById(pid)} (#${pid})`)
      .join('\n');
    const value = window.prompt(
      `${chooseLyapTargetPrompt}:\n${options}\n${lang === 'uk' ? 'Введіть номер або playerID.' : 'Enter option number or playerID.'}`,
    );
    if (value === null) return null;
    const trimmed = value.trim();
    const byIndex = Number(trimmed);
    if (Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= playerIds.length) return playerIds[byIndex - 1];
    return playerIds.includes(trimmed) ? trimmed : null;
  };

  const promptDroneTarget = (): string | null => {
    const playerIds = Object.keys(G?.players ?? {}).filter((pid) => pid !== currentPlayerID);
    if (playerIds.length === 0) return null;
    const options = playerIds
      .map((pid, index) => {
        const currentRankId = G?.ranks?.[pid] ?? '';
        const currentIdx = sharedRanks.findIndex((r) => r.id === currentRankId);
        const lower = currentIdx > 0 ? sharedRanks[currentIdx - 1] : null;
        return `${index + 1}: ${playerLabelById(pid)} (#${pid})${lower ? ` -> ${lower.name}` : ` (${lang === 'uk' ? 'мінімальне звання' : 'minimum rank'})`}`;
      })
      .join('\n');
    const value = window.prompt(
      `${lang === 'uk' ? 'Оберіть ціль для «Дрончик»' : 'Choose target for "Drone"'}:\n${options}\n${lang === 'uk' ? 'Введіть номер або playerID.' : 'Enter option number or playerID.'}`,
    );
    if (value === null) return null;
    const trimmed = value.trim();
    const byIndex = Number(trimmed);
    const target = Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= playerIds.length
      ? playerIds[byIndex - 1]
      : (playerIds.includes(trimmed) ? trimmed : null);
    if (!target) return null;

    const targetRankId = G?.ranks?.[target] ?? '';
    const targetRankIdx = sharedRanks.findIndex((r) => r.id === targetRankId);
    if (targetRankIdx <= 0) {
      window.alert(
        lang === 'uk'
          ? 'Проти цього гравця зараз зіграти не можна: у нього вже мінімальне звання.'
          : 'Cannot play against this player now: they already have the minimum rank.',
      );
      return null;
    }

    const lowerRank = sharedRanks[targetRankIdx - 1];
    const occupied = Object.entries(G?.ranks ?? {}).filter(
      ([pid, rankId]) => pid !== target && rankId === lowerRank.id,
    ).length;
    const playerCount = Object.keys(G?.players ?? {}).length || 2;
    if (occupied >= rankSeatLimit(playerCount)) {
      window.alert(
        lang === 'uk'
          ? 'Проти цього гравця зараз зіграти не можна: усі місця в нижчому званні зайняті.'
          : 'Cannot play against this player now: all seats in the lower rank are occupied.',
      );
      return null;
    }
    return target;
  };

  const promptWaterResource = (): ResourceKey | null => {
    const ordered = Object.keys(resourceLabels) as ResourceKey[];
    const options = ordered
      .map((key, index) => `${index + 1}: ${resourceLabels[key]} (${resources[key] ?? 0})`)
      .join('\n');
    const value = window.prompt(
      `${lang === 'uk' ? 'Оберіть ресурс для відновлення до 3' : 'Choose a resource to restore to 3'}:\n${options}\n${
        lang === 'uk' ? 'Введіть номер або ключ ресурсу.' : 'Enter option number or resource key.'
      }`,
    );
    if (value === null) return null;
    const trimmed = value.trim();
    const byIndex = Number(trimmed);
    if (Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= ordered.length) return ordered[byIndex - 1];
    return ordered.includes(trimmed as ResourceKey) ? (trimmed as ResourceKey) : null;
  };

  return { promptLyapTarget, promptDroneTarget, promptWaterResource };
};

