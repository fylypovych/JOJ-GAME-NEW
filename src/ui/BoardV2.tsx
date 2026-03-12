import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardDefinition, ResourceKey } from '../game/types';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';
import { GameCardTile, PilePreview } from './board/components';
import { buildNextRankHint, getBoardPromoteBlockedReason, getNextRankSeatMeta } from './board/rankHints';
import { BoardV2HandSection, BoardV2PlayerOverview, BoardV2SelectionPanel, BoardV2SidePanel } from './board/v2Sections';
import { BoardV2EndVoteModal, BoardV2GameoverModal, BoardV2Header, BoardV2StandingsSummary } from './board/v2ShellSections';
import { useBoardV2DerivedState } from './board/useBoardV2DerivedState';
import { usePendingSelection } from './board/usePendingSelection';
import { useBoardV2StageState } from './board/useBoardV2StageState';
import { useBoardV2Sync } from './board/useBoardV2Sync';
import { useBoardV2UiController } from './board/useBoardV2UiController';
import type { LocalizedBoardProps } from './board/types';

const RESOURCE_ORDER: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

type HandFilter = 'all' | 'playable' | CardDefinition['category'];
type HandSort = 'default' | 'playable' | 'category' | 'title';
type BotPlaybackSpeed = 'fast' | 'normal' | 'slow';

const BOT_DELAY_BY_SPEED: Record<BotPlaybackSpeed, number> = {
  fast: 250,
  normal: 850,
  slow: 1600,
};

const stageLabel = (stage: string | undefined, t: ReturnType<typeof text>) =>
  stage === 'draw' ? t.stageDraw : stage === 'play' ? t.stagePlay : stage === 'end' ? t.stageEnd : t.stageWaiting;

