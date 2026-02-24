import { useEffect, useRef, useState } from 'react';
import type { ResourceKey } from '../game/types';
import { normalizeImagePath } from '../game/imagePaths';
import { canPlayHandCardAtStage } from '../game/turnRules';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';
import { BoardChatPanel, GameCardTile, PilePreview } from './board/components';
import { createBoardPrompts } from './board/prompts';
import { buildNextRankHint, getBoardPromoteBlockedReason, getBoardVvnzBlockedReason } from './board/rankHints';
import type { LocalizedBoardProps } from './board/types';

export const Board = ({
  G,
  ctx,
  moves,
  playerID,
  lang = 'uk',
  playerName = '',
  knownPlayerNames = {},
  sharedRanks = [],
  onStateChange,
}: LocalizedBoardProps) => {
  const t = text(lang);
  const resourceLabels: Record<ResourceKey, string> = t.resources;
  const id = playerID ?? '0';
  const hand = G?.hands?.[id] ?? [];
  const legendaryHand = G?.legendaryHands?.[id] ?? [];
  const resources = G?.resources?.[id];
  const rankId = G?.ranks?.[id];
  const rankName = sharedRanks.find((row) => row.id === (rankId ?? ''))?.name ?? rankLabel(rankId ?? '', lang);
  const isCurrentPlayer = ctx?.currentPlayer === id;
  const stage = ctx?.activePlayers?.[id];
  const canDraw = isCurrentPlayer && stage === 'draw';
  const canPlay = isCurrentPlayer && (stage === 'play' || stage === 'end');
  const canEndTurn = isCurrentPlayer && (stage === 'play' || stage === 'end');
  const extraHandPlayTokens = G?.extraHandPlayTokens?.[id] ?? 0;
  const canPlayHandCard = canPlayHandCardAtStage({ isCurrentPlayer, stage, extraHandPlayTokens });
  const handOverflow = Math.max(0, hand.length - 8);
  const mustDiscardOverflow = isCurrentPlayer && handOverflow > 0 && (stage === 'play' || stage === 'end');
  const deckBackImage = G?.deckBackImage ? normalizeImagePath(G.deckBackImage) : undefined;
  const lastDiscard = G?.discard?.length ? G.discard[G.discard.length - 1] : null;
  const lastLegendaryDiscard = G?.legendaryDiscard?.length ? G.legendaryDiscard[G.legendaryDiscard.length - 1] : null;
  const effectLabel = (resource: ResourceKey | 'rank') =>
    resource === 'rank' ? t.rankResource : resourceLabels[resource];
  const [chatInput, setChatInput] = useState<string>('');
  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const syncedNameRef = useRef<string>('');
  const syncedNamesSignatureRef = useRef<string>('');
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const playerLabelById = (idValue: string | null | undefined) => {
    if (!idValue) return t.systemTag;
    const name = G?.playerNames?.[idValue]?.trim() || knownPlayerNames[idValue]?.trim();
    return name || t.genericPlayer;
  };
  useEffect(() => {
    if (!G || !ctx) return;
    onStateChange?.({
      G,
      ctx,
    });
  }, [G, ctx, onStateChange, playerID]);

  useEffect(() => {
    if (!playerID || !playerName.trim() || typeof moves.setPlayerName !== 'function') return;
    const trimmed = playerName.trim();
    if (syncedNameRef.current === trimmed) return;
    moves.setPlayerName(trimmed);
    syncedNameRef.current = trimmed;
  }, [moves, playerID, playerName]);

  useEffect(() => {
    if (typeof moves.syncPlayerNames !== 'function') return;
    const entries = Object.entries(knownPlayerNames)
      .map(([pid, name]) => [pid, name.trim()] as const)
      .filter(([, name]) => Boolean(name))
      .sort(([a], [b]) => Number(a) - Number(b));
    if (entries.length === 0) return;
    const signature = JSON.stringify(entries);
    if (syncedNamesSignatureRef.current === signature) return;
    moves.syncPlayerNames(Object.fromEntries(entries));
    syncedNamesSignatureRef.current = signature;
  }, [knownPlayerNames, moves]);

  useEffect(() => {
    if (!chatLogRef.current) return;
    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [G?.chat?.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPreviewKey(null);
    };
    const onPointerDown = () => {
      // no-op: outside-click closing is handled on local wrappers to avoid breaking card actions
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text) return;
    if (typeof moves.sendChat === 'function') {
      moves.sendChat(text);
    }
    setChatInput('');
  };
  const { promptLyapTarget, promptDroneTarget, promptWaterResource } = createBoardPrompts({
    G,
    currentPlayerID: id,
    lang,
    sharedRanks,
    resourceLabels,
    resources: resources ?? { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
    playerLabelById,
    chooseLyapTargetPrompt: t.chooseLyapTargetPrompt,
  });
  const togglePreview = (key: string) => {
    setOpenPreviewKey((prev) => (prev === key ? null : key));
  };
  const getVvnzPlayBlockedReason = (card: { category?: string; grantRank?: string }) => {
    if (!resources || !G) return null;
    return getBoardVvnzBlockedReason({
      card,
      G,
      playerID: id,
      sharedRanks,
      resources,
      resourceLabels,
      lang,
    });
  };
  const getPromoteBlockedReason = () => {
    if (!G || !resources) return null;
    return getBoardPromoteBlockedReason({
      G,
      playerID: id,
      sharedRanks,
      resourceLabels,
      lang,
    });
  };

  if (!G || !ctx || !resources) {
    return (
      <section className="board">
        <p>{t.loading}</p>
      </section>
    );
  }

  return (
    <section className="board board-layout">
      <div className="board-main">
      <div className="board-status">
        <p>{t.currentPlayer}: {playerLabelById(ctx.currentPlayer)}</p>
        <p>
          {t.turnStage}:{' '}
          {stage === 'draw'
            ? t.stageDraw
            : stage === 'play'
              ? t.stagePlay
              : stage === 'end'
                ? t.stageEnd
                : t.stageWaiting}
        </p>
        <p>{t.yourRank}: {rankName}</p>
        {G && resources ? (
          <p className="rank-next-hint">
            {buildNextRankHint({
              G,
              playerID: id,
              sharedRanks,
              resources,
              resourceLabels,
              promoteLabel: t.promote,
              lang,
            })}
          </p>
        ) : null}
      </div>

      <h2>{t.boardArea}</h2>
      <div className="play-area">
        <div className="pile pile-actions">
          <p>{lang === 'uk' ? 'Дії' : 'Actions'}</p>
          <div className="board-actions">
            <button type="button" onClick={() => moves.drawCard()} disabled={!canDraw}>
              {t.draw}
            </button>
            <button type="button" onClick={() => {
              if (!canPlay) return;
              const promoteReason = getPromoteBlockedReason();
              if (promoteReason) {
                window.alert(promoteReason);
                return;
              }
              moves.promote();
            }} disabled={!canPlay}>
              {t.promote}
            </button>
            <button type="button" onClick={() => moves.pass()} disabled={!canEndTurn}>
              {t.endTurn}
            </button>
          </div>
        </div>
        <div className="pile">
          <p>{t.drawPile} ({G.deck?.length ?? 0})</p>
          <div className="pile-card">
            <PilePreview
              imageSrc={deckBackImage}
              alt={t.drawPile}
              previewKey="pile-deck-back"
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
                imageSrc={normalizeImagePath(lastDiscard.image) ?? `/cards/${lastDiscard.id}.png`}
                alt={cardTitle(lastDiscard.id, lastDiscard.title, lang)}
                previewKey={`pile-discard-${lastDiscard.id}`}
                openPreviewKey={openPreviewKey}
                onTogglePreview={togglePreview}
                onClosePreview={() => setOpenPreviewKey(null)}
              />
            ) : (
              <div className="pile-empty">{t.noCardsInDiscard}</div>
            )}
          </div>
          <p>
            {t.lastPlayedCard}:{' '}
            {lastDiscard ? cardTitle(lastDiscard.id, lastDiscard.title, lang) : t.noCardsInDiscard}
          </p>
        </div>
      </div>

      <div className="resources">
        {Object.entries(resourceLabels).map(([key, label]) => (
          <span key={key}>
            {label}: {resources[key as ResourceKey]}
          </span>
        ))}
      </div>

      <h2>{t.yourHand} ({hand.length}/8)</h2>
      {mustDiscardOverflow ? (
        <p className="legendary-hint">
          {lang === 'uk'
            ? `Наприкінці ходу потрібно скинути ${handOverflow} карт(и) до ліміту 8. ЛЯП/СКАНДАЛ скидати кнопкою не можна.`
            : `Before ending the turn, discard ${handOverflow} card(s) to return to the hand limit of 8. LYAP/SCANDAL cannot be discarded with this button.`}
        </p>
      ) : null}
      <div className="hand">
        {hand.map((card) => {
          const canDiscardThisCard = mustDiscardOverflow && card.category !== 'LYAP' && card.category !== 'SCANDAL';
          return (
            <GameCardTile
              key={card.id}
              card={card}
              lang={lang}
              categoryText={categoryLabel(card.category, lang)}
              openPreviewKey={openPreviewKey}
              previewKey={`hand-${card.id}`}
              onTogglePreview={togglePreview}
              onClosePreview={() => setOpenPreviewKey(null)}
              actionLabel={t.playLegendaryCard}
              onAction={() => {
                if (!canPlayHandCard) return;
                const vvnzReason = getVvnzPlayBlockedReason(card);
                if (vvnzReason) {
                  window.alert(vvnzReason);
                  return;
                }
                const target = card.category === 'LYAP' ? promptLyapTarget() : undefined;
                if (card.category === 'LYAP' && !target) return;
                moves.playCard(card.id, [], target);
              }}
              actionDisabled={!canPlayHandCard}
              extraAction={canDiscardThisCard ? {
                label: lang === 'uk' ? 'СКИНУТИ В СКИД' : 'DISCARD TO PILE',
                onClick: () => moves.discardFromHand(card.id),
                disabled: typeof moves.discardFromHand !== 'function',
                className: 'game-card-inline-discard',
              } : undefined}
              effectLabel={effectLabel}
            />
          );
        })}
      </div>

      <h2>{t.legendaryHand} ({legendaryHand.length})</h2>
      <p className="legendary-hint">{t.legendaryHandHint}</p>
      <div className="hand">
        {legendaryHand.map((card) => {
          return (
            <GameCardTile
              key={`legendary-${card.id}`}
              card={card}
              lang={lang}
              categoryText={t.legendaryDeckLabel}
              openPreviewKey={openPreviewKey}
              previewKey={`legendary-${card.id}`}
              onTogglePreview={togglePreview}
              onClosePreview={() => setOpenPreviewKey(null)}
              actionLabel={t.playLegendaryCard}
              onAction={() => {
                const target = card.id === 'legendary-10' ? promptDroneTarget() : undefined;
                if (card.id === 'legendary-10' && !target) return;
                const needsResourceChoice = card.id === 'legendary-09' || card.id === 'legendary-06';
                const selectedResource = needsResourceChoice ? promptWaterResource() : undefined;
                if (needsResourceChoice && !selectedResource) return;
                moves.playLegendaryCard(card.id, target, selectedResource ?? undefined);
              }}
              actionDisabled={typeof moves.playLegendaryCard !== 'function'}
              effectLabel={effectLabel}
            />
          );
        })}
      </div>
      <p>
        {t.legendaryDiscardPile}: {G.legendaryDiscard?.length ?? 0}
        {lastLegendaryDiscard ? ` | ${t.lastPlayedCard}: ${cardTitle(lastLegendaryDiscard.id, lastLegendaryDiscard.title, lang)}` : ''}
      </p>

      {ctx.gameover ? <p className="gameover">{t.winner}: {playerLabelById(String(ctx.gameover.winner ?? ''))}</p> : null}
      </div>
      <BoardChatPanel
        chat={G.chat ?? []}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSend={sendChatMessage}
        playerLabelById={playerLabelById}
        t={t}
        chatLogRef={chatLogRef}
      />
    </section>
  );
};
