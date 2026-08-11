import { useMemo, useState } from 'react';
import { text } from '../../i18n';
import { AdminEmptyState, AdminSectionHeader, AdminStatusBadge } from '../components/AdminWorkspaceLayout';

type T = ReturnType<typeof text>;

type Asset = { path: string; mime: string; sizeBytes: number; updatedAt: string };

export const AdminSystemAdminTab = ({
  t, lang, serverUrl: _serverUrl, onResetAll, regenerateAllTemplateImages,
  imageRegenRunning, restartingServer, setAdminActionError, setRestartingServer,
  onRestartServer, adminActionError, assets, assetsLoading, assetsError,
  assetsStatus, assetsCleanupRunning, onRefreshAssets, onCleanupOrphanedFiles,
  onCleanupOrphanedRecords,
}: {
  t: T;
  lang: 'uk' | 'en';
  serverUrl: string;
  onResetAll: () => void;
  regenerateAllTemplateImages: () => Promise<void> | void;
  imageRegenRunning: boolean;
  restartingServer: boolean;
  setAdminActionError: (value: string) => void;
  setRestartingServer: (value: boolean) => void;
  onRestartServer: () => Promise<boolean>;
  adminActionError: string;
  assets: Asset[];
  assetsLoading: boolean;
  assetsError: string;
  assetsStatus: string;
  assetsCleanupRunning: boolean;
  onRefreshAssets: () => Promise<void> | void;
  onCleanupOrphanedFiles: () => Promise<void> | void;
  onCleanupOrphanedRecords: () => Promise<void> | void;
}) => {
  const [section, setSection] = useState<'assets' | 'maintenance' | 'danger'>('assets');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const totalBytes = useMemo(() => assets.reduce((sum, asset) => sum + asset.sizeBytes, 0), [assets]);
  const labels = lang === 'uk' ? {
    assets: 'Файлові ресурси', maintenance: 'Обслуговування', danger: 'Небезпечна зона',
    hint: 'Системні операції та обслуговування сервера.', refresh: 'Оновити список',
    filesHint: 'Файли зберігаються у public/card-assets, а їхні метадані — у базі даних.',
    orphanFiles: 'Очистити зайві файли', orphanRecords: 'Очистити зайві записи',
    confirm: 'Для повного скидання введіть RESET', resetPlaceholder: 'Введіть RESET',
  } : {
    assets: 'File assets', maintenance: 'Maintenance', danger: 'Danger zone',
    hint: 'System operations and server maintenance.', refresh: 'Refresh list',
    filesHint: 'Files stay in public/card-assets while their metadata is stored in the database.',
    orphanFiles: 'Clean orphaned files', orphanRecords: 'Clean orphaned records',
    confirm: 'Type RESET to confirm a full reset', resetPlaceholder: 'Type RESET',
  };
  const restart = () => {
    setAdminActionError('');
    setRestartingServer(true);
    void onRestartServer().then((ok) => {
      setRestartingServer(false);
      if (!ok) setAdminActionError(t.restartServerFailed);
    });
  };
  return (
    <div className="admin-system-workspace">
      <AdminSectionHeader title={t.tabSystemAdmin} description={labels.hint} actions={<><AdminStatusBadge tone="success">{assets.length} assets</AdminStatusBadge><code>/admin</code></>} />
      <nav className="admin-detail-tabs" aria-label={t.tabSystemAdmin}>
        {(['assets', 'maintenance', 'danger'] as const).map((id) => <button key={id} type="button" className={section === id ? 'is-active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{labels[id]}</button>)}
      </nav>

      {section === 'assets' ? (
        <div className="admin-operation-panel">
          <AdminSectionHeader title={labels.assets} description={labels.filesHint} actions={<><AdminStatusBadge tone="info">{Math.max(0, Math.round(totalBytes / 1024 / 1024 * 10) / 10)} MB</AdminStatusBadge><button type="button" onClick={() => void onRefreshAssets()} disabled={assetsLoading}>{labels.refresh}</button></>} />
          {assetsStatus ? <p className="admin-success">{assetsStatus}</p> : null}
          {assetsError ? <p className="admin-error">{assetsError}</p> : null}
          <div className="admin-asset-list">
            {assets.length === 0 ? <AdminEmptyState>{assetsLoading ? '…' : t.simulationNoData}</AdminEmptyState> : assets.map((asset) => (
              <article key={asset.path} className="admin-detail-list-row"><div><strong><code>{asset.path}</code></strong><small>{asset.mime} · {Math.max(1, Math.round(asset.sizeBytes / 1024))} KB</small></div><time>{new Date(asset.updatedAt).toLocaleString()}</time></article>
            ))}
          </div>
        </div>
      ) : null}

      {section === 'maintenance' ? (
        <div className="admin-operation-panel">
          <AdminSectionHeader title={labels.maintenance} description={t.systemActions} />
          <div className="admin-action-card-grid">
            <article><strong>{t.regenerateImages}</strong><p>{labels.filesHint}</p><button type="button" onClick={() => void regenerateAllTemplateImages()} disabled={imageRegenRunning}>{imageRegenRunning ? t.regenerateImagesRunning : t.regenerateImages}</button></article>
            <article><strong>{labels.orphanFiles}</strong><p>{labels.filesHint}</p><button type="button" onClick={() => { if (window.confirm(`${labels.orphanFiles}?`)) void onCleanupOrphanedFiles(); }} disabled={assetsCleanupRunning}>{labels.orphanFiles}</button></article>
            <article><strong>{labels.orphanRecords}</strong><p>{labels.filesHint}</p><button type="button" onClick={() => { if (window.confirm(`${labels.orphanRecords}?`)) void onCleanupOrphanedRecords(); }} disabled={assetsCleanupRunning}>{labels.orphanRecords}</button></article>
          </div>
        </div>
      ) : null}

      {section === 'danger' ? (
        <div className="admin-danger-zone">
          <AdminSectionHeader title={labels.danger} description={labels.confirm} />
          <label>{labels.confirm}<input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} placeholder={labels.resetPlaceholder} /></label>
          <div className="admin-action-group">
            <button type="button" className="admin-danger-action" onClick={() => { onResetAll(); setResetConfirmation(''); }} disabled={resetConfirmation !== 'RESET'}>{t.resetAll}</button>
            <button type="button" className="admin-danger-action" onClick={() => { if (window.confirm(`${t.restartServer}?`)) restart(); }} disabled={restartingServer}>{restartingServer ? t.restartingServer : t.restartServer}</button>
          </div>
          {adminActionError ? <p className="admin-error">{adminActionError}</p> : null}
        </div>
      ) : null}
    </div>
  );
};
