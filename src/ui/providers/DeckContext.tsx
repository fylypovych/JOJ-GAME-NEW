import React, { createContext, useContext, ReactNode } from 'react';
import type { UseDeckDataResult } from '../app/useDeckData';

const DeckContext = createContext<UseDeckDataResult | null>(null);

export const useDeck = () => {
  const ctx = useContext(DeckContext);
  if (!ctx) throw new Error('useDeck must be used within DeckProvider');
  return ctx;
};

interface DeckProviderProps {
  children: ReactNode;
  value: UseDeckDataResult;
}

export const DeckProvider: React.FC<DeckProviderProps> = ({ children, value }) => (
  <DeckContext.Provider value={value}>{children}</DeckContext.Provider>
);

export { DeckContext };
export default DeckProvider;
