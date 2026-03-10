import type { Ctx, Game } from 'boardgame.io';
import {
  buildDecisionMessageText,
  buildLegendaryPlayedMessageText,
  buildLyapAutoMessageText,
  buildPlayedLyapMessageText,
  buildPlayedScandalMessageText,
  buildPromotionMessageText,
  buildScandalAutoMessageText,
  buildSupportMessageText,
  legendaryTexts,
} from './systemMessages';
import { appendChat as appendChatBase, getPlayerLabel, nextSystemMessageSeq } from './chatUtils';
import { cloneCard } from './cloneUtils';
import { createEffectsEngine } from './effectsEngine';
import { createSanitizedPlayerView } from './gameStateUtils';
import { createJojMoves, enumerateAiMoves } from './moves';
import { resourceKeys, resourceLabelsUk } from './resourceMeta';
import { createRankEngine, rankSeatLimitForRank } from './rankEngine';
import { createEmptyGameState, initializePlayerInGameState } from './stateFactory';
import { canPlayHandCardAtStage } from './turnRules';
import { runGameSimulationsWithDeps, type SimulationOptions, type SimulationReport } from './simulation';
import {
  buildDeckModulesFromTemplate,
  getActiveRanks,
  getSharedDeckTemplate,
  resolveRandomRankImage,
  getTopRankId,
  shuffle,
  type LegendaryDeckMode,
  type SharedGameSetup,
} from './sharedConfig';
import type { CardDefinition, GameMode, JojGameState, ResourceKey } from './types';
export {
  addCardToSharedDeckTemplate,
  addCustomCardToSharedDeckTemplate,
  exportSharedDeckTemplateJson,
  getCardCatalog,
  getSharedDeckTemplate,
  getSharedDeckTemplateStats,
  getSharedRanks,
  importSharedDeckTemplateJson,
  resetSharedDeckTemplate,
  resetSharedRanks,
  removeCardAtFromSharedDeckTemplate,
  setSharedDeckBackImage,
  setSharedRanks,
  shuffleSharedDeckTemplate,
  updateCardAtInSharedDeckTemplate,
} from './sharedConfig';
export type {
  DeckModuleCategory,
  DeckModuleDefinition,
  DeckModuleType,
  DeckTarget,
  LegendaryDeckMode,
  SharedGameSetup,
  SharedRanks,
} from './sharedConfig';

const INVALID_MOVE = 'INVALID_MOVE' as const;
const STARTING_HAND_SIZE = 5;
const STARTING_LEGENDARY_HAND_SIZE = 5;
const HAND_LIMIT = 8;
const GAME_MODE_STANDARD: GameMode = 'standard';
const GAME_MODE_STANDARD_PLUS: GameMode = 'standard_plus';
const GAME_MODE_SIMPLIFIED: GameMode = 'simplified';
const MODULE_VVNZ = 'vvnz' as const;
const MODULE_LEGENDARY = 'legendary' as const;
type OptionalModuleId = typeof MODULE_VVNZ | typeof MODULE_LEGENDARY;
const DRAW_STAGE = 'draw';
const PLAY_STAGE = 'play';
const END_STAGE = 'end';
const IDLE_STAGE = 'idle';
const CHAT_LIMIT = 200;
const resolveGameMode = (setupData: unknown): GameMode => {
  if (!setupData || typeof setupData !== 'object') return GAME_MODE_STANDARD;
  const rawMode = (setupData as { gameMode?: unknown }).gameMode;
  if (rawMode === GAME_MODE_STANDARD_PLUS) return GAME_MODE_STANDARD_PLUS;
  if (rawMode === GAME_MODE_SIMPLIFIED) return GAME_MODE_SIMPLIFIED;
  return GAME_MODE_STANDARD;
};

const normalizeGameModeByLegendaryMode = (
  requestedMode: GameMode,
  legendaryDeckMode: LegendaryDeckMode,
): GameMode => {
  if (legendaryDeckMode !== 'merged') return requestedMode;
  // Merged legendary deck is logically equivalent to simplified legendary flow:
  // no separate legendary hand and no legendary draft phase.
  return GAME_MODE_SIMPLIFIED;
};

