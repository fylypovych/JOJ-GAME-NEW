import { Suspense } from 'react';
import type { ComponentType } from 'react';
import type { AdminPageProps } from '../admin';

type MatchLike = {
  matchID: string;
  createdAt?: number | string;
};

type AdminPageContainerProps = {
  enabled: boolean;
  loadingLabel: string;
  uiVariant: AdminPageProps['uiVariant'];
  lang: AdminPageProps['lang'];
  serverUrl: AdminPageProps['serverUrl'];
  serverUrlDraft: AdminPageProps['serverUrlDraft'];
  setServerUrlDraft: AdminPageProps['onServerUrlDraftChange'];
  saveServerUrl: AdminPageProps['onSaveServerUrl'];
  resetServerUrl: AdminPageProps['onResetServerUrl'];
  adminStorageMode: AdminPageProps['storageMode'];
  setAdminStorageMode: AdminPageProps['onStorageModeChange'];
  adminDbConfigDraft: AdminPageProps['dbConfigDraft'];
  setAdminDbConfigDraft: AdminPageProps['onDbConfigDraftChange'];
  saveDbConfigDraft: AdminPageProps['onSaveDbConfigDraft'];
  testDbConnection: AdminPageProps['onTestDbConnection'];
  exportDbSchema: AdminPageProps['onExportDbSchema'];
  importDbSchema: AdminPageProps['onImportDbSchema'];
  importJsonConfigToDb: AdminPageProps['onImportJsonConfigToDb'];
  exportDbBackup: AdminPageProps['onExportDbBackup'];
  restoreDbBackup: AdminPageProps['onRestoreDbBackup'];
  dbConfigSaveStatus: AdminPageProps['dbConfigSaveStatus'];
  dbConnectionTestStatus: AdminPageProps['dbConnectionTestStatus'];
  dbConnectionTestError: AdminPageProps['dbConnectionTestError'];
  dbConnectionTestRunning: AdminPageProps['dbConnectionTestRunning'];
  dbExportSchemaStatus: AdminPageProps['dbExportSchemaStatus'];
  dbExportSchemaError: AdminPageProps['dbExportSchemaError'];
  dbExportSchemaRunning: AdminPageProps['dbExportSchemaRunning'];
  dbImportSchemaStatus: AdminPageProps['dbImportSchemaStatus'];
  dbImportSchemaError: AdminPageProps['dbImportSchemaError'];
  dbImportSchemaRunning: AdminPageProps['dbImportSchemaRunning'];
  dbImportJsonConfigStatus: AdminPageProps['dbImportJsonConfigStatus'];
  dbImportJsonConfigError: AdminPageProps['dbImportJsonConfigError'];
  dbImportJsonConfigRunning: AdminPageProps['dbImportJsonConfigRunning'];
  dbExportBackupStatus: AdminPageProps['dbExportBackupStatus'];
  dbExportBackupError: AdminPageProps['dbExportBackupError'];
  dbExportBackupRunning: AdminPageProps['dbExportBackupRunning'];
  dbRestoreBackupStatus: AdminPageProps['dbRestoreBackupStatus'];
  dbRestoreBackupError: AdminPageProps['dbRestoreBackupError'];
  dbRestoreBackupRunning: AdminPageProps['dbRestoreBackupRunning'];
  dbSyncMigrationsStatus: AdminPageProps['dbSyncMigrationsStatus'];
  dbSyncMigrationsError: AdminPageProps['dbSyncMigrationsError'];
  dbSyncMigrationsRunning: AdminPageProps['dbSyncMigrationsRunning'];
  syncDbMigrations: AdminPageProps['onSyncDbMigrations'];
  matches: MatchLike[];
  adminMatchID: string;
  setAdminSelectedMatchID: AdminPageProps['onActiveMatchIdChange'];
  snapshot: AdminPageProps['snapshot'];
  sharedDeckStats: { deck: number; legendary: number; rankTrack: number };
  sharedDeckTemplate: AdminPageProps['sharedDeckTemplate'];
  cardCatalog: AdminPageProps['cardCatalog'];
  sharedRanks: AdminPageProps['sharedRanks'];
  sharedConfigLoaded: boolean;
  createRoom: () => void | Promise<void>;
  onResetMatch: () => void | Promise<void>;
  onDeleteMatch: () => void | Promise<void>;
  deletingAdminMatch: boolean;
  clearSessionState: AdminPageProps['onResetAll'];
  onRestartServer: AdminPageProps['onRestartServer'];
  onShuffleDeck: AdminPageProps['onShuffleDeck'];
  onAddCard: AdminPageProps['onAddCard'];
  onAddCustomCard: AdminPageProps['onAddCustomCard'];
  onUpdateCard: AdminPageProps['onUpdateCard'];
  onRemoveCard: AdminPageProps['onRemoveCard'];
  onResetDeck: AdminPageProps['onResetTemplate'];
  onSetBack: AdminPageProps['onSetDeckBackImage'];
  onExportTemplate: AdminPageProps['onExportTemplate'];
  onImportTemplate: AdminPageProps['onImportTemplate'];
  onSetRanks: AdminPageProps['onUpdateRanks'];
  onResetRanks: AdminPageProps['onResetRanks'];
  onStopGame: AdminPageProps['onStopGame'];
  runGameSimulations: AdminPageProps['onRunSimulations'];
  Component: ComponentType<AdminPageProps>;
};

