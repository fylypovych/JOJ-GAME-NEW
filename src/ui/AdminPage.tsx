import { useEffect, useMemo, useState } from 'react';
import type { DeckTarget } from '../game/jojGame';
import {
  SHARED_TEMPLATE_SCHEMA_KIND,
  SHARED_TEMPLATE_SCHEMA_VERSION,
  serializeSharedRanksDocument,
} from '../game/sharedConfigSchema';
import { normalizeLobbyGameUiConfig } from '../game/lobbyConfig';
import { rankLabel } from './i18n';
import { text } from './i18n';
import { formatModuleDisplayName } from './moduleDisplay';
import { optimizeBlobForUpload } from './admin/imageUpload';
import {
  buildActiveTabDescriptionMap,
  buildAdminTabLabelMap,
} from './admin/page-text-maps';
import {
  AdminAnalyticsTab,
  AdminAwardsTab,
  AdminBugReportsTab,
  AdminDatabaseTab,
  AdminDeckTab,
  AdminGameConfigTab,
  AdminGithubTab,
  AdminImportTab,
  AdminMatchesTab,
  AdminRanksTab,
  AdminSettingsTab,
  AdminSimulationTab,
  AdminStateTab,
  AdminSystemAdminTab,
  AdminUsersTab,
  categories,
  rankResourceKeys,
  AdminStorageMode,
  AdminPageProps,
  AdminTab,
  AdminNavCategory,
  AdminNavTab,
  ImportCategoryMode,
  useAdminAnalytics,
  useAdminAssets,
  useAdminAwards,
  useAdminBugReports,
  useAdminCardEditor,
  useAdminGitActions,
  useAdminImageRegeneration,
  useAdminPageActions,
  useAdminRanksEditor,
  useAdminSimulation,
  useAdminTemplateManager,
  useAdminUsers,
  useBugReportUiConfig,
  useGameUiConfig,
  AdminShell,
  AdminNavigation,
  AdminOverview,
} from './admin';

