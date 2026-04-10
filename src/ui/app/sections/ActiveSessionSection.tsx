import { useEffect, useMemo, useRef, useState } from 'react';
import type { LobbyMatch } from '../model';
import { text } from '../../i18n';
import { buildRoomShareLink, copyText } from '../share';
import {
  estimateRoomDurationLabel,
  formatGameModeLabel,
  formatModuleList,
} from '../section-helpers';

type T = ReturnType<typeof text>;

type ActiveSessionSectionProps = {
  t: T;
  session: { matchID: string; playerID?: string; spectator?: boolean };
  playerName: string;
  sessionBroken: boolean;
  canStart: boolean;
  activeMatch?: LobbyMatch | null;
  optionalModules: Array<{ id: string; name: string; alwaysOn: boolean }>;
  leaveRoom: () => void;
  refreshMatches: () => void;
  loading: boolean;
  uiVariant?: 'v1' | 'v2';
};

export const ActiveSessionSection = ({
  t,
  session,
  playerName,
  sessionBroken,
  canStart,
  activeMatch = null,
  optionalModules,
  leaveRoom,
  refreshMatches,
  loading,
  uiVariant = 'v2',
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
        const before = previous.players.find((row: LobbyMatch['players'][number]) => row.id === player.id)?.name?.trim() || '';
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
  const activeModules = activeMatch?.setupData?.gameSetup?.optionalMainDeckModuleIds ?? [];
  const activeModulesLabel = formatModuleList(activeModules, moduleNameById);
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
    <section className={`board board-v2-panel board-v2-active-room${uiVariant === 'v1' ? ' board-v1-panel board-v1-active-room' : ''}`}>
      <h2 className="lobby-active-room-title">
        {t.activeRoom}: {session.matchID}
      </h2>
      <p className="lobby-active-room-meta">
        {session.spectator
          ? `${t.spectatorMode}: ${t.spectatorJoinedLabel}`
          : `${t.joinedAs}: ${playerName || '-'} (#${session.playerID})`}
      </p>
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
      {activeMatch ? (
        <div className={`lobby-active-room-grid lobby-active-room-grid-summary is-v4 board-v2-summary-grid${uiVariant === 'v1' ? ' board-v1-summary-grid' : ''}`}>
          <div className={`lobby-room-create-summary lobby-room-create-summary-compact lobby-room-create-summary-v4-compact board-v2-subpanel${uiVariant === 'v1' ? ' board-v1-subpanel' : ''}`}>
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
        </div>
      ) : null}
    </section>
  );
};
