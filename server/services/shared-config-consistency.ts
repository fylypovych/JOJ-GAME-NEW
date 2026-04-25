type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

type SyncCounts = {
  deck: number;
  legendaryDeck: number;
  rankTrack: number;
  rankDefinitions: number;
};

export type SharedConfigConsistencyDiagnostics = {
  ok: boolean;
  activeTemplateKey: string;
  activeRankSetKey: string;
  dbCounts: SyncCounts;
  jsonCounts: SyncCounts;
  mismatches: string[];
};

type SharedConfigSnapshot = {
  activeTemplateKey: string;
  activeRankSetKey: string;
  dbDeckIds: string[];
  dbLegendaryIds: string[];
  dbRankTrackIds: string[];
  dbRankIds: string[];
  jsonDeckIds: string[];
  jsonLegendaryIds: string[];
  jsonRankTrackIds: string[];
  jsonRankIds: string[];
  activeTemplateCount: number;
  activeRankSetCount: number;
};

const ensureStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
);

const readTemplateSectionIds = (
  payload: unknown,
  sectionKey: 'deck' | 'legendaryDeck' | 'rankTrack',
): string[] => {
  if (!payload || typeof payload !== 'object') return [];
  const doc = payload as Record<string, unknown>;
  const sectionRaw = doc[sectionKey];
  if (Array.isArray(sectionRaw)) {
    return sectionRaw
      .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>).id : null))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
  const legacyIdsKey = `${sectionKey}Ids`;
  return ensureStringArray(doc[legacyIdsKey]);
};

const readRankIds = (payload: unknown): string[] => {
  const ranksRaw = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && Array.isArray((payload as { ranks?: unknown[] }).ranks)
      ? (payload as { ranks: unknown[] }).ranks
      : []);
  return ranksRaw
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>).id : null))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
};

const compareOrderedIds = (label: string, dbIds: string[], jsonIds: string[], mismatches: string[]) => {
  if (dbIds.length !== jsonIds.length) {
    mismatches.push(`${label} id count mismatch: db=${dbIds.length} app_settings=${jsonIds.length}`);
  }
  if (dbIds.join('|') !== jsonIds.join('|')) {
    const dbOnly = dbIds.filter((id) => !jsonIds.includes(id));
    const jsonOnly = jsonIds.filter((id) => !dbIds.includes(id));
    const dbOnlyPreview = dbOnly.slice(0, 5).join(', ');
    const jsonOnlyPreview = jsonOnly.slice(0, 5).join(', ');
    mismatches.push(
      `${label} id sequence mismatch` +
      `${dbOnly.length > 0 ? `; missing in app_settings: [${dbOnlyPreview}${dbOnly.length > 5 ? ', ...' : ''}]` : ''}` +
      `${jsonOnly.length > 0 ? `; missing in db: [${jsonOnlyPreview}${jsonOnly.length > 5 ? ', ...' : ''}]` : ''}`,
    );
  }
};

export const buildSharedConfigConsistencyDiagnostics = (
  snapshot: SharedConfigSnapshot,
): SharedConfigConsistencyDiagnostics => {
  const mismatches: string[] = [];
  if (snapshot.activeTemplateCount !== 1) {
    mismatches.push(`Expected exactly 1 active deck template, got ${snapshot.activeTemplateCount}.`);
  }
  if (snapshot.activeRankSetCount !== 1) {
    mismatches.push(`Expected exactly 1 active rank set, got ${snapshot.activeRankSetCount}.`);
  }

  compareOrderedIds('deck', snapshot.dbDeckIds, snapshot.jsonDeckIds, mismatches);
  compareOrderedIds('legendaryDeck', snapshot.dbLegendaryIds, snapshot.jsonLegendaryIds, mismatches);
  compareOrderedIds('rankTrack', snapshot.dbRankTrackIds, snapshot.jsonRankTrackIds, mismatches);
  compareOrderedIds('rankDefinitions', snapshot.dbRankIds, snapshot.jsonRankIds, mismatches);

  const dbCounts: SyncCounts = {
    deck: snapshot.dbDeckIds.length,
    legendaryDeck: snapshot.dbLegendaryIds.length,
    rankTrack: snapshot.dbRankTrackIds.length,
    rankDefinitions: snapshot.dbRankIds.length,
  };
  const jsonCounts: SyncCounts = {
    deck: snapshot.jsonDeckIds.length,
    legendaryDeck: snapshot.jsonLegendaryIds.length,
    rankTrack: snapshot.jsonRankTrackIds.length,
    rankDefinitions: snapshot.jsonRankIds.length,
  };

  return {
    ok: mismatches.length === 0,
    activeTemplateKey: snapshot.activeTemplateKey,
    activeRankSetKey: snapshot.activeRankSetKey,
    dbCounts,
    jsonCounts,
    mismatches,
  };
};

