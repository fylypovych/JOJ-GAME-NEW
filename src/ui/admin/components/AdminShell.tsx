import type { ReactNode } from 'react';

interface AdminShellProps {
  uiVariant: string;
  t: { adminTitle: string };
  children: ReactNode;
}

export const AdminShell = ({ uiVariant, t, children }: AdminShellProps) => {
  return (
    <section
      className={`admin-shell-v2 admin-panel-v2${uiVariant === 'v1' ? ' admin-shell-v1 admin-panel-v1' : ''}`}
    >
      <h2>{t.adminTitle}</h2>
      {children}
    </section>
  );
};
