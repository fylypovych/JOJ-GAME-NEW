import { useEffect, useMemo, useRef, useState } from 'react';
import { getBotSeatIds } from '../../game/bot-engine/config';
import { clampBotCountToAllowed, getAvailableBotCounts } from '../../game/lobbyConfig';
import { normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition } from '../../game/types';
import type { BotDifficulty, BotProfile, GameMode } from '../../game/types';
import type { Language } from '../i18n';
import { cardFlavor, cardTitleWithOverride, categoryLabel, text } from '../i18n';
import { formatModuleDisplayName } from '../moduleDisplay';
import type { GalleryCategoryFilter, LobbyMatch, UserTab } from './model';
import type { AuthUser, UserAward, UserStats } from './useUserAccount';
import type { UserMatchHistoryItem, UserSession } from './useUserAccount';

type T = ReturnType<typeof text>;

const formatGameModeLabel = (t: T, gameMode: GameMode) => {
  if (gameMode === 'standard_plus') return t.gameModeStandardPlus;
  if (gameMode === 'simplified') return t.gameModeSimplified;
  return t.gameModeStandard;
};

const formatBotDifficultyLabel = (t: T, difficulty: BotDifficulty | null) => {
  if (difficulty === 'easy') return t.botDifficultyEasy;
  if (difficulty === 'normal') return t.botDifficultyNormal;
  if (difficulty === 'hard') return t.botDifficultyHard;
  return '-';
};

const estimateRoomDurationLabel = (t: T, players: number, gameMode: GameMode) => {
  if (gameMode === 'standard_plus' || players >= 5) return t.roomDurationLong;
  if (gameMode === 'simplified' || players <= 3) return t.roomDurationShort;
  return t.roomDurationMedium;
};

const formatModuleName = (
  moduleId: string,
  moduleNameById: Map<string, string>,
) => {
  const known = moduleNameById.get(moduleId);
  if (known) return formatModuleDisplayName(known, moduleId);
  const normalized = moduleId
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!normalized) return moduleId;
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatModuleList = (
  moduleIds: string[],
  moduleNameById: Map<string, string>,
) => moduleIds.length ? moduleIds.map((id) => formatModuleName(id, moduleNameById)).join(', ') : '-';

const buildRoomShareLink = (matchID: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set('room', matchID);
  return url.toString();
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to legacy copy path below.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  try {
    const copied = document.execCommand('copy');
    if (copied) return;
  } finally {
    document.body.removeChild(textarea);
  }
  window.prompt('Copy text', value);
};

const formatMatchOutcomeLabel = (t: T, item: UserMatchHistoryItem) => {
  if (item.winnerPlayerId && item.winnerPlayerId === item.playerId) return t.userMatchHistoryOutcomeWin;
  if (item.endReason === 'stalled-no-cards') return t.userMatchHistoryOutcomeStalled;
  return t.userMatchHistoryOutcomeLoss;
};

type AdminAuthCardProps = {
  t: T;
  serverUrl: string;
  adminAuthEnabled: boolean | null;
  adminTokenDraft: string;
  setAdminTokenDraft: (value: string) => void;
  adminAuthChecking: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  adminAuthError: string;
};

export const AdminAuthCard = ({
  t,
  serverUrl,
  adminAuthEnabled,
  adminTokenDraft,
  setAdminTokenDraft,
  adminAuthChecking,
  onSignIn,
  onSignOut,
  adminAuthError,
}: AdminAuthCardProps) => {
  const adminHintText = adminAuthEnabled === false ? t.adminAuthDisabledHint : t.adminLoginHint;

  return (
    <section className="board admin-auth-card">
      <h2>{t.adminLoginTitle}</h2>
      <p>{adminHintText}</p>
      <p>
        {t.serverUrlLabel}: <code>{serverUrl}</code>
      </p>
      <p className="admin-auth-form">
        <label>
          {t.adminTokenLabel}:{' '}
          <input
            type="password"
            value={adminTokenDraft}
            onChange={(e) => setAdminTokenDraft(e.target.value)}
            placeholder={t.adminTokenLabel}
          />
        </label>{' '}
        <button type="button" onClick={onSignIn} disabled={adminAuthChecking}>
          {adminAuthChecking ? t.adminAuthChecking : t.adminSignIn}
        </button>{' '}
        <button type="button" onClick={onSignOut}>
          {t.adminSignOut}
        </button>
      </p>
      {adminAuthError ? <p className="admin-error">{adminAuthError}</p> : null}
    </section>
  );
};

type UserTabsProps = {
  t: T;
  activeUserTab: UserTab;
  setActiveUserTab: (tab: UserTab) => void;
  uiVariant?: 'v1' | 'v2' | 'v3';
};

export const UserTabs = ({ t, activeUserTab, setActiveUserTab, uiVariant = 'v1' }: UserTabsProps) => (
  <p className={`user-tabs${uiVariant === 'v2' ? ' user-tabs-v2' : ''}${uiVariant === 'v3' ? ' user-tabs-v3' : ''}`}>
    <button type="button" onClick={() => setActiveUserTab('games')} disabled={activeUserTab === 'games'}>
      {t.userTabGames}
    </button>
    <button type="button" onClick={() => setActiveUserTab('gallery')} disabled={activeUserTab === 'gallery'}>
      {t.userTabGallery}
    </button>
    <button type="button" onClick={() => setActiveUserTab('rules')} disabled={activeUserTab === 'rules'}>
      {t.userTabRules}
    </button>
    <button type="button" onClick={() => setActiveUserTab('profile')} disabled={activeUserTab === 'profile'}>
      {t.userTabProfile}
    </button>
    <button type="button" onClick={() => setActiveUserTab('statistics')} disabled={activeUserTab === 'statistics'}>
      {t.userTabStatistics}
    </button>
  </p>
);

type LobbySectionProps = {
  t: T;
  playerName: string;
  fallbackPlayerName?: string;
  authenticatedUser?: boolean;
  setPlayerName: (value: string) => void;
  roomCapacity: number;
  setRoomCapacity: (value: number) => void;
  allowedRoomCapacities: number[];
  gameMode: GameMode;
  setGameMode: (value: GameMode) => void;
  createWithBots: boolean;
  setCreateWithBots: (value: boolean) => void;
  botCount: number;
  setBotCount: (value: number) => void;
  allowedBotCounts: number[];
  botDifficulty: BotDifficulty;
  setBotDifficulty: (value: BotDifficulty) => void;
  botProfile: BotProfile;
  setBotProfile: (value: BotProfile) => void;
  createRoom: () => void;
  refreshMatches: () => void;
  loading: boolean;
  error: string;
  matches: LobbyMatch[];
  joinRoom: (match: LobbyMatch) => void;
  spectateRoom: (match: LobbyMatch) => void;
  optionalModules: Array<{ id: string; name: string; alwaysOn: boolean }>;
  selectedOptionalModuleIds: string[];
  setSelectedOptionalModuleIds: (ids: string[]) => void;
  uiVariant?: 'v1' | 'v2' | 'v3';
};

