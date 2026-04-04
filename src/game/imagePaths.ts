export const CARD_ASSET_BASE_PATH = '/card-assets/';

export const normalizeImagePath = (input?: string): string | undefined => {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;

  const normalized = raw.replace(/\\/g, '/');
  if (/^(https?:\/\/|data:|blob:)/i.test(normalized)) return normalized;
  if (normalized.startsWith(CARD_ASSET_BASE_PATH)) return normalized;
  if (normalized.startsWith('/cards/')) return normalized.replace('/cards/', CARD_ASSET_BASE_PATH);
  if (normalized.startsWith('cards/')) return `/${normalized}`.replace('/cards/', CARD_ASSET_BASE_PATH);
  if (normalized.startsWith('/public/cards/')) return normalized.replace('/public/cards/', CARD_ASSET_BASE_PATH);
  if (normalized.startsWith('public/cards/')) return `/${normalized.replace(/^public\/cards\//, 'card-assets/')}`;
  if (normalized.startsWith('/public/card-assets/')) return normalized.replace('/public', '');
  if (normalized.startsWith('public/card-assets/')) return `/${normalized.replace(/^public\//, '')}`;
  if (/^[^/]+\.(png|webp|jpg|jpeg|gif|svg)$/i.test(normalized)) return `${CARD_ASSET_BASE_PATH}${normalized}`;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

