import { useMemo, useState } from 'react';
import type { GameMode, BotDifficulty, BotProfile } from '../../../game/types';
import { text } from '../../i18n';
import { getAvailableBotCounts, clampBotCountToAllowed } from '../../../game/lobbyConfig';
import { useLobby } from '../../providers/LobbyContext';
import { useDeck } from '../../providers/DeckContext';
import { buildRoomShareLink, copyText } from '../share';
import {
  estimateRoomDurationLabel,
  formatBotDifficultyLabel,
  formatGameModeLabel,
  formatModuleList,
} from '../section-helpers';

type T = ReturnType<typeof text>;

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
  selectedOptionalModuleIds: string[];
  setSelectedOptionalModuleIds: (ids: string[]) => void;
  uiVariant?: 'v1' | 'v2';
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
  selectedOptionalModuleIds,
  setSelectedOptionalModuleIds,
  uiVariant = 'v2',
}: LobbySectionProps) => {
  const { matches, session, activeSessionMatch, canStart, loading, error, createRoom, joinRoom, spectateRoom, leaveRoom, refreshMatches } = useLobby();
  const { optionalLobbyModules: optionalModules } = useDeck();
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

  if (session && !canStart) {
    const missingSeats = activeSessionMatch
      ? activeSessionMatch.players.filter((player) => !player.name?.trim()).length
      : 0;
    return (
      <section className={`board board-v2-panel board-v2-active-room${uiVariant === 'v1' ? ' board-v1-panel board-v1-active-room' : ''}`}>
        <h2 className="lobby-active-room-title">{t.activeRoom}: {session.matchID}</h2>
        <p className="lobby-active-room-meta">{t.joinedAs}: {effectivePlayerName || '-'} (#{session.playerID})</p>
        <div className="lobby-room-blockers">
          <p>{activeSessionMatch ? t.roomBlockedNeedPlayersCount.replace('{count}', String(missingSeats)) : t.loadingRooms}</p>
        </div>
        {activeSessionMatch ? (
          <div className="lobby-room-seat-list">
            {activeSessionMatch.players.map((player) => (
              <span key={`${activeSessionMatch.matchID}-waiting-seat-${player.id}`} className={`lobby-room-seat${player.name ? ' is-filled' : ' is-empty'}`}>
                #{player.id} {player.name?.trim() || t.lobbySeatOpen}
              </span>
            ))}
          </div>
        ) : null}
        <p className="admin-controls">
          <button type="button" onClick={refreshMatches} disabled={loading}>{t.refreshRooms}</button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(t.leaveRoomConfirm)) return;
              void leaveRoom();
            }}
            disabled={loading}
          >
            {t.leaveRoom}
          </button>
        </p>
      </section>
    );
  }

  return (
    <section className={`board board-v2-panel board-v2-lobby${uiVariant === 'v1' ? ' board-v1-panel board-v1-lobby' : ''}`}>
      <h2>{t.lobbyTitle}</h2>
      <div className="lobby-layout board-v2-dual-layout">
        <div className="lobby-col board-v2-column">
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
              <p>{t.noRoomsHelp}</p>
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
                    <p>
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
        <div className="lobby-col board-v2-column">
          <h3>{t.roomCreateTitle}</h3>
          {authenticatedUser ? (
            <p>
              {t.joinedAs}: <strong>{effectivePlayerName || '-'}</strong>
            </p>
          ) : (
            <p>
              {t.playerName}:{' '}
              <input
                id="lobby-player-name"
                name="playerName"
                autoComplete="off"
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
          <div className={`lobby-room-create-summary lobby-room-create-summary-v4-compact board-v2-subpanel${uiVariant === 'v1' ? ' board-v1-subpanel' : ''}`}>
            <h4>{t.roomSummaryReady}</h4>
            <ul>
              <li>{t.gameModeLabel}: {formatGameModeLabel(t, gameMode)}</li>
              <li>{t.roomCapacity}: {roomCapacity}</li>
              <li>{t.roomBotsLabel}: {createWithBots ? `${effectiveBotCount} · ${formatBotDifficultyLabel(t, botDifficulty)}` : t.roomBotsOff}</li>
              <li>{t.roomModulesLabel}: {formatModuleList(selectedOptionalModuleIds, moduleNameById)}</li>
              <li>{t.roomDurationLabel}: {estimateRoomDurationLabel(t, roomCapacity, gameMode)}</li>
            </ul>
            <p>{t.roomDraftHint}</p>
          </div>
        </div>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
    </section>
  );
};
