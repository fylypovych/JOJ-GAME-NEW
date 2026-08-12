import { useState, useEffect, useRef } from 'react';
import { getPublicTabPath } from '../routes';
import type { UserTab } from '../routes';
import type { T, UiVariant } from './shared';

type UserTabsProps = {
  t: T;
  activeUserTab: UserTab;
  setActiveUserTab: (tab: UserTab) => void;
  uiVariant?: UiVariant;
};

export const UserTabs = ({ t, activeUserTab, setActiveUserTab, uiVariant = 'v2' }: UserTabsProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1200;
      setIsMobile(mobile);
      if (!mobile) setIsMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isMenuOpen &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleTabClick = (tab: UserTab) => {
    setActiveUserTab(tab);
    setIsMenuOpen(false);
  };

  const tabs = [
    { id: 'home', label: t.userTabHome, path: getPublicTabPath('home') },
    { id: 'games', label: t.userTabGames, path: getPublicTabPath('games') },
    { id: 'gallery', label: t.userTabGallery, path: getPublicTabPath('gallery') },
    { id: 'rules', label: t.userTabRules, path: getPublicTabPath('rules') },
    { id: 'downloads', label: t.userTabDownloads, path: getPublicTabPath('downloads') },
    { id: 'profile', label: t.userTabProfile, path: getPublicTabPath('profile') },
    { id: 'statistics', label: t.userTabStatistics, path: getPublicTabPath('statistics') },
  ] as const;

  if (!isMobile) {
    return (
      <p className={`user-tabs user-tabs-v2${uiVariant === 'v1' ? ' user-tabs-v1' : ''}`}>
        {tabs.map((tab) => (
          <a
            key={tab.id}
            href={tab.path}
            onClick={(event) => {
              event.preventDefault();
              setActiveUserTab(tab.id);
            }}
            aria-current={activeUserTab === tab.id ? 'page' : undefined}
            className={activeUserTab === tab.id ? 'is-active' : ''}
          >
            {tab.label}
          </a>
        ))}
      </p>
    );
  }

  return (
    <div className="user-tabs-mobile">
      <button
        ref={buttonRef}
        className={`hamburger-button ${isMenuOpen ? 'is-open' : ''}`}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-label="Меню навигации"
        aria-expanded={isMenuOpen}
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>
      {isMenuOpen && (
        <div ref={menuRef} className="mobile-menu-dropdown">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              href={tab.path}
              onClick={(event) => {
                event.preventDefault();
                handleTabClick(tab.id);
              }}
              className={activeUserTab === tab.id ? 'is-active' : ''}
            >
              {tab.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
