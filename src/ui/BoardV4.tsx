import { useEffect, useState } from 'react';
import type { CardDefinition, ResourceKey } from '../game/types';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';
import { buildTurnHelpItems, getBoardPromoteReason } from './board/boardViewHelpers';
import { buildBoardV4ActionState } from './board/boardV4ActionState';
import { GameCardTile, PilePreview } from './board/components';
import { buildNextRankHint } from './board/rankHints';
import { BOARD_RESOURCE_ICONS, BOARD_RESOURCE_ORDER } from './board/resourceConstants';
import { V4HandSection, V4Header, V4NoticeStack, V4SelectionPanel, V4SidePanel } from './board/v4Panels';
import { V4EndVoteModal, V4GameoverModal, V4StandingsSummary } from './board/v4ShellSections';
import { V4BattlefieldSection, V4BottomBar, V4OpponentsArea, V4PlayerDockSection } from './board/v4Sections';
import { useBoardV2DerivedState } from './board/useBoardV2DerivedState';
import { useBotPlaybackQueue, type BotPlaybackSpeedLevel } from './board/useBotPlaybackQueue';
import { usePendingSelection } from './board/usePendingSelection';
import { useBoardV2StageState } from './board/useBoardV2StageState';
import { useBoardV4Interactions } from './board/useBoardV4Interactions';
import { buildBoardV4ViewModel, toInitials } from './board/useBoardV4ViewModel';
import { useBoardV2Sync } from './board/useBoardV2Sync';
import { useBoardV2UiController } from './board/useBoardV2UiController';
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

