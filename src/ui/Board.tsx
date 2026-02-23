import { useEffect, useRef, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { JojGameState, RankDefinition, ResourceKey } from '../game/types';
import { normalizeImagePath } from '../game/jojGame';
import type { Language } from './i18n';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';

type LocalizedBoardProps = BoardProps<JojGameState> & {
  lang?: Language;
  playerName?: string;
  knownPlayerNames?: Record<string, string>;
  sharedRanks?: RankDefinition[];
  onStateChange?: (payload: {
    G: JojGameState;
    ctx: unknown;
  }) => void;
};

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
  const canPlay = isCurrentPlayer && stage === 'play';
  const canEndTurn = isCurrentPlayer && (stage === 'play' || stage === 'end');
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

  const promptLyapTarget = (): string | null => {
    const playerIds = Object.keys(G?.players ?? {}).filter((pid) => pid !== id);
    if (playerIds.length === 0) return null;
    const options = playerIds
      .map((pid, index) => `${index + 1}: ${playerLabelById(pid)} (#${pid})`)
      .join('\n');
    const value = window.prompt(
      `${t.chooseLyapTargetPrompt}:\n${options}\n${lang === 'uk' ? 'Введіть номер або playerID.' : 'Enter option number or playerID.'}`,
    );
    if (value === null) return null;
    const trimmed = value.trim();
    const byIndex = Number(trimmed);
    if (Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= playerIds.length) {
      return playerIds[byIndex - 1];
    }
    if (playerIds.includes(trimmed)) return trimmed;
    return null;
  };
  const rankSeatLimit = (playerCount: number): number => {
    if (playerCount <= 2) return 1;
    if (playerCount <= 4) return 2;
    return 3;
  };
  const promptDroneTarget = (): string | null => {
    const playerIds = Object.keys(G?.players ?? {}).filter((pid) => pid !== id);
    if (playerIds.length === 0) return null;
    const ranks = sharedRanks;
    const options = playerIds
      .map((pid, index) => {
        const currentRankId = G?.ranks?.[pid] ?? '';
        const currentIdx = ranks.findIndex((r) => r.id === currentRankId);
        const lower = currentIdx > 0 ? ranks[currentIdx - 1] : null;
        return `${index + 1}: ${playerLabelById(pid)} (#${pid})${lower ? ` -> ${lower.name}` : ` (${lang === 'uk' ? 'мінімальне звання' : 'minimum rank'})`}`;
      })
      .join('\n');
    const value = window.prompt(
      `${lang === 'uk' ? 'Оберіть ціль для «Дрончик»' : 'Choose target for "Drone"}:\n${options}\n${lang === 'uk' ? 'Введіть номер або playerID.' : 'Enter option number or playerID.'}`,
    );
    if (value === null) return null;
    const trimmed = value.trim();
    const byIndex = Number(trimmed);
    const target = Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= playerIds.length ? playerIds[byIndex - 1] : (playerIds.includes(trimmed) ? trimmed : null);
    if (!target) return null;

    const targetRankId = G?.ranks?.[target] ?? '';
    const targetRankIdx = ranks.findIndex((r) => r.id === targetRankId);
    if (targetRankIdx <= 0) {
      window.alert(lang === 'uk'
        ? 'Проти цього гравця зараз зіграти не можна: у нього вже мінімальне звання.'
        : 'Cannot play against this player now: they already have the minimum rank.');
      return null;
    }
    const lowerRank = ranks[targetRankIdx - 1];
    const occupied = Object.entries(G?.ranks ?? {}).filter(([pid, rankId]) => pid !== target && rankId === lowerRank.id).length;
    const playerCount = Object.keys(G?.players ?? {}).length || 2;
    if (occupied >= rankSeatLimit(playerCount)) {
      window.alert(lang === 'uk'
        ? 'Проти цього гравця зараз зіграти не можна: усі місця в нижчому званні зайняті.'
        : 'Cannot play against this player now: all seats in the lower rank are occupied.');
      return null;
    }
    return target;
  };
  const promptWaterResource = (): ResourceKey | null => {
    const options = (Object.keys(resourceLabels) as ResourceKey[])
      .map((key, index) => `${index + 1}: ${resourceLabels[key]} (${resources[key] ?? 0})`)
      .join('\n');
    const value = window.prompt(
      `${lang === 'uk' ? 'Оберіть ресурс для відновлення до 3' : 'Choose a resource to restore to 3'}:\n${options}\n${
        lang === 'uk' ? 'Введіть номер або ключ ресурсу.' : 'Enter option number or resource key.'
      }`,
    );
    if (value === null) return null;
    const trimmed = value.trim();
    const byIndex = Number(trimmed);
    const ordered = Object.keys(resourceLabels) as ResourceKey[];
    if (Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= ordered.length) {
      return ordered[byIndex - 1];
    }
    if (ordered.includes(trimmed as ResourceKey)) return trimmed as ResourceKey;
    return null;
  };
  const togglePreview = (key: string) => {
    setOpenPreviewKey((prev) => (prev === key ? null : key));
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
      </div>

      <h2>{t.boardArea}</h2>
      <div className="play-area">
        <div className="pile pile-actions">
          <p>{lang === 'uk' ? 'Дії' : 'Actions'}</p>
          <div className="board-actions">
            <button type="button" onClick={() => moves.drawCard()} disabled={!canDraw}>
              {t.draw}
            </button>
            <button type="button" onClick={() => moves.promote()} disabled={!canPlay}>
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
            {deckBackImage ? (
              <div className="pile-preview">
                <img src={deckBackImage} alt={t.drawPile} onClick={(e) => { e.stopPropagation(); togglePreview('pile-deck-back'); }} />
                <div className={`game-card-popover${openPreviewKey === 'pile-deck-back' ? ' is-open' : ''}`} aria-hidden={openPreviewKey !== 'pile-deck-back'}>
                  <img src={deckBackImage} alt={t.drawPile} />
                </div>
              </div>
            ) : (
              <div className="pile-back-fallback">JOJ</div>
            )}
          </div>
        </div>
        <div className="pile">
          <p>{t.discardPile} ({G.discard?.length ?? 0})</p>
          <div className="pile-card">
            {lastDiscard ? (
              <div className="pile-preview">
                <img
                  src={normalizeImagePath(lastDiscard.image) ?? `/cards/${lastDiscard.id}.png`}
                  alt={cardTitle(lastDiscard.id, lastDiscard.title, lang)}
                  onClick={(e) => { e.stopPropagation(); togglePreview(`pile-discard-${lastDiscard.id}`); }}
                />
                <div className={`game-card-popover${openPreviewKey === `pile-discard-${lastDiscard.id}` ? ' is-open' : ''}`} aria-hidden={openPreviewKey !== `pile-discard-${lastDiscard.id}`}>
                  <img
                    src={normalizeImagePath(lastDiscard.image) ?? `/cards/${lastDiscard.id}.png`}
                    alt={cardTitle(lastDiscard.id, lastDiscard.title, lang)}
                  />
                </div>
              </div>
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
      <div className="hand">
        {hand.map((card) => {
          const effectEntries = card.effects ?? [];
          return (
          <div
            key={card.id}
            className="game-card"
          >
            <button
              type="button"
              className="game-card-inline-action"
              onClick={() => {
                if (!canPlay) return;
                const target = card.category === 'LYAP' ? promptLyapTarget() : undefined;
                if (card.category === 'LYAP' && !target) return;
                moves.playCard(card.id, [], target);
              }}
              disabled={!canPlay}
            >
              {t.playLegendaryCard}
            </button>
            <div className="game-card-media">
              <img
                src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                alt={cardTitle(card.id, card.title, lang)}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePreview(`hand-${card.id}`);
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className={`game-card-popover${openPreviewKey === `hand-${card.id}` ? ' is-open' : ''}`} aria-hidden={openPreviewKey !== `hand-${card.id}`}>
              <img
                src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                alt={cardTitle(card.id, card.title, lang)}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="game-card-body">
              <strong>{cardTitle(card.id, card.title, lang)}</strong>
              <small>{categoryLabel(card.category, lang)}</small>
              {effectEntries.length ? (
                <div className="game-card-row">
                  {effectEntries.map((effect, index) => (
                    <span key={`effect-${card.id}-${effect.resource}-${index}`} className="pill pill-effect">
                      {effectLabel(effect.resource)}: {effect.value > 0 ? `+${effect.value}` : effect.value}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          );
        })}
      </div>

      <h2>{t.legendaryHand} ({legendaryHand.length})</h2>
      <p className="legendary-hint">{t.legendaryHandHint}</p>
      <div className="hand">
        {legendaryHand.map((card) => {
          const effectEntries = card.effects ?? [];
          return (
            <div
              key={`legendary-${card.id}`}
              className="game-card"
            >
              <button
                type="button"
                className="game-card-inline-action"
                onClick={() => {
                  const target = card.id === 'legendary-10' ? promptDroneTarget() : undefined;
                  if (card.id === 'legendary-10' && !target) return;
                  const needsResourceChoice = card.id === 'legendary-09' || card.id === 'legendary-06';
                  const selectedResource = needsResourceChoice ? promptWaterResource() : undefined;
                  if (needsResourceChoice && !selectedResource) return;
                  moves.playLegendaryCard(card.id, target, selectedResource ?? undefined);
                }}
                disabled={typeof moves.playLegendaryCard !== 'function'}
              >
                {t.playLegendaryCard}
              </button>
              <div className="game-card-media">
                <img
                  src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                  alt={cardTitle(card.id, card.title, lang)}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePreview(`legendary-${card.id}`);
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className={`game-card-popover${openPreviewKey === `legendary-${card.id}` ? ' is-open' : ''}`} aria-hidden={openPreviewKey !== `legendary-${card.id}`}>
                <img
                  src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                  alt={cardTitle(card.id, card.title, lang)}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="game-card-body">
                <strong>{cardTitle(card.id, card.title, lang)}</strong>
                <small>{t.legendaryDeckLabel}</small>
                {effectEntries.length ? (
                  <div className="game-card-row">
                    {effectEntries.map((effect, index) => (
                      <span key={`legendary-effect-${card.id}-${effect.resource}-${index}`} className="pill pill-effect">
                        {effectLabel(effect.resource)}: {effect.value > 0 ? `+${effect.value}` : effect.value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p>
        {t.legendaryDiscardPile}: {G.legendaryDiscard?.length ?? 0}
        {lastLegendaryDiscard ? ` | ${t.lastPlayedCard}: ${cardTitle(lastLegendaryDiscard.id, lastLegendaryDiscard.title, lang)}` : ''}
      </p>

      {ctx.gameover ? <p className="gameover">{t.winner}: {playerLabelById(String(ctx.gameover.winner ?? ''))}</p> : null}
      </div>
      <aside className="board-chat">
        <h3>{t.chatTitle}</h3>
        <div className="chat-log" ref={chatLogRef}>
          {(G.chat ?? []).map((row) => {
            const author = row.type === 'system'
              ? t.systemTag
              : playerLabelById(row.playerID);
            return (
              <p key={row.id} className={row.type === 'system' ? 'chat-system' : 'chat-player'}>
                <strong>{author}:</strong> {row.text}
              </p>
            );
          })}
        </div>
        <form
          className="chat-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            sendChatMessage();
          }}
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={t.chatPlaceholder}
          />
          <button
            type="submit"
          >
            {t.sendMessage}
          </button>
        </form>
      </aside>
    </section>
  );
};
