import { useMemo, useCallback } from 'react';
import type { RankDefinition } from '../../game/types';
import { useSharedConfigSync } from './useSharedConfigSync';
import { formatModuleDisplayName } from '../moduleDisplay';
import {
  getSharedDeckTemplate,
  getCardCatalog,
  getSharedRanks,
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  importSharedDeckTemplateJson,
  importSharedRanksJson,
  setSharedRanks,
  getSharedDeckTemplateStats,
} from '../../game/jojGame';

export interface UseDeckDataArgs {
  serverUrl: string;
  sharedTemplateStorageKey: string;
  ranksStorageKey: string;
}

export interface UseDeckDataResult {
  // Shared Config
  sharedDeckTemplate: ReturnType<typeof useSharedConfigSync>['sharedDeckTemplate'];
  cardCatalog: ReturnType<typeof useSharedConfigSync>['cardCatalog'];
  sharedRanks: ReturnType<typeof useSharedConfigSync>['sharedRanks'];
  setSharedRanksState: ReturnType<typeof useSharedConfigSync>['setSharedRanksState'];
  sharedConfigLoaded: ReturnType<typeof useSharedConfigSync>['sharedConfigLoaded'];
  refreshSharedDeckTemplate: ReturnType<typeof useSharedConfigSync>['refreshSharedDeckTemplate'];
  syncRanksToServer: ReturnType<typeof useSharedConfigSync>['syncRanksToServer'];
  
  // Derived
  sharedDeckStats: ReturnType<typeof getSharedDeckTemplateStats>;
  optionalLobbyModules: Array<{ id: string; name: string; alwaysOn: boolean }>;
  
  // Helpers
  rollbackTemplate: (json: string) => void;
  applyTemplateChange: (mutate: () => void, previousJson?: string) => Promise<boolean>;
  rollbackRanks: (previousRanks: RankDefinition[]) => void;
}

export const useDeckData = (args: UseDeckDataArgs): UseDeckDataResult => {
  const { serverUrl, sharedTemplateStorageKey, ranksStorageKey } = args;

  // Admin fetch placeholder
  const adminFetch = useMemo(() => {
    return async (input: string | URL | Request, init?: RequestInit) => {
      return fetch(input, init);
    };
  }, []);

  const TEMPLATE_API = (server: string) => `${server}/api/admin/deck-template`;
  const RANKS_API = (server: string) => `${server}/api/admin/ranks`;

  const {
    sharedDeckTemplate,
    cardCatalog,
    sharedRanks,
    setSharedRanksState,
    sharedConfigLoaded,
    refreshSharedDeckTemplate,
    syncRanksToServer,
  } = useSharedConfigSync({
    adminFetch,
    templateApi: TEMPLATE_API(serverUrl),
    ranksApi: RANKS_API(serverUrl),
    sharedTemplateStorageKey,
    ranksStorageKey,
    getSharedDeckTemplate,
    getCardCatalog,
    getSharedRanks,
    exportSharedDeckTemplateJson,
    exportSharedRanksJson,
    importSharedDeckTemplateJson,
    importSharedRanksJson,
    setSharedRanks,
  });

  const sharedDeckStats = useMemo(() => getSharedDeckTemplateStats(), []);

  const optionalLobbyModules = useMemo(
    () => (sharedDeckTemplate.modules ?? [])
      .filter((module) => module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck')
      .map((module) => ({
        id: module.id,
        name: formatModuleDisplayName(module.name, module.id),
        alwaysOn: module.category === 'VVNZ',
      })),
    [sharedDeckTemplate.modules],
  );

  const rollbackTemplate = useCallback((json: string) => {
    const result = importSharedDeckTemplateJson(json);
    if (result.ok) void refreshSharedDeckTemplate(false);
  }, [refreshSharedDeckTemplate]);

  const applyTemplateChange = useCallback(async (mutate: () => void, previousJson = exportSharedDeckTemplateJson()) => {
    mutate();
    const ok = await refreshSharedDeckTemplate();
    if (!ok) rollbackTemplate(previousJson);
    return ok;
  }, [refreshSharedDeckTemplate, rollbackTemplate]);

  const rollbackRanks = useCallback((previousRanks: RankDefinition[]) => {
    if (!setSharedRanks(previousRanks)) return;
    setSharedRanksState(getSharedRanks());
    window.localStorage.setItem(ranksStorageKey, exportSharedRanksJson());
  }, [ranksStorageKey, setSharedRanksState]);

  return {
    sharedDeckTemplate,
    cardCatalog,
    sharedRanks,
    setSharedRanksState,
    sharedConfigLoaded,
    refreshSharedDeckTemplate,
    syncRanksToServer,
    sharedDeckStats,
    optionalLobbyModules,
    rollbackTemplate,
    applyTemplateChange,
    rollbackRanks,
  };
};
