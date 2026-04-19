import { useEffect, useState } from 'react';
import type { CardDefinition, RankDefinition } from '../../game/types';
import type { SharedDeckTemplate } from './model';

export const useSharedConfigSync = (args: {
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  templateApi: string;
  ranksApi: string;
  sharedTemplateStorageKey: string;
  ranksStorageKey: string;
  getSharedDeckTemplate: () => SharedDeckTemplate;
  getCardCatalog: () => CardDefinition[];
  getSharedRanks: () => RankDefinition[];
  exportSharedDeckTemplateJson: () => string;
  exportSharedRanksJson: () => string;
  importSharedDeckTemplateJson: (json: string) => { ok: true } | { ok: false; error: string };
  importSharedRanksJson: (json: string) => { ok: true } | { ok: false; error: string };
  setSharedRanks: (ranks: RankDefinition[]) => boolean;
}) => {
  const {
    adminFetch,
    templateApi,
    ranksApi,
    getSharedDeckTemplate,
    getCardCatalog,
    getSharedRanks,
    exportSharedDeckTemplateJson,
    importSharedDeckTemplateJson,
    setSharedRanks,
  } = args;
  const [, setSharedDeckVersion] = useState(0);
  const [sharedDeckTemplate, setSharedDeckTemplate] = useState<SharedDeckTemplate>(getSharedDeckTemplate);
  const [cardCatalog, setCardCatalog] = useState<CardDefinition[]>(getCardCatalog);
  const [sharedRanksState, setSharedRanksState] = useState<RankDefinition[]>(getSharedRanks);
  const [sharedConfigLoaded, setSharedConfigLoaded] = useState(false);

  const syncTemplateToServer = async (json: string) => {
    try {
      const response = await adminFetch(`${templateApi}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const syncRanksToServer = async (ranks: RankDefinition[]) => {
    try {
      const response = await adminFetch(ranksApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranks }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const refreshSharedDeckTemplate = async (sync = true) => {
    setSharedDeckTemplate(getSharedDeckTemplate());
    setCardCatalog(getCardCatalog());
    const json = exportSharedDeckTemplateJson();
    setSharedDeckVersion((v) => v + 1);
    if (!sync) return true;
    return syncTemplateToServer(json);
  };

  const loadTemplateFromServer = async (): Promise<boolean> => {
    try {
      const response = await adminFetch(templateApi);
      if (!response.ok) return false;
      const payload = (await response.json()) as { json?: string };
      if (typeof payload.json !== 'string') return false;
      const result = importSharedDeckTemplateJson(payload.json);
      if (!result.ok) return false;
      setSharedDeckTemplate(getSharedDeckTemplate());
      setCardCatalog(getCardCatalog());
      setSharedDeckVersion((v) => v + 1);
      return true;
    } catch {
      return false;
    }
  };

  const loadRanksFromServer = async (): Promise<boolean> => {
    try {
      const response = await adminFetch(ranksApi);
      if (!response.ok) return false;
      const payload = (await response.json()) as { ranks?: RankDefinition[] };
      if (!Array.isArray(payload.ranks)) return false;
      if (!setSharedRanks(payload.ranks)) return false;
      const nextRanks = getSharedRanks();
      setSharedRanksState(nextRanks);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    void (async () => {
      const loadedFromServer = await loadTemplateFromServer();
      if (!loadedFromServer) {
        setSharedConfigLoaded(false);
        return;
      }
      const loadedRanksFromServer = await loadRanksFromServer();
      if (!loadedRanksFromServer) {
        setSharedConfigLoaded(false);
        return;
      }
      setSharedConfigLoaded(true);
    })();
  }, []);

  return {
    sharedDeckTemplate,
    setSharedDeckTemplate,
    cardCatalog,
    setCardCatalog,
    sharedRanks: sharedRanksState,
    setSharedRanksState,
    sharedConfigLoaded,
    setSharedConfigLoaded,
    refreshSharedDeckTemplate,
    syncRanksToServer,
  };
};
