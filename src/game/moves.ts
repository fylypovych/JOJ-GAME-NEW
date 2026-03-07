import type { Ctx } from 'boardgame.io';
import type { CardDefinition, JojGameState, ResourceKey } from './types';

type MoveCtx = {
  currentPlayer: string;
  activePlayers?: Record<string, string> | null;
  numPlayers?: number;
  playOrder?: string[];
  turn?: number;
};

type MoveEvents = {
  setStage?: (stage: string) => void;
  endTurn?: () => void;
};

type MoveArgs = {
  G: JojGameState;
  ctx: MoveCtx;
  playerID?: string;
  events?: MoveEvents;
};

type JojMovesDeps = {
  INVALID_MOVE: 'INVALID_MOVE';
  DRAW_STAGE: string;
  PLAY_STAGE: string;
  END_STAGE: string;
  HAND_LIMIT: number;
  resourceKeys: readonly ResourceKey[];
  resourceLabelsUk: Record<ResourceKey, string>;
  canPlayHandCardAtStage: (args: {
    isCurrentPlayer: boolean;
    stage?: string;
    extraHandPlayTokens: number;
  }) => boolean;
  appendChat: (G: JojGameState, entry: { type: 'player' | 'system'; text: string; playerID?: string }) => void;
  nextSystemMessageSeq: (G: JojGameState) => number;
  getPlayerLabel: (G: JojGameState, playerID: string) => string;
  syncPlayerState: (G: JojGameState, playerID: string) => void;
  isProtectedFromLyapScandal: (G: JojGameState, ctx: Pick<MoveCtx, 'currentPlayer'> & { turn?: number }, playerID: string) => boolean;
  triggerSukhpayZsuOnScandal: (G: JojGameState, ctx: { turn?: number }, sourcePlayerID: string) => void;
  applyCardEffects: (
    G: JojGameState,
    playerID: string,
    effects: CardDefinition['effects'],
    replacementResources?: ResourceKey[],
  ) => boolean;
  applyCardEffectsSoft: (
    G: JojGameState,
    playerID: string,
    effects: CardDefinition['effects'],
  ) => { resources: Partial<Record<ResourceKey, number>>; rank: number };
  summarizeAppliedDiff: (
    beforeResources: Record<ResourceKey, number>,
    afterResources: Record<ResourceKey, number>,
    beforeRankId: string,
    afterRankId: string,
  ) => { resources: Partial<Record<ResourceKey, number>>; rank: number };
  effectSummaryToText: (summary: { resources: Partial<Record<ResourceKey, number>>; rank: number }) => string;
  resourceDeltaToText: (delta: Partial<Record<ResourceKey, number>>) => string;
  categoryLabelUk: (category: CardDefinition['category']) => string;
  cardFlavorSnippet: (card: CardDefinition) => string;
  rankNameById: (rankId: string) => string;
  buildLyapSystemMessage: (...args: any[]) => string;
  buildScandalSystemMessage: (...args: any[]) => string;
  buildSupportSystemMessage: (...args: any[]) => string;
  buildPlayedLyapSystemMessage: (...args: any[]) => string;
  buildPlayedScandalSystemMessage: (...args: any[]) => string;
  buildPlayedDecisionSystemMessage: (...args: any[]) => string;
  buildVvnzRankSystemMessage: (...args: any[]) => string;
  buildPromotionSystemMessage: (...args: any[]) => string;
  buildLegendaryPlayedMessageText: (args: {
    seq: number;
    playerLabel: string;
    cardTitle: string;
    specialMessage: string;
  }) => string;
  legendaryTexts: Record<string, (...args: any[]) => string>;
  clampNonNegativeResources: (resources: Record<ResourceKey, number>) => void;
  snapshotResourcesForStats: (G: JojGameState) => Record<string, Record<ResourceKey, number>>;
  recordResourceFlowStats: (G: JojGameState, before: Record<string, Record<ResourceKey, number>>) => void;
  resetNoPlayablePassStreak: (G: JojGameState) => void;
  shouldCountNoPlayablePass: (G: JojGameState, playerID: string) => boolean;
  hasPlayableCardsByInventory: (G: JojGameState, playerID: string) => boolean;
  incrementNoPlayablePassStreak: (G: JojGameState) => void;
  incrementTurnsCompleted: (G: JojGameState) => void;
  incrementLyapPlayedOnOthers: (G: JojGameState) => void;
  incrementScandalPlayedOnOthers: (G: JojGameState) => void;
  resetEndGameVote: (G: JojGameState) => void;
  computeShieldUntilNextOwnTurn: (ctx: Pick<MoveCtx, 'currentPlayer' | 'playOrder' | 'turn'>, playerID: string) => number;
  cancelLastLyapOrScandalForPlayer: (
    G: JojGameState,
    playerID: string,
  ) => { canceledCard?: CardDefinition | null; summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } };
  cancelLastScandalForPlayer: (
    G: JojGameState,
    playerID: string,
  ) => { canceledCard?: CardDefinition | null; summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } };
  promoteToSpecificRank: (
    G: JojGameState,
    playerID: string,
    rankId: string,
    playerCount: number,
  ) => { ok: boolean; rank?: { cost?: Partial<Record<ResourceKey, number>>; bonus?: Partial<Record<ResourceKey, number>> } };
  grantSpecificRankIgnoringRequirements: (
    G: JojGameState,
    playerID: string,
    rankId: string,
    playerCount: number,
  ) => { ok: true; applied: boolean; rank: { bonus?: Partial<Record<ResourceKey, number>> } }
    | { ok: false; reason: string };
  demoteByOneRankWithSeatCheck: (
    G: JojGameState,
    playerID: string,
    playerCount: number,
  ) => { ok: true; fromRankId: string; toRankId: string }
    | { ok: false; reason: string };
  promoteRank: (G: JojGameState, playerID: string, playerCount: number) => boolean;
  getActiveRanks: () => Array<{ id: string; cost?: Partial<Record<ResourceKey, number>>; bonus?: Partial<Record<ResourceKey, number>> }>;
};