export const AdminPageContainer = ({
  enabled,
  loadingLabel,
  uiVariant,
  lang,
  serverUrl,
  serverUrlDraft,
  setServerUrlDraft,
  saveServerUrl,
  resetServerUrl,
  adminStorageMode,
  setAdminStorageMode,
  adminDbConfigDraft,
  setAdminDbConfigDraft,
  saveDbConfigDraft,
  testDbConnection,
  exportDbSchema,
  importDbSchema,
  importJsonConfigToDb,
  exportDbBackup,
  restoreDbBackup,
  dbConfigSaveStatus,
  dbConnectionTestStatus,
  dbConnectionTestError,
  dbConnectionTestRunning,
  dbExportSchemaStatus,
  dbExportSchemaError,
  dbExportSchemaRunning,
  dbImportSchemaStatus,
  dbImportSchemaError,
  dbImportSchemaRunning,
  dbImportJsonConfigStatus,
  dbImportJsonConfigError,
  dbImportJsonConfigRunning,
  dbExportBackupStatus,
  dbExportBackupError,
  dbExportBackupRunning,
  dbRestoreBackupStatus,
  dbRestoreBackupError,
  dbRestoreBackupRunning,
  dbSyncMigrationsStatus,
  dbSyncMigrationsError,
  dbSyncMigrationsRunning,
  syncDbMigrations,
  matches,
  adminMatchID,
  setAdminSelectedMatchID,
  snapshot,
  sharedDeckStats,
  sharedDeckTemplate,
  cardCatalog,
  sharedRanks,
  sharedConfigLoaded,
  createRoom,
  onResetMatch,
  onDeleteMatch,
  deletingAdminMatch,
  clearSessionState,
  onRestartServer,
  onShuffleDeck,
  onAddCard,
  onAddCustomCard,
  onUpdateCard,
  onRemoveCard,
  onResetDeck,
  onSetBack,
  onExportTemplate,
  onImportTemplate,
  onSetRanks,
  onResetRanks,
  onStopGame,
  runGameSimulations,
  Component,
}: AdminPageContainerProps) => {
  if (!enabled) return null;
  return (
    <Suspense fallback={<p>{loadingLabel}</p>}>
      <Component
        uiVariant={uiVariant}
        lang={lang}
        serverUrl={serverUrl}
        serverUrlDraft={serverUrlDraft}
        onServerUrlDraftChange={setServerUrlDraft}
        onSaveServerUrl={saveServerUrl}
        onResetServerUrl={resetServerUrl}
        storageMode={adminStorageMode}
        onStorageModeChange={setAdminStorageMode}
        dbConfigDraft={adminDbConfigDraft}
        onDbConfigDraftChange={setAdminDbConfigDraft}
        onSaveDbConfigDraft={saveDbConfigDraft}
        onTestDbConnection={testDbConnection}
        onExportDbSchema={exportDbSchema}
        onImportDbSchema={importDbSchema}
        onImportJsonConfigToDb={importJsonConfigToDb}
        onExportDbBackup={exportDbBackup}
        onRestoreDbBackup={restoreDbBackup}
        dbConfigSaveStatus={dbConfigSaveStatus}
        dbConnectionTestStatus={dbConnectionTestStatus}
        dbConnectionTestError={dbConnectionTestError}
        dbConnectionTestRunning={dbConnectionTestRunning}
        dbSyncMigrationsStatus={dbSyncMigrationsStatus}
        dbSyncMigrationsError={dbSyncMigrationsError}
        dbSyncMigrationsRunning={dbSyncMigrationsRunning}
        onSyncDbMigrations={syncDbMigrations}
        dbExportSchemaStatus={dbExportSchemaStatus}
        dbExportSchemaError={dbExportSchemaError}
        dbExportSchemaRunning={dbExportSchemaRunning}
        dbImportSchemaStatus={dbImportSchemaStatus}
        dbImportSchemaError={dbImportSchemaError}
        dbImportSchemaRunning={dbImportSchemaRunning}
        dbImportJsonConfigStatus={dbImportJsonConfigStatus}
        dbImportJsonConfigError={dbImportJsonConfigError}
        dbImportJsonConfigRunning={dbImportJsonConfigRunning}
        dbExportBackupStatus={dbExportBackupStatus}
        dbExportBackupError={dbExportBackupError}
        dbExportBackupRunning={dbExportBackupRunning}
        dbRestoreBackupStatus={dbRestoreBackupStatus}
        dbRestoreBackupError={dbRestoreBackupError}
        dbRestoreBackupRunning={dbRestoreBackupRunning}
        matches={matches.map((m) => ({
          id: m.matchID,
          createdAt:
            typeof m.createdAt === 'number'
              ? m.createdAt
              : typeof m.createdAt === 'string'
                ? Date.parse(m.createdAt) || 0
                : 0,
        }))}
        activeMatchId={adminMatchID}
        onActiveMatchIdChange={setAdminSelectedMatchID}
        snapshot={snapshot}
        deckStats={{
          deck: sharedDeckStats.deck,
          discard: 0,
          legendary: sharedDeckStats.legendary,
          rankTrack: sharedDeckStats.rankTrack,
        }}
        sharedDeckTemplate={sharedDeckTemplate}
        cardCatalog={cardCatalog}
        sharedRanks={sharedRanks}
        sharedConfigLoaded={sharedConfigLoaded}
        onCreateMatch={() => {
          void createRoom();
        }}
        onResetMatch={() => {
          void onResetMatch();
        }}
        onDeleteMatch={() => {
          void onDeleteMatch();
        }}
        deletingMatch={deletingAdminMatch}
        onResetAll={clearSessionState}
        onRestartServer={onRestartServer}
        onShuffleDeck={onShuffleDeck}
        onAddCard={onAddCard}
        onAddCustomCard={onAddCustomCard}
        onUpdateCard={onUpdateCard}
        onRemoveCard={onRemoveCard}
        onResetTemplate={onResetDeck}
        onSetDeckBackImage={onSetBack}
        onExportTemplate={onExportTemplate}
        onImportTemplate={onImportTemplate}
        onUpdateRanks={onSetRanks}
        onResetRanks={onResetRanks}
        onStopGame={onStopGame}
        onRunSimulations={runGameSimulations}
      />
    </Suspense>
  );
};
