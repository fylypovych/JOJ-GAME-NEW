import { useEffect, useState } from 'react';
import type { Language } from '../i18n';

type AdminJsonFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type AdminBugReportStatus = 'new' | 'resolved' | 'closed';
export type AdminBugReportUiVariant = 'v3' | 'v4' | 'legacy' | 'unknown';

export type AdminBugReportListItem = {
  id: string;
  status: AdminBugReportStatus;
  descriptionPreview: string;
  hasScreenshot: boolean;
  createdAt: string;
  updatedAt: string;
  matchID: string | null;
  playerName: string | null;
  spectator: boolean;
  uiVariant: AdminBugReportUiVariant;
  lang: 'uk' | 'en';
  submittedBy: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
  };
};

export type AdminBugReportDetail = {
  id: string;
  status: AdminBugReportStatus;
  description: string;
  hasScreenshot: boolean;
  createdAt: string;
  updatedAt: string;
  pageUrl: string;
  matchID: string | null;
  playerID: string | null;
  playerName: string | null;
  spectator: boolean;
  uiVariant: AdminBugReportUiVariant;
  lang: 'uk' | 'en';
  userAgent: string;
  sourceIp: string;
  submittedBy: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
  };
};

const createErrors = (lang: Language) => ({
  loadList: lang === 'uk' ? 'Не вдалося завантажити баг-репорти' : 'Failed to load bug reports',
  loadDetail: lang === 'uk' ? 'Не вдалося завантажити деталі баг-репорту' : 'Failed to load bug report details',
  updateStatus: lang === 'uk' ? 'Не вдалося оновити статус баг-репорту' : 'Failed to update bug report status',
  loadImage: lang === 'uk' ? 'Не вдалося завантажити зображення баг-репорту' : 'Failed to load bug report image',
});

const normalizeBugReportUiVariant = (value: unknown): AdminBugReportUiVariant => {
  if (value === 'v3' || value === 'v4') return value;
  if (value === 'v1' || value === 'v2') return 'legacy';
  return 'unknown';
};

const normalizeBugReportListItem = (report: AdminBugReportListItem): AdminBugReportListItem => ({
  ...report,
  uiVariant: normalizeBugReportUiVariant(report.uiVariant),
});

const normalizeBugReportDetail = (report: AdminBugReportDetail): AdminBugReportDetail => ({
  ...report,
  uiVariant: normalizeBugReportUiVariant(report.uiVariant),
});

export const useAdminBugReports = (args: {
  lang: Language;
  serverUrl: string;
  adminJsonFetch: AdminJsonFetch;
}) => {
  const { lang, serverUrl, adminJsonFetch } = args;
  const errors = createErrors(lang);
  const [bugReports, setBugReports] = useState<AdminBugReportListItem[]>([]);
  const [bugReportsLoading, setBugReportsLoading] = useState(false);
  const [bugReportsError, setBugReportsError] = useState('');
  const [selectedBugReportId, setSelectedBugReportId] = useState('');
  const [selectedBugReport, setSelectedBugReport] = useState<AdminBugReportDetail | null>(null);
  const [bugReportImageUrl, setBugReportImageUrl] = useState('');

  useEffect(() => () => {
    if (bugReportImageUrl) URL.revokeObjectURL(bugReportImageUrl);
  }, [bugReportImageUrl]);

  const loadBugReports = async () => {
    setBugReportsLoading(true);
    setBugReportsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/bug-reports`);
      const payload = (await response.json()) as { ok?: boolean; error?: string; reports?: AdminBugReportListItem[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.loadList);
      setBugReports((payload.reports ?? []).map(normalizeBugReportListItem));
    } catch (error) {
      setBugReportsError(String(error instanceof Error ? error.message : error));
    } finally {
      setBugReportsLoading(false);
    }
  };

  const loadBugReportDetail = async (id: string) => {
    setSelectedBugReportId(id);
    if (!id) {
      setSelectedBugReport(null);
      if (bugReportImageUrl) URL.revokeObjectURL(bugReportImageUrl);
      setBugReportImageUrl('');
      return;
    }
    setBugReportsLoading(true);
    setBugReportsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/bug-reports/detail?id=${encodeURIComponent(id)}`);
      const payload = (await response.json()) as { ok?: boolean; error?: string; report?: AdminBugReportDetail };
      if (!response.ok || !payload.ok || !payload.report) throw new Error(payload.error || errors.loadDetail);
      setSelectedBugReport(normalizeBugReportDetail(payload.report));
      if (bugReportImageUrl) URL.revokeObjectURL(bugReportImageUrl);
      setBugReportImageUrl('');
      if (payload.report.hasScreenshot) {
        const imageResponse = await adminJsonFetch(`${serverUrl}/api/admin/bug-reports/image?id=${encodeURIComponent(id)}`);
        if (!imageResponse.ok) throw new Error(errors.loadImage);
        const blob = await imageResponse.blob();
        setBugReportImageUrl(URL.createObjectURL(blob));
      }
    } catch (error) {
      setBugReportsError(String(error instanceof Error ? error.message : error));
    } finally {
      setBugReportsLoading(false);
    }
  };

  const setBugReportStatus = async (status: AdminBugReportStatus) => {
    if (!selectedBugReportId) return;
    setBugReportsLoading(true);
    setBugReportsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/bug-reports/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedBugReportId, status }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.updateStatus);
      await loadBugReports();
      await loadBugReportDetail(selectedBugReportId);
    } catch (error) {
      setBugReportsError(String(error instanceof Error ? error.message : error));
      setBugReportsLoading(false);
    }
  };

  const closeBugReportDetail = () => {
    setSelectedBugReportId('');
    setSelectedBugReport(null);
    if (bugReportImageUrl) URL.revokeObjectURL(bugReportImageUrl);
    setBugReportImageUrl('');
    setBugReportsError('');
  };

  return {
    bugReports,
    bugReportsLoading,
    bugReportsError,
    selectedBugReportId,
    selectedBugReport,
    bugReportImageUrl,
    loadBugReports,
    loadBugReportDetail,
    setBugReportStatus,
    closeBugReportDetail,
  };
};
