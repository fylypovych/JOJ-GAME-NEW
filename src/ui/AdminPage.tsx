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
import { useAdminSimulation } from './admin/useAdminSimulation';
import { useAdminTemplateManager } from './admin/useAdminTemplateManager';
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
  const [adminUsers, setAdminUsers] = useState<Array<{
    id: string;
    username: string;
    email: string | null;
    role: 'user' | 'administrator';
    displayName: string;
    status: 'active' | 'disabled';
    createdAt: string;
    lastLoginAt: string | null;
    linkedMatches: number;
    finishedMatches: number;
  }>>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState('');
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [selectedAdminUserId, setSelectedAdminUserId] = useState('');
  const [selectedAdminUserDetail, setSelectedAdminUserDetail] = useState<null | {
    user: {
      id: string;
      username: string;
      email: string | null;
      displayName: string;
      avatarUrl: string | null;
      bio: string;
      preferredLang: 'uk' | 'en';
      createdAt: string;
      lastLoginAt: string | null;
      role: 'user' | 'administrator';
      status: 'active' | 'disabled';
    };
    stats: {
      matchesLinked: number;
      matchesFinished: number;
      wins: number;
      winRatePct: number;
      avgTurns: number;
      bestRankName: string;
      resourcesGainedTotal: number;
      resourcesLostTotal: number;
      lyapsPlayedOnOthers: number;
      scandalsPlayedOnOthers: number;
    };
    sessions: Array<{
      id: string;
      createdAt: string;
      lastSeenAt: string;
      expiresAt: string;
      sourceIp: string | null;
      userAgent: string | null;
    }>;
    linkedMatches: Array<{
      matchId: string;
      playerId: string;
      playerName: string | null;
      linkedAt: string;
    }>;
    persistedMatches: Array<{
      matchId: string;
      playerId: string;
      playerName: string | null;
      winnerPlayerId: string | null;
      endReason: string | null;
      turnsCompleted: number;
      finalRankId: string;
      resourcesGainedTotal: number;
      resourcesLostTotal: number;
      linkedAt: string;
    }>;
  }>(null);
  const [adminResetTokenPreview, setAdminResetTokenPreview] = useState('');
  const [adminResetTokenExpiresAt, setAdminResetTokenExpiresAt] = useState('');
  const [adminCreateUserDraft, setAdminCreateUserDraft] = useState({
    username: '',
    displayName: '',
    email: '',
    password: '',
    role: 'user' as 'user' | 'administrator',
  });
  const [adminEditUserDraft, setAdminEditUserDraft] = useState({
    username: '',
    displayName: '',
    email: '',
    bio: '',
    avatarUrl: '',
    preferredLang: 'uk' as 'uk' | 'en',
  });
  const [adminAwards, setAdminAwards] = useState<Array<{
    id: string;
    key: string;
    title: string;
    description: string;
    category: 'general' | 'ranks' | 'resources' | 'actions';
    metric: 'matches_linked' | 'matches_finished' | 'wins' | 'win_rate_pct' | 'avg_turns' | 'best_rank_order' | 'resources_gained_total' | 'resources_lost_total' | 'lyaps_played_on_others' | 'scandals_played_on_others';
    threshold: number;
    badgeLabel: string;
    badgeVariant: 'bronze' | 'silver' | 'gold' | 'special';
    iconPath: string | null;
    active: boolean;
    sortOrder: number;
  }>>([]);
  const [adminAwardsLoading, setAdminAwardsLoading] = useState(false);
  const [adminAwardsError, setAdminAwardsError] = useState('');
  const [selectedAdminAwardId, setSelectedAdminAwardId] = useState('');
  const [adminAwardDraft, setAdminAwardDraft] = useState({
    id: '',
    key: '',
    title: '',
    description: '',
    category: 'general' as 'general' | 'ranks' | 'resources' | 'actions',
    metric: 'matches_finished' as 'matches_linked' | 'matches_finished' | 'wins' | 'win_rate_pct' | 'avg_turns' | 'best_rank_order' | 'resources_gained_total' | 'resources_lost_total' | 'lyaps_played_on_others' | 'scandals_played_on_others',
    threshold: '10',
    badgeLabel: '',
    badgeVariant: 'bronze' as 'bronze' | 'silver' | 'gold' | 'special',
    iconPath: '',
    active: true,
    sortOrder: '0',
  });
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
    gitStatus,
    gitStatusLoading,
    gitUpdateRunning,
    gitDeployRunning,
    gitActionMessage,
    gitActionLog,
    setGitActionMessage,
    setGitActionLog,
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

  const loadAdminUsers = async () => {
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const suffix = adminUserSearch.trim() ? `?search=${encodeURIComponent(adminUserSearch.trim())}` : '';
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users${suffix}`);
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        users?: typeof adminUsers;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to load users');
      }
      setAdminUsers(payload.users ?? []);
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const loadAdminUserDetail = async (userId: string) => {
    setSelectedAdminUserId(userId);
    setSelectedAdminUserDetail(null);
    setAdminResetTokenPreview('');
    setAdminResetTokenExpiresAt('');
    if (!userId) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/detail?userId=${encodeURIComponent(userId)}`);
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        detail?: typeof selectedAdminUserDetail;
      };
      if (!response.ok || !payload.ok || !payload.detail) {
        throw new Error(payload.error || 'Failed to load user detail');
      }
      setSelectedAdminUserDetail(payload.detail);
      setAdminEditUserDraft({
        username: payload.detail.user.username ?? '',
        displayName: payload.detail.user.displayName ?? '',
        email: payload.detail.user.email ?? '',
        bio: payload.detail.user.bio ?? '',
        avatarUrl: payload.detail.user.avatarUrl ?? '',
        preferredLang: payload.detail.user.preferredLang ?? 'uk',
      });
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const updateAdminUserStatus = async (status: 'active' | 'disabled') => {
    if (!selectedAdminUserId) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedAdminUserId, status }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to update user status');
      await loadAdminUsers();
      await loadAdminUserDetail(selectedAdminUserId);
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const updateAdminUserRole = async (role: 'user' | 'administrator') => {
    if (!selectedAdminUserId) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedAdminUserId, role }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to update user role');
      await loadAdminUsers();
      await loadAdminUserDetail(selectedAdminUserId);
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const createAdminUser = async () => {
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminCreateUserDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; user?: { id?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to create user');
      setAdminCreateUserDraft({ username: '', displayName: '', email: '', password: '', role: 'user' });
      await loadAdminUsers();
      if (typeof payload.user?.id === 'string') {
        await loadAdminUserDetail(payload.user.id);
      }
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const updateAdminUserProfile = async () => {
    if (!selectedAdminUserId) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedAdminUserId, ...adminEditUserDraft }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to update user');
      await loadAdminUsers();
      await loadAdminUserDetail(selectedAdminUserId);
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const issueAdminResetToken = async () => {
    const login = selectedAdminUserDetail?.user.username?.trim();
    if (!login) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        resetTokenPreview?: string | null;
        resetTokenExpiresAt?: string | null;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to issue reset token');
      setAdminResetTokenPreview(String(payload.resetTokenPreview ?? ''));
      setAdminResetTokenExpiresAt(String(payload.resetTokenExpiresAt ?? ''));
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const logoutAdminUserSession = async (sessionId: string) => {
    if (!sessionId || !selectedAdminUserId) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/logout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to revoke session');
      await loadAdminUserDetail(selectedAdminUserId);
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const logoutAllAdminUserSessions = async () => {
    if (!selectedAdminUserId) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/logout-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedAdminUserId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to revoke all sessions');
      await loadAdminUserDetail(selectedAdminUserId);
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const loadAdminAwards = async () => {
    setAdminAwardsLoading(true);
    setAdminAwardsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/awards`);
      const payload = (await response.json()) as { ok?: boolean; error?: string; awards?: typeof adminAwards };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to load awards');
      setAdminAwards(payload.awards ?? []);
    } catch (error) {
      setAdminAwardsError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminAwardsLoading(false);
    }
  };

  const selectAdminAward = (awardId: string) => {
    setSelectedAdminAwardId(awardId);
    const selected = adminAwards.find((award) => award.id === awardId);
    if (!selected) {
      setAdminAwardDraft({
        id: '',
        key: '',
        title: '',
        description: '',
        category: 'general',
        metric: 'matches_finished',
        threshold: '10',
        badgeLabel: '',
        badgeVariant: 'bronze',
        iconPath: '',
        active: true,
        sortOrder: '0',
      });
      return;
    }
    setAdminAwardDraft({
      id: selected.id,
      key: selected.key,
      title: selected.title,
      description: selected.description,
      category: selected.category,
      metric: selected.metric,
      threshold: String(selected.threshold),
      badgeLabel: selected.badgeLabel,
      badgeVariant: selected.badgeVariant,
      iconPath: selected.iconPath ?? '',
      active: selected.active,
      sortOrder: String(selected.sortOrder),
    });
  };

  const saveAdminAward = async () => {
    setAdminAwardsLoading(true);
    setAdminAwardsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/awards/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: adminAwardDraft.id || undefined,
          key: adminAwardDraft.key,
          title: adminAwardDraft.title,
          description: adminAwardDraft.description,
          category: adminAwardDraft.category,
          metric: adminAwardDraft.metric,
          threshold: Number(adminAwardDraft.threshold),
          badgeLabel: adminAwardDraft.badgeLabel,
          badgeVariant: adminAwardDraft.badgeVariant,
          iconPath: adminAwardDraft.iconPath || null,
          active: adminAwardDraft.active,
          sortOrder: Number(adminAwardDraft.sortOrder),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; awards?: typeof adminAwards };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to save award');
      setAdminAwards(payload.awards ?? []);
      if (adminAwardDraft.id) {
        selectAdminAward(adminAwardDraft.id);
      }
    } catch (error) {
      setAdminAwardsError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminAwardsLoading(false);
    }
  };

  const deleteAdminAward = async () => {
    if (!adminAwardDraft.id) return;
    setAdminAwardsLoading(true);
    setAdminAwardsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/awards/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awardId: adminAwardDraft.id }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; awards?: typeof adminAwards };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to delete award');
      setAdminAwards(payload.awards ?? []);
      selectAdminAward('');
    } catch (error) {
      setAdminAwardsError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminAwardsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'users' || adminUsers.length > 0 || adminUsersLoading) return;
    void loadAdminUsers();
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'awards' || adminAwards.length > 0 || adminAwardsLoading) return;
    void loadAdminAwards();
  }, [activeTab]);
  return (
    <section className={`board admin-panel${uiVariant === 'v2' ? ' board-v2-panel' : ''}`}>
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
          onIssueResetToken={() => { void issueAdminResetToken(); }}
          onLogoutAllSessions={() => { void logoutAllAdminUserSessions(); }}
          onLogoutUserSession={(sessionId) => { void logoutAdminUserSession(sessionId); }}
          resetTokenPreview={adminResetTokenPreview}
          resetTokenExpiresAt={adminResetTokenExpiresAt}
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
