import { useCallback } from 'react';
import type { CardDefinition, RankDefinition } from '../../game/types';
import type { DeckTarget } from '../../game/jojGame';

export interface UseDeckHandlersArgs {
  sharedRanks: RankDefinition[];
  refreshSharedDeckTemplate: (force?: boolean) => Promise<boolean>;
  exportSharedDeckTemplateJson: () => string;
  importSharedDeckTemplateJson: (json: string) => { ok: true } | { ok: false; error: string };
  shuffleSharedDeckTemplate: () => void;
  addCardToSharedDeckTemplate: (target: DeckTarget, cardId: string) => boolean;
  addCustomCardToSharedDeckTemplate: (target: DeckTarget, card: CardDefinition) => void;
  updateCardAtInSharedDeckTemplate: (target: DeckTarget, index: number, card: CardDefinition) => void;
  removeCardAtFromSharedDeckTemplate: (target: DeckTarget, index: number) => void;
  resetSharedDeckTemplate: () => void;
  setSharedDeckBackImage: (path: string) => void;
  setSharedRanksState: (ranks: RankDefinition[]) => void;
  exportSharedRanksJson: () => string;
  getSharedRanks: () => RankDefinition[];
  importSharedRanksJson: (json: string) => { ok: true } | { ok: false; error: string };
  setSharedRanks: (ranks: RankDefinition[]) => boolean;
  resetSharedRanks: () => void;
  RANKS_API: string;
  adminFetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export interface UseDeckHandlersResult {
  rollbackTemplate: (json: string) => void;
  applyTemplateChange: (mutate: () => void, previousJson?: string) => Promise<boolean>;
  onShuffleDeck: () => void;
  onAddCard: (target: DeckTarget, cardId: string) => boolean;
  onAddCustomCard: (target: DeckTarget, card: CardDefinition) => void;
  onUpdateCard: (target: DeckTarget, index: number, card: CardDefinition) => void;
  onRemoveCard: (target: DeckTarget, index: number) => void;
  onResetDeck: () => void;
  onSetBack: (path?: string) => void;
  onExportTemplate: () => string;
  onImportTemplate: (json: string) => string | null;
  rollbackRanks: (previousRanks: RankDefinition[]) => void;
  onExportRanks: () => string;
  onImportRanks: (json: string) => string | null;
  onSetRanks: (nextRanks: RankDefinition[]) => boolean;
  onResetRanks: () => void;
}

export const useDeckHandlers = (args: UseDeckHandlersArgs): UseDeckHandlersResult => {
  const {
    sharedRanks,
    refreshSharedDeckTemplate,
    exportSharedDeckTemplateJson,
    importSharedDeckTemplateJson,
    shuffleSharedDeckTemplate,
    addCardToSharedDeckTemplate,
    addCustomCardToSharedDeckTemplate,
    updateCardAtInSharedDeckTemplate,
    removeCardAtFromSharedDeckTemplate,
    resetSharedDeckTemplate,
    setSharedDeckBackImage,
    setSharedRanksState,
    exportSharedRanksJson,
    getSharedRanks,
    importSharedRanksJson,
    setSharedRanks,
    resetSharedRanks,
    RANKS_API,
    adminFetch,
  } = args;

  const rollbackTemplate = useCallback((json: string) => {
    const result = importSharedDeckTemplateJson(json);
    if (result.ok) void refreshSharedDeckTemplate(false);
  }, [importSharedDeckTemplateJson, refreshSharedDeckTemplate]);

  const applyTemplateChange = useCallback(async (mutate: () => void, previousJson = exportSharedDeckTemplateJson()) => {
    mutate();
    const ok = await refreshSharedDeckTemplate();
    if (!ok) rollbackTemplate(previousJson);
    return ok;
  }, [exportSharedDeckTemplateJson, refreshSharedDeckTemplate, rollbackTemplate]);

  const onShuffleDeck = useCallback(() => {
    void applyTemplateChange(() => {
      shuffleSharedDeckTemplate();
    });
  }, [applyTemplateChange, shuffleSharedDeckTemplate]);

  const onAddCard = useCallback((target: DeckTarget, cardId: string): boolean => {
    const previousJson = exportSharedDeckTemplateJson();
    const added = addCardToSharedDeckTemplate(target, cardId);
    if (added) void refreshSharedDeckTemplate().then((ok) => {
      if (!ok) rollbackTemplate(previousJson);
    });
    return added;
  }, [exportSharedDeckTemplateJson, addCardToSharedDeckTemplate, refreshSharedDeckTemplate, rollbackTemplate]);

  const onAddCustomCard = useCallback((target: DeckTarget, card: CardDefinition) => {
    void applyTemplateChange(() => {
      addCustomCardToSharedDeckTemplate(target, card);
    });
  }, [applyTemplateChange, addCustomCardToSharedDeckTemplate]);

  const onUpdateCard = useCallback((target: DeckTarget, index: number, card: CardDefinition) => {
    void applyTemplateChange(() => {
      updateCardAtInSharedDeckTemplate(target, index, card);
    });
  }, [applyTemplateChange, updateCardAtInSharedDeckTemplate]);

  const onRemoveCard = useCallback((target: DeckTarget, index: number) => {
    void applyTemplateChange(() => {
      removeCardAtFromSharedDeckTemplate(target, index);
    });
  }, [applyTemplateChange, removeCardAtFromSharedDeckTemplate]);

  const onResetDeck = useCallback(() => {
    void applyTemplateChange(() => {
      resetSharedDeckTemplate();
    });
  }, [applyTemplateChange, resetSharedDeckTemplate]);

  const onSetBack = useCallback((path?: string) => {
    void applyTemplateChange(() => {
      setSharedDeckBackImage(path ?? '');
    });
  }, [applyTemplateChange, setSharedDeckBackImage]);

  const onExportTemplate = useCallback(() => {
    return exportSharedDeckTemplateJson();
  }, [exportSharedDeckTemplateJson]);

  const onImportTemplate = useCallback((json: string): string | null => {
    const previousJson = exportSharedDeckTemplateJson();
    const result = importSharedDeckTemplateJson(json);
    if (!result.ok) return result.error;
    void refreshSharedDeckTemplate().then((ok) => {
      if (!ok) rollbackTemplate(previousJson);
    });
    return null;
  }, [exportSharedDeckTemplateJson, importSharedDeckTemplateJson, refreshSharedDeckTemplate, rollbackTemplate]);

  const rollbackRanks = useCallback((previousRanks: RankDefinition[]) => {
    if (!setSharedRanks(previousRanks)) return;
    setSharedRanksState(getSharedRanks());
  }, [setSharedRanks, setSharedRanksState, getSharedRanks]);

  const onExportRanks = useCallback(() => {
    return exportSharedRanksJson();
  }, [exportSharedRanksJson]);

  const onImportRanks = useCallback((json: string): string | null => {
    const previousRanks = sharedRanks.map((rank) => ({ ...rank }));
    const result = importSharedRanksJson(json);
    if (!result.ok) return result.error;
    const normalized = getSharedRanks();
    setSharedRanksState(normalized);
    void adminFetch(`${RANKS_API}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranks: normalized }),
    }).then((response) => {
      if (!response.ok) rollbackRanks(previousRanks);
    }).catch(() => {
      rollbackRanks(previousRanks);
    });
    return null;
  }, [sharedRanks, importSharedRanksJson, getSharedRanks, setSharedRanksState, adminFetch, RANKS_API, rollbackRanks]);

  const onSetRanks = useCallback((nextRanks: RankDefinition[]): boolean => {
    const previousRanks = sharedRanks.map((rank) => ({ ...rank }));
    if (!setSharedRanks(nextRanks)) return false;
    const normalized = getSharedRanks();
    setSharedRanksState(normalized);
    void adminFetch(`${RANKS_API}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranks: normalized }),
    }).then((response) => {
      if (!response.ok) rollbackRanks(previousRanks);
    }).catch(() => {
      rollbackRanks(previousRanks);
    });
    return true;
  }, [sharedRanks, setSharedRanks, getSharedRanks, setSharedRanksState, adminFetch, RANKS_API, rollbackRanks]);

  const onResetRanks = useCallback(() => {
    const previousRanks = sharedRanks.map((rank) => ({ ...rank }));
    resetSharedRanks();
    const normalized = getSharedRanks();
    setSharedRanksState(normalized);
    void adminFetch(`${RANKS_API}/reset`, { method: 'POST' }).then((response) => {
      if (!response.ok) rollbackRanks(previousRanks);
    }).catch(() => {
      rollbackRanks(previousRanks);
    });
  }, [sharedRanks, resetSharedRanks, getSharedRanks, setSharedRanksState, adminFetch, RANKS_API, rollbackRanks]);

  return {
    rollbackTemplate,
    applyTemplateChange,
    onShuffleDeck,
    onAddCard,
    onAddCustomCard,
    onUpdateCard,
    onRemoveCard,
    onResetDeck,
    onSetBack,
    onExportTemplate,
    onImportTemplate,
    rollbackRanks,
    onExportRanks,
    onImportRanks,
    onSetRanks,
    onResetRanks,
  };
};
