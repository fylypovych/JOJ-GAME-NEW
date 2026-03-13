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

type BotPlaybackSpeed = 'fast' | 'normal' | 'slow';

const BOT_DELAY_BY_SPEED: Record<BotPlaybackSpeed, number> = {
  fast: 250,
  normal: 850,
  slow: 1600,
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
  const snapshotQueueRef = useRef<Snapshot[]>([]);
  const processingQueueRef = useRef(false);
  const lastSnapshotSignatureRef = useRef('');
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
    const nextCurrentPlayer = nextSnapshot.ctx?.currentPlayer ?? '';
    const nextBot = nextCurrentPlayer ? nextSnapshot.G?.botPlayers?.[nextCurrentPlayer] : null;
    const nextBotName = nextCurrentPlayer
      ? String(nextSnapshot.G?.playerNames?.[nextCurrentPlayer] ?? nextBot?.name ?? nextCurrentPlayer)
      : '';
    const shouldDelay = Boolean(nextBot);
    if (shouldDelay && !botAutoplayEnabledRef.current) {
      setBotThinkingPlayerName(nextBotName);
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
    if (shouldDelay) {
      setBotThinkingPlayerName(nextBotName);
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
    const currentPlayer = incomingCtx?.currentPlayer ?? '';
    const stage = currentPlayer ? incomingCtx?.activePlayers?.[currentPlayer] ?? '' : '';
    const signature = [
      incomingCtx?.turn ?? '',
      currentPlayer,
      stage,
      incomingG?.chat?.length ?? '',
      incomingG?.discard?.length ?? '',
      incomingG?.deck?.length ?? '',
      playerID ? incomingG?.hands?.[playerID]?.length ?? '' : '',
    ].join('|');
    if (lastSnapshotSignatureRef.current === signature) return;
    lastSnapshotSignatureRef.current = signature;
    snapshotQueueRef.current.push({ G: incomingG, ctx: incomingCtx });
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
