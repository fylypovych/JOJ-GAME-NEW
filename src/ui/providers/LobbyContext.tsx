import React, { createContext, useContext, ReactNode } from 'react';
import type { LobbySession, MatchDescription } from '../app/lobbySession';
import type { GameMode, RoomCapacity } from '../model';

interface LobbyContextValue {
  // Session state
  session: LobbySession | null;
  matches: MatchDescription[];
  loading: boolean;
  error: string;
  
  // Actions
  createRoom: (params: {
    capacity: RoomCapacity;
    gameMode: GameMode;
    withBots: boolean;
    botCount: number;
    botDifficulty: number;
    botProfile: 'random' | 'aggressive' | 'defensive';
    moduleIds: string[];
  }) => Promise<boolean>;
  joinRoom: (matchID: string) => Promise<boolean>;
  spectateRoom: (matchID: string) => Promise<boolean>;
  leaveRoom: () => void;
  refreshMatches: () => Promise<boolean>;
  
  // Derived
  roomPlayerNames: string[];
  canStart: boolean;
}

const LobbyContext = createContext<LobbyContextValue | null>(null);

export const useLobby = () => {
  const ctx = useContext(LobbyContext);
  if (!ctx) throw new Error('useLobby must be used within LobbyProvider');
  return ctx;
};

interface LobbyProviderProps {
  children: ReactNode;
  value: LobbyContextValue;
}

export const LobbyProvider: React.FC<LobbyProviderProps> = ({ children, value }) => (
  <LobbyContext.Provider value={value}>{children}</LobbyContext.Provider>
);

export type { LobbyContextValue };
export { LobbyContext };
// Empty export to satisfy module boundary
export default LobbyProvider;
