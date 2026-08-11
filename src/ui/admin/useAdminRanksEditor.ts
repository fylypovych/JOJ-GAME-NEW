import { useEffect, useState } from 'react';
import { parseImportedRanksPayload, serializeSharedRanksDocument } from '../../game/sharedConfigSchema';
import type { RankDefinition } from '../../game/types';
import { cloneEditableRanks } from './helpers';

type Params = {
  lang: 'uk' | 'en';
  t: {
    invalidJson: string;
    ranksJsonArrayError: string;
    ranksSchemaError: string;
    ranksImportSuccess: string;
  };
  sharedRanks: RankDefinition[];
  onUpdateRanks: (nextRanks: RankDefinition[]) => boolean;
  optimizeBlobForUpload: (
    blob: Blob,
    filename: string,
    options?: { maxWidth?: number; maxHeight?: number; quality?: number },
  ) => Promise<{ dataUrl: string; filename: string } | null>;
  uploadDataUrl: (filename: string, dataUrl: string, cardId?: string) => Promise<string | null>;
};

const createAdminRanksEditorErrors = (lang: 'uk' | 'en') => ({
  processImageFile: lang === 'uk' ? 'Не вдалося обробити файл зображення' : 'Failed to process image file',
});

export const useAdminRanksEditor = ({
  lang,
  t,
  sharedRanks,
  onUpdateRanks,
  optimizeBlobForUpload,
  uploadDataUrl,
}: Params) => {
  const rankEditorErrors = createAdminRanksEditorErrors(lang);
  const [editableRanks, setEditableRanks] = useState<RankDefinition[]>(() => cloneEditableRanks(sharedRanks));
  const [rankDraft, setRankDraft] = useState<RankDefinition>({
    id: '',
    name: '',
    image: '',
    imageVariants: [],
    requirement: {},
    cost: {},
    bonus: {},
  });
  const [ranksJson, setRanksJson] = useState<string>(() => JSON.stringify(serializeSharedRanksDocument(sharedRanks), null, 2));
  const [ranksImportError, setRanksImportError] = useState<string>('');
  const [ranksImportStatus, setRanksImportStatus] = useState<string>('');
  const hasUnsavedRankChanges = JSON.stringify(editableRanks) !== JSON.stringify(cloneEditableRanks(sharedRanks));

  useEffect(() => {
    setRanksJson(JSON.stringify(serializeSharedRanksDocument(sharedRanks), null, 2));
    setEditableRanks(cloneEditableRanks(sharedRanks));
  }, [sharedRanks]);

  const updateRankAt = (index: number, updater: (rank: RankDefinition) => RankDefinition) => {
    setEditableRanks((prev) => prev.map((rank, i) => (i === index ? updater({
      ...rank,
      imageVariants: Array.isArray(rank.imageVariants) ? [...rank.imageVariants] : [],
      requirement: { ...rank.requirement },
      cost: { ...rank.cost },
      bonus: { ...rank.bonus },
    }) : rank)));
    setRanksImportStatus('');
    setRanksImportError('');
  };

  const attachRankImageFile = async (index: number, rankId: string, file: File | null) => {
    if (!file) return;
    const optimized = await optimizeBlobForUpload(file, file.name, { maxWidth: 1600, maxHeight: 2400, quality: 0.85 });
    if (!optimized) {
      setRanksImportError(rankEditorErrors.processImageFile);
      return;
    }
    const path = await uploadDataUrl(optimized.filename, optimized.dataUrl, rankId || 'rank');
    if (!path) return;
    updateRankAt(index, (row) => ({ ...row, image: path }));
    setRanksImportError('');
    setRanksImportStatus('');
  };

  const attachRankVariantImageFile = async (index: number, rankId: string, file: File | null) => {
    if (!file) return;
    const optimized = await optimizeBlobForUpload(file, file.name, { maxWidth: 1600, maxHeight: 2400, quality: 0.85 });
    if (!optimized) {
      setRanksImportError(rankEditorErrors.processImageFile);
      return;
    }
    const path = await uploadDataUrl(optimized.filename, optimized.dataUrl, `${rankId || 'rank'}-variant`);
    if (!path) return;
    updateRankAt(index, (row) => ({
      ...row,
      imageVariants: Array.from(new Set([...(row.imageVariants ?? []), path])),
    }));
    setRanksImportError('');
    setRanksImportStatus('');
  };

  const attachRankDraftImageFile = async (file: File | null) => {
    if (!file) return;
    const optimized = await optimizeBlobForUpload(file, file.name, { maxWidth: 1600, maxHeight: 2400, quality: 0.85 });
    if (!optimized) {
      setRanksImportError(rankEditorErrors.processImageFile);
      return;
    }
    const path = await uploadDataUrl(optimized.filename, optimized.dataUrl, rankDraft.id || 'rank-draft');
    if (!path) return;
    setRankDraft((prev) => ({ ...prev, image: path }));
    setRanksImportError('');
    setRanksImportStatus('');
  };

  const attachRankDraftVariantImageFile = async (file: File | null) => {
    if (!file) return;
    const optimized = await optimizeBlobForUpload(file, file.name, { maxWidth: 1600, maxHeight: 2400, quality: 0.85 });
    if (!optimized) {
      setRanksImportError(rankEditorErrors.processImageFile);
      return;
    }
    const path = await uploadDataUrl(optimized.filename, optimized.dataUrl, `${rankDraft.id || 'rank-draft'}-variant`);
    if (!path) return;
    setRankDraft((prev) => ({
      ...prev,
      imageVariants: Array.from(new Set([...(prev.imageVariants ?? []), path])),
    }));
    setRanksImportError('');
    setRanksImportStatus('');
  };

  const saveRanks = () => {
    const next = editableRanks.map((row) => ({
      ...row,
      imageVariants: Array.isArray(row.imageVariants)
        ? row.imageVariants.map((path) => path.trim()).filter(Boolean)
        : [],
      requirement: { ...row.requirement },
      cost: { ...row.cost },
      bonus: { ...row.bonus },
    }));
    const ok = onUpdateRanks(next);
    if (!ok) {
      setRanksImportError(t.ranksSchemaError);
      return;
    }
    setRanksImportError('');
    setRanksImportStatus(lang === 'uk' ? 'Зміни звань збережено.' : 'Rank changes saved.');
  };

  const addRank = () => {
    const id = rankDraft.id.trim();
    const name = rankDraft.name.trim();
    if (!id || !name) return;
    const next: RankDefinition[] = [
      ...editableRanks.map((row) => ({
        ...row,
        imageVariants: Array.isArray(row.imageVariants) ? [...row.imageVariants] : [],
        requirement: { ...row.requirement },
        cost: { ...row.cost },
        bonus: { ...row.bonus },
      })),
      {
        id,
        name,
        image: rankDraft.image?.trim() || undefined,
        imageVariants: (rankDraft.imageVariants ?? []).map((path) => path.trim()).filter(Boolean),
        requirement: { ...rankDraft.requirement },
        cost: { ...rankDraft.cost },
        bonus: { ...rankDraft.bonus },
      },
    ];
    setEditableRanks(next);
    setRanksImportStatus('');
    setRanksImportError('');
    setRankDraft({ id: '', name: '', image: '', imageVariants: [], requirement: {}, cost: {}, bonus: {} });
  };

  const removeRankAt = (index: number) => {
    if (editableRanks.length <= 1) return;
    setEditableRanks((prev) => prev.filter((_, i) => i !== index));
    setRanksImportStatus('');
    setRanksImportError('');
  };

  const exportRanksToFile = () => {
    const json = JSON.stringify(serializeSharedRanksDocument(editableRanks), null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `joj-ranks-${stamp}.json`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setRanksJson(json);
  };

  const importRanks = () => {
    setRanksImportError('');
    setRanksImportStatus('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(ranksJson);
    } catch {
      setRanksImportError(t.invalidJson);
      return;
    }
    const ranks = parseImportedRanksPayload(parsed);
    if (!ranks) {
      setRanksImportError(t.ranksJsonArrayError);
      return;
    }
    const ok = onUpdateRanks(ranks);
    if (!ok) {
      setRanksImportError(t.ranksSchemaError);
      return;
    }
    setRanksImportStatus(`${t.ranksImportSuccess} ${ranks.length}.`);
  };

  const importRanksFromFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next = typeof reader.result === 'string' ? reader.result : '';
      setRanksJson(next);
      setRanksImportError('');
      setRanksImportStatus('');
    };
    reader.readAsText(file);
  };

  return {
    editableRanks,
    hasUnsavedRankChanges,
    rankDraft,
    setRankDraft,
    ranksJson,
    setRanksJson,
    ranksImportError,
    setRanksImportError,
    ranksImportStatus,
    setRanksImportStatus,
    updateRankAt,
    attachRankImageFile,
    attachRankVariantImageFile,
    attachRankDraftImageFile,
    attachRankDraftVariantImageFile,
    saveRanks,
    addRank,
    removeRankAt,
    exportRanksToFile,
    importRanks,
    importRanksFromFile,
  };
};
