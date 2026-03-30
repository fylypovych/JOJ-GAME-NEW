import { useEffect, useRef, useState } from 'react';
import type { Language } from '../i18n';
import type { GitAuthStatus, GitUpdateStatus } from './types';

type UseAdminGitActionsParams = {
  lang: Language;
  serverUrl: string;
  adminHeaders: () => Record<string, string>;
  setAdminActionError: (value: string) => void;
};

const createGitActionErrors = (lang: Language) => ({
  checkUpdates: lang === 'uk' ? 'Не вдалося перевірити оновлення' : 'Failed to check updates',
  updateFiles: lang === 'uk' ? 'Не вдалося оновити файли' : 'Failed to update files',
  deployProject: lang === 'uk' ? 'Не вдалося оновити або зібрати проєкт' : 'Failed to update/build project',
  authStatus: lang === 'uk' ? 'Не вдалося перевірити GitHub credentials' : 'Failed to check GitHub credentials',
  authSave: lang === 'uk' ? 'Не вдалося зберегти GitHub credentials' : 'Failed to save GitHub credentials',
  authClear: lang === 'uk' ? 'Не вдалося очистити GitHub credentials' : 'Failed to clear GitHub credentials',
});

const normalizeGitAuthStatus = (payload: Partial<GitAuthStatus>): GitAuthStatus => ({
  helper: payload.helper ?? '',
  helperConfigured: Boolean(payload.helperConfigured),
  hasGithubCredentials: Boolean(payload.hasGithubCredentials),
  savedUsername: payload.savedUsername ?? '',
  credentialsPath: payload.credentialsPath ?? '',
  remoteAuthMode: payload.remoteAuthMode === 'ssh' || payload.remoteAuthMode === 'other' ? payload.remoteAuthMode : 'https',
});

