import { useMemo, useState, type ReactNode } from 'react';
import { text } from '../../i18n';
import { formatModuleDisplayName } from '../../moduleDisplay';
import type { DeckTarget, LegendaryDeckMode } from '../../../game/jojGame';
import { CARD_ASSET_BASE_PATH, normalizeImagePath } from '../../../game/imagePaths';
import type { CardCategory, CardDefinition } from '../../../game/types';

type T = ReturnType<typeof text>;
type DeckModuleAction = 'add' | 'replace' | 'remove';
type DeckInnerTab = 'manager' | 'decks' | 'cards';
type ModuleEditorSection = 'details' | 'cards' | 'appearance';
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
const createBlankModule = (): ModuleDef => ({
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
const getModuleEditorSnapshot = (draft: ModuleDef, cardIdsText: string) => JSON.stringify({ draft, cardIdsText });
const getCardImageSrc = (card: { id: string; image?: string }) =>
  normalizeImagePath(card.image) ?? `${CARD_ASSET_BASE_PATH}${card.id}.png`;

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
  const [moduleDraft, setModuleDraft] = useState<ModuleDef>(() => createBlankModule());
  const [moduleCardIdsText, setModuleCardIdsText] = useState<string>('');
  const [moduleValidationError, setModuleValidationError] = useState<string>('');
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleEditorSection, setModuleEditorSection] = useState<ModuleEditorSection>('details');
  const [moduleEditorBaseline, setModuleEditorBaseline] = useState(() => getModuleEditorSnapshot(createBlankModule(), ''));
  const [cardSearch, setCardSearch] = useState('');
  const [cardCategoryFilter, setCardCategoryFilter] = useState('ALL');

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
    const moduleAndTargetIds = Array.from(new Set(selectedCardModule.cardIds));
    return moduleAndTargetIds.map((id) => {
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

  const visibleCardRows = useMemo(() => {
    const needle = cardSearch.trim().toLocaleLowerCase();
    return moduleCardRows.filter(({ card }) => {
      const category = 'category' in card ? String(card.category ?? '') : 'RANK';
      if (cardCategoryFilter !== 'ALL' && category !== cardCategoryFilter) return false;
      if (!needle) return true;
      return `${card.id} ${card.title}`.toLocaleLowerCase().includes(needle);
    });
  }, [moduleCardRows, cardSearch, cardCategoryFilter]);

  const visibleModules = useMemo(() => {
    const needle = moduleSearch.trim().toLocaleLowerCase();
    return modules.filter((module) => !needle || `${module.id} ${module.name} ${module.category} ${module.moduleType}`.toLocaleLowerCase().includes(needle));
  }, [modules, moduleSearch]);
  const parsedModuleCardIds = useMemo(() => parseIds(moduleCardIdsText), [moduleCardIdsText]);
  const modulePreviewCards = useMemo(() => {
    const byId = new Map(cardCatalog.map((card) => [card.id, card] as const));
    return parsedModuleCardIds.map((id) => byId.get(id) ?? { id, title: id, image: '' });
  }, [cardCatalog, parsedModuleCardIds]);
  const hasUnsavedModuleChanges = getModuleEditorSnapshot(moduleDraft, moduleCardIdsText) !== moduleEditorBaseline;

  const startNewModule = (force = false) => {
    if (!force && hasUnsavedModuleChanges && !window.confirm(t.moduleUnsavedConfirm)) return;
    const next = createBlankModule();
    setEditingModuleId('');
    setModuleValidationError('');
    setModuleDraft(next);
    setModuleCardIdsText('');
    setModuleEditorBaseline(getModuleEditorSnapshot(next, ''));
    setModuleEditorSection('details');
  };

  const editModule = (module: ModuleDef) => {
    if (module.id === editingModuleId) return;
    if (hasUnsavedModuleChanges && !window.confirm(t.moduleUnsavedConfirm)) return;
    const next = { ...module, cardIds: [...module.cardIds] };
    const nextIdsText = module.cardIds.join('\n');
    setEditingModuleId(module.id);
    setModuleValidationError('');
    setModuleDraft(next);
    setModuleCardIdsText(nextIdsText);
    setModuleEditorBaseline(getModuleEditorSnapshot(next, nextIdsText));
  };

  const saveModule = () => {
    const parsedCardIds = parseIds(moduleCardIdsText);
    if (moduleDraft.category !== 'RANK' && moduleDraft.target !== 'rankTrack') {
      const knownCardIds = new Set(cardCatalog.map((card) => card.id));
      const missingCardIds = parsedCardIds.filter((id) => !knownCardIds.has(id));
      if (missingCardIds.length > 0) {
        setModuleValidationError(`${t.moduleInvalidCardIdsPrefix}: ${missingCardIds.join(', ')}`);
        return;
      }
    }
    setModuleValidationError('');
    const next: ModuleDef = {
      ...moduleDraft,
      cardIds: parsedCardIds,
    };
    onSaveModule(next);
    const nextIdsText = parsedCardIds.join('\n');
    setEditingModuleId(next.id);
    setModuleDraft(next);
    setModuleCardIdsText(nextIdsText);
    setModuleEditorBaseline(getModuleEditorSnapshot(next, nextIdsText));
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
        <div className="admin-card-workspace-shell admin-module-workspace-shell">
          <header className="admin-card-workspace-toolbar">
            <div>
              <h4>{t.moduleEditorTitle}</h4>
              <span>{modules.length}</span>
            </div>
            <span className={hasUnsavedModuleChanges ? 'admin-card-save-state is-dirty' : 'admin-card-save-state'}>
              {hasUnsavedModuleChanges ? t.moduleUnsavedChanges : t.allChangesSaved}
            </span>
            <button type="button" className="admin-card-primary-action" onClick={() => startNewModule()}>+ {t.newModule}</button>
          </header>
          <div className="admin-card-workspace">
            <aside className="admin-card-browser">
              <div className="admin-card-browser-filters admin-module-browser-filter">
                <input type="search" value={moduleSearch} placeholder={t.moduleSearchPlaceholder} onChange={(e) => setModuleSearch(e.target.value)} />
              </div>
              <div className="admin-card-browser-count">{t.visibleCardsLabel}: {visibleModules.length}</div>
              <div className="admin-card-browser-list">
                {visibleModules.length === 0 ? <p>{t.moduleNoMatches}</p> : null}
                {visibleModules.map((module) => (
                  <article className={editingModuleId === module.id ? 'admin-card-browser-row is-selected' : 'admin-card-browser-row'} key={`module-browser-${module.id}`}>
                    <button type="button" className="admin-card-browser-open admin-module-browser-open" onClick={() => editModule(module)}>
                      <span className="admin-module-category-icon">{module.category.slice(0, 2)}</span>
                      <span>
                        <strong>{displayModuleName(module)}</strong>
                        <small>{module.id} · {module.cardIds.length}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="admin-card-browser-remove"
                      title={t.removeCard}
                      aria-label={`${t.removeCard}: ${displayModuleName(module)}`}
                      onClick={() => {
                        if (!window.confirm(t.moduleDeleteConfirm)) return;
                        onDeleteModule(module.id);
                        if (editingModuleId === module.id) startNewModule(true);
                      }}
                    >×</button>
                  </article>
                ))}
              </div>
            </aside>

            <main className="admin-card-editor-stage">
              <div className="admin-card-editor-shell admin-module-editor-shell">
                <header className="admin-card-editor-header">
                  <div>
                    <span className="admin-card-editor-kicker">{editingModuleId ? t.editingModule : t.createModule}</span>
                    <h4>{moduleDraft.name || moduleDraft.id || t.newModule}</h4>
                  </div>
                  <span className={hasUnsavedModuleChanges ? 'admin-card-save-state is-dirty' : 'admin-card-save-state'}>
                    {hasUnsavedModuleChanges ? t.unsavedChanges : t.allChangesSaved}
                  </span>
                </header>

                <nav className="admin-card-editor-tabs" aria-label={t.moduleEditorTitle}>
                  {([
                    ['details', t.moduleDetailsTab],
                    ['cards', t.moduleCardsTab],
                    ['appearance', t.moduleAppearanceTab],
                  ] as Array<[ModuleEditorSection, string]>).map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={moduleEditorSection === id} onClick={() => setModuleEditorSection(id)}>{label}</button>
                  ))}
                </nav>

                <div className="admin-card-form-layout">
                  <section className="admin-card-form-panel">
                    {moduleEditorSection === 'details' ? (
                      <div className="admin-editor-grid admin-card-details-grid">
                        <label>ID<input value={moduleDraft.id} onChange={(e) => setModuleDraft((prev) => ({ ...prev, id: e.target.value }))} /></label>
                        <label>{t.moduleNameLabel}<input value={moduleDraft.name} onChange={(e) => setModuleDraft((prev) => ({ ...prev, name: e.target.value }))} /></label>
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
                            {['LYAP', 'SCANDAL', 'SUPPORT', 'COMMAND', 'LEGENDARY', 'VVNZ', 'RANK'].map((category) => <option key={category} value={category}>{category}</option>)}
                          </select>
                        </label>
                        <label>{t.moduleExpectedCountLabel}<input type="number" min={0} value={moduleDraft.cardCount} onChange={(e) => setModuleDraft((prev) => ({ ...prev, cardCount: Math.max(0, Number(e.target.value || 0)) }))} /></label>
                        <label>{t.moduleEnabledLabel}
                          <select value={moduleDraft.enabled ? '1' : '0'} onChange={(e) => setModuleDraft((prev) => ({ ...prev, enabled: e.target.value === '1' }))}>
                            <option value="1">{t.yes}</option><option value="0">{t.no}</option>
                          </select>
                        </label>
                        <label>{t.moduleTargetLabel}
                          <select value={moduleDraft.target} onChange={(e) => setModuleDraft((prev) => ({ ...prev, target: e.target.value as DeckTarget }))}>
                            <option value="deck">deck</option><option value="legendaryDeck">legendaryDeck</option><option value="rankTrack">rankTrack</option>
                          </select>
                        </label>
                        <label>{t.moduleDefaultCategoryLabel}
                          <select value={moduleDraft.defaultCategory ?? 'SUPPORT'} onChange={(e) => setModuleDraft((prev) => ({ ...prev, defaultCategory: e.target.value as CardCategory }))}>
                            {['LYAP', 'SCANDAL', 'SUPPORT', 'COMMAND', 'VVNZ', 'LEGENDARY'].map((category) => <option key={category} value={category}>{category}</option>)}
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {moduleEditorSection === 'cards' ? (
                      <div className="admin-module-cards-editor">
                        <label>{t.moduleCardIdsLabel}
                          <textarea className="admin-textarea" value={moduleCardIdsText} onChange={(e) => {
                            setModuleCardIdsText(e.target.value);
                            if (moduleValidationError) setModuleValidationError('');
                          }} />
                        </label>
                        <p>{t.moduleLinkedCardsLabel}: <strong>{parsedModuleCardIds.length}</strong></p>
                        <div className="admin-module-card-grid">
                          {modulePreviewCards.map((card) => (
                            <div key={`module-preview-card-${card.id}`}>
                              <img src={getCardImageSrc(card)} alt="" />
                              <span><strong>{card.title}</strong><small>{card.id}</small></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {moduleEditorSection === 'appearance' ? (
                      <div className="admin-module-appearance-editor">
                        <label>{t.moduleBackImagePathLabel}
                          <input value={moduleDraft.deckBackImage ?? ''} onChange={(e) => setModuleDraft((prev) => ({ ...prev, deckBackImage: e.target.value }))} placeholder="/card-assets/deck-back.webp" />
                        </label>
                        {moduleDraft.deckBackImage ? <img src={moduleDraft.deckBackImage} alt={t.moduleBackImagePathLabel} /> : null}
                      </div>
                    ) : null}
                  </section>

                  <aside className="admin-card-live-preview admin-module-live-preview">
                    <h5>{t.modulePreviewTitle}</h5>
                    <span className="admin-module-preview-icon">{moduleDraft.category}</span>
                    <strong>{moduleDraft.name || '—'}</strong>
                    <code>{moduleDraft.id || '—'}</code>
                    <dl>
                      <div><dt>{t.moduleTypeLabel}</dt><dd>{moduleDraft.moduleType}</dd></div>
                      <div><dt>{t.moduleTargetLabel}</dt><dd>{moduleDraft.target}</dd></div>
                      <div><dt>{t.moduleLinkedCardsLabel}</dt><dd>{parsedModuleCardIds.length} / {moduleDraft.cardCount}</dd></div>
                      <div><dt>{t.moduleEnabledLabel}</dt><dd>{moduleDraft.enabled ? t.yes : t.no}</dd></div>
                    </dl>
                  </aside>
                </div>

                {moduleValidationError ? <p className="admin-error">{moduleValidationError}</p> : null}
                <footer className="admin-card-editor-actions">
                  <button type="button" className="admin-card-primary-action" disabled={!moduleDraft.id.trim() || !moduleDraft.name.trim()} onClick={saveModule}>{t.saveModule}</button>
                </footer>
              </div>
              {deckManagerStatus ? <p className="admin-info">{deckManagerStatus}</p> : null}
            </main>
          </div>
        </div>
      ) : null}

      {innerTab === 'cards' ? (
        <div className="admin-card-workspace-shell">
          <header className="admin-card-workspace-toolbar">
            <div>
              <h4>{t.cardsEditorTitle}</h4>
              <span>{t.cardsInModuleLabel}: {moduleCardRows.length}</span>
            </div>
            <label>{t.moduleLabel}
              <select value={selectedCardModule?.id ?? ''} onChange={(e) => setCardEditorModuleId(e.target.value)}>
                {modules.map((module) => <option key={`module-option-${module.id}`} value={module.id}>{displayModuleName(module)}</option>)}
              </select>
            </label>
            <button type="button" className="admin-card-primary-action" disabled={!canCreateCardInModule} onClick={() => selectedCardModule && onStartCreateCardForModule(selectedCardModule.id)}>
              + {t.createNewCard}
            </button>
          </header>
          {selectedCardModule && (selectedCardModule.category === 'RANK' || selectedCardModule.target === 'rankTrack') ? (
            <p className="admin-info">{t.rankCardsManagedInRanks}</p>
          ) : null}
          <div className="admin-card-workspace">
            <aside className="admin-card-browser">
              <div className="admin-card-browser-filters">
                <input type="search" value={cardSearch} placeholder={t.cardSearchPlaceholder} onChange={(e) => setCardSearch(e.target.value)} />
                <select aria-label={t.categoryFilter} value={cardCategoryFilter} onChange={(e) => setCardCategoryFilter(e.target.value)}>
                  <option value="ALL">{t.allCategories}</option>
                  {['LYAP', 'SCANDAL', 'SUPPORT', 'COMMAND', 'VVNZ', 'LEGENDARY', 'RANK'].map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="admin-card-browser-count">{t.visibleCardsLabel}: {visibleCardRows.length}</div>
              <div className="admin-card-browser-list">
                {visibleCardRows.length === 0 ? <p>{t.noCardsMatch}</p> : null}
                {visibleCardRows.map(({ target, index, card }) => {
                  const isEditedRow = editIndex >= 0 && editTarget === target && editIndex === index;
                  return (
                    <article className={isEditedRow ? 'admin-card-browser-row is-selected' : 'admin-card-browser-row'} key={`module-card-${target}-${index}-${card.id}`}>
                      <button
                        type="button"
                        className="admin-card-browser-open"
                        disabled={'__rankId' in card}
                        onClick={() => (index >= 0 ? onEditCardAt(target, index) : onEditCardById(target, card.id))}
                      >
                        <img src={getCardImageSrc(card)} alt="" />
                        <span>
                          <strong>{card.title}</strong>
                          <small>{card.id}{'category' in card ? ` · ${card.category}` : ''}</small>
                        </span>
                      </button>
                      {'__rankId' in card ? (
                        <span className="admin-card-browser-rank">{t.tabRanks}</span>
                      ) : (
                        <button
                          type="button"
                          className="admin-card-browser-remove"
                          title={t.removeCard}
                          aria-label={`${t.removeCard}: ${card.title}`}
                          onClick={() => (index >= 0 ? onRemoveCardAt(target, index) : onRemoveCardById(target, card.id))}
                        >×</button>
                      )}
                    </article>
                  );
                })}
              </div>
            </aside>
            <main className="admin-card-editor-stage">
              {hasActiveCardEditor ? inlineEditor : (
                <div className="admin-card-editor-empty">
                  <strong>{t.selectCardToEdit}</strong>
                  <p>{t.createOrOpenCardHint}</p>
                </div>
              )}
              {hasActiveCardEditor ? <p className="admin-info">{t.editingTargetLabel}: {editTarget}</p> : null}
            </main>
          </div>
        </div>
      ) : null}
    </>
  );
};
