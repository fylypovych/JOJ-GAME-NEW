import { text } from '../../i18n';

type T = ReturnType<typeof text>;

export const AdminSystemAdminTab = ({
  t,
  lang: _lang,
  serverUrl: _serverUrl,
  onResetAll,
  regenerateAllTemplateImages,
  imageRegenRunning,
  restartingServer,
  setAdminActionError,
  setRestartingServer,
  onRestartServer,
  adminActionError,
  assets,
  assetsLoading,
  assetsError,
  assetsStatus,
  assetsCleanupRunning,
  onRefreshAssets,
  onCleanupOrphanedFiles,
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
  assets: Array<{
    path: string;
    mime: string;
    sizeBytes: number;
    updatedAt: string;
  }>;
  assetsLoading: boolean;
  assetsError: string;
  assetsStatus: string;
  assetsCleanupRunning: boolean;
  onRefreshAssets: () => Promise<void> | void;
  onCleanupOrphanedFiles: () => Promise<void> | void;
  onCleanupOrphanedRecords: () => Promise<void> | void;
}) => (
  <>
    <h3>{t.tabSystemAdmin}</h3>
    <p>{_lang === 'uk' ? 'Системні операції та обслуговування сервера.' : 'System operations and server maintenance.'}</p>
    <p>{t.adminPath}: <code>/admin</code></p>
    
    <h4>{_lang === 'uk' ? 'Файлові assets' : 'File assets'}</h4>
    <p>{_lang === 'uk' ? 'Файли лежать у public/card-assets, а metadata по них зберігається в БД.' : 'Files stay in public/card-assets while their metadata is stored in the database.'}</p>
    <p className="admin-controls">
      <button type="button" onClick={() => void onRefreshAssets()} disabled={assetsLoading}>
        {_lang === 'uk' ? 'Оновити список' : 'Refresh list'}
      </button>
      <button type="button" onClick={() => void onCleanupOrphanedFiles()} disabled={assetsCleanupRunning}>
        {_lang === 'uk' ? 'Очистити зайві файли' : 'Clean orphaned files'}
      </button>
      <button type="button" onClick={() => void onCleanupOrphanedRecords()} disabled={assetsCleanupRunning}>
        {_lang === 'uk' ? 'Очистити биті записи' : 'Clean orphaned records'}
      </button>
    </p>
    {assetsStatus ? <p className="admin-success">{assetsStatus}</p> : null}
    {assetsError ? <p className="admin-error">{assetsError}</p> : null}
    <p>{_lang === 'uk' ? 'Останні assets:' : 'Recent assets:'} {assetsLoading ? (_lang === 'uk' ? 'завантаження...' : 'loading...') : assets.length}</p>
    {assets.length ? (
      <div className="admin-json-preview">
        {assets.map((asset) => (
          <p key={asset.path}>
            <code>{asset.path}</code> · {asset.mime} · {Math.max(1, Math.round(asset.sizeBytes / 1024))} KB · {new Date(asset.updatedAt).toLocaleString()}
          </p>
        ))}
      </div>
    ) : null}
    
    <h4>{t.systemActions}</h4>
    <p className="admin-controls">
      <button type="button" onClick={() => void regenerateAllTemplateImages()} disabled={imageRegenRunning}>
        {imageRegenRunning ? t.regenerateImagesRunning : t.regenerateImages}
      </button>
    </p>
    
    <h4>{_lang === 'uk' ? 'Небезпечні операції' : 'Dangerous operations'}</h4>
    <p className="admin-controls">
      <button type="button" onClick={onResetAll}>{t.resetAll}</button>
      <button
        type="button"
        onClick={() => {
          setAdminActionError('');
          setRestartingServer(true);
          void onRestartServer().then((ok) => {
            setRestartingServer(false);
            if (!ok) setAdminActionError(t.restartServerFailed);
          });
        }}
        disabled={restartingServer}
      >
        {restartingServer ? t.restartingServer : t.restartServer}
      </button>
    </p>
    {adminActionError ? <p className="admin-error">{adminActionError}</p> : null}
  </>
);
