import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

type StorageMode = 'file' | 'postgres';
type DbConnDraft = {
  host: string;
  port: string;
  database: string;
  user: string;
  password?: string;
  sslMode?: 'disable' | 'require';
};

type SharedConfigStoreDeps = {
  templatePath: string;
  ranksPath: string;
  exportSharedDeckTemplateJson: () => string;
  importSharedDeckTemplateJson: (text: string) => { ok: true } | { ok: false; error: string };
  getSharedRanks: () => unknown;
  setSharedRanks: (value: any) => boolean;
  resetSharedRanks: () => void;
  storageMode?: StorageMode;
  databaseUrl?: string;
};

type DeckTemplateShape = {
  deck: unknown[];
  legendaryDeck: unknown[];
  rankTrack: unknown[];
  deckBackImage?: string;
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlNullableString = (value?: string | null) => (value ? sqlString(value) : 'NULL');
const sqlJson = (value: unknown) => `${sqlString(JSON.stringify(value))}::jsonb`;
const buildDatabaseUrlFromDraft = (draft: DbConnDraft) => {
  const protocol = 'postgresql://';
  const user = encodeURIComponent(draft.user.trim());
  const password = draft.password ? `:${encodeURIComponent(draft.password)}` : '';
  const host = draft.host.trim();
  const port = draft.port.trim();
  const database = encodeURIComponent(draft.database.trim());
  const sslMode = draft.sslMode === 'require' ? 'require' : 'disable';
  return `${protocol}${user}${password}@${host}:${port}/${database}?sslmode=${sslMode}`;
};

const runPsql = async (databaseUrl: string, sql: string): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> => {
  return new Promise((resolve) => {
    const child = spawn('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => resolve({ ok: false, error: String(error) }));
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, stdout });
      else resolve({ ok: false, error: (stderr || stdout || `psql exit code ${code}`).trim() });
    });
  });
};

const ensureArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const createSharedConfigStore = ({
  templatePath,
  ranksPath,
  exportSharedDeckTemplateJson,
  importSharedDeckTemplateJson,
  getSharedRanks,
  setSharedRanks,
  resetSharedRanks,
  storageMode = 'file',
  databaseUrl = '',
}: SharedConfigStoreDeps) => {
  const saveTemplateToDisk = async () => {
    await mkdir(path.dirname(templatePath), { recursive: true });
    await writeFile(templatePath, exportSharedDeckTemplateJson(), 'utf8');
  };

  const saveRanksToDisk = async () => {
    await mkdir(path.dirname(ranksPath), { recursive: true });
    await writeFile(ranksPath, JSON.stringify(getSharedRanks(), null, 2), 'utf8');
  };

  const loadTemplateFromDisk = async () => {
    try {
      const raw = await readFile(templatePath, 'utf8');
      const result = importSharedDeckTemplateJson(raw);
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[template] invalid saved template, fallback to default: ${result.error}`);
        await saveTemplateToDisk();
      }
    } catch {
      await saveTemplateToDisk();
    }
  };

  const loadRanksFromDisk = async () => {
    try {
      const raw = await readFile(ranksPath, 'utf8');
      const parsed = JSON.parse(raw);
      const ok = setSharedRanks(parsed);
      if (!ok) {
        // eslint-disable-next-line no-console
        console.warn('[ranks] invalid saved ranks, fallback to default');
        resetSharedRanks();
        await saveRanksToDisk();
      }
    } catch {
      await saveRanksToDisk();
    }
  };

  const saveTemplateToPostgres = async () => {
    return saveTemplateToPostgresWithUrl(databaseUrl);
  };

  const saveTemplateToPostgresWithUrl = async (targetDatabaseUrl: string) => {
    if (!targetDatabaseUrl) throw new Error('DATABASE_URL is required for postgres sync');
    const parsed = JSON.parse(exportSharedDeckTemplateJson()) as Partial<DeckTemplateShape>;
    const deck = ensureArray(parsed.deck);
    const legendaryDeck = ensureArray(parsed.legendaryDeck);
    const rankTrack = ensureArray(parsed.rankTrack);
    const payload: DeckTemplateShape = {
      deck,
      legendaryDeck,
      rankTrack,
      deckBackImage: typeof parsed.deckBackImage === 'string' ? parsed.deckBackImage : undefined,
    };

    const rows: string[] = [];
    const pushRows = (deckTarget: 'deck' | 'legendaryDeck' | 'rankTrack', cards: unknown[]) => {
      cards.forEach((card, index) => {
        const cardObj = (card && typeof card === 'object') ? (card as Record<string, unknown>) : {};
        const cardId = typeof cardObj.id === 'string' ? cardObj.id : null;
        rows.push(`(
          (SELECT id FROM deck_templates WHERE template_key='shared-default' LIMIT 1),
          ${sqlString(deckTarget)},
          ${sqlNullableString(cardId)},
          ${index},
          ${sqlJson(card)}
        )`);
      });
    };
    pushRows('deck', deck);
    pushRows('legendaryDeck', legendaryDeck);
    pushRows('rankTrack', rankTrack);

    const sql = `
BEGIN;
INSERT INTO deck_templates (template_key, title, deck_back_image_path, payload, is_active)
VALUES ('shared-default', 'Shared Deck Template', ${sqlNullableString(payload.deckBackImage)}, ${sqlJson(payload)}, true)
ON CONFLICT (template_key) DO UPDATE
SET title = EXCLUDED.title,
    deck_back_image_path = EXCLUDED.deck_back_image_path,
    payload = EXCLUDED.payload,
    is_active = true,
    updated_at = now();
UPDATE deck_templates SET is_active = false WHERE template_key <> 'shared-default' AND is_active = true;
DELETE FROM deck_template_entries WHERE deck_template_id = (SELECT id FROM deck_templates WHERE template_key='shared-default' LIMIT 1);
${rows.length > 0 ? `
INSERT INTO deck_template_entries (deck_template_id, deck_target, card_id, sort_index, card_snapshot)
VALUES ${rows.join(',\n')};` : ''}
COMMIT;`;

    const result = await runPsql(targetDatabaseUrl, sql);
    if (!result.ok) throw new Error(result.error);
  };

  const saveRanksToPostgres = async () => {
    return saveRanksToPostgresWithUrl(databaseUrl);
  };

  const saveRanksToPostgresWithUrl = async (targetDatabaseUrl: string) => {
    if (!targetDatabaseUrl) throw new Error('DATABASE_URL is required for postgres sync');
    const ranksRaw = getSharedRanks();
    const ranks = Array.isArray(ranksRaw) ? ranksRaw : [];
    const rows: string[] = [];
    ranks.forEach((rank, index) => {
      const row = (rank && typeof rank === 'object') ? (rank as Record<string, unknown>) : {};
      const id = typeof row.id === 'string' ? row.id : `rank-${index}`;
      const name = typeof row.name === 'string' ? row.name : id;
      const requirements = row.requirement && typeof row.requirement === 'object'
        ? row.requirement
        : (row.requirements && typeof row.requirements === 'object' ? row.requirements : {});
      const cost = row.cost && typeof row.cost === 'object' ? row.cost : {};
      const bonus = row.bonus && typeof row.bonus === 'object' ? row.bonus : {};
      const image = typeof row.image === 'string' ? row.image : null;
      rows.push(`(
        (SELECT id FROM rank_sets WHERE rank_set_key='shared-default' LIMIT 1),
        ${sqlString(id)},
        ${sqlString(name)},
        ${index},
        ${sqlJson(requirements)},
        ${sqlJson(cost)},
        ${sqlJson(bonus)},
        ${sqlNullableString(image)},
        ${sqlJson({ source: 'shared-ranks' })}
      )`);
    });

    const sql = `
BEGIN;
INSERT INTO rank_sets (rank_set_key, title, payload, is_active)
VALUES ('shared-default', 'Shared Ranks', ${sqlJson(ranks)}, true)
ON CONFLICT (rank_set_key) DO UPDATE
SET title = EXCLUDED.title,
    payload = EXCLUDED.payload,
    is_active = true,
    updated_at = now();
UPDATE rank_sets SET is_active = false WHERE rank_set_key <> 'shared-default' AND is_active = true;
DELETE FROM rank_definitions WHERE rank_set_id = (SELECT id FROM rank_sets WHERE rank_set_key='shared-default' LIMIT 1);
${rows.length > 0 ? `
INSERT INTO rank_definitions (
  rank_set_id, rank_code, display_name, sort_order, requirements, promotion_cost, bonus, image_path, metadata
)
VALUES ${rows.join(',\n')};` : ''}
COMMIT;`;

    const result = await runPsql(targetDatabaseUrl, sql);
    if (!result.ok) throw new Error(result.error);
  };

  const loadTemplateFromPostgres = async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required for STORAGE_MODE=postgres');
    const sql = `
SELECT COALESCE(payload::text, '')
FROM deck_templates
WHERE is_active = true
ORDER BY updated_at DESC, created_at DESC
LIMIT 1;`;
    const result = await runPsql(databaseUrl, sql);
    if (!result.ok) throw new Error(result.error);
    const raw = result.stdout.trim();
    if (!raw) {
      await saveTemplateToPostgres();
      return;
    }
    const parsedText = raw;
    const importResult = importSharedDeckTemplateJson(parsedText);
    if (!importResult.ok) {
      throw new Error(`invalid template payload in postgres: ${importResult.error}`);
    }
  };

  const loadRanksFromPostgres = async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required for STORAGE_MODE=postgres');
    const sql = `
SELECT COALESCE(payload::text, '')
FROM rank_sets
WHERE is_active = true
ORDER BY updated_at DESC, created_at DESC
LIMIT 1;`;
    const result = await runPsql(databaseUrl, sql);
    if (!result.ok) throw new Error(result.error);
    const raw = result.stdout.trim();
    if (!raw) {
      await saveRanksToPostgres();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`invalid ranks JSON in postgres: ${String(error)}`);
    }
    const ok = setSharedRanks(parsed);
    if (!ok) {
      throw new Error('invalid ranks schema in postgres payload');
    }
  };

  const saveTemplate = storageMode === 'postgres'
    ? async () => {
      await saveTemplateToPostgres();
      await saveTemplateToDisk();
    }
    : saveTemplateToDisk;

  const saveRanks = storageMode === 'postgres'
    ? async () => {
      await saveRanksToPostgres();
      await saveRanksToDisk();
    }
    : saveRanksToDisk;

  const loadTemplate = storageMode === 'postgres'
    ? async () => {
      try {
        await loadTemplateFromPostgres();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[template] postgres load failed, fallback to disk: ${String(error)}`);
        await loadTemplateFromDisk();
        await saveTemplateToPostgresWithUrl(databaseUrl).catch(() => undefined);
      }
    }
    : loadTemplateFromDisk;

  const loadRanks = storageMode === 'postgres'
    ? async () => {
      try {
        await loadRanksFromPostgres();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[ranks] postgres load failed, fallback to disk: ${String(error)}`);
        await loadRanksFromDisk();
        await saveRanksToPostgresWithUrl(databaseUrl).catch(() => undefined);
      }
    }
    : loadRanksFromDisk;

  return {
    saveTemplateToDisk: saveTemplate,
    saveRanksToDisk: saveRanks,
    loadTemplateFromDisk: loadTemplate,
    loadRanksFromDisk: loadRanks,
    syncCurrentJsonToPostgres: async (draft?: DbConnDraft) => {
      const targetUrl = draft ? buildDatabaseUrlFromDraft(draft) : databaseUrl;
      if (!targetUrl) {
        throw new Error('PostgreSQL connection is not configured');
      }
      await saveTemplateToPostgresWithUrl(targetUrl);
      await saveRanksToPostgresWithUrl(targetUrl);
    },
  };
};
