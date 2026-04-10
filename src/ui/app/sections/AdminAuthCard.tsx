import { text } from '../../i18n';

type T = ReturnType<typeof text>;

type AdminAuthCardProps = {
  t: T;
  serverUrl: string;
  adminAuthEnabled: boolean | null;
  adminTokenDraft: string;
  setAdminTokenDraft: (value: string) => void;
  adminAuthChecking: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  adminAuthError: string;
};

export const AdminAuthCard = ({
  t,
  serverUrl,
  adminAuthEnabled,
  adminTokenDraft,
  setAdminTokenDraft,
  adminAuthChecking,
  onSignIn,
  onSignOut,
  adminAuthError,
}: AdminAuthCardProps) => {
  const adminHintText = adminAuthEnabled === false ? t.adminAuthDisabledHint : t.adminLoginHint;

  return (
    <section className="board admin-auth-card">
      <h2>{t.adminLoginTitle}</h2>
      <p>{adminHintText}</p>
      <p>
        {t.serverUrlLabel}: <code>{serverUrl}</code>
      </p>
      <p className="admin-auth-form">
        <label>
          {t.adminTokenLabel}:{' '}
          <input
            type="password"
            value={adminTokenDraft}
            onChange={(e) => setAdminTokenDraft(e.target.value)}
            placeholder={t.adminTokenLabel}
          />
        </label>{' '}
        <button type="button" onClick={onSignIn} disabled={adminAuthChecking}>
          {adminAuthChecking ? t.adminAuthChecking : t.adminSignIn}
        </button>{' '}
        <button type="button" onClick={onSignOut}>
          {t.adminSignOut}
        </button>
      </p>
      {adminAuthError ? <p className="admin-error">{adminAuthError}</p> : null}
    </section>
  );
};
