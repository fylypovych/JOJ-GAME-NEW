import type { Dispatch, RefObject, SetStateAction } from 'react';
import { HoverImage } from './HoverImage';
import type { CropDraft } from './types';
import type { CardCategory, CardDefinition, EffectResource } from '../../game/types';
import { normalizeImagePath } from '../../game/imagePaths';

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
  closeEditor: () => void;
}) => {
  const {
    t,
    editTarget,
    editCard,
    setEditCard,
    categories,
    attachImageFile,
    cropDraft,
    setCropDraft,
    cropPreviewRef,
    applyCropAndUpload,
    uploadOriginalFromCropDraft,
    cancelCropDraft,
    withCacheBust,
    startCropFromCurrentImage,
    effectResourceKeys,
    editEffectsText,
    setEditEffectsText,
    setEditEffectValues,
    effectsToValues,
    editEffectValues,
    editError,
    saveEdit,
    addFromForm,
    isCreateCardMode,
    closeEditor,
  } = props;
  return (
    <div className="admin-inline-editor">
      <h4>{t.cardEditor}</h4>
      <div className="admin-editor-grid">
        <label>{t.fieldId}<input value={editCard.id} onChange={(e) => setEditCard((prev) => ({ ...prev, id: e.target.value }))} /></label>
        <label>{t.fieldTitle}<input value={editCard.title} onChange={(e) => setEditCard((prev) => ({ ...prev, title: e.target.value }))} /></label>
        {editTarget !== 'legendaryDeck' ? (
          <label>{t.fieldCategory}
            <select value={editCard.category} onChange={(e) => setEditCard((prev) => ({ ...prev, category: e.target.value as CardCategory }))}>
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </label>
        ) : null}
        <label>{t.fieldImagePath}
          <input value={editCard.image ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, image: e.target.value }))} />
        </label>
        <label>{t.fieldImageFile}
          <input type="file" accept="image/*" onChange={(e) => attachImageFile(e.target.files?.[0] ?? null)} />
        </label>
        {cropDraft ? (
          <div className="admin-crop-editor">
            <p><strong>{t.cropEditorTitle}</strong></p>
            <p>{t.cropAspectLocked}</p>
            {cropDraft.sourceWidth > 0 && cropDraft.sourceHeight > 0 ? (
              <p>{t.cropSourceSize}: {cropDraft.sourceWidth}x{cropDraft.sourceHeight}px</p>
            ) : null}
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
        {editCard.image ? (
          <label>{t.fieldImagePreview}
            <HoverImage
              src={withCacheBust(normalizeImagePath(editCard.image))}
              className="admin-thumb"
              alt={t.fieldImagePreview}
              onLoad={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'inline-block';
                (e.currentTarget as HTMLImageElement).style.visibility = 'visible';
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="admin-controls">
              <button type="button" onClick={startCropFromCurrentImage}>{t.cropCurrentImage}</button>
            </span>
          </label>
        ) : null}
        <label>{t.fieldQuickImagePath}
          <span className="admin-controls">
            <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/card-assets/${prev.id || 'card-id'}.png` }))}>/card-assets/&lt;id&gt;.png</button>
            <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/card-assets/${prev.id || 'card-id'}.webp` }))}>/card-assets/&lt;id&gt;.webp</button>
          </span>
        </label>
        <label>{t.fieldFlavor}<input value={editCard.flavor ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, flavor: e.target.value }))} /></label>
      </div>
      <label>
        {t.effectsJson}
        <textarea
          className="admin-textarea"
          value={editEffectsText}
          onChange={(e) => {
            const next = e.target.value;
            setEditEffectsText(next);
            try {
              const parsed = JSON.parse(next || '[]');
              if (Array.isArray(parsed)) {
                const effects: NonNullable<CardDefinition['effects']> = [];
                for (const item of parsed) {
                  if (!item || typeof item !== 'object') continue;
                  const row = item as Record<string, unknown>;
                  if (typeof row.resource === 'string' && effectResourceKeys.includes(row.resource as EffectResource) && typeof row.value === 'number') {
                    effects.push({ resource: row.resource as EffectResource, value: row.value });
                  }
                }
                setEditEffectValues(effectsToValues(effects));
              }
            } catch {
              // keep numeric state while user edits raw JSON
            }
          }}
        />
      </label>
      <h5>{t.effectsDelta}</h5>
      <div className="admin-editor-grid">
        {effectResourceKeys.map((key) => (
          <label key={`effect-${key}`}>{key === 'rank' ? t.rankResource : t.resources[key as keyof typeof t.resources]}
            <input
              type="number"
              value={editEffectValues[key]}
              onChange={(e) => {
                const value = Number(e.target.value || 0);
                setEditEffectValues((prev) => {
                  const next = { ...prev, [key]: value };
                  setEditEffectsText(JSON.stringify(Object.entries(next).filter(([, amount]) => Number(amount) !== 0).map(([resource, amount]) => ({ resource, value: amount })), null, 2));
                  return next;
                });
              }}
            />
          </label>
        ))}
      </div>
      {editError ? <p className="admin-error">{editError}</p> : null}
      <p className="admin-controls">
        <button type="button" onClick={saveEdit}>{t.saveCard}</button>
        <button type="button" onClick={addFromForm} disabled={!isCreateCardMode}>{t.addCustomCard}</button>
        <button type="button" onClick={closeEditor}>{t.close}</button>
      </p>
    </div>
  );
};
