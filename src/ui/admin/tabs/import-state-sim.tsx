import { text } from '../../i18n';
import type { Snapshot } from '../types';
import type { GameMode } from '../../../game/types';

type T = ReturnType<typeof text>;

export const AdminImportTab = ({
  t, importTarget, setImportTarget, importCategoryMode, setImportCategoryMode, categories,
  runImport, importFromFile, exportToFile, importError, importStatus, importJson, setImportJson, clearImportStatus,
}: {
  t: T;
  importTarget: 'deck' | 'legendaryDeck';
  setImportTarget: (v: 'deck' | 'legendaryDeck') => void;
  importCategoryMode: string;
  setImportCategoryMode: (v: string) => void;
  categories: string[];
  runImport: () => void;
  importFromFile: (file: File | null) => void;
  exportToFile: () => void;
  importError: string;
  importStatus: string;
  importJson: string;
  setImportJson: (v: string) => void;
  clearImportStatus: () => void;
}) => (
  <>
    <h3>{t.importExport}</h3>
    <p className="admin-controls">
      <button type="button" onClick={exportToFile}>{t.exportJson}</button>
      <label>
        {t.importToDeck}
        <select value={importTarget} onChange={(e) => { setImportTarget(e.target.value as 'deck' | 'legendaryDeck'); clearImportStatus(); }}>
          <option value="deck">{t.mainDeck}</option>
          <option value="legendaryDeck">{t.legendaryDeckLabel}</option>
        </select>
      </label>
      {importTarget === 'deck' ? (
        <label>
          {t.importCategoryLabel}
          <select value={importCategoryMode} onChange={(e) => { setImportCategoryMode(e.target.value); clearImportStatus(); }}>
            <option value="AS_IS">{t.importCategoryAsIs}</option>
            {categories.map((cat) => <option key={`import-cat-${cat}`} value={cat}>{cat}</option>)}
          </select>
        </label>
      ) : null}
      <button type="button" onClick={runImport}>{t.importJson}</button>
      <label>
        {t.importFile}
        <input type="file" accept="application/json,.json" onChange={(e) => importFromFile(e.target.files?.[0] ?? null)} />
      </label>
    </p>
    {importError ? <p className="admin-error">{importError}</p> : null}
    {importStatus ? <p className="admin-success">{importStatus}</p> : null}
    <textarea className="admin-textarea" value={importJson} onChange={(e) => { setImportJson(e.target.value); clearImportStatus(); }} />
  </>
);

