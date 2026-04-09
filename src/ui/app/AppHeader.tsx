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
            <span className="app-toolbar-label">Тема:</span>
            <div className="app-toolbar-button-row">
              <button
                type="button"
                onClick={() => setGameUiVariant('v1')}
                disabled={gameUiVariant === 'v1'}
              >
                Світла
              </button>
              <button
                type="button"
                onClick={() => setGameUiVariant('v2')}
                disabled={gameUiVariant === 'v2'}
              >
                Темна
              </button>
            </div>
          </div>
          <div className="app-toolbar-group">
            <a href="/admin" className="app-toolbar-button">
              Адмін-панель
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
