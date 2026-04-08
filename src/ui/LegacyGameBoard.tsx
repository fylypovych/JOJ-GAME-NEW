import { useEffect, useState } from 'react';
import type { CardDefinition, ResourceKey } from '../game/types';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';
import { buildGameoverPlayerSummaries, buildResourceHighlightMeta, buildTurnHelpItems, getBoardPromoteReason } from './board/boardViewHelpers';
import { GameCardTile, PilePreview } from './board/components';
import { buildNextRankHint, getNextRankSeatMeta } from './board/rankHints';
import { BoardV1HandSection, BoardV1NoticeStack, BoardV1PlayerOverview, BoardV1SelectionPanel, BoardV1SidePanel } from './board/v1Sections';
import { BoardV1EndVoteModal, BoardV1GameoverModal, BoardV1Header, BoardV1StandingsSummary } from './board/v1ShellSections';
import { useBoardDerivedState } from './board/useBoardDerivedState';
import { useBotPlaybackQueue, type BotPlaybackSpeedLevel } from './board/useBotPlaybackQueue';
import { resolvePlaybackCardMeta } from './board/playbackCardMeta';
import { usePendingSelection } from './board/usePendingSelection';
import { useBoardStageState } from './board/useBoardStageState';
import { useBoardSync } from './board/useBoardSync';
import { useBoardUiController } from './board/useBoardUiController';
import type { LocalizedBoardProps } from './board/types';

const RESOURCE_ORDER: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

type HandFilter = 'all' | 'playable' | CardDefinition['category'];
type HandSort = 'default' | 'playable' | 'category' | 'title';
const botSpeedHint = (lang: 'uk' | 'en', speed: BotPlaybackSpeedLevel) => {
  if (lang === 'uk') {
    if (speed <= 1) return '1 = показ кожного ходу, до 60 секунд';
    if (speed >= 5) return '5 = карти ботів видно, затримка до 10 секунд';
    return `${speed} = прискорений показ ходів ботів`;
  }
  if (speed <= 1) return '1 = show every move, up to 60 seconds';
  if (speed >= 5) return '5 = bot cards stay visible, up to 10 seconds delay';
  return `${speed} = faster bot playback`;
};
const stageLabel = (stage: string | undefined, t: ReturnType<typeof text>) =>
  stage === 'draw' ? t.stageDraw : stage === 'play' ? t.stagePlay : stage === 'end' ? t.stageEnd : t.stageWaiting;

const buildV3OpponentLayout = (opponentIds: string[]) => {
  if (opponentIds.length <= 3) {
    return {
      topIds: opponentIds,
      leftIds: [] as string[],
      rightIds: [] as string[],
    };
  }

  if (opponentIds.length === 4) {
    return {
      topIds: opponentIds.slice(0, 2),
      leftIds: opponentIds.slice(2, 3),
      rightIds: opponentIds.slice(3, 4),
    };
  }

  const remaining = opponentIds.slice(3);
  const leftCount = Math.ceil(remaining.length / 2);
  return {
    topIds: opponentIds.slice(0, 3),
    leftIds: remaining.slice(0, leftCount),
    rightIds: remaining.slice(leftCount),
  };
};

