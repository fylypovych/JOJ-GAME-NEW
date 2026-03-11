import { text } from '../../i18n';
import type { AdminTab } from '../types';

type T = ReturnType<typeof text>;

export const AdminTabButtons = ({
  t,
  activeTab,
  setActiveTab,
}: {
  t: T;
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
}) => (
  <p className="admin-controls">
    <button type="button" onClick={() => setActiveTab('matches')} disabled={activeTab === 'matches'}>{t.tabMatches}</button>
    <button type="button" onClick={() => setActiveTab('deck')} disabled={activeTab === 'deck'}>{t.tabDeck}</button>
    <button type="button" onClick={() => setActiveTab('import')} disabled={activeTab === 'import'}>{t.tabImportExport}</button>
    <button type="button" onClick={() => setActiveTab('ranks')} disabled={activeTab === 'ranks'}>{t.tabRanks}</button>
    <button type="button" onClick={() => setActiveTab('state')} disabled={activeTab === 'state'}>{t.tabState}</button>
    <button type="button" onClick={() => setActiveTab('database')} disabled={activeTab === 'database'}>{t.tabDatabase}</button>
    <button type="button" onClick={() => setActiveTab('users')} disabled={activeTab === 'users'}>{t.tabUsers}</button>
    <button type="button" onClick={() => setActiveTab('awards')} disabled={activeTab === 'awards'}>{t.tabAwards}</button>
    <button type="button" onClick={() => setActiveTab('settings')} disabled={activeTab === 'settings'}>{t.tabSettings}</button>
    <button type="button" onClick={() => setActiveTab('simulation')} disabled={activeTab === 'simulation'}>{t.tabSimulation}</button>
  </p>
);

export const AdminMatchesTab = ({
  t,
  matchIds,
  matchesCount,
  activeMatchId,
  onActiveMatchIdChange,
  activeMatchCreatedAt,
  onCreateMatch,
  onResetMatch,
  onDeleteMatch,
  canDelete,
}: {
  t: T;
  matchIds: string[];
  matchesCount: number;
  activeMatchId: string;
  onActiveMatchIdChange: (matchID: string) => void;
  activeMatchCreatedAt?: number;
  onCreateMatch: () => void;
  onResetMatch: () => void;
  onDeleteMatch: () => void;
  canDelete: boolean;
}) => (
  <>
    <p>{t.matches}: {matchesCount}</p>
    <p className="admin-controls">
      <label>
        {t.activeMatch}
        <select value={activeMatchId} onChange={(e) => onActiveMatchIdChange(e.target.value)} disabled={matchIds.length === 0}>
          {matchIds.length === 0 ? <option value="">{t.notSelected}</option> : null}
          {matchIds.map((id) => <option key={`admin-match-${id}`} value={id}>{id}</option>)}
        </select>
      </label>
    </p>
    <p>{t.activeMatch}: <code>{activeMatchId || t.notSelected}</code></p>
    <p>{t.createdAt}: {activeMatchCreatedAt ? new Date(activeMatchCreatedAt).toLocaleString() : t.notSelected}</p>
    <p className="admin-controls">
      <button type="button" onClick={onCreateMatch}>{t.createMatch}</button>
      <button type="button" onClick={onResetMatch}>{t.resetMatch}</button>
      <button type="button" onClick={onDeleteMatch} disabled={!canDelete}>{t.deleteMatch}</button>
    </p>
  </>
);
