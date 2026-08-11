import { useState } from 'react';
import { text } from '../../i18n';
import type { AdminTab } from '../types';
import { AdminEmptyState, AdminSectionHeader, AdminStatusBadge, AdminWorkspaceLayout } from '../components/AdminWorkspaceLayout';

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
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={activeTab === tab.id ? 'is-active' : ''}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
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
  onDeleteAllMatches,
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
  onDeleteAllMatches: () => void;
  canDelete: boolean;
  deletingMatch: boolean;
}) => {
  const [search, setSearch] = useState('');
  const filtered = matchIds.filter((id) => id.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const sidebar = <><AdminSectionHeader eyebrow={`${matchesCount}`} title={t.matches} actions={<button type="button" className="admin-card-primary-action" onClick={onCreateMatch}>+ {t.createMatch}</button>} /><div className="admin-management-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.activeMatch} /></div><div className="admin-entity-list">{filtered.length === 0 ? <AdminEmptyState>{t.notSelected}</AdminEmptyState> : filtered.map((id) => <button key={id} type="button" className={`admin-match-row${activeMatchId === id ? ' is-selected' : ''}`} onClick={() => onActiveMatchIdChange(id)}><span className="admin-match-dot" /><span><strong>{id}</strong><small>{activeMatchId === id ? t.stateActive : t.notSelected}</small></span></button>)}</div></>;
  return <div className="admin-management-shell"><AdminWorkspaceLayout sidebar={sidebar}>{!activeMatchId ? <AdminEmptyState>{t.notSelected}</AdminEmptyState> : <><AdminSectionHeader eyebrow={t.activeMatch} title={<code>{activeMatchId}</code>} description={`${t.createdAt}: ${activeMatchCreatedAt ? new Date(activeMatchCreatedAt).toLocaleString() : t.notSelected}`} actions={<AdminStatusBadge tone="success">{t.stateActive}</AdminStatusBadge>} /><div className="admin-match-action-grid"><article><strong>{t.resetMatch}</strong><p>{t.activeMatch}: <code>{activeMatchId}</code></p><button type="button" onClick={() => void onResetMatch()}>{t.resetMatch}</button></article><article className="is-danger"><strong>{t.deleteMatch}</strong><p><code>{activeMatchId}</code></p><button type="button" className="admin-danger-action" onClick={() => { if (window.confirm(`${t.deleteMatch}: ${activeMatchId}?`)) onDeleteMatch(); }} disabled={!canDelete || deletingMatch}>{deletingMatch ? `${t.deleteMatch}...` : t.deleteMatch}</button></article></div><div className="admin-danger-zone"><AdminSectionHeader title={t.deleteAllMatches} description={`${t.matches}: ${matchesCount}`} /><button type="button" className="admin-danger-action" onClick={() => { if (window.confirm(`${t.deleteAllMatches}?`)) onDeleteAllMatches(); }} disabled={!canDelete || deletingMatch}>{deletingMatch ? `${t.deleteAllMatches}...` : t.deleteAllMatches}</button></div></>}</AdminWorkspaceLayout></div>;
};