export const useAdminGitActions = ({
  lang,
  serverUrl,
  adminHeaders,
  setAdminActionError,
}: UseAdminGitActionsParams) => {
  const gitActionErrors = createGitActionErrors(lang);
  const [gitStatus, setGitStatus] = useState<GitUpdateStatus | null>(null);
  const [gitStatusLoading, setGitStatusLoading] = useState<boolean>(false);
  const [gitUpdateRunning, setGitUpdateRunning] = useState<boolean>(false);
  const [gitDeployRunning, setGitDeployRunning] = useState<boolean>(false);
  const [gitAuthStatus, setGitAuthStatus] = useState<GitAuthStatus | null>(null);
  const [gitAuthStatusLoading, setGitAuthStatusLoading] = useState<boolean>(false);
  const [gitAuthSaving, setGitAuthSaving] = useState<boolean>(false);
  const [gitAuthUsernameDraft, setGitAuthUsernameDraft] = useState<string>('');
  const [gitAuthTokenDraft, setGitAuthTokenDraft] = useState<string>('');
  const [gitActionMessage, setGitActionMessage] = useState<string>('');
  const [gitActionLog, setGitActionLog] = useState<string>('');
  const deployRecoveryTimersRef = useRef<number[]>([]);
  const deployRecoveryActiveRef = useRef<boolean>(false);

  useEffect(() => () => {
    deployRecoveryTimersRef.current.forEach((id) => window.clearTimeout(id));
    deployRecoveryTimersRef.current = [];
  }, []);

  const clearDeployRecoveryTimers = () => {
    deployRecoveryTimersRef.current.forEach((id) => window.clearTimeout(id));
    deployRecoveryTimersRef.current = [];
  };

  const checkGitUpdates = async (opts?: { silentDuringExpectedRestart?: boolean; preserveMessages?: boolean }) => {
    const silentDuringExpectedRestart = Boolean(opts?.silentDuringExpectedRestart);
    const preserveMessages = Boolean(opts?.preserveMessages);
    setGitStatusLoading(true);
    setAdminActionError('');
    if (!preserveMessages) {
      setGitActionMessage('');
      setGitActionLog('');
    }
    try {
      const response = await fetch(`${serverUrl}/api/admin/git/status`, { headers: adminHeaders(), credentials: 'include' });
      const payload = (await response.json()) as ({ ok?: boolean; error?: string; details?: string } & Partial<GitUpdateStatus>);
      if (!response.ok || !payload.ok) {
        if (!silentDuringExpectedRestart) {
          setAdminActionError(payload.error ?? gitActionErrors.checkUpdates);
          setGitActionLog(payload.details ?? payload.error ?? '');
        }
        return;
      }
      setGitStatus({
        branch: payload.branch ?? '',
        remote: payload.remote ?? '',
        upstream: payload.upstream ?? '',
        ahead: Number(payload.ahead ?? 0),
        behind: Number(payload.behind ?? 0),
        dirty: Boolean(payload.dirty),
        canUpdate: Boolean(payload.canUpdate),
        head: payload.head ?? '',
        note: payload.note,
      });
      setGitActionMessage(lang === 'uk' ? 'Стан репозиторію оновлено' : 'Repository status updated');
      if (deployRecoveryActiveRef.current) {
        deployRecoveryActiveRef.current = false;
        clearDeployRecoveryTimers();
        setGitActionMessage(lang === 'uk' ? 'Сервер перезапущено, статус оновлено' : 'Server restarted, status updated');
      }
    } catch {
      if (!silentDuringExpectedRestart) {
        setAdminActionError(gitActionErrors.checkUpdates);
        setGitActionLog('');
      }
    } finally {
      setGitStatusLoading(false);
    }
  };

  const loadGitAuthStatus = async (opts?: { preserveMessages?: boolean }) => {
    const preserveMessages = Boolean(opts?.preserveMessages);
    setGitAuthStatusLoading(true);
    setAdminActionError('');
    if (!preserveMessages) {
      setGitActionMessage('');
      setGitActionLog('');
    }
    try {
      const response = await fetch(`${serverUrl}/api/admin/git/auth-status`, { headers: adminHeaders(), credentials: 'include' });
      const payload = (await response.json()) as ({ ok?: boolean; error?: string; details?: string } & Partial<GitAuthStatus>);
      if (!response.ok || !payload.ok) {
        setAdminActionError(payload.error ?? gitActionErrors.authStatus);
        setGitActionLog(payload.details ?? payload.error ?? '');
        return;
      }
      const nextStatus = normalizeGitAuthStatus(payload);
      setGitAuthStatus(nextStatus);
      setGitAuthUsernameDraft((prev) => prev.trim() ? prev : nextStatus.savedUsername);
      if (!preserveMessages) setGitActionMessage(lang === 'uk' ? 'Стан GitHub credentials оновлено' : 'GitHub credentials status updated');
    } catch {
      setAdminActionError(gitActionErrors.authStatus);
      setGitActionLog('');
    } finally {
      setGitAuthStatusLoading(false);
    }
  };

  const saveGitAuthConfig = async () => {
    setGitAuthSaving(true);
    setAdminActionError('');
    setGitActionMessage('');
    setGitActionLog('');
    try {
      const response = await fetch(`${serverUrl}/api/admin/git/auth-configure`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...adminHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save',
          username: gitAuthUsernameDraft,
          token: gitAuthTokenDraft,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        details?: string;
        message?: string;
        status?: GitAuthStatus;
      };
      if (!response.ok || !payload.ok) {
        setAdminActionError(payload.error ?? gitActionErrors.authSave);
        setGitActionLog(payload.details ?? payload.error ?? '');
        return;
      }
      if (payload.status) setGitAuthStatus(normalizeGitAuthStatus(payload.status));
      setGitAuthTokenDraft('');
      setGitActionMessage(payload.message ?? (lang === 'uk' ? 'GitHub credentials збережено' : 'GitHub credentials saved'));
    } catch {
      setAdminActionError(gitActionErrors.authSave);
      setGitActionLog('');
    } finally {
      setGitAuthSaving(false);
    }
  };

  const clearGitAuthConfig = async () => {
    setGitAuthSaving(true);
    setAdminActionError('');
    setGitActionMessage('');
    setGitActionLog('');
    try {
      const response = await fetch(`${serverUrl}/api/admin/git/auth-configure`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...adminHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ action: 'clear' }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        details?: string;
        message?: string;
        status?: GitAuthStatus;
      };
      if (!response.ok || !payload.ok) {
        setAdminActionError(payload.error ?? gitActionErrors.authClear);
        setGitActionLog(payload.details ?? payload.error ?? '');
        return;
      }
      if (payload.status) setGitAuthStatus(normalizeGitAuthStatus(payload.status));
      setGitAuthTokenDraft('');
      setGitActionMessage(payload.message ?? (lang === 'uk' ? 'GitHub credentials очищено' : 'GitHub credentials cleared'));
    } catch {
      setAdminActionError(gitActionErrors.authClear);
      setGitActionLog('');
    } finally {
      setGitAuthSaving(false);
    }
  };

  const applyGitUpdate = async () => {
    setGitUpdateRunning(true);
    setAdminActionError('');
    setGitActionMessage('');
    setGitActionLog('');
    try {
      const response = await fetch(`${serverUrl}/api/admin/git/update`, {
        method: 'POST',
        headers: adminHeaders(),
        credentials: 'include',
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        updated?: boolean;
        status?: GitUpdateStatus;
        output?: string;
        details?: string;
      };
      if (!response.ok || !payload.ok) {
        setAdminActionError(payload.error ?? gitActionErrors.updateFiles);
        setGitActionLog(payload.details ?? payload.error ?? '');
        return;
      }
      if (payload.status) setGitStatus(payload.status);
      if (payload.output) setGitActionLog(payload.output);
      setGitActionMessage(
        payload.message ??
          (payload.updated
            ? (lang === 'uk' ? 'Оновлення застосовано' : 'Update applied')
            : (lang === 'uk' ? 'Оновлення відсутні' : 'Already up to date')),
      );
    } catch {
      setAdminActionError(gitActionErrors.updateFiles);
      setGitActionLog('');
    } finally {
      setGitUpdateRunning(false);
    }
  };

  const applyGitDeploy = async () => {
    setGitDeployRunning(true);
    setAdminActionError('');
    setGitActionMessage('');
    setGitActionLog('');
    try {
      const response = await fetch(`${serverUrl}/api/admin/git/deploy`, {
        method: 'POST',
        headers: adminHeaders(),
        credentials: 'include',
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        status?: GitUpdateStatus;
        steps?: Array<{ step?: string; output?: string }>;
        details?: string;
      };
      if (!response.ok || !payload.ok) {
        setAdminActionError(payload.error ?? gitActionErrors.deployProject);
        setGitActionLog(payload.details ?? payload.error ?? '');
        return;
      }
      if (payload.status) setGitStatus(payload.status);
      if (Array.isArray(payload.steps)) {
        setGitActionLog(
          payload.steps
            .map((step) => `$ ${step.step ?? ''}\n${(step.output ?? '').trim()}`.trim())
            .join('\n\n')
            .trim(),
        );
      }
      deployRecoveryActiveRef.current = true;
      setGitActionMessage(
        payload.message ??
          (lang === 'uk'
            ? 'Оновлення, збірка і рестарт запущені. Сервер перезапускається, оновіть сторінку через 5-10 секунд.'
            : 'Update, build and restart started. Server is restarting; refresh the page in 5-10 seconds.'),
      );
      clearDeployRecoveryTimers();
      [5000, 10000, 20000].forEach((delayMs) => {
        const timerId = window.setTimeout(() => {
          void checkGitUpdates({ silentDuringExpectedRestart: true, preserveMessages: true });
        }, delayMs);
        deployRecoveryTimersRef.current.push(timerId);
      });
    } catch {
      setAdminActionError(gitActionErrors.deployProject);
      setGitActionLog('');
    } finally {
      setGitDeployRunning(false);
    }
  };

  return {
    gitStatus,
    gitStatusLoading,
    gitUpdateRunning,
    gitDeployRunning,
    gitAuthStatus,
    gitAuthStatusLoading,
    gitAuthSaving,
    gitAuthUsernameDraft,
    setGitAuthUsernameDraft,
    gitAuthTokenDraft,
    setGitAuthTokenDraft,
    gitActionMessage,
    gitActionLog,
    setGitActionMessage,
    setGitActionLog,
    loadGitAuthStatus,
    saveGitAuthConfig,
    clearGitAuthConfig,
    checkGitUpdates,
    applyGitUpdate,
    applyGitDeploy,
  };
};
