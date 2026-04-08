import { useState } from 'react';
import type { CardDefinition, ResourceKey } from '../game/types';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';
import { buildTurnHelpItems, getBoardPromoteReason } from './board/boardViewHelpers';
import { buildNextRankHint } from './board/rankHints';
import { buildBoardV2ActionState } from './board/boardV2ActionState';
import { GameCardTile, PilePreview } from './board/components';
import { BOARD_RESOURCE_ICONS, BOARD_RESOURCE_IMAGE_PATHS, BOARD_RESOURCE_ORDER } from './board/resourceConstants';
import { V2HandSection, V2Header, V2NoticeStack, V2SelectionPanel, V2SidePanel } from './board/v2Panels';
import { V2EndVoteModal, V2GameoverModal, V2StandingsSummary } from './board/v2ShellSections';
import { V2BattlefieldSection, V2BottomBar, V2OpponentsArea, V2PlayerDockSection } from './board/v2Sections';
import { useBoardDerivedState } from './board/useBoardDerivedState';
import { useBotPlaybackQueue, type BotPlaybackSpeedLevel } from './board/useBotPlaybackQueue';
import { usePendingSelection } from './board/usePendingSelection';
import { useBoardStageState } from './board/useBoardStageState';
import { useBoardV2Interactions } from './board/useBoardV2Interactions';
import { buildBoardV2ViewModel, toInitials } from './board/useBoardV2ViewModel';
import { useBoardSync } from './board/useBoardSync';
import { useBoardUiController } from './board/useBoardUiController';
import type { LocalizedBoardProps } from './board/types';
import { copyText } from './app/share';

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

