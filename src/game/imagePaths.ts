export const CARD_ASSET_BASE_PATH = '/card-assets/';

// Module folder mapping for legacy card ID patterns
const MODULE_FOLDER_BY_PREFIX: Record<string, string> = {
  'lyap-': '2026.LYAP.STARTER',
  'scandal-': '2026.SCANDAL.STARTER',
  'support-': '2026.SUPPORT.STARTER',
  'command-': '2026.COMMAND.STARTER',
  'legendary-': '2026.LEGENDARY.MODULE',
  'vvnz-': '2026.VVNZ.MODULE',
  'rank-': '2026.VVNZ.MODULE',
};

const resolveModuleFolder = (filename: string): string | undefined => {
  for (const [prefix, folder] of Object.entries(MODULE_FOLDER_BY_PREFIX)) {
    if (filename.startsWith(prefix)) return folder;
  }
  return undefined;
};

export const normalizeImagePath = (input?: string): string | undefined => {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;

  const normalized = raw.replace(/\\/g, '/');
  if (/^(https?:\/\/|data:|blob:)/i.test(normalized)) return normalized;

  // Handle paths already in /card-assets/ but missing module folder
  if (normalized.startsWith(CARD_ASSET_BASE_PATH)) {
    const afterBase = normalized.slice(CARD_ASSET_BASE_PATH.length);
    // If there's no subfolder (no slash in the remaining path), try to resolve module folder
    if (!afterBase.includes('/')) {
      const moduleFolder = resolveModuleFolder(afterBase);
      if (moduleFolder) {
        return `${CARD_ASSET_BASE_PATH}${moduleFolder}/${afterBase}`;
      }
    }
    return normalized;
  }

  // Handle legacy /cards/ paths with module folder resolution
  if (normalized.startsWith('/cards/') || normalized.startsWith('cards/')) {
    const withoutPrefix = normalized.replace(/^\/?cards\//, '');
    const filename = withoutPrefix.split('/').pop() || withoutPrefix;
    const moduleFolder = resolveModuleFolder(filename);
    if (moduleFolder) {
      return `${CARD_ASSET_BASE_PATH}${moduleFolder}/${filename}`;
    }
    return `${CARD_ASSET_BASE_PATH}${withoutPrefix}`;
  }

  if (normalized.startsWith('/public/cards/')) return normalized.replace('/public/cards/', CARD_ASSET_BASE_PATH);
  if (normalized.startsWith('public/cards/')) return `/${normalized.replace(/^public\/cards\//, 'card-assets/')}`;
  if (normalized.startsWith('/public/card-assets/')) return normalized.replace('/public', '');
  if (normalized.startsWith('public/card-assets/')) return `/${normalized.replace(/^public\//, '')}`;

  // Handle bare filenames with module folder resolution
  if (/^[^/]+\.(png|webp|jpg|jpeg|gif|svg)$/i.test(normalized)) {
    const moduleFolder = resolveModuleFolder(normalized);
    if (moduleFolder) {
      return `${CARD_ASSET_BASE_PATH}${moduleFolder}/${normalized}`;
    }
    return `${CARD_ASSET_BASE_PATH}${normalized}`;
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

