import { useMemo, useRef, useState } from 'react';
import type { CardDefinition, ResourceKey } from '../game/types';
import { normalizeImagePath } from '../game/imagePaths';
import { canPlayHandCardAtStage } from '../game/turnRules';
import { cardTitle, categoryLabel, localizeSystemMessageText, rankLabel, text } from './i18n';
import { BoardChatPanel, GameCardTile, PilePreview } from './board/components';
import { isPlayAllowedForCard } from './board/handRules';
import { buildNextRankHint, getBoardPromoteBlockedReason, getBoardVvnzBlockedReason, getNextRankSeatMeta } from './board/rankHints';
import { buildReplacementSlots } from './board/replacement';
import { usePendingSelection } from './board/usePendingSelection';
import { useBoardV2Sync } from './board/useBoardV2Sync';
import type { LocalizedBoardProps } from './board/types';

const RESOURCE_ORDER: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

type NoticeKind = 'info' | 'error' | 'success';
type Notice = { type: NoticeKind; text: string } | null;

type HandFilter = 'all' | 'playable' | CardDefinition['category'];
type HandSort = 'default' | 'playable' | 'category' | 'title';
type SidePanelTab = 'events' | 'chat';

const stageLabel = (stage: string | undefined, t: ReturnType<typeof text>) =>
  stage === 'draw' ? t.stageDraw : stage === 'play' ? t.stagePlay : stage === 'end' ? t.stageEnd : t.stageWaiting;