export const GameBoardV2 = ({
  G: incomingG,
  ctx: incomingCtx,
  moves,
  playerID,
  lang = 'uk',
  uiTheme = 'v2',
  playerName = '',
  knownPlayerNames = {},
  sharedRanks = [],
  rankTrackCards = [],
  cardImageById = {},
  resourceImagePaths = BOARD_RESOURCE_IMAGE_PATHS,
  roomMeta,
  inviteText,
  shareLink,
  onLeaveRoom,
  onStateChange,
}: LocalizedBoardProps) => {
  const t = text(lang);
  const board = t.board;
  const isSpectator = !playerID;
  const [spectatorView, setSpectatorView] = useState<'live' | 'summary'>('live');
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
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
  const showTopCommandPanel = !isSpectator && (Boolean(pendingSelection) || notices.length > 0);
  const requestedByLabel = endGameVote?.requestedBy ? playerLabelById(endGameVote.requestedBy) : '';
  const hasVotedAgree = Boolean(endGameVote?.votes?.[id]);
  const {
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

  const promoteReason = getBoardPromoteReason({ G, playerID: id, sharedRanks, resourceLabels });
  const {
    botPlaybackControlLabel,
    blockPlayerTurnControls,
    effectiveIsCurrentPlayer,
    currentStageFocus,
    footerActionLabel,
    primaryActionDisabled,
    primaryActionLabel,
    selectedPendingCardId,
    visibleHandSelectedId,
    selectedPlayableHandCard,
  } = buildBoardV2ActionState({
    isSpectator,
    isBotPlaybackActive,
    botThinkingPlayerName,
    botPlaybackEventText,
    isCurrentPlayer,
    stage,
    board,
    passButtonLabel,
    pendingSelection,
    activeSelectionNeedsTarget,
    activeSelectionNeedsResource,
    selectedTargetId,
    selectedResource,
    canDraw,
    canPlay,
    promoteReason,
    hand,
    handCardsView,
    selectedHandCardId,
    t,
  });
  const {
    gameoverPlayerSummaries,
    activeArenaPlayerName,
    activeArenaResources,
    activeArenaRankName,
    actualDiscardTitle,
    actualDiscardImage,
    displayedDiscardTitle,
    displayedDiscardImage,
    focusPrimaryLabel,
    focusSecondaryLabel,
    focusSupportingText,
    currentTurnPlayerLabel,
    currentTurnPortraitImage,
    leftOpponentItems,
    rightOpponentItems,
    footerResourceItems,
  } = buildBoardV2ViewModel({
    G,
    ctx,
    id,
    lang,
    sharedRanks,
    resourceLabels,
    resources,
    selectedResource,
    playerLabelById,
    winnerPlayerID,
    opponentIds,
    selectedTargetId,
    activeSelectionNeedsTarget,
    lastDiscard,
    lastDiscardImage,
    botPlaybackCardTitle,
    botPlaybackEventText,
    cardImageById,
    rankName,
    rankImage,
    currentStageFocus,
    latestEvents,
    sharedResourceOrder: BOARD_RESOURCE_ORDER,
    sharedResourceIcons: BOARD_RESOURCE_ICONS,
    sharedResourceImagePaths: resourceImagePaths,
    rankTrackCards,
  });
  const { handleV2HandCardClick } = useBoardV2Interactions({
    hand,
    handCardsView,
    selectedHandCardId,
    setSelectedHandCardId,
    selectedPendingCardId,
    visibleHandSelectedId,
    selectedPlayableHandCard,
    blockPlayerTurnControls,
    pendingSelection,
    confirmPendingSelection,
    stage,
    canDraw,
    handleDraw,
    handleHandCardAction,
    requestPlayHandCard,
    canPlay,
    promoteReason,
    handlePromote,
  });

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
  const footerRankHint = buildNextRankHint({
    G,
    playerID: id,
    sharedRanks,
    resources,
    resourceLabels,
    promoteLabel: t.promote,
    lang,
  }) ?? board.helpActionReady;
  const handleFooterPrimaryAction = () => {
    if (blockPlayerTurnControls) return;
    if (pendingSelection) {
      void confirmPendingSelection();
      return;
    }
    if (stage === 'draw') {
      handleDraw();
      return;
    }
    if (selectedPlayableHandCard) {
      handleHandCardAction(selectedPlayableHandCard, requestPlayHandCard);
      return;
    }
    handlePromote(promoteReason);
  };
  const stageClass = stage ? `is-stage-${stage}` : 'is-stage-waiting';
  const internalTheme = uiTheme === 'v1' ? 'v1' : 'v2';

  return (
    <section className={`game-ui-v2-shell game-ui-layout-shell is-theme-${internalTheme} ${stageClass}${compactMode ? ' is-compact' : ''}${isSpectator ? ' is-spectator' : ''}`}>
      <V2Header
        title={blockPlayerTurnControls ? botPlaybackControlLabel : effectiveIsCurrentPlayer ? board.yourTurnTitle : board.gameTableTitle}
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
        onCopyInvite={inviteText ? () => { void copyText(inviteText); } : undefined}
        copyInviteLabel={inviteText ? t.copyInviteText : undefined}
        onCopyInviteLink={shareLink ? () => { void copyText(shareLink); } : undefined}
        copyInviteLinkLabel={shareLink ? t.copyInviteLink : undefined}
        footerContent={!isSpectator ? (
          <V2BottomBar
            resources={footerResourceItems}
            rankName={rankName}
            rankHint={footerRankHint}
            primaryActionLabel={primaryActionLabel}
            primaryActionDisabled={primaryActionDisabled}
            secondaryActionLabel={footerActionLabel}
            secondaryActionDisabled={!canEndTurn || blockPlayerTurnControls}
            onPrimaryAction={handleFooterPrimaryAction}
            onSecondaryAction={() => handlePass(shouldShowSkipTurnLabel ? moves.pass : moves.endTurn)}
          />
        ) : undefined}
        sideContent={hasBotPlayers && !isSpectator ? (
          <>
              <div className="game-ui-v2-header-tools-head">
                <span className="game-ui-v2-header-tools-label">{board.botControlsTitle}</span>
                {botThinkingPlayerName ? (
                  <span className="game-ui-v2-subtle game-ui-v2-bot-thinking">
                    {board.botThinkingPrefix}: <strong>{botThinkingPlayerName}</strong>
                  </span>
                ) : null}
              </div>
            <div className="game-ui-v2-header-tools-row">
              <button type="button" onClick={() => setBotAutoplayEnabled((prev) => !prev)}>
                {botAutoplayEnabled ? board.botAutoplayPause : board.botAutoplayResume}
              </button>
              <div className="game-ui-v2-bot-speed-slider">
                <span className="game-ui-v2-bot-speed-label">{board.botSpeedLabel}</span>
                <input
                  className="game-ui-v2-bot-speed-range"
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={botPlaybackSpeed}
                  onChange={(e) => setBotPlaybackSpeed(Number(e.target.value) as BotPlaybackSpeedLevel)}
                />
                <strong className="game-ui-v2-bot-speed-value">{botPlaybackSpeed}</strong>
                <small>{botSpeedHint(lang, botPlaybackSpeed)}</small>
              </div>
            </div>
          </>
        ) : undefined}
      />

      <V2EndVoteModal
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
        <section className="game-ui-v2-spectator-strip game-ui-layout-spectator-strip">
          <p className="game-ui-v2-subtle">{board.spectatorCompactHint}</p>
          <div className="game-ui-v2-tab-row game-ui-layout-tab-row">
            <button type="button" className={spectatorView === 'live' ? 'is-active' : ''} onClick={() => setSpectatorView('live')}>
              {board.spectatorLiveView}
            </button>
            <button type="button" className={spectatorView === 'summary' ? 'is-active' : ''} onClick={() => setSpectatorView('summary')}>
              {board.spectatorSummaryView}
            </button>
          </div>
        </section>
      ) : null}

      {showTopCommandPanel ? (
      <section className="game-ui-v2-panel game-ui-layout-panel game-ui-v2-command game-ui-layout-command game-ui-v2-command-panel game-ui-layout-command-panel game-ui-v2-command-panel-top game-ui-layout-command-panel-top">
        <div className="game-ui-v2-command-support game-ui-layout-command-support">
          <V2NoticeStack notices={notices} dismissNotice={dismissNotice} />
        </div>
        <V2SelectionPanel
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

      <div className="game-ui-v2-grid game-ui-layout-grid">
        <div className="game-ui-v2-main game-ui-layout-main">
          {isSpectator && spectatorView === 'summary' ? (
            <section className="game-ui-v2-panel game-ui-layout-panel game-ui-v2-command game-ui-layout-command">
              <V2StandingsSummary
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
            <section className="game-ui-v2-panel game-ui-layout-panel game-ui-v2-command game-ui-layout-command">
              <div className="game-ui-v2-command-top game-ui-layout-command-top">
                <div>
                  <p className="game-ui-v2-kicker">{board.standardPlusKicker}</p>
                  <h3>{board.legendarySelectionTitle}</h3>
                  <p className="game-ui-v2-subtle">
                    {board.legendarySelectionHint}
                  </p>
                </div>
              </div>
              <div className="hand game-ui-v2-hand-grid game-ui-layout-hand-grid">
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
              <div className="game-ui-v2-selection-actions game-ui-layout-selection-actions">
                <p className="game-ui-v2-subtle">{board.selected}: {draftSelection.length}/5</p>
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
          {(!isSpectator || spectatorView === 'live') ? (
          <V2BattlefieldSection
            title={board.tableState}
            opponentCount={opponentIds.length}
            opponents={(
              <V2OpponentsArea
                leftItems={leftOpponentItems}
                rightItems={rightOpponentItems}
                handLabel={t.yourHand}
                centerPortraitImage={currentTurnPortraitImage}
                centerInitials={toInitials(currentTurnPlayerLabel)}
                centerKicker={currentStageFocus || board.commandCenter}
                centerTitle={currentTurnPlayerLabel}
                centerSubtitle={activeArenaRankName || rankName}
                centerResources={BOARD_RESOURCE_ORDER.map((key) => ({
                  key,
                  icon: BOARD_RESOURCE_ICONS[key],
                  imageSrc: resourceImagePaths[key],
                  label: resourceLabels[key],
                  value: activeArenaResources?.[key] ?? 0,
                }))}
                onOpponentClick={(pid) => {
                  if (!activeSelectionNeedsTarget) return;
                  setSelectedTargetId(pid);
                  postNotice('info', `${board.pickTarget}: ${playerLabelById(pid)}`);
                }}
              />
            )}
            boardContent={(
              <>
                <div className="game-ui-v2-altar-focus-shell game-ui-layout-altar-focus-shell">
                  <div className="game-ui-v2-table game-ui-layout-table">
                    <article className="game-ui-v2-zone game-ui-layout-zone game-ui-v2-zone-deck game-ui-layout-zone-deck">
                      <div className="game-ui-v2-zone-head game-ui-layout-zone-head">
                        <span className="game-ui-v2-stage-label">{t.drawPile}</span>
                        <strong>{G.deck?.length ?? 0}</strong>
                      </div>
                      <div className="game-ui-v2-zone-card game-ui-layout-zone-card">
                        <PilePreview
                          imageSrc={deckBackImage}
                          alt={t.drawPile}
                          previewKey="v2-pile-deck"
                          openPreviewKey={openPreviewKey}
                          onTogglePreview={togglePreview}
                          onClosePreview={() => setOpenPreviewKey(null)}
                          variant="v1"
                          fallback={<div className="pile-back-fallback">JOJ</div>}
                        />
                      </div>
                      <p className="game-ui-v2-zone-meta">{board.stageFocusDraw}</p>
                    </article>
                    <article className="game-ui-v2-zone game-ui-layout-zone game-ui-v2-zone-focus game-ui-layout-zone-focus">
                      <div className="game-ui-v2-zone-head game-ui-layout-zone-head">
                        <span className="game-ui-v2-stage-label">{selectedTargetId ? board.pickTarget : board.tableState}</span>
                        <strong>{activeArenaPlayerName}</strong>
                      </div>
                      <div className="game-ui-v2-focus-body game-ui-layout-focus-body">
                        <div className="game-ui-v2-focus-card game-ui-layout-focus-card">
                          {displayedDiscardTitle ? (
                            <PilePreview
                              imageSrc={displayedDiscardImage}
                              alt={displayedDiscardTitle}
                              previewKey={`v2-focus-${botPlaybackCardTitle || lastDiscard?.id || displayedDiscardTitle}`}
                              openPreviewKey={openPreviewKey}
                              onTogglePreview={togglePreview}
                              onClosePreview={() => setOpenPreviewKey(null)}
                              variant="v1"
                            />
                          ) : (
                            <div className="game-ui-v2-focus-empty">{board.waitingAction}</div>
                          )}
                        </div>
                        <div className="game-ui-v2-focus-meta game-ui-layout-focus-meta">
                          <strong>{displayedDiscardTitle || focusPrimaryLabel}</strong>
                          <span>{focusSecondaryLabel}</span>
                          <p className="game-ui-v2-zone-meta">
                            {focusSupportingText}
                          </p>
                          {promoteReason ? (
                            <p className="game-ui-v2-zone-meta">
                              <strong>{board.blockedReason}:</strong> {promoteReason}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </article>
                    <article className="game-ui-v2-zone game-ui-layout-zone game-ui-v2-zone-discard game-ui-layout-zone-discard">
                      <div className="game-ui-v2-zone-head game-ui-layout-zone-head">
                        <span className="game-ui-v2-stage-label">{t.discardPile}</span>
                        <strong>{G.discard?.length ?? 0}</strong>
                      </div>
                      <div className="game-ui-v2-zone-card game-ui-layout-zone-card">
                        {actualDiscardTitle ? (
                          <PilePreview
                            imageSrc={actualDiscardImage}
                            alt={actualDiscardTitle}
                            previewKey={`v2-discard-${lastDiscard?.id || actualDiscardTitle}`}
                            openPreviewKey={openPreviewKey}
                            onTogglePreview={togglePreview}
                            onClosePreview={() => setOpenPreviewKey(null)}
                            variant="v1"
                          />
                        ) : <div className="pile-empty">{t.noCardsInDiscard}</div>}
                      </div>
                      <p className="game-ui-v2-zone-meta">{actualDiscardTitle || t.noCardsInDiscard}</p>
                    </article>
                  </div>
                </div>
              </>
            )}
          />
          ) : null}

          {!isSpectator ? (
          <V2PlayerDockSection
            mainContent={(
              <>
                <div className="game-ui-v2-hand-rail game-ui-layout-hand-rail">
                <div className="game-ui-v2-hand-rail-chip game-ui-layout-hand-rail-chip">
                  <span className="game-ui-v2-stage-label">{t.turnStage}</span>
                  <strong>{stageLabel(stage, t)}</strong>
                </div>
                <div className="game-ui-v2-hand-rail-chip game-ui-layout-hand-rail-chip">
                  <span className="game-ui-v2-stage-label">{t.yourHand}</span>
                  <strong>{hand.length}/8</strong>
                </div>
                <div className={`game-ui-v2-hand-rail-chip game-ui-layout-hand-rail-chip${mustDiscardOverflow ? ' is-warn' : ''}`}>
                  <span className="game-ui-v2-stage-label">{board.play}</span>
                  <strong>{canPlayHandCard ? board.canPlayNow : board.actionUnavailable}</strong>
                </div>
              </div>
              <V2HandSection
                title={`${t.yourHand} (${hand.length}/8)`}
                subtitle={mustDiscardOverflow ? board.handOverflowWarning.replace('{count}', String(handOverflow)) : undefined}
                headRight={(
                  <div className="game-ui-v2-hand-controls">
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
                )}
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
                selected={(card) => visibleHandSelectedId === card.id}
                cardClickAction={handleV2HandCardClick}
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
              </>
            )}
            <section className="game-ui-v2-panel game-ui-layout-panel game-ui-v2-legendary-frame" style={{ marginTop: '16px' }}>
                <V2HandSection
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
                    ...(card.id === 'legendary-06' ? [board.requiresResource] : []),
                  ]}
                />
              </section>
            </>
            )}
            sideContent={null}
          />
          ) : null}

          {ctx.gameover ? (
            <>
              <p className="gameover">{t.winner}: {playerLabelById(String((ctx.gameover as { winner?: string }).winner ?? ''))}</p>
              <V2GameoverModal
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

          <V2SidePanel
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
      <div className="game-ui-v2-mobile-bar game-ui-layout-mobile-bar" aria-label={board.mobileActions}>
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