const resolveLegacyEnabledModules = (setupData: unknown): Set<OptionalModuleId> | null => {
  if (!setupData || typeof setupData !== 'object') return null;
  const raw = (setupData as { modules?: unknown }).modules;
  if (!Array.isArray(raw)) return null;
  const out = new Set<OptionalModuleId>();
  raw.forEach((value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === MODULE_VVNZ) out.add(MODULE_VVNZ);
    if (normalized === MODULE_LEGENDARY) out.add(MODULE_LEGENDARY);
  });
  return out;
};

const resolveSetupOverride = (setupData: unknown): Partial<SharedGameSetup> => {
  if (!setupData || typeof setupData !== 'object') return {};
  const raw = setupData as { gameSetup?: unknown; legendaryDeckMode?: unknown };
  const safeId = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    return normalized || undefined;
  };
  const out: Partial<SharedGameSetup> = {};
  if (raw.gameSetup && typeof raw.gameSetup === 'object') {
    const setup = raw.gameSetup as Record<string, unknown>;
    out.lyapModuleId = safeId(setup.lyapModuleId);
    out.scandalModuleId = safeId(setup.scandalModuleId);
    out.supportModuleId = safeId(setup.supportModuleId);
    out.commandModuleId = safeId(setup.commandModuleId);
    out.optionalMainDeckModuleIds = Array.isArray(setup.optionalMainDeckModuleIds)
      ? setup.optionalMainDeckModuleIds.filter((item): item is string => typeof item === 'string').map((id) => id.trim().toLowerCase()).filter(Boolean)
      : undefined;
    out.legendaryModuleId = safeId(setup.legendaryModuleId);
    out.rankModuleId = safeId(setup.rankModuleId);
    const mode = setup.legendaryDeckMode;
    if (mode === 'merged' || mode === 'separate') out.legendaryDeckMode = mode;
  }
  const mode = raw.legendaryDeckMode;
  if (mode === 'merged' || mode === 'separate') out.legendaryDeckMode = mode as LegendaryDeckMode;
  return out;
};


const appendChat = (
  G: JojGameState,
  entry: { type: 'player' | 'system'; text: string; playerID?: string },
) => appendChatBase(G, entry, CHAT_LIMIT);

const applyRankImageForPlayer = (G: JojGameState, playerID: string) => {
  if (!G.rankImageByPlayer) G.rankImageByPlayer = {};
  const rankId = G.ranks[playerID];
  const image = resolveRandomRankImage(rankId);
  if (image) G.rankImageByPlayer[playerID] = image;
  else delete G.rankImageByPlayer[playerID];
};

const {
  hasResources,
  spendResources,
  applyResourceDelta,
  clampNonNegativeResources,
  planReplacementResources,
  getReplacementUnitsForCard,
  applyCardEffects,
  applyCardEffectsSoft,
  cancelLastLyapOrScandalForPlayer,
  cancelLastScandalForPlayer,
  summarizeAppliedDiff,
} = createEffectsEngine({
  resourceKeys,
  getActiveRanks,
  onRankChanged: (G, playerID) => {
    applyRankImageForPlayer(G, playerID);
  },
});
export { getReplacementUnitsForCard };

const isProtectedFromLyapScandal = (G: JojGameState, ctx: Ctx | { turn?: number }, playerID: string): boolean => {
  const currentTurn = Number(ctx?.turn ?? 0);
  const untilTurn = Number(G.lyapScandalShieldUntilTurn?.[playerID] ?? 0);
  return untilTurn > 0 && currentTurn < untilTurn;
};

const computeShieldUntilNextOwnTurn = (
  ctx: { currentPlayer: string; playOrder?: string[]; turn?: number },
  playerID: string,
): number => {
  const playOrder = ctx.playOrder ?? [];
  const currentTurn = Number(ctx.turn ?? 0);
  if (playOrder.length === 0) return currentTurn + 1;
  const currentIndex = playOrder.indexOf(ctx.currentPlayer);
  const targetIndex = playOrder.indexOf(playerID);
  if (currentIndex < 0 || targetIndex < 0) return currentTurn + playOrder.length;
  if (targetIndex === currentIndex) return currentTurn + playOrder.length;
  if (targetIndex > currentIndex) return currentTurn + (targetIndex - currentIndex);
  return currentTurn + (playOrder.length - currentIndex + targetIndex);
};

