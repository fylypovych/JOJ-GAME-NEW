import { useCallback } from 'react';
import type { AuthUser } from './useUserAccount';
import type { Language } from '../i18n';

export interface UseProfileHandlersArgs {
  user: AuthUser | null;
  lang: Language;
  loginDraft: { login: string; password: string };
  profileDraft: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  };
  passwordDraft: { currentPassword: string; nextPassword: string };
  loginUser: (draft: { login: string; password: string }) => Promise<void>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (profile: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    preferredLang: Language;
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  }) => Promise<void>;
  changePassword: (draft: { currentPassword: string; nextPassword: string }) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string>;
  refreshSessions: () => Promise<void>;
  logoutAllSessions: () => Promise<void>;
  logoutSession: (sessionId: string) => Promise<void>;
  setPlayerName: (value: string | ((prev: string) => string)) => void;
  setAuthErrorModal: (value: string) => void;
  setProfileScreen: (value: 'login' | 'register' | 'reset') => void;
  setProfileNotice: (value: string) => void;
  setLoginDraft: (value: { login: string; password: string }) => void;
  setProfileDraft: (value: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  }) => void;
  setPasswordDraft: (value: { currentPassword: string; nextPassword: string }) => void;
  setUserError: (value: string) => void;
  setUser: (value: AuthUser | null) => void;
  t: {
    userLoginSuccess: string;
    userLogoutSuccess: string;
    userProfileSaved: string;
    userPasswordChanged: string;
    userAvatarUploaded: string;
  };
};

export interface UseProfileHandlersResult {
  onLogin: () => void;
  onLogout: () => void;
  onSaveProfile: () => void;
  onChangePassword: () => void;
  onUploadAvatar: (file: File) => Promise<void>;
  onRefreshSessions: () => void;
  onLogoutAllSessions: () => void;
  onLogoutSession: (sessionId: string) => void;
  onOpenRegister: () => void;
}

export const useProfileHandlers = (args: UseProfileHandlersArgs): UseProfileHandlersResult => {
  const {
    user,
    lang,
    loginDraft,
    profileDraft,
    passwordDraft,
    loginUser,
    logoutUser,
    updateUserProfile,
    changePassword,
    uploadAvatar,
    refreshSessions,
    logoutAllSessions,
    logoutSession,
    setPlayerName,
    setAuthErrorModal,
    setProfileScreen,
    setProfileNotice,
    setLoginDraft,
    setProfileDraft,
    setPasswordDraft,
    setUserError,
    t,
  } = args;

  const onLogin = useCallback(() => {
    setProfileNotice('');
    void loginUser(loginDraft)
      .then(() => {
        setPlayerName((prev) => prev.trim() ? prev : loginDraft.login.trim());
        setAuthErrorModal('');
        setUserError('');
        setProfileNotice(t.userLoginSuccess);
      })
      .catch((error) => {
        const message = String(error instanceof Error ? error.message : error);
        setUserError(message);
        setAuthErrorModal(message);
      });
  }, [loginDraft, loginUser, setAuthErrorModal, setPlayerName, setProfileNotice, setUserError, t.userLoginSuccess]);

  const onLogout = useCallback(() => {
    setProfileNotice('');
    void logoutUser()
      .then(() => {
        setProfileScreen('login');
        setAuthErrorModal('');
        setLoginDraft({ login: '', password: '' });
        setProfileNotice(t.userLogoutSuccess ?? '');
      })
      .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
  }, [logoutUser, setAuthErrorModal, setLoginDraft, setProfileNotice, setProfileScreen, setUserError, t.userLogoutSuccess]);

  const onSaveProfile = useCallback(() => {
    setProfileNotice('');
    void updateUserProfile({ ...profileDraft, preferredLang: lang })
      .then(() => {
        const nextPlayerName = profileDraft.displayName.trim() || user?.username?.trim() || '';
        if (nextPlayerName) setPlayerName(nextPlayerName);
        setProfileNotice(t.userProfileSaved);
      })
      .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
  }, [profileDraft, lang, updateUserProfile, user?.username, setPlayerName, setProfileNotice, setUserError, t.userProfileSaved]);

  const onChangePassword = useCallback(() => {
    setProfileNotice('');
    void changePassword(passwordDraft)
      .then(() => {
        setPasswordDraft({ currentPassword: '', nextPassword: '' });
        setProfileNotice(t.userPasswordChanged);
      })
      .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
  }, [passwordDraft, changePassword, setPasswordDraft, setProfileNotice, setUserError, t.userPasswordChanged]);

  const onUploadAvatar = useCallback(async (file: File) => {
    setProfileNotice('');
    setUserError('');
    try {
      const nextAvatarUrl = await uploadAvatar(file);
      setProfileDraft((prev) => ({ ...prev, avatarUrl: nextAvatarUrl }));
      setProfileNotice(t.userAvatarUploaded);
    } catch (error) {
      setUserError(String(error instanceof Error ? error.message : error));
    }
  }, [uploadAvatar, setProfileDraft, setProfileNotice, setUserError, t.userAvatarUploaded]);

  const onRefreshSessions = useCallback(() => {
    void refreshSessions().catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
  }, [refreshSessions, setUserError]);

  const onLogoutAllSessions = useCallback(() => {
    void logoutAllSessions().catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
  }, [logoutAllSessions, setUserError]);

  const onLogoutSession = useCallback((sessionId: string) => {
    void logoutSession(sessionId).catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
  }, [logoutSession, setUserError]);

  const onOpenRegister = useCallback(() => {
    setProfileScreen('register');
  }, [setProfileScreen]);

  return {
    onLogin,
    onLogout,
    onSaveProfile,
    onChangePassword,
    onUploadAvatar,
    onRefreshSessions,
    onLogoutAllSessions,
    onLogoutSession,
    onOpenRegister,
  };
};
