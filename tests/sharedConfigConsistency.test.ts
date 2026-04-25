import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedConfigConsistencyDiagnostics } from '../server/services/shared-config-consistency';

test('buildSharedConfigConsistencyDiagnostics detects stale deleted card id', () => {
  const diagnostics = buildSharedConfigConsistencyDiagnostics({
    activeTemplateKey: 'shared-default',
    activeRankSetKey: 'shared-default',
    dbDeckIds: ['lyap-01', 'lyap-02'],
    dbLegendaryIds: ['legendary-13', 'legendary-14'],
    dbRankTrackIds: ['rank-1'],
    dbRankIds: ['recruit', 'soldier'],
    jsonDeckIds: ['lyap-01', 'lyap-02'],
    jsonLegendaryIds: ['legendary-14'],
    jsonRankTrackIds: ['rank-1'],
    jsonRankIds: ['recruit', 'soldier'],
    activeTemplateCount: 1,
    activeRankSetCount: 1,
  });

  assert.equal(diagnostics.ok, false);
  assert.ok(
    diagnostics.mismatches.some((line) => line.includes('legendaryDeck id sequence mismatch')),
  );
  assert.ok(
    diagnostics.mismatches.some((line) => line.includes('legendary-13')),
  );
});

test('buildSharedConfigConsistencyDiagnostics passes when ids and counts are aligned', () => {
  const diagnostics = buildSharedConfigConsistencyDiagnostics({
    activeTemplateKey: 'shared-default',
    activeRankSetKey: 'shared-default',
    dbDeckIds: ['deck-1', 'deck-2'],
    dbLegendaryIds: ['legendary-1'],
    dbRankTrackIds: ['rank-track-1'],
    dbRankIds: ['recruit', 'soldier'],
    jsonDeckIds: ['deck-1', 'deck-2'],
    jsonLegendaryIds: ['legendary-1'],
    jsonRankTrackIds: ['rank-track-1'],
    jsonRankIds: ['recruit', 'soldier'],
    activeTemplateCount: 1,
    activeRankSetCount: 1,
  });

  assert.equal(diagnostics.ok, true);
  assert.deepEqual(diagnostics.mismatches, []);
});

