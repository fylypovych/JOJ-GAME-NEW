export const normalizeImagePath = (input?: string): string | undefined => {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;

  const normalized = raw.replace(/\\/g, '/');
  if (/^(https?:\/\/|data:|blob:)/i.test(normalized)) return normalized;
  if (normalized.startsWith('/cards/')) return normalized;
  if (normalized.startsWith('cards/')) return `/${normalized}`;
  if (normalized.startsWith('/public/cards/')) return normalized.replace('/public', '');
  if (normalized.startsWith('public/cards/')) return `/${normalized.replace(/^public\//, '')}`;
  if (/^[^/]+\.(png|webp|jpg|jpeg|gif|svg)$/i.test(normalized)) return `/cards/${normalized}`;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

