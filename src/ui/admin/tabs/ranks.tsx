import { useEffect, useMemo, useState } from 'react';
import { text } from '../../i18n';
import type { RankDefinition, ResourceKey } from '../../../game/types';

type T = ReturnType<typeof text>;
type RankDraft = RankDefinition;
type RankEditorSection = 'details' | 'resources' | 'image';

const emptyRankDraft = (): RankDefinition => ({
  id: '', name: '', image: '', imageVariants: [], requirement: {}, cost: {}, bonus: {},
});
const withNormalizedVariants = (rank: RankDefinition) => Array.isArray(rank.imageVariants) ? rank.imageVariants : [];

const RankImageManager = ({
  t, image, imageVariants, onImageChange, onImageUpload, onVariantsChange, onVariantUpload,
}: {
  t: T;
  image?: string;
  imageVariants?: string[];
  onImageChange: (value: string) => void;
  onImageUpload: (file: File | null) => void;
  onVariantsChange: (next: string[]) => void;
  onVariantUpload: (file: File | null) => void;
}) => {
  const variants = withNormalizedVariants({ imageVariants } as RankDefinition);
  return (
    <div className="admin-rank-image-editor">
      <section className="admin-rank-media-card">
        <h5>{t.rankImageLabel}</h5>
        <p>{t.rankImageHelp}</p>
        <label>{t.rankImageLabel}
          <input value={image ?? ''} onChange={(e) => onImageChange(e.target.value)} placeholder="/card-assets/rank-*.webp" />
        </label>
        <label>{t.rankImageFileLabel}
          <input type="file" accept="image/*" onChange={(e) => {
            onImageUpload(e.target.files?.[0] ?? null);
            e.currentTarget.value = '';
          }} />
        </label>
      </section>

      <section className="admin-rank-media-card">
        <div className="admin-rank-variant-head">
          <div>
            <h5>{t.rankImageVariantsLabel}</h5>
            <p>{t.rankImageVariantsHelp}</p>
          </div>
          <button type="button" onClick={() => onVariantsChange([...variants, ''])}>{t.rankAddVariantLabel}</button>
        </div>
        <label>{t.rankVariantImageFileLabel}
          <input type="file" accept="image/*" onChange={(e) => {
            onVariantUpload(e.target.files?.[0] ?? null);
            e.currentTarget.value = '';
          }} />
        </label>
        <div className="admin-rank-variant-list">
          {variants.length === 0 ? <p className="admin-rank-empty">{t.rankVariantsEmpty}</p> : null}
          {variants.map((path, variantIndex) => (
            <div key={`rank-variant-${variantIndex}`} className="admin-rank-variant-row">
              <span className="admin-rank-variant-index">#{variantIndex + 1}</span>
              <input value={path} onChange={(e) => {
                const next = [...variants];
                next[variantIndex] = e.target.value;
                onVariantsChange(next);
              }} placeholder="/card-assets/rank-variant-*.webp" />
              <button type="button" onClick={() => onVariantsChange(variants.filter((_, index) => index !== variantIndex))}>×</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const RankResourcesEditor = ({ t, rank, rankResourceKeys, onChange }: {
  t: T;
  rank: RankDefinition;
  rankResourceKeys: ResourceKey[];
  onChange: (next: RankDefinition) => void;
}) => {
  const groups = [
    { title: t.rankRequirementsTitle, field: 'requirement' as const, prefix: '' },
    { title: t.rankTransitionCostTitle, field: 'cost' as const, prefix: t.rankCostLabel },
    { title: t.rankBonusTitle, field: 'bonus' as const, prefix: t.rankBonusLabel },
  ];
  return (
    <div className="admin-rank-resource-sections">
      {groups.map((group) => (
        <section className="admin-rank-resource-card" key={group.field}>
          <h5>{group.title}</h5>
          <div className="admin-rank-resource-grid">
            {rankResourceKeys.map((key) => (
              <label key={`${group.field}-${rank.id}-${key}`}>
                {group.prefix ? `${group.prefix} ` : ''}{t.resources[key as keyof typeof t.resources]}
                <input
                  type="number"
                  min={group.field === 'bonus' ? undefined : 0}
                  value={rank[group.field][key] ?? 0}
                  onChange={(e) => {
                    const raw = Number(e.target.value || 0);
                    const value = group.field === 'bonus' ? raw : Math.max(0, raw);
                    onChange({ ...rank, [group.field]: { ...rank[group.field], [key]: value } });
                  }}
                />
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export const AdminRanksTab = ({
  t, exportRanksToFile, importRanks, importRanksFromFile, ranksImportError, ranksImportStatus,
  ranksJson, setRanksJson, setRanksImportError, setRanksImportStatus, editableRanks,
  hasUnsavedRankChanges, updateRankAt, attachRankImageFile, attachRankVariantImageFile,
  rankResourceKeys, removeRankAt, rankDraft, setRankDraft, attachRankDraftImageFile,
  attachRankDraftVariantImageFile, saveRanks, addRank, onResetRanks,
}: {
  t: T; exportRanksToFile: () => void; importRanks: () => void; importRanksFromFile: (file: File | null) => void;
  ranksImportError: string; ranksImportStatus: string; ranksJson: string; setRanksJson: (v: string) => void;
  setRanksImportError: (v: string) => void; setRanksImportStatus: (v: string) => void; editableRanks: RankDefinition[];
  hasUnsavedRankChanges: boolean;
  updateRankAt: (index: number, updater: (rank: RankDefinition) => RankDefinition) => void; attachRankImageFile: (index: number, rankId: string, file: File | null) => Promise<void> | void;
  attachRankVariantImageFile: (index: number, rankId: string, file: File | null) => Promise<void> | void;
  rankResourceKeys: ResourceKey[]; removeRankAt: (index: number) => void; rankDraft: RankDraft; setRankDraft: (updater: (prev: RankDraft) => RankDraft) => void;
  attachRankDraftImageFile: (file: File | null) => Promise<void> | void; attachRankDraftVariantImageFile: (file: File | null) => Promise<void> | void; saveRanks: () => void; addRank: () => void; onResetRanks: () => void;
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(editableRanks.length > 0 ? 0 : null);
  const [isCreating, setIsCreating] = useState(false);
  const [section, setSection] = useState<RankEditorSection>('details');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (editingIndex !== null && editingIndex >= editableRanks.length) {
      setEditingIndex(editableRanks.length > 0 ? editableRanks.length - 1 : null);
    }
  }, [editableRanks.length, editingIndex]);

  const visibleRanks = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return editableRanks
      .map((rank, index) => ({ rank, index }))
      .filter(({ rank }) => !needle || `${rank.id} ${rank.name}`.toLocaleLowerCase().includes(needle));
  }, [editableRanks, search]);

  const activeRank = isCreating ? rankDraft : (editingIndex === null ? null : editableRanks[editingIndex] ?? null);
  const draftDirty = JSON.stringify(rankDraft) !== JSON.stringify(emptyRankDraft());
  const hasPendingChanges = hasUnsavedRankChanges || (isCreating && draftDirty);
  const previewImage = activeRank?.image || activeRank?.imageVariants?.find(Boolean) || '';

  const updateActiveRank = (updater: (rank: RankDefinition) => RankDefinition) => {
    if (isCreating) {
      setRankDraft(updater);
    } else if (editingIndex !== null) {
      updateRankAt(editingIndex, updater);
    }
  };

  const selectRank = (index: number) => {
    setIsCreating(false);
    setEditingIndex(index);
  };

  const startCreating = () => {
    setIsCreating(true);
    setEditingIndex(null);
    setSection('details');
  };

  const addDraftRank = () => {
    if (!rankDraft.id.trim() || !rankDraft.name.trim()) return;
    const nextIndex = editableRanks.length;
    addRank();
    setIsCreating(false);
    setEditingIndex(nextIndex);
  };

  const resetRanks = () => {
    if (hasPendingChanges && !window.confirm(t.rankResetConfirm)) return;
    onResetRanks();
    setIsCreating(false);
    setEditingIndex(editableRanks.length > 0 ? 0 : null);
  };

  const tabs: Array<{ id: RankEditorSection; label: string }> = [
    { id: 'details', label: t.editorTabDetails },
    { id: 'resources', label: t.rankResourcesTab },
    { id: 'image', label: t.editorTabImage },
  ];

  return (
    <>
      <p>{t.ranksHint}</p>

      <div className="admin-card-workspace-shell admin-rank-workspace-shell">
        <header className="admin-card-workspace-toolbar">
          <div>
            <h4>{t.ranksTitle}</h4>
            <span>{editableRanks.length}</span>
          </div>
          <span className={hasPendingChanges ? 'admin-card-save-state is-dirty' : 'admin-card-save-state'}>
            {hasPendingChanges ? t.rankPendingChanges : t.allChangesSaved}
          </span>
          <div className="admin-controls admin-rank-toolbar-actions">
            <button type="button" onClick={saveRanks}>{t.saveRanks}</button>
            <button type="button" className="admin-card-primary-action" onClick={startCreating}>+ {t.addRank}</button>
            <button type="button" onClick={resetRanks}>{t.resetRanks}</button>
          </div>
        </header>

        <div className="admin-card-workspace">
          <aside className="admin-card-browser">
            <div className="admin-card-browser-filters admin-rank-browser-filter">
              <input type="search" value={search} placeholder={t.rankSearchPlaceholder} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="admin-card-browser-count">{t.visibleCardsLabel}: {visibleRanks.length}</div>
            <div className="admin-card-browser-list">
              {visibleRanks.length === 0 ? <p>{t.rankNoMatches}</p> : null}
              {visibleRanks.map(({ rank, index }) => (
                <article className={!isCreating && editingIndex === index ? 'admin-card-browser-row is-selected' : 'admin-card-browser-row'} key={`rank-browser-${rank.id}-${index}`}>
                  <button type="button" className="admin-card-browser-open admin-rank-browser-open" onClick={() => selectRank(index)}>
                    <span className="admin-rank-order">#{index + 1}</span>
                    <span>
                      <strong>{rank.name || t.rankNameLabel}</strong>
                      <small>{rank.id || 'rank-id'}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="admin-card-browser-remove"
                    title={t.deleteItemShort}
                    aria-label={`${t.deleteItemShort}: ${rank.name}`}
                    onClick={() => {
                      if (!window.confirm(t.rankDeleteConfirm)) return;
                      removeRankAt(index);
                      if (editingIndex === index) setEditingIndex(index > 0 ? index - 1 : 0);
                    }}
                  >×</button>
                </article>
              ))}
            </div>
          </aside>

          <main className="admin-card-editor-stage">
            {activeRank ? (
              <div className="admin-card-editor-shell admin-rank-editor-shell">
                <header className="admin-card-editor-header">
                  <div>
                    <span className="admin-card-editor-kicker">{isCreating ? t.rankCreateTitle : `#${(editingIndex ?? 0) + 1}`}</span>
                    <h4>{activeRank.name || activeRank.id || t.rankCreateTitle}</h4>
                  </div>
                  <span className={hasPendingChanges ? 'admin-card-save-state is-dirty' : 'admin-card-save-state'}>
                    {hasPendingChanges ? t.unsavedChanges : t.allChangesSaved}
                  </span>
                </header>

                <nav className="admin-card-editor-tabs" aria-label={t.ranksTitle}>
                  {tabs.map((tab) => (
                    <button key={tab.id} type="button" aria-pressed={section === tab.id} onClick={() => setSection(tab.id)}>{tab.label}</button>
                  ))}
                </nav>

                <div className="admin-card-form-layout">
                  <section className="admin-card-form-panel">
                    {section === 'details' ? (
                      <div className="admin-editor-grid admin-card-details-grid">
                        <label>ID<input value={activeRank.id} onChange={(e) => updateActiveRank((rank) => ({ ...rank, id: e.target.value }))} /></label>
                        <label>{t.rankNameLabel}<input value={activeRank.name} onChange={(e) => updateActiveRank((rank) => ({ ...rank, name: e.target.value }))} /></label>
                      </div>
                    ) : null}
                    {section === 'resources' ? (
                      <RankResourcesEditor t={t} rank={activeRank} rankResourceKeys={rankResourceKeys} onChange={(next) => updateActiveRank(() => next)} />
                    ) : null}
                    {section === 'image' ? (
                      <RankImageManager
                        t={t}
                        image={activeRank.image}
                        imageVariants={activeRank.imageVariants}
                        onImageChange={(value) => updateActiveRank((rank) => ({ ...rank, image: value }))}
                        onImageUpload={(file) => {
                          if (isCreating) void attachRankDraftImageFile(file);
                          else if (editingIndex !== null) void attachRankImageFile(editingIndex, activeRank.id, file);
                        }}
                        onVariantsChange={(next) => updateActiveRank((rank) => ({ ...rank, imageVariants: next }))}
                        onVariantUpload={(file) => {
                          if (isCreating) void attachRankDraftVariantImageFile(file);
                          else if (editingIndex !== null) void attachRankVariantImageFile(editingIndex, activeRank.id, file);
                        }}
                      />
                    ) : null}
                  </section>

                  <aside className="admin-card-live-preview admin-rank-live-preview">
                    <h5>{t.rankPreviewTitle}</h5>
                    <div className="admin-card-live-image">
                      {previewImage ? <img src={previewImage} alt={activeRank.name || t.rankImageLabel} /> : <span>{t.rankImageLabel}</span>}
                    </div>
                    <strong>{activeRank.name || '—'}</strong>
                    <code>{activeRank.id || '—'}</code>
                    <div className="admin-rank-preview-values">
                      {rankResourceKeys.map((key) => (
                        <span key={`rank-preview-${key}`} title={t.resources[key as keyof typeof t.resources]}>
                          {t.resources[key as keyof typeof t.resources]}: {activeRank.requirement[key] ?? 0} / {activeRank.cost[key] ?? 0} / {activeRank.bonus[key] ?? 0}
                        </span>
                      ))}
                    </div>
                    {(activeRank.imageVariants ?? []).filter(Boolean).length > 0 ? (
                      <div className="admin-rank-preview-variants">
                        {(activeRank.imageVariants ?? []).filter(Boolean).map((path, index) => <img key={`${path}-${index}`} src={path} alt={`${activeRank.name} #${index + 1}`} />)}
                      </div>
                    ) : null}
                  </aside>
                </div>

                <footer className="admin-card-editor-actions">
                  <button type="button" className="admin-card-primary-action" disabled={isCreating && (!rankDraft.id.trim() || !rankDraft.name.trim())} onClick={isCreating ? addDraftRank : saveRanks}>
                    {isCreating ? t.addRank : t.saveRanks}
                  </button>
                </footer>
              </div>
            ) : (
              <div className="admin-card-editor-empty"><strong>{t.rankSelectHint}</strong></div>
            )}
          </main>
        </div>
      </div>

      {ranksImportError ? <p className="admin-error">{ranksImportError}</p> : null}
      {ranksImportStatus ? <p className="admin-success">{ranksImportStatus}</p> : null}

      <details className="admin-rank-import-export">
        <summary>{t.ranksImportExportTitle}</summary>
        <p className="admin-controls">
          <button type="button" onClick={exportRanksToFile}>{t.ranksExportJson}</button>
          <button type="button" onClick={importRanks}>{t.ranksImportJson}</button>
          <label>{t.ranksImportFile}<input type="file" accept="application/json,.json" onChange={(e) => importRanksFromFile(e.target.files?.[0] ?? null)} /></label>
        </p>
        <textarea className="admin-textarea" value={ranksJson} onChange={(e) => {
          setRanksJson(e.target.value);
          setRanksImportError('');
          setRanksImportStatus('');
        }} />
      </details>
    </>
  );
};
