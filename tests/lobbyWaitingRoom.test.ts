import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('joined players see the waiting-room panel until every seat is filled', async () => {
  const appSource = await readFile(
    new URL('../src/ui/App.tsx', import.meta.url),
    'utf8',
  );
  const lobbySource = await readFile(
    new URL('../src/ui/app/sections/LobbySection.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    appSource,
    /<LobbyFeature[\s\S]*activeUserTab === 'games'[\s\S]*\(!session \|\| !canStart\)/,
  );
  assert.match(lobbySource, /if \(session && !canStart\)/);
  assert.match(
    appSource,
    /<ActiveGameFeature[\s\S]*Boolean\(activeSessionMatch\)[\s\S]*canStart/,
  );
});

test('public lobby listing excludes ownerless rooms from interrupted creation', async () => {
  const source = await readFile(
    new URL('../server/routes/admin/matches.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /if \(!players\.some\(\(player\) => Boolean\(player\.name\?\.trim\(\)\)\)\) \{[\s\S]*skipping ownerless match/,
  );
});

test('internal lobby response body is captured exactly once', async () => {
  const source = await readFile(
    new URL('../server/routes/user-lobby.ts', import.meta.url),
    'utf8',
  );
  const endOverride = source.match(
    /response\.end = \(\([\s\S]*?\) as typeof response\.end;/,
  )?.[0];
  assert.ok(endOverride);
  assert.doesNotMatch(endOverride, /chunks\.push/);
  assert.match(endOverride, /originalEnd\(\.\.\.args\)/);
});
