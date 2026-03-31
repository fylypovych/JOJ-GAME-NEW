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
}) => {
  const tabs: Array<{ id: AdminTab; label: string; short: string }> = [
    { id: 'matches', label: t.tabMatches, short: 'M' },
    { id: 'deck', label: t.tabDeck, short: 'D' },
    { id: 'import', label: t.tabImportExport, short: 'I' },
    { id: 'ranks', label: t.tabRanks, short: 'R' },
    { id: 'state', label: t.tabState, short: 'S' },
    { id: 'database', label: t.tabDatabase, short: 'DB' },
    { id: 'analytics', label: t.tabAnalytics, short: 'A' },
    { id: 'github', label: t.tabGithub, short: 'GH' },
    { id: 'users', label: t.tabUsers, short: 'U' },
    { id: 'awards', label: t.tabAwards, short: 'AW' },
    { id: 'bugReports', label: t.tabBugReports, short: 'BR' },
    { id: 'settings', label: t.tabSettings, short: 'ST' },
    { id: 'simulation', label: t.tabSimulation, short: 'SM' },
  ];
  return (
    <p className="admin-controls">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} disabled={activeTab === tab.id}>
          <span className="admin-tab-icon" aria-hidden="true">{tab.short}</span>
          <span className="admin-tab-label">{tab.label}</span>
        </button>
      ))}
    </p>
  );
};

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
  deletingMatch,
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
  deletingMatch: boolean;
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
      <button type="button" onClick={onDeleteMatch} disabled={!canDelete || deletingMatch}>
        {deletingMatch ? `${t.deleteMatch}...` : t.deleteMatch}
      </button>
    </p>
  </>
);
