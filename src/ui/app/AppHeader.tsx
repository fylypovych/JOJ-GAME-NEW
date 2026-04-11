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
  const { isAdminRoute, lang, setLang, activeUserTab, setActiveUserTab, gameUiVariant, setGameUiVariant, t } = props;
  const nextGameUiVariant = gameUiVariant === 'v1' ? 'v2' : 'v1';
  const nextGameUiLabel = nextGameUiVariant === 'v1' ? t.gameUiV1 : t.gameUiV2;

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
                className="ui-variant-btn"
                onClick={() => setGameUiVariant(nextGameUiVariant)}
                aria-label={nextGameUiVariant === 'v1' ? 'Switch to v1 game UI' : 'Switch to v2 game UI'}
                title={nextGameUiVariant === 'v1' ? 'Switch to v1 game UI' : 'Switch to v2 game UI'}
              >
                {nextGameUiVariant === 'v1' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M8 4.5V19.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M10.5 8H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M10.5 12H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M10.5 16H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="4" y="4" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="13" y="4" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="4" y="13" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="13" y="13" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
                <span className="sr-only">{nextGameUiLabel}</span>
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
