import { useEffect, useMemo, useState } from 'react';
import type { DeckTarget } from '../game/jojGame';
import { SHARED_TEMPLATE_SCHEMA_KIND, SHARED_TEMPLATE_SCHEMA_VERSION, serializeSharedRanksDocument } from '../game/sharedConfigSchema';
import { normalizeLobbyGameUiConfig } from '../game/lobbyConfig';
import { rankLabel } from './i18n';
import { text } from './i18n';
import { formatModuleDisplayName } from './moduleDisplay';
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
import { useAdminAssets } from './admin/useAdminAssets';
import { useAdminBugReports } from './admin/useAdminBugReports';
import { useBugReportUiConfig } from './admin/useBugReportUiConfig';
import { useGameUiConfig } from './admin/useGameUiConfig';
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
  AdminCategoryButtons,
  AdminImportTab,
  AdminDeckTab,
  AdminDatabaseTab,
  AdminMatchesTab,
  AdminRanksTab,
  AdminSettingsTab,
  AdminSimulationTab,
  AdminStateTab,
  AdminTabButtons,
  AdminAnalyticsTab,
  AdminGithubTab,
  AdminAwardsTab,
  AdminBugReportsTab,
  AdminUsersTab,
} from './admin/tabs';
import type { AdminNavCategory, AdminNavTab } from './admin/tabs';

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
  const [activeTab, setActiveTab] = useState<AdminTab>('start');
  const [v4Prefetched, setV4Prefetched] = useState(false);
  const optionalSimulationModules = useMemo(
    () => (sharedDeckTemplate.modules ?? [])
      .filter((module) => module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck')
      .map((module) => ({
        id: module.id,
        name: formatModuleDisplayName(module.name, module.id),
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
    setGitActionMessage,
    setGitActionLog,
    loadGitAuthStatus,
    saveGitAuthConfig,
    clearGitAuthConfig,
    checkGitUpdates,
    applyGitUpdate,
    applyGitDeploy,
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
    if (activeTab !== 'analytics' || adminAnalytics || adminAnalyticsLoading) return;
    void refreshAdminAnalytics();
  }, [activeTab, adminAnalytics, adminAnalyticsLoading, refreshAdminAnalytics]);
  useEffect(() => {
    if (activeTab !== 'settings') return;
    void loadBugReportUiConfig();
    void loadGameUiConfig();
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
  const v4Text = lang === 'uk'
    ? {
      runtimeTitle: 'Стан системи',
      runtimeMeta: 'live',
      storageLabel: 'Сховище',
      serverLabel: 'Сервер',
      configLabel: 'Shared config',
      gitTitle: 'GitHub та деплой',
      gitMeta: 'repo',
      authLabel: 'Доступ',
      repoLabel: 'Гілка',
      syncLabel: 'Синхронізація',
      moderationTitle: 'Модерація',
      moderationMeta: 'reports',
      newReportsLabel: 'Нові',
      resolvedReportsLabel: 'Вирішено',
      latestReporterLabel: 'Останній автор',
      usersAssetsTitle: 'Користувачі та assets',
      usersAssetsMeta: 'library',
      usersLabel: 'Користувачі',
      adminsLabel: 'Адміни',
      assetsLabel: 'Assets',
      latestAssetLabel: 'Останній файл',
      analyticsTitle: 'Пульс матчів',
      analyticsMeta: 'telemetry',
      finishedLabel: 'Завершено',
      avgTurnsLabel: 'Сер. ходів',
      topModeLabel: 'Топ-режим',
      topRankLabel: 'Топ-звання',
      connected: 'підключено',
      notConnected: 'не підключено',
      ready: 'готово',
      loading: 'завантаження',
      clean: 'чисто',
      dirty: 'локальні зміни',
      upToDate: 'актуально',
      noData: 'ще немає даних',
      unknownUser: 'невідомо',
    }
    : {
      runtimeTitle: 'System status',
      runtimeMeta: 'live',
      storageLabel: 'Storage',
      serverLabel: 'Server',
      configLabel: 'Shared config',
      gitTitle: 'GitHub and deploy',
      gitMeta: 'repo',
      authLabel: 'Access',
      repoLabel: 'Branch',
      syncLabel: 'Sync',
      moderationTitle: 'Moderation',
      moderationMeta: 'reports',
      newReportsLabel: 'New',
      resolvedReportsLabel: 'Resolved',
      latestReporterLabel: 'Latest reporter',
      usersAssetsTitle: 'Users and assets',
      usersAssetsMeta: 'library',
      usersLabel: 'Users',
      adminsLabel: 'Admins',
      assetsLabel: 'Assets',
      latestAssetLabel: 'Latest file',
      analyticsTitle: 'Match pulse',
      analyticsMeta: 'telemetry',
      finishedLabel: 'Finished',
      avgTurnsLabel: 'Avg turns',
      topModeLabel: 'Top mode',
      topRankLabel: 'Top rank',
      connected: 'connected',
      notConnected: 'not connected',
      ready: 'ready',
      loading: 'loading',
      clean: 'clean',
      dirty: 'local changes',
      upToDate: 'up to date',
      noData: 'no data yet',
      unknownUser: 'unknown',
    };
  const activeTabLabelMap: Record<AdminTab, string> = {
    start: t.tabStart,
    matches: t.tabMatches,
    deck: t.tabDeck,
    import: t.tabImportExport,
    state: t.tabState,
    ranks: t.tabRanks,
    database: t.tabDatabase,
    analytics: t.tabAnalytics,
    github: t.tabGithub,
    settings: t.tabSettings,
    simulation: t.tabSimulation,
    users: t.tabUsers,
    awards: t.tabAwards,
    bugReports: t.tabBugReports,
  };
  const adminTabMeta: Record<AdminTab, AdminNavTab> = {
    start: { id: 'start', label: activeTabLabelMap.start, short: 'HM', iconPath: '/admin-icons/tab-start.svg' },
    matches: { id: 'matches', label: activeTabLabelMap.matches, short: 'M', iconPath: '/admin-icons/tab-matches.svg' },
    deck: { id: 'deck', label: activeTabLabelMap.deck, short: 'D', iconPath: '/admin-icons/tab-deck.svg' },
    import: { id: 'import', label: activeTabLabelMap.import, short: 'I', iconPath: '/admin-icons/tab-import.svg' },
    state: { id: 'state', label: activeTabLabelMap.state, short: 'S', iconPath: '/admin-icons/tab-state.svg' },
    ranks: { id: 'ranks', label: activeTabLabelMap.ranks, short: 'R', iconPath: '/admin-icons/tab-ranks.svg' },
    database: { id: 'database', label: activeTabLabelMap.database, short: 'DB', iconPath: '/admin-icons/tab-database.svg' },
    analytics: { id: 'analytics', label: activeTabLabelMap.analytics, short: 'A', iconPath: '/admin-icons/tab-analytics.svg' },
    github: { id: 'github', label: activeTabLabelMap.github, short: 'GH', iconPath: '/admin-icons/tab-github.svg' },
    settings: { id: 'settings', label: activeTabLabelMap.settings, short: 'ST', iconPath: '/admin-icons/tab-settings.svg' },
    simulation: { id: 'simulation', label: activeTabLabelMap.simulation, short: 'SM', iconPath: '/admin-icons/tab-simulation.svg' },
    users: { id: 'users', label: activeTabLabelMap.users, short: 'U', iconPath: '/admin-icons/tab-users.svg' },
    awards: { id: 'awards', label: activeTabLabelMap.awards, short: 'AW', iconPath: '/admin-icons/tab-awards.svg' },
    bugReports: { id: 'bugReports', label: activeTabLabelMap.bugReports, short: 'BR', iconPath: '/admin-icons/tab-bugs.svg' },
  };
  const activeTabLabel = activeTabLabelMap[activeTab];
  const v4StatCards = [
    { label: t.matches, value: String(matches.length), tone: 'teal' },
    { label: t.deckCount, value: String(cardCatalog.length), tone: 'mint' },
    { label: t.ranksTitle, value: String(sharedRanks.length), tone: 'blue' },
    { label: t.roomModulesLabel, value: String(sharedDeckTemplate.modules.length), tone: 'sand' },
  ];
  const adminCount = adminUsers.filter((user) => user.role === 'administrator').length;
  const unresolvedBugReports = bugReports.filter((report) => report.status === 'new').length;
  const resolvedBugReports = bugReports.filter((report) => report.status === 'resolved').length;
  const latestBugReport = bugReports[0] ?? null;
  const latestAsset = assets.find((asset) => !asset.deletedAt) ?? assets[0] ?? null;
  const topMode = adminAnalytics?.byMode
    ? [...adminAnalytics.byMode].sort((left, right) => right.matchesFinished - left.matchesFinished)[0]
    : null;
  const topWinningRank = adminAnalytics?.topWinningRanks?.[0] ?? null;
  const activeTabDescriptionMap: Record<AdminTab, string> = lang === 'uk'
    ? {
      start: 'Стартова зведена панель зі станом системи, модерацією, GitHub і telemetry.',
      matches: 'Оперативне керування матчами, швидкий перезапуск і контроль активної кімнати.',
      deck: 'Редагування карт, модулів і структури основної колоди.',
      import: 'Імпорт, експорт і пакетні операції над шаблонами.',
      ranks: 'Налаштування звань, вимог і варіантів зображень.',
      state: 'Інспекція state snapshot та аварійна зупинка поточного матчу.',
      database: 'Збереження конфігів, резервні копії та міграції БД.',
      analytics: 'Зведена телеметрія матчів, режимів і топових рангів.',
      github: 'GitHub credentials, синхронізація репозиторію та деплой.',
      users: 'Користувачі, ролі, профілі та активні сесії.',
      awards: 'Керування нагородами та умовами їх видачі.',
      bugReports: 'Черга репортів, скріншоти й модерація інцидентів.',
      settings: 'Серверні налаштування, UI config і технічне обслуговування assets.',
      simulation: 'Симуляції балансу, прогрес виконання і зведення по результатах.',
    }
    : {
      start: 'Landing overview with system health, moderation, GitHub and telemetry.',
      matches: 'Live match operations, quick reset flow and active room control.',
      deck: 'Card, module and shared deck structure management.',
      import: 'Import, export and bulk template operations.',
      ranks: 'Rank definitions, requirements and image variants.',
      state: 'State snapshot inspection and emergency match stop.',
      database: 'Config persistence, backups and database migrations.',
      analytics: 'Match telemetry, mode trends and top rank outcomes.',
      github: 'GitHub credentials, repository sync and deploy actions.',
      users: 'Users, roles, profiles and active sessions.',
      awards: 'Award definitions and unlock rule management.',
      bugReports: 'Bug report queue, screenshots and moderation flow.',
      settings: 'Server settings, UI config and asset maintenance.',
      simulation: 'Balance simulations, run progress and result summaries.',
    };
  const adminCategories: AdminNavCategory[] = lang === 'uk'
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
        tabs: [adminTabMeta.matches, adminTabMeta.state, adminTabMeta.simulation],
      },
      {
        id: 'content',
        label: 'Контент',
        short: 'CNT',
        artLabel: 'Archive Bay',
        description: 'Колоди, імпорт, ранги, нагороди',
        iconPath: '/admin-icons/content.svg',
        tabs: [adminTabMeta.deck, adminTabMeta.import, adminTabMeta.ranks, adminTabMeta.awards],
      },
      {
        id: 'data',
        label: 'Дані',
        short: 'DATA',
        artLabel: 'Registry Grid',
        description: 'База, користувачі, репорти',
        iconPath: '/admin-icons/data.svg',
        tabs: [adminTabMeta.database, adminTabMeta.users, adminTabMeta.bugReports],
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
        description: 'Аналітика й налаштування',
        iconPath: '/admin-icons/system.svg',
        tabs: [adminTabMeta.analytics, adminTabMeta.settings],
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
        tabs: [adminTabMeta.matches, adminTabMeta.state, adminTabMeta.simulation],
      },
      {
        id: 'content',
        label: 'Content',
        short: 'CNT',
        artLabel: 'Archive Bay',
        description: 'Decks, import, ranks and awards',
        iconPath: '/admin-icons/content.svg',
        tabs: [adminTabMeta.deck, adminTabMeta.import, adminTabMeta.ranks, adminTabMeta.awards],
      },
      {
        id: 'data',
        label: 'Data',
        short: 'DATA',
        artLabel: 'Registry Grid',
        description: 'Database, users and reports',
        iconPath: '/admin-icons/data.svg',
        tabs: [adminTabMeta.database, adminTabMeta.users, adminTabMeta.bugReports],
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
        description: 'Analytics and settings',
        iconPath: '/admin-icons/system.svg',
        tabs: [adminTabMeta.analytics, adminTabMeta.settings],
      },
    ];
  const activeCategory = adminCategories.find((category) => category.tabs.some((tab) => tab.id === activeTab)) ?? adminCategories[0];
  const activeCategoryId = activeCategory.id;
  const v4OverviewPanel = (
    <>
      <section className="admin-v4-hero">
        <div>
          <p className="admin-v4-kicker">GreenDesk Control Surface</p>
          <h3>{t.tabStart}</h3>
          <p className="admin-v4-subtitle">
            {sharedConfigLoaded
              ? `PostgreSQL online. Active match: ${activeMatchId || t.notSelected}.`
              : 'Loading shared config, runtime controls and telemetry.'}
          </p>
        </div>
        <div className="admin-v4-hero-actions">
          <button type="button" onClick={() => setActiveTab('matches')}>{t.tabMatches}</button>
          <button type="button" onClick={() => setActiveTab('settings')}>{t.tabSettings}</button>
          <button type="button" onClick={() => setActiveTab('github')}>{t.tabGithub}</button>
        </div>
      </section>
      <section className="admin-v4-stats">
        {v4StatCards.map((card) => (
          <article key={card.label} className={`admin-v4-stat-card tone-${card.tone}`}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>
      <section className="admin-v4-overview-grid">
        <article className="admin-v4-panel">
          <header className="admin-v4-panel-head">
            <div>
              <p>{v4Text.runtimeMeta}</p>
              <h4>{v4Text.runtimeTitle}</h4>
            </div>
            <span className={`admin-v4-badge ${sharedConfigLoaded ? 'is-good' : 'is-warn'}`}>
              {sharedConfigLoaded ? v4Text.ready : v4Text.loading}
            </span>
          </header>
          <div className="admin-v4-status-stack">
            <div><span>{v4Text.storageLabel}</span><strong>{storageMode === 'db' ? t.storageModeDb : t.storageModeFiles}</strong></div>
            <div><span>{v4Text.serverLabel}</span><strong>{serverUrl || t.notSelected}</strong></div>
            <div><span>{v4Text.configLabel}</span><strong>{sharedConfigLoaded ? v4Text.ready : v4Text.loading}</strong></div>
          </div>
        </article>
        <article className="admin-v4-panel">
          <header className="admin-v4-panel-head">
            <div>
              <p>{v4Text.gitMeta}</p>
              <h4>{v4Text.gitTitle}</h4>
            </div>
            <span className={`admin-v4-badge ${gitAuthStatus?.hasGithubCredentials ? 'is-good' : 'is-muted'}`}>
              {gitAuthStatus?.hasGithubCredentials ? v4Text.connected : v4Text.notConnected}
            </span>
          </header>
          <div className="admin-v4-status-stack">
            <div><span>{v4Text.authLabel}</span><strong>{gitAuthStatus?.savedUsername || v4Text.notConnected}</strong></div>
            <div><span>{v4Text.repoLabel}</span><strong>{gitStatus?.branch || t.notSelected}</strong></div>
            <div><span>{v4Text.syncLabel}</span><strong>{gitStatus ? (gitStatus.dirty ? v4Text.dirty : gitStatus.behind > 0 ? `${gitStatus.behind} behind` : v4Text.upToDate) : v4Text.loading}</strong></div>
          </div>
          {gitActionMessage ? <p className="admin-v4-note">{gitActionMessage}</p> : null}
        </article>
        <article className="admin-v4-panel">
          <header className="admin-v4-panel-head">
            <div>
              <p>{v4Text.moderationMeta}</p>
              <h4>{v4Text.moderationTitle}</h4>
            </div>
            <span className={`admin-v4-badge ${unresolvedBugReports > 0 ? 'is-warn' : 'is-good'}`}>
              {unresolvedBugReports > 0 ? `${unresolvedBugReports}` : v4Text.clean}
            </span>
          </header>
          <div className="admin-v4-status-stack">
            <div><span>{v4Text.newReportsLabel}</span><strong>{String(unresolvedBugReports)}</strong></div>
            <div><span>{v4Text.resolvedReportsLabel}</span><strong>{String(resolvedBugReports)}</strong></div>
            <div><span>{v4Text.latestReporterLabel}</span><strong>{latestBugReport?.submittedBy.displayName || latestBugReport?.submittedBy.username || v4Text.unknownUser}</strong></div>
          </div>
          <p className="admin-v4-note">{latestBugReport?.descriptionPreview || v4Text.noData}</p>
        </article>
        <article className="admin-v4-panel">
          <header className="admin-v4-panel-head">
            <div>
              <p>{v4Text.usersAssetsMeta}</p>
              <h4>{v4Text.usersAssetsTitle}</h4>
            </div>
            <span className="admin-v4-badge is-muted">{assetsLoading || adminUsersLoading ? v4Text.loading : v4Text.ready}</span>
          </header>
          <div className="admin-v4-status-stack">
            <div><span>{v4Text.usersLabel}</span><strong>{String(adminUsers.length)}</strong></div>
            <div><span>{v4Text.adminsLabel}</span><strong>{String(adminCount)}</strong></div>
            <div><span>{v4Text.assetsLabel}</span><strong>{String(assets.length)}</strong></div>
          </div>
          <p className="admin-v4-note">{v4Text.latestAssetLabel}: {latestAsset?.fileName || v4Text.noData}</p>
        </article>
        <article className="admin-v4-panel admin-v4-panel-wide">
          <header className="admin-v4-panel-head">
            <div>
              <p>{v4Text.analyticsMeta}</p>
              <h4>{v4Text.analyticsTitle}</h4>
            </div>
            <span className={`admin-v4-badge ${adminAnalytics ? 'is-good' : 'is-muted'}`}>
              {adminAnalytics ? `${adminAnalytics.matchesFinished}` : v4Text.loading}
            </span>
          </header>
          <div className="admin-v4-metric-row">
            <div><span>{v4Text.finishedLabel}</span><strong>{String(adminAnalytics?.matchesFinished ?? 0)}</strong></div>
            <div><span>{v4Text.avgTurnsLabel}</span><strong>{String(adminAnalytics?.avgTurns ?? 0)}</strong></div>
            <div><span>{v4Text.topModeLabel}</span><strong>{topMode ? `${topMode.mode} · ${topMode.matchesFinished}` : v4Text.noData}</strong></div>
            <div><span>{v4Text.topRankLabel}</span><strong>{topWinningRank ? `${localizedRankName(topWinningRank.rankId)} · ${topWinningRank.count}` : v4Text.noData}</strong></div>
          </div>
        </article>
      </section>
    </>
  );
  const activeTabPanel = (
    <>
      {activeTab === 'start' ? v4OverviewPanel : null}
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
          onSaveGameUiConfig={() => { void saveGameUiConfig(); }}
          gameUiConfigLoading={gameUiConfigLoading}
          gameUiConfigError={gameUiConfigError}
          gameUiConfigStatus={gameUiConfigStatus}
          assets={assets}
          assetsLoading={assetsLoading}
          assetsError={assetsError}
          assetsStatus={assetsStatus}
          assetsCleanupRunning={assetsCleanupRunning}
          onRefreshAssets={() => { void loadAssets(); }}
          onCleanupOrphanedFiles={() => { void cleanupOrphanedFiles(); }}
          onCleanupOrphanedRecords={() => { void cleanupOrphanedRecords(); }}
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
          onCloseDetails={closeBugReportDetail}
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
    </>
  );
  return (
    <section className="admin-shell-v4 admin-panel-v4">
      <h2>{t.adminTitle}</h2>
      <>
        <section className="admin-v4-tab-nav">
          <AdminCategoryButtons
            categories={adminCategories}
            activeCategoryId={activeCategoryId}
            onSelectCategory={(categoryId) => {
              const category = adminCategories.find((item) => item.id === categoryId);
                if (category?.tabs[0]) {
                  setActiveTab(category.tabs[0].id);
                }
              }}
            />
          </section>
          <section className="admin-v4-workspace">
            <header className={`admin-v4-workspace-head is-${activeCategory.id}`}>
              <div className="admin-v4-workspace-copy">
                <p className="admin-v4-kicker">{activeCategory.label}</p>
                <h3>{activeTabLabel}</h3>
                <p className="admin-v4-subtitle">{activeTabDescriptionMap[activeTab]}</p>
                <AdminTabButtons
                  tabs={activeCategory.tabs}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  className={`admin-v4-tab-strip is-${activeCategory.id}`}
                />
              </div>
              <aside className={`admin-v4-category-banner is-${activeCategory.id}`}>
                <img src={activeCategory.iconPath} alt="" className="admin-v4-category-banner-icon" />
                <span className="admin-v4-category-art-label">{activeCategory.artLabel}</span>
                <strong>{activeCategory.label}</strong>
                <small>{activeCategory.description}</small>
                <span className="admin-v4-badge is-muted">{matches.length} / {activeMatchId || t.notSelected}</span>
              </aside>
            </header>
            <div className="admin-v4-workspace-body">
              {activeTabPanel}
            </div>
          </section>
      </>
    </section>
  );
};
