import type { UserTab as UserTabType } from './model';

export type UserTab = UserTabType;

export const DEFAULT_PUBLIC_TAB: UserTab = 'home';

const TAB_PATHS: Record<UserTab, string> = {
  home: '/',
  games: '/games',
  gallery: '/cards',
  rules: '/rules',
  downloads: '/downloads',
  profile: '/profile',
  statistics: '/statistics',
};

const PATH_TO_TAB = new Map<string, UserTab>([
  ['/', DEFAULT_PUBLIC_TAB],
  ['/home', 'home'],
  ['/games', 'games'],
  ['/cards', 'gallery'],
  ['/rules', 'rules'],
  ['/downloads', 'downloads'],
  ['/profile', 'profile'],
  ['/statistics', 'statistics'],
]);

export const getPublicTabPath = (tab: UserTab) => TAB_PATHS[tab];

export const getPublicTabFromPathname = (pathname: string): UserTab | null => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return PATH_TO_TAB.get(normalizedPath) ?? null;
};

export const getCanonicalPublicPath = (pathname: string, activeTab: UserTab): string => {
  if (pathname === '/') return '/';
  return getPublicTabPath(activeTab);
};
