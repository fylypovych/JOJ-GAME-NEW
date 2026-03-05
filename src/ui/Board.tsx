import { useEffect, useRef, useState } from 'react';
import type { CardDefinition, ResourceKey } from '../game/types';
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
  cardImageById = {},
  onStateChange,
}: LocalizedBoardProps) => {
  const t = text(lang);
  const resourceLabels: Record<ResourceKey, string> = t.resources;
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
  const rankName = sharedRanks.find((row) => row.id === (rankId ?? ''))?.name ?? rankLabel(rankId ?? '', lang);
  const isCurrentPlayer = ctx?.currentPlayer === id;
  const stage = ctx?.activePlayers?.[id];
  const canDraw = isCurrentPlayer && !draftPending && stage === 'draw';
  const canPlay = isCurrentPlayer && !draftPending && (stage === 'play' || stage === 'end');
  const canEndTurn = isCurrentPlayer && !draftPending && (stage === 'play' || stage === 'end');
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
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [gameoverModalClosed, setGameoverModalClosed] = useState<boolean>(false);
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

  useEffect(() => {
    setDraftSelection([]);
  }, [id, ctx?.turn]);

  useEffect(() => {
    setGameoverModalClosed(false);
  }, [ctx?.gameover]);

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
  const getVvnzPlayBlockedReason = (card: Pick<CardDefinition, 'category' | 'grantRank'>) => {
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
  const hasPlayableHandCard = hand.some((card) => {
    if (!canPlayHandCard) return false;
    if (card.category !== 'VVNZ') return true;
    return !getVvnzPlayBlockedReason(card);
  });
  const hasPlayableLegendaryCard = canPlay && typeof moves.playLegendaryCard === 'function' && legendaryHand.length > 0;
  const shouldShowSkipTurnLabel = (G.deck?.length ?? 0) === 0 && !hasPlayableHandCard && !hasPlayableLegendaryCard;
  const passButtonLabel = shouldShowSkipTurnLabel
    ? (lang === 'uk' ? 'РџСЂРѕРїСѓСЃС‚РёС‚Рё С…С–Рґ' : 'Skip turn')
    : t.endTurn;
  const gameoverMeta = (ctx?.gameover ?? null) as { winner?: string; endReason?: string } | null;
  const winnerPlayerID = gameoverMeta?.winner ? String(gameoverMeta.winner) : '';
  const winnerRankId = winnerPlayerID ? (G?.ranks?.[winnerPlayerID] ?? '') : '';
  const winnerRankName = winnerRankId
    ? (sharedRanks.find((row) => row.id === winnerRankId)?.name ?? rankLabel(winnerRankId, lang))
    : '';

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
      {draftPending && !myDraftDone ? (
        <div className="board-status">
          <h3>{lang === 'uk' ? 'Вибір легендарних карт (5)' : 'Legendary selection (5)'}</h3>
          <div className="hand">
            {legendaryDraftPool.map((card) => {
              const selected = draftSelection.includes(card.id);
              return (
                <GameCardTile
                  key={`draft-${card.id}`}
                  card={card}
                  resolvedImage={cardImageById[card.id]}
                  lang={lang}
                  categoryText={t.legendaryDeckLabel}
                  openPreviewKey={openPreviewKey}
                  previewKey={`draft-${card.id}`}
                  onTogglePreview={togglePreview}
                  onClosePreview={() => setOpenPreviewKey(null)}
                  actionLabel={selected ? (lang === 'uk' ? 'Прибрати' : 'Remove') : (lang === 'uk' ? 'Обрати' : 'Select')}
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
          <p>{lang === 'uk' ? 'Обрано' : 'Selected'}: {draftSelection.length}/5</p>
          <button
            type="button"
            disabled={draftSelection.length !== 5 || typeof (moves as any).selectLegendaryLoadout !== 'function'}
            onClick={() => {
              (moves as any).selectLegendaryLoadout?.(draftSelection);
            }}
          >
            {lang === 'uk' ? 'Підтвердити вибір' : 'Confirm selection'}
          </button>
        </div>
      ) : null}
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
              {passButtonLabel}
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
            ? `РќР°РїСЂРёРєС–РЅС†С– С…РѕРґСѓ РїРѕС‚СЂС–Р±РЅРѕ СЃРєРёРЅСѓС‚Рё ${handOverflow} РєР°СЂС‚(Рё) РґРѕ Р»С–РјС–С‚Сѓ 8. Р›РЇРџ/РЎРљРђРќР”РђР› СЃРєРёРґР°С‚Рё РєРЅРѕРїРєРѕСЋ РЅРµ РјРѕР¶РЅР°.`
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
              resolvedImage={cardImageById[card.id]}
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
                label: lang === 'uk' ? 'РЎРљРРќРЈРўР Р’ РЎРљРР”' : 'DISCARD TO PILE',
                onClick: () => moves.discardFromHand(card.id),
                disabled: typeof moves.discardFromHand !== 'function',
                className: 'game-card-inline-discard',
              } : undefined}
              effectLabel={effectLabel}
            />
          );
        })}
      </div>

      {!isSimplifiedMode ? (
        <>
          <h2>{t.legendaryHand} ({legendaryHand.length})</h2>
          <p className="legendary-hint">{t.legendaryHandHint}</p>
          <div className="hand">
            {legendaryHand.map((card) => {
              return (
                <GameCardTile
                  key={`legendary-${card.id}`}
                  card={card}
                  resolvedImage={cardImageById[card.id]}
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
        </>
      ) : null}

      {ctx.gameover ? (
        <>
          <p className="gameover">{t.winner}: {playerLabelById(String(ctx.gameover.winner ?? ''))}</p>
          {!gameoverModalClosed ? (
          <div className="gameover-modal" role="dialog" aria-label={lang === 'uk' ? 'РЎС‚Р°С‚РёСЃС‚РёРєР° РіСЂРё' : 'Game statistics'}>
            <div className="gameover-modal-card">
              <h3>{lang === 'uk' ? 'РЎС‚Р°С‚РёСЃС‚РёРєР° РіСЂРё' : 'Game statistics'}</h3>
              <p>
                <strong>{lang === 'uk' ? 'РџРµСЂРµРјРѕР¶РµС†СЊ' : 'Winner'}:</strong> {playerLabelById(winnerPlayerID)}
                {winnerRankName ? ` (${winnerRankName})` : ''}
              </p>
              {gameoverMeta?.endReason === 'stalled-no-cards' ? (
                <p className="legendary-hint">
                  {lang === 'uk'
                    ? 'Р“СЂСѓ Р·Р°РІРµСЂС€РµРЅРѕ Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ РїС–СЃР»СЏ РїРѕРІРЅРѕРіРѕ РєРѕР»Р° РїСЂРѕРїСѓСЃРєС–РІ (РєР°СЂС‚ РґР»СЏ СЂРѕР·С–РіСЂР°С€Сѓ РЅРµ Р»РёС€РёР»РѕСЃСЊ).'
                    : 'Game auto-ended after a full round of skips (no playable cards left).'}
                </p>
              ) : null}
              <ul className="gameover-stats-list">
                <li>{lang === 'uk' ? 'РЈСЃСЊРѕРіРѕ С…РѕРґС–РІ' : 'Total turns'}: <strong>{G.gameStats?.turnsCompleted ?? 0}</strong></li>
                <li>{lang === 'uk' ? 'РћС‚СЂРёРјР°РЅРѕ СЂРµСЃСѓСЂСЃС–РІ (СѓСЃСЊРѕРіРѕ)' : 'Resources gained (total)'}: <strong>{G.gameStats?.resourcesGainedTotal ?? 0}</strong></li>
                <li>{lang === 'uk' ? 'Р’С‚СЂР°С‡РµРЅРѕ СЂРµСЃСѓСЂСЃС–РІ (СѓСЃСЊРѕРіРѕ)' : 'Resources lost (total)'}: <strong>{G.gameStats?.resourcesLostTotal ?? 0}</strong></li>
                <li>{lang === 'uk' ? 'Р›РЇРџС–РІ Р·С–РіСЂР°РЅРѕ РЅР° С–РЅС€РёС…' : 'LYAPs played on others'}: <strong>{G.gameStats?.lyapsPlayedOnOthers ?? 0}</strong></li>
                <li>{lang === 'uk' ? 'РЎРљРђРќР”РђР›С–РІ Р·С–РіСЂР°РЅРѕ РЅР° С–РЅС€РёС…' : 'SCANDALs played on others'}: <strong>{G.gameStats?.scandalsPlayedOnOthers ?? 0}</strong></li>
              </ul>
              <button type="button" onClick={() => setGameoverModalClosed(true)}>
                {t.close}
              </button>
            </div>
          </div>
          ) : null}
        </>
      ) : null}
      </div>
      <BoardChatPanel
        chat={G.chat ?? []}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSend={sendChatMessage}
        playerLabelById={playerLabelById}
        t={t}
        chatLogRef={chatLogRef}
        lang={lang}
      />
    </section>
  );
};


