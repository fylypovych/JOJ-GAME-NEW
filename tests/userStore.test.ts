import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { createUserStore } from '../server/services/user-store';

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
  const store = createUserStore(pool);
  await store.ensureSchema();
  return { store, pool };
};

test('user-store creates users, authenticates them and exposes privacy-aware public profiles', async () => {
  const { store, pool } = await makeStore();
  try {
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
  } finally {
    await pool.end();
  }
});

test('user-store reset tokens invalidate previous sessions and allow password reset', async () => {
  const { store, pool } = await makeStore();
  try {
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
  } finally {
    await pool.end();
  }
});

test('user-store persists finished matches and exposes admin detail aggregates', async () => {
  const { store, pool } = await makeStore();
  try {
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
  } finally {
    await pool.end();
  }
});

test('user-store unlocks awards from aggregated statistics', async () => {
  const { store, pool } = await makeStore();
  try {
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
  } finally {
    await pool.end();
  }
});

test('user-store does not create a default administrator implicitly', async () => {
  const { store, pool } = await makeStore();
  try {
    assert.equal(await store.authenticateUser('admin', 'admin'), null);
    assert.equal(await store.getPublicProfileByUsername('admin'), null);
  } finally {
    await pool.end();
  }
});
