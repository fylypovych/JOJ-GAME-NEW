import type { T, UiVariant } from './shared';

type PasswordResetSectionProps = {
  t: T;
  busy: boolean;
  error: string;
  resetRequestDraft: { login: string };
  setResetRequestDraft: (value: { login: string }) => void;
  onRequestPasswordReset: () => void;
  resetPasswordDraft: { token: string; nextPassword: string };
  setResetPasswordDraft: (value: { token: string; nextPassword: string }) => void;
  onResetPassword: () => void;
  onBackToLogin: () => void;
  uiVariant?: UiVariant;
};

export const PasswordResetSection = ({
  t,
  busy,
  error,
  resetRequestDraft,
  setResetRequestDraft,
  onRequestPasswordReset,
  resetPasswordDraft,
  setResetPasswordDraft,
  onResetPassword,
  onBackToLogin,
  uiVariant = 'v2',
}: PasswordResetSectionProps) => (
  <section className={`board board-v2-panel board-v2-auth-shell${uiVariant === 'v1' ? ' board-v1-panel board-v1-auth-shell' : ''}`}>
    <h2>{t.userPasswordResetTitle}</h2>
    {error ? <p className="admin-error">{error}</p> : null}
    <div className="lobby-layout board-v2-dual-layout">
      <div className={`lobby-col board-v2-column board-v2-subpanel${uiVariant === 'v1' ? ' board-v1-subpanel' : ''}`}>
        <h3>{t.userPasswordResetRequestButton}</h3>
        <p><input id="reset-request-login" name="login" autoComplete="username" value={resetRequestDraft.login} onChange={(e) => setResetRequestDraft({ login: e.target.value })} placeholder={t.userLoginPlaceholder} /></p>
        <p className="admin-controls">
          <button type="button" onClick={onRequestPasswordReset} disabled={busy}>{t.userPasswordResetRequestButton}</button>
          <button type="button" onClick={onBackToLogin} disabled={busy}>{t.userGoToLoginButton}</button>
        </p>
      </div>
      <div className={`lobby-col board-v2-column board-v2-subpanel${uiVariant === 'v1' ? ' board-v1-subpanel' : ''}`}>
        <h3>{t.userPasswordResetApplyButton}</h3>
        <p><input id="reset-token" name="token" autoComplete="off" value={resetPasswordDraft.token} onChange={(e) => setResetPasswordDraft({ ...resetPasswordDraft, token: e.target.value })} placeholder={t.userResetTokenLabel} /></p>
        <p><input id="reset-new-password" name="nextPassword" type="password" autoComplete="new-password" value={resetPasswordDraft.nextPassword} onChange={(e) => setResetPasswordDraft({ ...resetPasswordDraft, nextPassword: e.target.value })} placeholder={t.userNewPasswordLabel} /></p>
        <p><button type="button" onClick={onResetPassword} disabled={busy}>{t.userPasswordResetApplyButton}</button></p>
      </div>
    </div>
  </section>
);