export const BoardV4 = ({
  G: incomingG,
  ctx: incomingCtx,
  moves,
  playerID,
  lang = 'uk',
  playerName = '',
  knownPlayerNames = {},
  sharedRanks = [],
  rankTrackCards = [],
  cardImageById = {},
  roomMeta,
  inviteText,
  shareLink,
  onLeaveRoom,
  onStateChange,
}: LocalizedBoardProps) => {
  const t = text(lang);
  const v2 = t.v2;
  const isSpectator = !playerID;
  const [spectatorView, setSpectatorView] = useState<'live' | 'summary'>('live');
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
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
  } = useBoardV2StageState({
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
  } = useBoardV2UiController({
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
    v2,
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
    v2,
    postNotice,
    playerLabelById,
    cardTitle,
  });

  useBoardV2Sync({
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
    v2,
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
  } = useBoardV2DerivedState({
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
    v2,
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
  const {
    botPlaybackControlLabel,
    blockPlayerTurnControls,
    effectiveIsCurrentPlayer,
    currentStageFocus,
    footerActionLabel,
    selectedPendingCardId,
    visibleHandSelectedId,
    selectedPlayableHandCard,
    primaryActionLabel,
    primaryActionDisabled,
  } = buildBoardV4ActionState({
    isSpectator,
    isBotPlaybackActive,
    botThinkingPlayerName,
    botPlaybackEventText,
    isCurrentPlayer,
    stage,
    v2,
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
    latestArenaRow,
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
  } = buildBoardV4ViewModel({
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
    rankTrackCards,
  });
  const { handleV4HandCardClick, handlePrimaryV4Action } = useBoardV4Interactions({
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
      label: v2.recentEvents,
      text: botPlaybackEventText,
      tone: 'warn',
      imageSrc: displayedDiscardImage ?? lastDiscardImage,
    });
    const timeoutId = window.setTimeout(() => {
      setImpactPulse((current) => (current?.id === syntheticId ? null : current));
    }, 1800);
    return () => window.clearTimeout(timeoutId);
  }, [botPlaybackEventText, displayedDiscardImage, lastDiscardImage, v2.recentEvents]);

  const turnHelpItems = buildTurnHelpItems({
    stage,
    stageLabel: stageLabel(stage, t),
    canDraw,
    canPlay,
    canEndTurn,
    passButtonLabel,
    promoteReason,
    pendingSelectionLabel: pendingSelection ? (currentPendingCard ? cardTitle(currentPendingCard.id, currentPendingCard.title, lang) : pendingSelection.cardId) : v2.waitingAction,
    mustDiscardOverflow,
    handOverflow,
    handCount: hand.length,
    v2,
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
    <section className={`game-ui-v4-shell ${stageClass}${compactMode ? ' is-compact' : ''}${isSpectator ? ' is-spectator' : ''}`}>
      <V4Header
        title={blockPlayerTurnControls ? botPlaybackControlLabel : effectiveIsCurrentPlayer ? v2.yourTurnTitle : v2.gameTableTitle}
        roomMeta={roomMeta}
        playerName={playerName}
        spectatorLabel={t.spectatorJoinedLabel}
        activeRoomLabel={v2.activeRoom}
        joinedAsLabel={v2.joinedAs}
        spectatorModeLabel={v2.spectatorMode}
        stageFocus={currentStageFocus}
        seatConnectionMissing={seatConnectionMissing}
        seatConnectionMissingText={t.seatConnectionMissing}
        onLeaveRoom={onLeaveRoom}
        leaveRoomLabel={v2.leaveRoom}
        requestEndGameLabel={v2.requestEndGame}
        onRequestEndGame={handleRequestEndGameVote}
        requestEndGameDisabled={isSpectator || seatConnectionMissing || typeof moves.requestEndGameVote !== 'function' || endGameVoteActive || Boolean(ctx?.gameover)}
        onCopyInvite={inviteText ? () => { void copyText(inviteText); } : undefined}
        copyInviteLabel={inviteText ? t.copyInviteText : undefined}
        onCopyInviteLink={shareLink ? () => { void copyText(shareLink); } : undefined}
        copyInviteLinkLabel={shareLink ? t.copyInviteLink : undefined}
        sideContent={hasBotPlayers && !isSpectator ? (
          <>
            <div className="game-ui-v4-header-tools-head">
              <span className="game-ui-v4-header-tools-label">{v2.botControlsTitle}</span>
              {botThinkingPlayerName ? (
                <span className="game-ui-v4-subtle game-ui-v4-bot-thinking">
                  {v2.botThinkingPrefix}: <strong>{botThinkingPlayerName}</strong>
                </span>
              ) : botPlaybackEventText ? (
                <span className="game-ui-v4-subtle game-ui-v4-bot-thinking">{botPlaybackEventText}</span>
              ) : null}
            </div>
            <div className="game-ui-v4-header-tools-row">
              <button type="button" onClick={() => setBotAutoplayEnabled((prev) => !prev)}>
                {botAutoplayEnabled ? v2.botAutoplayPause : v2.botAutoplayResume}
              </button>
              <div className="game-ui-v4-bot-speed-slider">
                <span className="game-ui-v4-bot-speed-label">{v2.botSpeedLabel}</span>
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

      <V4EndVoteModal
        open={endGameVoteActive}
        title={v2.endVoteTitle}
        prompt={`${requestedByLabel} ${v2.endVotePromptSuffix}`}
        waitingLabel={v2.endVoteWaiting}
        declineInfo={v2.endVoteDeclinedInfo}
        hasVotedAgree={hasVotedAgree}
        agreeLabel={v2.agreeEndGame}
        declineLabel={v2.declineEndGame}
        onAgree={() => handleRespondEndGameVote(true)}
        onDecline={() => handleRespondEndGameVote(false)}
      />

      {isSpectator ? (
        <section className="game-ui-v4-spectator-strip">
          <p className="game-ui-v4-subtle">{v2.spectatorCompactHint}</p>
          <div className="game-ui-v4-tab-row">
            <button type="button" className={spectatorView === 'live' ? 'is-active' : ''} onClick={() => setSpectatorView('live')}>
              {v2.spectatorLiveView}
            </button>
            <button type="button" className={spectatorView === 'summary' ? 'is-active' : ''} onClick={() => setSpectatorView('summary')}>
              {v2.spectatorSummaryView}
            </button>
          </div>
        </section>
      ) : null}

      <div className="game-ui-v4-grid">
        <div className="game-ui-v4-main">
          {!isSpectator ? (
          <section className="game-ui-v4-panel game-ui-v4-command game-ui-v4-command-panel game-ui-v4-command-panel-top">
            <div className="game-ui-v4-command-support">
              <div className="game-ui-v4-command-summary">
                <p className="game-ui-v4-kicker">{v2.commandCenter}</p>
                <h3>{blockPlayerTurnControls ? botPlaybackControlLabel : playerLabelById(ctx.currentPlayer)}</h3>
                <p className="game-ui-v4-subtle">{t.turnStage}: {stageLabel(stage, t)} · {t.yourRank}: {rankName}</p>
                {promoteReason ? (
                  <p className="game-ui-v4-subtle"><strong>{v2.blockedReason}:</strong> {promoteReason}</p>
                ) : (
                  <p className="game-ui-v4-subtle">
                    {buildNextRankHint({ G, playerID: id, sharedRanks, resources, resourceLabels, promoteLabel: t.promote, lang })}
                  </p>
                )}
              </div>
              <V4NoticeStack notices={notices} dismissNotice={dismissNotice} />
            </div>
            <V4SelectionPanel
              pendingSelection={pendingSelection}
              activeSelectionNeedsTarget={activeSelectionNeedsTarget}
              activeSelectionNeedsReplacement={activeSelectionNeedsReplacement}
              activeSelectionNeedsResource={activeSelectionNeedsResource}
              currentPendingCard={currentPendingCard}
              selectedTargetId={selectedTargetId}
              setSelectedTargetId={setSelectedTargetId}
              opponentIds={opponentIds}
              playerLabelById={playerLabelById}
              v2={v2}
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

          {isSpectator && spectatorView === 'summary' ? (
            <section className="game-ui-v4-panel game-ui-v4-command">
              <V4StandingsSummary
                title={v2.finalStandingsTitle}
                summaryLabels={{
                  player: v2.finalStandingsPlayer,
                  rank: v2.finalStandingsRank,
                  resources: v2.finalStandingsResources,
                  turns: v2.finalStandingsTurns,
                  gainLoss: v2.finalStandingsGainLoss,
                  actions: v2.finalStandingsActions,
                }}
                playerSummaries={gameoverPlayerSummaries}
              />
            </section>
          ) : null}
          {draftPending && !myDraftDone ? (
            <section className="game-ui-v4-panel game-ui-v4-command">
              <div className="game-ui-v4-command-top">
                <div>
                  <p className="game-ui-v4-kicker">{v2.standardPlusKicker}</p>
                  <h3>{v2.legendarySelectionTitle}</h3>
                  <p className="game-ui-v4-subtle">
                    {v2.legendarySelectionHint}
                  </p>
                </div>
              </div>
              <div className="hand game-ui-v4-hand-grid">
                {legendaryDraftPool.map((card) => {
                  const selected = draftSelection.includes(card.id);
                  return (
                    <GameCardTile
                      key={`v2-draft-${card.id}`}
                      card={card}
                      resolvedImage={cardImageById[card.id]}
                      lang={lang}
                      categoryText={t.legendaryDeckLabel}
                      openPreviewKey={openPreviewKey}
                      previewKey={`v2-draft-preview-${card.id}`}
                      onTogglePreview={togglePreview}
                      onClosePreview={() => setOpenPreviewKey(null)}
                      actionLabel={selected ? v2.remove : v2.select}
                      onAction={() => handleDraftToggle(card.id)}
                      actionDisabled={false}
                      effectLabel={effectLabel}
                    />
                  );
                })}
              </div>
              <div className="game-ui-v4-selection-actions">
                <p className="game-ui-v4-subtle">{v2.selected}: {draftSelection.length}/5</p>
                <button
                  type="button"
                  disabled={draftSelection.length !== 5 || typeof moves.selectLegendaryLoadout !== 'function'}
                  onClick={() => moves.selectLegendaryLoadout?.(draftSelection)}
                >
                  {v2.confirmSelection}
                </button>
              </div>
            </section>
          ) : null}
          {!isSpectator ? (
          <section className="game-ui-v4-panel game-ui-v4-command game-ui-v4-command-panel game-ui-v4-command-panel-bottom">
            <V4BottomBar
              resources={footerResourceItems}
              rankName={rankName}
              rankHint={nextRankMeta?.nextRank ? `${nextRankMeta.occupied}/${nextRankMeta.seatLimit} ★` : v2.noNextRank}
              primaryActionLabel={primaryActionLabel}
              primaryActionDisabled={primaryActionDisabled}
              secondaryActionLabel={footerActionLabel}
              secondaryActionDisabled={!canEndTurn || blockPlayerTurnControls}
              onPrimaryAction={handlePrimaryV4Action}
              onSecondaryAction={() => handlePass(shouldShowSkipTurnLabel ? moves.pass : moves.endTurn)}
            />
          </section>
          ) : null}
          {(!isSpectator || spectatorView === 'live') ? (
          <V4BattlefieldSection
            title={v2.tableState}
            opponentCount={opponentIds.length}
            opponents={(
              <V4OpponentsArea
                leftItems={leftOpponentItems}
                rightItems={rightOpponentItems}
                handLabel={t.yourHand}
                centerPortraitImage={currentTurnPortraitImage}
                centerInitials={toInitials(currentTurnPlayerLabel)}
                centerKicker={currentStageFocus || v2.commandCenter}
                centerTitle={currentTurnPlayerLabel}
                centerSubtitle={activeArenaRankName || rankName}
                onOpponentClick={(pid) => {
                  if (!activeSelectionNeedsTarget) return;
                  setSelectedTargetId(pid);
                  postNotice('info', `${v2.pickTarget}: ${playerLabelById(pid)}`);
                }}
              />
            )}
            boardContent={(
              <>
                {impactPulse ? (
                    <div className={`game-ui-v4-impact-pulse is-${impactPulse.tone}`} aria-live="polite">
                      <div className="game-ui-v4-impact-beam" aria-hidden="true" />
                      <div className="game-ui-v4-impact-copy">
                        <span className="game-ui-v4-stage-label">{impactPulse.label}</span>
                        <strong>{focusPrimaryLabel}</strong>
                        <p>{impactPulse.text}</p>
                      </div>
                    </div>
                ) : null}
                <div className="game-ui-v4-altar-focus-shell">
                  <div className="game-ui-v4-table">
                    <article className="game-ui-v4-zone game-ui-v4-zone-deck">
                      <div className="game-ui-v4-zone-head">
                        <span className="game-ui-v4-stage-label">{t.drawPile}</span>
                        <strong>{G.deck?.length ?? 0}</strong>
                      </div>
                      <div className="game-ui-v4-zone-card">
                        <PilePreview
                          imageSrc={deckBackImage}
                          alt={t.drawPile}
                          previewKey="v3-pile-deck"
                          openPreviewKey={openPreviewKey}
                          onTogglePreview={togglePreview}
                          onClosePreview={() => setOpenPreviewKey(null)}
                          variant="v3"
                          fallback={<div className="pile-back-fallback">JOJ</div>}
                        />
                      </div>
                      <p className="game-ui-v4-zone-meta">{v2.stageFocusDraw}</p>
                    </article>
                    <article className="game-ui-v4-zone game-ui-v4-zone-focus">
                      <div className="game-ui-v4-zone-head">
                        <span className="game-ui-v4-stage-label">{selectedTargetId ? v2.pickTarget : v2.tableState}</span>
                        <strong>{activeArenaPlayerName}</strong>
                      </div>
                      <div className="game-ui-v4-focus-body">
                        <div className="game-ui-v4-focus-card">
                          {displayedDiscardTitle ? (
                            <PilePreview
                              imageSrc={displayedDiscardImage}
                              alt={displayedDiscardTitle}
                              previewKey={`v3-focus-${botPlaybackCardTitle || lastDiscard?.id || displayedDiscardTitle}`}
                              openPreviewKey={openPreviewKey}
                              onTogglePreview={togglePreview}
                              onClosePreview={() => setOpenPreviewKey(null)}
                              variant="v3"
                            />
                          ) : (
                            <div className="game-ui-v4-focus-empty">{v2.waitingAction}</div>
                          )}
                        </div>
                        <div className="game-ui-v4-focus-meta">
                          <strong>{displayedDiscardTitle || focusPrimaryLabel}</strong>
                          <span>{focusSecondaryLabel}</span>
                          <div className={`game-ui-v4-focus-tone${latestArenaRow ? ` is-${latestArenaRow.tone}` : ''}`}>
                            {latestArenaRow?.label ?? v2.waitingAction}
                          </div>
                          <p className="game-ui-v4-zone-meta">
                            {focusSupportingText}
                          </p>
                          <div className="game-ui-v4-focus-resources">
                            {BOARD_RESOURCE_ORDER.map((key) => (
                              <span key={`focus-resource-${key}`}>
                                {BOARD_RESOURCE_ICONS[key]} {activeArenaResources?.[key] ?? 0}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </article>
                    <article className="game-ui-v4-zone game-ui-v4-zone-discard">
                      <div className="game-ui-v4-zone-head">
                        <span className="game-ui-v4-stage-label">{t.discardPile}</span>
                        <strong>{G.discard?.length ?? 0}</strong>
                      </div>
                      <div className="game-ui-v4-zone-card">
                        {displayedDiscardTitle ? (
                          <PilePreview
                            imageSrc={displayedDiscardImage}
                            alt={displayedDiscardTitle}
                            previewKey={`v3-discard-${botPlaybackCardTitle || lastDiscard?.id || displayedDiscardTitle}`}
                            openPreviewKey={openPreviewKey}
                            onTogglePreview={togglePreview}
                            onClosePreview={() => setOpenPreviewKey(null)}
                            variant="v3"
                          />
                        ) : <div className="pile-empty">{t.noCardsInDiscard}</div>}
                      </div>
                      <p className="game-ui-v4-zone-meta">{displayedDiscardTitle || t.noCardsInDiscard}</p>
                    </article>
                  </div>
                </div>
              </>
            )}
          />
          ) : null}

          {!isSpectator ? (
          <V4PlayerDockSection
            mainContent={(
              <>
                <div className="game-ui-v4-hand-rail">
                <div className="game-ui-v4-hand-rail-chip">
                  <span className="game-ui-v4-stage-label">{t.turnStage}</span>
                  <strong>{stageLabel(stage, t)}</strong>
                </div>
                <div className="game-ui-v4-hand-rail-chip">
                  <span className="game-ui-v4-stage-label">{t.yourHand}</span>
                  <strong>{hand.length}/8</strong>
                </div>
                <div className={`game-ui-v4-hand-rail-chip${mustDiscardOverflow ? ' is-warn' : ''}`}>
                  <span className="game-ui-v4-stage-label">{v2.play}</span>
                  <strong>{canPlayHandCard ? v2.canPlayNow : v2.actionUnavailable}</strong>
                </div>
              </div>
              <V4HandSection
                title={`${t.yourHand} (${hand.length}/8)`}
                subtitle={mustDiscardOverflow ? v2.handOverflowWarning.replace('{count}', String(handOverflow)) : undefined}
                headRight={(
                  <div className="game-ui-v4-hand-controls">
                    <label>
                      <span>{v2.handFilter}</span>
                      <select value={handFilter} onChange={(e) => setHandFilter(e.target.value as HandFilter)}>
                        <option value="all">{v2.filterAll}</option>
                        <option value="playable">{v2.filterPlayable}</option>
                        {['LYAP', 'SCANDAL', 'SUPPORT', 'COMMAND', 'VVNZ'].map((category) => (
                          <option key={`filter-${category}`} value={category}>{categoryLabel(category, lang)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{v2.handSort}</span>
                      <select value={handSort} onChange={(e) => setHandSort(e.target.value as HandSort)}>
                        <option value="default">{v2.sortDefault}</option>
                        <option value="playable">{v2.sortPlayable}</option>
                        <option value="category">{v2.sortCategory}</option>
                        <option value="title">{v2.sortTitle}</option>
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
                actionLabel={v2.play}
                onAction={(card) => handleHandCardAction(card, requestPlayHandCard)}
                actionDisabled={(card) => !(handCardsView.find((row) => row.card.id === card.id)?.actionState.allowed ?? false)}
                selected={(card) => visibleHandSelectedId === card.id}
                cardClickAction={handleV4HandCardClick}
                effectLabel={effectLabel}
                badges={(card) => handCardsView.find((row) => row.card.id === card.id)?.badges}
                helperText={(card) => handCardsView.find((row) => row.card.id === card.id)?.helperText}
                previewText={(card) => handCardsView.find((row) => row.card.id === card.id)?.previewText}
                actionTitle={(card) => handCardsView.find((row) => row.card.id === card.id)?.actionState.reason ?? v2.play}
                extraAction={(card) => {
                  const canDiscardThisCard = mustDiscardOverflow && card.category !== 'LYAP' && card.category !== 'SCANDAL';
                  return canDiscardThisCard ? {
                    label: v2.discard,
                    onClick: () => moves.discardFromHand?.(card.id),
                    disabled: typeof moves.discardFromHand !== 'function',
                    className: 'game-card-inline-discard',
                  } : undefined;
                }}
              />
              {!isSimplifiedMode ? (
                <section className="game-ui-v4-panel game-ui-v4-legendary-frame">
                  <V4HandSection
                    title={`${t.legendaryHand} (${legendaryHand.length})`}
                    subtitle={t.legendaryHandHint}
                    cards={legendaryHand}
                    cardImageById={cardImageById}
                    lang={lang}
                    openPreviewKey={openPreviewKey}
                    togglePreview={togglePreview}
                    closePreview={() => setOpenPreviewKey(null)}
                    categoryText={() => t.legendaryDeckLabel}
                    actionLabel={v2.playLegendary}
                    onAction={(card) => handleLegendaryCardAction(card, requestPlayLegendaryCard)}
                    actionDisabled={() => typeof moves.playLegendaryCard !== 'function'}
                    effectLabel={effectLabel}
                    badges={(card) => [
                      ...(card.id === 'legendary-10' ? [v2.requiresTarget] : []),
                      ...((card.id === 'legendary-09' || card.id === 'legendary-06') ? [v2.requiresResource] : []),
                    ]}
                    previewText={(card) => handCardsView.find((row) => row.card.id === card.id)?.previewText}
                  />
                </section>
              ) : null}
              </>
            )}
            sideContent={undefined}
          />
          ) : null}

          {ctx.gameover ? (
            <>
              <p className="gameover">{t.winner}: {playerLabelById(String((ctx.gameover as { winner?: string }).winner ?? ''))}</p>
              <V4GameoverModal
                open={!gameoverModalClosed}
                ariaLabel={v2.gameStatsAria}
                title={v2.gameStatsTitle}
                winnerLabel={v2.winnerLabel}
                winnerName={playerLabelById(winnerPlayerID)}
                winnerRankName={winnerRankName}
                autoEndedLabel={gameoverMeta?.endReason === 'stalled-no-cards' ? v2.gameAutoEndedSkip : undefined}
                agreedEndLabel={gameoverMeta?.endReason === 'agreed-end' ? v2.gameEndedByAgreement : undefined}
                stats={{
                  totalTurns: G.gameStats?.turnsCompleted ?? 0,
                  resourcesGained: G.gameStats?.resourcesGainedTotal ?? 0,
                  resourcesLost: G.gameStats?.resourcesLostTotal ?? 0,
                  lyapsPlayed: G.gameStats?.lyapsPlayedOnOthers ?? 0,
                  scandalsPlayed: G.gameStats?.scandalsPlayedOnOthers ?? 0,
                }}
                statsLabels={{
                  totalTurns: v2.statsTotalTurns,
                  resourcesGained: v2.statsResourcesGained,
                  resourcesLost: v2.statsResourcesLost,
                  lyapsPlayed: v2.statsLyapsPlayedOnOthers,
                  scandalsPlayed: v2.statsScandalsPlayedOnOthers,
                }}
                summaryTitle={v2.finalStandingsTitle}
                summaryLabels={{
                  player: v2.finalStandingsPlayer,
                  rank: v2.finalStandingsRank,
                  resources: v2.finalStandingsResources,
                  turns: v2.finalStandingsTurns,
                  gainLoss: v2.finalStandingsGainLoss,
                  actions: v2.finalStandingsActions,
                }}
                playerSummaries={gameoverPlayerSummaries}
                closeLabel={t.close}
                leaveRoomLabel={v2.leaveRoom}
                onLeaveRoom={onLeaveRoom}
                onClose={() => setGameoverModalClosed(true)}
              />
            </>
          ) : null}
        </div>

          <V4SidePanel
          sidePanelTab={sidePanelTab}
          setSidePanelTab={setSidePanelTab}
          v2={v2}
          latestEvents={latestEvents}
          t={t}
          playerLabelById={playerLabelById}
          lang={lang}
          G={G}
          chatInput={chatInput}
          setChatInput={setChatInput}
          sendChatMessage={sendChatMessage}
          chatLogRef={chatLogRef}
          eventsTitle={isSpectator ? v2.spectatorTimelineTitle : v2.recentEvents}
          spectatorMode={isSpectator}
          helpTitle={v2.helpPanelTitle}
          helpItems={turnHelpItems}
        />
      </div>

      {!isSpectator ? (
      <div className="game-ui-v4-mobile-bar" aria-label={v2.mobileActions}>
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


