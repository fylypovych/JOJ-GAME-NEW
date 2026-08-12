import { useEffect, useState } from 'react';
import { DEFAULT_LOBBY_GAME_UI_CONFIG } from '../../game/lobbyConfig';
import type { BotDifficulty, BotProfile, GameMode } from '../../game/types';
import type { Language } from '../i18n';
import { defaultLanguage } from '../i18n';
import { ADMIN_UI_VARIANT_STORAGE_KEY, GAME_UI_VARIANT_STORAGE_KEY, LEGACY_ADMIN_UI_VARIANT_STORAGE_KEY } from './clientConfig';
import { DEFAULT_PUBLIC_TAB, getCanonicalPublicPath, getPublicTabFromPathname } from './routes';
import {
  PLAYER_NAME_STORAGE_KEY,
  SERVER_URL_STORAGE_KEY,
  galleryCategories,
  type GalleryCategoryFilter,
  type UserTab,
} from './model';

export const useAppShellState = (serverUrl: string) => {
  const [lang, setLang] = useState<Language>(() => {
    const stored = window.localStorage.getItem('joj-lang');
    return stored === 'en' || stored === 'uk' ? stored : defaultLanguage;
  });
  const [playerName, setPlayerName] = useState<string>(() => window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? '');
  const [roomCapacity, setRoomCapacity] = useState<number>(DEFAULT_LOBBY_GAME_UI_CONFIG.defaultRoomCapacity);
  const [gameMode, setGameMode] = useState<GameMode>('standard');
  const [createWithBots, setCreateWithBots] = useState(false);
  const [botCount, setBotCount] = useState(1);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('easy');
  const [botProfile, setBotProfile] = useState<BotProfile>('balanced');
  const [selectedOptionalModuleIds, setSelectedOptionalModuleIds] = useState<string[]>(['vvnz_default']);
  const [adminSelectedMatchID, setAdminSelectedMatchID] = useState<string>('');
  const [activeUserTab, setActiveUserTab] = useState<UserTab>(() => (
    getPublicTabFromPathname(window.location.pathname) ?? DEFAULT_PUBLIC_TAB
  ));
  const [profileScreen, setProfileScreen] = useState<'login' | 'register' | 'reset'>('login');
  const [authErrorModal, setAuthErrorModal] = useState('');
  const [gameUiVariant, setGameUiVariant] = useState<'v1' | 'v2'>(() => {
    const raw = window.localStorage.getItem(GAME_UI_VARIANT_STORAGE_KEY);
    if (raw === 'v1' || raw === 'v5') return 'v1';
    return 'v2';
  });
  const [adminUiVariant, setAdminUiVariant] = useState<'v1' | 'v2'>(() => {
    const raw = window.localStorage.getItem(ADMIN_UI_VARIANT_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_ADMIN_UI_VARIANT_STORAGE_KEY);
    if (raw === 'v1' || raw === 'v5') return 'v1';
    return 'v2';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const raw = window.localStorage.getItem('joj-theme');
    return raw === 'dark' ? 'dark' : 'light';
  });
  const GALLERY_CATEGORY_FILTER_STORAGE_KEY = 'joj-gallery-category-filter';
  const [galleryCategoryFilter, setGalleryCategoryFilter] = useState<GalleryCategoryFilter>(() => {
    const stored = window.localStorage.getItem(GALLERY_CATEGORY_FILTER_STORAGE_KEY) as GalleryCategoryFilter | 'ALL' | null;
    return stored && stored !== 'ALL' && galleryCategories.includes(stored)
      ? stored
      : galleryCategories[0];
  });
  useEffect(() => {
    window.localStorage.setItem(GALLERY_CATEGORY_FILTER_STORAGE_KEY, galleryCategoryFilter);
  }, [galleryCategoryFilter]);
  const [deletingAdminMatch, setDeletingAdminMatch] = useState(false);
  const [loginDraft, setLoginDraft] = useState({ login: '', password: '' });
  const [registerDraft, setRegisterDraft] = useState({ username: '', email: '', password: '', displayName: '' });
  const [profileDraft, setProfileDraft] = useState({
    displayName: '',
    email: '',
    bio: '',
    avatarUrl: '',
    profilePublic: true,
    showStatsPublic: true,
    showRecentMatchesPublic: false,
  });
  const [profileNotice, setProfileNotice] = useState('');
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', nextPassword: '' });
  const [resetRequestDraft, setResetRequestDraft] = useState({ login: '' });
  const [resetPasswordDraft, setResetPasswordDraft] = useState({ token: '', nextPassword: '' });
  const [serverUrlDraft, setServerUrlDraft] = useState<string>(() => window.localStorage.getItem(SERVER_URL_STORAGE_KEY) ?? serverUrl);

  useEffect(() => {
    window.localStorage.setItem('joj-lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
  }, [playerName]);

  useEffect(() => {
    window.localStorage.setItem(GAME_UI_VARIANT_STORAGE_KEY, gameUiVariant);
  }, [gameUiVariant]);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_UI_VARIANT_STORAGE_KEY, adminUiVariant);
    window.localStorage.removeItem(LEGACY_ADMIN_UI_VARIANT_STORAGE_KEY);
  }, [adminUiVariant]);

  useEffect(() => {
    window.localStorage.setItem('joj-theme', theme);
    document.body.className = theme === 'dark' ? 'is-dark-theme' : '';
  }, [theme]);

  useEffect(() => {
    const handlePopState = () => {
      const nextTab = getPublicTabFromPathname(window.location.pathname);
      if (nextTab) {
        setActiveUserTab(nextTab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) return;

    const canonicalPath = getCanonicalPublicPath(window.location.pathname, activeUserTab);
    const nextUrl = `${canonicalPath}${window.location.search}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [activeUserTab]);

  return {
    lang,
    setLang,
    playerName,
    setPlayerName,
    roomCapacity,
    setRoomCapacity,
    gameMode,
    setGameMode,
    createWithBots,
    setCreateWithBots,
    botCount,
    setBotCount,
    botDifficulty,
    setBotDifficulty,
    botProfile,
    setBotProfile,
    selectedOptionalModuleIds,
    setSelectedOptionalModuleIds,
    adminSelectedMatchID,
    setAdminSelectedMatchID,
    activeUserTab,
    setActiveUserTab,
    profileScreen,
    setProfileScreen,
    authErrorModal,
    setAuthErrorModal,
    gameUiVariant,
    setGameUiVariant,
    adminUiVariant,
    setAdminUiVariant,
    theme,
    setTheme,
    galleryCategoryFilter,
    setGalleryCategoryFilter,
    deletingAdminMatch,
    setDeletingAdminMatch,
    loginDraft,
    setLoginDraft,
    registerDraft,
    setRegisterDraft,
    profileDraft,
    setProfileDraft,
    profileNotice,
    setProfileNotice,
    passwordDraft,
    setPasswordDraft,
    resetRequestDraft,
    setResetRequestDraft,
    resetPasswordDraft,
    setResetPasswordDraft,
    serverUrlDraft,
    setServerUrlDraft,
  };
};
