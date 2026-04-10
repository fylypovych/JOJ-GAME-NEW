import { getPublicTabPath } from '../routes';
import type { UserTab } from '../routes';
import type { T, UiVariant } from './shared';

type UserTabsProps = {
  t: T;
  activeUserTab: UserTab;
  setActiveUserTab: (tab: UserTab) => void;
  uiVariant?: UiVariant;
};

export const UserTabs = ({ t, activeUserTab, setActiveUserTab, uiVariant = 'v2' }: UserTabsProps) => (
  <p className={`user-tabs user-tabs-v2${uiVariant === 'v1' ? ' user-tabs-v1' : ''}`}>
    <a
      href={getPublicTabPath('games')}
      onClick={(event) => {
        event.preventDefault();
        setActiveUserTab('games');
      }}
      aria-current={activeUserTab === 'games' ? 'page' : undefined}
      className={activeUserTab === 'games' ? 'is-active' : ''}
    >
      {t.userTabGames}
    </a>
    <a
      href={getPublicTabPath('gallery')}
      onClick={(event) => {
        event.preventDefault();
        setActiveUserTab('gallery');
      }}
      aria-current={activeUserTab === 'gallery' ? 'page' : undefined}
      className={activeUserTab === 'gallery' ? 'is-active' : ''}
    >
      {t.userTabGallery}
    </a>
    <a
      href={getPublicTabPath('rules')}
      onClick={(event) => {
        event.preventDefault();
        setActiveUserTab('rules');
      }}
      aria-current={activeUserTab === 'rules' ? 'page' : undefined}
      className={activeUserTab === 'rules' ? 'is-active' : ''}
    >
      {t.userTabRules}
    </a>
    <a
      href={getPublicTabPath('profile')}
      onClick={(event) => {
        event.preventDefault();
        setActiveUserTab('profile');
      }}
      aria-current={activeUserTab === 'profile' ? 'page' : undefined}
      className={activeUserTab === 'profile' ? 'is-active' : ''}
    >
      {t.userTabProfile}
    </a>
    <a
      href={getPublicTabPath('statistics')}
      onClick={(event) => {
        event.preventDefault();
        setActiveUserTab('statistics');
      }}
      aria-current={activeUserTab === 'statistics' ? 'page' : undefined}
      className={activeUserTab === 'statistics' ? 'is-active' : ''}
    >
      {t.userTabStatistics}
    </a>
  </p>
);