export const LegacyGameBoard = ({
  G: incomingG,
  ctx: incomingCtx,
  moves,
  playerID,
  lang = 'uk',
  playerName = '',
  knownPlayerNames = {},
  sharedRanks = [],
  cardImageById = {},
  roomMeta,
  onLeaveRoom,
  onStateChange,
}: LocalizedBoardProps) => {
  const t = text(lang);
  const board = t.board;
  const isSpectator = !playerID;
  const [spectatorView, setSpectatorView] = useState<'live' | 'summary'>('live');
  const [impactPulse, setImpactPulse] = useState<{
    id: string;
    label: string;
    text: string;
    tone: 'neutral' | 'warn' | 'good' | 'legendary';
    imageSrc?: string;
  } | null>(null);
  const {
    G,
    ctx,
    botPlaybackSpeed,
    setBotPlaybackSpeed,
    botAutoplayEnabled,
    setBotAutoplayEnabled,
    botThinkingPlayerName,
    botPlaybackEventText,
    botPlaybackCardTitle,
    isBotPlaybackActive,
  } = useBotPlaybackQueue({
    incomingG,
    incomingCtx,
    playerID,
  });

  const id = playerID ?? '';
  const seatConnectionMissing = Boolean(roomMeta?.playerID) && !playerID;
  const resourceLabels: Record<ResourceKey, string> = t.resources;
  const {
    isSimplifiedMode,
    hand,
    legendaryHand,
    legendaryDraftPool,
    draftPending,
    myDraftDone,
    resources,
    rankId,
    rankName: rawRankName,
    rankImage,
    isCurrentPlayer,
    stage,
    canDraw,
    canPlay,
    canEndTurn,
    canPlayHandCard,
    handOverflow,
    mustDiscardOverflow,
    deckBackImage,
    lastDiscard,
    lastDiscardImage,
  } = useBoardStageState({
    G,
    ctx,
    playerID: id,
    sharedRanks,
    cardImageById,
  });
  const rankName = rawRankName || rankLabel(rankId ?? '', lang);
  const hasBotPlayers = Object.keys(G?.botPlayers ?? {}).length > 0;
  const compactMode = false;
  const {
    chatInput,
    setChatInput,
    openPreviewKey,
    setOpenPreviewKey,
    draftSelection,
    setDraftSelection,
    notices,
    gameoverModalClosed,
    setGameoverModalClosed,
    handFilter,
    setHandFilter,
    handSort,
    setHandSort,
    sidePanelTab,
    setSidePanelTab,
    syncedNameRef,
    syncedNamesSignatureRef,
    chatLogRef,
    playerLabelById,
    effectLabel,
    togglePreview,
    postNotice,
    dismissNotice,
    opponentIds,
    sendChatMessage,
    handleHandCardAction,
    handleLegendaryCardAction,
    handleDraw,
    handlePromote,
    handlePass,
    handleRequestEndGameVote,
    handleRespondEndGameVote,
    handleDraftToggle,
  } = useBoardUiController({
    G,
    id,
    knownPlayerNames,
    playerNames: G?.playerNames,
    moves,
    canPlayHandCard,
    canPlay,
    canDraw,
    canEndTurn,
    sharedRanks,
    resourceLabels,
    lang,
    board,
    t,
  });

  const {
    pendingSelection,
    setPendingSelection,
    selectedTargetId,
    setSelectedTargetId,
    selectedResource,
    setSelectedResource,
    replacementSelectionsByTarget,
    setReplacementSelectionsByTarget,
    setActiveReplacementTargetId,
    currentPendingCard,
    replacementTargetIds,
    replacementActiveTargetId,
    replacementActiveTargetResources,
    replacementActiveSlots,
    replacementActiveSelected,
    requestPlayHandCard,
    requestPlayLegendaryCard,
    confirmPendingSelection,
    clearPendingSelection,
    appendReplacementResource,
    undoReplacementResource,
    activeSelectionNeedsTarget,
    activeSelectionNeedsResource,
    activeSelectionNeedsReplacement,
    pickTargetNotice,
  } = usePendingSelection({
    G,
    ctx,
    id,
    hand,
    legendaryHand,
    opponentIds,
    moves,
    lang,
    board,
    postNotice,
    playerLabelById,
    cardTitle,
  });

  useBoardSync({
    G,
    ctx,
    playerID: playerID ?? undefined,
    playerName,
    knownPlayerNames,
    moves,
    canDraw,
    canEndTurn,
    stage,
    id,
    board,
    lang,
    cardTitle,
    onStateChange,
    setOpenPreviewKey,
    setPendingSelection,
    setSelectedTargetId,
    setSelectedResource,
    setReplacementSelectionsByTarget,
    setActiveReplacementTargetId,
    setDraftSelection,
    setGameoverModalClosed,
    postNotice,
    syncedNameRef,
    syncedNamesSignatureRef,
    chatLogRef,
  });

  const endGameVote = G?.endGameVote;
  const endGameVoteActive = Boolean(endGameVote?.active) && !ctx?.gameover;
  const requestedByLabel = endGameVote?.requestedBy ? playerLabelById(endGameVote.requestedBy) : '';
  const hasVotedAgree = Boolean(endGameVote?.votes?.[id]);
  const {
    nextRankMeta,
    gameoverMeta,
    winnerPlayerID,
    winnerRankName,
    latestEvents,
    handCardsView,
    shouldShowSkipTurnLabel,
    passButtonLabel,
  } = useBoardDerivedState({
    G,
    ctx,
    stage,
    id,
    hand,
    legendaryHand,
    canPlay: canPlay && typeof moves.playLegendaryCard === 'function',
    canPlayHandCard,
    sharedRanks,
    resourceLabels,
    lang,
    handFilter,
    handSort,
    board,
    endTurnLabel: t.endTurn,
  });

  if (!G || !ctx || !resources) {
    return (
      <section className="board">
        <p>{t.loading}</p>
        {roomMeta ? <p>{t.activeRoom}: <strong>{roomMeta.matchID}</strong></p> : null}
        {onLeaveRoom ? (
          <p>
            <button type="button" onClick={onLeaveRoom}>{t.leaveRoom}</button>
          </p>
        ) : null}
      </section>
    );
  }

  const promoteReason = getBoardPromoteReason({ G, playerID: id, sharedRanks, resourceLabels, lang });
  const gameoverPlayerSummaries = buildGameoverPlayerSummaries({
    G,
    winnerPlayerID,
    playerLabelById,
    resourceLabels,
    sharedRanks,
    lang,
  });
  const { highlightedResources, deficitByResource } = buildResourceHighlightMeta({
    resources,
    selectedResource,
  });

  const botPlaybackControlLabel = botThinkingPlayerName
    ? `${board.botThinkingPrefix}: ${botThinkingPlayerName}`
    : botPlaybackEventText || board.waitingAction;
  const blockPlayerTurnControls = !isSpectator && isBotPlaybackActive;
  const effectiveIsCurrentPlayer = isCurrentPlayer && !blockPlayerTurnControls;
  const currentStageFocus = blockPlayerTurnControls
    ? botPlaybackControlLabel
    : stage === 'draw' ? board.stageFocusDraw : stage === 'play' ? board.stageFocusPlay : stage === 'end' ? board.stageFocusEnd : '';
  const activeArenaPlayerId = selectedTargetId ?? ctx.currentPlayer ?? null;
  const activeArenaPlayerName = playerLabelById(activeArenaPlayerId);
  const activeArenaResources = activeArenaPlayerId ? G.resources?.[activeArenaPlayerId] ?? null : null;
  const activeArenaRankId = activeArenaPlayerId ? G.ranks?.[activeArenaPlayerId] ?? '' : '';
  const activeArenaRankName = activeArenaRankId
    ? sharedRanks.find((rank) => rank.id === activeArenaRankId)?.name ?? rankLabel(activeArenaRankId, lang)
    : '';
  const latestArenaRow = latestEvents[0] ?? null;
  const lastDiscardTitle = lastDiscard ? cardTitle(lastDiscard.id, lastDiscard.title, lang) : '';
  const playbackCardMeta = resolvePlaybackCardMeta({
    eventText: botPlaybackEventText,
    G,
    cardImageById,
    lastDiscard,
    lastDiscardImage,
  });
  const displayedDiscardTitle = botPlaybackCardTitle || playbackCardMeta.title || lastDiscardTitle;
  const displayedDiscardImage = (botPlaybackCardTitle || playbackCardMeta.title) ? playbackCardMeta.imageSrc : lastDiscardImage;
  const focusPrimaryLabel = lastDiscardTitle || activeArenaPlayerName;
  const focusSecondaryLabel = activeArenaRankName || rankName;
  const focusSupportingText = currentStageFocus;
  const opponentLayout = buildV3OpponentLayout(opponentIds);
  const hasLeftFlank = opponentLayout.leftIds.length > 0;
  const hasRightFlank = opponentLayout.rightIds.length > 0;

  useEffect(() => {
    if (!latestArenaRow?.id) return;
    const impactText = latestArenaRow.type === 'system'
      ? latestArenaRow.text
      : `${playerLabelById(latestArenaRow.playerID)}: ${latestArenaRow.text}`;
    setImpactPulse({
      id: latestArenaRow.id,
      label: latestArenaRow.label,
      text: impactText,
      tone: latestArenaRow.tone,
      imageSrc: lastDiscardImage,
    });
    const timeoutId = window.setTimeout(() => {
      setImpactPulse((current) => (current?.id === latestArenaRow.id ? null : current));
    }, 2400);
    return () => window.clearTimeout(timeoutId);
  }, [latestArenaRow?.id, latestArenaRow?.label, latestArenaRow?.text, latestArenaRow?.tone, latestArenaRow?.type, latestArenaRow?.playerID, playerLabelById, lastDiscardImage]);

  useEffect(() => {
    if (!botPlaybackEventText) return;
    const syntheticId = `bot-playback-${botPlaybackEventText}`;
    setImpactPulse({
      id: syntheticId,
      label: board.recentEvents,
      text: botPlaybackEventText,
      tone: 'warn',
      imageSrc: playbackCardMeta.imageSrc ?? lastDiscardImage,
    });
    const timeoutId = window.setTimeout(() => {
      setImpactPulse((current) => (current?.id === syntheticId ? null : current));
    }, 1800);
    return () => window.clearTimeout(timeoutId);
  }, [botPlaybackEventText, playbackCardMeta.imageSrc, lastDiscardImage, board.recentEvents]);

  const turnHelpItems = buildTurnHelpItems({
    stage,
    stageLabel: stageLabel(stage, t),
    canDraw,
    canPlay,
    canEndTurn,
    passButtonLabel,
    promoteReason,
    pendingSelectionLabel: pendingSelection ? (currentPendingCard ? cardTitle(currentPendingCard.id, currentPendingCard.title, lang) : pendingSelection.cardId) : board.waitingAction,
    mustDiscardOverflow,
    handOverflow,
    handCount: hand.length,
    board,
    t,
    promoteLabel: t.promote,
    lang,
    G,
    playerID: id,
    sharedRanks,
    resourceLabels,
  });
  const stageClass = stage ? `is-stage-${stage}` : 'is-stage-waiting';
  return (
    <section className={`game-ui-v1-shell ${stageClass}${compactMode ? ' is-compact' : ''}${isSpectator ? ' is-spectator' : ''}`}>
      <BoardV1Header
        title={blockPlayerTurnControls ? botPlaybackControlLabel : effectiveIsCurrentPlayer ? board.yourTurnTitle : board.gameTableTitle}
        uiVariant="v1"
        roomMeta={roomMeta}
        playerName={playerName}
        spectatorLabel={t.spectatorJoinedLabel}
        activeRoomLabel={board.activeRoom}
        joinedAsLabel={board.joinedAs}
        spectatorModeLabel={board.spectatorMode}
        stageFocus={currentStageFocus}
        seatConnectionMissing={seatConnectionMissing}
        seatConnectionMissingText={t.seatConnectionMissing}
        onLeaveRoom={onLeaveRoom}
        leaveRoomLabel={board.leaveRoom}
        requestEndGameLabel={board.requestEndGame}
        onRequestEndGame={handleRequestEndGameVote}
        requestEndGameDisabled={isSpectator || seatConnectionMissing || typeof moves.requestEndGameVote !== 'function' || endGameVoteActive || Boolean(ctx?.gameover)}
        sideContent={hasBotPlayers && !isSpectator ? (
          <>
              <div className="game-ui-v1-header-tools-head">
                <span className="game-ui-v1-header-tools-label">{board.botControlsTitle}</span>
                {botThinkingPlayerName ? (
                  <span className="game-ui-v1-subtle game-ui-v1-bot-thinking">
                    {board.botThinkingPrefix}: <strong>{botThinkingPlayerName}</strong>
                  </span>
                ) : null}
              </div>
            <div className="game-ui-v1-header-tools-row">
              <button type="button" onClick={() => setBotAutoplayEnabled((prev) => !prev)}>
                {botAutoplayEnabled ? board.botAutoplayPause : board.botAutoplayResume}
              </button>
              <div className="game-ui-v1-bot-speed-slider">
                <span className="game-ui-v1-bot-speed-label">{board.botSpeedLabel}</span>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={botPlaybackSpeed}
                  onChange={(e) => setBotPlaybackSpeed(Number(e.target.value) as BotPlaybackSpeedLevel)}
                />
                <strong>{botPlaybackSpeed}</strong>
                <small>{botSpeedHint(lang, botPlaybackSpeed)}</small>
              </div>
            </div>
          </>
        ) : undefined}
      />

      <BoardV1EndVoteModal
        open={endGameVoteActive}
        title={board.endVoteTitle}
        prompt={`${requestedByLabel} ${board.endVotePromptSuffix}`}
        waitingLabel={board.endVoteWaiting}
        declineInfo={board.endVoteDeclinedInfo}
        hasVotedAgree={hasVotedAgree}
        agreeLabel={board.agreeEndGame}
        declineLabel={board.declineEndGame}
        onAgree={() => handleRespondEndGameVote(true)}
        onDecline={() => handleRespondEndGameVote(false)}
      />

      {isSpectator ? (
        <section className="game-ui-v1-spectator-strip">
          <p className="game-ui-v1-subtle">{board.spectatorCompactHint}</p>
          <div className="game-ui-v1-tab-row">
            <button type="button" className={spectatorView === 'live' ? 'is-active' : ''} onClick={() => setSpectatorView('live')}>
              {board.spectatorLiveView}
            </button>
            <button type="button" className={spectatorView === 'summary' ? 'is-active' : ''} onClick={() => setSpectatorView('summary')}>
              {board.spectatorSummaryView}
            </button>
          </div>
        </section>
      ) : null}

      <div className="game-ui-v1-grid">
        <div className="game-ui-v1-main">
          {isSpectator && spectatorView === 'summary' ? (
            <section className="game-ui-v1-panel game-ui-v1-command">
              <BoardV1StandingsSummary
                title={board.finalStandingsTitle}
                summaryLabels={{
                  player: board.finalStandingsPlayer,
                  rank: board.finalStandingsRank,
                  resources: board.finalStandingsResources,
                  turns: board.finalStandingsTurns,
                  gainLoss: board.finalStandingsGainLoss,
                  actions: board.finalStandingsActions,
                }}
                playerSummaries={gameoverPlayerSummaries}
              />
            </section>
          ) : null}
          {draftPending && !myDraftDone ? (
            <section className="game-ui-v1-panel game-ui-v1-command">
              <div className="game-ui-v1-command-top">
                <div>
                  <p className="game-ui-v1-kicker">{board.standardPlusKicker}</p>
                  <h3>{board.legendarySelectionTitle}</h3>
                  <p className="game-ui-v1-subtle">
                    {board.legendarySelectionHint}
                  </p>
                </div>
              </div>
              <div className="hand game-ui-v1-hand-grid">
                {legendaryDraftPool.map((card) => {
                  const selected = draftSelection.includes(card.id);
                  return (
                    <GameCardTile
                      key={`board-draft-${card.id}`}
                      card={card}
                      resolvedImage={cardImageById[card.id]}
                      lang={lang}
                      categoryText={t.legendaryDeckLabel}
                      openPreviewKey={openPreviewKey}
                      previewKey={`board-draft-preview-${card.id}`}
                      onTogglePreview={togglePreview}
                      onClosePreview={() => setOpenPreviewKey(null)}
                      actionLabel={selected ? board.remove : board.select}
                      onAction={() => handleDraftToggle(card.id)}
                      actionDisabled={false}
                      effectLabel={effectLabel}
                    />
                  );
                })}
              </div>
              <div className="game-ui-v1-selection-actions">
                <p className="game-ui-v1-subtle">{board.selected}: {draftSelection.length}/5</p>
                <button
                  type="button"
                  disabled={draftSelection.length !== 5 || typeof moves.selectLegendaryLoadout !== 'function'}
                  onClick={() => moves.selectLegendaryLoadout?.(draftSelection)}
                >
                  {board.confirmSelection}
                </button>
              </div>
            </section>
          ) : null}
          {!isSpectator ? (
          <section className="game-ui-v1-panel game-ui-v1-command">
            <div className="game-ui-v1-command-top">
              <div className="game-ui-v1-command-lead">
                <p className="game-ui-v1-kicker">{board.commandCenter}</p>
                <h3>{blockPlayerTurnControls ? botPlaybackControlLabel : playerLabelById(ctx.currentPlayer)}</h3>
                <p className="game-ui-v1-subtle">{t.turnStage}: {stageLabel(stage, t)} В· {t.yourRank}: {rankName}</p>
                <div className="game-ui-v1-command-hero">
                  {rankImage ? (
                    <div className="game-ui-v1-command-rank-art">
                      <img src={rankImage} alt={rankName} style={{ maxHeight: 60, borderRadius: 10 }} />
                    </div>
                  ) : null}
                  <div className="game-ui-v1-command-hero-meta">
                    <strong>{rankName}</strong>
                    <span>{blockPlayerTurnControls ? board.botControlsTitle : effectiveIsCurrentPlayer ? board.yourTurnTitle : board.gameTableTitle}</span>
                  </div>
                </div>
              </div>
              <div className="game-ui-v1-command-buttons">
                <button type="button" onClick={() => {
                  handleDraw();
                }} disabled={!canDraw || blockPlayerTurnControls}>{t.draw}</button>
                <button type="button" onClick={() => {
                  handlePromote(promoteReason);
                }} disabled={!canPlay || blockPlayerTurnControls}>{t.promote}</button>
                <button
                  type="button"
                  onClick={() => { handlePass(shouldShowSkipTurnLabel ? moves.pass : moves.endTurn); }}
                  disabled={!canEndTurn || blockPlayerTurnControls}
                >
                  {blockPlayerTurnControls ? botPlaybackControlLabel : passButtonLabel}
                </button>
              </div>
            </div>
            <div className="game-ui-v1-command-body">
              <div className="game-ui-v1-resources-grid">
                {RESOURCE_ORDER.map((key) => (
                  <div
                    key={key}
                    className={`game-ui-v1-resource-card${highlightedResources.has(key) ? ' is-highlighted' : ''}${deficitByResource[key] ? ' is-deficit' : ''}`}
                  >
                    <span className="game-ui-v1-resource-name">{resourceLabels[key]}</span>
                    <strong>{resources[key] ?? 0}</strong>
                    {deficitByResource[key] ? <small>{board.deficit}: {deficitByResource[key]}</small> : null}
                  </div>
                ))}
              </div>
              <div className="game-ui-v1-command-rank-progress">
                <h4>{board.nextRankProgress}</h4>
                {nextRankMeta?.nextRank ? (
                  <>
                    <div className="game-ui-v1-rank-head">
                      <strong>{nextRankMeta.nextRank.name}</strong>
                      <span className={`game-ui-v1-chip${nextRankMeta.seatBlocked ? ' is-warn' : ' is-active'}`}>
                        {board.occupiedSeats}: {nextRankMeta.occupied}/{nextRankMeta.seatLimit}
                      </span>
                    </div>
                    <div className="game-ui-v1-progress-list">
                      {RESOURCE_ORDER.map((key) => {
                        const need = nextRankMeta.nextRank?.requirement?.[key] ?? 0;
                        if (!need) return null;
                        const have = resources[key] ?? 0;
                        const pct = Math.max(0, Math.min(100, Math.round((have / need) * 100)));
                        return (
                          <div key={`req-inline-${key}`} className="game-ui-v1-progress-row">
                            <div className="game-ui-v1-progress-label"><span>{resourceLabels[key]}</span><span>{have}/{need}</span></div>
                            <div className="game-ui-v1-progress-bar"><i style={{ width: `${pct}%` }} /></div>
                          </div>
                        );
                      })}
                    </div>
                    {promoteReason ? (
                      <p className="game-ui-v1-subtle"><strong>{board.blockedReason}:</strong> {promoteReason}</p>
                    ) : (
                      <p className="game-ui-v1-subtle">
                        {buildNextRankHint({ G, playerID: id, sharedRanks, resources, resourceLabels, promoteLabel: t.promote, lang })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="game-ui-v1-subtle">{board.noNextRank}</p>
                )}
              </div>
            </div>
            <BoardV1NoticeStack notices={notices} dismissNotice={dismissNotice} />
            <BoardV1SelectionPanel
              pendingSelection={pendingSelection}
              activeSelectionNeedsTarget={activeSelectionNeedsTarget}
              activeSelectionNeedsReplacement={activeSelectionNeedsReplacement}
              activeSelectionNeedsResource={activeSelectionNeedsResource}
              currentPendingCard={currentPendingCard}
              selectedTargetId={selectedTargetId}
              setSelectedTargetId={setSelectedTargetId}
              opponentIds={opponentIds}
              playerLabelById={playerLabelById}
              board={board}
              lang={lang}
              replacementTargetIds={replacementTargetIds}
              G={G}
              replacementSelectionsByTarget={replacementSelectionsByTarget}
              replacementActiveTargetId={replacementActiveTargetId}
              setActiveReplacementTargetId={setActiveReplacementTargetId}
              replacementActiveSelected={replacementActiveSelected}
              replacementActiveSlots={replacementActiveSlots}
              replacementActiveTargetResources={replacementActiveTargetResources}
              resourceLabels={resourceLabels}
              appendReplacementResource={appendReplacementResource}
              undoReplacementResource={undoReplacementResource}
              selectedResource={selectedResource}
              setSelectedResource={setSelectedResource}
              resources={resources}
              confirmPendingSelection={confirmPendingSelection}
              clearPendingSelection={clearPendingSelection}
              pickTargetNotice={pickTargetNotice}
            />
          </section>
          ) : null}

          {(!isSpectator || spectatorView === 'live') ? (
          <section className="game-ui-v1-panel game-ui-v1-battlefield">
            <h3>{board.tableState}</h3>
            <div className="game-ui-v1-board-surface" aria-hidden="true">
              <span className="game-ui-v1-board-ring game-ui-v1-board-ring-pressure" />
              <span className="game-ui-v1-board-ring game-ui-v1-board-ring-altar" />
              <span className="game-ui-v1-board-ring game-ui-v1-board-ring-tactical" />
              <span className="game-ui-v1-board-glow game-ui-v1-board-glow-left" />
              <span className="game-ui-v1-board-glow game-ui-v1-board-glow-right" />
            </div>
            <div className={`game-ui-v1-battlefield-shell is-opponents-${opponentIds.length}`}>
              <div className="game-ui-v1-pressure-lane">
                <div className="game-ui-v1-zone-head game-ui-v1-opponent-summary">
                  <span className="game-ui-v1-stage-label">{board.playersOverview}</span>
                  <strong>{opponentIds.length}</strong>
                </div>
                <div className="game-ui-v1-opponent-top">
                  <BoardV1PlayerOverview
                    opponentIds={opponentLayout.topIds}
                    G={G}
                    sharedRanks={sharedRanks}
                    ctxCurrentPlayer={ctx.currentPlayer}
                    lang={lang}
                    selectedTargetId={selectedTargetId}
                    activeSelectionNeedsTarget={activeSelectionNeedsTarget}
                    setSelectedTargetId={setSelectedTargetId}
                    postTargetPick={(pid) => postNotice('info', `${board.pickTarget}: ${playerLabelById(pid)}`)}
                    playerLabelById={playerLabelById}
                    resourceLabels={resourceLabels}
                    board={board}
                    getNextRankSeatMeta={getNextRankSeatMeta}
                    layout="lane"
                  />
                </div>
              </div>
              <div className={`game-ui-v1-center-row${hasLeftFlank ? ' has-left-flank' : ''}${hasRightFlank ? ' has-right-flank' : ''}`}>
                {hasLeftFlank ? (
                  <aside className="game-ui-v1-opponent-flank is-left">
                    <BoardV1PlayerOverview
                      opponentIds={opponentLayout.leftIds}
                      G={G}
                      sharedRanks={sharedRanks}
                      ctxCurrentPlayer={ctx.currentPlayer}
                      lang={lang}
                      selectedTargetId={selectedTargetId}
                      activeSelectionNeedsTarget={activeSelectionNeedsTarget}
                      setSelectedTargetId={setSelectedTargetId}
                      postTargetPick={(pid) => postNotice('info', `${board.pickTarget}: ${playerLabelById(pid)}`)}
                      playerLabelById={playerLabelById}
                      resourceLabels={resourceLabels}
                      board={board}
                      getNextRankSeatMeta={getNextRankSeatMeta}
                      layout="lane"
                    />
                  </aside>
                ) : null}
                <div className="game-ui-v1-altar-lane">
                  {impactPulse ? (
                    <div className={`game-ui-v1-impact-pulse is-${impactPulse.tone}`} aria-live="polite">
                      <div className="game-ui-v1-impact-beam" aria-hidden="true" />
                      {impactPulse.imageSrc ? (
                        <div className="game-ui-v1-impact-card">
                          <img src={impactPulse.imageSrc} alt={displayedDiscardTitle || focusPrimaryLabel} />
                        </div>
                      ) : null}
                      <div className="game-ui-v1-impact-copy">
                        <span className="game-ui-v1-stage-label">{impactPulse.label}</span>
                        <strong>{focusPrimaryLabel}</strong>
                        <p>{impactPulse.text}</p>
                      </div>
                    </div>
                  ) : null}
                  <div className="game-ui-v1-altar-focus-shell">
                    <div className="game-ui-v1-table">
                      <article className="game-ui-v1-zone game-ui-v1-zone-deck">
                        <div className="game-ui-v1-zone-head">
                          <span className="game-ui-v1-stage-label">{t.drawPile}</span>
                          <strong>{G.deck?.length ?? 0}</strong>
                        </div>
                        <div className="game-ui-v1-zone-card">
                          <PilePreview
                            imageSrc={deckBackImage}
                            alt={t.drawPile}
                            previewKey="v1-pile-deck"
                            openPreviewKey={openPreviewKey}
                            onTogglePreview={togglePreview}
                            onClosePreview={() => setOpenPreviewKey(null)}
                            variant="v1"
                            fallback={<div className="pile-back-fallback">JOJ</div>}
                          />
                        </div>
                        <p className="game-ui-v1-zone-meta">{board.stageFocusDraw}</p>
                      </article>
                      <article className="game-ui-v1-zone game-ui-v1-zone-focus">
                        <div className="game-ui-v1-zone-head">
                          <span className="game-ui-v1-stage-label">{selectedTargetId ? board.pickTarget : board.tableState}</span>
                          <strong>{activeArenaPlayerName}</strong>
                        </div>
                        <div className="game-ui-v1-focus-body">
                          <div className="game-ui-v1-focus-card">
                            {displayedDiscardTitle ? (
                              <PilePreview
                                imageSrc={displayedDiscardImage}
                                alt={displayedDiscardTitle}
                                previewKey={`v1-focus-${botPlaybackCardTitle || lastDiscard?.id || displayedDiscardTitle}`}
                                openPreviewKey={openPreviewKey}
                                onTogglePreview={togglePreview}
                                onClosePreview={() => setOpenPreviewKey(null)}
                                variant="v1"
                              />
                            ) : (
                              <div className="game-ui-v1-focus-empty">{board.waitingAction}</div>
                            )}
                          </div>
                          <div className="game-ui-v1-focus-meta">
                            <strong>{displayedDiscardTitle || focusPrimaryLabel}</strong>
                            <span>{focusSecondaryLabel}</span>
                            <div className={`game-ui-v1-focus-tone${latestArenaRow ? ` is-${latestArenaRow.tone}` : ''}`}>
                              {latestArenaRow?.label ?? board.waitingAction}
                            </div>
                            <p className="game-ui-v1-zone-meta">
                              {focusSupportingText}
                            </p>
                            <div className="game-ui-v1-focus-resources">
                              {RESOURCE_ORDER.map((key) => (
                                <span key={`focus-resource-${key}`}>
                                  {resourceLabels[key]}: {activeArenaResources?.[key] ?? 0}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </article>
                      <article className="game-ui-v1-zone game-ui-v1-zone-discard">
                        <div className="game-ui-v1-zone-head">
                          <span className="game-ui-v1-stage-label">{t.discardPile}</span>
                          <strong>{G.discard?.length ?? 0}</strong>
                        </div>
                        <div className="game-ui-v1-zone-card">
                          {displayedDiscardTitle ? (
                            <PilePreview
                              imageSrc={displayedDiscardImage}
                              alt={displayedDiscardTitle}
                              previewKey={`v1-discard-${botPlaybackCardTitle || lastDiscard?.id || displayedDiscardTitle}`}
                              openPreviewKey={openPreviewKey}
                              onTogglePreview={togglePreview}
                              onClosePreview={() => setOpenPreviewKey(null)}
                              variant="v1"
                            />
                          ) : <div className="pile-empty">{t.noCardsInDiscard}</div>}
                        </div>
                        <p className="game-ui-v1-zone-meta">{displayedDiscardTitle || t.noCardsInDiscard}</p>
                      </article>
                    </div>
                  </div>
                </div>
                {hasRightFlank ? (
                  <aside className="game-ui-v1-opponent-flank is-right">
                    <BoardV1PlayerOverview
                      opponentIds={opponentLayout.rightIds}
                      G={G}
                      sharedRanks={sharedRanks}
                      ctxCurrentPlayer={ctx.currentPlayer}
                      lang={lang}
                      selectedTargetId={selectedTargetId}
                      activeSelectionNeedsTarget={activeSelectionNeedsTarget}
                      setSelectedTargetId={setSelectedTargetId}
                      postTargetPick={(pid) => postNotice('info', `${board.pickTarget}: ${playerLabelById(pid)}`)}
                      playerLabelById={playerLabelById}
                      resourceLabels={resourceLabels}
                      board={board}
                      getNextRankSeatMeta={getNextRankSeatMeta}
                      layout="lane"
                    />
                  </aside>
                ) : null}
            </div>
            </div>
          </section>
          ) : null}

          {!isSpectator ? (
          <section className="game-ui-v1-panel game-ui-v1-player-dock">
            <div className="game-ui-v1-player-dock-main game-ui-v1-hand-frame">
              <div className="game-ui-v1-player-station" aria-hidden="true">
                <span className="game-ui-v1-player-station-edge" />
                <span className="game-ui-v1-player-station-glow" />
              </div>
              <div className="game-ui-v1-hand-rail">
                <div className="game-ui-v1-hand-rail-chip">
                  <span className="game-ui-v1-stage-label">{t.turnStage}</span>
                  <strong>{stageLabel(stage, t)}</strong>
                </div>
                <div className="game-ui-v1-hand-rail-chip">
                  <span className="game-ui-v1-stage-label">{t.yourHand}</span>
                  <strong>{hand.length}/8</strong>
                </div>
                <div className={`game-ui-v1-hand-rail-chip${mustDiscardOverflow ? ' is-warn' : ''}`}>
                  <span className="game-ui-v1-stage-label">{board.play}</span>
                  <strong>{canPlayHandCard ? board.canPlayNow : board.actionUnavailable}</strong>
                </div>
              </div>
              <div className="game-ui-v1-hand-head">
                <div>
                  <h3>{t.yourHand} ({hand.length}/8)</h3>
                  {mustDiscardOverflow ? (
                    <p className="game-ui-v1-subtle is-warn">{board.handOverflowWarning.replace('{count}', String(handOverflow))}</p>
                  ) : null}
                </div>
                <div className="game-ui-v1-hand-controls">
                  <label>
                    <span>{board.handFilter}</span>
                    <select value={handFilter} onChange={(e) => setHandFilter(e.target.value as HandFilter)}>
                      <option value="all">{board.filterAll}</option>
                      <option value="playable">{board.filterPlayable}</option>
                      {['LYAP', 'SCANDAL', 'SUPPORT', 'COMMAND', 'VVNZ'].map((category) => (
                        <option key={`filter-${category}`} value={category}>{categoryLabel(category, lang)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{board.handSort}</span>
                    <select value={handSort} onChange={(e) => setHandSort(e.target.value as HandSort)}>
                      <option value="default">{board.sortDefault}</option>
                      <option value="playable">{board.sortPlayable}</option>
                      <option value="category">{board.sortCategory}</option>
                      <option value="title">{board.sortTitle}</option>
                    </select>
                  </label>
                </div>
              </div>
              <BoardV1HandSection
                title={`${t.yourHand} (${hand.length}/8)`}
                cards={handCardsView.map(({ card }) => card)}
                cardImageById={cardImageById}
                lang={lang}
                openPreviewKey={openPreviewKey}
                togglePreview={togglePreview}
                closePreview={() => setOpenPreviewKey(null)}
                categoryText={(card) => categoryLabel(card.category, lang)}
                actionLabel={board.play}
                onAction={(card) => handleHandCardAction(card, requestPlayHandCard)}
                actionDisabled={(card) => !(handCardsView.find((row) => row.card.id === card.id)?.actionState.allowed ?? false)}
                effectLabel={effectLabel}
                badges={(card) => handCardsView.find((row) => row.card.id === card.id)?.badges}
                actionTitle={(card) => handCardsView.find((row) => row.card.id === card.id)?.actionState.reason ?? board.play}
                extraAction={(card) => {
                  const canDiscardThisCard = mustDiscardOverflow && card.category !== 'LYAP' && card.category !== 'SCANDAL';
                  return canDiscardThisCard ? {
                    label: board.discard,
                    onClick: () => moves.discardFromHand?.(card.id),
                    disabled: typeof moves.discardFromHand !== 'function',
                    className: 'game-card-inline-discard',
                  } : undefined;
                }}
              />
            </div>
            <aside className="game-ui-v1-player-dock-side">
              {!isSimplifiedMode ? (
                <section className="game-ui-v1-panel game-ui-v1-legendary-frame">
                  <BoardV1HandSection
                    title={`${t.legendaryHand} (${legendaryHand.length})`}
                    subtitle={t.legendaryHandHint}
                    cards={legendaryHand}
                    cardImageById={cardImageById}
                    lang={lang}
                    openPreviewKey={openPreviewKey}
                    togglePreview={togglePreview}
                    closePreview={() => setOpenPreviewKey(null)}
                    categoryText={() => t.legendaryDeckLabel}
                    actionLabel={board.playLegendary}
                    onAction={(card) => handleLegendaryCardAction(card, requestPlayLegendaryCard)}
                    actionDisabled={() => typeof moves.playLegendaryCard !== 'function'}
                    effectLabel={effectLabel}
                    badges={(card) => [
                      ...(card.id === 'legendary-10' ? [board.requiresTarget] : []),
                      ...((card.id === 'legendary-09' || card.id === 'legendary-06') ? [board.requiresResource] : []),
                    ]}
                  />
                </section>
              ) : null}
            </aside>
          </section>
          ) : null}

          {ctx.gameover ? (
            <>
              <p className="gameover">{t.winner}: {playerLabelById(String((ctx.gameover as { winner?: string }).winner ?? ''))}</p>
              <BoardV1GameoverModal
                open={!gameoverModalClosed}
                ariaLabel={board.gameStatsAria}
                title={board.gameStatsTitle}
                winnerLabel={board.winnerLabel}
                winnerName={playerLabelById(winnerPlayerID)}
                winnerRankName={winnerRankName}
                autoEndedLabel={gameoverMeta?.endReason === 'stalled-no-cards' ? board.gameAutoEndedSkip : undefined}
                agreedEndLabel={gameoverMeta?.endReason === 'agreed-end' ? board.gameEndedByAgreement : undefined}
                stats={{
                  totalTurns: G.gameStats?.turnsCompleted ?? 0,
                  resourcesGained: G.gameStats?.resourcesGainedTotal ?? 0,
                  resourcesLost: G.gameStats?.resourcesLostTotal ?? 0,
                  lyapsPlayed: G.gameStats?.lyapsPlayedOnOthers ?? 0,
                  scandalsPlayed: G.gameStats?.scandalsPlayedOnOthers ?? 0,
                }}
                statsLabels={{
                  totalTurns: board.statsTotalTurns,
                  resourcesGained: board.statsResourcesGained,
                  resourcesLost: board.statsResourcesLost,
                  lyapsPlayed: board.statsLyapsPlayedOnOthers,
                  scandalsPlayed: board.statsScandalsPlayedOnOthers,
                }}
                summaryTitle={board.finalStandingsTitle}
                summaryLabels={{
                  player: board.finalStandingsPlayer,
                  rank: board.finalStandingsRank,
                  resources: board.finalStandingsResources,
                  turns: board.finalStandingsTurns,
                  gainLoss: board.finalStandingsGainLoss,
                  actions: board.finalStandingsActions,
                }}
                playerSummaries={gameoverPlayerSummaries}
                closeLabel={t.close}
                leaveRoomLabel={board.leaveRoom}
                onLeaveRoom={onLeaveRoom}
                onClose={() => setGameoverModalClosed(true)}
              />
            </>
          ) : null}
        </div>

          <BoardV1SidePanel
          sidePanelTab={sidePanelTab}
          setSidePanelTab={setSidePanelTab}
          board={board}
          latestEvents={latestEvents}
          t={t}
          playerLabelById={playerLabelById}
          lang={lang}
          G={G}
          chatInput={chatInput}
          setChatInput={setChatInput}
          sendChatMessage={sendChatMessage}
          chatLogRef={chatLogRef}
          eventsTitle={isSpectator ? board.spectatorTimelineTitle : board.recentEvents}
          spectatorMode={isSpectator}
          helpTitle={board.helpPanelTitle}
          helpItems={turnHelpItems}
        />
      </div>

      {!isSpectator ? (
      <div className="game-ui-v1-mobile-bar" aria-label={board.mobileActions}>
        <button type="button" onClick={handleDraw} disabled={!canDraw || blockPlayerTurnControls}>{t.draw}</button>
        <button type="button" onClick={() => handlePromote(promoteReason)} disabled={!canPlay || Boolean(promoteReason) || blockPlayerTurnControls}>{t.promote}</button>
        <button type="button" onClick={() => handlePass(shouldShowSkipTurnLabel ? moves.pass : moves.endTurn)} disabled={!canEndTurn || blockPlayerTurnControls}>
          {blockPlayerTurnControls ? botPlaybackControlLabel : passButtonLabel}
        </button>
      </div>
      ) : null}
    </section>
  );
};