export const LobbySection = ({
  t,
  playerName,
  fallbackPlayerName,
  authenticatedUser = false,
  setPlayerName,
  roomCapacity,
  setRoomCapacity,
  allowedRoomCapacities,
  gameMode,
  setGameMode,
  createWithBots,
  setCreateWithBots,
  botCount,
  setBotCount,
  allowedBotCounts,
  botDifficulty,
  setBotDifficulty,
  botProfile,
  setBotProfile,
  createRoom,
  refreshMatches,
  loading,
  error,
  matches,
  joinRoom,
  spectateRoom,
  optionalModules,
  selectedOptionalModuleIds,
  setSelectedOptionalModuleIds,
  uiVariant = 'v1',
}: LobbySectionProps) => {
  const [roomFilter, setRoomFilter] = useState<'all' | 'open' | 'free' | 'no_bots' | 'standard' | 'standard_plus'>('all');
  const moduleNameById = useMemo(
    () => new Map(optionalModules.map((module) => [module.id, module.name])),
    [optionalModules],
  );
  const availableBotCounts = useMemo(
    () => getAvailableBotCounts(allowedBotCounts, roomCapacity),
    [allowedBotCounts, roomCapacity],
  );
  const effectiveBotCount = createWithBots
    ? clampBotCountToAllowed(botCount, allowedBotCounts, roomCapacity)
    : 0;
  const toggleModule = (id: string, alwaysOn: boolean) => {
    if (alwaysOn) return;
    if (selectedOptionalModuleIds.includes(id)) {
      setSelectedOptionalModuleIds(selectedOptionalModuleIds.filter((row) => row !== id));
      return;
    }
    setSelectedOptionalModuleIds([...selectedOptionalModuleIds, id]);
  };
  const effectivePlayerName = playerName.trim() || fallbackPlayerName?.trim() || '';
  const invitedRoomId = useMemo(() => new URLSearchParams(window.location.search).get('room')?.trim() || '', []);
  const visibleMatches = useMemo(() => {
    const filtered = matches.filter((match) => {
      const taken = match.players.filter((player) => Boolean(player.name)).length;
      const capacity = match.players.length;
      const hasFree = taken < capacity;
      const gameModeValue = match.setupData?.gameMode ?? 'standard';
      const hasBots = Math.max(0, Math.floor(match.setupData?.bots?.count ?? 0)) > 0;
      if (roomFilter === 'open') return hasFree;
      if (roomFilter === 'free') return hasFree && taken + 1 === capacity;
      if (roomFilter === 'no_bots') return !hasBots;
      if (roomFilter === 'standard') return gameModeValue === 'standard';
      if (roomFilter === 'standard_plus') return gameModeValue === 'standard_plus';
      return true;
    });
    return filtered.sort((a, b) => {
      const aInvited = a.matchID === invitedRoomId ? 1 : 0;
      const bInvited = b.matchID === invitedRoomId ? 1 : 0;
      if (aInvited !== bInvited) return bInvited - aInvited;
      const aTaken = a.players.filter((player) => Boolean(player.name)).length;
      const bTaken = b.players.filter((player) => Boolean(player.name)).length;
      const aAlmostReady = aTaken < a.players.length && aTaken + 1 === a.players.length ? 1 : 0;
      const bAlmostReady = bTaken < b.players.length && bTaken + 1 === b.players.length ? 1 : 0;
      if (aAlmostReady !== bAlmostReady) return bAlmostReady - aAlmostReady;
      if (aTaken !== bTaken) return bTaken - aTaken;
      return b.matchID.localeCompare(a.matchID);
    });
  }, [invitedRoomId, matches, roomFilter]);

  return (
  <section className={`board${uiVariant === 'v2' ? ' board-v2-panel' : ''}${uiVariant === 'v3' ? ' board-v3-panel lobby-v3-panel' : ''}`}>
    <h2>{t.lobbyTitle}</h2>
    <div className="lobby-layout">
      <div className="lobby-col">
        <h3>{t.roomListTitle}</h3>
        <p className="admin-controls">
          <button type="button" onClick={refreshMatches} disabled={loading}>
            {t.refreshRooms}
          </button>
        </p>
        <div className="lobby-room-filters">
          <button type="button" onClick={() => setRoomFilter('all')} disabled={roomFilter === 'all'}>{t.lobbyFilterAll}</button>
          <button type="button" onClick={() => setRoomFilter('open')} disabled={roomFilter === 'open'}>{t.roomStatusOpen}</button>
          <button type="button" onClick={() => setRoomFilter('free')} disabled={roomFilter === 'free'}>{t.lobbyAlmostReady}</button>
          <button type="button" onClick={() => setRoomFilter('no_bots')} disabled={roomFilter === 'no_bots'}>{t.lobbyFilterNoBots}</button>
          <button type="button" onClick={() => setRoomFilter('standard')} disabled={roomFilter === 'standard'}>{t.gameModeStandard}</button>
          <button type="button" onClick={() => setRoomFilter('standard_plus')} disabled={roomFilter === 'standard_plus'}>{t.gameModeStandardPlus}</button>
        </div>
        {loading ? <p>{t.loadingRooms}</p> : null}
        {visibleMatches.length === 0 ? (
          <div className="lobby-empty-state">
            <p>{t.noRooms}</p>
            <p className="game-ui-v2-subtle">{t.noRoomsHelp}</p>
            <p className="admin-controls">
              <button type="button" onClick={refreshMatches} disabled={loading}>{t.refreshRooms}</button>
              <button type="button" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} disabled={loading}>{t.createRoom}</button>
            </p>
          </div>
        ) : null}
        <div className="lobby-room-list">
        {visibleMatches.map((match) => {
          const taken = match.players.filter((player) => Boolean(player.name)).length;
          const capacity = match.players.length;
          const hasFree = taken < capacity;
          const gameModeValue = match.setupData?.gameMode ?? 'standard';
          const botSetup = match.setupData?.bots;
          const botCountValue = Math.max(0, Math.min(capacity - 1, Math.floor(botSetup?.count ?? 0)));
          const legendMode = match.setupData?.gameSetup?.legendaryDeckMode ?? 'separate';
          const optionalModules = match.setupData?.gameSetup?.optionalMainDeckModuleIds ?? [];
          const freePlayer = match.players.find((player) => !player.name);
          const almostReady = hasFree && taken + 1 === capacity;
          const shareLink = buildRoomShareLink(match.matchID);
          const inviteText = `${t.activeRoom}: ${match.matchID}\n${t.gameModeLabel}: ${formatGameModeLabel(t, gameModeValue)}\n${t.roomSummaryPlayers}: ${taken}/${capacity}\n${shareLink}`;
          return (
            <article key={match.matchID} className={`lobby-room-card${almostReady ? ' is-almost-ready' : ''}${invitedRoomId === match.matchID ? ' is-invited' : ''}`}>
              <div className="lobby-room-card-head">
                <div>
                  <strong>{match.matchID}</strong>
                  <p className="game-ui-v2-subtle">
                    {formatGameModeLabel(t, gameModeValue)} · {taken}/{capacity} · {hasFree ? (almostReady ? t.lobbyAlmostReady : t.roomStatusWaiting) : t.roomStatusFull}
                  </p>
                </div>
                <span className={`pill pill-badge${almostReady ? ' pill-badge-good' : ''}`}>
                  {almostReady ? t.lobbyAlmostReady : (hasFree ? t.roomStatusWaiting : t.roomStatusFull)}
                </span>
              </div>
              {invitedRoomId === match.matchID ? <p className="lobby-room-invite-badge">{t.roomInviteLinkHint}</p> : null}
              <div className="lobby-room-summary-grid">
                <span>{t.roomSummaryPlayers}</span><strong>{taken}/{capacity}</strong>
                <span>{t.gameModeLabel}</span><strong>{formatGameModeLabel(t, gameModeValue)}</strong>
                <span>{t.roomBotsLabel}</span><strong>{botCountValue > 0 ? `${botCountValue} · ${formatBotDifficultyLabel(t, botSetup?.difficulty ?? null)}` : t.roomBotsOff}</strong>
                <span>{t.legendaryModeLabel}</span><strong>{legendMode === 'merged' ? t.legendaryModeMerged : t.legendaryModeSeparate}</strong>
                <span>{t.roomModulesLabel}</span><strong>{formatModuleList(optionalModules, moduleNameById)}</strong>
                <span>{t.roomSummarySeat}</span><strong>{freePlayer ? `#${freePlayer.id}` : '-'}</strong>
              </div>
              <div className="lobby-room-seat-list">
                {match.players.map((player) => (
                  <span key={`${match.matchID}-seat-${player.id}`} className={`lobby-room-seat${player.name ? ' is-filled' : ' is-empty'}`}>
                    #{player.id} {player.name?.trim() || t.lobbySeatOpen}
                  </span>
                ))}
              </div>
              <div className="admin-controls">
                <button
                  type="button"
                  onClick={() => joinRoom(match)}
                  disabled={!effectivePlayerName || loading || !hasFree}
                >
                  {t.joinRoomPrimary}
                </button>
                <button
                  type="button"
                  onClick={() => spectateRoom(match)}
                  disabled={loading}
                >
                  {t.spectateRoom}
                </button>
                <button
                  type="button"
                  onClick={() => { void copyText(inviteText); }}
                  disabled={loading}
                >
                  {t.copyInviteText}
                </button>
                <button
                  type="button"
                  onClick={() => { void copyText(shareLink); }}
                  disabled={loading}
                >
                  {t.copyInviteLink}
                </button>
              </div>
            </article>
          );
        })}
        </div>
      </div>
      <div className="lobby-col">
        <h3>{t.roomCreateTitle}</h3>
        {authenticatedUser ? (
          <p>
            {t.joinedAs}: <strong>{effectivePlayerName || '-'}</strong>
          </p>
        ) : (
          <p>
            {t.playerName}:{' '}
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={t.playerNamePlaceholder}
            />
          </p>
        )}
        <p>{t.roomCapacity}:</p>
        <p className="admin-controls">
          {allowedRoomCapacities.map((size) => (
            <button key={`room-cap-${size}`} type="button" aria-pressed={roomCapacity === size} onClick={() => setRoomCapacity(size)}>
              {roomCapacity === size ? '✓ ' : ''}{size}
            </button>
          ))}
        </p>
        <p>{t.gameModeLabel}:</p>
        <p className="admin-controls">
          {[
            { id: 'standard', label: t.gameModeStandard },
            { id: 'standard_plus', label: t.gameModeStandardPlus },
            { id: 'simplified', label: t.gameModeSimplified },
          ].map((mode) => (
            <button key={`room-mode-${mode.id}`} type="button" aria-pressed={gameMode === mode.id} onClick={() => setGameMode(mode.id as GameMode)}>
              {gameMode === mode.id ? '✓ ' : ''}{mode.label}
            </button>
          ))}
        </p>
        <p>{t.roomModulesLabel}:</p>
        <p className="admin-controls">
          {optionalModules.map((module) => {
            const enabled = selectedOptionalModuleIds.includes(module.id) || module.alwaysOn;
            return (
              <button
                key={`room-module-${module.id}`}
                type="button"
                aria-pressed={enabled}
                onClick={() => toggleModule(module.id, module.alwaysOn)}
                disabled={module.alwaysOn}
              >
                {enabled ? '✓ ' : ''}{module.name}{module.alwaysOn ? ` (${t.roomModuleAlwaysOn})` : ''}
              </button>
            );
          })}
        </p>
        <p>{t.roomBotsLabel}:</p>
        <p className="admin-controls">
          <button type="button" aria-pressed={!createWithBots} onClick={() => setCreateWithBots(false)}>
            {!createWithBots ? '✓ ' : ''}{t.roomBotsOff}
          </button>
          <button
            type="button"
            aria-pressed={createWithBots}
            onClick={() => setCreateWithBots(true)}
            disabled={availableBotCounts.length === 0}
          >
            {createWithBots ? '✓ ' : ''}{t.roomBotsFill}
          </button>
        </p>
        {createWithBots ? (
          <>
            <p>{t.roomBotCountLabel}:</p>
            <p className="admin-controls">
              {availableBotCounts.map((count) => (
                <button
                  key={`bot-count-${count}`}
                  type="button"
                  aria-pressed={effectiveBotCount === count}
                  onClick={() => setBotCount(count)}
                >
                  {effectiveBotCount === count ? '✓ ' : ''}{count}
                </button>
              ))}
            </p>
            <p>{t.roomBotDifficultyLabel}:</p>
            <p className="admin-controls">
              {[
                { id: 'easy', label: t.botDifficultyEasy },
                { id: 'normal', label: t.botDifficultyNormal },
                { id: 'hard', label: t.botDifficultyHard },
              ].map((difficulty) => (
                <button
                  key={`bot-difficulty-${difficulty.id}`}
                  type="button"
                  aria-pressed={botDifficulty === difficulty.id}
                  onClick={() => setBotDifficulty(difficulty.id as BotDifficulty)}
                >
                  {botDifficulty === difficulty.id ? '✓ ' : ''}{difficulty.label}
                </button>
              ))}
            </p>
            <p>{t.roomBotProfileLabel}:</p>
            <p className="admin-controls">
              {[
                { id: 'balanced', label: t.botProfileBalanced },
                { id: 'aggressive', label: t.botProfileAggressive },
                { id: 'control', label: t.botProfileControl },
              ].map((profile) => (
                <button
                  key={`bot-profile-${profile.id}`}
                  type="button"
                  aria-pressed={botProfile === profile.id}
                  onClick={() => setBotProfile(profile.id as BotProfile)}
                >
                  {botProfile === profile.id ? '✓ ' : ''}{profile.label}
                </button>
              ))}
            </p>
          </>
        ) : null}
        <p className="admin-controls">
          <button type="button" onClick={createRoom} disabled={!effectivePlayerName || loading}>
            {t.createRoom}
          </button>
        </p>
        <div className="lobby-room-create-summary">
          <h4>{t.roomSummaryReady}</h4>
          <ul>
            <li>{t.gameModeLabel}: {formatGameModeLabel(t, gameMode)}</li>
            <li>{t.roomCapacity}: {roomCapacity}</li>
            <li>{t.roomBotsLabel}: {createWithBots ? `${effectiveBotCount} · ${formatBotDifficultyLabel(t, botDifficulty)}` : t.roomBotsOff}</li>
            <li>{t.roomModulesLabel}: {formatModuleList(selectedOptionalModuleIds, moduleNameById)}</li>
            <li>{t.roomDurationLabel}: {estimateRoomDurationLabel(t, roomCapacity, gameMode)}</li>
          </ul>
          <p className="game-ui-v2-subtle">{t.roomDraftHint}</p>
        </div>
      </div>
    </div>
    {error ? <p className="admin-error">{error}</p> : null}
  </section>
);
};

