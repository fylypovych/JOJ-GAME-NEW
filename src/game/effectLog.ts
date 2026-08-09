import type { CardDefinition, JojGameState, ResourceKey } from './types';

export type AppliedEffectSummary = {
  resources: Partial<Record<ResourceKey, number>>;
  rank: number;
  skipsNextTurn?: boolean;
};

export type AppliedEffectLogEntry = {
  id: string;
  sourceCardId: string;
  sourceCardTitle: string;
  sourceCategory: 'LYAP' | 'SCANDAL';
  sourcePlayerID: string;
  targetPlayerID: string;
  summary: AppliedEffectSummary;
  createdAtTurn?: number;
  canceled?: boolean;
};

const EFFECT_LOG_LIMIT = 300;

export const appendAppliedEffectLog = (
  G: JojGameState,
  entry: Omit<AppliedEffectLogEntry, 'id'>,
) => {
  if (!Array.isArray(G.appliedEffectLog)) G.appliedEffectLog = [];
  const nextId = `${entry.sourceCardId}:${entry.sourcePlayerID}:${entry.targetPlayerID}:${G.appliedEffectLog.length + 1}`;
  G.appliedEffectLog.push({
    ...entry,
    id: nextId,
  });
  if (G.appliedEffectLog.length > EFFECT_LOG_LIMIT) {
    G.appliedEffectLog.splice(0, G.appliedEffectLog.length - EFFECT_LOG_LIMIT);
  }
};

export const markAppliedEffectCanceled = (
  G: JojGameState,
  entryId: string,
) => {
  const entry = G.appliedEffectLog?.find((item) => item.id === entryId);
  if (entry) entry.canceled = true;
};

export const findLastAppliedEffect = (
  G: JojGameState,
  predicate: (entry: AppliedEffectLogEntry) => boolean,
): AppliedEffectLogEntry | null => {
  const log = G.appliedEffectLog ?? [];
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const entry = log[i];
    if (!entry || entry.canceled) continue;
    if (predicate(entry)) return entry;
  }
  return null;
};

export const toLoggedCardDefinition = (entry: AppliedEffectLogEntry): CardDefinition => ({
  id: entry.sourceCardId,
  title: entry.sourceCardTitle,
  category: entry.sourceCategory,
  effects: [],
});
