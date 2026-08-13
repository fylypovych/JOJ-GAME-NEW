import type { ChatEntryInput, JojGameState } from './types';

export const getPlayerLabel = (G: JojGameState, playerID: string) => {
  const name = G.playerNames[playerID]?.trim();
  return name || 'Гравець';
};

export const appendChat = (
  G: JojGameState,
  entry: ChatEntryInput,
  chatLimit: number,
) => {
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...entry,
  };
  G.chat.push(row);
  if (G.chat.length > chatLimit) {
    G.chat = G.chat.slice(-chatLimit);
  }
};

export const nextSystemMessageSeq = (G: JojGameState): number => {
  const next = (G.systemMessageSeq ?? 0) + 1;
  G.systemMessageSeq = next;
  return next;
};

