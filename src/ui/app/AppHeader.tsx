import type { Language } from '../i18n';
import { UserTabs } from './sections';
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
  t: T;
}

export const AppHeader = (props: AppHeaderProps) => {
  const { isAdminRoute, lang, setLang, activeUserTab, setActiveUserTab, gameUiVariant, setGameUiVariant, t } = props;

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
              <button type="button" onClick={() => setLang('uk')} disabled={lang === 'uk'}>
                {t.langUk}
              </button>
              <button type="button" onClick={() => setLang('en')} disabled={lang === 'en'}>
                {t.langEn}
              </button>
            </div>
          </div>
          <div className="app-toolbar-group">
            <span className="app-toolbar-label">{t.gameUiLabel}:</span>
            <div className="app-toolbar-button-row app-toolbar-theme-switch">
              <button
                type="button"
                className="ui-variant-btn ui-variant-v1"
                onClick={() => setGameUiVariant('v1')}
                disabled={gameUiVariant === 'v1'}
                title={t.gameUiV1}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <rect x="5" y="5" width="6" height="14" rx="1"/>
                  <rect x="13" y="5" width="6" height="8" rx="1"/>
                </svg>
              </button>
              <button
                type="button"
                className="ui-variant-btn ui-variant-v2"
                onClick={() => setGameUiVariant('v2')}
                disabled={gameUiVariant === 'v2'}
                title={t.gameUiV2}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <rect x="5" y="5" width="14" height="6" rx="1"/>
                  <rect x="5" y="13" width="14" height="6" rx="1"/>
                </svg>
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
