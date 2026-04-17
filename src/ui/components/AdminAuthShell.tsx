interface AdminAuthShellProps {
  adminUiVariant: string;
  adminAuthChecking: boolean;
  adminAuthError: string;
  adminAuthEnabled: boolean | null;
  adminTitle: string;
  loading: string;
  adminUnauthorized: string;
  adminAuthDisabledHint: string;
  refreshRooms: string;
  onVerifyAdminToken: () => void;
}

/**
 * Компонент для відображення статусу аутентифікації адміністратора.
 * Показує повідомлення про завантаження, помилки або відсутність авторизації.
 */
export const AdminAuthShell = ({
  adminUiVariant,
  adminAuthChecking,
  adminAuthError,
  adminAuthEnabled,
  adminTitle,
  loading,
  adminUnauthorized,
  adminAuthDisabledHint,
  refreshRooms,
  onVerifyAdminToken,
}: AdminAuthShellProps) => {
  const statusMessage = adminAuthChecking
    ? loading
    : adminAuthError || (adminAuthEnabled === false ? adminAuthDisabledHint : adminUnauthorized);

  return (
    <section className={`admin-shell-v4 admin-panel-v4 admin-shell-v2 admin-panel-v2 admin-auth-shell${adminUiVariant === 'v1' ? ' admin-shell-v1 admin-panel-v1' : ''}`}>
      <h2>{adminTitle}</h2>
      <p className="admin-auth-status">{statusMessage}</p>
      {!adminAuthChecking ? (
        <p className="admin-controls admin-auth-actions">
          <button type="button" onClick={() => { void onVerifyAdminToken(); }}>{refreshRooms}</button>
        </p>
      ) : null}
    </section>
  );
};
