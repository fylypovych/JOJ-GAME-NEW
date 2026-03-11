import { useEffect, useRef, useState } from 'react';
import type { CardDefinition, ResourceKey } from '../game/types';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';
import { GameCardTile, PilePreview } from './board/components';
import { buildNextRankHint, getBoardPromoteBlockedReason, getBoardVvnzBlockedReason, getNextRankSeatMeta } from './board/rankHints';
import { BoardV2HandSection, BoardV2PlayerOverview, BoardV2SelectionPanel, BoardV2SidePanel } from './board/v2Sections';
import { useBoardV2DerivedState } from './board/useBoardV2DerivedState';
import { usePendingSelection } from './board/usePendingSelection';
import { useBoardV2StageState } from './board/useBoardV2StageState';
import { useBoardV2Sync } from './board/useBoardV2Sync';
import { useBoardV2UiController } from './board/useBoardV2UiController';
import type { LocalizedBoardProps } from './board/types';

const RESOURCE_ORDER: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

type HandFilter = 'all' | 'playable' | CardDefinition['category'];
type HandSort = 'default' | 'playable' | 'category' | 'title';

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
  const BOT_TURN_DELAY_MS = 850;
  const [renderSnapshot, setRenderSnapshot] = useState(() => ({
    G: incomingG,
    ctx: incomingCtx,
  }));
  const snapshotQueueRef = useRef<Array<{ G: typeof incomingG; ctx: typeof incomingCtx }>>([]);
  const processingQueueRef = useRef(false);
  const lastSnapshotSignatureRef = useRef('');
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

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
    const processQueue = () => {
      if (processingQueueRef.current) return;
      const nextSnapshot = snapshotQueueRef.current.shift();
      if (!nextSnapshot) return;
      processingQueueRef.current = true;
      const nextCurrentPlayer = nextSnapshot.ctx?.currentPlayer ?? '';
      const shouldDelay = Boolean(nextCurrentPlayer && nextSnapshot.G?.botPlayers?.[nextCurrentPlayer]);
      const finish = () => {
        setRenderSnapshot(nextSnapshot);
        processingQueueRef.current = false;
        if (snapshotQueueRef.current.length) processQueue();
      };
      if (shouldDelay) {
        delayTimerRef.current = setTimeout(() => {
          delayTimerRef.current = null;
          finish();
        }, BOT_TURN_DELAY_MS);
      } else {
        finish();
      }
    };
    processQueue();
  }, [incomingG, incomingCtx, playerID]);

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
    resources: safeResources,
    sharedRanks,
    resourceLabels,
    lang,
    v2,
    t,
    getBoardVvnzBlockedReason,
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
    <section className={`game-ui-v2-shell ${stageClass}${compactMode ? ' is-compact' : ''}`}>
      <header className="game-ui-v2-header">
        <div>
          <p className="game-ui-v2-kicker">JOJ V2</p>
          <h2>{isCurrentPlayer ? v2.yourTurnTitle : v2.gameTableTitle}</h2>
          {roomMeta ? (
            <div className="game-ui-v2-room-meta">
              <p className="game-ui-v2-subtle">{v2.activeRoom}: <strong>{roomMeta.matchID}</strong></p>
              <p className="game-ui-v2-subtle">
                {roomMeta.playerID ? `${v2.joinedAs}: ${playerName || '-'} (#${roomMeta.playerID})` : `${v2.spectatorMode}: ${playerName || '-'}`}
              </p>
            </div>
          ) : null}
          {currentStageFocus ? <p className="game-ui-v2-subtle game-ui-v2-stage-focus">{currentStageFocus}</p> : null}
          {seatConnectionMissing ? (
            <p className="admin-error">{t.seatConnectionMissing}</p>
          ) : null}
        </div>
        <div className="game-ui-v2-header-actions">
          <span className="game-ui-v2-badge">{stageLabel(stage, t)}</span>
          {onLeaveRoom ? (
            <button type="button" className="game-ui-v2-header-leave" onClick={onLeaveRoom}>
              {v2.leaveRoom}
            </button>
          ) : null}
          <button
            type="button"
            className="game-ui-v2-header-leave"
            onClick={() => {
              if (typeof moves.requestEndGameVote !== 'function') return;
              moves.requestEndGameVote();
            }}
            disabled={endGameVoteActive || Boolean(ctx?.gameover)}
          >
            {v2.requestEndGame}
          </button>
        </div>
      </header>

      {endGameVoteActive ? (
        <section className="game-ui-v2-vote-popup" role="dialog" aria-label={v2.endVoteTitle}>
          <div className="game-ui-v2-vote-popup-card">
            <h3>{v2.endVoteTitle}</h3>
              <p className="game-ui-v2-subtle">
              {`${requestedByLabel} ${v2.endVotePromptSuffix}`}
            </p>
            {!hasVotedAgree ? (
              <div className="game-ui-v2-selection-actions">
                <button type="button" onClick={() => moves.respondEndGameVote?.(true)}>{v2.agreeEndGame}</button>
                <button type="button" className="ghost" onClick={() => moves.respondEndGameVote?.(false)}>{v2.declineEndGame}</button>
              </div>
            ) : (
              <p className="game-ui-v2-subtle">{v2.endVoteWaiting}</p>
            )}
            <p className="game-ui-v2-subtle">{v2.endVoteDeclinedInfo}</p>
          </div>
        </section>
      ) : null}

      <div className="game-ui-v2-grid">
        <div className="game-ui-v2-main">
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

          {!isSimplifiedMode ? (
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
              {!gameoverModalClosed ? (
              <div className="game-ui-v2-gameover-modal" role="dialog" aria-label={v2.gameStatsAria}>
                <div className="game-ui-v2-gameover-card">
                  <h3>{v2.gameStatsTitle}</h3>
                  <p>
                    <strong>{v2.winnerLabel}:</strong> {playerLabelById(winnerPlayerID)}
                    {winnerRankName ? ` (${winnerRankName})` : ''}
                  </p>
                  {gameoverMeta?.endReason === 'stalled-no-cards' ? (
                    <p className="game-ui-v2-subtle">{v2.gameAutoEndedSkip}</p>
                  ) : null}
                  {gameoverMeta?.endReason === 'agreed-end' ? (
                    <p className="game-ui-v2-subtle">{v2.gameEndedByAgreement}</p>
                  ) : null}
                  <div className="game-ui-v2-token-list">
                    <div className="game-ui-v2-token-row"><span>{v2.statsTotalTurns}</span><strong>{G.gameStats?.turnsCompleted ?? 0}</strong></div>
                    <div className="game-ui-v2-token-row"><span>{v2.statsResourcesGained}</span><strong>{G.gameStats?.resourcesGainedTotal ?? 0}</strong></div>
                    <div className="game-ui-v2-token-row"><span>{v2.statsResourcesLost}</span><strong>{G.gameStats?.resourcesLostTotal ?? 0}</strong></div>
                    <div className="game-ui-v2-token-row"><span>{v2.statsLyapsPlayedOnOthers}</span><strong>{G.gameStats?.lyapsPlayedOnOthers ?? 0}</strong></div>
                    <div className="game-ui-v2-token-row"><span>{v2.statsScandalsPlayedOnOthers}</span><strong>{G.gameStats?.scandalsPlayedOnOthers ?? 0}</strong></div>
                  </div>
                  {onLeaveRoom ? (
                    <button type="button" onClick={onLeaveRoom}>
                      {v2.leaveRoom}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setGameoverModalClosed(true)}>
                    {t.close}
                  </button>
                </div>
              </div>
              ) : null}
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
        />
      </div>

      <div className="game-ui-v2-mobile-bar" aria-label={v2.mobileActions}>
        <button type="button" onClick={() => canDraw && moves.drawCard()} disabled={!canDraw}>{t.draw}</button>
        <button type="button" onClick={() => { if (!canPlay || promoteReason) return; moves.promote(); }} disabled={!canPlay || Boolean(promoteReason)}>{t.promote}</button>
        <button type="button" onClick={() => canEndTurn && (shouldShowSkipTurnLabel ? moves.pass() : moves.endTurn?.())} disabled={!canEndTurn}>{passButtonLabel}</button>
      </div>
    </section>
  );
};


