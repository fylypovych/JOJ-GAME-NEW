import { text } from '../../i18n';
import type { AdminTab } from '../types';

type T = ReturnType<typeof text>;
export type AdminNavTab = {
  id: AdminTab;
  label: string;
  short: string;
  iconPath: string;
};

export type AdminNavCategory = {
  id: 'start' | 'operations' | 'content' | 'data' | 'integrations' | 'system';
  label: string;
  short: string;
  artLabel: string;
  description: string;
  iconPath: string;
  tabs: AdminNavTab[];
};

export const AdminTabButtons = ({
  tabs,
  activeTab,
  setActiveTab,
  className = '',
}: {
  tabs: AdminNavTab[];
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  className?: string;
}) => {
  return (
    <p className={`admin-controls${className ? ` ${className}` : ''}`}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} disabled={activeTab === tab.id}>
          <span className="admin-tab-icon" aria-hidden="true">
            <img src={tab.iconPath} alt="" />
          </span>
          <span className="admin-tab-label">{tab.label}</span>
        </button>
      ))}
    </p>
  );
};

export const AdminCategoryButtons = ({
  categories,
  activeCategoryId,
  onSelectCategory,
}: {
  categories: AdminNavCategory[];
  activeCategoryId: AdminNavCategory['id'];
  onSelectCategory: (categoryId: AdminNavCategory['id']) => void;
}) => (
  <nav className="admin-v2-category-list" aria-label="Admin categories">
    {categories.map((category) => (
      <button
        key={category.id}
        type="button"
        className={`admin-v2-category-button${category.id === activeCategoryId ? ' is-active' : ''}`}
        onClick={() => onSelectCategory(category.id)}
        aria-label={category.label}
        title={category.label}
      >
        <span className={`admin-v2-category-thumb is-${category.id}`} aria-hidden="true">
          <img src={category.iconPath} alt="" />
        </span>
        <span className="admin-v2-category-copy" aria-hidden="true">
          <strong>{category.label}</strong>
          <small>{category.description}</small>
        </span>
      </button>
    ))}
  </nav>
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
  deletingMatch,
}: {
  t: T;
  matchIds: string[];
  matchesCount: number;
  activeMatchId: string;
  onActiveMatchIdChange: (matchID: string) => void;
  activeMatchCreatedAt?: number;
  onCreateMatch: () => void;
  onResetMatch: () => boolean | Promise<boolean>;
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