export const AdminPage = ({
  uiVariant,
  lang,
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
  onSyncJsonToPostgresIncremental,
  onLoadFromPostgres,
  onSaveTemplateToPostgres,
  onCheckDbConfigSync,
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
  onSyncDbMigrations,
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
    sharedRanks.find((row) => row.id === rankId)?.name ??
    rankLabel(rankId, lang);
  const activeMatch = matches.find((m) => m.id === activeMatchId);

  const [restartingServer, setRestartingServer] = useState<boolean>(false);
  const [adminActionError, setAdminActionError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminTab>('start');
  const [v4Prefetched, setV4Prefetched] = useState(false);
  const optionalSimulationModules = useMemo(
    () =>
      (sharedDeckTemplate.modules ?? [])
        .filter(
          (module) =>
            module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck',
        )
        .map((module) => ({
          id: module.id,
          name: formatModuleDisplayName(module.name, module.id),
          alwaysOn: module.category === 'VVNZ',
        })),
    [sharedDeckTemplate.modules],
  );
  const simulationTemplateJson = useMemo(
    () =>
      JSON.stringify({
        kind: SHARED_TEMPLATE_SCHEMA_KIND,
        version: SHARED_TEMPLATE_SCHEMA_VERSION,
        catalog: cardCatalog,
        deckIds: sharedDeckTemplate.deck.map((card) => card.id),
        legendaryDeckIds: sharedDeckTemplate.legendaryDeck.map(
          (card) => card.id,
        ),
        rankTrackIds: sharedDeckTemplate.rankTrack.map((card) => card.id),
        deck: sharedDeckTemplate.deck,
        legendaryDeck: sharedDeckTemplate.legendaryDeck,
        rankTrack: sharedDeckTemplate.rankTrack,
        deckBackImage: sharedDeckTemplate.deckBackImage,
        modules: sharedDeckTemplate.modules,
        gameSetup: sharedDeckTemplate.gameSetup,
      }),
    [cardCatalog, sharedDeckTemplate],
  );
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
    blockedReason: sharedConfigLoaded ? '' : t.simulationBlockedByConfig,
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
  const adminJsonFetch = (url: string, init?: RequestInit) =>
    fetch(url, {
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
    closeBugReportDetail,
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
    allowedRoomCapacities,
    setAllowedRoomCapacities,
    defaultRoomCapacity,
    setDefaultRoomCapacity,
    allowedBotCounts,
    setAllowedBotCounts,
    defaultBotCount,
    setDefaultBotCount,
    resourceImagePaths,
    setResourceImagePaths,
    gameUiConfigLoading,
    gameUiConfigError,
    gameUiConfigStatus,
    loadGameUiConfig,
    saveGameUiConfig,
  } = useGameUiConfig({ lang, serverUrl, adminJsonFetch });
  const {
    assets,
    assetsLoading,
    assetsError,
    assetsStatus,
    assetsCleanupRunning,
    loadAssets,
    cleanupOrphanedFiles,
    cleanupOrphanedRecords,
  } = useAdminAssets({ lang, serverUrl, adminJsonFetch });

  const {
    gitStatus,
    gitStatusLoading,
    gitUpdateRunning,
    gitDeployRunning,
    gitPublishRunning,
    gitAuthStatus,
    gitAuthStatusLoading,
    gitAuthSaving,
    gitAuthUsernameDraft,
    setGitAuthUsernameDraft,
    gitAuthTokenDraft,
    setGitAuthTokenDraft,
    gitIgnoreLocalChanges,
    setGitIgnoreLocalChanges,
    gitCommitMessageDraft,
    setGitCommitMessageDraft,
    gitActionMessage,
    gitActionLog,
    gitLocalChanges,
    gitLocalChangesLoading,
    setGitActionMessage,
    setGitActionLog,
    loadGitAuthStatus,
    saveGitAuthConfig,
    clearGitAuthConfig,
    checkGitUpdates,
    applyGitUpdate,
    applyGitDeploy,
    viewGitLocalChanges,
    publishGitChanges,
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
  const { imageRegenRunning: regenRunning, regenerateAllTemplateImages } =
    useAdminImageRegeneration({
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
    if (activeTab !== 'users' || adminUsers.length > 0 || adminUsersLoading)
      return;
    void loadAdminUsers();
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'awards' || adminAwards.length > 0 || adminAwardsLoading)
      return;
    void loadAdminAwards();
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'analytics' || adminAnalytics || adminAnalyticsLoading)
      return;
    void refreshAdminAnalytics();
  }, [activeTab, adminAnalytics, adminAnalyticsLoading, refreshAdminAnalytics]);
  useEffect(() => {
    if (activeTab !== 'gameConfig' && activeTab !== 'settings') return;
    void loadBugReportUiConfig();
    void loadGameUiConfig();
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'systemAdmin' && activeTab !== 'settings') return;
    void loadAssets();
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'github') return;
    void loadGitAuthStatus({ preserveMessages: true });
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'bugReports' || bugReportsLoading) return;
    void loadBugReports();
  }, [activeTab]);
  const isV4 = uiVariant === 'v2';
  useEffect(() => {
    if (!isV4 || v4Prefetched) return;
    setV4Prefetched(true);
    void loadAdminUsers();
    void refreshAdminAnalytics();
    void loadBugReports();
    void loadAssets();
    void loadGitAuthStatus({ preserveMessages: true });
    void checkGitUpdates({ preserveMessages: true });
  }, [isV4, v4Prefetched]);
  const activeTabLabelMap = buildAdminTabLabelMap(t);
  const adminTabMeta: Record<AdminTab, AdminNavTab> = {
    start: {
      id: 'start',
      label: activeTabLabelMap.start,
      short: 'HM',
      iconPath: '/admin-icons/tab-start.svg',
    },
    matches: {
      id: 'matches',
      label: activeTabLabelMap.matches,
      short: 'M',
      iconPath: '/admin-icons/tab-matches.svg',
    },
    deck: {
      id: 'deck',
      label: activeTabLabelMap.deck,
      short: 'D',
      iconPath: '/admin-icons/tab-deck.svg',
    },
    import: {
      id: 'import',
      label: activeTabLabelMap.import,
      short: 'I',
      iconPath: '/admin-icons/tab-import.svg',
    },
    state: {
      id: 'state',
      label: activeTabLabelMap.state,
      short: 'S',
      iconPath: '/admin-icons/tab-state.svg',
    },
    ranks: {
      id: 'ranks',
      label: activeTabLabelMap.ranks,
      short: 'R',
      iconPath: '/admin-icons/tab-ranks.svg',
    },
    database: {
      id: 'database',
      label: activeTabLabelMap.database,
      short: 'DB',
      iconPath: '/admin-icons/tab-database.svg',
    },
    analytics: {
      id: 'analytics',
      label: activeTabLabelMap.analytics,
      short: 'A',
      iconPath: '/admin-icons/tab-analytics.svg',
    },
    github: {
      id: 'github',
      label: activeTabLabelMap.github,
      short: 'GH',
      iconPath: '/admin-icons/tab-github.svg',
    },
    settings: {
      id: 'settings',
      label: activeTabLabelMap.settings,
      short: 'ST',
      iconPath: '/admin-icons/tab-settings.svg',
    },
    simulation: {
      id: 'simulation',
      label: activeTabLabelMap.simulation,
      short: 'SM',
      iconPath: '/admin-icons/tab-simulation.svg',
    },
    users: {
      id: 'users',
      label: activeTabLabelMap.users,
      short: 'U',
      iconPath: '/admin-icons/tab-users.svg',
    },
    awards: {
      id: 'awards',
      label: activeTabLabelMap.awards,
      short: 'AW',
      iconPath: '/admin-icons/tab-awards.svg',
    },
    bugReports: {
      id: 'bugReports',
      label: activeTabLabelMap.bugReports,
      short: 'BR',
      iconPath: '/admin-icons/tab-bugs.svg',
    },
    gameConfig: {
      id: 'gameConfig',
      label: activeTabLabelMap.gameConfig,
      short: 'GC',
      iconPath: '/admin-icons/tab-settings.svg',
    },
    systemAdmin: {
      id: 'systemAdmin',
      label: activeTabLabelMap.systemAdmin,
      short: 'SA',
      iconPath: '/admin-icons/tab-settings.svg',
    },
  };
  const activeTabLabel = activeTabLabelMap[activeTab];
  const activeTabDescriptionMap = buildActiveTabDescriptionMap(lang);
  const adminCategories: AdminNavCategory[] =
    lang === 'uk'
      ? [
          {
            id: 'start',
            label: 'Початок',
            short: 'HOME',
            artLabel: 'Overview Deck',
            description: 'Зведення і контрольна панель',
            iconPath: '/admin-icons/start.svg',
            tabs: [adminTabMeta.start],
          },
          {
            id: 'operations',
            label: 'Операції',
            short: 'OPS',
            artLabel: 'Command Deck',
            description: 'Матчі, стан і симуляції',
            iconPath: '/admin-icons/operations.svg',
            tabs: [
              adminTabMeta.matches,
              adminTabMeta.state,
              adminTabMeta.simulation,
            ],
          },
          {
            id: 'content',
            label: 'Контент',
            short: 'CNT',
            artLabel: 'Archive Bay',
            description: 'Колоди, імпорт, ранги, нагороди',
            iconPath: '/admin-icons/content.svg',
            tabs: [
              adminTabMeta.deck,
              adminTabMeta.import,
              adminTabMeta.ranks,
              adminTabMeta.awards,
            ],
          },
          {
            id: 'data',
            label: 'Дані',
            short: 'DATA',
            artLabel: 'Registry Grid',
            description: 'База, користувачі, репорти',
            iconPath: '/admin-icons/data.svg',
            tabs: [
              adminTabMeta.database,
              adminTabMeta.users,
              adminTabMeta.bugReports,
            ],
          },
          {
            id: 'integrations',
            label: 'Інтеграції',
            short: 'INT',
            artLabel: 'Link Node',
            description: 'GitHub і зовнішні канали',
            iconPath: '/admin-icons/integrations.svg',
            tabs: [adminTabMeta.github],
          },
          {
            id: 'system',
            label: 'Система',
            short: 'SYS',
            artLabel: 'Control Room',
            description: 'Аналітика, налаштування гри та система',
            iconPath: '/admin-icons/system.svg',
            tabs: [adminTabMeta.analytics, adminTabMeta.gameConfig, adminTabMeta.systemAdmin],
          },
        ]
      : [
          {
            id: 'start',
            label: 'Start',
            short: 'HOME',
            artLabel: 'Overview Deck',
            description: 'Overview and control surface',
            iconPath: '/admin-icons/start.svg',
            tabs: [adminTabMeta.start],
          },
          {
            id: 'operations',
            label: 'Operations',
            short: 'OPS',
            artLabel: 'Command Deck',
            description: 'Matches, state and simulations',
            iconPath: '/admin-icons/operations.svg',
            tabs: [
              adminTabMeta.matches,
              adminTabMeta.state,
              adminTabMeta.simulation,
            ],
          },
          {
            id: 'content',
            label: 'Content',
            short: 'CNT',
            artLabel: 'Archive Bay',
            description: 'Decks, import, ranks and awards',
            iconPath: '/admin-icons/content.svg',
            tabs: [
              adminTabMeta.deck,
              adminTabMeta.import,
              adminTabMeta.ranks,
              adminTabMeta.awards,
            ],
          },
          {
            id: 'data',
            label: 'Data',
            short: 'DATA',
            artLabel: 'Registry Grid',
            description: 'Database, users and reports',
            iconPath: '/admin-icons/data.svg',
            tabs: [
              adminTabMeta.database,
              adminTabMeta.users,
              adminTabMeta.bugReports,
            ],
          },
          {
            id: 'integrations',
            label: 'Integrations',
            short: 'INT',
            artLabel: 'Link Node',
            description: 'GitHub and external channels',
            iconPath: '/admin-icons/integrations.svg',
            tabs: [adminTabMeta.github],
          },
          {
            id: 'system',
            label: 'System',
            short: 'SYS',
            artLabel: 'Control Room',
            description: 'Analytics, game config and system',
            iconPath: '/admin-icons/system.svg',
            tabs: [adminTabMeta.analytics, adminTabMeta.gameConfig, adminTabMeta.systemAdmin],
          },
        ];
  const activeCategory =
    adminCategories.find((category) =>
      category.tabs.some((tab) => tab.id === activeTab),
    ) ?? adminCategories[0];
  return (
    <AdminShell uiVariant={uiVariant} t={t}>
      <AdminNavigation
        activeCategory={activeCategory}
        activeTab={activeTab}
        activeTabLabel={activeTabLabel}
        adminCategories={adminCategories}
        setActiveTab={setActiveTab}
        matches={matches}
        activeMatchId={activeMatchId}
        t={t}
        activeTabDescriptionMap={activeTabDescriptionMap}
      >
        {activeTab === 'start' ? (
          <AdminOverview
            t={t}
            lang={lang}
            matches={matches}
            cardCatalog={cardCatalog}
            sharedRanks={sharedRanks}
            sharedDeckTemplate={sharedDeckTemplate}
            sharedConfigLoaded={sharedConfigLoaded}
            activeMatchId={activeMatchId}
            storageMode={storageMode}
            serverUrl={serverUrl}
            gitAuthStatus={gitAuthStatus}
            gitStatus={gitStatus}
            gitActionMessage={gitActionMessage}
            bugReports={bugReports}
            assets={assets}
            adminUsers={adminUsers}
            adminUsersLoading={adminUsersLoading}
            assetsLoading={assetsLoading}
            adminAnalytics={adminAnalytics}
            localizedRankName={localizedRankName}
            setActiveTab={setActiveTab}
          />
        ) : null}
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
            onResetAll={onResetAll}
            regenerateAllTemplateImages={regenerateAllTemplateImages}
            imageRegenRunning={regenRunning}
            restartingServer={restartingServer}
            setAdminActionError={setAdminActionError}
            setRestartingServer={setRestartingServer}
            onRestartServer={onRestartServer}
            adminActionError={adminActionError}
            bugReportImagePath={bugReportImagePath}
            onBugReportImagePathChange={setBugReportImagePath}
            onSaveBugReportImagePath={() =>
              saveBugReportUiConfig(bugReportImagePath)
            }
            onUploadBugReportImage={async (file) => {
              if (!file) return;
              const optimized = await optimizeBlobForUpload(file, file.name, {
                maxWidth: 100,
                maxHeight: 100,
                quality: 0.92,
              });
              if (!optimized) {
                setAdminActionError(t.uploadFailedGeneric);
                return;
              }
              const uploaded = await uploadDataUrl(
                `bug-report-icon-${Date.now()}`,
                optimized.dataUrl,
              );
              if (!uploaded) return;
              setBugReportImagePath(uploaded);
              await saveBugReportUiConfig(uploaded);
            }}
            bugReportUiConfigLoading={bugReportUiConfigLoading}
            bugReportUiConfigError={bugReportUiConfigError}
            bugReportUiConfigStatus={bugReportUiConfigStatus}
            allowedRoomCapacities={allowedRoomCapacities}
            onToggleAllowedRoomCapacity={(capacity) => {
              const next = normalizeLobbyGameUiConfig({
                allowedRoomCapacities: allowedRoomCapacities.includes(capacity)
                  ? allowedRoomCapacities.filter((item) => item !== capacity)
                  : [...allowedRoomCapacities, capacity],
                defaultRoomCapacity,
                allowedBotCounts,
                defaultBotCount,
              });
              setAllowedRoomCapacities(next.allowedRoomCapacities);
              setDefaultRoomCapacity(next.defaultRoomCapacity);
              setAllowedBotCounts(next.allowedBotCounts);
              setDefaultBotCount(next.defaultBotCount);
            }}
            defaultRoomCapacity={defaultRoomCapacity}
            onDefaultRoomCapacityChange={setDefaultRoomCapacity}
            allowedBotCounts={allowedBotCounts}
            onToggleAllowedBotCount={(count) => {
              const next = normalizeLobbyGameUiConfig({
                allowedRoomCapacities,
                defaultRoomCapacity,
                allowedBotCounts: allowedBotCounts.includes(count)
                  ? allowedBotCounts.filter((item) => item !== count)
                  : [...allowedBotCounts, count],
                defaultBotCount,
              });
              setAllowedBotCounts(next.allowedBotCounts);
              setDefaultBotCount(next.defaultBotCount);
            }}
            defaultBotCount={defaultBotCount}
            onDefaultBotCountChange={setDefaultBotCount}
            resourceImagePaths={resourceImagePaths}
            onResourceIconPathChange={(key, value) => {
              setResourceImagePaths((prev) => ({ ...prev, [key]: value }));
            }}
            onUploadResourceIcon={async (key, file) => {
              if (!file) return;
              const optimized = await optimizeBlobForUpload(file, file.name, {
                maxWidth: 256,
                maxHeight: 256,
                quality: 0.92,
              });
              if (!optimized) {
                setAdminActionError(t.uploadFailedGeneric);
                return;
              }
              const uploaded = await uploadDataUrl(
                `resource-icon-${key}-${Date.now()}`,
                optimized.dataUrl,
              );
              if (!uploaded) return;
              const next = normalizeLobbyGameUiConfig({
                allowedRoomCapacities,
                defaultRoomCapacity,
                allowedBotCounts,
                defaultBotCount,
                resourceImagePaths: {
                  ...resourceImagePaths,
                  [key]: uploaded,
                },
              });
              setAllowedRoomCapacities(next.allowedRoomCapacities);
              setDefaultRoomCapacity(next.defaultRoomCapacity);
              setAllowedBotCounts(next.allowedBotCounts);
              setDefaultBotCount(next.defaultBotCount);
              setResourceImagePaths(next.resourceImagePaths);
              await saveGameUiConfig(next);
            }}
            onSaveGameUiConfig={() => {
              void saveGameUiConfig();
            }}
            gameUiConfigLoading={gameUiConfigLoading}
            gameUiConfigError={gameUiConfigError}
            gameUiConfigStatus={gameUiConfigStatus}
            assets={assets}
            assetsLoading={assetsLoading}
            assetsError={assetsError}
            assetsStatus={assetsStatus}
            assetsCleanupRunning={assetsCleanupRunning}
            onRefreshAssets={() => {
              void loadAssets();
            }}
            onCleanupOrphanedFiles={() => {
              void cleanupOrphanedFiles();
            }}
            onCleanupOrphanedRecords={() => {
              void cleanupOrphanedRecords();
            }}
          />
        ) : null}

        {activeTab === 'gameConfig' ? (
          <AdminGameConfigTab
            t={t}
            lang={lang}
            serverUrlDraft={serverUrlDraft}
            onServerUrlDraftChange={onServerUrlDraftChange}
            onSaveServerUrl={onSaveServerUrl}
            onResetServerUrl={onResetServerUrl}
            serverUrl={serverUrl}
            bugReportImagePath={bugReportImagePath}
            onBugReportImagePathChange={setBugReportImagePath}
            onSaveBugReportImagePath={() => saveBugReportUiConfig(bugReportImagePath)}
            onUploadBugReportImage={async (file) => {
              if (!file) return;
              const optimized = await optimizeBlobForUpload(file, file.name, {
                maxWidth: 100,
                maxHeight: 100,
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
            allowedRoomCapacities={allowedRoomCapacities}
            onToggleAllowedRoomCapacity={(capacity) => {
              const next = normalizeLobbyGameUiConfig({
                allowedRoomCapacities: allowedRoomCapacities.includes(capacity)
                  ? allowedRoomCapacities.filter((item) => item !== capacity)
                  : [...allowedRoomCapacities, capacity],
                defaultRoomCapacity,
                allowedBotCounts,
                defaultBotCount,
              });
              setAllowedRoomCapacities(next.allowedRoomCapacities);
              setDefaultRoomCapacity(next.defaultRoomCapacity);
            }}
            defaultRoomCapacity={defaultRoomCapacity}
            onDefaultRoomCapacityChange={setDefaultRoomCapacity}
            allowedBotCounts={allowedBotCounts}
            onToggleAllowedBotCount={(count) => {
              const next = normalizeLobbyGameUiConfig({
                allowedRoomCapacities,
                defaultRoomCapacity,
                allowedBotCounts: allowedBotCounts.includes(count)
                  ? allowedBotCounts.filter((item) => item !== count)
                  : [...allowedBotCounts, count],
                defaultBotCount,
              });
              setAllowedBotCounts(next.allowedBotCounts);
              setDefaultBotCount(next.defaultBotCount);
            }}
            defaultBotCount={defaultBotCount}
            onDefaultBotCountChange={setDefaultBotCount}
            resourceImagePaths={resourceImagePaths}
            onResourceIconPathChange={(key, value) => {
              setResourceImagePaths((prev) => ({ ...prev, [key]: value }));
            }}
            onUploadResourceIcon={async (key, file) => {
              if (!file) return;
              const optimized = await optimizeBlobForUpload(file, file.name, {
                maxWidth: 256,
                maxHeight: 256,
                quality: 0.92,
              });
              if (!optimized) {
                setAdminActionError(t.uploadFailedGeneric);
                return;
              }
              const uploaded = await uploadDataUrl(`resource-icon-${key}-${Date.now()}`, optimized.dataUrl);
              if (!uploaded) return;
              const next = normalizeLobbyGameUiConfig({
                allowedRoomCapacities,
                defaultRoomCapacity,
                allowedBotCounts,
                defaultBotCount,
                resourceImagePaths: { ...resourceImagePaths, [key]: uploaded },
              });
              setResourceImagePaths(next.resourceImagePaths);
              await saveGameUiConfig(next);
            }}
            onSaveGameUiConfig={() => void saveGameUiConfig()}
            gameUiConfigLoading={gameUiConfigLoading}
            gameUiConfigError={gameUiConfigError}
            gameUiConfigStatus={gameUiConfigStatus}
          />
        ) : null}

        {activeTab === 'systemAdmin' ? (
          <AdminSystemAdminTab
            t={t}
            lang={lang}
            serverUrl={serverUrl}
            onResetAll={onResetAll}
            regenerateAllTemplateImages={regenerateAllTemplateImages}
            imageRegenRunning={regenRunning}
            restartingServer={restartingServer}
            setAdminActionError={setAdminActionError}
            setRestartingServer={setRestartingServer}
            onRestartServer={onRestartServer}
            adminActionError={adminActionError}
            assets={assets}
            assetsLoading={assetsLoading}
            assetsError={assetsError}
            assetsStatus={assetsStatus}
            assetsCleanupRunning={assetsCleanupRunning}
            onRefreshAssets={() => void loadAssets()}
            onCleanupOrphanedFiles={() => void cleanupOrphanedFiles()}
            onCleanupOrphanedRecords={() => void cleanupOrphanedRecords()}
          />
        ) : null}

        {activeTab === 'github' ? (
          <AdminGithubTab
            t={t}
            gitAuthStatus={gitAuthStatus}
            gitAuthStatusLoading={gitAuthStatusLoading}
            gitAuthSaving={gitAuthSaving}
            gitAuthUsernameDraft={gitAuthUsernameDraft}
            setGitAuthUsernameDraft={setGitAuthUsernameDraft}
            gitAuthTokenDraft={gitAuthTokenDraft}
            setGitAuthTokenDraft={setGitAuthTokenDraft}
            gitIgnoreLocalChanges={gitIgnoreLocalChanges}
            setGitIgnoreLocalChanges={setGitIgnoreLocalChanges}
            gitCommitMessageDraft={gitCommitMessageDraft}
            setGitCommitMessageDraft={setGitCommitMessageDraft}
            loadGitAuthStatus={loadGitAuthStatus}
            saveGitAuthConfig={saveGitAuthConfig}
            clearGitAuthConfig={clearGitAuthConfig}
            checkGitUpdates={checkGitUpdates}
            applyGitUpdate={applyGitUpdate}
            applyGitDeploy={applyGitDeploy}
            gitStatus={gitStatus}
            gitStatusLoading={gitStatusLoading}
            gitUpdateRunning={gitUpdateRunning}
            gitDeployRunning={gitDeployRunning}
            gitPublishRunning={gitPublishRunning}
            publishGitChanges={publishGitChanges}
            gitLocalChanges={gitLocalChanges}
            gitLocalChangesLoading={gitLocalChangesLoading}
            viewGitLocalChanges={viewGitLocalChanges}
            gitActionMessage={gitActionMessage}
            gitActionLog={gitActionLog}
          />
        ) : null}
        {activeTab === 'analytics' ? (
          <AdminAnalyticsTab
            t={t}
            adminAnalytics={adminAnalytics}
            adminAnalyticsLoading={adminAnalyticsLoading}
            adminAnalyticsError={adminAnalyticsError}
            onRefreshAdminAnalytics={refreshAdminAnalytics}
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
            onSyncJsonToPostgresIncremental={onSyncJsonToPostgresIncremental}
            onLoadFromPostgres={onLoadFromPostgres}
            onSaveTemplateToPostgres={onSaveTemplateToPostgres}
            onCheckDbConfigSync={onCheckDbConfigSync}
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
            dbCheckSyncStatus={dbCheckSyncStatus}
            dbCheckSyncError={dbCheckSyncError}
            dbCheckSyncRunning={dbCheckSyncRunning}
            onSyncDbMigrations={onSyncDbMigrations}
            dbSyncMigrationsStatus={dbSyncMigrationsStatus}
            dbSyncMigrationsError={dbSyncMigrationsError}
            dbSyncMigrationsRunning={dbSyncMigrationsRunning}
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
            onSearch={() => {
              void loadAdminUsers();
            }}
            users={adminUsers}
            selectedUserId={selectedAdminUserId}
            onSelectUserId={(value) => {
              void loadAdminUserDetail(value);
            }}
            selectedUserDetail={selectedAdminUserDetail}
            loading={adminUsersLoading}
            error={adminUsersError}
            onSetStatus={(status) => {
              void updateAdminUserStatus(status);
            }}
            onSetRole={(role) => {
              void updateAdminUserRole(role);
            }}
            editDraft={adminEditUserDraft}
            setEditDraft={setAdminEditUserDraft}
            onSaveEdit={() => {
              void updateAdminUserProfile();
            }}
            createDraft={adminCreateUserDraft}
            setCreateDraft={setAdminCreateUserDraft}
            onCreateUser={() => {
              void createAdminUser();
            }}
            onRequestPasswordReset={() => {
              void requestAdminPasswordReset();
            }}
            onLogoutAllSessions={() => {
              void logoutAllAdminUserSessions();
            }}
            onLogoutUserSession={(sessionId) => {
              void logoutAdminUserSession(sessionId);
            }}
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
            onSave={() => {
              void saveAdminAward();
            }}
            onDelete={() => {
              void deleteAdminAward();
            }}
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
            onSelectReport={(id) => {
              void loadBugReportDetail(id);
            }}
            onCloseDetails={closeBugReportDetail}
            onMarkResolved={() => {
              void setBugReportStatus('resolved');
            }}
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
            onModuleAction={(moduleId, action) =>
              applyModuleAction(moduleId, action)
            }
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
            setImportCategoryMode={(v) =>
              setImportCategoryMode(v as ImportCategoryMode)
            }
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
            onStopGame={() => {
              void stopGame();
            }}
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
      </AdminNavigation>
    </AdminShell>
  );
};
