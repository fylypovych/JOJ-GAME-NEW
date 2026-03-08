import type { CardCategory, CardDefinition, EffectResource, RankDefinition, ResourceKey } from '../../game/types';
import type { CropDraft } from './types';

export const categories: CardCategory[] = ['LYAP', 'SCANDAL', 'SUPPORT', 'COMMAND', 'VVNZ'];
export const effectResourceKeys: EffectResource[] = ['time', 'reputation', 'discipline', 'documents', 'tech', 'rank'];
export const rankResourceKeys: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

export const zeroEffectValues = (): Record<EffectResource, number> => ({
  time: 0,
  reputation: 0,
  discipline: 0,
  documents: 0,
  tech: 0,
  rank: 0,
});

export const effectsToValues = (effects: CardDefinition['effects']): Record<EffectResource, number> => {
  const next = zeroEffectValues();
  (effects ?? []).forEach((effect) => {
    next[effect.resource] = effect.value;
  });
  return next;
};

export const valuesToEffects = (values: Record<EffectResource, number>): NonNullable<CardDefinition['effects']> =>
  effectResourceKeys.filter((key) => values[key] !== 0).map((key) => ({ resource: key, value: values[key] }));

export const blankCard = (): CardDefinition => ({
  id: '',
  title: '',
  category: 'SUPPORT',
  image: '',
});

export const cloneEditableRanks = (sharedRanks: RankDefinition[]): RankDefinition[] =>
  sharedRanks.map((row) => ({
    ...row,
    image: row.image ?? '',
    imageVariants: Array.isArray(row.imageVariants) ? [...row.imageVariants] : [],
    requirement: { ...row.requirement },
    cost: { ...row.cost },
    bonus: { ...row.bonus },
  }));

export const CARD_ASPECT_RATIO = 352 / 540;
export const MAX_CARD_UPLOAD_WIDTH = 1408;
export const MAX_CARD_UPLOAD_HEIGHT = 2160;
export const DEFAULT_UPLOAD_QUALITY = 0.88;

const clampPx = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const getAspectLockedCropRect = (draft: CropDraft, imageWidth: number, imageHeight: number) => {
  const topPx = clampPx(draft.topPx, 0, Math.max(0, imageHeight - 1));
  const rightPx = clampPx(draft.rightPx, 0, Math.max(0, imageWidth - 1));
  const bottomPx = clampPx(draft.bottomPx, 0, Math.max(0, imageHeight - 1));
  const leftPx = clampPx(draft.leftPx, 0, Math.max(0, imageWidth - 1));

  const availablePw = Math.max(1, imageWidth - leftPx - rightPx);
  const availablePh = Math.max(1, imageHeight - topPx - bottomPx);
  let cropPw = availablePw;
  let cropPh = availablePh;
  if (cropPw / cropPh > CARD_ASPECT_RATIO) cropPw = Math.max(1, Math.floor(cropPh * CARD_ASPECT_RATIO));
  else cropPh = Math.max(1, Math.floor(cropPw / CARD_ASPECT_RATIO));

  const sx = leftPx + Math.floor((availablePw - cropPw) / 2);
  const sy = topPx + Math.floor((availablePh - cropPh) / 2);
  const maxSw = Math.max(1, imageWidth - sx);
  const maxSh = Math.max(1, imageHeight - sy);
  const sw = Math.max(1, Math.min(maxSw, cropPw));
  const sh = Math.max(1, Math.min(maxSh, cropPh));
  return { sx, sy, sw, sh };
};
