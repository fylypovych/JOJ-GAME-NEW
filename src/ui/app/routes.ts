import type { UserTab } from './model';

export const DEFAULT_PUBLIC_TAB: UserTab = 'games';

const TAB_PATHS: Record<UserTab, string> = {
  games: '/games',
  gallery: '/cards',
  rules: '/rules',
  profile: '/profile',
  statistics: '/statistics',
};

const PATH_TO_TAB = new Map<string, UserTab>([
  ['/', DEFAULT_PUBLIC_TAB],
  ['/games', 'games'],
  ['/cards', 'gallery'],
  ['/rules', 'rules'],
  ['/profile', 'profile'],
  ['/statistics', 'statistics'],
]);

export const getPublicTabPath = (tab: UserTab) => TAB_PATHS[tab];

export const getPublicTabFromPathname = (pathname: string): UserTab | null => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return PATH_TO_TAB.get(normalizedPath) ?? null;
};

export const getCanonicalPublicPath = (pathname: string, activeTab: UserTab): string => {
  if (pathname === '/') return getPublicTabPath(DEFAULT_PUBLIC_TAB);
  return getPublicTabPath(activeTab);
};