export const createJojMoves = (d: JojMovesDeps) => {
  const isLegendaryDraftPending = (G: JojGameState) => {
    if (G.gameMode !== 'standard_plus') return false;
    const playerIDs = Object.keys(G.players ?? {});
    if (playerIDs.length === 0) return false;
    return playerIDs.some((pid) => G.legendaryDraftCompleted?.[pid] !== true);
  };

  // Apply legendary special effects regardless of whether the card came from
  // legendary hand (standard mode) or from main hand (simplified mode).
  const applyLegendaryCardEffects = (
    args: MoveArgs,
    card: CardDefinition,
    playerID: string,
    targetPlayerID?: string,
    selectedResource?: ResourceKey,
  ) => {
    const playerLabel = d.getPlayerLabel(args.G, playerID);
    if (card.id === 'legendary-02') {
      const canceled = d.cancelLastLyapOrScandalForPlayer(args.G, playerID);
      return canceled.canceledCard
        ? d.legendaryTexts.budanovCanceled(playerLabel, canceled.canceledCard.title, d.effectSummaryToText(canceled.summary))
        : d.legendaryTexts.budanovNoTarget();
    }
    if (card.id === 'legendary-08') {
      const canceled = d.cancelLastScandalForPlayer(args.G, playerID);
      return canceled.canceledCard
        ? d.legendaryTexts.starlinkCanceled(playerLabel, canceled.canceledCard.title, d.effectSummaryToText(canceled.summary))
        : d.legendaryTexts.starlinkNoTarget();
    }
    if (card.id === 'legendary-05') {
      const untilTurn = d.computeShieldUntilNextOwnTurn(args.ctx, playerID);
      args.G.sukhpayZsuWatchUntilTurn[playerID] = untilTurn;
      args.G.sukhpayZsuPendingBonus[playerID] = true;
      return d.legendaryTexts.sukhpayActivated(playerLabel);
    }
    if (card.id === 'legendary-12') {
      const untilTurn = d.computeShieldUntilNextOwnTurn(args.ctx, playerID);
      args.G.lyapScandalShieldUntilTurn[playerID] = untilTurn;
      return d.legendaryTexts.grammarShield(playerLabel);
    }
    if (card.id === 'legendary-03') {
      args.G.extraHandPlayTokens[playerID] = (args.G.extraHandPlayTokens[playerID] ?? 0) + 1;
      return d.legendaryTexts.posmishkaMalyuka(playerLabel);
    }
    if (card.id === 'legendary-06') {
      if (!selectedResource || !d.resourceKeys.includes(selectedResource)) return d.INVALID_MOVE;
      args.G.resources[playerID][selectedResource] = (args.G.resources[playerID][selectedResource] ?? 0) + 3;
      Object.keys(args.G.players).filter((pid) => pid !== playerID).forEach((pid) => {
        args.G.resources[pid].documents = (args.G.resources[pid].documents ?? 0) + 1;
        d.clampNonNegativeResources(args.G.resources[pid]);
        d.syncPlayerState(args.G, pid);
      });
      d.clampNonNegativeResources(args.G.resources[playerID]);
      d.syncPlayerState(args.G, playerID);
      return d.legendaryTexts.statueTor(playerLabel, d.resourceLabelsUk[selectedResource]);
    }
    if (card.id === 'legendary-07') {
      args.G.resources[playerID].time = (args.G.resources[playerID].time ?? 0) + 2;
      args.G.resources[playerID].reputation = (args.G.resources[playerID].reputation ?? 0) + 2;
      Object.keys(args.G.players).filter((pid) => pid !== playerID).forEach((pid) => {
        args.G.resources[pid].reputation = Math.max(0, (args.G.resources[pid].reputation ?? 0) - 1);
        d.clampNonNegativeResources(args.G.resources[pid]);
        d.syncPlayerState(args.G, pid);
      });
      d.clampNonNegativeResources(args.G.resources[playerID]);
      d.syncPlayerState(args.G, playerID);
      return d.legendaryTexts.churchLeadership(playerLabel);
    }
    if (card.id === 'legendary-09') {
      if (!selectedResource || !d.resourceKeys.includes(selectedResource)) return d.INVALID_MOVE;
      const before = args.G.resources[playerID][selectedResource] ?? 0;
      const after = Math.max(before, 3);
      args.G.resources[playerID][selectedResource] = after;
      d.syncPlayerState(args.G, playerID);
      return d.legendaryTexts.waterRestore(playerLabel, d.resourceLabelsUk[selectedResource], before, after);
    }
    if (card.id === 'legendary-13') {
      const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
      const granted = d.grantSpecificRankIgnoringRequirements(args.G, playerID, 'senior_lieutenant', playerCount);
      if (!granted.ok) return d.INVALID_MOVE;
      return granted.applied
        ? d.legendaryTexts.goodPressOfficerGranted(playerLabel, d.rankNameById('senior_lieutenant'), d.resourceDeltaToText(granted.rank.bonus ?? {}))
        : d.legendaryTexts.goodPressOfficerNoChange(playerLabel, d.rankNameById(args.G.ranks[playerID]));
    }
    if (card.id === 'legendary-10') {
      if (!targetPlayerID || !(targetPlayerID in args.G.players) || targetPlayerID === playerID) return d.INVALID_MOVE;
      const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
      const demoted = d.demoteByOneRankWithSeatCheck(args.G, targetPlayerID, playerCount);
      if (!demoted.ok) return d.INVALID_MOVE;
      return d.legendaryTexts.droidDemote(d.getPlayerLabel(args.G, targetPlayerID), d.rankNameById(demoted.fromRankId), d.rankNameById(demoted.toRankId));
    }
    return '';
  };

  return ({
  syncPlayerNames: (args: MoveArgs, names: Record<string, string>) => {
    if (!names || typeof names !== 'object') return d.INVALID_MOVE;
    Object.entries(names).forEach(([pid, value]) => {
      if (!(pid in args.G.players)) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      args.G.playerNames[pid] = trimmed.slice(0, 32);
    });
    return undefined;
  },
  setPlayerName: (args: MoveArgs, name: string) => {
    const playerID = args.playerID;
    if (!playerID) return d.INVALID_MOVE;
    const trimmed = name.trim();
    if (!trimmed) return d.INVALID_MOVE;
    args.G.playerNames[playerID] = trimmed.slice(0, 32);
    return undefined;
  },
  selectLegendaryLoadout: (args: MoveArgs, cardIds: string[]) => {
    const playerID = args.playerID;
    if (!playerID) return d.INVALID_MOVE;
    if (args.G.gameMode !== 'standard_plus') return d.INVALID_MOVE;
    if (args.G.legendaryDraftCompleted?.[playerID]) return d.INVALID_MOVE;
    if (!Array.isArray(cardIds)) return d.INVALID_MOVE;
    const normalizedIds = cardIds.map((id) => String(id).trim()).filter(Boolean);
    const uniqueIds = Array.from(new Set(normalizedIds));
    if (uniqueIds.length !== 5) return d.INVALID_MOVE;
    const byId = new Map((args.G.legendaryDeck ?? []).map((card) => [card.id, card] as const));
    const selected = uniqueIds.map((id) => byId.get(id)).filter((card): card is CardDefinition => Boolean(card));
    if (selected.length !== 5) return d.INVALID_MOVE;
    args.G.legendaryHands[playerID] = selected.map((card) => ({ ...card }));
    args.G.legendaryDraftCompleted[playerID] = true;
    d.syncPlayerState(args.G, playerID);
    return undefined;
  },
  requestEndGameVote: (args: MoveArgs) => {
    const playerID = args.playerID;
    if (!playerID || !(playerID in args.G.players)) return d.INVALID_MOVE;
    if (args.G.endGameVote?.active) return d.INVALID_MOVE;
    args.G.endGameVote = {
      active: true,
      requestedBy: playerID,
      votes: {
        [playerID]: true,
      },
    };
    return undefined;
  },
  respondEndGameVote: (args: MoveArgs, agree: boolean) => {
    const playerID = args.playerID;
    if (!playerID || !(playerID in args.G.players)) return d.INVALID_MOVE;
    if (!args.G.endGameVote?.active) return d.INVALID_MOVE;
    if (!agree) {
      d.resetEndGameVote(args.G);
      return undefined;
    }
    args.G.endGameVote.votes[playerID] = true;
    return undefined;
  },
  sendChat: (args: MoveArgs, text: string) => {
    const playerID = args.playerID;
    if (!playerID) return d.INVALID_MOVE;
    const trimmed = text.trim();
    if (!trimmed) return d.INVALID_MOVE;
    d.appendChat(args.G, { type: 'player', playerID, text: trimmed.slice(0, 280) });
    return undefined;
  },
  drawCard: (args: MoveArgs) => {
    const playerID = args.playerID;
    if (!playerID || args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
    if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
    if (args.ctx.activePlayers?.[playerID] !== d.DRAW_STAGE) return d.INVALID_MOVE;

    const beforeResources = d.snapshotResourcesForStats(args.G);
    const hand = args.G.hands[playerID];
    let autoPlayed = false;
    const card = args.G.deck.pop();
    if (card) {
      if (card.category === 'LYAP') {
        const protectedSelf = d.isProtectedFromLyapScandal(args.G, args.ctx, playerID);
        const summary = protectedSelf ? { resources: {}, rank: 0 } : d.applyCardEffectsSoft(args.G, playerID, card.effects);
        const seq = d.nextSystemMessageSeq(args.G);
        d.appendChat(args.G, {
          type: 'system',
          text: protectedSelf
            ? `🛡️ [${seq}] ${d.getPlayerLabel(args.G, playerID)} витягнув «${card.title}», але щит від Грамоти скасував ЛЯП.`
            : d.buildLyapSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, summary),
        });
        args.G.discard.push(card);
        autoPlayed = true;
      } else if (card.category === 'SCANDAL') {
        const targetSummaries: string[] = [];
        Object.keys(args.G.players).forEach((pid) => {
          if (d.isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
            targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`);
          } else {
            const summary = d.applyCardEffectsSoft(args.G, pid, card.effects);
            targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`);
          }
          d.syncPlayerState(args.G, pid);
        });
        d.triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
        const seq = d.nextSystemMessageSeq(args.G);
        d.appendChat(args.G, {
          type: 'system',
          text: d.buildScandalSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, targetSummaries),
        });
        args.G.discard.push(card);
        autoPlayed = true;
      } else {
        hand.push(card);
      }
    }
    d.syncPlayerState(args.G, playerID);
    d.recordResourceFlowStats(args.G, beforeResources);
    d.resetNoPlayablePassStreak(args.G);
    d.resetEndGameVote(args.G);
    args.events?.setStage?.(autoPlayed ? d.END_STAGE : d.PLAY_STAGE);
    return undefined;
  },
  playCard: (
    args: MoveArgs,
    cardId: string,
    replacementResources: ResourceKey[] = [],
    targetPlayerID?: string,
  ) => {
    const playerID = args.playerID;
    if (!playerID) return d.INVALID_MOVE;
    if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
    if (args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
    const stage = args.ctx.activePlayers?.[playerID] as string | undefined;
    const usingExtraToken = (args.G.extraHandPlayTokens[playerID] ?? 0) > 0 && stage === d.END_STAGE;
    if (!d.canPlayHandCardAtStage({
      isCurrentPlayer: args.ctx.currentPlayer === playerID,
      stage,
      extraHandPlayTokens: args.G.extraHandPlayTokens[playerID] ?? 0,
    })) return d.INVALID_MOVE;

    const hand = args.G.hands[playerID];
    const idx = hand.findIndex((card: CardDefinition) => card.id === cardId);
    if (idx === -1) return d.INVALID_MOVE;
    const beforeResources = d.snapshotResourcesForStats(args.G);

    const card = hand[idx];
    const allPlayerIDs = Object.keys(args.G.players);
    const applySoftTo = (pid: string) => {
      const summary = d.applyCardEffectsSoft(args.G, pid, card.effects);
      d.syncPlayerState(args.G, pid);
      return summary;
    };

    if (card.category === 'LYAP') {
      if (!targetPlayerID || targetPlayerID === playerID || !(targetPlayerID in args.G.players)) return d.INVALID_MOVE;
      d.incrementLyapPlayedOnOthers(args.G);
      const protectedTarget = d.isProtectedFromLyapScandal(args.G, args.ctx, targetPlayerID);
      const summary = protectedTarget ? { resources: {}, rank: 0 } : applySoftTo(targetPlayerID);
      const seq = d.nextSystemMessageSeq(args.G);
      d.appendChat(args.G, {
        type: 'system',
        text: protectedTarget
          ? `🛡️ [${seq}] ${d.getPlayerLabel(args.G, playerID)} розіграв ЛЯП «${card.title}» на ${d.getPlayerLabel(args.G, targetPlayerID)}, але щит від Грамоти скасував дію.`
          : d.buildPlayedLyapSystemMessage(seq, d.getPlayerLabel(args.G, playerID), d.getPlayerLabel(args.G, targetPlayerID), card, summary),
      });
    } else if (card.category === 'SCANDAL') {
      d.incrementScandalPlayedOnOthers(args.G);
      const targetSummaries: string[] = [];
      allPlayerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
        if (d.isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
          targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`);
          return;
        }
        const summary = applySoftTo(pid);
        targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`);
      });
      d.triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
      const seq = d.nextSystemMessageSeq(args.G);
      d.appendChat(args.G, {
        type: 'system',
        text: d.buildPlayedScandalSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, targetSummaries),
      });
    } else if (card.category === 'SUPPORT') {
      const beforeResources = { ...args.G.resources[playerID] };
      const beforeRankId = args.G.ranks[playerID];
      try {
        const applied = d.applyCardEffects(args.G, playerID, card.effects, replacementResources);
        if (!applied) return d.INVALID_MOVE;
      } catch {
        return d.INVALID_MOVE;
      }
      const summary = d.summarizeAppliedDiff(beforeResources, args.G.resources[playerID], beforeRankId, args.G.ranks[playerID]);
      const seq = d.nextSystemMessageSeq(args.G);
      d.appendChat(args.G, {
        type: 'system',
        text: d.buildSupportSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, summary),
      });
    } else if (card.category === 'DECISION') {
      const targetSummaries: string[] = [];
      let invalidDecisionReplacement = false;
      allPlayerIDs.forEach((pid) => {
        if (invalidDecisionReplacement) return;
        if (pid === playerID) {
          const beforeResources = { ...args.G.resources[playerID] };
          const beforeRankId = args.G.ranks[playerID];
          try {
            const applied = d.applyCardEffects(args.G, playerID, card.effects, replacementResources);
            if (!applied) {
              invalidDecisionReplacement = true;
              return;
            }
          } catch {
            invalidDecisionReplacement = true;
            return;
          }
          const summary = d.summarizeAppliedDiff(beforeResources, args.G.resources[playerID], beforeRankId, args.G.ranks[playerID]);
          targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`);
          d.syncPlayerState(args.G, pid);
          return;
        }
        const summary = applySoftTo(pid);
        targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`);
      });
      if (invalidDecisionReplacement) return d.INVALID_MOVE;
      const seq = d.nextSystemMessageSeq(args.G);
      d.appendChat(args.G, {
        type: 'system',
        text: d.buildPlayedDecisionSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, targetSummaries),
      });
    } else if (card.category === 'VVNZ' && card.grantRank) {
      const beforeResources = { ...args.G.resources[playerID] };
      const beforeRankId = args.G.ranks[playerID];
      const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
      const promoted = d.promoteToSpecificRank(args.G, playerID, card.grantRank, playerCount);
      if (!promoted.ok) return d.INVALID_MOVE;
      try {
        const applied = d.applyCardEffects(args.G, playerID, card.effects, []);
        if (!applied) return d.INVALID_MOVE;
      } catch {
        return d.INVALID_MOVE;
      }
      const afterRankId = args.G.ranks[playerID];
      const summary = d.summarizeAppliedDiff(beforeResources, args.G.resources[playerID], beforeRankId, afterRankId);
      const seq = d.nextSystemMessageSeq(args.G);
      d.appendChat(args.G, {
        type: 'system',
        text: d.buildVvnzRankSystemMessage(
          seq,
          d.getPlayerLabel(args.G, playerID),
          card,
          beforeRankId,
          afterRankId,
          promoted.rank?.cost ?? {},
          promoted.rank?.bonus ?? {},
          summary,
        ),
      });
    } else if (card.category === 'LEGENDARY') {
      const specialMessage = applyLegendaryCardEffects(
        args,
        card,
        playerID,
        targetPlayerID,
        replacementResources[0],
      );
      if (specialMessage === d.INVALID_MOVE) return d.INVALID_MOVE;
      try {
        const applied = d.applyCardEffects(args.G, playerID, card.effects, []);
        if (!applied) return d.INVALID_MOVE;
      } catch {
        return d.INVALID_MOVE;
      }
      const seq = d.nextSystemMessageSeq(args.G);
      d.appendChat(args.G, {
        type: 'system',
        text: d.buildLegendaryPlayedMessageText({ seq, playerLabel: d.getPlayerLabel(args.G, playerID), cardTitle: card.title, specialMessage }),
      });
    } else {
      try {
        const applied = d.applyCardEffects(args.G, playerID, card.effects, replacementResources);
        if (!applied) return d.INVALID_MOVE;
      } catch {
        return d.INVALID_MOVE;
      }
    }

    hand.splice(idx, 1);
    args.G.discard.push(card);
    d.syncPlayerState(args.G, playerID);
    d.recordResourceFlowStats(args.G, beforeResources);
    d.resetNoPlayablePassStreak(args.G);
    d.resetEndGameVote(args.G);
    if (usingExtraToken) {
      args.G.extraHandPlayTokens[playerID] = Math.max(0, (args.G.extraHandPlayTokens[playerID] ?? 0) - 1);
    } else {
      args.events?.setStage?.(d.END_STAGE);
    }
    return undefined;
  },
  playLegendaryCard: (args: MoveArgs, cardId: string, targetPlayerID?: string, selectedResource?: ResourceKey) => {
    const playerID = args.playerID;
    if (!playerID) return d.INVALID_MOVE;
    if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
    if (args.G.gameMode === 'simplified') return d.INVALID_MOVE;
    const hand = args.G.legendaryHands[playerID] ?? [];
    const idx = hand.findIndex((card: CardDefinition) => card.id === cardId);
    if (idx === -1) return d.INVALID_MOVE;
    const beforeResources = d.snapshotResourcesForStats(args.G);
    const card = hand[idx];
    const playerLabel = d.getPlayerLabel(args.G, playerID);
    const specialMessage = applyLegendaryCardEffects(
      args,
      card,
      playerID,
      targetPlayerID,
      selectedResource,
    );
    if (specialMessage === d.INVALID_MOVE) return d.INVALID_MOVE;

    try {
      const applied = d.applyCardEffects(args.G, playerID, card.effects, []);
      if (!applied) return d.INVALID_MOVE;
    } catch {
      return d.INVALID_MOVE;
    }

    hand.splice(idx, 1);
    args.G.legendaryDiscard.push(card);
    d.syncPlayerState(args.G, playerID);
    d.recordResourceFlowStats(args.G, beforeResources);
    d.resetNoPlayablePassStreak(args.G);
    d.resetEndGameVote(args.G);
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: d.buildLegendaryPlayedMessageText({ seq, playerLabel, cardTitle: card.title, specialMessage }),
    });
    return undefined;
  },
  discardFromHand: (args: MoveArgs, cardId: string) => {
    const playerID = args.playerID;
    if (!playerID || args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
    if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
    const stage = args.ctx.activePlayers?.[playerID];
    if (![d.PLAY_STAGE, d.END_STAGE].includes(stage as string)) return d.INVALID_MOVE;
    const hand = args.G.hands[playerID];
    if (hand.length <= d.HAND_LIMIT) return d.INVALID_MOVE;
    const idx = hand.findIndex((card: CardDefinition) => card.id === cardId);
    if (idx === -1) return d.INVALID_MOVE;
    const card = hand[idx];
    if (card.category === 'LYAP' || card.category === 'SCANDAL') return d.INVALID_MOVE;
    hand.splice(idx, 1);
    args.G.discard.push(card);
    d.syncPlayerState(args.G, playerID);
    d.resetNoPlayablePassStreak(args.G);
    d.resetEndGameVote(args.G);
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: `🗂️ [${seq}] ${d.getPlayerLabel(args.G, playerID)} скидає «${card.title}» у скид, щоб вкластися в ліміт руки (${d.HAND_LIMIT}).`,
    });
    args.events?.setStage?.(d.PLAY_STAGE);
    return undefined;
  },
  promote: (args: MoveArgs) => {
    const playerID = args.playerID;
    if (!playerID || args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
    if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
    if (![d.PLAY_STAGE, d.END_STAGE].includes(args.ctx.activePlayers?.[playerID] as string)) return d.INVALID_MOVE;
    if (args.G.promotedThisTurn[playerID]) return d.INVALID_MOVE;
    const beforeResources = { ...args.G.resources[playerID] };
    const beforeResourcesGlobal = d.snapshotResourcesForStats(args.G);
    const beforeRankId = args.G.ranks[playerID];
    const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
    if (!d.promoteRank(args.G, playerID, playerCount)) return d.INVALID_MOVE;
    args.G.promotedThisTurn[playerID] = true;
    const afterRankId = args.G.ranks[playerID];
    const promotedRank = d.getActiveRanks().find((row) => row.id === afterRankId);
    const summary = d.summarizeAppliedDiff(beforeResources, args.G.resources[playerID], beforeRankId, afterRankId);
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: d.buildPromotionSystemMessage(
        seq,
        d.getPlayerLabel(args.G, playerID),
        beforeRankId,
        afterRankId,
        promotedRank?.cost ?? {},
        promotedRank?.bonus ?? {},
        summary,
      ),
    });
    d.recordResourceFlowStats(args.G, beforeResourcesGlobal);
    d.resetNoPlayablePassStreak(args.G);
    d.resetEndGameVote(args.G);
    return undefined;
  },
  pass: (args: MoveArgs) => {
    const playerID = args.playerID;
    if (!playerID || args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
    if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
    if (![d.PLAY_STAGE, d.END_STAGE].includes(args.ctx.activePlayers?.[playerID] as string)) return d.INVALID_MOVE;
    if ((args.G.hands[playerID]?.length ?? 0) > d.HAND_LIMIT) return d.INVALID_MOVE;
    if ((args.G.deck?.length ?? 0) === 0 && d.hasPlayableCardsByInventory(args.G, playerID)) return d.INVALID_MOVE;
    d.incrementTurnsCompleted(args.G);
    if (d.shouldCountNoPlayablePass(args.G, playerID)) d.incrementNoPlayablePassStreak(args.G);
    else d.resetNoPlayablePassStreak(args.G);
    args.events?.endTurn?.();
    return undefined;
  },
  });
};

