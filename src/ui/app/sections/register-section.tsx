import type { T, UiVariant } from './shared';

type RegisterDraft = { username: string; email: string; password: string; displayName: string };

type RegisterSectionProps = {
  t: T;
  busy: boolean;
  error: string;
  registerDraft: RegisterDraft;
  setRegisterDraft: (value: RegisterDraft) => void;
  onRegister: () => void;
  onBackToLogin: () => void;
  uiVariant?: UiVariant;
};

export const RegisterSection = ({
  t,
  busy,
  error,
  registerDraft,
  setRegisterDraft,
  onRegister,
  onBackToLogin,
  uiVariant = 'v2',
}: RegisterSectionProps) => (
  <section className={`board board-v2-panel board-v2-auth-shell${uiVariant === 'v1' ? ' board-v1-panel board-v1-auth-shell' : ''}`}>
    <h2>{t.userRegisterTitle}</h2>
    {error ? <p className="admin-error">{error}</p> : null}
    <div className="auth-shell">
      <div className={`auth-card board-v2-auth-card${uiVariant === 'v1' ? ' board-v1-auth-card' : ''}`}>
        <p><input id="register-username" name="username" autoComplete="username" value={registerDraft.username} onChange={(e) => setRegisterDraft({ ...registerDraft, username: e.target.value })} placeholder={t.userUsernameLabel} /></p>
        <p><input id="register-displayName" name="displayName" autoComplete="name" value={registerDraft.displayName} onChange={(e) => setRegisterDraft({ ...registerDraft, displayName: e.target.value })} placeholder={t.userDisplayNameLabel} /></p>
        <p><input id="register-email" name="email" type="email" autoComplete="email" value={registerDraft.email} onChange={(e) => setRegisterDraft({ ...registerDraft, email: e.target.value })} placeholder={t.userEmailLabel} /></p>
        <p><input id="register-password" name="password" type="password" autoComplete="new-password" value={registerDraft.password} onChange={(e) => setRegisterDraft({ ...registerDraft, password: e.target.value })} placeholder={t.userPasswordLabel} /></p>
        <p className="admin-controls">
          <button type="button" onClick={onRegister} disabled={busy}>{t.userRegisterButton}</button>
          <button type="button" onClick={onBackToLogin} disabled={busy}>{t.userGoToLoginButton}</button>
        </p>
      </div>
    </div>
  </section>
);
