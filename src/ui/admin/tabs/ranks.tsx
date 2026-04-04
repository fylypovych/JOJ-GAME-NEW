import { text } from '../../i18n';
import type { RankDefinition, ResourceKey } from '../../../game/types';

type T = ReturnType<typeof text>;
type RankDraft = RankDefinition;

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
    <h4>{t.ranksImportExportTitle}</h4>
    <p className="admin-controls">
      <button type="button" onClick={exportRanksToFile}>{t.ranksExportJson}</button>
      <button type="button" onClick={importRanks}>{t.ranksImportJson}</button>
      <label>{t.ranksImportFile}<input type="file" accept="application/json,.json" onChange={(e) => importRanksFromFile(e.target.files?.[0] ?? null)} /></label>
    </p>
    {ranksImportError ? <p className="admin-error">{ranksImportError}</p> : null}
    {ranksImportStatus ? <p className="admin-success">{ranksImportStatus}</p> : null}
    <textarea className="admin-textarea" value={ranksJson} onChange={(e) => { setRanksJson(e.target.value); setRanksImportError(''); setRanksImportStatus(''); }} />
    <div className="admin-deck-list"><ul>
      {editableRanks.map((rank, index) => (
        <li key={`rank-${rank.id}-${index}`}><div className="admin-inline-editor"><div className="admin-editor-grid">
          <label>ID<input value={rank.id} onChange={(e) => updateRankAt(index, (row) => ({ ...row, id: e.target.value }))} /></label>
          <label>{t.rankNameLabel}<input value={rank.name} onChange={(e) => updateRankAt(index, (row) => ({ ...row, name: e.target.value }))} /></label>
          <label>{t.rankImageLabel}<input value={rank.image ?? ''} onChange={(e) => updateRankAt(index, (row) => ({ ...row, image: e.target.value }))} placeholder="/card-assets/rank-*.webp" /></label>
          <label>{t.rankImageFileLabel}<input type="file" accept="image/*" onChange={(e) => { void attachRankImageFile(index, rank.id, e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} /></label>
          <label>{t.rankImageVariantsLabel}
            <textarea
              className="admin-textarea"
              value={(rank.imageVariants ?? []).join('\n')}
              onChange={(e) => updateRankAt(index, (row) => ({ ...row, imageVariants: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) }))}
              placeholder="/card-assets/rank-1.webp"
            />
          </label>
          <label>{t.rankVariantImageFileLabel}<input type="file" accept="image/*" onChange={(e) => { void attachRankVariantImageFile(index, rank.id, e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} /></label>
          {(rank.imageVariants ?? []).length > 0 ? (
            <div>
              <strong>{t.rankImageVariantsListLabel}</strong>
              <ul>
                {(rank.imageVariants ?? []).map((path: string, variantIndex: number) => (
                  <li key={`rank-variant-${rank.id}-${variantIndex}`}>
                    <code>{path}</code>{' '}
                    <button type="button" onClick={() => updateRankAt(index, (row) => ({ ...row, imageVariants: (row.imageVariants ?? []).filter((_: string, i: number) => i !== variantIndex) }))}>
                      {t.removeCard}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rankResourceKeys.map((key) => <label key={`req-${rank.id}-${key}`}>{t.resources[key as keyof typeof t.resources]}<input type="number" min={0} value={rank.requirement[key] ?? 0} onChange={(e) => updateRankAt(index, (row) => ({ ...row, requirement: { ...row.requirement, [key]: Math.max(0, Number(e.target.value || 0)) } }))} /></label>)}
          {rankResourceKeys.map((key) => <label key={`cost-${rank.id}-${key}`}>{`${t.rankCostLabel} ${t.resources[key as keyof typeof t.resources]}`}<input type="number" min={0} value={rank.cost[key] ?? 0} onChange={(e) => updateRankAt(index, (row) => ({ ...row, cost: { ...row.cost, [key]: Math.max(0, Number(e.target.value || 0)) } }))} /></label>)}
          {rankResourceKeys.map((key) => <label key={`bonus-${rank.id}-${key}`}>{`${t.rankBonusLabel} ${t.resources[key as keyof typeof t.resources]}`}<input type="number" value={rank.bonus[key] ?? 0} onChange={(e) => updateRankAt(index, (row) => ({ ...row, bonus: { ...row.bonus, [key]: Number(e.target.value || 0) } }))} /></label>)}
        </div><p className="admin-controls"><button type="button" onClick={() => removeRankAt(index)} disabled={editableRanks.length <= 1}>{t.removeCard}</button></p></div></li>
      ))}
    </ul></div>
    <h4>{t.addRank}</h4>
    <div className="admin-inline-editor"><div className="admin-editor-grid">
      <label>ID<input value={rankDraft.id} onChange={(e) => setRankDraft((prev) => ({ ...prev, id: e.target.value }))} /></label>
      <label>{t.rankNameLabel}<input value={rankDraft.name} onChange={(e) => setRankDraft((prev) => ({ ...prev, name: e.target.value }))} /></label>
      <label>{t.rankImageLabel}<input value={rankDraft.image ?? ''} onChange={(e) => setRankDraft((prev) => ({ ...prev, image: e.target.value }))} placeholder="/card-assets/rank-*.webp" /></label>
      <label>{t.rankImageFileLabel}<input type="file" accept="image/*" onChange={(e) => { void attachRankDraftImageFile(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} /></label>
      <label>{t.rankImageVariantsLabel}
        <textarea
          className="admin-textarea"
          value={(rankDraft.imageVariants ?? []).join('\n')}
          onChange={(e) => setRankDraft((prev) => ({ ...prev, imageVariants: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) }))}
          placeholder="/card-assets/rank-1.webp"
        />
      </label>
      <label>{t.rankVariantImageFileLabel}<input type="file" accept="image/*" onChange={(e) => { void attachRankDraftVariantImageFile(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} /></label>
      {rankResourceKeys.map((key) => <label key={`draft-req-${key}`}>{t.resources[key as keyof typeof t.resources]}<input type="number" min={0} value={rankDraft.requirement[key] ?? 0} onChange={(e) => setRankDraft((prev) => ({ ...prev, requirement: { ...prev.requirement, [key]: Math.max(0, Number(e.target.value || 0)) } }))} /></label>)}
      {rankResourceKeys.map((key) => <label key={`draft-cost-${key}`}>{`${t.rankCostLabel} ${t.resources[key as keyof typeof t.resources]}`}<input type="number" min={0} value={rankDraft.cost[key] ?? 0} onChange={(e) => setRankDraft((prev) => ({ ...prev, cost: { ...prev.cost, [key]: Math.max(0, Number(e.target.value || 0)) } }))} /></label>)}
      {rankResourceKeys.map((key) => <label key={`draft-bonus-${key}`}>{`${t.rankBonusLabel} ${t.resources[key as keyof typeof t.resources]}`}<input type="number" value={rankDraft.bonus[key] ?? 0} onChange={(e) => setRankDraft((prev) => ({ ...prev, bonus: { ...prev.bonus, [key]: Number(e.target.value || 0) } }))} /></label>)}
    </div><p className="admin-controls"><button type="button" onClick={saveRanks}>{t.saveRanks}</button><button type="button" onClick={addRank}>{t.addRank}</button><button type="button" onClick={onResetRanks}>{t.resetRanks}</button></p></div>
  </>
);
