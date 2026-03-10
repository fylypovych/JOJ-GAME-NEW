import { useEffect, useState } from 'react';
import type { DeckModuleCategory, DeckModuleDefinition, DeckTarget } from '../../game/jojGame';
import type { CardCategory, CardDefinition } from '../../game/types';
import { text } from '../i18n';
import { cloneTemplateForEdit } from './templateUpdate';
import {
  applyImportToTemplate,
  applyModuleActionToTemplate,
  collectImportCards,
  deleteDeckModuleFromTemplate,
  normalizeDeckModuleForSave,
  saveDeckModuleToTemplate,
  syncMissingCardsIntoModules,
} from './templateManagerHelpers';
import type { ImportCategoryMode, SharedDeckTemplate } from './types';
import { useAdminDeckModules } from './useAdminDeckModules';

type DeckModuleId = string;
type DeckModuleAction = 'add' | 'replace' | 'remove';

type UseAdminTemplateManagerArgs = {
  lang: 'uk' | 'en';
  sharedDeckTemplate: SharedDeckTemplate;
  cardCatalog: CardDefinition[];
  onImportTemplate: (json: string) => string | null;
};

export const useAdminTemplateManager = ({
  lang,
  sharedDeckTemplate,
  cardCatalog,
  onImportTemplate,
}: UseAdminTemplateManagerArgs) => {
  const t = text(lang);
  const [importJson, setImportJson] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [importStatus, setImportStatus] = useState<string>('');
  const [importTarget, setImportTarget] = useState<DeckTarget>('deck');
  const [importCategoryMode, setImportCategoryMode] = useState<ImportCategoryMode>('AS_IS');
  const [deckManagerStatus, setDeckManagerStatus] = useState<string>('');

  const applyTemplateUpdate = (mutate: (next: SharedDeckTemplate & { catalog: CardDefinition[] }) => void): boolean => {
    const nextTemplate = cloneTemplateForEdit(sharedDeckTemplate, cardCatalog);
    mutate(nextTemplate);
    const error = onImportTemplate(JSON.stringify(nextTemplate, null, 2));
    if (error) {
      setDeckManagerStatus(`${t.moduleManagerErrorPrefix}: ${error}`);
      return false;
    }
    return true;
  };

  const { deckModules } = useAdminDeckModules({
    sharedDeckTemplate,
    cardCatalog,
    applyTemplateUpdate,
  });

  useEffect(() => {
    const modules = sharedDeckTemplate.modules ?? [];
    if (modules.length === 0) return;
    const addByModuleId = syncMissingCardsIntoModules({ sharedDeckTemplate });
    if (addByModuleId.size === 0) return;

    void applyTemplateUpdate((nextTemplate) => {
      nextTemplate.modules = (nextTemplate.modules ?? []).map((module) => {
        const toAdd = addByModuleId.get(module.id);
        if (!toAdd || toAdd.size === 0) return module;
        const merged = [...module.cardIds, ...Array.from(toAdd).filter((id) => !module.cardIds.includes(id))];
        return { ...module, cardIds: merged, cardCount: Math.max(module.cardCount, merged.length) };
      });
    });
  }, [applyTemplateUpdate, sharedDeckTemplate]);

  const applyModuleAction = (moduleId: DeckModuleId, action: DeckModuleAction) => {
    const module = deckModules.find((row) => row.id === moduleId);
    if (!module) {
      setDeckManagerStatus(t.moduleNotFound);
      return;
    }
    const ok = applyTemplateUpdate((nextTemplate) => {
      applyModuleActionToTemplate({ nextTemplate, deckModules, cardCatalog, module, action });
    });
    if (!ok) return;

    const verb = action === 'add'
      ? t.moduleActionAdded
      : action === 'replace'
        ? t.moduleActionReplaced
        : t.moduleActionRemoved;
    setDeckManagerStatus(`${t.moduleActionStatusPrefix} ${module.name}: ${verb}.`);
  };

  const saveDeckModule = (nextModule: {
    id: string;
    name: string;
    moduleType: DeckModuleDefinition['moduleType'];
    category: DeckModuleCategory;
    cardCount: number;
    enabled: boolean;
    target: DeckTarget;
    cardIds: string[];
    defaultCategory?: CardCategory;
    deckBackImage?: string;
  }) => {
    const normalized = normalizeDeckModuleForSave(nextModule);
    if (!normalized) return;
    const ok = applyTemplateUpdate((nextTemplate) => {
      saveDeckModuleToTemplate({ nextTemplate, normalized });
    });
    if (!ok) return;
    setDeckManagerStatus(`${t.moduleActionStatusPrefix} ${normalized.name}: ${t.moduleSavedStatus}`);
  };

  const deleteDeckModule = (moduleId: string) => {
    const ok = applyTemplateUpdate((nextTemplate) => {
      deleteDeckModuleFromTemplate({ nextTemplate, moduleId });
    });
    if (!ok) return;
    setDeckManagerStatus(t.moduleDeletedStatus);
  };

  const setLegendaryDeckMode = (mode: 'separate' | 'merged') => {
    const ok = applyTemplateUpdate((nextTemplate) => {
      nextTemplate.gameSetup.legendaryDeckMode = mode;
    });
    if (!ok) return;
    const modeLabel = mode === 'merged' ? t.legendaryModeMerged : t.legendaryModeSeparate;
    setDeckManagerStatus(`${t.legendaryModeLabel}: ${modeLabel}.`);
  };

  const runImport = () => {
    setImportStatus('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setImportError(t.invalidJson);
      return;
    }

    const cards = collectImportCards(parsed);
    if (!cards) {
      setImportError(t.importShapeError);
      return;
    }

    const effectiveImportCategoryMode: ImportCategoryMode = importTarget === 'deck' ? importCategoryMode : 'AS_IS';
    const nextTemplate = cloneTemplateForEdit(sharedDeckTemplate, cardCatalog);
    const normalizedCards = applyImportToTemplate({
      template: nextTemplate,
      importTarget,
      cards,
      importCategoryMode: effectiveImportCategoryMode,
    });

    const error = onImportTemplate(JSON.stringify(nextTemplate, null, 2));
    if (error) {
      setImportError(error);
      setImportStatus('');
      return;
    }
    setImportError('');
    const targetLabel = importTarget === 'deck'
      ? t.mainDeck
      : importTarget === 'legendaryDeck'
        ? t.legendaryDeckLabel
        : t.rankTrackDeckLabel;
    const suffix = effectiveImportCategoryMode === 'AS_IS' ? t.importCategoryAsIs : effectiveImportCategoryMode;
    setImportStatus(
      `${t.importSuccessAddedPrefix} ${normalizedCards.length} ${t.importSuccessCardsWord} ${t.importSuccessInto} "${targetLabel}" (${t.importSuccessCategory}: ${suffix}).`,
    );
  };

  return {
    applyTemplateUpdate,
    deckModules,
    deckManagerStatus,
    setDeckManagerStatus,
    applyModuleAction,
    saveDeckModule,
    deleteDeckModule,
    setLegendaryDeckMode,
    importJson,
    setImportJson,
    importError,
    setImportError,
    importStatus,
    setImportStatus,
    importTarget,
    setImportTarget,
    importCategoryMode,
    setImportCategoryMode,
    runImport,
  };
};
