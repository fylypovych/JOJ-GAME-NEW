import { useEffect, useMemo, useState } from 'react';
import type { DeckTarget } from '../game/jojGame';
import { SHARED_TEMPLATE_SCHEMA_KIND, SHARED_TEMPLATE_SCHEMA_VERSION, serializeSharedRanksDocument } from '../game/sharedConfigSchema';
import { rankLabel } from './i18n';
import { text } from './i18n';
import { optimizeBlobForUpload } from './admin/imageUpload';
import { useAdminCardEditor } from './admin/useAdminCardEditor';
import { useAdminGitActions } from './admin/useAdminGitActions';
import { useAdminImageRegeneration } from './admin/useAdminImageRegeneration';
import { useAdminPageActions } from './admin/useAdminPageActions';
import { useAdminRanksEditor } from './admin/useAdminRanksEditor';
import { useAdminUsers } from './admin/useAdminUsers';
import { useAdminSimulation } from './admin/useAdminSimulation';
import { useAdminTemplateManager } from './admin/useAdminTemplateManager';
import { useAdminAwards } from './admin/useAdminAwards';
import { useAdminAnalytics } from './admin/useAdminAnalytics';
import { useAdminBugReports } from './admin/useAdminBugReports';
import { useBugReportUiConfig } from './admin/useBugReportUiConfig';
import {
  categories,
  rankResourceKeys,
} from './admin/helpers';
import type {
  AdminStorageMode,
  AdminPageProps,
  AdminTab,
  ImportCategoryMode,
} from './admin/types';
import {
  AdminImportTab,
  AdminDeckTab,
  AdminDatabaseTab,
  AdminMatchesTab,
  AdminRanksTab,
  AdminSettingsTab,
  AdminSimulationTab,
  AdminStateTab,
  AdminTabButtons,
  AdminAwardsTab,
  AdminBugReportsTab,
  AdminUsersTab,
} from './admin/tabs';

