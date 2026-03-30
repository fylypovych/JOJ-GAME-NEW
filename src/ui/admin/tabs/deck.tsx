import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { text } from '../../i18n';
import { formatModuleDisplayName } from '../../moduleDisplay';
import type { DeckTarget, LegendaryDeckMode } from '../../../game/jojGame';
import { normalizeImagePath } from '../../../game/imagePaths';
import type { CardCategory, CardDefinition } from '../../../game/types';
import { HoverImage } from '../HoverImage';

type T = ReturnType<typeof text>;
type DeckModuleAction = 'add' | 'replace' | 'remove';
type DeckInnerTab = 'manager' | 'decks' | 'cards';
type ModuleDef = {
  id: string;
  name: string;
  moduleType: 'MAIN_DECK_MODULE' | 'SEPARATE_DECK_MODULE' | 'SYSTEM_MODULE' | 'VISUAL_TRACK_MODULE';
  category: 'LYAP' | 'SCANDAL' | 'SUPPORT' | 'COMMAND' | 'LEGENDARY' | 'VVNZ' | 'RANK';
  cardCount: number;
  enabled: boolean;
  target: DeckTarget;
  cardIds: string[];
  defaultCategory?: CardCategory;
  deckBackImage?: string;
};

const parseIds = (value: string): string[] =>
  Array.from(new Set(value.split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean)));
const getCardImageSrc = (card: { id: string; image?: string }) =>
  normalizeImagePath(card.image) ?? `/cards/${card.id}.png`;

