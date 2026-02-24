import { useState } from 'react';
import type { Language } from '../i18n';
import type { GitUpdateStatus } from './types';

type UseAdminGitActionsParams = {
  lang: Language;
  serverUrl: string;
  adminHeaders: () => Record<string, string>;
  setAdminActionError: (value: string) => void;
};

export const useAdminGitActions = ({
  lang,
  serverUrl,
  adminHeaders,
  setAdminActionError,
}: UseAdminGitActionsParams) => {
  const [gitStatus, setGitStatus] = useState<GitUpdateStatus | null>(null);
  const [gitStatusLoading, setGitStatusLoading] = useState<boolean>(false);
  const [gitUpdateRunning, setGitUpdateRunning] = useState<boolean>(false);
  const [gitDeployRunning, setGitDeployRunning] = useState<boolean>(false);
  const [gitActionMessage, setGitActionMessage] = useState<string>('');
  const [gitActionLog, setGitActionLog] = useState<string>('');

  const checkGitUpdates = async () => {
    setGitStatusLoading(true);
    setAdminActionError('');
    setGitActionMessage('');
    setGitActionLog('');
    try {
      const response = await fetch(`${serverUrl}/api/admin/git/status`, { headers: adminHeaders() });
      const payload = (await response.json()) as ({ ok?: boolean; error?: string; details?: string } & Partial<GitUpdateStatus>);
      if (!response.ok || !payload.ok) {
        setAdminActionError(payload.error ?? (lang === 'uk' ? 'Не вдалося перевірити оновлення' : 'Failed to check updates'));
        setGitActionLog(payload.details ?? payload.error ?? '');
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
    } catch {
      setAdminActionError(lang === 'uk' ? 'Не вдалося перевірити оновлення' : 'Failed to check updates');
      setGitActionLog('');
    } finally {
      setGitStatusLoading(false);
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
        setAdminActionError(payload.error ?? (lang === 'uk' ? 'Не вдалося оновити файли' : 'Failed to update files'));
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
      setAdminActionError(lang === 'uk' ? 'Не вдалося оновити файли' : 'Failed to update files');
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
        setAdminActionError(payload.error ?? (lang === 'uk' ? 'Не вдалося оновити/зібрати проект' : 'Failed to update/build project'));
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
      setGitActionMessage(
        payload.message ??
          (lang === 'uk'
            ? 'Оновлення, збірка і рестарт запущені'
            : 'Update, build and restart started'),
      );
      setTimeout(() => {
        void checkGitUpdates();
      }, 3000);
    } catch {
      setAdminActionError(lang === 'uk' ? 'Не вдалося оновити/зібрати проект' : 'Failed to update/build project');
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
    gitActionMessage,
    gitActionLog,
    setGitActionMessage,
    setGitActionLog,
    checkGitUpdates,
    applyGitUpdate,
    applyGitDeploy,
  };
};
