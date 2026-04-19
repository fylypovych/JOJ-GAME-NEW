import { useCallback } from 'react';
import type { CardDefinition, RankDefinition } from '../../game/types';
import type { DeckTarget } from '../../game/jojGame';
import {
  exportSharedDeckTemplateJson,
  importSharedDeckTemplateJson,
  shuffleSharedDeckTemplate,
  addCardToSharedDeckTemplate,
  addCustomCardToSharedDeckTemplate,
  updateCardAtInSharedDeckTemplate,
  removeCardAtFromSharedDeckTemplate,
  resetSharedDeckTemplate,
  setSharedDeckBackImage,
  exportSharedRanksJson,
  getSharedRanks,
  importSharedRanksJson,
  setSharedRanks,
  resetSharedRanks,
} from '../../game/sharedConfig';
import { SERVER_URL } from './clientConfig';
import { createBrowserApiClient } from './httpClient';

const RANKS_API = `${SERVER_URL}/api/shared-ranks`;

export interface UseDeckHandlersArgs {
  refreshSharedDeckTemplate: (force?: boolean) => Promise<boolean>;
  setSharedRanksState: (ranks: RankDefinition[]) => void;
  sharedRanks: RankDefinition[];
  saveTemplateToPostgres?: (templateJson: string, ranksJson: string) => Promise<boolean>;
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
  saveTemplateToPostgres?: (templateJson: string, ranksJson: string) => Promise<boolean>;
}

export const useDeckHandlers = (args: UseDeckHandlersArgs): UseDeckHandlersResult => {
  const { refreshSharedDeckTemplate, setSharedRanksState, sharedRanks, saveTemplateToPostgres } = args;
  const api = createBrowserApiClient(SERVER_URL);

  const rollbackTemplate = useCallback((json: string) => {
    const result = importSharedDeckTemplateJson(json);
    if (result.ok) void refreshSharedDeckTemplate(false);
  }, []);

  const applyTemplateChange = useCallback(async (mutate: () => void, previousJson = exportSharedDeckTemplateJson()) => {
    mutate();
    const ok = await refreshSharedDeckTemplate();
    if (!ok) {
      rollbackTemplate(previousJson);
      return false;
    }
    // Auto-save to PostgreSQL if available
    if (saveTemplateToPostgres) {
      const templateJson = exportSharedDeckTemplateJson();
      const ranksJson = exportSharedRanksJson();
      void saveTemplateToPostgres(templateJson, ranksJson);
    }
    return ok;
  }, [rollbackTemplate, saveTemplateToPostgres]);

  const onShuffleDeck = useCallback(() => {
    void applyTemplateChange(() => {
      shuffleSharedDeckTemplate();
    });
  }, [applyTemplateChange]);

  const onAddCard = useCallback((target: DeckTarget, cardId: string): boolean => {
    const previousJson = exportSharedDeckTemplateJson();
    const added = addCardToSharedDeckTemplate(target, cardId);
    if (added) void refreshSharedDeckTemplate().then((ok) => {
      if (!ok) rollbackTemplate(previousJson);
    });
    return added;
  }, [rollbackTemplate]);

  const onAddCustomCard = useCallback((target: DeckTarget, card: CardDefinition) => {
    void applyTemplateChange(() => {
      addCustomCardToSharedDeckTemplate(target, card);
    });
  }, [applyTemplateChange]);

  const onUpdateCard = useCallback((target: DeckTarget, index: number, card: CardDefinition) => {
    void applyTemplateChange(() => {
      updateCardAtInSharedDeckTemplate(target, index, card);
    });
  }, [applyTemplateChange]);

  const onRemoveCard = useCallback((target: DeckTarget, index: number) => {
    void applyTemplateChange(() => {
      removeCardAtFromSharedDeckTemplate(target, index);
    });
  }, [applyTemplateChange]);

  const onResetDeck = useCallback(() => {
    void applyTemplateChange(() => {
      resetSharedDeckTemplate();
    });
  }, [applyTemplateChange]);

  const onSetBack = useCallback((path?: string) => {
    void applyTemplateChange(() => {
      setSharedDeckBackImage(path ?? '');
    });
  }, [applyTemplateChange]);

  const onExportTemplate = useCallback(() => {
    return exportSharedDeckTemplateJson();
  }, []);

  const onImportTemplate = useCallback((json: string): string | null => {
    const previousJson = exportSharedDeckTemplateJson();
    const result = importSharedDeckTemplateJson(json);
    if (!result.ok) return result.error;
    void refreshSharedDeckTemplate().then((ok) => {
      if (!ok) rollbackTemplate(previousJson);
    });
    return null;
  }, [rollbackTemplate]);

  const rollbackRanks = useCallback((previousRanks: RankDefinition[]) => {
    if (!setSharedRanks(previousRanks)) return;
    setSharedRanksState(getSharedRanks());
  }, [setSharedRanksState]);

  const onExportRanks = useCallback(() => {
    return exportSharedRanksJson();
  }, []);

  const onImportRanks = useCallback((json: string): string | null => {
    const previousRanks = (sharedRanks ?? []).map((rank) => ({ ...rank }));
    const result = importSharedRanksJson(json);
    if (!result.ok) return result.error;
    const normalized = getSharedRanks();
    setSharedRanksState(normalized);
    void api.postJson(RANKS_API, { ranks: normalized }, { csrf: 'admin' }).catch(() => {
      rollbackRanks(previousRanks);
    });
    // Auto-save to PostgreSQL if available
    if (saveTemplateToPostgres) {
      const templateJson = exportSharedDeckTemplateJson();
      const ranksJson = exportSharedRanksJson();
      void saveTemplateToPostgres(templateJson, ranksJson);
    }
    return null;
  }, [sharedRanks, setSharedRanksState, rollbackRanks, api, saveTemplateToPostgres]);

  const onSetRanks = useCallback((nextRanks: RankDefinition[]): boolean => {
    const previousRanks = (sharedRanks ?? []).map((rank) => ({ ...rank }));
    if (!setSharedRanks(nextRanks)) return false;
    const normalized = getSharedRanks();
    setSharedRanksState(normalized);
    void api.postJson(RANKS_API, { ranks: normalized }, { csrf: 'admin' }).catch(() => {
      rollbackRanks(previousRanks);
    });
    // Auto-save to PostgreSQL if available
    if (saveTemplateToPostgres) {
      const templateJson = exportSharedDeckTemplateJson();
      const ranksJson = exportSharedRanksJson();
      void saveTemplateToPostgres(templateJson, ranksJson);
    }
    return true;
  }, [sharedRanks, setSharedRanksState, rollbackRanks, api, saveTemplateToPostgres]);

  const onResetRanks = useCallback(() => {
    const previousRanks = (sharedRanks ?? []).map((rank) => ({ ...rank }));
    resetSharedRanks();
    const normalized = getSharedRanks();
    setSharedRanksState(normalized);
    void api.postJson(`${RANKS_API}/reset`, {}, { csrf: 'admin' }).catch(() => {
      rollbackRanks(previousRanks);
    });
    // Auto-save to PostgreSQL if available
    if (saveTemplateToPostgres) {
      const templateJson = exportSharedDeckTemplateJson();
      const ranksJson = exportSharedRanksJson();
      void saveTemplateToPostgres(templateJson, ranksJson);
    }
  }, [sharedRanks, setSharedRanksState, rollbackRanks, api, saveTemplateToPostgres]);

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
    saveTemplateToPostgres,
  };
};
