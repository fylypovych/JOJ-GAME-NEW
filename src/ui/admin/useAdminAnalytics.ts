import { useState } from 'react';
import type { Language } from '../i18n';
import type { AdminAnalyticsSummary } from './types';

type AdminJsonFetch = (url: string, init?: RequestInit) => Promise<Response>;

const createAdminAnalyticsErrors = (lang: Language) => ({
  loadAnalytics: lang === 'uk' ? 'Не вдалося завантажити аналітику' : 'Failed to load analytics',
});

export const useAdminAnalytics = (args: {
  lang: Language;
  serverUrl: string;
  adminJsonFetch: AdminJsonFetch;
}) => {
  const { lang, serverUrl, adminJsonFetch } = args;
  const errors = createAdminAnalyticsErrors(lang);
  const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalyticsSummary | null>(null);
  const [adminAnalyticsLoading, setAdminAnalyticsLoading] = useState(false);
  const [adminAnalyticsError, setAdminAnalyticsError] = useState('');

  const refreshAdminAnalytics = async () => {
    setAdminAnalyticsLoading(true);
    setAdminAnalyticsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/analytics`);
      const payload = (await response.json()) as { ok?: boolean; error?: string; analytics?: AdminAnalyticsSummary | null };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.loadAnalytics);
      setAdminAnalytics(payload.analytics ?? null);
    } catch (error) {
      setAdminAnalyticsError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminAnalyticsLoading(false);
    }
  };

  return {
    adminAnalytics,
    adminAnalyticsLoading,
    adminAnalyticsError,
    refreshAdminAnalytics,
  };
};