export const BoardV2 = ({
  G,
  ctx,
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

  const id = playerID ?? '0';
  const isSimplifiedMode = G?.gameMode === 'simplified';
  const hand = G?.hands?.[id] ?? [];
  const legendaryHand = isSimplifiedMode ? [] : (G?.legendaryHands?.[id] ?? []);
  const legendaryDraftPool = G?.legendaryDeck ?? [];
  const draftPending = G?.gameMode === 'standard_plus'
    && Object.keys(G?.players ?? {}).some((pid) => G?.legendaryDraftCompleted?.[pid] !== true);
  const myDraftDone = G?.legendaryDraftCompleted?.[id] === true;
  const resources = G?.resources?.[id];
  const rankId = G?.ranks?.[id];
  const currentRank = sharedRanks.find((row) => row.id === (rankId ?? ''));
  const rankName = currentRank?.name ?? rankLabel(rankId ?? '', lang);
  const rankImage = normalizeImagePath(G?.rankImageByPlayer?.[id])
    ?? normalizeImagePath(currentRank?.imageVariants?.[0])
    ?? normalizeImagePath(currentRank?.image);
  const resourceLabels: Record<ResourceKey, string> = t.resources;
  const isCurrentPlayer = ctx?.currentPlayer === id;
  const stage = ctx?.activePlayers?.[id] as string | undefined;
  const hasPendingDrawAuto = Boolean(G?.pendingDrawAutoResolution && G.pendingDrawAutoResolution.sourcePlayerID === id);
  const canDraw = isCurrentPlayer && !draftPending && stage === 'draw' && !hasPendingDrawAuto;
  const canPlay = isCurrentPlayer && !draftPending && (stage === 'play' || stage === 'end');
  const canEndTurn = isCurrentPlayer && !draftPending && (stage === 'play' || stage === 'end');
  const extraHandPlayTokens = G?.extraHandPlayTokens?.[id] ?? 0;
  const canPlayHandCard = canPlayHandCardAtStage({ isCurrentPlayer, stage, extraHandPlayTokens });
  const handOverflow = Math.max(0, hand.length - 8);
  const mustDiscardOverflow = isCurrentPlayer && handOverflow > 0 && (stage === 'play' || stage === 'end');
  const deckBackImage = G?.deckBackImage ? normalizeImagePath(G.deckBackImage) : undefined;
  const lastDiscard = G?.discard?.length ? G.discard[G.discard.length - 1] : null;
  const lastDiscardImage = lastDiscard
    ? (normalizeImagePath(cardImageById[lastDiscard.id]) ?? normalizeImagePath(lastDiscard.image) ?? `/cards/${lastDiscard.id}.png`)
    : undefined;
  const [chatInput, setChatInput] = useState('');
  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [gameoverModalClosed, setGameoverModalClosed] = useState<boolean>(false);
  const [handFilter, setHandFilter] = useState<HandFilter>('all');
  const [handSort, setHandSort] = useState<HandSort>('playable');
  const compactMode = false;
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('events');
  const syncedNameRef = useRef('');
  const syncedNamesSignatureRef = useRef('');
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  const playerLabelById = (idValue: string | null | undefined) => {
    if (!idValue) return t.systemTag;
    const name = G?.playerNames?.[idValue]?.trim() || knownPlayerNames[idValue]?.trim();
    return name || t.genericPlayer;
  };

  const effectLabel = (resource: ResourceKey | 'rank') => (resource === 'rank' ? t.rankResource : resourceLabels[resource]);
  const togglePreview = (key: string) => setOpenPreviewKey((prev) => (prev === key ? null : key));
  const sendChatMessage = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    if (typeof moves.sendChat === 'function') moves.sendChat(msg);
    setChatInput('');
  };
  const postNotice = (type: NoticeKind, msg: string) => setNotice(msg ? { type, text: msg } : null);
  const opponentIds = useMemo(
    () => Object.keys(G?.players ?? {}).filter((pid) => pid !== id),
    [G?.players, id],
  );

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

  const nextRankMeta = useMemo(() => {
    if (!G || !resources) return null;
    return getNextRankSeatMeta({ G, playerID: id, sharedRanks });
  }, [G, id, sharedRanks, resources]);

  const gameoverMeta = (ctx?.gameover ?? null) as { winner?: string; endReason?: string } | null;
  const winnerPlayerID = gameoverMeta?.winner ? String(gameoverMeta.winner) : '';
  const winnerRankId = winnerPlayerID ? (G?.ranks?.[winnerPlayerID] ?? '') : '';
  const winnerRankName = winnerRankId
    ? (sharedRanks.find((row) => row.id === winnerRankId)?.name ?? rankLabel(winnerRankId, lang))
    : '';
  const latestEvents = (G?.chat ?? [])
    .filter((row) => row.type === 'system')
    .slice(-4)
    .reverse();
  const endGameVote = G?.endGameVote;
  const endGameVoteActive = Boolean(endGameVote?.active) && !ctx?.gameover;
  const requestedByLabel = endGameVote?.requestedBy ? playerLabelById(endGameVote.requestedBy) : '';
  const hasVotedAgree = Boolean(endGameVote?.votes?.[id]);

  const handCardsView = useMemo(() => {
    const base = hand.map((card, index) => ({ card, index, playable: false }));
    if (!G || !resources) return base;
    const withMeta = hand.map((card, index) => {
      const playable = isPlayAllowedForCard({
        card,
        canPlayHandCard,
        resources,
        G,
        playerID: id,
        sharedRanks,
        resourceLabels,
        lang,
      });
      return { card, index, playable };
    });
    const filtered = withMeta.filter(({ card, playable }) => {
      if (handFilter === 'all') return true;
      if (handFilter === 'playable') return playable;
      return card.category === handFilter;
    });
    filtered.sort((a, b) => {
      if (handSort === 'default') return a.index - b.index;
      if (handSort === 'playable') {
        if (a.playable !== b.playable) return a.playable ? -1 : 1;
        return a.index - b.index;
      }
      if (handSort === 'category') {
        const c = a.card.category.localeCompare(b.card.category);
        return c || a.index - b.index;
      }
      const tA = cardTitle(a.card.id, a.card.title, lang);
      const tB = cardTitle(b.card.id, b.card.title, lang);
      return tA.localeCompare(tB) || a.index - b.index;
    });
    return filtered;
  }, [G, resources, hand, canPlayHandCard, id, sharedRanks, resourceLabels, lang, handFilter, handSort]);
  const hasPlayableHandCard = useMemo(
    () =>
      hand.some((card) =>
        isPlayAllowedForCard({
          card,
          canPlayHandCard,
          resources,
          G,
          playerID: id,
          sharedRanks,
          resourceLabels,
          lang,
        }),
      ),
    [G, resources, hand, canPlayHandCard, id, sharedRanks, resourceLabels, lang],
  );
  const hasPlayableLegendaryCard = canPlay && typeof moves.playLegendaryCard === 'function' && legendaryHand.length > 0;
  const shouldShowSkipTurnLabel = (G.deck?.length ?? 0) === 0 && !hasPlayableHandCard && !hasPlayableLegendaryCard;
  const passButtonLabel = shouldShowSkipTurnLabel
    ? v2.skipTurn
    : t.endTurn;

  const handleHandCardAction = (card: CardDefinition) => {
    if (!canPlayHandCard) {
      postNotice('error', v2.actionUnavailable);
      return;
    }
    const vvnzReason = resources && G ? getBoardVvnzBlockedReason({ card, G, playerID: id, sharedRanks, resources, resourceLabels, lang }) : null;
    if (vvnzReason) {
      postNotice('error', vvnzReason);
      return;
    }
    requestPlayHandCard(card);
  };

  const handleLegendaryCardAction = (card: CardDefinition) => {
    if (typeof moves.playLegendaryCard !== 'function') return;
    requestPlayLegendaryCard(card);
  };

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
              <p className="game-ui-v2-subtle">{v2.joinedAs}: {playerName || '-'} (#{roomMeta.playerID})</p>
            </div>
          ) : null}
          {currentStageFocus ? <p className="game-ui-v2-subtle game-ui-v2-stage-focus">{currentStageFocus}</p> : null}
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
                      onAction={() => {
                        setDraftSelection((prev) => {
                          if (prev.includes(card.id)) return prev.filter((idValue) => idValue !== card.id);
                          if (prev.length >= 5) return prev;
                          return [...prev, card.id];
                        });
                      }}
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
                  if (!canDraw) return postNotice('error', v2.confirmDrawFirst);
                  moves.drawCard();
                  setNotice(null);
                }} disabled={!canDraw}>{t.draw}</button>
                <button type="button" onClick={() => {
                  if (!canPlay) return postNotice('error', v2.actionUnavailable);
                  if (promoteReason) return postNotice('error', promoteReason);
                  moves.promote();
                  setNotice(null);
                }} disabled={!canPlay}>{t.promote}</button>
                <button type="button" onClick={() => { if (!canEndTurn) return; moves.pass(); setNotice(null); }} disabled={!canEndTurn}>{passButtonLabel}</button>
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
            {pendingSelection ? (
              <div className="game-ui-v2-selection-panel game-ui-v2-selection-panel-inline">
                <div>
                  <p className="game-ui-v2-kicker">
                    {activeSelectionNeedsTarget
                      ? v2.pickTarget
                      : (activeSelectionNeedsReplacement ? v2.replacementSelection : v2.pickResource)}
                  </p>
                  <h3>{currentPendingCard ? cardTitle(currentPendingCard.id, currentPendingCard.title, lang) : pendingSelection.cardId}</h3>
                  <p className="game-ui-v2-subtle">
                    {activeSelectionNeedsTarget
                      ? v2.selectableTargetHint
                      : (activeSelectionNeedsReplacement ? v2.replacementGuide : v2.selectableResourceHint)}
                  </p>
                </div>
                {activeSelectionNeedsTarget ? (
                  <div className="game-ui-v2-chip-row">
                    {opponentIds.map((pid) => (
                      <button
                        key={`pick-target-${pid}`}
                        type="button"
                        className={`game-ui-v2-pick-chip${selectedTargetId === pid ? ' is-selected' : ''}`}
                        onClick={() => {
                          setSelectedTargetId(pid);
                          pickTargetNotice(pid);
                        }}
                      >
                        {playerLabelById(pid)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {activeSelectionNeedsReplacement ? (
                  <>
                    {replacementTargetIds.length > 0 ? (
                      <>
                        <p className="game-ui-v2-subtle">{v2.replacementTarget}</p>
                        <div className="game-ui-v2-chip-row">
                          {replacementTargetIds.map((pid) => {
                            const targetResources = G?.resources?.[pid];
                            const required = targetResources && currentPendingCard
                              ? buildReplacementSlots(targetResources, currentPendingCard.effects).slots.length
                              : 0;
                            const selected = replacementSelectionsByTarget[pid]?.length ?? 0;
                            return (
                              <button
                                key={`replacement-target-${pid}`}
                                type="button"
                                className={`game-ui-v2-pick-chip${replacementActiveTargetId === pid ? ' is-selected' : ''}`}
                                onClick={() => setActiveReplacementTargetId(pid)}
                              >
                                {playerLabelById(pid)} ({selected}/{required})
                              </button>
                            );
                          })}
                        </div>
                        {replacementActiveTargetId ? (
                          <>
                            <p className="game-ui-v2-subtle">
                              {v2.replacementProgress}: {replacementActiveSelected.length}/{replacementActiveSlots.length}
                            </p>
                            <div className="game-ui-v2-chip-row">
                              {RESOURCE_ORDER.map((key) => (
                                <button
                                  key={`replacement-resource-${key}`}
                                  type="button"
                                  className={`game-ui-v2-pick-chip${
                                    replacementActiveSlots[replacementActiveSelected.length] === key ? ' is-selected' : ''
                                  }`}
                                  onClick={() => appendReplacementResource(key)}
                                >
                                  {resourceLabels[key]} ({replacementActiveTargetResources?.[key] ?? 0})
                                </button>
                              ))}
                            </div>
                            <div className="game-ui-v2-selection-actions">
                              <button type="button" className="ghost" onClick={undoReplacementResource}>
                                {v2.undoPick}
                              </button>
                            </div>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <p className="game-ui-v2-subtle">{v2.replacementNotRequired}</p>
                    )}
                  </>
                ) : null}
                {activeSelectionNeedsResource ? (
                  <div className="game-ui-v2-chip-row">
                    {RESOURCE_ORDER.map((key) => (
                      <button
                        key={`pick-resource-${key}`}
                        type="button"
                        className={`game-ui-v2-pick-chip${selectedResource === key ? ' is-selected' : ''}`}
                        onClick={() => setSelectedResource(key)}
                      >
                        {resourceLabels[key]} ({resources[key] ?? 0})
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="game-ui-v2-selection-actions">
                  <button type="button" onClick={confirmPendingSelection}>{v2.confirm}</button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      clearPendingSelection();
                    }}
                  >
                    {v2.cancel}
                  </button>
                </div>
              </div>
            ) : null}
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
                <div className="game-ui-v2-players-grid">
                  {opponentIds.map((pid) => {
                    const pResources = G.resources?.[pid];
                    const pRankId = G.ranks?.[pid] ?? '';
                    const pRank = sharedRanks.find((r) => r.id === pRankId)?.name ?? rankLabel(pRankId, lang);
                    const active = ctx.currentPlayer === pid;
                    const selectable = activeSelectionNeedsTarget;
                    const pMeta = getNextRankSeatMeta({ G, playerID: pid, sharedRanks });
                    return (
                      <button
                        key={`player-${pid}`}
                        type="button"
                        className={`game-ui-v2-player-card${active ? ' is-active' : ''}${selectedTargetId === pid ? ' is-selected' : ''}${selectable ? ' is-selectable' : ''}`}
                        onClick={() => {
                          if (!selectable) return;
                          setSelectedTargetId(pid);
                          postNotice('info', `${v2.pickTarget}: ${playerLabelById(pid)}`);
                        }}
                        disabled={!selectable}
                        title={selectable ? v2.selectableTargetHint : undefined}
                      >
                        <div className="game-ui-v2-player-head">
                          <strong>{playerLabelById(pid)}</strong>
                          <span>#{pid}</span>
                        </div>
                        <div className="game-ui-v2-player-rank">{pRank}</div>
                        <div className="game-ui-v2-player-badges">
                          {selectable ? <span className="pill pill-badge">{v2.targetableNow}</span> : null}
                          {pMeta.seatBlocked ? <span className="pill pill-badge">{v2.seatBlocked}</span> : null}
                          {(G.lyapScandalShieldUntilTurn?.[pid] ?? 0) > 0 ? <span className="pill pill-badge">{v2.shieldUntil}: {G.lyapScandalShieldUntilTurn?.[pid] ?? 0}</span> : null}
                        </div>
                        <div className="game-ui-v2-player-resources">
                          {RESOURCE_ORDER.map((key) => (
                            <span key={`${pid}-${key}`}>{resourceLabels[key]}: {pResources?.[key] ?? 0}</span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
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
            <div className="hand game-ui-v2-hand-grid">
              {handCardsView.map(({ card, playable }) => {
                const canDiscardThisCard = mustDiscardOverflow && card.category !== 'LYAP' && card.category !== 'SCANDAL';
                const needsTarget = card.category === 'LYAP';
                const vvnzReason = getBoardVvnzBlockedReason({ card, G, playerID: id, sharedRanks, resources, resourceLabels, lang });
                const helperText = vvnzReason || (!playable && !canPlayHandCard ? v2.actionUnavailable : undefined);
                const badges = [
                  playable ? v2.canPlayNow : v2.notNow,
                  ...(needsTarget ? [v2.requiresTarget] : []),
                  ...(card.category === 'VVNZ' && vvnzReason ? [categoryLabel(card.category, lang)] : []),
                ];
                return (
                  <GameCardTile
                    key={`v2-hand-${card.id}`}
                    card={card}
                    resolvedImage={cardImageById[card.id]}
                    lang={lang}
                    categoryText={categoryLabel(card.category, lang)}
                    openPreviewKey={openPreviewKey}
                    previewKey={`v2-hand-preview-${card.id}`}
                    onTogglePreview={togglePreview}
                    onClosePreview={() => setOpenPreviewKey(null)}
                    actionLabel={v2.play}
                    onAction={() => handleHandCardAction(card)}
                    actionDisabled={!canPlayHandCard}
                    extraAction={canDiscardThisCard ? {
                      label: v2.discard,
                      onClick: () => moves.discardFromHand?.(card.id),
                      disabled: typeof moves.discardFromHand !== 'function',
                      className: 'game-card-inline-discard',
                    } : undefined}
                    effectLabel={effectLabel}
                    badges={badges}
                    helperText={helperText}
                  />
                );
              })}
            </div>
          </section>

          {!isSimplifiedMode ? (
            <section className="game-ui-v2-hand-section">
              <div className="game-ui-v2-hand-head">
                <div>
                  <h3>{t.legendaryHand} ({legendaryHand.length})</h3>
                  <p className="game-ui-v2-subtle">{t.legendaryHandHint}</p>
                </div>
              </div>
              <div className="hand game-ui-v2-hand-grid">
                {legendaryHand.map((card) => {
                  const badges = [
                    card.id === 'legendary-10' ? v2.requiresTarget : '',
                    (card.id === 'legendary-09' || card.id === 'legendary-06') ? v2.requiresResource : '',
                  ].filter(Boolean);
                  return (
                    <GameCardTile
                      key={`v2-legendary-${card.id}`}
                      card={card}
                      resolvedImage={cardImageById[card.id]}
                      lang={lang}
                      categoryText={t.legendaryDeckLabel}
                      openPreviewKey={openPreviewKey}
                      previewKey={`v2-legendary-preview-${card.id}`}
                      onTogglePreview={togglePreview}
                      onClosePreview={() => setOpenPreviewKey(null)}
                      actionLabel={v2.playLegendary}
                      onAction={() => handleLegendaryCardAction(card)}
                      actionDisabled={typeof moves.playLegendaryCard !== 'function'}
                      effectLabel={effectLabel}
                      badges={badges.length ? badges : undefined}
                    />
                  );
                })}
              </div>
            </section>
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

        <aside className="game-ui-v2-side">
          <section className="game-ui-v2-events game-ui-v2-mobile-tabs">
            <div className="game-ui-v2-side-tab-row">
              <button type="button" className={sidePanelTab === 'events' ? 'is-active' : ''} onClick={() => setSidePanelTab('events')}>{v2.openEvents}</button>
              <button type="button" className={sidePanelTab === 'chat' ? 'is-active' : ''} onClick={() => setSidePanelTab('chat')}>{v2.openChat}</button>
            </div>
          </section>
          <section className={`game-ui-v2-events${sidePanelTab !== 'events' ? ' game-ui-v2-mobile-hidden' : ''}`}>
            <h3>{v2.recentEvents}</h3>
            <div className="game-ui-v2-events-list">
              {latestEvents.map((row) => {
                const author = row.type === 'system' ? t.systemTag : playerLabelById(row.playerID);
                return (
                  <div key={`v2-evt-${row.id}`} className={`game-ui-v2-event-row ${row.type === 'system' ? 'is-system' : ''}`}>
                    <strong>{author}</strong>
                    <span>{row.type === 'system' ? localizeSystemMessageText(row.text, lang) : row.text}</span>
                  </div>
                );
              })}
              {!latestEvents.length ? <p className="game-ui-v2-subtle">{v2.noEventsYet}</p> : null}
            </div>
          </section>
          <section className={sidePanelTab !== 'chat' ? 'game-ui-v2-mobile-hidden' : ''}>
            <BoardChatPanel
              chat={G.chat ?? []}
              chatInput={chatInput}
              setChatInput={setChatInput}
            onSend={sendChatMessage}
            playerLabelById={playerLabelById}
            t={t}
            chatLogRef={chatLogRef}
            includeSystemMessages={false}
            lang={lang}
          />
        </section>

        </aside>
      </div>

      <div className="game-ui-v2-mobile-bar" aria-label={v2.mobileActions}>
        <button type="button" onClick={() => canDraw && moves.drawCard()} disabled={!canDraw}>{t.draw}</button>
        <button type="button" onClick={() => { if (!canPlay || promoteReason) return; moves.promote(); }} disabled={!canPlay || Boolean(promoteReason)}>{t.promote}</button>
        <button type="button" onClick={() => canEndTurn && moves.pass()} disabled={!canEndTurn}>{passButtonLabel}</button>
      </div>
    </section>
  );
};


