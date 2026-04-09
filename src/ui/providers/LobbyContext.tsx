import React, { createContext, useContext, ReactNode } from 'react';
import type { UseLobbyDataResult } from '../app/useLobbyData';

// Use the type from useLobbyData directly
type LobbyContextValue = UseLobbyDataResult;

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
