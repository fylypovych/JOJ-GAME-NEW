import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { CropDraft } from './types';
import type { CardCategory, CardDefinition, EffectResource } from '../../game/types';
import { normalizeImagePath } from '../../game/imagePaths';

type EditorSection = 'details' | 'effects' | 'image' | 'json';

export const AdminInlineEditor = (props: {
  t: ReturnType<typeof import('../i18n').text>;
  editTarget: 'deck' | 'legendaryDeck' | 'rankTrack';
  editCard: CardDefinition;
  setEditCard: Dispatch<SetStateAction<CardDefinition>>;
  categories: CardCategory[];
  attachImageFile: (file: File | null) => void;
  cropDraft: CropDraft | null;
  setCropDraft: Dispatch<SetStateAction<CropDraft | null>>;
  cropPreviewRef: RefObject<HTMLCanvasElement | null>;
  applyCropAndUpload: () => void;
  uploadOriginalFromCropDraft: () => void;
  cancelCropDraft: () => void;
  withCacheBust: (src?: string) => string;
  startCropFromCurrentImage: () => void;
  effectResourceKeys: readonly EffectResource[];
  editEffectsText: string;
  setEditEffectsText: Dispatch<SetStateAction<string>>;
  setEditEffectValues: Dispatch<SetStateAction<Record<EffectResource, number>>>;
  effectsToValues: (effects?: CardDefinition['effects']) => Record<EffectResource, number>;
  editEffectValues: Record<EffectResource, number>;
  editError: string;
  saveEdit: () => void;
  addFromForm: () => void;
  isCreateCardMode: boolean;
  hasUnsavedChanges: boolean;
  closeEditor: () => void;
}) => {
  const {
    t, editTarget, editCard, setEditCard, categories, attachImageFile, cropDraft, setCropDraft,
    cropPreviewRef, applyCropAndUpload, uploadOriginalFromCropDraft, cancelCropDraft, withCacheBust,
    startCropFromCurrentImage, effectResourceKeys, editEffectsText, setEditEffectsText,
    setEditEffectValues, effectsToValues, editEffectValues, editError, saveEdit, addFromForm,
    isCreateCardMode, hasUnsavedChanges, closeEditor,
  } = props;
  const [section, setSection] = useState<EditorSection>('details');
  const imagePath = normalizeImagePath(editCard.image);
  const tabs: Array<{ id: EditorSection; label: string }> = [
    { id: 'details', label: t.editorTabDetails },
    { id: 'effects', label: t.editorTabEffects },
    { id: 'image', label: t.editorTabImage },
    { id: 'json', label: t.editorTabJson },
  ];

  const updateEffectsJson = (next: string) => {
    setEditEffectsText(next);
    try {
      const parsed = JSON.parse(next || '[]');
      if (!Array.isArray(parsed)) return;
      const effects: NonNullable<CardDefinition['effects']> = [];
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        if (
          typeof row.resource === 'string'
          && effectResourceKeys.includes(row.resource as EffectResource)
          && typeof row.value === 'number'
        ) {
          effects.push({ resource: row.resource as EffectResource, value: row.value });
        }
      }
      setEditEffectValues(effectsToValues(effects));
    } catch {
      // Raw JSON remains editable while it is temporarily incomplete.
    }
  };

  return (
    <div className="admin-card-editor-shell">
      <header className="admin-card-editor-header">
        <div>
          <span className="admin-card-editor-kicker">{isCreateCardMode ? t.createNewCard : t.cardEditor}</span>
          <h4>{editCard.title || editCard.id || t.createNewCard}</h4>
        </div>
        <span className={hasUnsavedChanges ? 'admin-card-save-state is-dirty' : 'admin-card-save-state'}>
          {hasUnsavedChanges ? t.unsavedChanges : t.allChangesSaved}
        </span>
      </header>

      <nav className="admin-card-editor-tabs" aria-label={t.cardEditor}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={section === tab.id}
            onClick={() => setSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="admin-card-form-layout">
        <section className="admin-card-form-panel">
          {section === 'details' ? (
            <div className="admin-editor-grid admin-card-details-grid">
              <label>{t.fieldId}<input value={editCard.id} onChange={(e) => setEditCard((prev) => ({ ...prev, id: e.target.value }))} /></label>
              <label>{t.fieldTitle}<input value={editCard.title} onChange={(e) => setEditCard((prev) => ({ ...prev, title: e.target.value }))} /></label>
              {editTarget !== 'legendaryDeck' ? (
                <label>{t.fieldCategory}
                  <select value={editCard.category} onChange={(e) => setEditCard((prev) => ({ ...prev, category: e.target.value as CardCategory }))}>
                    {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="admin-card-field-wide">{t.fieldFlavor}
                <textarea value={editCard.flavor ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, flavor: e.target.value }))} />
              </label>
            </div>
          ) : null}

          {section === 'effects' ? (
            <div>
              <p className="admin-card-section-hint">{t.effectsDelta}</p>
              <div className="admin-editor-grid admin-card-effects-grid">
                {effectResourceKeys.map((key) => (
                  <label key={`effect-${key}`}>{key === 'rank' ? t.rankResource : t.resources[key as keyof typeof t.resources]}
                    <input
                      type="number"
                      value={editEffectValues[key]}
                      onChange={(e) => {
                        const value = Number(e.target.value || 0);
                        setEditEffectValues((prev) => {
                          const next = { ...prev, [key]: value };
                          setEditEffectsText(JSON.stringify(
                            Object.entries(next)
                              .filter(([, amount]) => Number(amount) !== 0)
                              .map(([resource, amount]) => ({ resource, value: amount })),
                            null,
                            2,
                          ));
                          return next;
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {section === 'image' ? (
            <div className="admin-card-image-fields">
              <label>{t.fieldImagePath}
                <input value={editCard.image ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, image: e.target.value }))} />
              </label>
              <label>{t.fieldImageFile}
                <input type="file" accept="image/*" onChange={(e) => attachImageFile(e.target.files?.[0] ?? null)} />
              </label>
              <div>
                <span className="admin-card-field-label">{t.fieldQuickImagePath}</span>
                <span className="admin-controls">
                  <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/card-assets/${prev.id || 'card-id'}.png` }))}>PNG</button>
                  <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/card-assets/${prev.id || 'card-id'}.webp` }))}>WEBP</button>
                  {imagePath ? <button type="button" onClick={startCropFromCurrentImage}>{t.cropCurrentImage}</button> : null}
                </span>
              </div>
              {cropDraft ? (
                <div className="admin-crop-editor">
                  <p><strong>{t.cropEditorTitle}</strong></p>
                  <p>{t.cropAspectLocked}</p>
                  {cropDraft.sourceWidth > 0 && cropDraft.sourceHeight > 0 ? <p>{t.cropSourceSize}: {cropDraft.sourceWidth}x{cropDraft.sourceHeight}px</p> : null}
                  <div className="admin-crop-grid">
                    <label>{t.cropTop}<input type="number" min={0} max={Math.max(0, cropDraft.sourceHeight - 1)} value={cropDraft.topPx} onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, topPx: Number(e.target.value || 0) } : prev))} /></label>
                    <label>{t.cropRight}<input type="number" min={0} max={Math.max(0, cropDraft.sourceWidth - 1)} value={cropDraft.rightPx} onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, rightPx: Number(e.target.value || 0) } : prev))} /></label>
                    <label>{t.cropBottom}<input type="number" min={0} max={Math.max(0, cropDraft.sourceHeight - 1)} value={cropDraft.bottomPx} onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, bottomPx: Number(e.target.value || 0) } : prev))} /></label>
                    <label>{t.cropLeft}<input type="number" min={0} max={Math.max(0, cropDraft.sourceWidth - 1)} value={cropDraft.leftPx} onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, leftPx: Number(e.target.value || 0) } : prev))} /></label>
                  </div>
                  <canvas className="admin-crop-preview" ref={cropPreviewRef as RefObject<HTMLCanvasElement>} />
                  <p className="admin-controls">
                    <button type="button" onClick={applyCropAndUpload}>{t.applyCropUpload}</button>
                    <button type="button" onClick={uploadOriginalFromCropDraft}>{t.uploadWithoutCrop}</button>
                    <button type="button" onClick={cancelCropDraft}>{t.cancelCrop}</button>
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {section === 'json' ? (
            <label>{t.effectsJson}
              <textarea className="admin-textarea admin-card-json" value={editEffectsText} onChange={(e) => updateEffectsJson(e.target.value)} />
            </label>
          ) : null}
        </section>

        <aside className="admin-card-live-preview">
          <h5>{t.editorPreview}</h5>
          <div className="admin-card-live-image">
            {imagePath ? <img src={withCacheBust(imagePath)} alt={editCard.title || t.fieldImagePreview} /> : <span>{t.fieldImagePreview}</span>}
          </div>
          <strong>{editCard.title || '—'}</strong>
          <code>{editCard.id || '—'}</code>
          <span className="admin-card-category-chip">{editCard.category}</span>
          {editCard.flavor ? <p>{editCard.flavor}</p> : null}
        </aside>
      </div>

      {editError ? <p className="admin-error">{editError}</p> : null}
      <footer className="admin-card-editor-actions">
        <button type="button" className="admin-card-primary-action" onClick={isCreateCardMode ? addFromForm : saveEdit}>
          {isCreateCardMode ? t.addCustomCard : t.saveCard}
        </button>
        <button type="button" onClick={closeEditor}>{t.close}</button>
      </footer>
    </div>
  );
};
