import type { Language } from '../i18n';
import { UserTabs } from './sections/user-tabs';
import type { UserTab } from './model';

type T = ReturnType<typeof import('../i18n').text>;

interface AppHeaderProps {
  isAdminRoute: boolean;
  lang: Language;
  setLang: (lang: Language) => void;
  activeUserTab: UserTab;
  setActiveUserTab: (tab: UserTab) => void;
  gameUiVariant: 'v1' | 'v2';
  setGameUiVariant: (variant: 'v1' | 'v2') => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  t: T;
}

export const AppHeader = (props: AppHeaderProps) => {
  const { isAdminRoute, lang, setLang, activeUserTab, setActiveUserTab, gameUiVariant, theme, setTheme, t } = props;

  if (isAdminRoute) {
    return (
      <header className="app-header app-header-admin">
        <h1>{t.adminTitle}</h1>
      </header>
    );
  }

  return (
    <section className={`app-top-toolbar app-top-toolbar-v2${gameUiVariant === 'v1' ? ' app-top-toolbar-v1' : ''}`}>
      <div className="app-top-toolbar-left">
        <UserTabs t={t} activeUserTab={activeUserTab} setActiveUserTab={setActiveUserTab} uiVariant={gameUiVariant} />
      </div>
      <div className="app-top-toolbar-right">
        <div className="app-top-row app-toolbar-controls">
          <div className="app-toolbar-group">
            <span className="app-toolbar-label">{t.language}:</span>
            <div className="app-toolbar-button-row">
              <button type="button" onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}>
                {lang === 'uk' ? t.langEn : t.langUk}
              </button>
            </div>
          </div>
          <div className="app-toolbar-group">
            <span className="app-toolbar-label">{t.gameUiLabel}:</span>
            <div className="app-toolbar-button-row app-toolbar-theme-switch">
              <button
                type="button"
                className="app-theme-icon-button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              >
                <img src={theme === 'light' ? '/ui-theme-day.png' : '/ui-theme-night.png'} alt="" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="app-toolbar-group">
            <a href="/admin" className="app-toolbar-link-button">
              {t.openAdmin}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
