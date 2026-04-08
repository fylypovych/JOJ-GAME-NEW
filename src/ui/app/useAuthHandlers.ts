import { useCallback } from 'react';

export interface UseAuthHandlersArgs {
  registerDraft: { username: string; email: string; password: string; displayName: string };
  resetRequestDraft: { login: string };
  resetPasswordDraft: { token: string; nextPassword: string };
  registerUser: (draft: { username: string; email: string; password: string; displayName: string }) => Promise<void>;
  requestPasswordReset: (login: string) => Promise<void>;
  resetPassword: (draft: { token: string; nextPassword: string }) => Promise<void>;
  setProfileScreen: (value: 'login' | 'register' | 'reset') => void;
  setUserError: (value: string) => void;
}

export interface UseAuthHandlersResult {
  onRegister: () => void;
  onBackToLogin: () => void;
  onRequestPasswordReset: () => void;
  onResetPassword: () => void;
  onOpenPasswordReset: () => void;
}

export const useAuthHandlers = (args: UseAuthHandlersArgs): UseAuthHandlersResult => {
  const {
    registerDraft,
    resetRequestDraft,
    resetPasswordDraft,
    registerUser,
    requestPasswordReset,
    resetPassword,
    setProfileScreen,
    setUserError,
  } = args;

  const onRegister = useCallback(() => {
    void registerUser(registerDraft)
      .then(() => setProfileScreen('login'))
      .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
  }, [registerDraft, registerUser, setProfileScreen, setUserError]);

  const onBackToLogin = useCallback(() => {
    setProfileScreen('login');
  }, [setProfileScreen]);

  const onRequestPasswordReset = useCallback(() => {
    void requestPasswordReset(resetRequestDraft.login)
      .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
  }, [resetRequestDraft.login, requestPasswordReset, setUserError]);

  const onResetPassword = useCallback(() => {
    void resetPassword(resetPasswordDraft)
      .then(() => setProfileScreen('login'))
      .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
  }, [resetPasswordDraft, resetPassword, setProfileScreen, setUserError]);

  const onOpenPasswordReset = useCallback(() => {
    setProfileScreen('reset');
  }, [setProfileScreen]);

  return {
    onRegister,
    onBackToLogin,
    onRequestPasswordReset,
    onResetPassword,
    onOpenPasswordReset,
  };
};
