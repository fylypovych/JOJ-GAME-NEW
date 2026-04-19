import { Suspense, useEffect } from 'react';
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
  syncJsonToPostgresIncremental: AdminPageProps['onSyncJsonToPostgresIncremental'];
  loadFromPostgres: AdminPageProps['onLoadFromPostgres'];
  saveTemplateToPostgres: AdminPageProps['onSaveTemplateToPostgres'];
  checkDbConfigSync: AdminPageProps['onCheckDbConfigSync'];
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
  dbCheckSyncStatus: AdminPageProps['dbCheckSyncStatus'];
  dbCheckSyncError: AdminPageProps['dbCheckSyncError'];
  dbCheckSyncRunning: AdminPageProps['dbCheckSyncRunning'];
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
  onResetMatch: () => boolean | Promise<boolean>;
  onDeleteMatch: () => void | Promise<void>;
  onDeleteAllMatches: () => void | Promise<void>;
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
  refreshAdminMatches: () => Promise<void>;
  adminMatches: Array<{ matchID: string; metadata: Record<string, unknown> }>;
  adminMatchesLoading: boolean;
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
  syncJsonToPostgresIncremental,
  loadFromPostgres,
  saveTemplateToPostgres,
  checkDbConfigSync,
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
  dbCheckSyncStatus,
  dbCheckSyncError,
  dbCheckSyncRunning,
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
  adminMatches,
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
  onDeleteAllMatches,
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
  refreshAdminMatches,
  adminMatchesLoading,
  Component,
}: AdminPageContainerProps) => {
  useEffect(() => {
    if (enabled) {
      void refreshAdminMatches();
    }
  }, [enabled, refreshAdminMatches]);

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
        onSyncJsonToPostgresIncremental={async () => {
          await syncJsonToPostgresIncremental();
        }}
        onLoadFromPostgres={async () => {
          await loadFromPostgres();
        }}
        onSaveTemplateToPostgres={saveTemplateToPostgres}
        onCheckDbConfigSync={checkDbConfigSync}
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
        dbCheckSyncStatus={dbCheckSyncStatus}
        dbCheckSyncError={dbCheckSyncError}
        dbCheckSyncRunning={dbCheckSyncRunning}
        dbExportBackupStatus={dbExportBackupStatus}
        dbExportBackupError={dbExportBackupError}
        dbExportBackupRunning={dbExportBackupRunning}
        dbRestoreBackupStatus={dbRestoreBackupStatus}
        dbRestoreBackupError={dbRestoreBackupError}
        dbRestoreBackupRunning={dbRestoreBackupRunning}
        matches={(adminMatches ?? []).map((m) => ({
          id: m.matchID,
          createdAt:
            typeof m.metadata?.updatedAt === 'number'
              ? m.metadata.updatedAt
              : typeof m.metadata?.updatedAt === 'string'
                ? Date.parse(m.metadata.updatedAt) || 0
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
        onResetMatch={async () => {
          return await onResetMatch();
        }}
        onDeleteMatch={() => {
          void onDeleteMatch();
        }}
        onDeleteAllMatches={() => {
          void onDeleteAllMatches();
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
        refreshAdminMatches={refreshAdminMatches}
        adminMatchesLoading={adminMatchesLoading}
      />
    </Suspense>
  );
};
