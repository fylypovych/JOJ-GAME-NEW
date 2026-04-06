import { text } from '../../i18n';
import type { RankDefinition, ResourceKey } from '../../../game/types';

type T = ReturnType<typeof text>;
type RankDraft = RankDefinition;

const withNormalizedVariants = (rank: RankDefinition) => Array.isArray(rank.imageVariants) ? rank.imageVariants : [];

const RankImageManager = ({
  t,
  image,
  imageVariants,
  onImageChange,
  onImageUpload,
  onVariantsChange,
  onVariantUpload,
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
    <div className="admin-rank-media-grid">
      <section className="admin-rank-media-card">
        <h5>{t.rankImageLabel}</h5>
        <p>{t.rankImageHelp}</p>
        <label>
          {t.rankImageLabel}
          <input value={image ?? ''} onChange={(e) => onImageChange(e.target.value)} placeholder="/card-assets/rank-*.webp" />
        </label>
        <label>
          {t.rankImageFileLabel}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              onImageUpload(e.target.files?.[0] ?? null);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {image ? (
          <div className="admin-rank-image-preview">
            <img src={image} alt={t.rankImageLabel} />
            <code>{image}</code>
          </div>
        ) : null}
      </section>

      <section className="admin-rank-media-card">
        <div className="admin-rank-variant-head">
          <div>
            <h5>{t.rankImageVariantsLabel}</h5>
            <p>{t.rankImageVariantsHelp}</p>
          </div>
          <button type="button" onClick={() => onVariantsChange([...variants, ''])}>{t.rankAddVariantLabel}</button>
        </div>
        <label>
          {t.rankVariantImageFileLabel}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              onVariantUpload(e.target.files?.[0] ?? null);
              e.currentTarget.value = '';
            }}
          />
        </label>
        <div className="admin-rank-variant-list">
          {variants.length === 0 ? <p className="admin-rank-empty">{t.rankVariantsEmpty}</p> : null}
          {variants.map((path, variantIndex) => (
            <div key={`rank-variant-${variantIndex}`} className="admin-rank-variant-row">
              <span className="admin-rank-variant-index">#{variantIndex + 1}</span>
              <input
                value={path}
                onChange={(e) => {
                  const next = [...variants];
                  next[variantIndex] = e.target.value;
                  onVariantsChange(next);
                }}
                placeholder="/card-assets/rank-variant-*.webp"
              />
              <button
                type="button"
                onClick={() => onVariantsChange(variants.filter((_, index) => index !== variantIndex))}
              >
                {t.removeCard}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const RankResourcesEditor = ({
  t,
  rank,
  rankResourceKeys,
  onChange,
}: {
  t: T;
  rank: RankDefinition;
  rankResourceKeys: ResourceKey[];
  onChange: (next: RankDefinition) => void;
}) => (
  <div className="admin-rank-resource-sections">
    <section className="admin-rank-resource-card">
      <h5>{t.rankRequirementsTitle}</h5>
      <div className="admin-editor-grid">
        {rankResourceKeys.map((key) => (
          <label key={`req-${rank.id}-${key}`}>
            {t.resources[key as keyof typeof t.resources]}
            <input
              type="number"
              min={0}
              value={rank.requirement[key] ?? 0}
              onChange={(e) => onChange({
                ...rank,
                requirement: { ...rank.requirement, [key]: Math.max(0, Number(e.target.value || 0)) },
              })}
            />
          </label>
        ))}
      </div>
    </section>
    <section className="admin-rank-resource-card">
      <h5>{t.rankTransitionCostTitle}</h5>
      <div className="admin-editor-grid">
        {rankResourceKeys.map((key) => (
          <label key={`cost-${rank.id}-${key}`}>
            {`${t.rankCostLabel} ${t.resources[key as keyof typeof t.resources]}`}
            <input
              type="number"
              min={0}
              value={rank.cost[key] ?? 0}
              onChange={(e) => onChange({
                ...rank,
                cost: { ...rank.cost, [key]: Math.max(0, Number(e.target.value || 0)) },
              })}
            />
          </label>
        ))}
      </div>
    </section>
    <section className="admin-rank-resource-card">
      <h5>{t.rankBonusTitle}</h5>
      <div className="admin-editor-grid">
        {rankResourceKeys.map((key) => (
          <label key={`bonus-${rank.id}-${key}`}>
            {`${t.rankBonusLabel} ${t.resources[key as keyof typeof t.resources]}`}
            <input
              type="number"
              value={rank.bonus[key] ?? 0}
              onChange={(e) => onChange({
                ...rank,
                bonus: { ...rank.bonus, [key]: Number(e.target.value || 0) },
              })}
            />
          </label>
        ))}
      </div>
    </section>
  </div>
);

export const AdminRanksTab = ({
  t, exportRanksToFile, importRanks, importRanksFromFile, ranksImportError, ranksImportStatus,
  ranksJson, setRanksJson, setRanksImportError, setRanksImportStatus, editableRanks, updateRankAt,
  attachRankImageFile, attachRankVariantImageFile, rankResourceKeys, removeRankAt, rankDraft, setRankDraft, attachRankDraftImageFile, attachRankDraftVariantImageFile,
  saveRanks, addRank, onResetRanks,
}: {
  t: T; exportRanksToFile: () => void; importRanks: () => void; importRanksFromFile: (file: File | null) => void;
  ranksImportError: string; ranksImportStatus: string; ranksJson: string; setRanksJson: (v: string) => void;
  setRanksImportError: (v: string) => void; setRanksImportStatus: (v: string) => void; editableRanks: RankDefinition[];
  updateRankAt: (index: number, updater: (rank: RankDefinition) => RankDefinition) => void; attachRankImageFile: (index: number, rankId: string, file: File | null) => Promise<void> | void;
  attachRankVariantImageFile: (index: number, rankId: string, file: File | null) => Promise<void> | void;
  rankResourceKeys: ResourceKey[]; removeRankAt: (index: number) => void; rankDraft: RankDraft; setRankDraft: (updater: (prev: RankDraft) => RankDraft) => void;
  attachRankDraftImageFile: (file: File | null) => Promise<void> | void; attachRankDraftVariantImageFile: (file: File | null) => Promise<void> | void; saveRanks: () => void; addRank: () => void; onResetRanks: () => void;
}) => (
  <>
    <h3>{t.ranksTitle}</h3>
    <p>{t.ranksHint}</p>

    <div className="admin-ranks-toolbar">
      <button type="button" onClick={saveRanks}>{t.saveRanks}</button>
      <button type="button" onClick={addRank}>{t.addRank}</button>
      <button type="button" onClick={onResetRanks}>{t.resetRanks}</button>
    </div>

    <div className="admin-deck-list admin-rank-list"><ul>
      {editableRanks.map((rank, index) => (
        <li key={`rank-${rank.id}-${index}`}>
          <article className="admin-inline-editor admin-rank-editor">
            <div className="admin-rank-header">
              <div>
                <span className="admin-rank-order">#{index + 1}</span>
                <h4>{rank.name || t.rankNameLabel}</h4>
                <p>{rank.id || 'rank-id'}</p>
              </div>
              <button type="button" onClick={() => removeRankAt(index)} disabled={editableRanks.length <= 1}>{t.removeCard}</button>
            </div>

            <div className="admin-editor-grid">
              <label>
                ID
                <input value={rank.id} onChange={(e) => updateRankAt(index, (row) => ({ ...row, id: e.target.value }))} />
              </label>
              <label>
                {t.rankNameLabel}
                <input value={rank.name} onChange={(e) => updateRankAt(index, (row) => ({ ...row, name: e.target.value }))} />
              </label>
            </div>

            <RankImageManager
              t={t}
              image={rank.image}
              imageVariants={rank.imageVariants}
              onImageChange={(value) => updateRankAt(index, (row) => ({ ...row, image: value }))}
              onImageUpload={(file) => { void attachRankImageFile(index, rank.id, file); }}
              onVariantsChange={(next) => updateRankAt(index, (row) => ({ ...row, imageVariants: next.map((value) => value.trim()).filter(Boolean) }))}
              onVariantUpload={(file) => { void attachRankVariantImageFile(index, rank.id, file); }}
            />

            <RankResourcesEditor
              t={t}
              rank={rank}
              rankResourceKeys={rankResourceKeys}
              onChange={(next) => updateRankAt(index, () => next)}
            />
          </article>
        </li>
      ))}
    </ul></div>

    <h4>{t.addRank}</h4>
    <article className="admin-inline-editor admin-rank-editor admin-rank-editor-draft">
      <div className="admin-rank-header">
        <div>
          <span className="admin-rank-order">+</span>
          <h4>{t.rankCreateTitle}</h4>
          <p>{t.rankCreateHint}</p>
        </div>
      </div>

      <div className="admin-editor-grid">
        <label>
          ID
          <input value={rankDraft.id} onChange={(e) => setRankDraft((prev) => ({ ...prev, id: e.target.value }))} />
        </label>
        <label>
          {t.rankNameLabel}
          <input value={rankDraft.name} onChange={(e) => setRankDraft((prev) => ({ ...prev, name: e.target.value }))} />
        </label>
      </div>

      <RankImageManager
        t={t}
        image={rankDraft.image}
        imageVariants={rankDraft.imageVariants}
        onImageChange={(value) => setRankDraft((prev) => ({ ...prev, image: value }))}
        onImageUpload={(file) => { void attachRankDraftImageFile(file); }}
        onVariantsChange={(next) => setRankDraft((prev) => ({ ...prev, imageVariants: next.map((value) => value.trim()).filter(Boolean) }))}
        onVariantUpload={(file) => { void attachRankDraftVariantImageFile(file); }}
      />

      <RankResourcesEditor
        t={t}
        rank={rankDraft}
        rankResourceKeys={rankResourceKeys}
        onChange={(next) => setRankDraft(() => next)}
      />

      <p className="admin-controls">
        <button type="button" onClick={addRank}>{t.addRank}</button>
        <button type="button" onClick={saveRanks}>{t.saveRanks}</button>
        <button type="button" onClick={onResetRanks}>{t.resetRanks}</button>
      </p>
    </article>

    <h4>{t.ranksImportExportTitle}</h4>
    <p className="admin-controls">
      <button type="button" onClick={exportRanksToFile}>{t.ranksExportJson}</button>
      <button type="button" onClick={importRanks}>{t.ranksImportJson}</button>
      <label>{t.ranksImportFile}<input type="file" accept="application/json,.json" onChange={(e) => importRanksFromFile(e.target.files?.[0] ?? null)} /></label>
    </p>
    {ranksImportError ? <p className="admin-error">{ranksImportError}</p> : null}
    {ranksImportStatus ? <p className="admin-success">{ranksImportStatus}</p> : null}
    <textarea className="admin-textarea" value={ranksJson} onChange={(e) => { setRanksJson(e.target.value); setRanksImportError(''); setRanksImportStatus(''); }} />
  </>
);