const readSingleValue = async (db: Queryable, sql: string): Promise<string> => {
  const result = await db.query<{ value: unknown }>(sql);
  const value = result.rows[0]?.value;
  return typeof value === 'string' ? value : String(value ?? '');
};

const readJsonSetting = async (db: Queryable, key: string): Promise<unknown> => {
  const result = await db.query<{ value: unknown }>(
    'SELECT value FROM app_settings WHERE key = $1 LIMIT 1',
    [key],
  );
  return result.rows[0]?.value ?? null;
};

const readCardIds = async (db: Queryable, deckTarget: 'deck' | 'legendaryDeck' | 'rankTrack'): Promise<string[]> => {
  const result = await db.query<{ ids: unknown }>(
    `SELECT COALESCE(array_agg(COALESCE(e.card_id, '') ORDER BY e.sort_index), ARRAY[]::text[]) AS ids
     FROM deck_template_entries e
     JOIN deck_templates t ON t.id = e.deck_template_id
     WHERE t.is_active = true AND e.deck_target = $1`,
    [deckTarget],
  );
  return ensureStringArray(result.rows[0]?.ids);
};

const readRankIdsFromDb = async (db: Queryable): Promise<string[]> => {
  const result = await db.query<{ ids: unknown }>(
    `SELECT COALESCE(array_agg(d.rank_code ORDER BY d.sort_order), ARRAY[]::text[]) AS ids
     FROM rank_definitions d
     JOIN rank_sets r ON r.id = d.rank_set_id
     WHERE r.is_active = true`,
  );
  return ensureStringArray(result.rows[0]?.ids);
};

export const collectSharedConfigConsistencyDiagnostics = async (
  db: Queryable,
): Promise<SharedConfigConsistencyDiagnostics> => {
  const [
    activeTemplateCountRaw,
    activeRankSetCountRaw,
    activeTemplateKey,
    activeRankSetKey,
    dbDeckIds,
    dbLegendaryIds,
    dbRankTrackIds,
    dbRankIds,
    deckTemplateSetting,
    ranksSetting,
  ] = await Promise.all([
    readSingleValue(db, "SELECT count(*) AS value FROM deck_templates WHERE is_active = true"),
    readSingleValue(db, "SELECT count(*) AS value FROM rank_sets WHERE is_active = true"),
    readSingleValue(db, "SELECT COALESCE((SELECT template_key FROM deck_templates WHERE is_active = true ORDER BY updated_at DESC LIMIT 1), '') AS value"),
    readSingleValue(db, "SELECT COALESCE((SELECT rank_set_key FROM rank_sets WHERE is_active = true ORDER BY updated_at DESC LIMIT 1), '') AS value"),
    readCardIds(db, 'deck'),
    readCardIds(db, 'legendaryDeck'),
    readCardIds(db, 'rankTrack'),
    readRankIdsFromDb(db),
    readJsonSetting(db, 'shared_deck_template'),
    readJsonSetting(db, 'shared_ranks'),
  ]);

  const jsonDeckIds = readTemplateSectionIds(deckTemplateSetting, 'deck');
  const jsonLegendaryIds = readTemplateSectionIds(deckTemplateSetting, 'legendaryDeck');
  const jsonRankTrackIds = readTemplateSectionIds(deckTemplateSetting, 'rankTrack');
  const jsonRankIds = readRankIds(ranksSetting);

  return buildSharedConfigConsistencyDiagnostics({
    activeTemplateKey,
    activeRankSetKey,
    dbDeckIds,
    dbLegendaryIds,
    dbRankTrackIds,
    dbRankIds,
    jsonDeckIds,
    jsonLegendaryIds,
    jsonRankTrackIds,
    jsonRankIds,
    activeTemplateCount: Number.parseInt(activeTemplateCountRaw, 10) || 0,
    activeRankSetCount: Number.parseInt(activeRankSetCountRaw, 10) || 0,
  });
};

export const assertSharedConfigConsistency = async (db: Queryable): Promise<void> => {
  const diagnostics = await collectSharedConfigConsistencyDiagnostics(db);
  if (diagnostics.ok) return;
  throw new Error(
    `shared config consistency check failed: ${diagnostics.mismatches.join('; ')}`,
  );
};