export const AdminStateTab = ({
  t,
  snapshot,
  activeMatchId,
  stopGameRunning,
  stopGameError,
  stopGameStatus,
  localizedRankName,
  onStopGame,
}: {
  t: T;
  snapshot: Snapshot | null;
  activeMatchId: string;
  stopGameRunning: boolean;
  stopGameError: string;
  stopGameStatus: string;
  localizedRankName: (rankId: string) => string;
  onStopGame: () => void;
}) => {
  const raw = snapshot?.G as any;
  const ctx = snapshot?.ctx as any;
  const players = raw?.players && typeof raw.players === 'object' ? Object.entries(raw.players as Record<string, any>) : [];
  const chat = Array.isArray(raw?.chat) ? raw.chat : [];
  const lastChat = chat.slice(-8);
  const deckCount = Array.isArray(raw?.deck) ? raw.deck.length : 0;
  const discardCount = Array.isArray(raw?.discard) ? raw.discard.length : 0;
  const legendaryDeckCount = Array.isArray(raw?.legendaryDeck) ? raw.legendaryDeck.length : 0;
  const legendaryDiscardCount = Array.isArray(raw?.legendaryDiscard) ? raw.legendaryDiscard.length : 0;
  const activePlayer = typeof ctx?.currentPlayer === 'string' ? ctx.currentPlayer : null;
  const turn = ctx?.turn ?? '-';
  const phase = ctx?.phase ?? '-';
  const forcedStopped = Boolean(ctx?.gameover && typeof ctx.gameover === 'object' && (ctx.gameover as any).forcedStop);
  const playerTag = (msg: any) => (
    msg.type === 'system'
      ? t.systemTag
      : (raw?.playerNames?.[msg.playerID] ?? msg.playerID ?? t.genericPlayer)
  );

  return (
    <>
      <h3>{t.stateSnapshot}</h3>
      <p>{t.updatedAt}: {snapshot ? new Date(snapshot.updatedAt).toLocaleString() : t.notSelected}</p>
      <p className="admin-controls">
        <button type="button" onClick={onStopGame} disabled={!activeMatchId || stopGameRunning}>
          {stopGameRunning ? t.stateStopGameRunning : t.stateStopGame}
        </button>
        {activeMatchId ? <span>{t.activeMatch}: <code>{activeMatchId}</code></span> : null}
      </p>
      {stopGameStatus ? <p className="admin-success">{stopGameStatus}</p> : null}
      {stopGameError ? <p className="admin-error">{stopGameError}</p> : null}
      {!snapshot ? <p>{t.noStateYet}</p> : (
        <>
          {forcedStopped ? (
            <div className="admin-inline-editor">
              <h4>{t.stateStoppedTitle}</h4>
              <p>{t.stateStoppedHint}</p>
              <p>{t.stateTurn}: <strong>{String(turn)}</strong> | {t.statePhase}: <strong>{String(phase)}</strong></p>
            </div>
          ) : null}
          {!forcedStopped ? (
          <div className="admin-inline-editor">
            <h4>{t.stateSummaryTitle}</h4>
            <p>{t.stateTurn}: <strong>{String(turn)}</strong> | {t.statePhase}: <strong>{String(phase)}</strong> | {t.stateActivePlayer}: <strong>{activePlayer ?? '-'}</strong></p>
            <p>{t.stateDeck}: <strong>{deckCount}</strong> | {t.stateDiscard}: <strong>{discardCount}</strong> | {t.stateLegendaryDeck}: <strong>{legendaryDeckCount}</strong> | {t.stateLegendaryDiscard}: <strong>{legendaryDiscardCount}</strong></p>
          </div>
          ) : null}

          {!forcedStopped ? (
          <div className="admin-inline-editor">
            <h4>{t.statePlayersTitle}</h4>
            {players.length === 0 ? <p>{t.stateNoData}</p> : (
              <div className="admin-deck-list">
                <ul>
                  {players.map(([pid, player]) => {
                    const handCount = Array.isArray(raw?.hands?.[pid]) ? raw.hands[pid].length : Array.isArray(player?.hand) ? player.hand.length : 0;
                    const legendaryHandCount = Array.isArray(raw?.legendaryHands?.[pid]) ? raw.legendaryHands[pid].length : 0;
                    const resources = player?.resources ?? raw?.resources?.[pid] ?? {};
                    const rankId = player?.rankId ?? raw?.ranks?.[pid] ?? '-';
                    const rankName = typeof rankId === 'string' ? localizedRankName(rankId) : String(rankId);
                    const name = raw?.playerNames?.[pid] ?? `P${pid}`;
                    return (
                      <li key={`state-player-${pid}`}>
                        <strong>{name}</strong> (ID: {pid}) {activePlayer === pid ? `• ${t.stateActive}` : ''}
                        <br />
                        {t.stateRank}: <code>{rankName}</code> (<span>{String(rankId)}</span>) | {t.stateHand}: {handCount} | {t.stateLegendaryHand}: {legendaryHandCount}
                        <br />
                        {t.stateResources}: {t.resources.time} {resources.time ?? 0}, {t.resources.reputation} {resources.reputation ?? 0}, {t.resources.discipline} {resources.discipline ?? 0}, {t.resources.documents} {resources.documents ?? 0}, {t.resources.tech} {resources.tech ?? 0}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
          ) : null}

          {!forcedStopped ? (
          <div className="admin-inline-editor">
            <h4>{t.stateRecentEventsTitle}</h4>
            {lastChat.length === 0 ? <p>{t.stateNoMessages}</p> : (
              <div className="admin-deck-list">
                <ul>
                  {lastChat.map((msg: any) => (
                    <li key={String(msg.id ?? `${msg.createdAt}-${msg.text}`)}>
                      <strong>{playerTag(msg)}</strong>: {String(msg.text ?? '')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          ) : null}

          <details>
            <summary>{t.stateRawJsonDebug}</summary>
            <pre className="admin-json">{JSON.stringify({ G: snapshot.G, ctx: snapshot.ctx }, null, 2)}</pre>
          </details>
        </>
      )}
    </>
  );
};

export const AdminSimulationTab = ({
  t, lang, simulationPlayers, setSimulationPlayers, simulationCount, setSimulationCount,
  simulationRunning, runSimulation, simulationReport, simulationError, simulationBlockedReason, localizedRankName,
  simulationGameMode, setSimulationGameMode,
}: {
  t: T;
  lang: 'uk' | 'en';
  simulationPlayers: number;
  setSimulationPlayers: (value: number) => void;
  simulationCount: number;
  setSimulationCount: (value: number) => void;
  simulationRunning: boolean;
  runSimulation: () => void;
  simulationReport: any;
  simulationError?: string;
  simulationBlockedReason?: string;
  localizedRankName: (rankId: string) => string;
  simulationGameMode: GameMode;
  setSimulationGameMode: (value: GameMode) => void;
}) => (
  <>
    <h3>{t.simulationTitle}</h3>
    <p className="admin-controls">
      <label>{t.simulationPlayers}
        <select value={simulationPlayers} onChange={(e) => setSimulationPlayers(Number(e.target.value))} disabled={simulationRunning}>
          <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option><option value={6}>6</option>
        </select>
      </label>
      <label>{t.simulationCount}
        <input type="number" min={1} max={5000} step={1} value={simulationCount} onChange={(e) => setSimulationCount(Number(e.target.value || 1))} disabled={simulationRunning} />
      </label>
      <label>{t.gameModeLabel}
        <select
          value={simulationGameMode}
          onChange={(e) => setSimulationGameMode(e.target.value as GameMode)}
          disabled={simulationRunning}
        >
          <option value="standard">{t.gameModeStandard}</option>
          <option value="standard_plus">{t.gameModeStandardPlus}</option>
          <option value="simplified">{t.gameModeSimplified}</option>
        </select>
      </label>
      <button type="button" disabled={simulationRunning || Boolean(simulationBlockedReason)} onClick={runSimulation}>{simulationRunning ? t.simulationRunning : t.simulationRun}</button>
    </p>
    {simulationBlockedReason ? <p className="admin-info">{simulationBlockedReason}</p> : null}
    {simulationError ? <p className="admin-error">{simulationError}</p> : null}
    <h4>{t.simulationReport}</h4>
    {!simulationReport ? <p>{t.simulationNoReport}</p> : (
      <div>
        <p>{lang === 'uk' ? `Виконано симуляцій: ${simulationReport.input.simulations} (гравців у матчі: ${simulationReport.input.players}).` : `Simulations: ${simulationReport.input.simulations} (players per game: ${simulationReport.input.players}).`}</p>
        <p>{lang === 'uk'
          ? `Режим гри: ${simulationReport.input.gameMode === 'standard_plus' ? t.gameModeStandardPlus : simulationReport.input.gameMode === 'simplified' ? t.gameModeSimplified : t.gameModeStandard}.`
          : `Game mode: ${simulationReport.input.gameMode === 'standard_plus' ? t.gameModeStandardPlus : simulationReport.input.gameMode === 'simplified' ? t.gameModeSimplified : t.gameModeStandard}.`}</p>
        <p>{lang === 'uk' ? `Завершені: ${simulationReport.summary.finished}, завислі: ${simulationReport.summary.stalled}, середня кількість ходів: ${simulationReport.summary.avgTurns}.` : `Finished: ${simulationReport.summary.finished}, stalled: ${simulationReport.summary.stalled}, average turns: ${simulationReport.summary.avgTurns}.`}</p>
        <p>{lang === 'uk' ? `Перемоги за званням: ${simulationReport.summary.rankWins}, за очками: ${simulationReport.summary.scoreWins}.` : `Rank wins: ${simulationReport.summary.rankWins}, score wins: ${simulationReport.summary.scoreWins}.`}</p>
        <p>{lang === 'uk'
          ? `Топ-3 звань за найбільшим відсотком досягнення: ${simulationReport.topReachedRanksByPct.length ? simulationReport.topReachedRanksByPct.map((row: any) => `${localizedRankName(row.rankId)} — ${row.pct}% (${row.games}/${simulationReport.input.simulations})`).join(' | ') : 'немає даних'}.`
          : `Top-3 most reached ranks by percentage: ${simulationReport.topReachedRanksByPct.length ? simulationReport.topReachedRanksByPct.map((row: any) => `${localizedRankName(row.rankId)} - ${row.pct}% (${row.games}/${simulationReport.input.simulations})`).join(' | ') : 'no data'}.`}</p>
        <p>{lang === 'uk'
          ? `Топ-3 найвищих за ієрархією звань: ${simulationReport.topReachedRanks.length ? simulationReport.topReachedRanks.map((row: any) => `${localizedRankName(row.rankId)} — ${row.pct}% (${row.games}/${simulationReport.input.simulations})`).join(' | ') : 'немає даних'}.`
          : `Top-3 highest ranks by hierarchy: ${simulationReport.topReachedRanks.length ? simulationReport.topReachedRanks.map((row: any) => `${localizedRankName(row.rankId)} - ${row.pct}% (${row.games}/${simulationReport.input.simulations})`).join(' | ') : 'no data'}.`}</p>
        <p>{lang === 'uk'
          ? `Накопичені ресурси: час ${simulationReport.lastGame.winnerResources.time}, авторитет ${simulationReport.lastGame.winnerResources.reputation}, дисципліна ${simulationReport.lastGame.winnerResources.discipline}, документи ${simulationReport.lastGame.winnerResources.documents}, технології ${simulationReport.lastGame.winnerResources.tech}.`
          : `Resources: time ${simulationReport.lastGame.winnerResources.time}, reputation ${simulationReport.lastGame.winnerResources.reputation}, discipline ${simulationReport.lastGame.winnerResources.discipline}, documents ${simulationReport.lastGame.winnerResources.documents}, tech ${simulationReport.lastGame.winnerResources.tech}.`}</p>
        <p>{lang === 'uk' ? `Ходів у симуляції: ${simulationReport.lastGame.turns}.` : `Turns in simulation: ${simulationReport.lastGame.turns}.`}</p>
        {simulationReport.issues.length ? <pre className="admin-json">{simulationReport.issues.join('\n')}</pre> : null}
      </div>
    )}
  </>
);
