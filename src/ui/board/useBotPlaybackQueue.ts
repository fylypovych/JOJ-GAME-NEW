import { useCallback, useEffect, useRef, useState } from 'react';
import type { JojGameState } from '../../game/types';
import { extractPlaybackCardTitle } from './playbackCardMeta';

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
  eventText: string;
  eventCardTitle: string;
};

export type BotPlaybackSpeedLevel = 1 | 2 | 3 | 4 | 5;

const BOT_DELAY_BY_SPEED_LEVEL: Record<BotPlaybackSpeedLevel, number> = {
  1: 60_000,
  2: 45_000,
  3: 30_000,
  4: 20_000,
  5: 10_000,
};

export const clonePlaybackSnapshot = (snapshot: Snapshot): Snapshot => {
  if (typeof structuredClone === 'function') {
    return structuredClone(snapshot);
  }
  return JSON.parse(JSON.stringify(snapshot)) as Snapshot;
};

const collectNewChatRows = (
  chat: JojGameState['chat'] | undefined,
  lastSeenChatId: string,
) => {
  const rows = chat ?? [];
  if (!rows.length) return [] as NonNullable<JojGameState['chat']>;
  if (!lastSeenChatId) return rows;
  const lastSeenIndex = rows.findIndex((row) => row.id === lastSeenChatId);
  if (lastSeenIndex < 0) return rows;
  return rows.slice(lastSeenIndex + 1);
};

const resolveBotActorNameFromText = (text: string, G: JojGameState) => {
  const botIds = Object.keys(G?.botPlayers ?? {});
  for (const playerID of botIds) {
    const botName = String(G?.playerNames?.[playerID] ?? G?.botPlayers?.[playerID]?.name ?? '').trim();
    if (botName && text.includes(botName)) return botName;
  }
  return '';
};

const collectBotPlaybackEvents = (G: JojGameState, lastSeenChatId: string) =>
  collectNewChatRows(G?.chat, lastSeenChatId)
    .filter((row) => row.type === 'system')
    .map((row) => ({
      id: row.id,
      text: row.text,
      actorName: resolveBotActorNameFromText(row.text, G),
    }))
    .filter((row) => row.actorName);

export const buildBotPlaybackQueuedSnapshots = (args: {
  botPlaybackEvents: Array<{ actorName: string; text: string }>;
  queuedSnapshot: Snapshot;
}) => args.botPlaybackEvents.map((event) => {
  return {
    G: args.queuedSnapshot.G,
    ctx: args.queuedSnapshot.ctx,
    shouldDelay: true,
    actorName: event.actorName,
    eventText: event.text,
    eventCardTitle: extractPlaybackCardTitle(event.text),
  };
});

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
  const [botPlaybackSpeed, setBotPlaybackSpeed] = useState<BotPlaybackSpeedLevel>(5);
  const [botAutoplayEnabled, setBotAutoplayEnabled] = useState(true);
  const [botThinkingPlayerName, setBotThinkingPlayerName] = useState('');
  const [botPlaybackEventText, setBotPlaybackEventText] = useState('');
  const [botPlaybackCardTitle, setBotPlaybackCardTitle] = useState('');
  const [isBotPlaybackActive, setIsBotPlaybackActive] = useState(false);
  const [renderSnapshot, setRenderSnapshot] = useState<Snapshot>(() => clonePlaybackSnapshot({
    G: incomingG,
    ctx: incomingCtx,
  }));
  const snapshotQueueRef = useRef<QueuedSnapshot[]>([]);
  const renderSnapshotRef = useRef<Snapshot>(clonePlaybackSnapshot({
    G: incomingG,
    ctx: incomingCtx,
  }));
  const processingQueueRef = useRef(false);
  const lastSnapshotSignatureRef = useRef('');
  const previousIncomingCurrentPlayerRef = useRef(incomingCtx?.currentPlayer ?? '');
  const lastSeenChatIdRef = useRef((incomingG?.chat ?? []).slice(-1)[0]?.id ?? '');
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botAutoplayEnabledRef = useRef(true);
  const botDelayMsRef = useRef(BOT_DELAY_BY_SPEED_LEVEL[5]);

  useEffect(() => () => {
    if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
  }, []);

  useEffect(() => {
    botAutoplayEnabledRef.current = botAutoplayEnabled;
  }, [botAutoplayEnabled]);

  useEffect(() => {
    botDelayMsRef.current = BOT_DELAY_BY_SPEED_LEVEL[botPlaybackSpeed];
  }, [botPlaybackSpeed]);

  const processSnapshotQueue = useCallback(() => {
    if (processingQueueRef.current) return;
    const nextSnapshot = snapshotQueueRef.current[0];
    if (!nextSnapshot) {
      setBotThinkingPlayerName('');
      setBotPlaybackEventText('');
      setBotPlaybackCardTitle('');
      setIsBotPlaybackActive(false);
      return;
    }
    if (nextSnapshot.shouldDelay && !botAutoplayEnabledRef.current) {
      setBotThinkingPlayerName(nextSnapshot.actorName);
      setBotPlaybackEventText(nextSnapshot.eventText);
      setBotPlaybackCardTitle(nextSnapshot.eventCardTitle);
      setIsBotPlaybackActive(true);
      return;
    }
    snapshotQueueRef.current.shift();
    processingQueueRef.current = true;
    const finish = () => {
      setRenderSnapshot(nextSnapshot);
      renderSnapshotRef.current = nextSnapshot;
      processingQueueRef.current = false;
      setBotThinkingPlayerName('');
      setBotPlaybackEventText(nextSnapshot.eventText);
      setBotPlaybackCardTitle(nextSnapshot.eventCardTitle);
      setIsBotPlaybackActive(snapshotQueueRef.current.length > 0);
      if (snapshotQueueRef.current.length) processSnapshotQueue();
    };
    if (nextSnapshot.shouldDelay) {
      setBotThinkingPlayerName(nextSnapshot.actorName);
      setBotPlaybackEventText(nextSnapshot.eventText);
      setBotPlaybackCardTitle(nextSnapshot.eventCardTitle);
      setIsBotPlaybackActive(true);
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        finish();
      }, botDelayMsRef.current);
      return;
    }
    setIsBotPlaybackActive(snapshotQueueRef.current.length > 0);
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
    const queuedSnapshot = clonePlaybackSnapshot({
      G: incomingG,
      ctx: incomingCtx,
    });
    const botPlaybackEvents = collectBotPlaybackEvents(incomingG, lastSeenChatIdRef.current);
    lastSeenChatIdRef.current = (incomingG?.chat ?? []).slice(-1)[0]?.id ?? lastSeenChatIdRef.current;
    if (botPlaybackEvents.length > 0) {
      snapshotQueueRef.current.push(...buildBotPlaybackQueuedSnapshots({
        botPlaybackEvents,
        queuedSnapshot,
      }));
    } else {
      snapshotQueueRef.current.push({
        G: queuedSnapshot.G,
        ctx: queuedSnapshot.ctx,
        shouldDelay: playbackMeta.shouldDelay,
        actorName: playbackMeta.actorName,
        eventText: '',
        eventCardTitle: '',
      });
    }
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
    botPlaybackEventText,
    botPlaybackCardTitle,
    isBotPlaybackActive,
  };
};
