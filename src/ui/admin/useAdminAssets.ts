import { useState } from 'react';
import type { Language } from '../i18n';

type AdminJsonFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type AdminAssetItem = {
  path: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  kind: string;
  source: string;
  updatedAt: string;
  deletedAt: string | null;
};

const textByLang = (lang: Language) => ({
  loadFailed: lang === 'uk' ? 'Не вдалося завантажити metadata assets.' : 'Failed to load asset metadata.',
  cleanupFilesFailed: lang === 'uk' ? 'Не вдалося очистити зайві файли.' : 'Failed to clean orphaned files.',
  cleanupRecordsFailed: lang === 'uk' ? 'Не вдалося очистити биті записи metadata.' : 'Failed to clean orphaned metadata records.',
  cleanupFilesOk: lang === 'uk' ? 'Очищено зайві файли:' : 'Orphaned files cleaned:',
  cleanupRecordsOk: lang === 'uk' ? 'Очищено биті metadata-записи:' : 'Orphaned metadata records cleaned:',
});

export const useAdminAssets = (args: {
  lang: Language;
  serverUrl: string;
  adminJsonFetch: AdminJsonFetch;
}) => {
  const { lang, serverUrl, adminJsonFetch } = args;
  const t = textByLang(lang);
  const [assets, setAssets] = useState<AdminAssetItem[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState('');
  const [assetsStatus, setAssetsStatus] = useState('');
  const [assetsCleanupRunning, setAssetsCleanupRunning] = useState(false);

  const loadAssets = async () => {
    setAssetsLoading(true);
    setAssetsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/assets?kind=card-image&limit=12`);
      const payload = (await response.json()) as { ok?: boolean; error?: string; assets?: AdminAssetItem[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || t.loadFailed);
      setAssets(Array.isArray(payload.assets) ? payload.assets : []);
    } catch (error) {
      setAssetsError(String(error instanceof Error ? error.message : error));
    } finally {
      setAssetsLoading(false);
    }
  };

  const runCleanup = async (mode: 'files' | 'records') => {
    setAssetsCleanupRunning(true);
    setAssetsError('');
    setAssetsStatus('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/assets/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; cleaned?: number };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || (mode === 'files' ? t.cleanupFilesFailed : t.cleanupRecordsFailed));
      }
      setAssetsStatus(`${mode === 'files' ? t.cleanupFilesOk : t.cleanupRecordsOk} ${Number(payload.cleaned ?? 0)}`);
      await loadAssets();
    } catch (error) {
      setAssetsError(String(error instanceof Error ? error.message : error));
    } finally {
      setAssetsCleanupRunning(false);
    }
  };

  return {
    assets,
    assetsLoading,
    assetsError,
    assetsStatus,
    assetsCleanupRunning,
    loadAssets,
    cleanupOrphanedFiles: async () => runCleanup('files'),
    cleanupOrphanedRecords: async () => runCleanup('records'),
  };
};