export const BoardV2 = ({
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
  const v2 = t.v2;
  const isSpectator = !playerID;
  const [spectatorView, setSpectatorView] = useState<'live' | 'summary'>('live');
  const [botPlaybackSpeed, setBotPlaybackSpeed] = useState<BotPlaybackSpeed>('normal');
  const [botAutoplayEnabled, setBotAutoplayEnabled] = useState(true);
  const [botThinkingPlayerName, setBotThinkingPlayerName] = useState('');
  const [renderSnapshot, setRenderSnapshot] = useState(() => ({
    G: incomingG,
    ctx: incomingCtx,
  }));
  const snapshotQueueRef = useRef<Array<{ G: typeof incomingG; ctx: typeof incomingCtx }>>([]);
  const processingQueueRef = useRef(false);
  const lastSnapshotSignatureRef = useRef('');
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botAutoplayEnabledRef = useRef(true);
  const botDelayMsRef = useRef(BOT_DELAY_BY_SPEED.normal);

  useEffect(() => {
    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

  useEffect(() => {
    botAutoplayEnabledRef.current = botAutoplayEnabled;
  }, [botAutoplayEnabled]);

  useEffect(() => {
    botDelayMsRef.current = BOT_DELAY_BY_SPEED[botPlaybackSpeed];
  }, [botPlaybackSpeed]);

  const processSnapshotQueue = useCallback(() => {
    if (processingQueueRef.current) return;
    const nextSnapshot = snapshotQueueRef.current[0];
    if (!nextSnapshot) {
      setBotThinkingPlayerName('');
      return;
    }
    const nextCurrentPlayer = nextSnapshot.ctx?.currentPlayer ?? '';
    const nextBot = nextCurrentPlayer ? nextSnapshot.G?.botPlayers?.[nextCurrentPlayer] : null;
    const nextBotName = nextCurrentPlayer
      ? String(nextSnapshot.G?.playerNames?.[nextCurrentPlayer] ?? nextBot?.name ?? nextCurrentPlayer)
      : '';
    const shouldDelay = Boolean(nextBot);
    if (shouldDelay && !botAutoplayEnabledRef.current) {
      setBotThinkingPlayerName(nextBotName);
      return;
    }
    snapshotQueueRef.current.shift();
    processingQueueRef.current = true;
    const finish = () => {
      setRenderSnapshot(nextSnapshot);
      processingQueueRef.current = false;
      setBotThinkingPlayerName('');
      if (snapshotQueueRef.current.length) processSnapshotQueue();
    };
    if (shouldDelay) {
      setBotThinkingPlayerName(nextBotName);
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        finish();
      }, botDelayMsRef.current);
      return;
    }
    finish();
  }, []);

  useEffect(() => {
    if (botAutoplayEnabled) processSnapshotQueue();
  }, [botAutoplayEnabled, processSnapshotQueue]);

  useEffect(() => {
    const currentPlayer = incomingCtx?.currentPlayer ?? '';
    const stage = currentPlayer ? incomingCtx?.activePlayers?.[currentPlayer] ?? '' : '';
    const signature = [
      incomingCtx?.turn ?? '',
      currentPlayer,
      stage,
      incomingG?.chat?.length ?? '',
      incomingG?.discard?.length ?? '',
      incomingG?.deck?.length ?? '',
      playerID ? incomingG?.hands?.[playerID]?.length ?? '' : '',
    ].join('|');
    if (lastSnapshotSignatureRef.current === signature) return;
    lastSnapshotSignatureRef.current = signature;
    snapshotQueueRef.current.push({ G: incomingG, ctx: incomingCtx });
    processSnapshotQueue();
  }, [incomingG, incomingCtx, playerID, processSnapshotQueue]);

  const G = renderSnapshot.G;
  const ctx = renderSnapshot.ctx;

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
  const safeResources: Record<ResourceKey, number> = resources ?? {
    time: 0,
    reputation: 0,
    discipline: 0,
    documents: 0,
    tech: 0,
  };
  const compactMode = false;
  const {
    chatInput,
    setChatInput,
    openPreviewKey,
    setOpenPreviewKey,
    draftSelection,
    setDraftSelection,
    notice,
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
    opponentIds,
    sendChatMessage,
    handleHandCardAction,
    handleLegendaryCardAction,
    handleDraw,
    handlePromote,
    handlePass,
    handleDraftToggle,
    getHandBadges,
    getHandHelperText,
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

  const getPromoteBlockedReason = () => {
    if (!G || !resources) return null;
    return getBoardPromoteBlockedReason({ G, playerID: id, sharedRanks, resourceLabels, lang });
  };

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
    id,
    hand,
    legendaryHand,
    canPlay: canPlay && typeof moves.playLegendaryCard === 'function',
    canPlayHandCard,
    sharedRanks,
    resources: safeResources,
    resourceLabels,
    lang,
    handFilter,
    handSort,
    v2,
    endTurnLabel: t.endTurn,
  });

  if (!G || !ctx || !resources) {
    return <section className="board"><p>{t.loading}</p></section>;
  }

  const promoteReason = getPromoteBlockedReason();
  const gameoverPlayerSummaries = Object.keys(G.players ?? {})
    .map((pid) => {
      const playerResources = G.resources?.[pid] ?? {};
      const statRow = G.playerGameStats?.[pid];
      const resourcesText = RESOURCE_ORDER.map((key) => `${resourceLabels[key]} ${playerResources[key] ?? 0}`).join(', ');
      return {
        playerID: pid,
        name: playerLabelById(pid),
        rankName: rankLabel(G.ranks?.[pid] ?? '', lang),
        resourcesText,
        turnsTaken: statRow?.turnsTaken ?? 0,
        resourcesGainedTotal: statRow?.resourcesGainedTotal ?? 0,
        resourcesLostTotal: statRow?.resourcesLostTotal ?? 0,
        lyapsPlayedOnOthers: statRow?.lyapsPlayedOnOthers ?? 0,
        scandalsPlayedOnOthers: statRow?.scandalsPlayedOnOthers ?? 0,
        winner: pid === winnerPlayerID,
        rankId: G.ranks?.[pid] ?? '',
        reputation: playerResources.reputation ?? 0,
      };
    })
    .sort((a, b) =>
      Number(b.winner) - Number(a.winner)
      || sharedRanks.findIndex((rank) => rank.id === b.rankId) - sharedRanks.findIndex((rank) => rank.id === a.rankId)
      || b.reputation - a.reputation,
    );
  const pendingCost: Partial<Record<ResourceKey, number>> = {};
  const highlightedResources = new Set<ResourceKey>();
  const deficitByResource: Partial<Record<ResourceKey, number>> = {};
  for (const key of RESOURCE_ORDER) {
    const need = pendingCost?.[key] ?? 0;
    if (need > 0) {
      highlightedResources.add(key);
      const have = resources[key] ?? 0;
      if (have < need) deficitByResource[key] = need - have;
    }
    if (selectedResource && selectedResource === key) highlightedResources.add(key);
  }

  const currentStageFocus =
    stage === 'draw' ? v2.stageFocusDraw : stage === 'play' ? v2.stageFocusPlay : stage === 'end' ? v2.stageFocusEnd : '';
  const stageClass = stage ? `is-stage-${stage}` : 'is-stage-waiting';
  return (
    <section className={`game-ui-v2-shell ${stageClass}${compactMode ? ' is-compact' : ''}${isSpectator ? ' is-spectator' : ''}`}>
      <BoardV2Header
        title={isCurrentPlayer ? v2.yourTurnTitle : v2.gameTableTitle}
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
        onRequestEndGame={() => {
          if (typeof moves.requestEndGameVote !== 'function') return;
          moves.requestEndGameVote();
        }}
        requestEndGameDisabled={endGameVoteActive || Boolean(ctx?.gameover)}
      />

      {hasBotPlayers && !isSpectator ? (
        <section className="game-ui-v2-bot-strip">
          <div>
            <p className="game-ui-v2-kicker">{v2.botControlsTitle}</p>
            {botThinkingPlayerName ? (
              <p className="game-ui-v2-subtle game-ui-v2-bot-thinking">
                {v2.botThinkingPrefix}: <strong>{botThinkingPlayerName}</strong>...
              </p>
            ) : null}
          </div>
          <div className="game-ui-v2-bot-strip-actions">
            <button type="button" onClick={() => setBotAutoplayEnabled((prev) => !prev)}>
              {botAutoplayEnabled ? v2.botAutoplayPause : v2.botAutoplayResume}
            </button>
            <div className="game-ui-v2-side-tab-row is-inline">
              <span className="game-ui-v2-bot-speed-label">{v2.botSpeedLabel}</span>
              {(['fast', 'normal', 'slow'] as BotPlaybackSpeed[]).map((speed) => (
                <button
                  key={`bot-speed-${speed}`}
                  type="button"
                  className={botPlaybackSpeed === speed ? 'is-active' : ''}
                  onClick={() => setBotPlaybackSpeed(speed)}
                >
                  {speed === 'fast' ? v2.botSpeedFast : speed === 'normal' ? v2.botSpeedNormal : v2.botSpeedSlow}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <BoardV2EndVoteModal
        open={endGameVoteActive}
        title={v2.endVoteTitle}
        prompt={`${requestedByLabel} ${v2.endVotePromptSuffix}`}
        waitingLabel={v2.endVoteWaiting}
        declineInfo={v2.endVoteDeclinedInfo}
        hasVotedAgree={hasVotedAgree}
        agreeLabel={v2.agreeEndGame}
        declineLabel={v2.declineEndGame}
        onAgree={() => moves.respondEndGameVote?.(true)}
        onDecline={() => moves.respondEndGameVote?.(false)}
      />

      {isSpectator ? (
        <section className="game-ui-v2-spectator-strip">
          <p className="game-ui-v2-subtle">{v2.spectatorCompactHint}</p>
          <div className="game-ui-v2-side-tab-row">
            <button type="button" className={spectatorView === 'live' ? 'is-active' : ''} onClick={() => setSpectatorView('live')}>
              {v2.spectatorLiveView}
            </button>
            <button type="button" className={spectatorView === 'summary' ? 'is-active' : ''} onClick={() => setSpectatorView('summary')}>
              {v2.spectatorSummaryView}
            </button>
          </div>
        </section>
      ) : null}

      <div className="game-ui-v2-grid">
        <div className="game-ui-v2-main">
          {isSpectator && spectatorView === 'summary' ? (
            <section className="game-ui-v2-command">
              <BoardV2StandingsSummary
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
            <section className="game-ui-v2-command">
              <div className="game-ui-v2-command-top">
                <div>
                  <p className="game-ui-v2-kicker">{v2.standardPlusKicker}</p>
                  <h3>{v2.legendarySelectionTitle}</h3>
                  <p className="game-ui-v2-subtle">
                    {v2.legendarySelectionHint}
                  </p>
                </div>
              </div>
              <div className="hand game-ui-v2-hand-grid">
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
              <div className="game-ui-v2-selection-actions">
                <p className="game-ui-v2-subtle">{v2.selected}: {draftSelection.length}/5</p>
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
          <section className="game-ui-v2-command">
            <div className="game-ui-v2-command-top">
              <div>
                <p className="game-ui-v2-kicker">{v2.commandCenter}</p>
                <h3>{playerLabelById(ctx.currentPlayer)}</h3>
                <p className="game-ui-v2-subtle">{t.turnStage}: {stageLabel(stage, t)} В· {t.yourRank}: {rankName}</p>
                {rankImage ? <p><img src={rankImage} alt={rankName} style={{ maxHeight: 84, borderRadius: 6 }} /></p> : null}
              </div>
              <div className="game-ui-v2-command-buttons">
                <button type="button" onClick={() => {
                  handleDraw();
                }} disabled={!canDraw}>{t.draw}</button>
                <button type="button" onClick={() => {
                  handlePromote(promoteReason);
                }} disabled={!canPlay}>{t.promote}</button>
                <button type="button" onClick={() => { handlePass(shouldShowSkipTurnLabel ? moves.pass : moves.endTurn); }} disabled={!canEndTurn}>{passButtonLabel}</button>
              </div>
            </div>
            <div className="game-ui-v2-resources-grid">
              {RESOURCE_ORDER.map((key) => (
                <div
                  key={key}
                  className={`game-ui-v2-resource-card${highlightedResources.has(key) ? ' is-highlighted' : ''}${deficitByResource[key] ? ' is-deficit' : ''}`}
                >
                  <span className="game-ui-v2-resource-name">{resourceLabels[key]}</span>
                  <strong>{resources[key] ?? 0}</strong>
                  {deficitByResource[key] ? <small>{v2.deficit}: {deficitByResource[key]}</small> : null}
                </div>
              ))}
            </div>
            <div className="game-ui-v2-command-rank-progress">
              <h4>{v2.nextRankProgress}</h4>
              {nextRankMeta?.nextRank ? (
                <>
                  <div className="game-ui-v2-rank-head">
                    <strong>{nextRankMeta.nextRank.name}</strong>
                    <span className={`game-ui-v2-chip${nextRankMeta.seatBlocked ? ' is-warn' : ' is-active'}`}>
                      {v2.occupiedSeats}: {nextRankMeta.occupied}/{nextRankMeta.seatLimit}
                    </span>
                  </div>
                  <div className="game-ui-v2-progress-list">
                    {RESOURCE_ORDER.map((key) => {
                      const need = nextRankMeta.nextRank?.requirement?.[key] ?? 0;
                      if (!need) return null;
                      const have = resources[key] ?? 0;
                      const pct = Math.max(0, Math.min(100, Math.round((have / need) * 100)));
                      return (
                        <div key={`req-inline-${key}`} className="game-ui-v2-progress-row">
                          <div className="game-ui-v2-progress-label"><span>{resourceLabels[key]}</span><span>{have}/{need}</span></div>
                          <div className="game-ui-v2-progress-bar"><i style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                  {promoteReason ? (
                    <p className="game-ui-v2-subtle"><strong>{v2.blockedReason}:</strong> {promoteReason}</p>
                  ) : (
                    <p className="game-ui-v2-subtle">
                      {buildNextRankHint({ G, playerID: id, sharedRanks, resources, resourceLabels, promoteLabel: t.promote, lang })}
                    </p>
                  )}
                </>
              ) : (
                <p className="game-ui-v2-subtle">{v2.noNextRank}</p>
              )}
            </div>
            {notice ? <p className={`game-ui-v2-notice is-${notice.type}`}>{notice.text}</p> : null}
            <BoardV2SelectionPanel
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

          {(!isSpectator || spectatorView === 'live') ? (
          <section className="game-ui-v2-piles">
            <h3>{v2.tableState}</h3>
            <div className="play-area">
              <div className="pile">
                <p>{t.drawPile} ({G.deck?.length ?? 0})</p>
                <div className="pile-card">
                  <PilePreview
                    imageSrc={deckBackImage}
                    alt={t.drawPile}
                    previewKey="v2-pile-deck"
                    openPreviewKey={openPreviewKey}
                    onTogglePreview={togglePreview}
                    onClosePreview={() => setOpenPreviewKey(null)}
                    fallback={<div className="pile-back-fallback">JOJ</div>}
                  />
                </div>
              </div>
              <div className="pile">
                <p>{t.discardPile} ({G.discard?.length ?? 0})</p>
                <div className="pile-card">
                  {lastDiscard ? (
                    <PilePreview
                      imageSrc={lastDiscardImage}
                      alt={cardTitle(lastDiscard.id, lastDiscard.title, lang)}
                      previewKey={`v2-discard-${lastDiscard.id}`}
                      openPreviewKey={openPreviewKey}
                      onTogglePreview={togglePreview}
                      onClosePreview={() => setOpenPreviewKey(null)}
                    />
                  ) : <div className="pile-empty">{t.noCardsInDiscard}</div>}
                </div>
                <p>{lastDiscard ? cardTitle(lastDiscard.id, lastDiscard.title, lang) : t.noCardsInDiscard}</p>
              </div>
              <div className="pile">
                <p>{v2.playersOverview} ({opponentIds.length})</p>
                <BoardV2PlayerOverview
                  opponentIds={opponentIds}
                  G={G}
                  sharedRanks={sharedRanks}
                  ctxCurrentPlayer={ctx.currentPlayer}
                  lang={lang}
                  selectedTargetId={selectedTargetId}
                  activeSelectionNeedsTarget={activeSelectionNeedsTarget}
                  setSelectedTargetId={setSelectedTargetId}
                  postTargetPick={(pid) => postNotice('info', `${v2.pickTarget}: ${playerLabelById(pid)}`)}
                  playerLabelById={playerLabelById}
                  resourceLabels={resourceLabels}
                  v2={v2}
                  getNextRankSeatMeta={getNextRankSeatMeta}
                />
              </div>
            </div>
          </section>
          ) : null}

          {!isSpectator ? (
          <section className="game-ui-v2-hand-section">
            <div className="game-ui-v2-hand-head">
              <div>
                <h3>{t.yourHand} ({hand.length}/8)</h3>
                {mustDiscardOverflow ? (
                  <p className="game-ui-v2-subtle is-warn">{v2.handOverflowWarning.replace('{count}', String(handOverflow))}</p>
                ) : null}
              </div>
              <div className="game-ui-v2-hand-controls">
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
            </div>
            <BoardV2HandSection
              title={`${t.yourHand} (${hand.length}/8)`}
              cards={handCardsView.map(({ card }) => card)}
              cardImageById={cardImageById}
              lang={lang}
              openPreviewKey={openPreviewKey}
              togglePreview={togglePreview}
              closePreview={() => setOpenPreviewKey(null)}
              categoryText={(card) => categoryLabel(card.category, lang)}
              actionLabel={v2.play}
              onAction={(card) => handleHandCardAction(card, requestPlayHandCard)}
              actionDisabled={() => !canPlayHandCard}
              effectLabel={effectLabel}
              badges={(card) => getHandBadges(card, handCardsView)}
              helperText={(card) => getHandHelperText(card, handCardsView)}
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
          </section>
          ) : null}

          {!isSimplifiedMode && !isSpectator ? (
            <BoardV2HandSection
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
            />
          ) : null}

          {ctx.gameover ? (
            <>
              <p className="gameover">{t.winner}: {playerLabelById(String((ctx.gameover as { winner?: string }).winner ?? ''))}</p>
              <BoardV2GameoverModal
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

          <BoardV2SidePanel
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
        />
      </div>

      {!isSpectator ? (
      <div className="game-ui-v2-mobile-bar" aria-label={v2.mobileActions}>
        <button type="button" onClick={handleDraw} disabled={!canDraw}>{t.draw}</button>
        <button type="button" onClick={() => handlePromote(promoteReason)} disabled={!canPlay || Boolean(promoteReason)}>{t.promote}</button>
        <button type="button" onClick={() => handlePass(shouldShowSkipTurnLabel ? moves.pass : moves.endTurn)} disabled={!canEndTurn}>{passButtonLabel}</button>
      </div>
      ) : null}
    </section>
  );
};


