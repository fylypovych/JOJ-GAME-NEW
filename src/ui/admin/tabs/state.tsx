import { useState } from 'react';
import { text } from '../../i18n';
import { copyText } from '../../app/share';
import type { JojGameState } from '../../../game/types';
import type { Snapshot } from '../types';
import { AdminEmptyState, AdminSectionHeader, AdminStatusBadge } from '../components/AdminWorkspaceLayout';

type T = ReturnType<typeof text>;
type Section = 'summary' | 'players' | 'events' | 'raw';
type SnapshotCtx = { currentPlayer?: string; turn?: number; phase?: string; gameover?: { forcedStop?: boolean } | null };

export const AdminStateTab = ({ t, snapshot, activeMatchId, stopGameRunning, stopGameError, stopGameStatus, localizedRankName, onStopGame }: { t: T; snapshot: Snapshot | null; activeMatchId: string; stopGameRunning: boolean; stopGameError: string; stopGameStatus: string; localizedRankName: (rankId: string) => string; onStopGame: () => void }) => {
  const [section, setSection] = useState<Section>('summary');
  const [eventSearch, setEventSearch] = useState('');
  const raw = (snapshot?.G ?? null) as Partial<JojGameState> | null;
  const ctx = (snapshot?.ctx ?? null) as SnapshotCtx | null;
  const players = raw?.players && typeof raw.players === 'object' ? Object.entries(raw.players) : [];
  const chat = Array.isArray(raw?.chat) ? raw.chat : [];
  const events = chat.filter((event) => !eventSearch.trim() || String(event.text ?? '').toLocaleLowerCase().includes(eventSearch.trim().toLocaleLowerCase()));
  const rawJson = snapshot ? JSON.stringify({ G: snapshot.G, ctx: snapshot.ctx }, null, 2) : '';
  const counts = { deck: Array.isArray(raw?.deck) ? raw.deck.length : 0, discard: Array.isArray(raw?.discard) ? raw.discard.length : 0, legendary: Array.isArray(raw?.legendaryDeck) ? raw.legendaryDeck.length : 0 };
  const tabs: Array<[Section, string]> = [['summary', t.stateSummaryTitle], ['players', t.statePlayersTitle], ['events', t.stateRecentEventsTitle], ['raw', t.stateRawJsonDebug]];
  return <div className="admin-state-workspace"><AdminSectionHeader title={t.stateSnapshot} description={`${t.updatedAt}: ${snapshot ? new Date(snapshot.updatedAt).toLocaleString() : t.notSelected}`} actions={<><AdminStatusBadge tone={snapshot ? 'success' : 'neutral'}>{activeMatchId || t.notSelected}</AdminStatusBadge><button type="button" className="admin-danger-action" onClick={() => { if (window.confirm(`${t.stateStopGame}?`)) onStopGame(); }} disabled={!activeMatchId || stopGameRunning}>{stopGameRunning ? t.stateStopGameRunning : t.stateStopGame}</button></>} />{stopGameStatus ? <p className="admin-success">{stopGameStatus}</p> : null}{stopGameError ? <p className="admin-error">{stopGameError}</p> : null}<nav className="admin-detail-tabs">{tabs.map(([id, label]) => <button key={id} type="button" className={section === id ? 'is-active' : ''} onClick={() => setSection(id)}>{label}</button>)}</nav>{!snapshot ? <AdminEmptyState>{t.noStateYet}</AdminEmptyState> : <>
    {section === 'summary' ? <div className="admin-metric-grid"><article className="admin-metric-card"><span>{t.stateTurn}</span><strong>{ctx?.turn ?? '—'}</strong></article><article className="admin-metric-card"><span>{t.statePhase}</span><strong>{ctx?.phase ?? '—'}</strong></article><article className="admin-metric-card"><span>{t.stateActivePlayer}</span><strong>{ctx?.currentPlayer ?? '—'}</strong></article><article className="admin-metric-card"><span>{t.stateDeck}</span><strong>{counts.deck}</strong></article><article className="admin-metric-card"><span>{t.stateDiscard}</span><strong>{counts.discard}</strong></article><article className="admin-metric-card"><span>{t.stateLegendaryDeck}</span><strong>{counts.legendary}</strong></article></div> : null}
    {section === 'players' ? <div className="admin-player-state-grid">{players.map(([id, player]) => { const resources = player?.resources ?? raw?.resources?.[id] ?? {}; const rankId = player?.rankId ?? raw?.ranks?.[id] ?? '—'; return <article key={id}><AdminSectionHeader eyebrow={id} title={raw?.playerNames?.[id] ?? `P${id}`} actions={ctx?.currentPlayer === id ? <AdminStatusBadge tone="success">{t.stateActive}</AdminStatusBadge> : undefined} /><p>{t.stateRank}: <strong>{localizedRankName(String(rankId))}</strong></p><div className="admin-resource-state">{Object.entries(resources).map(([key, value]) => <span key={key}><small>{key}</small><strong>{Number(value) || 0}</strong></span>)}</div></article>; })}</div> : null}
    {section === 'events' ? <div className="admin-operation-panel"><div className="admin-management-search"><input value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder={t.stateRecentEventsTitle} /></div><div className="admin-timeline">{events.length === 0 ? <AdminEmptyState>{t.stateNoMessages}</AdminEmptyState> : events.slice().reverse().map((event) => <article key={String(event.id ?? `${event.createdAt}-${event.text}`)}><i /><div><strong>{event.type === 'system' ? t.systemTag : event.playerID ? raw?.playerNames?.[event.playerID] ?? event.playerID : t.genericPlayer}</strong><p>{String(event.text ?? '')}</p><small>{event.createdAt ? new Date(event.createdAt).toLocaleString() : ''}</small></div></article>)}</div></div> : null}
    {section === 'raw' ? <div className="admin-log-panel"><AdminSectionHeader title={t.stateRawJsonDebug} actions={<button type="button" onClick={() => void copyText(rawJson)}>{t.githubCopyLog}</button>} /><pre className="admin-textarea admin-log-viewer admin-github-log-viewer">{rawJson}</pre></div> : null}
  </>}</div>;
};