export const AdminPage = ({
  uiVariant,
  lang,
  adminToken,
  serverUrl,
  serverUrlDraft,
  onServerUrlDraftChange,
  onSaveServerUrl,
  onResetServerUrl,
  storageMode,
  onStorageModeChange,
  dbConfigDraft,
  onDbConfigDraftChange,
  onSaveDbConfigDraft,
  onTestDbConnection,
  dbConfigSaveStatus,
  dbConnectionTestStatus,
  dbConnectionTestError,
  dbConnectionTestRunning,
  onExportDbSchema,
  onImportDbSchema,
  onImportJsonConfigToDb,
  onExportDbBackup,
  onRestoreDbBackup,
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
  matches,
  activeMatchId,
  onActiveMatchIdChange,
  snapshot,
  deckStats,
  sharedDeckTemplate,
  cardCatalog,
  sharedRanks,
  sharedConfigLoaded,
  onCreateMatch,
  onResetMatch,
  onDeleteMatch,
  deletingMatch,
  onResetAll,
  onRestartServer,
  onShuffleDeck: _onShuffleDeck,
  onAddCard: _onAddCard,
  onAddCustomCard,
  onUpdateCard,
  onRemoveCard: _onRemoveCard,
  onResetTemplate: _onResetTemplate,
  onSetDeckBackImage,
  onExportTemplate,
  onImportTemplate,
  onUpdateRanks,
  onResetRanks,
  onStopGame,
  onRunSimulations: _onRunSimulations,
}: AdminPageProps) => {
  const t = text(lang);
  const localizedRankName = (rankId: string) =>
    sharedRanks.find((row) => row.id === rankId)?.name ?? rankLabel(rankId, lang);
  const activeMatch = matches.find((m) => m.id === activeMatchId);

  const [restartingServer, setRestartingServer] = useState<boolean>(false);
  const [adminActionError, setAdminActionError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminTab>('matches');
  const optionalSimulationModules = useMemo(
    () => (sharedDeckTemplate.modules ?? [])
      .filter((module) => module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck')
      .map((module) => ({
        id: module.id,
        name: module.name,
        alwaysOn: module.category === 'VVNZ',
      })),
    [sharedDeckTemplate.modules],
  );
  const simulationTemplateJson = useMemo(() => JSON.stringify({
    kind: SHARED_TEMPLATE_SCHEMA_KIND,
    version: SHARED_TEMPLATE_SCHEMA_VERSION,
    catalog: cardCatalog,
    deckIds: sharedDeckTemplate.deck.map((card) => card.id),
    legendaryDeckIds: sharedDeckTemplate.legendaryDeck.map((card) => card.id),
    rankTrackIds: sharedDeckTemplate.rankTrack.map((card) => card.id),
    deck: sharedDeckTemplate.deck,
    legendaryDeck: sharedDeckTemplate.legendaryDeck,
    rankTrack: sharedDeckTemplate.rankTrack,
    deckBackImage: sharedDeckTemplate.deckBackImage,
    modules: sharedDeckTemplate.modules,
    gameSetup: sharedDeckTemplate.gameSetup,
  }), [cardCatalog, sharedDeckTemplate]);
  const simulationRanksJson = useMemo(
    () => JSON.stringify(serializeSharedRanksDocument(sharedRanks)),
    [sharedRanks],
  );
  const {
    simulationPlayers,
    setSimulationPlayers,
    simulationCount,
    setSimulationCount,
    simulationGameMode,
    setSimulationGameMode,
    simulationOptionalModuleIds,
    setSimulationOptionalModuleIds,
    simulationReport,
    simulationRunning,
    simulationError,
    simulationProgressPct,
    simulationProgressCompleted,
    simulationProgressTotal,
    simulationCurrentMatch,
    simulationCurrentTurn,
    simulationCurrentMaxTurns,
    simulationBlockedReason,
    runSimulation,
  } = useAdminSimulation({
    optionalModules: optionalSimulationModules,
    configSignature: JSON.stringify({
      loaded: sharedConfigLoaded,
      deck: sharedDeckTemplate.deck.length,
      legendaryDeck: sharedDeckTemplate.legendaryDeck.length,
      ranks: sharedRanks.length,
    }),
    blockedReason: sharedConfigLoaded
      ? ''
      : t.simulationBlockedByConfig,
    templateJson: simulationTemplateJson,
    ranksJson: simulationRanksJson,
  });
  const {
    applyTemplateUpdate,
    deckModules,
    deckManagerStatus,
    setDeckManagerStatus,
    applyModuleAction,
    saveDeckModule,
    deleteDeckModule,
    setLegendaryDeckMode,
    importJson,
    setImportJson,
    importError,
    setImportStatus,
    importStatus,
    importTarget,
    setImportTarget,
    importCategoryMode,
    setImportCategoryMode,
    runImport,
  } = useAdminTemplateManager({
    lang,
    sharedDeckTemplate,
    cardCatalog,
    onImportTemplate,
  });
  const {
    adminHeaders,
    stopGameRunning,
    stopGameError,
    stopGameStatus,
    stopGame,
    uploadDataUrl,
    exportTemplateToFile,
    importTemplateFromFile,
  } = useAdminPageActions({
    adminToken,
    serverUrl,
    activeMatchId,
    onStopGame,
    onExportTemplate,
    setImportJson,
    setAdminActionError,
    uploadFailedGeneric: t.uploadFailedGeneric,
    stateStopGameFailed: t.stateStopGameFailed,
    stateStopGameSuccess: t.stateStopGameSuccess,
  });
  const adminJsonFetch = (url: string, init?: RequestInit) => fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...adminHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  const {
    adminUsers,
    adminUsersLoading,
    adminUsersError,
    adminUserSearch,
    setAdminUserSearch,
    selectedAdminUserId,
    selectedAdminUserDetail,
    adminCreateUserDraft,
    setAdminCreateUserDraft,
    adminEditUserDraft,
    setAdminEditUserDraft,
    loadAdminUsers,
    loadAdminUserDetail,
    updateAdminUserStatus,
    updateAdminUserRole,
    updateAdminUserProfile,
    logoutAdminUserSession,
    logoutAllAdminUserSessions,
    createAdminUser,
    requestAdminPasswordReset,
  } = useAdminUsers({ lang, serverUrl, adminJsonFetch });
  const {
    adminAwards,
    adminAwardsLoading,
    adminAwardsError,
    selectedAdminAwardId,
    adminAwardDraft,
    setAdminAwardDraft,
    loadAdminAwards,
    selectAdminAward,
    saveAdminAward,
    deleteAdminAward,
  } = useAdminAwards({ lang, serverUrl, adminJsonFetch });
  const {
    adminAnalytics,
    adminAnalyticsLoading,
    adminAnalyticsError,
    refreshAdminAnalytics,
  } = useAdminAnalytics({ lang, serverUrl, adminJsonFetch });
  const {
    bugReports,
    bugReportsLoading,
    bugReportsError,
    selectedBugReportId,
    selectedBugReport,
    bugReportImageUrl,
    loadBugReports,
    loadBugReportDetail,
    setBugReportStatus,
  } = useAdminBugReports({ lang, serverUrl, adminJsonFetch });
  const {
    bugReportImagePath,
    setBugReportImagePath,
    bugReportUiConfigLoading,
    bugReportUiConfigError,
    bugReportUiConfigStatus,
    loadBugReportUiConfig,
    saveBugReportUiConfig,
  } = useBugReportUiConfig({ lang, serverUrl, adminJsonFetch });

  const {
    gitStatus,
    gitStatusLoading,
    gitUpdateRunning,
    gitDeployRunning,
    gitAuthStatus,
    gitAuthStatusLoading,
    gitAuthSaving,
    gitAuthUsernameDraft,
    setGitAuthUsernameDraft,
    gitAuthTokenDraft,
    setGitAuthTokenDraft,
    gitActionMessage,
    gitActionLog,
    setGitActionMessage,
    setGitActionLog,
    loadGitAuthStatus,
    saveGitAuthConfig,
    clearGitAuthConfig,
    checkGitUpdates,
    applyGitUpdate,
    applyGitDeploy,
  } = useAdminGitActions({
    lang,
    serverUrl,
    adminHeaders,
    setAdminActionError,
  });
  const {
    editTarget,
    editIndex,
    setImagePreviewNonce,
    openCardEditorAt,
    openCardEditorById,
    startCreateCardForModule,
    removeCardAtFromEditor,
    removeCardByIdFromEditor,
    inlineEditor,
  } = useAdminCardEditor({
    lang,
    t,
    serverUrl,
    adminHeaders,
    sharedDeckTemplate,
    cardCatalog,
    deckModules,
    applyTemplateUpdate,
    setDeckManagerStatus,
    onAddCustomCard,
    onUpdateCard,
    onSetDeckBackImage,
  });
  const {
    editableRanks,
    rankDraft,
    setRankDraft,
    ranksJson,
    setRanksJson,
    ranksImportError,
    setRanksImportError,
    ranksImportStatus,
    setRanksImportStatus,
    updateRankAt,
    attachRankImageFile,
    attachRankVariantImageFile,
    attachRankDraftImageFile,
    attachRankDraftVariantImageFile,
    saveRanks,
    addRank,
    removeRankAt,
    exportRanksToFile,
    importRanks,
    importRanksFromFile,
  } = useAdminRanksEditor({
    lang,
    t,
    sharedRanks,
    onUpdateRanks,
    optimizeBlobForUpload,
    uploadDataUrl,
  });
  const { imageRegenRunning: regenRunning, regenerateAllTemplateImages } = useAdminImageRegeneration({
    lang,
    t,
    serverUrl,
    adminHeaders,
    sharedDeckTemplate,
    optimizeBlobForUpload,
    uploadDataUrl,
    onUpdateCard,
    onSetDeckBackImage,
    setAdminActionError,
    setGitActionMessage,
    setGitActionLog,
    setImagePreviewNonce,
  });

  useEffect(() => {
    if (activeTab !== 'users' || adminUsers.length > 0 || adminUsersLoading) return;
    void loadAdminUsers();
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'awards' || adminAwards.length > 0 || adminAwardsLoading) return;
    void loadAdminAwards();
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'settings' || adminAnalytics || adminAnalyticsLoading) return;
    void refreshAdminAnalytics();
  }, [activeTab, adminAnalytics, adminAnalyticsLoading, refreshAdminAnalytics]);
  useEffect(() => {
    if (activeTab !== 'settings') return;
    void loadBugReportUiConfig();
    void loadGitAuthStatus({ preserveMessages: true });
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'bugReports' || bugReportsLoading) return;
    void loadBugReports();
  }, [activeTab]);
  return (
    <section className={`board admin-panel${uiVariant === 'v2' ? ' board-v2-panel' : ' board-v3-panel'}`}>
      <h2>{t.adminTitle}</h2>
      <AdminTabButtons t={t} activeTab={activeTab} setActiveTab={setActiveTab} />
      <hr />
      {activeTab === 'matches' ? (
        <AdminMatchesTab
          t={t}
          matchIds={matches.map((m) => m.id)}
          matchesCount={matches.length}
          activeMatchId={activeMatchId}
          onActiveMatchIdChange={onActiveMatchIdChange}
          activeMatchCreatedAt={activeMatch?.createdAt}
          onCreateMatch={onCreateMatch}
          onResetMatch={onResetMatch}
          onDeleteMatch={onDeleteMatch}
          canDelete={matches.length > 0}
          deletingMatch={deletingMatch}
        />
      ) : null}

      {activeTab === 'settings' ? (
        <AdminSettingsTab
          t={t}
          lang={lang}
          serverUrlDraft={serverUrlDraft}
          onServerUrlDraftChange={onServerUrlDraftChange}
          onSaveServerUrl={onSaveServerUrl}
          onResetServerUrl={onResetServerUrl}
          serverUrl={serverUrl}
          checkGitUpdates={checkGitUpdates}
          applyGitUpdate={applyGitUpdate}
          applyGitDeploy={applyGitDeploy}
          gitAuthStatus={gitAuthStatus}
          gitAuthStatusLoading={gitAuthStatusLoading}
          gitAuthSaving={gitAuthSaving}
          gitAuthUsernameDraft={gitAuthUsernameDraft}
          setGitAuthUsernameDraft={setGitAuthUsernameDraft}
          gitAuthTokenDraft={gitAuthTokenDraft}
          setGitAuthTokenDraft={setGitAuthTokenDraft}
          loadGitAuthStatus={loadGitAuthStatus}
          saveGitAuthConfig={saveGitAuthConfig}
          clearGitAuthConfig={clearGitAuthConfig}
          gitStatus={gitStatus}
          gitStatusLoading={gitStatusLoading}
          gitUpdateRunning={gitUpdateRunning}
          gitDeployRunning={gitDeployRunning}
          gitActionMessage={gitActionMessage}
          gitActionLog={gitActionLog}
          onResetAll={onResetAll}
          regenerateAllTemplateImages={regenerateAllTemplateImages}
          imageRegenRunning={regenRunning}
          restartingServer={restartingServer}
          setAdminActionError={setAdminActionError}
          setRestartingServer={setRestartingServer}
          onRestartServer={onRestartServer}
          adminActionError={adminActionError}
          adminAnalytics={adminAnalytics}
          adminAnalyticsLoading={adminAnalyticsLoading}
          adminAnalyticsError={adminAnalyticsError}
          onRefreshAdminAnalytics={refreshAdminAnalytics}
          bugReportImagePath={bugReportImagePath}
          onBugReportImagePathChange={setBugReportImagePath}
          onSaveBugReportImagePath={() => saveBugReportUiConfig(bugReportImagePath)}
          onUploadBugReportImage={async (file) => {
            if (!file) return;
            const optimized = await optimizeBlobForUpload(file, file.name, {
              maxWidth: 640,
              maxHeight: 640,
              quality: 0.92,
            });
            if (!optimized) {
              setAdminActionError(t.uploadFailedGeneric);
              return;
            }
            const uploaded = await uploadDataUrl(`bug-report-icon-${Date.now()}`, optimized.dataUrl);
            if (!uploaded) return;
            setBugReportImagePath(uploaded);
            await saveBugReportUiConfig(uploaded);
          }}
          bugReportUiConfigLoading={bugReportUiConfigLoading}
          bugReportUiConfigError={bugReportUiConfigError}
          bugReportUiConfigStatus={bugReportUiConfigStatus}
        />
      ) : null}
      {activeTab === 'database' ? (
        <AdminDatabaseTab
          t={t}
          storageMode={storageMode as AdminStorageMode}
          onStorageModeChange={onStorageModeChange}
          dbConfigDraft={dbConfigDraft}
          onDbConfigDraftChange={onDbConfigDraftChange}
          onSaveDbConfigDraft={onSaveDbConfigDraft}
          onTestDbConnection={onTestDbConnection}
          dbConfigSaveStatus={dbConfigSaveStatus}
          dbConnectionTestStatus={dbConnectionTestStatus}
          dbConnectionTestError={dbConnectionTestError}
          dbConnectionTestRunning={dbConnectionTestRunning}
          onExportDbSchema={onExportDbSchema}
          onImportDbSchema={onImportDbSchema}
          onImportJsonConfigToDb={onImportJsonConfigToDb}
          onExportDbBackup={onExportDbBackup}
          onRestoreDbBackup={onRestoreDbBackup}
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
        />
      ) : null}
      {activeTab === 'users' ? (
        <AdminUsersTab
          t={t}
          userSearch={adminUserSearch}
          setUserSearch={setAdminUserSearch}
          onSearch={() => { void loadAdminUsers(); }}
          users={adminUsers}
          selectedUserId={selectedAdminUserId}
          onSelectUserId={(value) => { void loadAdminUserDetail(value); }}
          selectedUserDetail={selectedAdminUserDetail}
          loading={adminUsersLoading}
          error={adminUsersError}
          onSetStatus={(status) => { void updateAdminUserStatus(status); }}
          onSetRole={(role) => { void updateAdminUserRole(role); }}
          editDraft={adminEditUserDraft}
          setEditDraft={setAdminEditUserDraft}
          onSaveEdit={() => { void updateAdminUserProfile(); }}
          createDraft={adminCreateUserDraft}
          setCreateDraft={setAdminCreateUserDraft}
          onCreateUser={() => { void createAdminUser(); }}
          onRequestPasswordReset={() => { void requestAdminPasswordReset(); }}
          onLogoutAllSessions={() => { void logoutAllAdminUserSessions(); }}
          onLogoutUserSession={(sessionId) => { void logoutAdminUserSession(sessionId); }}
        />
      ) : null}
      {activeTab === 'awards' ? (
        <AdminAwardsTab
          t={t}
          awards={adminAwards}
          loading={adminAwardsLoading}
          error={adminAwardsError}
          selectedAwardId={selectedAdminAwardId}
          onSelectAwardId={selectAdminAward}
          draft={adminAwardDraft}
          setDraft={setAdminAwardDraft}
          onCreateNew={() => selectAdminAward('')}
          onSave={() => { void saveAdminAward(); }}
          onDelete={() => { void deleteAdminAward(); }}
        />
      ) : null}
      {activeTab === 'bugReports' ? (
        <AdminBugReportsTab
          t={t}
          reports={bugReports}
          loading={bugReportsLoading}
          error={bugReportsError}
          selectedReportId={selectedBugReportId}
          selectedReport={selectedBugReport}
          screenshotUrl={bugReportImageUrl}
          onSelectReport={(id) => { void loadBugReportDetail(id); }}
          onMarkClosed={() => { void setBugReportStatus('closed'); }}
          onMarkResolved={() => { void setBugReportStatus('resolved'); }}
        />
      ) : null}

      {activeTab === 'deck' ? (
        <AdminDeckTab
          t={t}
          lang={lang}
          deckStats={deckStats}
          sharedDeckTemplate={sharedDeckTemplate}
          editTarget={editTarget}
          editIndex={editIndex}
          inlineEditor={inlineEditor}
          onModuleAction={(moduleId, action) => applyModuleAction(moduleId, action)}
          deckManagerStatus={deckManagerStatus}
          onStartCreateCardForModule={startCreateCardForModule}
          onEditCardAt={openCardEditorAt}
          onEditCardById={openCardEditorById}
          onRemoveCardAt={removeCardAtFromEditor}
          onRemoveCardById={removeCardByIdFromEditor}
          cardCatalog={cardCatalog}
          modules={deckModules}
          onSaveModule={saveDeckModule}
          onDeleteModule={deleteDeckModule}
          sharedRanks={sharedRanks}
          onSetLegendaryDeckMode={setLegendaryDeckMode}
        />
      ) : null}

      {activeTab === 'import' ? (
        <AdminImportTab
          t={t}
          importTarget={importTarget}
          setImportTarget={(v) => setImportTarget(v as DeckTarget)}
          importCategoryMode={importCategoryMode}
          setImportCategoryMode={(v) => setImportCategoryMode(v as ImportCategoryMode)}
          categories={categories}
          runImport={runImport}
          importFromFile={importTemplateFromFile}
          exportToFile={exportTemplateToFile}
          importError={importError}
          importStatus={importStatus}
          importJson={importJson}
          setImportJson={setImportJson}
          clearImportStatus={() => setImportStatus('')}
        />
      ) : null}

      {activeTab === 'state' ? (
        <AdminStateTab
          t={t}
          snapshot={snapshot}
          activeMatchId={activeMatchId}
          stopGameRunning={stopGameRunning}
          stopGameError={stopGameError}
          stopGameStatus={stopGameStatus}
          localizedRankName={localizedRankName}
          onStopGame={() => { void stopGame(); }}
        />
      ) : null}
      {activeTab === 'ranks' ? (
        <AdminRanksTab
          t={t}
          exportRanksToFile={exportRanksToFile}
          importRanks={importRanks}
          importRanksFromFile={importRanksFromFile}
          ranksImportError={ranksImportError}
          ranksImportStatus={ranksImportStatus}
          ranksJson={ranksJson}
          setRanksJson={setRanksJson}
          setRanksImportError={setRanksImportError}
          setRanksImportStatus={setRanksImportStatus}
          editableRanks={editableRanks}
          updateRankAt={updateRankAt}
          attachRankImageFile={attachRankImageFile}
          attachRankVariantImageFile={attachRankVariantImageFile}
          rankResourceKeys={rankResourceKeys}
          removeRankAt={removeRankAt}
          rankDraft={rankDraft}
          setRankDraft={setRankDraft}
          attachRankDraftImageFile={attachRankDraftImageFile}
          attachRankDraftVariantImageFile={attachRankDraftVariantImageFile}
          saveRanks={saveRanks}
          addRank={addRank}
          onResetRanks={onResetRanks}
        />
      ) : null}
      {activeTab === 'simulation' ? (
        <AdminSimulationTab
          t={t}
          lang={lang}
          simulationPlayers={simulationPlayers}
          setSimulationPlayers={setSimulationPlayers}
          simulationCount={simulationCount}
          setSimulationCount={setSimulationCount}
          simulationGameMode={simulationGameMode}
          setSimulationGameMode={setSimulationGameMode}
          simulationOptionalModules={optionalSimulationModules}
          simulationOptionalModuleIds={simulationOptionalModuleIds}
          setSimulationOptionalModuleIds={setSimulationOptionalModuleIds}
          simulationRunning={simulationRunning}
          simulationProgressPct={simulationProgressPct}
          simulationProgressCompleted={simulationProgressCompleted}
          simulationProgressTotal={simulationProgressTotal}
          simulationCurrentMatch={simulationCurrentMatch}
          simulationCurrentTurn={simulationCurrentTurn}
          simulationCurrentMaxTurns={simulationCurrentMaxTurns}
          runSimulation={runSimulation}
          simulationReport={simulationReport}
          simulationError={simulationError}
          simulationBlockedReason={simulationBlockedReason}
          localizedRankName={localizedRankName}
        />
      ) : null}
      <p>
        <a href="/">{t.openGame}</a>
      </p>
    </section>
  );
};
