import { useUserAccount } from './useUserAccount';
import { useAdminAuth } from './useAdminAuth';
import type { Language } from '../i18n';
import { DEFAULT_SERVER_URL, SERVER_URL_STORAGE_KEY } from './model';

export interface UseAppUserStateArgs {
  serverUrl: string;
  lang: Language;
  isAdminRoute: boolean;
  t: {
    adminUnauthorized: string;
    serverUnavailable: string;
  };
}

export interface UseAppUserStateResult {
  // User account
  user: ReturnType<typeof useUserAccount>['user'];
  userStats: ReturnType<typeof useUserAccount>['stats'];
  userAwards: ReturnType<typeof useUserAccount>['awards'];
  matchHistory: ReturnType<typeof useUserAccount>['matchHistory'];
  userSessions: ReturnType<typeof useUserAccount>['sessions'];
  userLoading: ReturnType<typeof useUserAccount>['loading'];
  userBusy: ReturnType<typeof useUserAccount>['busy'];
  userError: ReturnType<typeof useUserAccount>['error'];
  setUserError: ReturnType<typeof useUserAccount>['setError'];
  registerUser: ReturnType<typeof useUserAccount>['register'];
  loginUser: ReturnType<typeof useUserAccount>['login'];
  logoutUser: ReturnType<typeof useUserAccount>['logout'];
  updateUserProfile: ReturnType<typeof useUserAccount>['updateProfile'];
  uploadAvatar: ReturnType<typeof useUserAccount>['uploadAvatar'];
  changePassword: ReturnType<typeof useUserAccount>['changePassword'];
  requestPasswordReset: ReturnType<typeof useUserAccount>['requestPasswordReset'];
  resetPassword: ReturnType<typeof useUserAccount>['resetPassword'];
  refreshSessions: ReturnType<typeof useUserAccount>['refreshSessions'];
  logoutAllSessions: ReturnType<typeof useUserAccount>['logoutAllSessions'];
  logoutSession: ReturnType<typeof useUserAccount>['logoutSession'];
  bindMatchSession: ReturnType<typeof useUserAccount>['bindMatchSession'];

  // Admin auth
  adminAuthChecking: ReturnType<typeof useAdminAuth>['adminAuthChecking'];
  adminAuthorized: ReturnType<typeof useAdminAuth>['adminAuthorized'];
  adminAuthEnabled: ReturnType<typeof useAdminAuth>['adminAuthEnabled'];
  adminAuthError: ReturnType<typeof useAdminAuth>['adminAuthError'];
  adminFetch: ReturnType<typeof useAdminAuth>['adminFetch'];
  verifyAdminToken: ReturnType<typeof useAdminAuth>['verifyAdminToken'];
}

export const useAppUserState = (args: UseAppUserStateArgs): UseAppUserStateResult => {
  const { serverUrl, lang, isAdminRoute, t } = args;

  const {
    user,
    stats: userStats,
    awards: userAwards,
    matchHistory,
    sessions: userSessions,
    loading: userLoading,
    busy: userBusy,
    error: userError,
    setError: setUserError,
    register: registerUser,
    login: loginUser,
    logout: logoutUser,
    updateProfile: updateUserProfile,
    uploadAvatar,
    changePassword,
    requestPasswordReset,
    resetPassword,
    refreshSessions,
    logoutAllSessions,
    logoutSession,
    bindMatchSession,
  } = useUserAccount({ serverUrl, lang });

  const {
    adminAuthChecking,
    adminAuthorized,
    adminAuthEnabled,
    adminAuthError,
    adminFetch,
    verifyAdminToken,
  } = useAdminAuth({
    isAdminRoute,
    serverUrl,
    defaultServerUrl: DEFAULT_SERVER_URL,
    serverUrlStorageKey: SERVER_URL_STORAGE_KEY,
    unauthorizedText: t.adminUnauthorized,
    serverUnavailableText: t.serverUnavailable,
  });

  return {
    user,
    userStats,
    userAwards,
    matchHistory,
    userSessions,
    userLoading,
    userBusy,
    userError,
    setUserError,
    registerUser,
    loginUser,
    logoutUser,
    updateUserProfile,
    uploadAvatar,
    changePassword,
    requestPasswordReset,
    resetPassword,
    refreshSessions,
    logoutAllSessions,
    logoutSession,
    bindMatchSession,
    adminAuthChecking,
    adminAuthorized,
    adminAuthEnabled,
    adminAuthError,
    adminFetch,
    verifyAdminToken,
  };
};
