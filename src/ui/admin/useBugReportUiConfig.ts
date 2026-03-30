import { useState } from 'react';
import type { Language } from '../i18n';

type AdminJsonFetch = (url: string, init?: RequestInit) => Promise<Response>;

const createErrors = (lang: Language) => ({
  load: lang === 'uk' ? 'Не вдалося завантажити налаштування іконки баг-репорту' : 'Failed to load bug report icon settings',
  save: lang === 'uk' ? 'Не вдалося зберегти налаштування іконки баг-репорту' : 'Failed to save bug report icon settings',
});

export const useBugReportUiConfig = (args: {
  lang: Language;
  serverUrl: string;
  adminJsonFetch: AdminJsonFetch;
}) => {
  const { lang, serverUrl, adminJsonFetch } = args;
  const errors = createErrors(lang);
  const [bugReportImagePath, setBugReportImagePath] = useState('');
  const [bugReportUiConfigLoading, setBugReportUiConfigLoading] = useState(false);
  const [bugReportUiConfigError, setBugReportUiConfigError] = useState('');
  const [bugReportUiConfigStatus, setBugReportUiConfigStatus] = useState('');

  const loadBugReportUiConfig = async () => {
    setBugReportUiConfigLoading(true);
    setBugReportUiConfigError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/bug-reports/ui-config`);
      const payload = (await response.json()) as { ok?: boolean; error?: string; imagePath?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.load);
      setBugReportImagePath(typeof payload.imagePath === 'string' ? payload.imagePath : '');
    } catch (error) {
      setBugReportUiConfigError(String(error instanceof Error ? error.message : error));
    } finally {
      setBugReportUiConfigLoading(false);
    }
  };

  const saveBugReportUiConfig = async (imagePath: string) => {
    setBugReportUiConfigLoading(true);
    setBugReportUiConfigError('');
    setBugReportUiConfigStatus('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/bug-reports/ui-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; imagePath?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.save);
      const nextPath = typeof payload.imagePath === 'string' ? payload.imagePath : imagePath;
      setBugReportImagePath(nextPath);
      setBugReportUiConfigStatus(lang === 'uk' ? 'Іконку баг-репорту збережено.' : 'Bug report icon saved.');
    } catch (error) {
      setBugReportUiConfigError(String(error instanceof Error ? error.message : error));
    } finally {
      setBugReportUiConfigLoading(false);
    }
  };

  return {
    bugReportImagePath,
    setBugReportImagePath,
    bugReportUiConfigLoading,
    bugReportUiConfigError,
    bugReportUiConfigStatus,
    loadBugReportUiConfig,
    saveBugReportUiConfig,
  };
};