type ActiveSessionSectionProps = {
  t: T;
  session: { matchID: string; playerID?: string; spectator?: boolean };
  playerName: string;
  sessionBroken: boolean;
  canStart: boolean;
  activeMatch?: LobbyMatch | null;
  roomPlayerNames: Record<string, string>;
  roomDraft: {
    roomCapacity: number;
    gameMode: GameMode;
    createWithBots: boolean;
    botCount: number;
    botDifficulty: BotDifficulty;
    selectedOptionalModuleIds: string[];
  };
  optionalModules: Array<{ id: string; name: string; alwaysOn: boolean }>;
  applyCurrentRoomToDraft: () => void;
  leaveRoom: () => void;
  refreshMatches: () => void;
  loading: boolean;
  uiVariant?: 'v1' | 'v2' | 'v3';
};

export const ActiveSessionSection = ({
  t,
  session,
  playerName,
  sessionBroken,
  canStart,
  activeMatch = null,
  roomPlayerNames,
  roomDraft,
  optionalModules,
  applyCurrentRoomToDraft,
  leaveRoom,
  refreshMatches,
  loading,
  uiVariant = 'v1',
}: ActiveSessionSectionProps) => {
  const [activityItems, setActivityItems] = useState<string[]>([]);
  const previousActiveMatchRef = useRef<LobbyMatch | null>(null);
  const moduleNameById = useMemo(
    () => new Map(optionalModules.map((module) => [module.id, module.name])),
    [optionalModules],
  );

  useEffect(() => {
    setActivityItems([]);
    previousActiveMatchRef.current = null;
  }, [session.matchID]);

  useEffect(() => {
    setActivityItems((prev) => {
      const previous = previousActiveMatchRef.current;
      previousActiveMatchRef.current = activeMatch;
      if (!activeMatch || !previous || previous.matchID !== activeMatch.matchID) return prev;
      const nextEvents: string[] = [];
      for (const player of activeMatch.players) {
        const before = previous.players.find((row) => row.id === player.id)?.name?.trim() || '';
        const after = player.name?.trim() || '';
        if (!before && after) nextEvents.push(t.roomActivityPlayerJoined.replace('{name}', after).replace('{seat}', `#${player.id}`));
        if (before && !after) nextEvents.push(t.roomActivityPlayerLeft.replace('{name}', before).replace('{seat}', `#${player.id}`));
      }
      const previousBots = Math.floor(previous.setupData?.bots?.count ?? 0);
      const nextBots = Math.floor(activeMatch.setupData?.bots?.count ?? 0);
      if (previousBots !== nextBots) nextEvents.push(t.roomActivityBotsChanged.replace('{count}', String(nextBots)));
      const previousMode = previous.setupData?.gameMode ?? 'standard';
      const nextMode = activeMatch.setupData?.gameMode ?? 'standard';
      if (previousMode !== nextMode) nextEvents.push(`${t.roomActivityModeChanged}: ${formatGameModeLabel(t, nextMode)}`);
      const prevModules = (previous.setupData?.gameSetup?.optionalMainDeckModuleIds ?? []).join(', ');
      const nextModules = (activeMatch.setupData?.gameSetup?.optionalMainDeckModuleIds ?? []).join(', ');
      if (prevModules !== nextModules) {
        nextEvents.push(`${t.roomActivityModulesChanged}: ${formatModuleList(activeMatch.setupData?.gameSetup?.optionalMainDeckModuleIds ?? [], moduleNameById)}`);
      }
      return nextEvents.length ? [...nextEvents.reverse(), ...prev].slice(0, 6) : prev;
    });
  }, [activeMatch, t, moduleNameById]);

  const shareLink = buildRoomShareLink(session.matchID);
  const activeGameMode = activeMatch?.setupData?.gameMode ?? 'standard';
  const activePlayerCount = activeMatch?.players.length ?? 0;
  const botsCount = Math.max(0, Math.min(Math.max(0, activePlayerCount - 1), Math.floor(activeMatch?.setupData?.bots?.count ?? 0)));
  const botSeatSet = new Set(getBotSeatIds(activeMatch?.players.length ?? 0, botsCount));
  const activeModules = activeMatch?.setupData?.gameSetup?.optionalMainDeckModuleIds ?? [];
  const activeModulesLabel = formatModuleList(activeModules, moduleNameById);
  const draftDiffersFromRoom = Boolean(activeMatch) && (
    roomDraft.roomCapacity !== activePlayerCount
    || roomDraft.gameMode !== activeGameMode
    || (roomDraft.createWithBots ? roomDraft.botCount : 0) !== botsCount
    || roomDraft.selectedOptionalModuleIds.join('|') !== activeModules.join('|')
  );
  const missingSeats = activeMatch ? activeMatch.players.filter((player) => !player.name?.trim()).length : 0;
  const blockers = [
    ...(sessionBroken ? [t.roomReconnectHint] : []),
    ...(!sessionBroken && activeMatch && missingSeats > 0
      ? [t.roomBlockedNeedPlayersCount.replace('{count}', String(missingSeats))]
      : []),
    ...(!sessionBroken && session.spectator && activeMatch ? [t.roomSpectatorHint] : []),
  ];
  const activeReadyLabel = canStart ? t.roomReadyToStart : t.roomBlockedNeedPlayersCount.replace('{count}', String(missingSeats));
  const activeLegendaryModeLabel = (activeMatch?.setupData?.gameSetup?.legendaryDeckMode ?? 'separate') === 'merged'
    ? t.legendaryModeMerged
    : t.legendaryModeSeparate;
  const inviteText = `${t.activeRoom}: ${session.matchID}\n${t.gameModeLabel}: ${formatGameModeLabel(t, activeGameMode)}\n${t.roomSummaryPlayers}: ${activeMatch ? `${activeMatch.players.filter((player) => Boolean(player.name?.trim())).length}/${activeMatch.players.length}` : '-'}\n${shareLink}`;

  return (
    <section className={`board${uiVariant === 'v2' ? ' board-v2-panel' : ''}${uiVariant === 'v3' ? ' board-v3-panel lobby-v3-panel' : ''}`}>
      <h2 className="lobby-active-room-title">
        {t.activeRoom}: {session.matchID}
      </h2>
      <p className="lobby-active-room-meta">
        {session.spectator
          ? `${t.spectatorMode}: ${t.spectatorJoinedLabel}`
          : `${t.joinedAs}: ${playerName || '-'} (#${session.playerID})`}
      </p>
      {activeMatch ? (
        <div className="lobby-active-room-grid">
          <div className="lobby-room-create-summary lobby-room-create-summary-compact">
            <h3>{t.roomSummaryReady}</h3>
            <div className="lobby-room-kv-grid">
              <span>{t.gameModeLabel}</span><strong>{formatGameModeLabel(t, activeGameMode)}</strong>
              <span>{t.roomCapacity}</span><strong>{activeMatch.players.length}</strong>
              <span>{t.roomBotsLabel}</span><strong>{botsCount || t.roomBotsOff}</strong>
              <span>{t.legendaryModeLabel}</span><strong>{activeLegendaryModeLabel}</strong>
              <span>{t.roomModulesLabel}</span><strong>{activeModulesLabel}</strong>
              <span>{t.roomDurationLabel}</span><strong>{estimateRoomDurationLabel(t, activeMatch.players.length, activeGameMode)}</strong>
            </div>
            <p className="lobby-room-status-line"><strong>{activeReadyLabel}</strong></p>
          </div>
          <div className="lobby-room-create-summary lobby-room-create-summary-compact">
            <h3>{t.roomSummaryRoster}</h3>
            <div className="lobby-room-seat-list">
              {activeMatch.players.map((player) => {
                const name = roomPlayerNames[String(player.id)] || player.name?.trim() || '';
                const isYou = String(player.id) === (session.playerID ?? '');
                const isBot = botSeatSet.has(String(player.id)) && Boolean(name);
                const isHost = player.id === 0;
                return (
                  <span key={`active-seat-${player.id}`} className={`lobby-room-seat${name ? ' is-filled' : ' is-empty'}${isYou ? ' is-you' : ''}`}>
                    #{player.id} {name || t.lobbySeatOpen}
                    {isYou ? ` · ${t.roomYouTag}` : ''}
                    {isBot ? ` · ${t.roomBotTag}` : ''}
                    {isHost ? ` · ${t.roomHostTag}` : ''}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {activeMatch ? (
        <div className="lobby-active-room-grid">
          <div className="lobby-room-create-summary lobby-room-create-summary-compact">
            <h3>{t.roomAppliedConfigTitle}</h3>
            <div className="lobby-room-kv-grid">
              <span>{t.gameModeLabel}</span><strong>{formatGameModeLabel(t, activeGameMode)}</strong>
              <span>{t.roomCapacity}</span><strong>{activeMatch.players.length}</strong>
              <span>{t.roomBotsLabel}</span><strong>{botsCount || t.roomBotsOff}</strong>
              <span>{t.roomModulesLabel}</span><strong>{activeModulesLabel}</strong>
            </div>
          </div>
          <div className="lobby-room-create-summary lobby-room-create-summary-compact">
            <h3>{t.roomDraftConfigTitle}</h3>
            <div className="lobby-room-kv-grid">
              <span>{t.gameModeLabel}</span><strong>{formatGameModeLabel(t, roomDraft.gameMode)}</strong>
              <span>{t.roomCapacity}</span><strong>{roomDraft.roomCapacity}</strong>
              <span>{t.roomBotsLabel}</span><strong>{roomDraft.createWithBots ? `${roomDraft.botCount} · ${formatBotDifficultyLabel(t, roomDraft.botDifficulty)}` : t.roomBotsOff}</strong>
              <li>{t.roomBotsLabel}: {roomDraft.createWithBots ? `${roomDraft.botCount} · ${formatBotDifficultyLabel(t, roomDraft.botDifficulty)}` : t.roomBotsOff}</li>
              <span>{t.roomModulesLabel}</span><strong>{formatModuleList(roomDraft.selectedOptionalModuleIds, moduleNameById)}</strong>
            </div>
            <p className="game-ui-v2-subtle">
              {draftDiffersFromRoom ? t.roomDraftDiffersHint : t.roomDraftMatchesHint}
            </p>
            <p className="admin-controls">
              <button type="button" onClick={applyCurrentRoomToDraft} disabled={loading || !draftDiffersFromRoom}>
                {t.roomApplyCurrentToDraft}
              </button>
            </p>
          </div>
        </div>
      ) : null}
      {blockers.length ? (
        <div className="lobby-room-blockers">
          {blockers.map((item) => (
            <p key={item} className={item === t.roomReconnectHint ? 'admin-error' : ''}>{item}</p>
          ))}
        </div>
      ) : null}
      {activityItems.length ? (
        <div className="lobby-room-activity">
          <h3>{t.roomActivityTitle}</h3>
          <ul>
            {activityItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      <p className="admin-controls">
        <button type="button" onClick={() => { void copyText(inviteText); }} disabled={loading}>
          {t.copyInviteText}
        </button>
        <button type="button" onClick={() => { void copyText(shareLink); }} disabled={loading}>
          {t.copyInviteLink}
        </button>
        <button type="button" onClick={refreshMatches} disabled={loading}>
          {t.refreshRooms}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!window.confirm(t.leaveRoomConfirm)) return;
            leaveRoom();
          }}
          disabled={loading}
        >
          {t.leaveRoom}
        </button>
      </p>
    </section>
  );
};

export const ProfileSection = ({
  t,
  user,
  loading,
  busy,
  error,
  notice,
  loginDraft,
  setLoginDraft,
  onLogin,
  onLogout,
  profileDraft,
  setProfileDraft,
  onSaveProfile,
  passwordDraft,
  setPasswordDraft,
  onChangePassword,
  stats,
  awards,
  matchHistory,
  sessions,
  onRefreshSessions,
  onLogoutAllSessions,
  onLogoutSession,
  onOpenRegister,
}: {
  t: T;
  user: AuthUser | null;
  loading: boolean;
  busy: boolean;
  error: string;
  notice: string;
  loginDraft: { login: string; password: string };
  setLoginDraft: (value: { login: string; password: string }) => void;
  onLogin: () => void;
  onLogout: () => void;
  profileDraft: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  };
  setProfileDraft: (value: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  }) => void;
  onSaveProfile: () => void;
  passwordDraft: { currentPassword: string; nextPassword: string };
  setPasswordDraft: (value: { currentPassword: string; nextPassword: string }) => void;
  onChangePassword: () => void;
  stats: UserStats | null;
  awards: UserAward[];
  matchHistory: UserMatchHistoryItem[];
  sessions: UserSession[];
  onRefreshSessions: () => void;
  onLogoutAllSessions: () => void;
  onLogoutSession: (sessionId: string) => void;
  onOpenRegister: () => void;
}) => (
  <section className="board">
    <h2>{t.userTabProfile}</h2>
    {loading ? <p>{t.loadingRooms}</p> : null}
    {error ? <p className="admin-error">{error}</p> : null}
    {notice ? <p>{notice}</p> : null}
    {!user ? (
      <div className="auth-shell">
        <div className="auth-card">
          <h3>{t.userLoginTitle}</h3>
          <p>
            <input
              value={loginDraft.login}
              onChange={(e) => setLoginDraft({ ...loginDraft, login: e.target.value })}
              placeholder={t.userLoginPlaceholder}
            />
          </p>
          <p>
            <input
              type="password"
              value={loginDraft.password}
              onChange={(e) => setLoginDraft({ ...loginDraft, password: e.target.value })}
              placeholder={t.userPasswordLabel}
            />
          </p>
          <p className="admin-controls">
            <button type="button" onClick={onLogin} disabled={busy}>{t.userLoginButton}</button>
            <button type="button" onClick={onOpenRegister} disabled={busy}>{t.userGoToRegisterButton}</button>
          </p>
        </div>
      </div>
    ) : (
      <>
        <p>{t.userSignedInAs}: <strong>{user.displayName}</strong> (@{user.username})</p>
        <p className="admin-controls">
          <button type="button" onClick={onSaveProfile} disabled={busy}>{t.userSaveProfileButton}</button>
          <button type="button" onClick={onLogout} disabled={busy}>{t.userLogoutButton}</button>
        </p>
        <div className="lobby-layout">
          <div className="lobby-col">
            <h3>{t.userProfileTitle}</h3>
            <p><input value={profileDraft.displayName} onChange={(e) => setProfileDraft({ ...profileDraft, displayName: e.target.value })} placeholder={t.userDisplayNameLabel} /></p>
            <p><input value={profileDraft.email} onChange={(e) => setProfileDraft({ ...profileDraft, email: e.target.value })} placeholder={t.userEmailLabel} /></p>
            <p><input value={profileDraft.avatarUrl} onChange={(e) => setProfileDraft({ ...profileDraft, avatarUrl: e.target.value })} placeholder={t.userAvatarUrlLabel} /></p>
            <p><textarea className="admin-textarea" value={profileDraft.bio} onChange={(e) => setProfileDraft({ ...profileDraft, bio: e.target.value })} /></p>
            <p><label><input type="checkbox" checked={profileDraft.profilePublic} onChange={(e) => setProfileDraft({ ...profileDraft, profilePublic: e.target.checked })} /> {t.userProfilePublicLabel}</label></p>
            <p><label><input type="checkbox" checked={profileDraft.showStatsPublic} onChange={(e) => setProfileDraft({ ...profileDraft, showStatsPublic: e.target.checked })} /> {t.userShowStatsPublicLabel}</label></p>
            <p><label><input type="checkbox" checked={profileDraft.showRecentMatchesPublic} onChange={(e) => setProfileDraft({ ...profileDraft, showRecentMatchesPublic: e.target.checked })} /> {t.userShowRecentMatchesPublicLabel}</label></p>
            <h3>{t.userChangePasswordTitle}</h3>
            <p><input type="password" value={passwordDraft.currentPassword} onChange={(e) => setPasswordDraft({ ...passwordDraft, currentPassword: e.target.value })} placeholder={t.userCurrentPasswordLabel} /></p>
            <p><input type="password" value={passwordDraft.nextPassword} onChange={(e) => setPasswordDraft({ ...passwordDraft, nextPassword: e.target.value })} placeholder={t.userNewPasswordLabel} /></p>
            <p><button type="button" onClick={onChangePassword} disabled={busy}>{t.userChangePasswordButton}</button></p>
            <h3>{t.userSessionsTitle}</h3>
            <p className="admin-controls">
              <button type="button" onClick={onRefreshSessions} disabled={busy}>{t.refreshRooms}</button>
              <button type="button" onClick={onLogoutAllSessions} disabled={busy}>{t.userLogoutAllSessionsButton}</button>
            </p>
            {sessions.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {sessions.map((session) => (
                  <li key={session.id}>
                    {new Date(session.lastSeenAt).toLocaleString()} | {session.sourceIp ?? '-'} | {(session.userAgent ?? '-').slice(0, 48)}
                    {' '}
                    <button type="button" onClick={() => onLogoutSession(session.id)} disabled={busy}>{t.userLogoutSessionButton}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="lobby-col">
            <h3>{t.userStatsTitle}</h3>
            {!stats ? <p>{t.simulationNoData}</p> : (
              <ul>
                <li>{t.userStatMatchesLinked}: {stats.matchesLinked}</li>
                <li>{t.userStatMatchesFinished}: {stats.matchesFinished}</li>
                <li>{t.userStatWins}: {stats.wins}</li>
                <li>{t.userStatWinRate}: {stats.winRatePct}%</li>
                <li>{t.userStatAvgTurns}: {stats.avgTurns}</li>
                <li>{t.userStatBestRank}: {stats.bestRankName}</li>
                <li>{t.userStatResourcesGained}: {stats.resourcesGainedTotal}</li>
                <li>{t.userStatResourcesLost}: {stats.resourcesLostTotal}</li>
                <li>{t.userStatLyaps}: {stats.lyapsPlayedOnOthers}</li>
                <li>{t.userStatScandals}: {stats.scandalsPlayedOnOthers}</li>
              </ul>
            )}
            <h3>{t.userAwardsTitle}</h3>
            {awards.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {awards.filter((award) => award.awarded).map((award) => (
                  <li key={`profile-award-${award.awardId}`}>
                    <strong>[{award.badgeLabel}]</strong> {award.title}
                    <br />
                    {award.description}
                  </li>
                ))}
              </ul>
            )}
            <h3>{t.userMatchHistoryTitle}</h3>
            {matchHistory.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {matchHistory.slice(0, 10).map((item) => (
                  <li key={`profile-history-${item.matchId}-${item.playerId}`}>
                    <strong>{formatMatchOutcomeLabel(t, item)}</strong> · {formatGameModeLabel(t, item.gameMode)}
                    {' · '}
                    {item.playerCount}p
                    {item.botCount > 0 ? ` · ${item.botCount} ${t.roomBotsLabel.toLowerCase()} (${formatBotDifficultyLabel(t, item.botDifficulty)})` : ''}
                    <br />
                    {t.userMatchHistoryFinalRank}: {item.finalRankId.replace(/_/g, ' ')} · {t.userStatAvgTurns}: {item.turnsCompleted}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </>
    )}
  </section>
);

export const RegisterSection = ({
  t,
  busy,
  error,
  registerDraft,
  setRegisterDraft,
  onRegister,
  onBackToLogin,
}: {
  t: T;
  busy: boolean;
  error: string;
  registerDraft: { username: string; email: string; password: string; displayName: string };
  setRegisterDraft: (value: { username: string; email: string; password: string; displayName: string }) => void;
  onRegister: () => void;
  onBackToLogin: () => void;
}) => (
  <section className="board">
    <h2>{t.userRegisterTitle}</h2>
    {error ? <p className="admin-error">{error}</p> : null}
    <div className="auth-shell">
      <div className="auth-card">
        <p><input value={registerDraft.username} onChange={(e) => setRegisterDraft({ ...registerDraft, username: e.target.value })} placeholder={t.userUsernameLabel} /></p>
        <p><input value={registerDraft.displayName} onChange={(e) => setRegisterDraft({ ...registerDraft, displayName: e.target.value })} placeholder={t.userDisplayNameLabel} /></p>
        <p><input value={registerDraft.email} onChange={(e) => setRegisterDraft({ ...registerDraft, email: e.target.value })} placeholder={t.userEmailLabel} /></p>
        <p><input type="password" value={registerDraft.password} onChange={(e) => setRegisterDraft({ ...registerDraft, password: e.target.value })} placeholder={t.userPasswordLabel} /></p>
        <p className="admin-controls">
          <button type="button" onClick={onRegister} disabled={busy}>{t.userRegisterButton}</button>
          <button type="button" onClick={onBackToLogin} disabled={busy}>{t.userGoToLoginButton}</button>
        </p>
      </div>
    </div>
  </section>
);

export const PasswordResetSection = ({
  t,
  busy,
  error,
  resetRequestDraft,
  setResetRequestDraft,
  onRequestPasswordReset,
  resetPasswordDraft,
  setResetPasswordDraft,
  onResetPassword,
  onBackToLogin,
}: {
  t: T;
  busy: boolean;
  error: string;
  resetRequestDraft: { login: string };
  setResetRequestDraft: (value: { login: string }) => void;
  onRequestPasswordReset: () => void;
  resetPasswordDraft: { token: string; nextPassword: string };
  setResetPasswordDraft: (value: { token: string; nextPassword: string }) => void;
  onResetPassword: () => void;
  onBackToLogin: () => void;
}) => (
  <section className="board">
    <h2>{t.userPasswordResetTitle}</h2>
    {error ? <p className="admin-error">{error}</p> : null}
    <div className="lobby-layout">
      <div className="lobby-col">
        <h3>{t.userPasswordResetRequestButton}</h3>
        <p><input value={resetRequestDraft.login} onChange={(e) => setResetRequestDraft({ login: e.target.value })} placeholder={t.userLoginPlaceholder} /></p>
        <p className="admin-controls">
          <button type="button" onClick={onRequestPasswordReset} disabled={busy}>{t.userPasswordResetRequestButton}</button>
          <button type="button" onClick={onBackToLogin} disabled={busy}>{t.userGoToLoginButton}</button>
        </p>
      </div>
      <div className="lobby-col">
        <h3>{t.userPasswordResetApplyButton}</h3>
        <p><input value={resetPasswordDraft.token} onChange={(e) => setResetPasswordDraft({ ...resetPasswordDraft, token: e.target.value })} placeholder={t.userResetTokenLabel} /></p>
        <p><input type="password" value={resetPasswordDraft.nextPassword} onChange={(e) => setResetPasswordDraft({ ...resetPasswordDraft, nextPassword: e.target.value })} placeholder={t.userNewPasswordLabel} /></p>
        <p><button type="button" onClick={onResetPassword} disabled={busy}>{t.userPasswordResetApplyButton}</button></p>
      </div>
    </div>
  </section>
);

export const StatisticsSection = ({
  t,
  user,
  stats,
  awards,
  matchHistory,
  sessions,
}: {
  t: T;
  user: AuthUser | null;
  stats: UserStats | null;
  awards: UserAward[];
  matchHistory: UserMatchHistoryItem[];
  sessions: UserSession[];
}) => {
  const [activeCategory, setActiveCategory] = useState<'general' | 'resources' | 'actions' | 'achievements' | 'history' | 'sessions'>('general');
  return (
    <section className="board">
      <h2>{t.userTabStatistics}</h2>
      {!user ? <p>{t.statisticsLoginRequired}</p> : (
        <>
          <p className="admin-controls">
            <button type="button" onClick={() => setActiveCategory('general')} disabled={activeCategory === 'general'}>{t.statisticsCategoryGeneral}</button>
            <button type="button" onClick={() => setActiveCategory('resources')} disabled={activeCategory === 'resources'}>{t.statisticsCategoryResources}</button>
            <button type="button" onClick={() => setActiveCategory('actions')} disabled={activeCategory === 'actions'}>{t.statisticsCategoryActions}</button>
            <button type="button" onClick={() => setActiveCategory('achievements')} disabled={activeCategory === 'achievements'}>{t.statisticsCategoryAchievements}</button>
            <button type="button" onClick={() => setActiveCategory('history')} disabled={activeCategory === 'history'}>{t.statisticsCategoryHistory}</button>
            <button type="button" onClick={() => setActiveCategory('sessions')} disabled={activeCategory === 'sessions'}>{t.statisticsCategorySessions}</button>
          </p>
          {!stats ? <p>{t.simulationNoData}</p> : null}
          {stats && activeCategory === 'general' ? (
            <ul>
              <li>{t.userStatMatchesLinked}: {stats.matchesLinked}</li>
              <li>{t.userStatMatchesFinished}: {stats.matchesFinished}</li>
              <li>{t.userStatWins}: {stats.wins}</li>
              <li>{t.userStatRankWins}: {stats.rankWins}</li>
              <li>{t.userStatScoreWins}: {stats.scoreWins}</li>
              <li>{t.userStatStalledMatches}: {stats.stalledMatches}</li>
              <li>{t.userStatBotMatchesFinished}: {stats.botMatchesFinished}</li>
              <li>{t.userStatWinRate}: {stats.winRatePct}%</li>
              <li>{t.userStatAvgTurns}: {stats.avgTurns}</li>
              <li>{t.userStatBestRank}: {stats.bestRankName}</li>
              <li>{t.userStatLastMatchAt}: {stats.lastMatchAt ? new Date(stats.lastMatchAt).toLocaleString() : '-'}</li>
              <li>{t.userStatsByModeTitle}
                <ul>
                  {stats.byMode.length === 0 ? <li>{t.simulationNoData}</li> : stats.byMode.map((row) => (
                    <li key={`stats-mode-${row.mode}`}>
                      {formatGameModeLabel(t, row.mode)}: {row.matchesFinished} / {row.wins} / {row.winRatePct}%
                    </li>
                  ))}
                </ul>
              </li>
              <li>{t.userStatsByPlayerCountTitle}
                <ul>
                  {stats.byPlayerCount.length === 0 ? <li>{t.simulationNoData}</li> : stats.byPlayerCount.map((row) => (
                    <li key={`stats-player-count-${row.playerCount}`}>
                      {row.playerCount}: {row.matchesFinished} / {row.wins} / {row.winRatePct}%
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          ) : null}
          {stats && activeCategory === 'resources' ? (
            <ul>
              <li>{t.userStatResourcesGained}: {stats.resourcesGainedTotal}</li>
              <li>{t.userStatResourcesLost}: {stats.resourcesLostTotal}</li>
            </ul>
          ) : null}
          {stats && activeCategory === 'actions' ? (
            <ul>
              <li>{t.userStatLyaps}: {stats.lyapsPlayedOnOthers}</li>
              <li>{t.userStatScandals}: {stats.scandalsPlayedOnOthers}</li>
              <li>{t.userLastLoginAt}: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '-'}</li>
            </ul>
          ) : null}
          {activeCategory === 'achievements' ? (
            awards.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {awards.map((award) => (
                  <li key={`stats-award-${award.awardId}`}>
                    <strong>[{award.badgeLabel}]</strong> {award.title}
                    {' '}({Math.min(award.progressValue, award.threshold)}/{award.threshold})
                    {award.awarded ? ` • ${t.userAwardUnlockedLabel}` : ''}
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {activeCategory === 'history' ? (
            matchHistory.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {matchHistory.map((item) => (
                  <li key={`stats-history-${item.matchId}-${item.playerId}`}>
                    <strong>{formatMatchOutcomeLabel(t, item)}</strong> · {formatGameModeLabel(t, item.gameMode)}
                    {' · '}
                    {item.playerCount}p
                    {item.botCount > 0 ? ` · ${item.botCount} ${t.roomBotsLabel.toLowerCase()} (${formatBotDifficultyLabel(t, item.botDifficulty)})` : ''}
                    <br />
                    {t.userMatchHistoryFinalRank}: {item.finalRankId.replace(/_/g, ' ')} · {t.userStatAvgTurns}: {item.turnsCompleted}
                    <br />
                    {t.userStatResourcesGained}: {item.resourcesGainedTotal} · {t.userStatResourcesLost}: {item.resourcesLostTotal}
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {activeCategory === 'sessions' ? (
            sessions.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {sessions.map((session) => (
                  <li key={`stats-session-${session.id}`}>
                    {new Date(session.lastSeenAt).toLocaleString()} | {session.sourceIp ?? '-'} | {(session.userAgent ?? '-').slice(0, 48)}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      )}
    </section>
  );
};

export const AuthErrorModal = ({
  t,
  open,
  error,
  onClose,
  onOpenReset,
}: {
  t: T;
  open: boolean;
  error: string;
  onClose: () => void;
  onOpenReset: () => void;
}) => {
  if (!open) return null;
  return (
    <div className="gameover-modal" role="dialog" aria-label={t.userAuthErrorTitle}>
      <div className="gameover-modal-card">
        <h3>{t.userAuthErrorTitle}</h3>
        <p>{error}</p>
        <p>{t.userAuthErrorResetHint}</p>
        <p className="admin-controls">
          <button type="button" onClick={onOpenReset}>{t.userPasswordResetOpenButton}</button>
          <button type="button" onClick={onClose}>{t.closePopup}</button>
        </p>
      </div>
    </div>
  );
};

type GallerySectionProps = {
  t: T;
  lang: Language;
  galleryCategoryFilter: GalleryCategoryFilter;
  setGalleryCategoryFilter: (value: GalleryCategoryFilter) => void;
  galleryCards: CardDefinition[];
  galleryCategories: CardDefinition['category'][];
  effectLabel: (resource: 'time' | 'reputation' | 'discipline' | 'documents' | 'tech' | 'rank') => string;
  uiVariant?: 'v1' | 'v2' | 'v3';
};

export const GallerySection = ({
  t,
  lang,
  galleryCategoryFilter,
  setGalleryCategoryFilter,
  galleryCards,
  galleryCategories,
  effectLabel,
  uiVariant = 'v1',
}: GallerySectionProps) => {
  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const togglePreview = (key: string) => setOpenPreviewKey((prev) => (prev === key ? null : key));

  return (
    <section className={`board${uiVariant === 'v2' ? ' board-v2-panel board-v2-gallery' : ''}${uiVariant === 'v3' ? ' board-v3-panel board-v3-gallery' : ''}`}>
      <h2>{t.galleryTitle}</h2>
      <p>{t.galleryDescription}</p>
      <p className={`gallery-category-tabs${uiVariant === 'v2' ? ' gallery-category-tabs-v2' : ''}`}>
      <button
        type="button"
        onClick={() => setGalleryCategoryFilter('ALL')}
        disabled={galleryCategoryFilter === 'ALL'}
      >
        {t.allCategories}
      </button>
      {galleryCategories.map((cat) => (
        <button
          type="button"
          key={`gallery-filter-${cat}`}
          onClick={() => setGalleryCategoryFilter(cat)}
          disabled={galleryCategoryFilter === cat}
        >
          {categoryLabel(cat, lang)}
        </button>
      ))}
      </p>
      {galleryCards.length === 0 ? <p>{t.noCardsYet}</p> : null}
      <div className={`gallery-grid${uiVariant === 'v2' ? ' gallery-grid-v2' : ''}`}>
        {galleryCards.map((card) => {
          const previewKey = `gallery-${card.id}`;
          const isOpen = openPreviewKey === previewKey;
          return (
            <article key={card.id} className="gallery-card">
              <div
                className={`gallery-card-image${isOpen ? ' is-open' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => togglePreview(previewKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    togglePreview(previewKey);
                  }
                  if (e.key === 'Escape') {
                    setOpenPreviewKey(null);
                  }
                }}
              >
            <img
              src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
              alt={cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
                <div
                  className={`gallery-card-popover${isOpen ? ' is-open' : ''}`}
                  aria-hidden={!isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenPreviewKey(null);
                  }}
                >
              <img
                src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                  alt={cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}
              />
                </div>
              </div>
              <h3>{cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}</h3>
              <p>{cardFlavor(card.flavor, lang, card.flavorEn)}</p>
              <div className="gallery-effects">
                {(card.effects ?? []).length === 0 ? (
                  <span className="pill pill-cost">0</span>
                ) : (card.effects ?? []).map((effect, idx) => (
                  <span key={`${card.id}-effect-${idx}`} className="pill pill-effect">
                    {effectLabel(effect.resource)}: {effect.value > 0 ? `+${effect.value}` : effect.value}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export const RulesSection = ({
  t,
  rules,
  uiVariant = 'v1',
}: { t: T; rules: readonly string[]; uiVariant?: 'v1' | 'v2' | 'v3' }) => (
  <section className={`board${uiVariant === 'v2' ? ' board-v2-panel board-v2-rules' : ''}${uiVariant === 'v3' ? ' board-v3-panel board-v3-rules' : ''}`}>
    <h2>{t.rulesTitle}</h2>
    <ol className={`rules-list${uiVariant === 'v2' ? ' rules-list-v2' : ''}`}>
      {rules.map((rule, index) => (
        <li key={`rule-${index}`}>{rule}</li>
      ))}
    </ol>
  </section>
);
