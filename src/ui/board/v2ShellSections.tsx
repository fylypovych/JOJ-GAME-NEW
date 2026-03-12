export const BoardV2Header = (props: {
  title: string;
  roomMeta?: { matchID: string; playerID?: string | null } | null;
  playerName: string;
  spectatorLabel: string;
  activeRoomLabel: string;
  joinedAsLabel: string;
  spectatorModeLabel: string;
  stageFocus?: string;
  seatConnectionMissing: boolean;
  seatConnectionMissingText: string;
  onLeaveRoom?: () => void;
  leaveRoomLabel: string;
  requestEndGameLabel: string;
  onRequestEndGame: () => void;
  requestEndGameDisabled: boolean;
}) => {
  const {
    title,
    roomMeta,
    playerName,
    spectatorLabel,
    activeRoomLabel,
    joinedAsLabel,
    spectatorModeLabel,
    stageFocus,
    seatConnectionMissing,
    seatConnectionMissingText,
    onLeaveRoom,
    leaveRoomLabel,
    requestEndGameLabel,
    onRequestEndGame,
    requestEndGameDisabled,
  } = props;
  return (
    <header className="game-ui-v2-header">
      <div>
        <p className="game-ui-v2-kicker">JOJ V2</p>
        <h2>{title}</h2>
        {roomMeta ? (
          <div className="game-ui-v2-room-meta">
            <p className="game-ui-v2-subtle">{activeRoomLabel}: <strong>{roomMeta.matchID}</strong></p>
            <p className="game-ui-v2-subtle">
              {roomMeta.playerID ? `${joinedAsLabel}: ${playerName || '-'} (#${roomMeta.playerID})` : `${spectatorModeLabel}: ${playerName || spectatorLabel}`}
            </p>
          </div>
        ) : null}
        {stageFocus ? <p className="game-ui-v2-subtle game-ui-v2-stage-focus">{stageFocus}</p> : null}
        {seatConnectionMissing ? <p className="admin-error">{seatConnectionMissingText}</p> : null}
      </div>
      <div className="game-ui-v2-header-actions">
        {onLeaveRoom ? (
          <button type="button" className="game-ui-v2-header-leave" onClick={onLeaveRoom}>
            {leaveRoomLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="game-ui-v2-header-leave"
          onClick={onRequestEndGame}
          disabled={requestEndGameDisabled}
        >
          {requestEndGameLabel}
        </button>
      </div>
    </header>
  );
};

export const BoardV2EndVoteModal = (props: {
  open: boolean;
  title: string;
  prompt: string;
  waitingLabel: string;
  declineInfo: string;
  hasVotedAgree: boolean;
  agreeLabel: string;
  declineLabel: string;
  onAgree: () => void;
  onDecline: () => void;
}) => {
  if (!props.open) return null;
  return (
    <section className="game-ui-v2-vote-popup" role="dialog" aria-label={props.title}>
      <div className="game-ui-v2-vote-popup-card">
        <h3>{props.title}</h3>
        <p className="game-ui-v2-subtle">{props.prompt}</p>
        {!props.hasVotedAgree ? (
          <div className="game-ui-v2-selection-actions">
            <button type="button" onClick={props.onAgree}>{props.agreeLabel}</button>
            <button type="button" className="ghost" onClick={props.onDecline}>{props.declineLabel}</button>
          </div>
        ) : (
          <p className="game-ui-v2-subtle">{props.waitingLabel}</p>
        )}
        <p className="game-ui-v2-subtle">{props.declineInfo}</p>
      </div>
    </section>
  );
};

export const BoardV2GameoverModal = (props: {
  open: boolean;
  ariaLabel: string;
  title: string;
  winnerLabel: string;
  winnerName: string;
  winnerRankName?: string;
  autoEndedLabel?: string;
  agreedEndLabel?: string;
  stats: {
    totalTurns: number;
    resourcesGained: number;
    resourcesLost: number;
    lyapsPlayed: number;
    scandalsPlayed: number;
  };
  statsLabels: {
    totalTurns: string;
    resourcesGained: string;
    resourcesLost: string;
    lyapsPlayed: string;
    scandalsPlayed: string;
  };
  summaryTitle: string;
  summaryLabels: {
    player: string;
    rank: string;
    resources: string;
    turns: string;
    gainLoss: string;
    actions: string;
  };
  playerSummaries: Array<{
    playerID: string;
    name: string;
    rankName: string;
    resourcesText: string;
    turnsTaken: number;
    resourcesGainedTotal: number;
    resourcesLostTotal: number;
    lyapsPlayedOnOthers: number;
    scandalsPlayedOnOthers: number;
    winner: boolean;
  }>;
  closeLabel: string;
  leaveRoomLabel: string;
  onLeaveRoom?: () => void;
  onClose: () => void;
}) => {
  if (!props.open) return null;
  return (
    <div className="game-ui-v2-gameover-modal" role="dialog" aria-label={props.ariaLabel}>
      <div className="game-ui-v2-gameover-card">
        <h3>{props.title}</h3>
        <p>
          <strong>{props.winnerLabel}:</strong> {props.winnerName}
          {props.winnerRankName ? ` (${props.winnerRankName})` : ''}
        </p>
        {props.autoEndedLabel ? <p className="game-ui-v2-subtle">{props.autoEndedLabel}</p> : null}
        {props.agreedEndLabel ? <p className="game-ui-v2-subtle">{props.agreedEndLabel}</p> : null}
        <div className="game-ui-v2-token-list">
          <div className="game-ui-v2-token-row"><span>{props.statsLabels.totalTurns}</span><strong>{props.stats.totalTurns}</strong></div>
          <div className="game-ui-v2-token-row"><span>{props.statsLabels.resourcesGained}</span><strong>{props.stats.resourcesGained}</strong></div>
          <div className="game-ui-v2-token-row"><span>{props.statsLabels.resourcesLost}</span><strong>{props.stats.resourcesLost}</strong></div>
          <div className="game-ui-v2-token-row"><span>{props.statsLabels.lyapsPlayed}</span><strong>{props.stats.lyapsPlayed}</strong></div>
          <div className="game-ui-v2-token-row"><span>{props.statsLabels.scandalsPlayed}</span><strong>{props.stats.scandalsPlayed}</strong></div>
        </div>
        <BoardV2StandingsSummary
          title={props.summaryTitle}
          summaryLabels={props.summaryLabels}
          playerSummaries={props.playerSummaries}
        />
        {props.onLeaveRoom ? <button type="button" onClick={props.onLeaveRoom}>{props.leaveRoomLabel}</button> : null}
        <button type="button" onClick={props.onClose}>{props.closeLabel}</button>
      </div>
    </div>
  );
};

export const BoardV2StandingsSummary = (props: {
  title: string;
  summaryLabels: {
    player: string;
    rank: string;
    resources: string;
    turns: string;
    gainLoss: string;
    actions: string;
  };
  playerSummaries: Array<{
    playerID: string;
    name: string;
    rankName: string;
    resourcesText: string;
    turnsTaken: number;
    resourcesGainedTotal: number;
    resourcesLostTotal: number;
    lyapsPlayedOnOthers: number;
    scandalsPlayedOnOthers: number;
    winner?: boolean;
  }>;
}) => (
  <div className="game-ui-v2-gameover-summary">
    <h4>{props.title}</h4>
    <div className="game-ui-v2-gameover-summary-list">
      {props.playerSummaries.map((row) => (
        <article key={`summary-${row.playerID}`} className={`game-ui-v2-gameover-summary-row${row.winner ? ' is-winner' : ''}`}>
          <div className="game-ui-v2-gameover-summary-head">
            <strong>{row.name}</strong>
            <span>{row.rankName}</span>
          </div>
          <div className="game-ui-v2-gameover-summary-grid">
            <span>{props.summaryLabels.player}</span><strong>{row.name}</strong>
            <span>{props.summaryLabels.rank}</span><strong>{row.rankName}</strong>
            <span>{props.summaryLabels.resources}</span><strong>{row.resourcesText}</strong>
            <span>{props.summaryLabels.turns}</span><strong>{row.turnsTaken}</strong>
            <span>{props.summaryLabels.gainLoss}</span><strong>+{row.resourcesGainedTotal} / -{row.resourcesLostTotal}</strong>
            <span>{props.summaryLabels.actions}</span><strong>{row.lyapsPlayedOnOthers} / {row.scandalsPlayedOnOthers}</strong>
          </div>
        </article>
      ))}
    </div>
  </div>
);
