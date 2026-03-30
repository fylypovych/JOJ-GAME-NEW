import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type BugReportStatus = 'new' | 'resolved' | 'closed';

export type BugReportRecord = {
  id: string;
  status: BugReportStatus;
  description: string;
  screenshotFileName: string | null;
  screenshotMime: string | null;
  pageUrl: string;
  matchID: string | null;
  playerID: string | null;
  playerName: string | null;
  spectator: boolean;
  uiVariant: 'v1' | 'v2' | 'v3' | 'unknown';
  lang: 'uk' | 'en';
  userAgent: string;
  sourceIp: string;
  createdAt: string;
  updatedAt: string;
  submittedBy: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
  };
};

const isBugReportStatus = (value: string): value is BugReportStatus =>
  value === 'new' || value === 'resolved' || value === 'closed';

const normalizeUiVariant = (value: string | null | undefined): BugReportRecord['uiVariant'] =>
  value === 'v1' || value === 'v2' || value === 'v3' ? value : 'unknown';

const normalizeLang = (value: string | null | undefined): BugReportRecord['lang'] =>
  value === 'en' ? 'en' : 'uk';

const normalizeString = (value: unknown, maxLen = 5000): string =>
  String(typeof value === 'string' ? value : '').trim().slice(0, maxLen);

const normalizeNullableString = (value: unknown, maxLen = 5000): string | null => {
  const next = normalizeString(value, maxLen);
  return next ? next : null;
};

const parseStore = async (storePath: string): Promise<BugReportRecord[]> => {
  try {
    const raw = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is BugReportRecord => {
      if (!row || typeof row !== 'object') return false;
      const candidate = row as Partial<BugReportRecord>;
      return typeof candidate.id === 'string'
        && typeof candidate.description === 'string'
        && typeof candidate.createdAt === 'string'
        && typeof candidate.updatedAt === 'string'
        && isBugReportStatus(String(candidate.status ?? ''));
    });
  } catch {
    return [];
  }
};

const mimeToExt = (mime: string) => {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  throw new Error('Unsupported screenshot format.');
};

export const createBugReportStore = (args: {
  storePath: string;
  imagesDir: string;
}) => {
  const { storePath, imagesDir } = args;
  let writeChain = Promise.resolve();

  const withStore = async <T>(mutate: (rows: BugReportRecord[]) => Promise<T>) => {
    const current = writeChain;
    let release!: () => void;
    writeChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await current;
    try {
      await mkdir(path.dirname(storePath), { recursive: true });
      await mkdir(imagesDir, { recursive: true });
      const rows = await parseStore(storePath);
      const result = await mutate(rows);
      await writeFile(storePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
      return result;
    } finally {
      release();
    }
  };

  return {
    create: async (input: {
      description: string;
      screenshot?: { mime: string; buffer: Buffer } | null;
      pageUrl?: string;
      matchID?: string | null;
      playerID?: string | null;
      playerName?: string | null;
      spectator?: boolean;
      uiVariant?: string | null;
      lang?: string | null;
      userAgent?: string | null;
      sourceIp?: string | null;
      submittedBy?: { userId?: string | null; username?: string | null; displayName?: string | null } | null;
    }) => withStore(async (rows) => {
      const now = new Date().toISOString();
      let screenshotFileName: string | null = null;
      let screenshotMime: string | null = null;
      if (input.screenshot) {
        const ext = mimeToExt(input.screenshot.mime);
        screenshotFileName = `${Date.now()}-${randomUUID()}.${ext}`;
        screenshotMime = input.screenshot.mime;
        await writeFile(path.join(imagesDir, screenshotFileName), input.screenshot.buffer);
      }
      const record: BugReportRecord = {
        id: randomUUID(),
        status: 'new',
        description: normalizeString(input.description, 10_000),
        screenshotFileName,
        screenshotMime,
        pageUrl: normalizeString(input.pageUrl, 1000),
        matchID: normalizeNullableString(input.matchID, 200),
        playerID: normalizeNullableString(input.playerID, 200),
        playerName: normalizeNullableString(input.playerName, 200),
        spectator: input.spectator === true,
        uiVariant: normalizeUiVariant(input.uiVariant),
        lang: normalizeLang(input.lang),
        userAgent: normalizeString(input.userAgent, 1000),
        sourceIp: normalizeString(input.sourceIp, 200),
        createdAt: now,
        updatedAt: now,
        submittedBy: {
          userId: normalizeNullableString(input.submittedBy?.userId, 200),
          username: normalizeNullableString(input.submittedBy?.username, 200),
          displayName: normalizeNullableString(input.submittedBy?.displayName, 200),
        },
      };
      rows.unshift(record);
      return record;
    }),
    list: async () => {
      const rows = await parseStore(storePath);
      return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    getById: async (id: string) => {
      const rows = await parseStore(storePath);
      return rows.find((row) => row.id === id) ?? null;
    },
    updateStatus: async (id: string, status: BugReportStatus) => withStore(async (rows) => {
      const target = rows.find((row) => row.id === id) ?? null;
      if (!target) return null;
      target.status = status;
      target.updatedAt = new Date().toISOString();
      return target;
    }),
    getImagePathById: async (id: string) => {
      const row = (await parseStore(storePath)).find((item) => item.id === id) ?? null;
      if (!row?.screenshotFileName || !row.screenshotMime) return null;
      return {
        absPath: path.join(imagesDir, row.screenshotFileName),
        mime: row.screenshotMime,
      };
    },
  };
};
