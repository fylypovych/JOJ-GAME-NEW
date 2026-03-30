import { text } from '../../i18n';
import {
  LOBBY_BOT_COUNT_OPTIONS,
  LOBBY_ROOM_CAPACITY_OPTIONS,
  type LobbyBotCountOption,
  type LobbyRoomCapacityOption,
} from '../../../game/lobbyConfig';

type T = ReturnType<typeof text>;

export const AdminSettingsTab = ({
  t,
  lang: _lang,
  serverUrlDraft,
  onServerUrlDraftChange,
  onSaveServerUrl,
  onResetServerUrl,
  serverUrl,
  onResetAll,
  regenerateAllTemplateImages,
  imageRegenRunning,
  restartingServer,
  setAdminActionError,
  setRestartingServer,
  onRestartServer,
  adminActionError,
  bugReportImagePath,
  onBugReportImagePathChange,
  onSaveBugReportImagePath,
  onUploadBugReportImage,
  bugReportUiConfigLoading,
  bugReportUiConfigError,
  bugReportUiConfigStatus,
  allowedRoomCapacities,
  onToggleAllowedRoomCapacity,
  defaultRoomCapacity,
  onDefaultRoomCapacityChange,
  allowedBotCounts,
  onToggleAllowedBotCount,
  defaultBotCount,
  onDefaultBotCountChange,
  onSaveGameUiConfig,
  gameUiConfigLoading,
  gameUiConfigError,
  gameUiConfigStatus,
}: {
  t: T;
  lang: 'uk' | 'en';
  serverUrlDraft: string;
  onServerUrlDraftChange: (v: string) => void;
  onSaveServerUrl: (v: string) => void;
  onResetServerUrl: () => void;
  serverUrl: string;
  onResetAll: () => void;
  regenerateAllTemplateImages: () => Promise<void> | void;
  imageRegenRunning: boolean;
  restartingServer: boolean;
  setAdminActionError: (value: string) => void;
  setRestartingServer: (value: boolean) => void;
  onRestartServer: () => Promise<boolean>;
  adminActionError: string;
  bugReportImagePath: string;
  onBugReportImagePathChange: (value: string) => void;
  onSaveBugReportImagePath: () => Promise<void> | void;
  onUploadBugReportImage: (file: File | null) => Promise<void> | void;
  bugReportUiConfigLoading: boolean;
  bugReportUiConfigError: string;
  bugReportUiConfigStatus: string;
  allowedRoomCapacities: LobbyRoomCapacityOption[];
  onToggleAllowedRoomCapacity: (capacity: LobbyRoomCapacityOption) => void;
  defaultRoomCapacity: LobbyRoomCapacityOption;
  onDefaultRoomCapacityChange: (capacity: LobbyRoomCapacityOption) => void;
  allowedBotCounts: LobbyBotCountOption[];
  onToggleAllowedBotCount: (count: LobbyBotCountOption) => void;
  defaultBotCount: LobbyBotCountOption;
  onDefaultBotCountChange: (count: LobbyBotCountOption) => void;
  onSaveGameUiConfig: () => Promise<void> | void;
  gameUiConfigLoading: boolean;
  gameUiConfigError: string;
  gameUiConfigStatus: string;
}) => (
  <>
    <h3>{t.settingsTitle}</h3>
    <p>{t.settingsHint}</p>
    <p>{t.adminPath}: <code>/admin</code></p>
    <h4>{t.serverSettingsTitle}</h4>
    <p className="admin-controls">
      <label>
        {t.serverUrlLabel}
        <input value={serverUrlDraft} onChange={(e) => onServerUrlDraftChange(e.target.value)} placeholder="http://192.168.0.25:8000" />
      </label>
      <button type="button" onClick={() => onSaveServerUrl(serverUrlDraft)}>{t.saveServerUrl}</button>
      <button type="button" onClick={onResetServerUrl}>{t.resetServerUrl}</button>
    </p>
    <p>{t.currentServerUrl}: <code>{serverUrl}</code></p>
    <p>{t.serverUrlReloadHint}</p>
    <h4>{t.bugReportIconSettingsTitle}</h4>
    <p>{t.bugReportIconSettingsHint}</p>
    <p className="admin-controls">
      <label>
        {t.bugReportIconPathLabel}
        <input value={bugReportImagePath} onChange={(e) => onBugReportImagePathChange(e.target.value)} placeholder="/cards/bug-report-icon.webp" />
      </label>
      <button type="button" onClick={() => void onSaveBugReportImagePath()} disabled={bugReportUiConfigLoading}>
        {t.saveServerUrl}
      </button>
      <label>
        {t.bugReportIconUploadLabel}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void onUploadBugReportImage(e.target.files?.[0] ?? null)} />
      </label>
    </p>
    {bugReportImagePath ? (
      <p>
        <img
          className="admin-bug-report-icon-preview"
          src={`${serverUrl}/api/bug-reports/ui-image?path=${encodeURIComponent(bugReportImagePath)}&v=${encodeURIComponent(bugReportImagePath)}`}
          alt={t.bugReportImageAlt}
        />
      </p>
    ) : null}
    {bugReportUiConfigStatus ? <p className="admin-success">{bugReportUiConfigStatus}</p> : null}
    {bugReportUiConfigError ? <p className="admin-error">{bugReportUiConfigError}</p> : null}
    <h4>{t.botSettingsTitle}</h4>
    <p>{t.botSettingsHint}</p>
    <p>{t.botSettingsRoomCapacitiesLabel}:</p>
    <p className="admin-controls">
      {LOBBY_ROOM_CAPACITY_OPTIONS.map((capacity) => (
        <label key={`room-capacity-setting-${capacity}`}>
          <input
            type="checkbox"
            checked={allowedRoomCapacities.includes(capacity)}
            onChange={() => onToggleAllowedRoomCapacity(capacity)}
          />
          {capacity}
        </label>
      ))}
    </p>
    <p>{t.botSettingsDefaultRoomCapacityLabel}:</p>
    <p className="admin-controls">
      {allowedRoomCapacities.map((capacity) => (
        <button
          key={`room-capacity-default-${capacity}`}
          type="button"
          aria-pressed={defaultRoomCapacity === capacity}
          onClick={() => onDefaultRoomCapacityChange(capacity)}
          disabled={gameUiConfigLoading}
        >
          {defaultRoomCapacity === capacity ? '✓ ' : ''}{capacity}
        </button>
      ))}
    </p>
    <p>{t.botSettingsAllowedLabel}:</p>
    <p className="admin-controls">
      {LOBBY_BOT_COUNT_OPTIONS.map((count) => (
        <label key={`bot-setting-${count}`}>
          <input
            type="checkbox"
            checked={allowedBotCounts.includes(count)}
            onChange={() => onToggleAllowedBotCount(count)}
          />
          {count}
        </label>
      ))}
    </p>
    <p>{t.botSettingsDefaultLabel}:</p>
    <p className="admin-controls">
      {allowedBotCounts.map((count) => (
        <button
          key={`bot-setting-default-${count}`}
          type="button"
          aria-pressed={defaultBotCount === count}
          onClick={() => onDefaultBotCountChange(count)}
          disabled={gameUiConfigLoading}
        >
          {defaultBotCount === count ? '✓ ' : ''}{count}
        </button>
      ))}
    </p>
    <p className="admin-controls">
      <button type="button" onClick={() => void onSaveGameUiConfig()} disabled={gameUiConfigLoading}>
        {t.dbSaveSettings}
      </button>
    </p>
    {gameUiConfigStatus ? <p className="admin-success">{gameUiConfigStatus}</p> : null}
    {gameUiConfigError ? <p className="admin-error">{gameUiConfigError}</p> : null}
    <h4>{t.systemActions}</h4>
    <p className="admin-controls">
      <button type="button" onClick={onResetAll}>{t.resetAll}</button>
      <button type="button" onClick={() => void regenerateAllTemplateImages()} disabled={imageRegenRunning}>
        {imageRegenRunning ? t.regenerateImagesRunning : t.regenerateImages}
      </button>
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
