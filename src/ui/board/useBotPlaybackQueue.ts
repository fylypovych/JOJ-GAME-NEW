import { useCallback, useEffect, useRef, useState } from 'react';
import type { JojGameState } from '../../game/types';

type PlaybackCtx = {
  currentPlayer?: string;
  turn?: number;
  activePlayers?: Record<string, string> | null;
  gameover?: unknown;
};

type Snapshot = {
  G: JojGameState;
  ctx: PlaybackCtx;
};

type QueuedSnapshot = Snapshot & {
  shouldDelay: boolean;
  actorName: string;
};

type BotPlaybackSpeed = 'fast' | 'normal' | 'slow';

const BOT_DELAY_BY_SPEED: Record<BotPlaybackSpeed, number> = {
  fast: 250,
  normal: 850,
  slow: 1600,
};

export const createPlaybackSignature = (args: {
  G: JojGameState;
  ctx: PlaybackCtx;
  playerID?: string | null;
}) => {
  const { G, ctx, playerID } = args;
  const discardTop = G?.discard?.length ? G.discard[G.discard.length - 1] : null;
  const chatTail = (G?.chat ?? []).slice(-3).map((row) => ({
    id: row.id,
    type: row.type,
    text: row.text,
    playerID: row.playerID ?? '',
  }));
  const handSizes = Object.keys(G?.hands ?? {})
    .sort()
    .map((pid) => `${pid}:${G.hands?.[pid]?.length ?? 0}`);
  const legendaryHandSizes = Object.keys(G?.legendaryHands ?? {})
    .sort()
    .map((pid) => `${pid}:${G.legendaryHands?.[pid]?.length ?? 0}`);
  return JSON.stringify({
    turn: ctx?.turn ?? '',
    currentPlayer: ctx?.currentPlayer ?? '',
    activePlayers: ctx?.activePlayers ?? null,
    gameover: ctx?.gameover ?? null,
    discardTopId: discardTop?.id ?? '',
    discardCount: G?.discard?.length ?? 0,
    deckCount: G?.deck?.length ?? 0,
    chatTail,
    ranks: G?.ranks ?? {},
    resources: G?.resources ?? {},
    promotedThisTurn: G?.promotedThisTurn ?? {},
    handSizes,
    legendaryHandSizes,
    focusedPlayerHandSize: playerID ? (G?.hands?.[playerID]?.length ?? 0) : null,
  });
};

export const resolveBotPlaybackMeta = (args: {
  previousCurrentPlayer: string;
  nextSnapshot: Snapshot;
}) => {
  const actingBot = args.previousCurrentPlayer
    ? args.nextSnapshot.G?.botPlayers?.[args.previousCurrentPlayer] ?? null
    : null;
  const actorName = actingBot
    ? String(args.nextSnapshot.G?.playerNames?.[args.previousCurrentPlayer] ?? actingBot.name ?? args.previousCurrentPlayer)
    : '';
  return {
    shouldDelay: Boolean(actingBot),
    actorName,
  };
};

export const useBotPlaybackQueue = (args: {
  incomingG: JojGameState;
  incomingCtx: PlaybackCtx;
  playerID?: string | null;
}) => {
  const { incomingG, incomingCtx, playerID } = args;
  const [botPlaybackSpeed, setBotPlaybackSpeed] = useState<BotPlaybackSpeed>('normal');
  const [botAutoplayEnabled, setBotAutoplayEnabled] = useState(true);
  const [botThinkingPlayerName, setBotThinkingPlayerName] = useState('');
  const [renderSnapshot, setRenderSnapshot] = useState<Snapshot>(() => ({
    G: incomingG,
    ctx: incomingCtx,
  }));
  const snapshotQueueRef = useRef<QueuedSnapshot[]>([]);
  const processingQueueRef = useRef(false);
  const lastSnapshotSignatureRef = useRef('');
  const previousIncomingCurrentPlayerRef = useRef(incomingCtx?.currentPlayer ?? '');
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botAutoplayEnabledRef = useRef(true);
  const botDelayMsRef = useRef(BOT_DELAY_BY_SPEED.normal);

  useEffect(() => () => {
    if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
  }, []);

  useEffect(() => {
    botAutoplayEnabledRef.current = botAutoplayEnabled;
  }, [botAutoplayEnabled]);

  useEffect(() => {
    botDelayMsRef.current = BOT_DELAY_BY_SPEED[botPlaybackSpeed];
  }, [botPlaybackSpeed]);

  const processSnapshotQueue = useCallback(() => {
    if (processingQueueRef.current) return;
    const nextSnapshot = snapshotQueueRef.current[0];
    if (!nextSnapshot) {
      setBotThinkingPlayerName('');
      return;
    }
    if (nextSnapshot.shouldDelay && !botAutoplayEnabledRef.current) {
      setBotThinkingPlayerName(nextSnapshot.actorName);
      return;
    }
    snapshotQueueRef.current.shift();
    processingQueueRef.current = true;
    const finish = () => {
      setRenderSnapshot(nextSnapshot);
      processingQueueRef.current = false;
      setBotThinkingPlayerName('');
      if (snapshotQueueRef.current.length) processSnapshotQueue();
    };
    if (nextSnapshot.shouldDelay) {
      setBotThinkingPlayerName(nextSnapshot.actorName);
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        finish();
      }, botDelayMsRef.current);
      return;
    }
    finish();
  }, []);

  useEffect(() => {
    if (botAutoplayEnabled) processSnapshotQueue();
  }, [botAutoplayEnabled, processSnapshotQueue]);

  useEffect(() => {
    const signature = createPlaybackSignature({
      G: incomingG,
      ctx: incomingCtx,
      playerID,
    });
    if (lastSnapshotSignatureRef.current === signature) return;
    lastSnapshotSignatureRef.current = signature;
    const previousCurrentPlayer = previousIncomingCurrentPlayerRef.current;
    const playbackMeta = resolveBotPlaybackMeta({
      previousCurrentPlayer,
      nextSnapshot: { G: incomingG, ctx: incomingCtx },
    });
    previousIncomingCurrentPlayerRef.current = incomingCtx?.currentPlayer ?? '';
    snapshotQueueRef.current.push({
      G: incomingG,
      ctx: incomingCtx,
      shouldDelay: playbackMeta.shouldDelay,
      actorName: playbackMeta.actorName,
    });
    processSnapshotQueue();
  }, [incomingG, incomingCtx, playerID, processSnapshotQueue]);

  return {
    G: renderSnapshot.G,
    ctx: renderSnapshot.ctx,
    botPlaybackSpeed,
    setBotPlaybackSpeed,
    botAutoplayEnabled,
    setBotAutoplayEnabled,
    botThinkingPlayerName,
  };
};
