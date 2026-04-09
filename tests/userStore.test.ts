import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { createUserStore } from '../server/services/user-store';

const bootstrapUserStoreSchema = async (pool: Pool) => {
  const statements = [
    `CREATE TABLE app_users (
      id uuid,
      username text,
      email text,
      role text,
      admin_access_token_hash text,
      admin_access_token_rotated_at timestamptz,
      password_hash text,
      password_salt text,
      status text,
      created_at timestamptz,
      updated_at timestamptz,
      last_login_at timestamptz
    )`,
    `ALTER TABLE app_users ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
    `ALTER TABLE app_users ALTER COLUMN role SET DEFAULT 'user'`,
    `ALTER TABLE app_users ALTER COLUMN status SET DEFAULT 'active'`,
    `ALTER TABLE app_users ALTER COLUMN created_at SET DEFAULT now()`,
    `ALTER TABLE app_users ALTER COLUMN updated_at SET DEFAULT now()`,
    'ALTER TABLE app_users ADD PRIMARY KEY (id)',
    'CREATE UNIQUE INDEX idx_app_users_username ON app_users (username)',
    'CREATE UNIQUE INDEX idx_app_users_email ON app_users (email)',

    `CREATE TABLE user_profiles (
      user_id uuid,
      display_name text,
      avatar_url text,
      bio text,
      preferred_lang text,
      profile_public boolean,
      show_stats_public boolean,
      show_recent_matches_public boolean,
      created_at timestamptz,
      updated_at timestamptz
    )`,
    `ALTER TABLE user_profiles ALTER COLUMN bio SET DEFAULT ''`,
    `ALTER TABLE user_profiles ALTER COLUMN preferred_lang SET DEFAULT 'uk'`,
    'ALTER TABLE user_profiles ALTER COLUMN profile_public SET DEFAULT true',
    'ALTER TABLE user_profiles ALTER COLUMN show_stats_public SET DEFAULT true',
    'ALTER TABLE user_profiles ALTER COLUMN show_recent_matches_public SET DEFAULT false',
    `ALTER TABLE user_profiles ALTER COLUMN created_at SET DEFAULT now()`,
    `ALTER TABLE user_profiles ALTER COLUMN updated_at SET DEFAULT now()`,
    'ALTER TABLE user_profiles ADD PRIMARY KEY (user_id)',

    `CREATE TABLE user_sessions (
      id uuid,
      user_id uuid,
      token_hash text,
      expires_at timestamptz,
      created_at timestamptz,
      last_seen_at timestamptz,
      source_ip text,
      user_agent text
    )`,
    `ALTER TABLE user_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
    `ALTER TABLE user_sessions ALTER COLUMN created_at SET DEFAULT now()`,
    `ALTER TABLE user_sessions ALTER COLUMN last_seen_at SET DEFAULT now()`,
    'ALTER TABLE user_sessions ADD PRIMARY KEY (id)',
    'CREATE UNIQUE INDEX idx_user_sessions_token_hash_unique ON user_sessions (token_hash)',
    'CREATE INDEX idx_user_sessions_user_id ON user_sessions (user_id)',
    'CREATE INDEX idx_user_sessions_expires_at ON user_sessions (expires_at)',

    `CREATE TABLE user_password_reset_tokens (
      id uuid,
      user_id uuid,
      token_hash text,
      expires_at timestamptz,
      created_at timestamptz,
      consumed_at timestamptz
    )`,
    `ALTER TABLE user_password_reset_tokens ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
    `ALTER TABLE user_password_reset_tokens ALTER COLUMN created_at SET DEFAULT now()`,
    'ALTER TABLE user_password_reset_tokens ADD PRIMARY KEY (id)',
    'CREATE UNIQUE INDEX idx_user_password_reset_tokens_token_hash_unique ON user_password_reset_tokens (token_hash)',
    'CREATE INDEX idx_user_password_reset_tokens_user_id ON user_password_reset_tokens (user_id)',
    'CREATE INDEX idx_user_password_reset_tokens_expires_at ON user_password_reset_tokens (expires_at)',

    `CREATE TABLE user_match_links (
      id uuid,
      user_id uuid,
      match_id text,
      player_id text,
      player_name text,
      linked_at timestamptz
    )`,
    `ALTER TABLE user_match_links ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
    `ALTER TABLE user_match_links ALTER COLUMN linked_at SET DEFAULT now()`,
    'ALTER TABLE user_match_links ADD PRIMARY KEY (id)',
    'CREATE UNIQUE INDEX idx_user_match_links_unique ON user_match_links (user_id, match_id, player_id)',
    'CREATE INDEX idx_user_match_links_user_id ON user_match_links (user_id, linked_at DESC)',
    'CREATE INDEX idx_user_match_links_match_id ON user_match_links (match_id)',

    `CREATE TABLE persisted_match_results (
      match_id text,
      winner_player_id text,
      winner_player_name text,
      end_reason text,
      game_mode text,
      player_count integer,
      bot_count integer,
      bot_difficulty text,
      turns_completed integer,
      persisted_at timestamptz
    )`,
    `ALTER TABLE persisted_match_results ALTER COLUMN game_mode SET DEFAULT 'standard'`,
    'ALTER TABLE persisted_match_results ALTER COLUMN player_count SET DEFAULT 0',
    'ALTER TABLE persisted_match_results ALTER COLUMN bot_count SET DEFAULT 0',
    'ALTER TABLE persisted_match_results ALTER COLUMN turns_completed SET DEFAULT 0',
    `ALTER TABLE persisted_match_results ALTER COLUMN persisted_at SET DEFAULT now()`,
    'ALTER TABLE persisted_match_results ADD PRIMARY KEY (match_id)',

    `CREATE TABLE persisted_match_participants (
      id uuid,
      match_id text,
      player_id text,
      player_name text,
      final_rank_id text,
      final_resources jsonb,
      resources_gained_total integer,
      resources_lost_total integer,
      lyaps_played_on_others integer,
      scandals_played_on_others integer,
      turns_taken integer
    )`,
    `ALTER TABLE persisted_match_participants ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
    `ALTER TABLE persisted_match_participants ALTER COLUMN final_resources SET DEFAULT '{}'::jsonb`,
    'ALTER TABLE persisted_match_participants ALTER COLUMN resources_gained_total SET DEFAULT 0',
    'ALTER TABLE persisted_match_participants ALTER COLUMN resources_lost_total SET DEFAULT 0',
    'ALTER TABLE persisted_match_participants ALTER COLUMN lyaps_played_on_others SET DEFAULT 0',
    'ALTER TABLE persisted_match_participants ALTER COLUMN scandals_played_on_others SET DEFAULT 0',
    'ALTER TABLE persisted_match_participants ALTER COLUMN turns_taken SET DEFAULT 0',
    'ALTER TABLE persisted_match_participants ADD PRIMARY KEY (id)',
    'CREATE UNIQUE INDEX idx_persisted_match_participants_unique ON persisted_match_participants (match_id, player_id)',
    'CREATE INDEX idx_persisted_match_participants_match_id ON persisted_match_participants (match_id)',

    `CREATE TABLE award_definitions (
      id uuid,
      award_key text,
      title text,
      description text,
      category text,
      metric text,
      threshold numeric,
      badge_label text,
      badge_variant text,
      icon_path text,
      active boolean,
      sort_order integer,
      created_at timestamptz,
      updated_at timestamptz
    )`,
    `ALTER TABLE award_definitions ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
    `ALTER TABLE award_definitions ALTER COLUMN description SET DEFAULT ''`,
    `ALTER TABLE award_definitions ALTER COLUMN category SET DEFAULT 'general'`,
    'ALTER TABLE award_definitions ALTER COLUMN threshold SET DEFAULT 1',
    `ALTER TABLE award_definitions ALTER COLUMN badge_label SET DEFAULT ''`,
    `ALTER TABLE award_definitions ALTER COLUMN badge_variant SET DEFAULT 'bronze'`,
    'ALTER TABLE award_definitions ALTER COLUMN active SET DEFAULT true',
    'ALTER TABLE award_definitions ALTER COLUMN sort_order SET DEFAULT 0',
    `ALTER TABLE award_definitions ALTER COLUMN created_at SET DEFAULT now()`,
    `ALTER TABLE award_definitions ALTER COLUMN updated_at SET DEFAULT now()`,
    'ALTER TABLE award_definitions ADD PRIMARY KEY (id)',
    'CREATE UNIQUE INDEX idx_award_definitions_key_unique ON award_definitions (award_key)',

    `CREATE TABLE user_awards (
      id uuid,
      user_id uuid,
      award_id uuid,
      awarded_at timestamptz,
      progress_value numeric
    )`,
    `ALTER TABLE user_awards ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
    `ALTER TABLE user_awards ALTER COLUMN awarded_at SET DEFAULT now()`,
    'ALTER TABLE user_awards ALTER COLUMN progress_value SET DEFAULT 0',
    'ALTER TABLE user_awards ADD PRIMARY KEY (id)',
    'CREATE UNIQUE INDEX idx_user_awards_unique ON user_awards (user_id, award_id)',
    'CREATE INDEX idx_user_awards_user_id ON user_awards (user_id, awarded_at DESC)',
  ];
  for (const statement of statements) {
    await pool.query(statement);
  }
};

const makeStore = async () => {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID(),
  });
  db.public.registerFunction({
    name: 'round',
    args: [DataType.float, DataType.integer],
    returns: DataType.float,
    implementation: (value: number, precision: number) => {
      const factor = 10 ** precision;
      return Math.round(value * factor) / factor;
    },
  });
  const { Pool: MemPool } = db.adapters.createPg();
  const pool = new MemPool() as Pool;
  await bootstrapUserStoreSchema(pool);
  const store = createUserStore(pool);
  await store.ensureSchema();
  return { store, pool };
};

const withStore = async (run: (store: Awaited<ReturnType<typeof makeStore>>['store']) => Promise<void>) => {
  const { store, pool } = await makeStore();
  try {
    await run(store);
  } finally {
    await pool.end();
  }
};

test('user-store creates users, authenticates them and exposes privacy-aware public profiles', async () => {
  await withStore(async (store) => {
    const user = await store.createUser({
      username: 'Tester_1',
      email: 'tester@example.com',
      password: 'password123',
      displayName: 'Tester One',
      preferredLang: 'en',
      role: 'administrator',
    });
    assert.equal(user.username, 'tester_1');
    assert.equal(user.role, 'administrator');

    const authUser = await store.authenticateUser('tester@example.com', 'password123');
    assert.ok(authUser);
    assert.equal(authUser?.displayName, 'Tester One');
    assert.equal(authUser?.role, 'administrator');

    await store.updateProfile({
      userId: user.id,
      displayName: 'Tester Prime',
      bio: 'Open profile',
      avatarUrl: 'https://example.com/avatar.png',
      preferredLang: 'en',
      profilePublic: true,
      showStatsPublic: false,
      showRecentMatchesPublic: true,
    });

    const publicProfile = await store.getPublicProfileByUsername('Tester_1');
    assert.ok(publicProfile);
    assert.equal(publicProfile?.user.displayName, 'Tester Prime');
    assert.equal(publicProfile?.stats, null);
    assert.deepEqual(publicProfile?.recentMatches, []);
  });
});

test('user-store reset tokens invalidate previous sessions and allow password reset', async () => {
  await withStore(async (store) => {
    const user = await store.createUser({
      username: 'reset_me',
      password: 'password123',
      displayName: 'Reset Me',
    });
    const firstSession = await store.createSession({ userId: user.id, sourceIp: '127.0.0.1', userAgent: 'test-agent' });
    const secondSession = await store.createSession({ userId: user.id, sourceIp: '127.0.0.2', userAgent: 'test-agent-2' });

    assert.ok(await store.getUserBySessionToken(firstSession.token));
    assert.ok(await store.getUserBySessionToken(secondSession.token));

    const reset = await store.createPasswordResetToken('reset_me');
    assert.ok(reset);
    await store.resetPasswordWithToken({
      token: String(reset?.token),
      nextPassword: 'new-password-123',
    });

    assert.equal(await store.getUserBySessionToken(firstSession.token), null);
    assert.equal(await store.getUserBySessionToken(secondSession.token), null);
    assert.equal(await store.authenticateUser('reset_me', 'password123'), null);
    assert.ok(await store.authenticateUser('reset_me', 'new-password-123'));
  });
});

test('user-store persists finished matches and exposes admin detail aggregates', async () => {
  await withStore(async (store) => {
    const user = await store.createUser({
      username: 'stats_user',
      password: 'password123',
      displayName: 'Stats User',
    });
    const session = await store.createSession({ userId: user.id, sourceIp: '127.0.0.1', userAgent: 'admin-test' });
    assert.ok(session.token);

    await store.linkUserToMatch({
      userId: user.id,
      matchId: 'match-1',
      playerId: '0',
      playerName: 'Stats User',
    });
    await store.persistMatchResultIfFinished('match-1', {
      G: {
        ranks: { '0': 'captain', '1': 'soldier' },
        resources: {
          '0': { time: 5, reputation: 9, discipline: 7, documents: 2, tech: 1 },
          '1': { time: 1, reputation: 1, discipline: 1, documents: 0, tech: 0 },
        },
        playerNames: { '0': 'Stats User', '1': 'Enemy' },
        playerGameStats: {
          '0': { resourcesGainedTotal: 20, resourcesLostTotal: 4, lyapsPlayedOnOthers: 2, scandalsPlayedOnOthers: 1, turnsTaken: 18 },
          '1': { resourcesGainedTotal: 6, resourcesLostTotal: 8, lyapsPlayedOnOthers: 0, scandalsPlayedOnOthers: 0, turnsTaken: 18 },
        },
        gameStats: { turnsCompleted: 18 },
      },
      ctx: { gameover: { winner: '0', endReason: 'winner' } },
    });

    const summary = await store.getUserStatsSummary(user.id);
    assert.equal(summary.matchesFinished, 1);
    assert.equal(summary.wins, 1);
    assert.equal(summary.bestRankId, 'captain');
    assert.equal(summary.resourcesGainedTotal, 20);

    const detail = await store.getAdminUserDetail(user.id);
    assert.ok(detail);
    assert.equal(detail?.sessions.length, 1);
    assert.equal(detail?.persistedMatches.length, 1);
    assert.equal(detail?.persistedMatches[0]?.finalRankId, 'captain');
    assert.equal(detail?.persistedMatches[0]?.winnerPlayerId, '0');
  });
});

test('user-store unlocks awards from aggregated statistics', async () => {
  await withStore(async (store) => {
    const user = await store.createUser({
      username: 'award_user',
      password: 'password123',
      displayName: 'Award User',
    });
    await store.linkUserToMatch({
      userId: user.id,
      matchId: 'award-match-1',
      playerId: '0',
      playerName: 'Award User',
    });
    await store.persistMatchResultIfFinished('award-match-1', {
      G: {
        ranks: { '0': 'captain' },
        resources: { '0': { time: 3, reputation: 4, discipline: 5, documents: 1, tech: 0 } },
        playerNames: { '0': 'Award User' },
        playerGameStats: {
          '0': { resourcesGainedTotal: 120, resourcesLostTotal: 7, lyapsPlayedOnOthers: 11, scandalsPlayedOnOthers: 2, turnsTaken: 15 },
        },
        gameStats: { turnsCompleted: 15 },
      },
      ctx: { gameover: { winner: '0', endReason: 'winner' } },
    });

    const awards = await store.evaluateUserAwards(user.id);
    assert.ok(awards.some((award) => award.key === 'resources_gained_100' && award.awarded));
    assert.ok(awards.some((award) => award.key === 'lyaps_10' && award.awarded));
    assert.ok(awards.some((award) => award.key === 'best_rank_captain' && award.awarded));
  });
});

test('user-store does not create a default administrator implicitly', async () => {
  await withStore(async (store) => {
    assert.equal(await store.authenticateUser('admin', 'admin'), null);
    assert.equal(await store.getPublicProfileByUsername('admin'), null);
  });
});
