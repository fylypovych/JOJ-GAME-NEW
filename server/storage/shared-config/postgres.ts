import type { PostgresConnDraft } from '../../db/psql';
import { buildPostgresUrlFromDraft, runPsqlSql } from '../../db/psql';
import type { SharedConfigCoreDeps } from './types';

type DeckTemplateShape = {
  kind?: string;
  version?: number;
  catalog?: unknown[];
  deck: unknown[];
  legendaryDeck: unknown[];
  rankTrack: unknown[];
  deckBackImage?: string;
  modules?: unknown[];
  gameSetup?: unknown;
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlNullableString = (value?: string | null) => (value ? sqlString(value) : 'NULL');
const sqlJson = (value: unknown) => `${sqlString(JSON.stringify(value))}::jsonb`;
const ensureArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const createPostgresSharedConfigStore = (
  deps: SharedConfigCoreDeps & { databaseUrl: string },
) => {
  const {
    exportSharedDeckTemplateJson,
    exportSharedRanksJson,
    getCardCatalog,
    importSharedDeckTemplateJson,
    importSharedRanksJson,
  } = deps;

  const saveTemplateToPostgresWithUrl = async (targetDatabaseUrl: string) => {
    if (!targetDatabaseUrl) throw new Error('DATABASE_URL is required for postgres sync');
    const parsed = JSON.parse(exportSharedDeckTemplateJson()) as Partial<DeckTemplateShape>;
    const deck = ensureArray(parsed.deck);
    const legendaryDeck = ensureArray(parsed.legendaryDeck);
    const rankTrack = ensureArray(parsed.rankTrack);
    const catalog = ensureArray(parsed.catalog ?? getCardCatalog());
    const payload: DeckTemplateShape = {
      kind: typeof parsed.kind === 'string' ? parsed.kind : undefined,
      version: typeof parsed.version === 'number' ? parsed.version : undefined,
      catalog,
      deck,
      legendaryDeck,
      rankTrack,
      deckBackImage: typeof parsed.deckBackImage === 'string' ? parsed.deckBackImage : undefined,
      modules: ensureArray(parsed.modules),
      gameSetup: parsed.gameSetup,
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

    const cardCatalogRows = catalog.map((card) => {
      const cardObj = (card && typeof card === 'object') ? (card as Record<string, unknown>) : {};
      const cardId = typeof cardObj.id === 'string' ? cardObj.id : '';
      if (!cardId) return '';
      const title = typeof cardObj.title === 'string' ? cardObj.title : cardId;
      const category = typeof cardObj.category === 'string' ? cardObj.category : 'SUPPORT';
      const imagePath = typeof cardObj.image === 'string' ? cardObj.image : null;
      const flavor = typeof cardObj.flavor === 'string' ? cardObj.flavor : null;
      const effects = Array.isArray(cardObj.effects) ? cardObj.effects : [];
      const tags = Array.isArray(cardObj.tags) ? cardObj.tags : [];
      return `(
        ${sqlString(cardId)},
        ${sqlString(title)},
        ${sqlString(category)},
        ${sqlNullableString(imagePath)},
        ${sqlNullableString(flavor)},
        ${sqlJson(effects)},
        ${sqlJson(tags)},
        ${sqlJson(cardObj)}
      )`;
    }).filter(Boolean);

    const sql = `
BEGIN;
INSERT INTO app_settings (key, value, updated_by)
VALUES ('shared_deck_template', ${sqlJson(payload)}, 'shared-config-postgres')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
INSERT INTO deck_templates (template_key, title, deck_back_image_path, payload, is_active)
VALUES ('shared-default', 'Shared Deck Template', ${sqlNullableString(payload.deckBackImage)}, ${sqlJson(payload)}, true)
ON CONFLICT (template_key) DO UPDATE
SET title = EXCLUDED.title,
    deck_back_image_path = EXCLUDED.deck_back_image_path,
    payload = EXCLUDED.payload,
    is_active = true,
    updated_at = now();
UPDATE deck_templates SET is_active = false WHERE template_key <> 'shared-default' AND is_active = true;
${cardCatalogRows.length > 0 ? `
INSERT INTO card_catalog (id, title, category, image_path, flavor, effects, tags, metadata)
VALUES ${cardCatalogRows.join(',\n')}
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    category = EXCLUDED.category,
    image_path = EXCLUDED.image_path,
    flavor = EXCLUDED.flavor,
    effects = EXCLUDED.effects,
    tags = EXCLUDED.tags,
    metadata = EXCLUDED.metadata,
    updated_at = now();` : ''}
${rows.length > 0 ? `
INSERT INTO deck_template_entries (deck_template_id, deck_target, card_id, sort_index, card_snapshot)
VALUES ${rows.join(',\n')}
ON CONFLICT (deck_template_id, deck_target, sort_index) DO UPDATE
SET card_id = EXCLUDED.card_id,
    card_snapshot = EXCLUDED.card_snapshot,
    updated_at = now();` : ''}
COMMIT;`;

    const result = await runPsqlSql(targetDatabaseUrl, sql);
    if (!result.ok) throw new Error(result.error);
  };

  const saveRanksToPostgresWithUrl = async (targetDatabaseUrl: string) => {
    if (!targetDatabaseUrl) throw new Error('DATABASE_URL is required for postgres sync');
    const ranksPayload = exportSharedRanksJson();
    const parsedPayload = JSON.parse(ranksPayload) as { ranks?: unknown[] };
    const ranks = Array.isArray(parsedPayload.ranks) ? parsedPayload.ranks : [];
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
INSERT INTO app_settings (key, value, updated_by)
VALUES ('shared_ranks', ${sqlJson(parsedPayload)}, 'shared-config-postgres')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
INSERT INTO rank_sets (rank_set_key, title, payload, is_active)
VALUES ('shared-default', 'Shared Ranks', ${sqlJson(parsedPayload)}, true)
ON CONFLICT (rank_set_key) DO UPDATE
SET title = EXCLUDED.title,
    payload = EXCLUDED.payload,
    is_active = true,
    updated_at = now();
UPDATE rank_sets SET is_active = false WHERE rank_set_key <> 'shared-default' AND is_active = true;
${rows.length > 0 ? `
INSERT INTO rank_definitions (
  rank_set_id, rank_code, display_name, sort_order, requirements, promotion_cost, bonus, image_path, metadata
)
VALUES ${rows.join(',\n')}
ON CONFLICT (rank_set_id, rank_code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    sort_order = EXCLUDED.sort_order,
    requirements = EXCLUDED.requirements,
    promotion_cost = EXCLUDED.promotion_cost,
    bonus = EXCLUDED.bonus,
    image_path = EXCLUDED.image_path,
    metadata = EXCLUDED.metadata,
    updated_at = now();` : ''}
COMMIT;`;

    const result = await runPsqlSql(targetDatabaseUrl, sql);
    if (!result.ok) throw new Error(result.error);
  };

  const loadTemplateFromPostgres = async () => {
    const sql = `
SELECT COALESCE(value::text, '')
FROM app_settings
WHERE key = 'shared_deck_template'
LIMIT 1;`;
    const result = await runPsqlSql(deps.databaseUrl, sql);
    if (!result.ok) throw new Error(result.error);
    const raw = result.stdout.trim();
    if (!raw) {
      throw new Error('shared deck template is missing in postgres');
    }
    const importResult = importSharedDeckTemplateJson(raw);
    if (!importResult.ok) {
      throw new Error(`invalid template payload in postgres: ${importResult.error}`);
    }
  };

  const loadRanksFromPostgres = async () => {
    const sql = `
SELECT COALESCE(value::text, '')
FROM app_settings
WHERE key = 'shared_ranks'
LIMIT 1;`;
    const result = await runPsqlSql(deps.databaseUrl, sql);
    if (!result.ok) throw new Error(result.error);
    const raw = result.stdout.trim();
    if (!raw) {
      throw new Error('shared ranks payload is missing in postgres');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`invalid ranks JSON in postgres: ${String(error)}`);
    }
    const importResult = importSharedRanksJson(JSON.stringify(parsed));
    if (!importResult.ok) throw new Error(`invalid ranks schema in postgres payload: ${importResult.error}`);
  };

  const syncCurrentJsonToPostgres = async (draft?: PostgresConnDraft) => {
    const targetUrl = draft ? buildPostgresUrlFromDraft(draft) : deps.databaseUrl;
    if (!targetUrl) throw new Error('PostgreSQL connection is not configured');
    await saveTemplateToPostgresWithUrl(targetUrl);
    await saveRanksToPostgresWithUrl(targetUrl);
  };

  return {
    saveTemplateToPostgresWithUrl,
    saveRanksToPostgresWithUrl,
    loadTemplateFromPostgres,
    loadRanksFromPostgres,
    syncCurrentJsonToPostgres,
  };
};