export const enumerateAiMoves = (deps: {
  DRAW_STAGE: string;
  END_STAGE: string;
}) => (G: JojGameState, ctx: Ctx, playerID?: string) => {
  const currentPlayer = playerID ?? ctx.currentPlayer;
  if (G.gameMode === 'standard_plus') {
    const allLegendary = G.legendaryDeck ?? [];
    const draftReady = Object.keys(G.players ?? {}).every((pid) => G.legendaryDraftCompleted?.[pid] === true);
    if (!draftReady && (G.legendaryDraftCompleted?.[currentPlayer] ?? false) !== true) {
      return [{ move: 'selectLegendaryLoadout' as const, args: [allLegendary.slice(0, 5).map((card) => card.id)] }];
    }
  }
  const hand = G.hands[currentPlayer] ?? [];
  const legendaryHand = G.gameMode === 'simplified' ? [] : (G.legendaryHands[currentPlayer] ?? []);
  const stage = ctx.activePlayers?.[currentPlayer];
  if (stage === deps.DRAW_STAGE) {
    return [
      { move: 'drawCard' as const },
      ...legendaryHand.map((card) => ({ move: 'playLegendaryCard' as const, args: [card.id] })),
    ];
  }
  if (stage === deps.END_STAGE) {
    return [
      { move: 'promote' as const },
      { move: 'pass' as const },
      ...legendaryHand.map((card) => ({ move: 'playLegendaryCard' as const, args: [card.id] })),
    ];
  }
  return [
    ...legendaryHand.map((card) => ({ move: 'playLegendaryCard' as const, args: [card.id] })),
    ...hand.map((card) => ({ move: 'playCard' as const, args: [card.id] })),
    { move: 'promote' as const },
    { move: 'pass' as const },
  ];
};
