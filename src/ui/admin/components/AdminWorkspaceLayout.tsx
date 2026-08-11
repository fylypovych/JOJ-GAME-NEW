import type { ReactNode } from 'react';

export const AdminWorkspaceLayout = ({ sidebar, children, className = '' }: {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={`admin-management-workspace${className ? ` ${className}` : ''}`}>
    <aside className="admin-management-sidebar">{sidebar}</aside>
    <section className="admin-management-detail">{children}</section>
  </div>
);

export const AdminSectionHeader = ({ eyebrow, title, description, actions }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) => (
  <header className="admin-section-header">
    <div>
      {eyebrow ? <span className="admin-section-eyebrow">{eyebrow}</span> : null}
      <h4>{title}</h4>
      {description ? <p>{description}</p> : null}
    </div>
    {actions ? <div className="admin-section-actions">{actions}</div> : null}
  </header>
);

export const AdminStatusBadge = ({ children, tone = 'neutral' }: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) => <span className={`admin-status-badge is-${tone}`}>{children}</span>;

export const AdminEmptyState = ({ children }: { children: ReactNode }) => (
  <div className="admin-empty-state">{children}</div>
);