const triggerSukhpayZsuOnScandal = (
  G: JojGameState,
  ctx: Ctx | { turn?: number },
  scandalSourcePlayerID: string,
) => {
  const currentTurn = Number(ctx?.turn ?? 0);
  Object.keys(G.players ?? {}).forEach((pid) => {
    if (pid === scandalSourcePlayerID) return;
    const pending = G.sukhpayZsuPendingBonus?.[pid] ?? false;
    const untilTurn = Number(G.sukhpayZsuWatchUntilTurn?.[pid] ?? 0);
    if (!pending) return;
    if (!(untilTurn > 0 && currentTurn < untilTurn)) return;
    G.resources[pid].discipline = (G.resources[pid].discipline ?? 0) + 1;
    clampNonNegativeResources(G.resources[pid]);
    G.sukhpayZsuPendingBonus[pid] = false;
    syncPlayerState(G, pid);
    const seq = nextSystemMessageSeq(G);
    appendChat(G, {
      type: 'system',
      text: `🥫 [${seq}] ${legendaryTexts.sukhpayTriggered(getPlayerLabel(G, pid))}`,
    });
  });
};

const effectSummaryToText = (summary: { resources: Partial<Record<ResourceKey, number>>; rank: number }) => {
  const parts: string[] = [];
  resourceKeys.forEach((key) => {
    const value = summary.resources[key] ?? 0;
    if (value !== 0) {
      parts.push(`${resourceLabelsUk[key]} ${value > 0 ? `+${value}` : value}`);
    }
  });
  if (summary.rank !== 0) {
    parts.push(`Звання ${summary.rank > 0 ? `+${summary.rank}` : summary.rank}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'без змін';
};

const categoryLabelUk = (category: CardDefinition['category']) => {
  switch (category) {
    case 'LYAP':
      return 'ЛЯП';
    case 'SCANDAL':
      return 'СКАНДАЛ';
    case 'SUPPORT':
      return 'ПІДТРИМКА';
    case 'COMMAND':
      return 'РІШЕННЯ';
    case 'VVNZ':
      return 'ВВНЗ';
    case 'LEGENDARY':
      return 'ЛЕГЕНДАРНА';
    default:
      return category;
  }
};

const rankNameById = (rankId: string): string =>
  getActiveRanks().find((row) => row.id === rankId)?.name ?? rankId;

const resourceDeltaToText = (delta: Partial<Record<ResourceKey, number>>) => {
  const parts = resourceKeys
    .map((key) => {
      const value = delta[key] ?? 0;
      if (value === 0) return null;
      return `${resourceLabelsUk[key]} ${value > 0 ? `+${value}` : value}`;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : 'без змін';
};

const costToDelta = (cost: Partial<Record<ResourceKey, number>>): Partial<Record<ResourceKey, number>> => {
  const delta: Partial<Record<ResourceKey, number>> = {};
  resourceKeys.forEach((key) => {
    const value = cost[key] ?? 0;
    if (value > 0) delta[key] = -value;
  });
  return delta;
};

const cardFlavorSnippet = (card: CardDefinition) => {
  const raw = card.flavor?.trim();
  if (!raw) return 'без офіційного коментаря';
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
};

const buildLyapSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  return buildLyapAutoMessageText({
    seq,
    playerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    effectText: effectSummaryToText(summary),
  });
};

const buildScandalSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  return buildScandalAutoMessageText({
    seq,
    playerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    targetsText: targetSummaries.join(' | '),
  });
};

const buildSupportSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  return buildSupportMessageText({
    seq,
    playerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    effectText: effectSummaryToText(summary),
  });
};

const buildPlayedLyapSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  targetPlayerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  return buildPlayedLyapMessageText({
    seq,
    sourcePlayerLabel,
    targetPlayerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    effectText: effectSummaryToText(summary),
  });
};

const buildPlayedScandalSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  return buildPlayedScandalMessageText({
    seq,
    sourcePlayerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    targetsText: targetSummaries.join(' | '),
  });
};

const buildPlayedDecisionSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  return buildDecisionMessageText({
    seq,
    sourcePlayerLabel,
    cardTitle: card.title,
    flavor: cardFlavorSnippet(card),
    targetsText: targetSummaries.join(' | '),
  });
};

const buildPromotionSystemMessage = (
  seq: number,
  playerLabel: string,
  fromRankId: string,
  toRankId: string,
  cost: Partial<Record<ResourceKey, number>>,
  bonus: Partial<Record<ResourceKey, number>>,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const costText = resourceDeltaToText(costToDelta(cost));
  const bonusText = resourceDeltaToText(bonus);
  const totalText = effectSummaryToText(summary);
  return buildPromotionMessageText({
    seq,
    playerLabel,
    fromRankName: rankNameById(fromRankId),
    toRankName: rankNameById(toRankId),
    costText,
    bonusText,
    totalText,
  });
};

const drawCards = (G: JojGameState, playerID: string, amount: number): void => {
  for (let i = 0; i < amount; i += 1) {
    if (G.deck.length === 0) break;
    const card = G.deck.pop();
    if (card) G.hands[playerID].push(card);
  }
};

const drawLegendaryCards = (G: JojGameState, playerID: string, amount: number, sourceCards?: CardDefinition[]): void => {
  const fallback = getSharedDeckTemplate().legendaryDeck;
  const source = (sourceCards ?? G.legendaryDeck ?? fallback).map(cloneCard);
  G.legendaryHands[playerID] = shuffle(source).slice(0, Math.max(0, amount));
};

const syncPlayerState = (G: JojGameState, playerID: string): void => {
  if (!G.rankImageByPlayer) G.rankImageByPlayer = {};
  G.players[playerID].hand = G.hands[playerID];
  G.players[playerID].rankId = G.ranks[playerID];
  G.players[playerID].resources = G.resources[playerID];
};
const {
  promoteRank,
  promoteToSpecificRank,
  grantSpecificRankIgnoringRequirements,
  demoteByOneRankWithSeatCheck,
} = createRankEngine({
  getActiveRanks,
  hasResources,
  spendResources,
  applyResourceDelta,
  clampNonNegativeResources,
  syncPlayerState,
  onRankChanged: (G, playerID) => {
    applyRankImageForPlayer(G, playerID);
  },
});

const buildVvnzRankSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  fromRankId: string,
  toRankId: string,
  cost: Partial<Record<ResourceKey, number>>,
  bonus: Partial<Record<ResourceKey, number>>,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const flavor = cardFlavorSnippet(card);
  const costText = resourceDeltaToText(costToDelta(cost));
  const bonusText = resourceDeltaToText(bonus);
  const totalText = effectSummaryToText(summary);
  const intros = [
    'оформив освітній стрибок без черги в деканат',
    'пройшов ВВНЗ-коридором до нового погона',
    'увімкнув режим "навчання завершено, дайте звання"',
    'закрив сесію так, що навіть штаб аплодує',
  ];
  const intro = intros[seq % intros.length] ?? intros[0];
  return `🎓 [${seq}] ${playerLabel} ${intro}: «${card.title}» (ВВНЗ). ${rankNameById(fromRankId)} → ${rankNameById(toRankId)}. "${flavor}". Вартість: ${costText}. Бонус звання: ${bonusText}. Підсумок: ${totalText}.`;
};

const getWinner = (G: JojGameState): string | undefined => {
  const activeRanks = getActiveRanks();
  const victoryRankIds = new Set(activeRanks.filter((rank) => rank.victory).map((rank) => rank.id));
  if (victoryRankIds.size > 0) {
    const byVictoryFlag = Object.entries(G.ranks).find(([, rankId]) => victoryRankIds.has(rankId))?.[0];
    if (byVictoryFlag) return byVictoryFlag;
  } else {
    const topRankId = getTopRankId();
    const topRankPlayer = Object.entries(G.ranks).find(([, rankId]) => rankId === topRankId)?.[0];
    if (topRankPlayer) return topRankPlayer;
  }
  if (G.deck.length === 0) {
    const hasCardsInHands = Object.values(G.hands).some((hand) => hand.length > 0);
    if (hasCardsInHands) return undefined;
    return getRankThenResourceLeader(G);
  }
  return undefined;
};

const getRankThenResourceLeader = (G: JojGameState): string | undefined => {
  const rankIndexById = new Map(getActiveRanks().map((rank, index) => [rank.id, index]));
  return Object.keys(G.players ?? {})
    .sort((a, b) => {
      const rankA = rankIndexById.get(G.ranks[a]) ?? -1;
      const rankB = rankIndexById.get(G.ranks[b]) ?? -1;
      if (rankA !== rankB) return rankB - rankA;
      const reputationA = G.resources[a]?.reputation ?? 0;
      const reputationB = G.resources[b]?.reputation ?? 0;
      if (reputationA !== reputationB) return reputationB - reputationA;
      const timeA = G.resources[a]?.time ?? 0;
      const timeB = G.resources[b]?.time ?? 0;
      return timeB - timeA;
    })
    .at(0);
};

const snapshotResourceTotals = (G: JojGameState): Record<string, Record<ResourceKey, number>> => {
  const snapshot: Record<string, Record<ResourceKey, number>> = {};
  Object.keys(G.resources ?? {}).forEach((pid) => {
    snapshot[pid] = { ...G.resources[pid] };
  });
  return snapshot;
};

const recordResourceFlowStats = (
  G: JojGameState,
  before: Record<string, Record<ResourceKey, number>>,
) => {
  Object.keys(G.resources ?? {}).forEach((pid) => {
    const prev = before[pid];
    const next = G.resources[pid];
    if (!prev || !next) return;
    resourceKeys.forEach((key) => {
      const delta = (next[key] ?? 0) - (prev[key] ?? 0);
      if (delta > 0) {
        G.gameStats.resourcesGainedTotal += delta;
        G.gameStats.resourcesGainedByType[key] = (G.gameStats.resourcesGainedByType[key] ?? 0) + delta;
      } else if (delta < 0) {
        const abs = Math.abs(delta);
        G.gameStats.resourcesLostTotal += abs;
        G.gameStats.resourcesLostByType[key] = (G.gameStats.resourcesLostByType[key] ?? 0) + abs;
      }
    });
  });
};

const resetNoPlayablePassStreak = (G: JojGameState) => {
  G.noPlayablePassStreak = 0;
};

const canPromoteToSpecificRankWithoutMutation = (
  G: JojGameState,
  playerID: string,
  targetRankId: string,
): boolean => {
  const ranks = getActiveRanks();
  const playerCount = Object.keys(G.players ?? {}).length || 2;
  const currentRankId = G.ranks[playerID];
  const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
  const targetRankIdx = ranks.findIndex((r) => r.id === targetRankId);
  if (targetRankIdx <= currentRankIdx) return false;
  const targetRank = ranks[targetRankIdx];
  if (!targetRank) return false;
  const occupied = Object.entries(G.ranks)
    .filter(([pid, rankId]) => pid !== playerID && rankId === targetRank.id)
    .length;
  if (occupied >= rankSeatLimitForRank(playerCount, targetRank.id, ranks)) return false;
  const playerResources = G.resources[playerID];
  return hasResources(playerResources, targetRank.requirement) && hasResources(playerResources, targetRank.cost);
};

const hasPlayableCardsByInventory = (G: JojGameState, playerID: string): boolean => {
  if ((G.legendaryHands[playerID]?.length ?? 0) > 0) return true;
  const hand = G.hands[playerID] ?? [];
  for (const card of hand) {
    if (card.category !== 'VVNZ') return true;
    if (!card.grantRank) return true;
    if (canPromoteToSpecificRankWithoutMutation(G, playerID, card.grantRank)) return true;
  }
  return false;
};

const shouldCountNoPlayablePass = (G: JojGameState, playerID: string): boolean =>
  (G.deck?.length ?? 0) === 0 && !hasPlayableCardsByInventory(G, playerID);

const allPlayersOutOfPlayableCardsByInventory = (G: JojGameState): boolean =>
  Object.keys(G.players ?? {}).every((pid) => !hasPlayableCardsByInventory(G, pid));

const buildReplacementPlan = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): ResourceKey[] | null => planReplacementResources(resources, effects);
export { type SimulationReport } from './simulation';

export const runGameSimulations = (
  players: number,
  simulations: number,
  maxTurns = 600,
  options?: SimulationOptions,
): SimulationReport => runGameSimulationsWithDeps({
  resourceKeys,
  shuffle,
  cloneCard,
  getSharedDeckTemplate,
  getActiveRanks,
  getTopRankId,
  drawCards,
  drawLegendaryCards,
  syncPlayerState,
  promoteRank,
  promoteToSpecificRank,
  grantSpecificRankIgnoringRequirements,
  demoteByOneRankWithSeatCheck,
  triggerSukhpayZsuOnScandal: (G, ctx, sourcePlayerID) =>
    triggerSukhpayZsuOnScandal(G, ctx as Ctx, sourcePlayerID),
  cancelLastLyapOrScandalForPlayer,
  cancelLastScandalForPlayer,
  applyCardEffects,
  applyCardEffectsSoft,
  clampNonNegativeResources,
  planReplacementResources: buildReplacementPlan,
  getWinner,
  startingHandSize: STARTING_HAND_SIZE,
  startingLegendaryHandSize: STARTING_LEGENDARY_HAND_SIZE,
}, players, simulations, maxTurns, options);

export const jojGame: Game<JojGameState> = {
  name: 'joj-game',
  minPlayers: 2,
  maxPlayers: 6,
  setup: ({ ctx }, setupData) => {
    const players = [...ctx.playOrder];
    const template = getSharedDeckTemplate();
    const requestedGameMode = resolveGameMode(setupData);
    const setupOverride = resolveSetupOverride(setupData);
    const legacyEnabledModules = resolveLegacyEnabledModules(setupData);
    const deckModules = buildDeckModulesFromTemplate(template, setupOverride);
    let optionalMainDeckCards: CardDefinition[] = deckModules.gameSetup.optionalMainDeckModuleIds
      .flatMap((moduleId) => (deckModules.optionalMainDeckModules[moduleId] ?? []).map(cloneCard));
    if (legacyEnabledModules && !legacyEnabledModules.has(MODULE_VVNZ)) {
      optionalMainDeckCards = optionalMainDeckCards.filter((card) => card.category !== 'VVNZ');
    }
    let optionalLegendaryCards: CardDefinition[] = deckModules.legendaryDeck.map(cloneCard);
    if (legacyEnabledModules && !legacyEnabledModules.has(MODULE_LEGENDARY)) {
      optionalLegendaryCards = [];
    }
    const mergedLegendaryMode = deckModules.gameSetup.legendaryDeckMode === 'merged';
    const effectiveGameMode = normalizeGameModeByLegendaryMode(
      requestedGameMode,
      mergedLegendaryMode ? 'merged' : 'separate',
    );
    const mainDeckCards = [...deckModules.baseDeck.map(cloneCard), ...optionalMainDeckCards.map(cloneCard)];
    const mergedDeckSource = effectiveGameMode === GAME_MODE_SIMPLIFIED
      ? [...mainDeckCards, ...optionalLegendaryCards.map(cloneCard)]
      : mainDeckCards;
    const deck = shuffle(mergedDeckSource.map(cloneCard));
    const hasLegendaryModule = optionalLegendaryCards.length > 0;

    const state = createEmptyGameState({
      gameMode: effectiveGameMode,
      deck,
      legendaryDeck: effectiveGameMode === GAME_MODE_SIMPLIFIED
        ? []
        : !hasLegendaryModule
          ? []
          : effectiveGameMode === GAME_MODE_STANDARD_PLUS
            ? optionalLegendaryCards.map(cloneCard)
            : shuffle(optionalLegendaryCards.map(cloneCard)),
      deckBackImage: template.deckBackImage,
    });

    players.forEach((playerID) => {
      initializePlayerInGameState({
        G: state,
        playerID,
        playerIndex: Number(playerID),
        startingRankId: getActiveRanks()[0]?.id ?? 'cadet',
        startingHandSize: STARTING_HAND_SIZE,
        startingLegendaryHandSize: STARTING_LEGENDARY_HAND_SIZE,
        legendaryDraftCompleted: !hasLegendaryModule || effectiveGameMode === GAME_MODE_STANDARD || effectiveGameMode === GAME_MODE_SIMPLIFIED,
        playerName: '',
        drawCards,
        drawLegendaryCards: hasLegendaryModule && effectiveGameMode === GAME_MODE_STANDARD ? drawLegendaryCards : undefined,
        legendarySourceCards: hasLegendaryModule && effectiveGameMode === GAME_MODE_STANDARD ? optionalLegendaryCards : undefined,
        syncPlayerState,
        onBeforeSync: applyRankImageForPlayer,
      });
    });

    return state;
  },
  turn: {
    activePlayers: { currentPlayer: DRAW_STAGE },
    onBegin: ({ G, ctx, events }) => {
      Object.keys(G.promotedThisTurn).forEach((pid) => {
        G.promotedThisTurn[pid] = false;
      });
      const value: Record<string, string> = {};
      ctx.playOrder.forEach((pid) => {
        value[pid] = IDLE_STAGE;
      });
      value[ctx.currentPlayer] = G.deck.length > 0 ? DRAW_STAGE : PLAY_STAGE;
      events?.setActivePlayers({ value });
    },
  },
  moves: createJojMoves({
    INVALID_MOVE,
    DRAW_STAGE,
    PLAY_STAGE,
    END_STAGE,
    HAND_LIMIT,
    resourceKeys,
    resourceLabelsUk,
    canPlayHandCardAtStage,
    appendChat,
    nextSystemMessageSeq,
    getPlayerLabel,
    syncPlayerState,
    isProtectedFromLyapScandal,
    triggerSukhpayZsuOnScandal,
    applyCardEffects,
    applyCardEffectsSoft,
    getReplacementUnitsForCard,
    summarizeAppliedDiff,
    effectSummaryToText,
    resourceDeltaToText,
    categoryLabelUk,
    cardFlavorSnippet,
    rankNameById,
    buildLyapSystemMessage,
    buildScandalSystemMessage,
    buildSupportSystemMessage,
    buildPlayedLyapSystemMessage,
    buildPlayedScandalSystemMessage,
    buildPlayedDecisionSystemMessage,
    buildVvnzRankSystemMessage,
    buildPromotionSystemMessage,
    buildLegendaryPlayedMessageText,
    legendaryTexts,
    clampNonNegativeResources,
    snapshotResourcesForStats: snapshotResourceTotals,
    recordResourceFlowStats,
    resetNoPlayablePassStreak,
    shouldCountNoPlayablePass,
    hasPlayableCardsByInventory,
    incrementNoPlayablePassStreak: (G) => {
      G.noPlayablePassStreak = (G.noPlayablePassStreak ?? 0) + 1;
    },
    incrementTurnsCompleted: (G) => {
      G.gameStats.turnsCompleted = (G.gameStats.turnsCompleted ?? 0) + 1;
    },
    incrementLyapPlayedOnOthers: (G) => {
      G.gameStats.lyapsPlayedOnOthers = (G.gameStats.lyapsPlayedOnOthers ?? 0) + 1;
    },
    incrementScandalPlayedOnOthers: (G) => {
      G.gameStats.scandalsPlayedOnOthers = (G.gameStats.scandalsPlayedOnOthers ?? 0) + 1;
    },
    resetEndGameVote: (G) => {
      G.endGameVote = { active: false, requestedBy: null, votes: {} };
    },
    computeShieldUntilNextOwnTurn,
    cancelLastLyapOrScandalForPlayer,
    cancelLastScandalForPlayer,
    promoteToSpecificRank,
    grantSpecificRankIgnoringRequirements,
    demoteByOneRankWithSeatCheck,
    promoteRank,
    getActiveRanks,
  }),
  endIf: ({ G }) => {
    if (G.endGameVote?.active) {
      const playerIDs = Object.keys(G.players ?? {});
      const allAgreed = playerIDs.length > 0 && playerIDs.every((pid) => G.endGameVote.votes?.[pid] === true);
      if (allAgreed) {
        const winner = getWinner(G) ?? getRankThenResourceLeader(G);
        return { winner, endReason: 'agreed-end', stats: G.gameStats };
      }
    }
    const winner = getWinner(G);
    if (winner) {
      return { winner, endReason: 'winner', stats: G.gameStats };
    }
    const playerCount = Object.keys(G.players ?? {}).length;
    if (
      playerCount > 0
      && (G.deck?.length ?? 0) === 0
      && allPlayersOutOfPlayableCardsByInventory(G)
      && (G.noPlayablePassStreak ?? 0) >= playerCount
    ) {
      const fallbackWinner = getRankThenResourceLeader(G);
      if (!fallbackWinner) return { endReason: 'stalled-no-cards', stats: G.gameStats };
      return { winner: fallbackWinner, endReason: 'stalled-no-cards', stats: G.gameStats };
    }
    return undefined;
  },
  ai: {
    enumerate: enumerateAiMoves({ DRAW_STAGE, END_STAGE }),
  },
  playerView: ({ G, ctx, playerID }) => createSanitizedPlayerView(G, ctx, playerID ?? undefined),
};

export type JojCtx = Ctx;
