import { useEffect, useRef, useState } from 'react';
import { buildSeededDeckModules, normalizeDeckModules } from './moduleSeed';
import type { DeckModuleDefinition } from '../../game/jojGame';
import type { CardDefinition } from '../../game/types';
import type { SharedDeckTemplate } from './types';

export const useAdminDeckModules = (args: {
  sharedDeckTemplate: SharedDeckTemplate;
  cardCatalog: CardDefinition[];
  applyTemplateUpdate: (mutate: (next: SharedDeckTemplate & { catalog: CardDefinition[] }) => void) => boolean;
}) => {
  const [deckModules, setDeckModules] = useState<DeckModuleDefinition[]>([]);
  const seededFromLegacyEmptyRef = useRef(false);

  useEffect(() => {
    if (Array.isArray(args.sharedDeckTemplate.modules) && args.sharedDeckTemplate.modules.length > 0) {
      const normalizedModules = normalizeDeckModules(args.sharedDeckTemplate.modules);
      setDeckModules(normalizedModules);
      const changed = JSON.stringify(normalizedModules) !== JSON.stringify(args.sharedDeckTemplate.modules);
      if (changed) {
        void args.applyTemplateUpdate((nextTemplate) => {
          nextTemplate.modules = normalizedModules.map((module) => ({ ...module, cardIds: [...module.cardIds] }));
        });
      }
      seededFromLegacyEmptyRef.current = true;
      return;
    }
    setDeckModules([]);
    if (args.cardCatalog.length === 0) return;
    const hasConfiguredGameSetup = Boolean(
      args.sharedDeckTemplate.gameSetup?.lyapModuleId
      || args.sharedDeckTemplate.gameSetup?.scandalModuleId
      || args.sharedDeckTemplate.gameSetup?.supportModuleId
      || args.sharedDeckTemplate.gameSetup?.commandModuleId
      || args.sharedDeckTemplate.gameSetup?.legendaryModuleId
      || args.sharedDeckTemplate.gameSetup?.rankModuleId
      || (args.sharedDeckTemplate.gameSetup?.optionalMainDeckModuleIds?.length ?? 0) > 0,
    );
    if (seededFromLegacyEmptyRef.current || hasConfiguredGameSetup) return;
    const { modules: seededModules, gameSetup: seededSetup } = buildSeededDeckModules(args.cardCatalog);
    setDeckModules(seededModules);
    seededFromLegacyEmptyRef.current = true;
    void args.applyTemplateUpdate((nextTemplate) => {
      nextTemplate.modules = seededModules.map((module) => ({ ...module, cardIds: [...module.cardIds] }));
      nextTemplate.gameSetup = seededSetup;
    });
  }, [args.cardCatalog, args.sharedDeckTemplate.gameSetup, args.sharedDeckTemplate.modules]);

  return { deckModules, setDeckModules };
};