export const AdminDeckTab = ({
  t, lang: _lang, deckStats, sharedDeckTemplate, editTarget, editIndex, inlineEditor,
  onModuleAction, deckManagerStatus, onStartCreateCardForModule, onEditCardAt,
  onEditCardById,
  onRemoveCardAt,
  onRemoveCardById,
  cardCatalog,
  modules, onSaveModule, onDeleteModule,
  sharedRanks,
  onSetLegendaryDeckMode,
}: {
  t: T;
  lang: 'uk' | 'en';
  deckStats: { deck: number; discard: number; legendary: number; rankTrack: number };
  sharedDeckTemplate: {
    deckBackImage?: string;
    deck: CardDefinition[];
    legendaryDeck: CardDefinition[];
    rankTrack: CardDefinition[];
    gameSetup?: {
      lyapModuleId?: string;
      scandalModuleId?: string;
      supportModuleId?: string;
      commandModuleId?: string;
      optionalMainDeckModuleIds?: string[];
      legendaryModuleId?: string;
      legendaryDeckMode?: LegendaryDeckMode;
    };
  };
  editTarget: DeckTarget;
  editIndex: number;
  inlineEditor: ReactNode;
  onModuleAction: (moduleId: string, action: DeckModuleAction) => void;
  deckManagerStatus: string;
  onStartCreateCardForModule: (moduleId: string) => void;
  onEditCardAt: (target: DeckTarget, index: number) => void;
  onEditCardById: (target: DeckTarget, cardId: string) => void;
  onRemoveCardAt: (target: DeckTarget, index: number) => void;
  onRemoveCardById: (target: DeckTarget, cardId: string) => void;
  cardCatalog: CardDefinition[];
  modules: ModuleDef[];
  onSaveModule: (module: ModuleDef) => void;
  onDeleteModule: (moduleId: string) => void;
  sharedRanks: Array<{ id: string; name: string; image?: string; imageVariants?: string[] }>;
  onSetLegendaryDeckMode: (mode: LegendaryDeckMode) => void;
}) => {
  const displayModuleName = (module: Pick<ModuleDef, 'id' | 'name'>) => formatModuleDisplayName(module.name, module.id);
  const [innerTab, setInnerTab] = useState<DeckInnerTab>('manager');
  const [cardEditorModuleId, setCardEditorModuleId] = useState<string>('');
  const [editingModuleId, setEditingModuleId] = useState<string>('');
  const [moduleDraft, setModuleDraft] = useState<ModuleDef>({
    id: '',
    name: '',
    moduleType: 'MAIN_DECK_MODULE',
    category: 'SUPPORT',
    cardCount: 0,
    enabled: true,
    target: 'deck',
    cardIds: [],
    defaultCategory: 'SUPPORT',
    deckBackImage: '',
  });
  const [moduleCardIdsText, setModuleCardIdsText] = useState<string>('');
  const cardEditorAnchorRef = useRef<HTMLDivElement | null>(null);

  const baseModules = useMemo(
    () => modules.filter((m) => m.moduleType === 'MAIN_DECK_MODULE' && m.target === 'deck'),
    [modules],
  );
  const optionalModules = useMemo(
    () => modules.filter((m) => m.moduleType === 'SYSTEM_MODULE' && m.target === 'deck'),
    [modules],
  );
  const legendaryModules = useMemo(
    () => modules.filter((m) => m.moduleType === 'SEPARATE_DECK_MODULE' && m.category === 'LEGENDARY' && m.target === 'legendaryDeck'),
    [modules],
  );
  const gameSetup = sharedDeckTemplate.gameSetup ?? {};
  const selectedMainByCategory: Record<'LYAP' | 'SCANDAL' | 'SUPPORT' | 'COMMAND', string | undefined> = {
    LYAP: gameSetup.lyapModuleId,
    SCANDAL: gameSetup.scandalModuleId,
    SUPPORT: gameSetup.supportModuleId,
    COMMAND: gameSetup.commandModuleId,
  };
  const optionalMainDeckModuleIds = new Set(gameSetup.optionalMainDeckModuleIds ?? []);
  const selectedLegendaryModuleId = gameSetup.legendaryModuleId;
  const legendaryDeckMode = gameSetup.legendaryDeckMode ?? 'separate';
  const selectedCardModule = modules.find((m) => m.id === cardEditorModuleId) ?? modules[0];
  const canCreateCardInModule = Boolean(selectedCardModule && selectedCardModule.category !== 'RANK' && selectedCardModule.target !== 'rankTrack');
  const hasActiveCardEditor = editIndex >= 0 || editIndex === -2 || editIndex === -3;
  const isCreateCardMode = editIndex === -2;
  const isDetachedEditMode = editIndex === -3;

  useEffect(() => {
    if (innerTab !== 'cards' || !hasActiveCardEditor) return;
    if (editIndex >= 0) {
      const row = document.querySelector(`[data-card-row="${editTarget}-${editIndex}"]`);
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    cardEditorAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [innerTab, hasActiveCardEditor, editIndex, editTarget]);

  const moduleCardRows = useMemo(() => {
    if (!selectedCardModule) return [];
    if (selectedCardModule.category === 'RANK' || selectedCardModule.target === 'rankTrack') {
      return sharedRanks.map((rank, index) => ({
        target: 'rankTrack' as DeckTarget,
        index,
        card: {
          id: `rank-${rank.id}`,
          title: rank.name,
          image: (Array.isArray(rank.imageVariants) && rank.imageVariants.length > 0 ? rank.imageVariants[0] : rank.image),
          __rankId: rank.id,
        },
        isRank: true,
      }));
    }
    const target = selectedCardModule.target === 'legendaryDeck' ? 'legendaryDeck' : 'deck';
    const source = target === 'legendaryDeck' ? sharedDeckTemplate.legendaryDeck : sharedDeckTemplate.deck;
    const sourceById = new Map(source.map((card, index) => [card.id, { card, index }] as const));
    const catalogById = new Map(cardCatalog.map((card) => [card.id, card] as const));
    return selectedCardModule.cardIds.map((id) => {
      const fromTarget = sourceById.get(id);
      const fromCatalog = catalogById.get(id);
      const card = fromTarget?.card ?? fromCatalog ?? { id, title: id, image: '' };
      return {
        target: target as DeckTarget,
        index: fromTarget?.index ?? -1,
        card,
        isRank: false,
      };
    });
  }, [selectedCardModule, sharedDeckTemplate, sharedRanks, cardCatalog]);

  const startNewModule = () => {
    setEditingModuleId('');
    setModuleDraft({
      id: '',
      name: '',
      moduleType: 'MAIN_DECK_MODULE',
      category: 'SUPPORT',
      cardCount: 0,
      enabled: true,
      target: 'deck',
      cardIds: [],
      defaultCategory: 'SUPPORT',
      deckBackImage: '',
    });
    setModuleCardIdsText('');
  };

  const editModule = (module: ModuleDef) => {
    setEditingModuleId(module.id);
    setModuleDraft({ ...module });
    setModuleCardIdsText(module.cardIds.join('\n'));
  };

  const saveModule = () => {
    const next: ModuleDef = {
      ...moduleDraft,
      cardIds: parseIds(moduleCardIdsText),
    };
    onSaveModule(next);
    if (!editingModuleId) startNewModule();
  };

  return (
    <>
      <h3>{t.deckControls}</h3>
      <p>{t.deckCount}: {deckStats.deck} | {t.discardCount}: {deckStats.discard} | {t.legendaryCount}: {deckStats.legendary} | {t.rankTrackCount}: {deckStats.rankTrack}</p>

      <p className="admin-controls">
        <button type="button" onClick={() => setInnerTab('manager')}>{t.deckTabManager}</button>
        <button type="button" onClick={() => setInnerTab('decks')}>{t.deckTabModulesEditor}</button>
        <button type="button" onClick={() => setInnerTab('cards')}>{t.deckTabCardsEditor}</button>
      </p>

      {innerTab === 'manager' ? (
        <div className="admin-inline-editor">
          <h4>{t.baseDeckManagerTitle}</h4>
          <p>{t.baseDeckManagerHint}</p>
          {(['LYAP', 'SCANDAL', 'SUPPORT', 'COMMAND'] as const).map((cat) => {
            const categoryModules = baseModules.filter((m) => m.category === cat);
            const selectedId = selectedMainByCategory[cat];
            return (
              <p key={`manager-cat-${cat}`} className="admin-controls">
                <strong>{cat}:</strong>
                {categoryModules.length === 0 ? <span>{t.noModulesFound}</span> : null}
                {categoryModules.map((module) => (
                  <button
                    key={`manager-module-${module.id}`}
                    type="button"
                    aria-pressed={selectedId === module.id}
                    onClick={() => onModuleAction(module.id, 'replace')}
                  >
                    {selectedId === module.id ? '✓ ' : ''}{displayModuleName(module)}
                  </button>
                ))}
                {selectedId ? <span>{t.deckManagerActiveModule}: <code>{selectedId}</code></span> : null}
              </p>
            );
          })}
          <h5>{t.deckManagerOptionalModulesTitle}</h5>
          <p className="admin-controls">
            {optionalModules.length === 0 ? <span>{t.noModulesFound}</span> : null}
            {optionalModules.map((module) => {
              const enabled = optionalMainDeckModuleIds.has(module.id);
              return (
                <button
                  key={`optional-module-${module.id}`}
                  type="button"
                  aria-pressed={enabled}
                  onClick={() => onModuleAction(module.id, enabled ? 'remove' : 'add')}
                >
                  {enabled ? '✓ ' : ''}{displayModuleName(module)}
                </button>
              );
            })}
          </p>
          <h5>{t.deckManagerLegendaryModuleTitle}</h5>
          <p className="admin-controls">
            {legendaryModules.length === 0 ? <span>{t.noModulesFound}</span> : null}
            {legendaryModules.map((module) => (
              <button
                key={`legendary-module-${module.id}`}
                type="button"
                aria-pressed={selectedLegendaryModuleId === module.id}
                onClick={() => onModuleAction(module.id, 'replace')}
              >
                {selectedLegendaryModuleId === module.id ? '✓ ' : ''}{displayModuleName(module)}
              </button>
            ))}
            {selectedLegendaryModuleId ? <span>{t.deckManagerActiveModule}: <code>{selectedLegendaryModuleId}</code></span> : null}
          </p>
          <p className="admin-controls">
            <strong>{t.legendaryModeLabel}:</strong>
            <button type="button" aria-pressed={legendaryDeckMode === 'separate'} onClick={() => onSetLegendaryDeckMode('separate')}>
              {legendaryDeckMode === 'separate' ? '✓ ' : ''}{t.legendaryModeSeparate}
            </button>
            <button type="button" aria-pressed={legendaryDeckMode === 'merged'} onClick={() => onSetLegendaryDeckMode('merged')}>
              {legendaryDeckMode === 'merged' ? '✓ ' : ''}{t.legendaryModeMerged}
            </button>
          </p>
          {deckManagerStatus ? <p className="admin-info">{deckManagerStatus}</p> : null}
        </div>
      ) : null}

      {innerTab === 'decks' ? (
        <div className="admin-inline-editor">
          <h4>{t.moduleEditorTitle}</h4>
          <p>{t.moduleEditorHint}</p>
          <p className="admin-controls">
            <button type="button" onClick={startNewModule}>{t.newModule}</button>
          </p>
          <div className="admin-deck-list">
            <ul>
              {modules.map((module) => (
                <li key={`module-row-${module.id}`}>
                  <span>{displayModuleName(module)} ({module.id}) | {module.moduleType} | {module.category} | target: {module.target} | cards: {module.cardIds.length}</span>
                  <span className="admin-controls">
                    <button type="button" onClick={() => editModule(module)}>{t.editCard}</button>
                    <button type="button" onClick={() => onDeleteModule(module.id)}>{t.removeCard}</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <h5>{editingModuleId ? `${t.editingModule}: ${editingModuleId}` : t.createModule}</h5>
          <div className="admin-editor-grid">
            <label>ID
              <input value={moduleDraft.id} onChange={(e) => setModuleDraft((prev) => ({ ...prev, id: e.target.value }))} />
            </label>
            <label>{t.moduleNameLabel}
              <input value={moduleDraft.name} onChange={(e) => setModuleDraft((prev) => ({ ...prev, name: e.target.value }))} />
            </label>
            <label>{t.moduleTypeLabel}
              <select value={moduleDraft.moduleType} onChange={(e) => setModuleDraft((prev) => ({ ...prev, moduleType: e.target.value as ModuleDef['moduleType'] }))}>
                <option value="MAIN_DECK_MODULE">MAIN_DECK_MODULE</option>
                <option value="SEPARATE_DECK_MODULE">SEPARATE_DECK_MODULE</option>
                <option value="SYSTEM_MODULE">SYSTEM_MODULE</option>
                <option value="VISUAL_TRACK_MODULE">VISUAL_TRACK_MODULE</option>
              </select>
            </label>
            <label>{t.moduleCategoryLabel}
              <select value={moduleDraft.category} onChange={(e) => setModuleDraft((prev) => ({ ...prev, category: e.target.value as ModuleDef['category'] }))}>
                <option value="LYAP">LYAP</option>
                <option value="SCANDAL">SCANDAL</option>
                <option value="SUPPORT">SUPPORT</option>
                <option value="COMMAND">COMMAND</option>
                <option value="LEGENDARY">LEGENDARY</option>
                <option value="VVNZ">VVNZ</option>
                <option value="RANK">RANK</option>
              </select>
            </label>
            <label>{t.moduleExpectedCountLabel}
              <input type="number" min={0} value={moduleDraft.cardCount} onChange={(e) => setModuleDraft((prev) => ({ ...prev, cardCount: Math.max(0, Number(e.target.value || 0)) }))} />
            </label>
            <label>{t.moduleEnabledLabel}
              <select value={moduleDraft.enabled ? '1' : '0'} onChange={(e) => setModuleDraft((prev) => ({ ...prev, enabled: e.target.value === '1' }))}>
                <option value="1">{t.yes}</option>
                <option value="0">{t.no}</option>
              </select>
            </label>
            <label>{t.moduleTargetLabel}
              <select value={moduleDraft.target} onChange={(e) => setModuleDraft((prev) => ({ ...prev, target: e.target.value as DeckTarget }))}>
                <option value="deck">deck</option>
                <option value="legendaryDeck">legendaryDeck</option>
                <option value="rankTrack">rankTrack</option>
              </select>
            </label>
            <label>{t.moduleDefaultCategoryLabel}
              <select value={moduleDraft.defaultCategory ?? 'SUPPORT'} onChange={(e) => setModuleDraft((prev) => ({ ...prev, defaultCategory: e.target.value as CardCategory }))}>
                <option value="LYAP">LYAP</option>
                <option value="SCANDAL">SCANDAL</option>
                <option value="SUPPORT">SUPPORT</option>
                <option value="COMMAND">COMMAND</option>
                <option value="VVNZ">VVNZ</option>
                <option value="LEGENDARY">LEGENDARY</option>
              </select>
            </label>
            <label>{t.moduleBackImagePathLabel}
              <input value={moduleDraft.deckBackImage ?? ''} onChange={(e) => setModuleDraft((prev) => ({ ...prev, deckBackImage: e.target.value }))} placeholder="/cards/deck-back.webp" />
            </label>
          </div>
          <label>{t.moduleCardIdsLabel}
            <textarea className="admin-textarea" value={moduleCardIdsText} onChange={(e) => setModuleCardIdsText(e.target.value)} />
          </label>
          <p className="admin-controls">
            <button type="button" onClick={saveModule}>{t.saveModule}</button>
          </p>
          {deckManagerStatus ? <p className="admin-info">{deckManagerStatus}</p> : null}
        </div>
      ) : null}

      {innerTab === 'cards' ? (
        <div className="admin-inline-editor">
          <h4>{t.cardsEditorTitle}</h4>
          <p className="admin-controls">
            <label>{t.moduleLabel}
              <select value={selectedCardModule?.id ?? ''} onChange={(e) => setCardEditorModuleId(e.target.value)}>
                {modules.map((module) => <option key={`module-option-${module.id}`} value={module.id}>{displayModuleName(module)}</option>)}
              </select>
            </label>
            <button type="button" disabled={!canCreateCardInModule} onClick={() => selectedCardModule && onStartCreateCardForModule(selectedCardModule.id)}>
              {t.createNewCard}
            </button>
          </p>
          <div ref={cardEditorAnchorRef}>
            {(isCreateCardMode || isDetachedEditMode) ? inlineEditor : <p>{t.createOrOpenCardHint}</p>}
            {(isCreateCardMode || isDetachedEditMode) ? <p className="admin-info">{t.editingTargetLabel}: {editTarget}</p> : null}
          </div>
          <p>{t.cardsInModuleLabel}: {moduleCardRows.length}</p>
          {selectedCardModule && (selectedCardModule.category === 'RANK' || selectedCardModule.target === 'rankTrack') ? (
            <p className="admin-info">{t.rankCardsManagedInRanks}</p>
          ) : null}
          <div className="admin-deck-list">
            <ul>
              {moduleCardRows.map(({ target, index, card }) => {
                const isEditedRow = editIndex >= 0 && editTarget === target && editIndex === index;
                return (
                  <Fragment key={`module-card-fragment-${target}-${index}-${card.id}`}>
                    <li data-card-row={`${target}-${index}`}>
                      <span>
                        <HoverImage src={getCardImageSrc(card)} alt={card.title} className="admin-thumb" />
                        {' '}
                        {index >= 0 ? `${index + 1}.` : '•'} {card.id} | {card.title}
                      </span>
                      <span className="admin-controls">
                        {'__rankId' in card ? (
                          <button type="button" disabled>{t.tabRanks}</button>
                        ) : (
                          <>
                            <button type="button" onClick={() => (index >= 0 ? onEditCardAt(target, index) : onEditCardById(target, card.id))}>{t.editCard}</button>
                            <button type="button" onClick={() => (index >= 0 ? onRemoveCardAt(target, index) : onRemoveCardById(target, card.id))}>{t.removeCard}</button>
                          </>
                        )}
                      </span>
                    </li>
                    {isEditedRow ? (
                      <li>
                        {inlineEditor}
                        <p className="admin-info">{t.editingTargetLabel}: {editTarget}</p>
                      </li>
                    ) : null}
                  </Fragment>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
};
