import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from '../game/types';
import { normalizeImagePath } from '../game/imagePaths';
import { canPlayHandCardAtStage } from '../game/turnRules';
import { cardTitle, categoryLabel, rankLabel, text } from './i18n';
import { BoardChatPanel, GameCardTile, PilePreview } from './board/components';
import { buildNextRankHint, getBoardPromoteBlockedReason, getBoardVvnzBlockedReason, getNextRankSeatMeta } from './board/rankHints';
import type { LocalizedBoardProps } from './board/types';

const RESOURCE_ORDER: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

type PendingSelection =
  | { type: 'hand-lyap'; cardId: string }
  | { type: 'legendary-drone'; cardId: string }
  | { type: 'legendary-water'; cardId: string };

type NoticeKind = 'info' | 'error' | 'success';
type Notice = { type: NoticeKind; text: string } | null;

type HandFilter = 'all' | 'playable' | CardDefinition['category'];
type HandSort = 'default' | 'playable' | 'category' | 'title';
type SidePanelTab = 'events' | 'chat';

type PendingConfirm =
  | { kind: 'promote'; nextRankName?: string | null; reason?: string | null }
  | { kind: 'play-card'; card: CardDefinition; targetId?: string }
  | { kind: 'play-legendary'; card: CardDefinition; targetId?: string; resource?: ResourceKey };

type PinnedCardView = {
  id: string;
  title: string;
  image?: string;
  categoryText: string;
  effects?: CardDefinition['effects'];
  sourceLabel: string;
};

const stageLabel = (stage: string | undefined, t: ReturnType<typeof text>) =>
  stage === 'draw' ? t.stageDraw : stage === 'play' ? t.stagePlay : stage === 'end' ? t.stageEnd : t.stageWaiting;

const fmtDelta = (value: number) => (value > 0 ? `+${value}` : String(value));

const isPlayAllowedForCard = (args: {
  card: CardDefinition;
  canPlayHandCard: boolean;
  resources: Record<ResourceKey, number>;
  G: JojGameState;
  playerID: string;
  sharedRanks: RankDefinition[];
  resourceLabels: Record<ResourceKey, string>;
  lang: 'uk' | 'en';
}) => {
  if (!args.canPlayHandCard) return false;
  if (args.card.category !== 'VVNZ') return true;
  return !getBoardVvnzBlockedReason({
    card: args.card,
    G: args.G,
    playerID: args.playerID,
    sharedRanks: args.sharedRanks,
    resources: args.resources,
    resourceLabels: args.resourceLabels,
    lang: args.lang,
  });
};

export const BoardV2 = ({
  G,
  ctx,
  moves,
  playerID,
  lang = 'uk',
  playerName = '',
  knownPlayerNames = {},
  sharedRanks = [],
  roomMeta,
  onLeaveRoom,
  onStateChange,
}: LocalizedBoardProps) => {
  const t = text(lang);
  const v2 = {
    commandCenter: lang === 'uk' ? 'Пульт ходу' : 'Command center',
    whatNow: lang === 'uk' ? 'Що можна зробити зараз' : 'Available actions now',
    handFilter: lang === 'uk' ? 'Фільтр руки' : 'Hand filter',
    handSort: lang === 'uk' ? 'Сортування' : 'Sort',
    filterAll: lang === 'uk' ? 'Усі' : 'All',
    filterPlayable: lang === 'uk' ? 'Можна зіграти' : 'Playable',
    sortDefault: lang === 'uk' ? 'Як у руці' : 'Default',
    sortPlayable: lang === 'uk' ? 'Спочатку playable' : 'Playable first',
    sortCategory: lang === 'uk' ? 'За категорією' : 'By category',
    sortTitle: lang === 'uk' ? 'За назвою' : 'By title',
    pickTarget: lang === 'uk' ? 'Оберіть ціль' : 'Choose target',
    pickResource: lang === 'uk' ? 'Оберіть ресурс' : 'Choose resource',
    cancel: lang === 'uk' ? 'Скасувати' : 'Cancel',
    confirmDrawFirst: lang === 'uk' ? 'Спочатку доберіть карту на етапі добору.' : 'Draw first during the draw stage.',
    actionUnavailable: lang === 'uk' ? 'Зараз ця дія недоступна.' : 'This action is unavailable now.',
    targetRequired: lang === 'uk' ? 'Спершу оберіть ціль нижче.' : 'Choose a target below first.',
    resourceRequired: lang === 'uk' ? 'Спершу оберіть ресурс нижче.' : 'Choose a resource below first.',
    recentEvents: lang === 'uk' ? 'Останні події' : 'Recent events',
    tableState: lang === 'uk' ? 'Стіл' : 'Table',
    playersOverview: lang === 'uk' ? 'Гравці' : 'Players',
    nextRankProgress: lang === 'uk' ? 'Прогрес до наступного звання' : 'Next rank progress',
    noNextRank: lang === 'uk' ? 'Наступного звання немає' : 'No next rank',
    occupiedSeats: lang === 'uk' ? 'Зайняті місця' : 'Occupied seats',
    blockedReason: lang === 'uk' ? 'Причина блокування' : 'Blocked because',
    compact: lang === 'uk' ? 'Компактний режим' : 'Compact mode',
    selectableTargetHint: lang === 'uk' ? 'Клікніть по гравцю нижче' : 'Click a player below',
    selectableResourceHint: lang === 'uk' ? 'Клікніть по ресурсу нижче' : 'Click a resource below',
    you: lang === 'uk' ? 'Ви' : 'You',
    chooseForCard: lang === 'uk' ? 'для карти' : 'for card',
    canPlayNow: lang === 'uk' ? 'можна зіграти зараз' : 'playable now',
    notNow: lang === 'uk' ? 'не зараз' : 'not now',
    requiresTarget: lang === 'uk' ? 'потрібна ціль' : 'needs target',
    requiresResource: lang === 'uk' ? 'потрібен ресурс' : 'needs resource',
    keyboardHint: lang === 'uk' ? 'D — добір, E — завершити хід, Esc — скасувати вибір' : 'D — draw, E — end turn, Esc — cancel selection',
    stepAssistant: lang === 'uk' ? 'Помічник ходу' : 'Turn assistant',
    step1: lang === 'uk' ? '1. Оберіть дію' : '1. Choose action',
    step2: lang === 'uk' ? '2. Оберіть параметри' : '2. Choose parameters',
    step3: lang === 'uk' ? '3. Підтвердіть' : '3. Confirm',
    confirmAction: lang === 'uk' ? 'Підтвердити дію' : 'Confirm action',
    previewOutcome: lang === 'uk' ? 'Попередній результат' : 'Outcome preview',
    cost: lang === 'uk' ? 'Вартість' : 'Cost',
    effects: lang === 'uk' ? 'Ефекти' : 'Effects',
    target: lang === 'uk' ? 'Ціль' : 'Target',
    selectedResource: lang === 'uk' ? 'Ресурс' : 'Resource',
    tokens: lang === 'uk' ? 'Токени і стани' : 'Tokens & statuses',
    shieldUntil: lang === 'uk' ? 'Щит до ходу' : 'Shield until turn',
    extraHandToken: lang === 'uk' ? 'Додатковий розіграш з руки' : 'Extra hand play',
    sukhpayPending: lang === 'uk' ? 'Сухпай очікує' : 'Sukhpay pending',
    sukhpayUntil: lang === 'uk' ? 'Сухпай активний до ходу' : 'Sukhpay active until turn',
    threatPanel: lang === 'uk' ? 'Опоненти: загрози / інтел' : 'Opponents: threat / intel',
    nearPromotion: lang === 'uk' ? 'близько до підвищення' : 'close to promotion',
    discardViewer: lang === 'uk' ? 'Перегляд скиду' : 'Discard viewer',
    normalDiscard: lang === 'uk' ? 'Звичайний скид' : 'Discard pile',
    legendaryDiscard: lang === 'uk' ? 'Легендарний скид' : 'Legendary discard',
    pinCard: lang === 'uk' ? 'Закріпити' : 'Pin',
    pinnedCard: lang === 'uk' ? 'Закріплена карта' : 'Pinned card',
    noPinnedCard: lang === 'uk' ? 'Ще не вибрано карту для закріплення' : 'No pinned card selected yet',
    openChat: lang === 'uk' ? 'Чат' : 'Chat',
    openEvents: lang === 'uk' ? 'Події' : 'Events',
    mobileActions: lang === 'uk' ? 'Швидкі дії (mobile)' : 'Quick actions (mobile)',
    deficit: lang === 'uk' ? 'Не вистачає' : 'Missing',
    actionLane: lang === 'uk' ? 'Смуга дії' : 'Action lane',
    selectedCard: lang === 'uk' ? 'Обрана карта' : 'Selected card',
    selectedAction: lang === 'uk' ? 'Обрана дія' : 'Selected action',
    waitingAction: lang === 'uk' ? 'Оберіть карту або дію для продовження ходу.' : 'Choose a card or action to continue your turn.',
    stageFocusDraw: lang === 'uk' ? 'Фокус етапу: доберіть карту, щоб відкрити варіанти розіграшу.' : 'Stage focus: draw a card to unlock play options.',
    stageFocusPlay: lang === 'uk' ? 'Фокус етапу: розігруйте карти, оцінюйте наслідки, плануйте підвищення.' : 'Stage focus: play cards, review outcomes, plan promotion.',
    stageFocusEnd: lang === 'uk' ? 'Фокус етапу: завершіть комбінацію або закрийте хід.' : 'Stage focus: finalize your combo or end the turn.',
    targetableNow: lang === 'uk' ? 'можна цілити зараз' : 'targetable now',
    seatBlocked: lang === 'uk' ? 'місця зайняті' : 'seat blocked',
    threatHigh: lang === 'uk' ? 'висока загроза' : 'high threat',
    threatMedium: lang === 'uk' ? 'середня загроза' : 'medium threat',
    threatLow: lang === 'uk' ? 'низька загроза' : 'low threat',
    handCardsLabel: lang === 'uk' ? 'Карти в руці' : 'Hand cards',
    activeRoom: lang === 'uk' ? 'Активна кімната' : 'Active room',
    joinedAs: lang === 'uk' ? 'Ви в кімнаті як' : 'You are in room as',
    leaveRoom: lang === 'uk' ? 'Вийти з кімнати' : 'Leave room',
  };

  const id = playerID ?? '0';
  const hand = G?.hands?.[id] ?? [];
  const legendaryHand = G?.legendaryHands?.[id] ?? [];
  const resources = G?.resources?.[id];
  const rankId = G?.ranks?.[id];
  const rankName = sharedRanks.find((row) => row.id === (rankId ?? ''))?.name ?? rankLabel(rankId ?? '', lang);
  const resourceLabels: Record<ResourceKey, string> = t.resources;
  const isCurrentPlayer = ctx?.currentPlayer === id;
  const stage = ctx?.activePlayers?.[id] as string | undefined;
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
  const [chatInput, setChatInput] = useState('');
  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<ResourceKey | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [handFilter, setHandFilter] = useState<HandFilter>('all');
  const [handSort, setHandSort] = useState<HandSort>('playable');
  const [compactMode, setCompactMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('joj-ui-v2-compact') === '1';
  });
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('events');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [pinnedCard, setPinnedCard] = useState<PinnedCardView | null>(null);
  const syncedNameRef = useRef('');
  const syncedNamesSignatureRef = useRef('');
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  const playerLabelById = (idValue: string | null | undefined) => {
    if (!idValue) return t.systemTag;
    const name = G?.playerNames?.[idValue]?.trim() || knownPlayerNames[idValue]?.trim();
    return name || t.genericPlayer;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('joj-ui-v2-compact', compactMode ? '1' : '0');
  }, [compactMode]);

  useEffect(() => {
    if (!G || !ctx) return;
    onStateChange?.({ G, ctx });
  }, [G, ctx, onStateChange]);

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
    if (!entries.length) return;
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
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (event.key === 'Escape') {
        setOpenPreviewKey(null);
        setPendingSelection(null);
        setSelectedTargetId(null);
        setSelectedResource(null);
        return;
      }
      if (event.key.toLowerCase() === 'd' && canDraw && typeof moves.drawCard === 'function') {
        event.preventDefault();
        moves.drawCard();
      }
      if (event.key.toLowerCase() === 'e' && canEndTurn && typeof moves.pass === 'function') {
        event.preventDefault();
        moves.pass();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canDraw, canEndTurn, moves]);

  useEffect(() => {
    setPendingSelection(null);
    setPendingConfirm(null);
    setSelectedTargetId(null);
    setSelectedResource(null);
  }, [ctx?.turn, stage, id]);

  const effectLabel = (resource: ResourceKey | 'rank') => (resource === 'rank' ? t.rankResource : resourceLabels[resource]);
  const togglePreview = (key: string) => setOpenPreviewKey((prev) => (prev === key ? null : key));
  const sendChatMessage = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    if (typeof moves.sendChat === 'function') moves.sendChat(msg);
    setChatInput('');
  };
  const postNotice = (type: NoticeKind, msg: string) => setNotice(msg ? { type, text: msg } : null);

  const getPromoteBlockedReason = () => {
    if (!G || !resources) return null;
    return getBoardPromoteBlockedReason({ G, playerID: id, sharedRanks, resourceLabels, lang });
  };

  const nextRankMeta = useMemo(() => {
    if (!G || !resources) return null;
    return getNextRankSeatMeta({ G, playerID: id, sharedRanks });
  }, [G, id, sharedRanks, resources]);

  const playerIds = useMemo(() => Object.keys(G?.players ?? {}), [G?.players]);
  const latestEvents = (G?.chat ?? []).slice(-8).reverse();

  const pinCardFromSource = (card: CardDefinition, sourceLabel: string, categoryText?: string) => {
    setPinnedCard({
      id: card.id,
      title: cardTitle(card.id, card.title, lang),
      image: normalizeImagePath(card.image) ?? `/cards/${card.id}.png`,
      categoryText: categoryText ?? categoryLabel(card.category, lang),
      effects: card.effects,
      sourceLabel,
    });
  };

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

  const requestPlayHandCard = (card: CardDefinition) => {
    if (!canPlayHandCard) {
      postNotice('error', v2.actionUnavailable);
      return;
    }
    const vvnzReason = resources && G ? getBoardVvnzBlockedReason({ card, G, playerID: id, sharedRanks, resources, resourceLabels, lang }) : null;
    if (vvnzReason) {
      postNotice('error', vvnzReason);
      return;
    }
    if (card.category === 'LYAP') {
      setPendingSelection({ type: 'hand-lyap', cardId: card.id });
      setPendingConfirm(null);
      setSelectedTargetId(null);
      postNotice('info', `${v2.pickTarget}: ${cardTitle(card.id, card.title, lang)}`);
      return;
    }
    setPendingConfirm({ kind: 'play-card', card });
    postNotice('info', `${v2.confirmAction}: ${cardTitle(card.id, card.title, lang)}`);
  };

  const requestPlayLegendaryCard = (card: CardDefinition) => {
    if (typeof moves.playLegendaryCard !== 'function') return;
    if (card.id === 'legendary-10') {
      setPendingSelection({ type: 'legendary-drone', cardId: card.id });
      setPendingConfirm(null);
      setSelectedTargetId(null);
      postNotice('info', `${v2.pickTarget}: ${cardTitle(card.id, card.title, lang)}`);
      return;
    }
    if (card.id === 'legendary-09' || card.id === 'legendary-06') {
      setPendingSelection({ type: 'legendary-water', cardId: card.id });
      setPendingConfirm(null);
      setSelectedResource(null);
      postNotice('info', `${v2.pickResource}: ${cardTitle(card.id, card.title, lang)}`);
      return;
    }
    setPendingConfirm({ kind: 'play-legendary', card });
    postNotice('info', `${v2.confirmAction}: ${cardTitle(card.id, card.title, lang)}`);
  };

  const confirmPendingSelection = () => {
    if (!pendingSelection) return;
    if (pendingSelection.type === 'hand-lyap') {
      if (!selectedTargetId) return postNotice('error', v2.targetRequired);
      const card = hand.find((c) => c.id === pendingSelection.cardId);
      if (!card) return;
      setPendingConfirm({ kind: 'play-card', card, targetId: selectedTargetId });
    }
    if (pendingSelection.type === 'legendary-drone') {
      if (!selectedTargetId) return postNotice('error', v2.targetRequired);
      const card = legendaryHand.find((c) => c.id === pendingSelection.cardId);
      if (!card) return;
      setPendingConfirm({ kind: 'play-legendary', card, targetId: selectedTargetId });
    }
    if (pendingSelection.type === 'legendary-water') {
      if (!selectedResource) return postNotice('error', v2.resourceRequired);
      const card = legendaryHand.find((c) => c.id === pendingSelection.cardId);
      if (!card) return;
      setPendingConfirm({ kind: 'play-legendary', card, resource: selectedResource });
    }
    setPendingSelection(null);
    postNotice('info', v2.confirmAction);
  };

  const confirmPendingAction = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === 'promote') {
      if (!canPlay) return postNotice('error', v2.actionUnavailable);
      const reason = getPromoteBlockedReason();
      if (reason) return postNotice('error', reason);
      moves.promote();
    } else if (pendingConfirm.kind === 'play-card') {
      if (!canPlayHandCard) return postNotice('error', v2.actionUnavailable);
      moves.playCard(pendingConfirm.card.id, [], pendingConfirm.targetId);
    } else if (pendingConfirm.kind === 'play-legendary') {
      moves.playLegendaryCard?.(pendingConfirm.card.id, pendingConfirm.targetId, pendingConfirm.resource);
    }
    setPendingConfirm(null);
    setSelectedTargetId(null);
    setSelectedResource(null);
    setNotice(null);
  };

  const currentPendingCard = pendingSelection
    ? [...hand, ...legendaryHand].find((c) => c.id === pendingSelection.cardId)
    : null;

  if (!G || !ctx || !resources) {
    return <section className="board"><p>{t.loading}</p></section>;
  }

  const promoteReason = getPromoteBlockedReason();
  const activeSelectionNeedsTarget = pendingSelection?.type === 'hand-lyap' || pendingSelection?.type === 'legendary-drone';
  const activeSelectionNeedsResource = pendingSelection?.type === 'legendary-water';
  const confirmCard = pendingConfirm?.kind === 'play-card' || pendingConfirm?.kind === 'play-legendary' ? pendingConfirm.card : null;
  const pendingTargetLabel =
    pendingConfirm && pendingConfirm.kind !== 'promote' && pendingConfirm.targetId
      ? playerLabelById(pendingConfirm.targetId)
      : null;
  const pendingResourceKey = pendingConfirm?.kind === 'play-legendary' ? pendingConfirm.resource : undefined;
  const pendingCost = pendingConfirm?.kind === 'promote' ? (nextRankMeta?.nextRank?.cost ?? {}) : (confirmCard?.cost ?? {});
  const pendingEffects = pendingConfirm?.kind === 'promote' ? (nextRankMeta?.nextRank?.bonus ?? {}) : null;
  const highlightedResources = new Set<ResourceKey>();
  const deficitByResource: Partial<Record<ResourceKey, number>> = {};
  for (const key of RESOURCE_ORDER) {
    const need = pendingCost?.[key] ?? 0;
    if (need > 0) {
      highlightedResources.add(key);
      const have = resources[key] ?? 0;
      if (have < need) deficitByResource[key] = need - have;
    }
    if (pendingResourceKey && pendingResourceKey === key) highlightedResources.add(key);
  }

  const threatRows = playerIds
    .filter((pid) => pid !== id)
    .map((pid) => {
      const pRes = G.resources?.[pid];
      const meta = getNextRankSeatMeta({ G, playerID: pid, sharedRanks });
      const reqs = meta.nextRank?.requirement ?? {};
      let reqTotal = 0;
      let reqMet = 0;
      for (const key of RESOURCE_ORDER) {
        const need = reqs[key] ?? 0;
        if (!need) continue;
        reqTotal += need;
        reqMet += Math.min(pRes?.[key] ?? 0, need);
      }
      const ratio = reqTotal > 0 ? reqMet / reqTotal : 0;
      return {
        pid,
        ratio,
        nextRank: meta.nextRank?.name ?? null,
        seatBlocked: meta.seatBlocked,
        shieldUntil: G.lyapScandalShieldUntilTurn?.[pid] ?? 0,
        extraToken: G.extraHandPlayTokens?.[pid] ?? 0,
        sukhpayPending: Boolean(G.sukhpayZsuPendingBonus?.[pid]),
      };
    })
    .sort((a, b) => b.ratio - a.ratio);

  const currentStageFocus =
    stage === 'draw' ? v2.stageFocusDraw : stage === 'play' ? v2.stageFocusPlay : stage === 'end' ? v2.stageFocusEnd : '';
  const stageClass = stage ? `is-stage-${stage}` : 'is-stage-waiting';
  const actionLaneCard = currentPendingCard ?? confirmCard ?? null;
  const actionLaneActionLabel = pendingConfirm
    ? pendingConfirm.kind === 'promote'
      ? t.promote
      : cardTitle(pendingConfirm.card.id, pendingConfirm.card.title, lang)
    : pendingSelection
      ? cardTitle(currentPendingCard?.id ?? '', currentPendingCard?.title ?? '', lang)
      : null;
  const resourcePreviewAfter = Object.fromEntries(
    RESOURCE_ORDER.map((key) => {
      const deltaCost = pendingCost?.[key] ?? 0;
      const deltaBonus = pendingEffects?.[key] ?? 0;
      return [key, (resources[key] ?? 0) - deltaCost + deltaBonus];
    }),
  ) as Record<ResourceKey, number>;

  return (
    <section className={`game-ui-v2-shell ${stageClass}${compactMode ? ' is-compact' : ''}`}>
      <header className="game-ui-v2-header">
        <div>
          <p className="game-ui-v2-kicker">JOJ V2</p>
          <h2>{isCurrentPlayer ? (lang === 'uk' ? 'Ваш хід' : 'Your turn') : (lang === 'uk' ? 'Стіл гри' : 'Game table')}</h2>
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
          <label className="game-ui-v2-toggle">
            <input type="checkbox" checked={compactMode} onChange={(e) => setCompactMode(e.target.checked)} />
            <span>{v2.compact}</span>
          </label>
        </div>
      </header>

      <div className="game-ui-v2-grid">
        <div className="game-ui-v2-main">
          <section className="game-ui-v2-command">
            <div className="game-ui-v2-command-top">
              <div>
                <p className="game-ui-v2-kicker">{v2.commandCenter}</p>
                <h3>{playerLabelById(ctx.currentPlayer)}</h3>
                <p className="game-ui-v2-subtle">{t.turnStage}: {stageLabel(stage, t)} · {t.yourRank}: {rankName}</p>
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
                  setPendingConfirm({ kind: 'promote', nextRankName: nextRankMeta?.nextRank?.name ?? null, reason: null });
                  postNotice('info', `${v2.confirmAction}: ${t.promote}`);
                }} disabled={!canPlay}>{t.promote}</button>
                <button type="button" onClick={() => { if (!canEndTurn) return; moves.pass(); setNotice(null); }} disabled={!canEndTurn}>{t.endTurn}</button>
              </div>
            </div>
            <div className="game-ui-v2-chip-row" aria-label={v2.whatNow}>
              <span className={`game-ui-v2-chip${canDraw ? ' is-active' : ''}`}>{t.draw}</span>
              <span className={`game-ui-v2-chip${canPlayHandCard ? ' is-active' : ''}`}>{t.playLegendaryCard}</span>
              <span className={`game-ui-v2-chip${canPlay && !promoteReason ? ' is-active' : ''}`}>{t.promote}</span>
              {mustDiscardOverflow ? <span className="game-ui-v2-chip is-warn">{lang === 'uk' ? `Скинути ${handOverflow}` : `Discard ${handOverflow}`}</span> : null}
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
            {notice ? <p className={`game-ui-v2-notice is-${notice.type}`}>{notice.text}</p> : null}
          </section>

          <section className="game-ui-v2-action-lane">
            <div className="game-ui-v2-action-lane-head">
              <div>
                <p className="game-ui-v2-kicker">{v2.actionLane}</p>
                <h3>{v2.previewOutcome}</h3>
              </div>
            </div>
            <div className="game-ui-v2-action-lane-grid">
              <div className="game-ui-v2-action-slot">
                <strong>{v2.selectedAction}</strong>
                <p className="game-ui-v2-subtle">
                  {actionLaneActionLabel ?? (pendingConfirm?.kind === 'promote' ? t.promote : v2.waitingAction)}
                </p>
                {pendingTargetLabel ? <p className="game-ui-v2-subtle">{v2.target}: {pendingTargetLabel}</p> : null}
                {pendingResourceKey ? <p className="game-ui-v2-subtle">{v2.selectedResource}: {resourceLabels[pendingResourceKey]}</p> : null}
              </div>
              <div className="game-ui-v2-action-slot">
                <strong>{v2.selectedCard}</strong>
                {actionLaneCard ? (
                  <div className="game-ui-v2-lane-card-mini">
                    <img src={normalizeImagePath(actionLaneCard.image) ?? `/cards/${actionLaneCard.id}.png`} alt={cardTitle(actionLaneCard.id, actionLaneCard.title, lang)} />
                    <div>
                      <div>{cardTitle(actionLaneCard.id, actionLaneCard.title, lang)}</div>
                      <small>{categoryLabel(actionLaneCard.category, lang)}</small>
                    </div>
                  </div>
                ) : <p className="game-ui-v2-subtle">{v2.waitingAction}</p>}
              </div>
              <div className="game-ui-v2-action-slot">
                <strong>{lang === 'uk' ? 'Після підтвердження' : 'After confirm'}</strong>
                {pendingConfirm ? (
                  <div className="game-ui-v2-lane-resource-preview">
                    {RESOURCE_ORDER.map((key) => (
                      <span key={`after-${key}`} className={highlightedResources.has(key) ? 'is-highlighted' : ''}>
                        {resourceLabels[key]}: {resources[key]} → {resourcePreviewAfter[key]}
                      </span>
                    ))}
                  </div>
                ) : <p className="game-ui-v2-subtle">{v2.step3}</p>}
              </div>
            </div>
          </section>

          <section className="game-ui-v2-selection-panel">
            <div>
              <p className="game-ui-v2-kicker">{v2.stepAssistant}</p>
              <h3>{v2.previewOutcome}</h3>
            </div>
            {pendingConfirm ? (
              <div className="game-ui-v2-confirm-card">
                <p><strong>{v2.confirmAction}:</strong> {pendingConfirm.kind === 'promote' ? t.promote : cardTitle(confirmCard?.id ?? '', confirmCard?.title ?? '', lang)}</p>
                {pendingConfirm.kind === 'promote' && pendingConfirm.nextRankName ? <p className="game-ui-v2-subtle">{t.yourRank} → {pendingConfirm.nextRankName}</p> : null}
                {pendingTargetLabel ? <p className="game-ui-v2-subtle">{v2.target}: {pendingTargetLabel}</p> : null}
                {pendingResourceKey ? <p className="game-ui-v2-subtle">{v2.selectedResource}: {resourceLabels[pendingResourceKey]}</p> : null}
                {Object.keys(pendingCost ?? {}).length ? (
                  <p className="game-ui-v2-subtle">
                    <strong>{v2.cost}:</strong>{' '}
                    {RESOURCE_ORDER.filter((k) => (pendingCost?.[k] ?? 0) > 0).map((k) => `${resourceLabels[k]} ${fmtDelta(-(pendingCost?.[k] ?? 0))}`).join(', ')}
                  </p>
                ) : null}
                {pendingEffects && Object.keys(pendingEffects).length ? (
                  <p className="game-ui-v2-subtle">
                    <strong>{v2.effects}:</strong>{' '}
                    {RESOURCE_ORDER.filter((k) => (pendingEffects?.[k] ?? 0) !== 0).map((k) => `${resourceLabels[k]} ${fmtDelta(pendingEffects?.[k] ?? 0)}`).join(', ')}
                  </p>
                ) : null}
                {confirmCard?.effects?.length ? (
                  <p className="game-ui-v2-subtle">
                    <strong>{v2.effects}:</strong>{' '}
                    {confirmCard.effects.map((e) => `${effectLabel(e.resource)} ${fmtDelta(e.value)}`).join(', ')}
                  </p>
                ) : null}
                <div className="game-ui-v2-selection-actions">
                  <button type="button" onClick={confirmPendingAction}>{lang === 'uk' ? 'Підтвердити' : 'Confirm'}</button>
                  <button type="button" className="ghost" onClick={() => setPendingConfirm(null)}>{v2.cancel}</button>
                </div>
              </div>
            ) : (
              <p className="game-ui-v2-subtle">{pendingSelection ? (activeSelectionNeedsTarget ? v2.selectableTargetHint : v2.selectableResourceHint) : v2.step1}</p>
            )}
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
                      imageSrc={normalizeImagePath(lastDiscard.image) ?? `/cards/${lastDiscard.id}.png`}
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
            </div>
            <p className="game-ui-v2-subtle">{t.legendaryDiscardPile}: {G.legendaryDiscard?.length ?? 0}{lastLegendaryDiscard ? ` · ${cardTitle(lastLegendaryDiscard.id, lastLegendaryDiscard.title, lang)}` : ''}</p>
          </section>

          <section className="game-ui-v2-players">
            <h3>{v2.tokens}</h3>
            <div className="game-ui-v2-token-list">
              <div className="game-ui-v2-token-row"><span>{v2.extraHandToken}</span><strong>{G.extraHandPlayTokens?.[id] ?? 0}</strong></div>
              <div className="game-ui-v2-token-row"><span>{v2.sukhpayPending}</span><strong>{G.sukhpayZsuPendingBonus?.[id] ? t.yes : t.no}</strong></div>
              <div className="game-ui-v2-token-row"><span>{v2.sukhpayUntil}</span><strong>{G.sukhpayZsuWatchUntilTurn?.[id] ?? 0}</strong></div>
              <div className="game-ui-v2-token-row"><span>{v2.shieldUntil}</span><strong>{G.lyapScandalShieldUntilTurn?.[id] ?? 0}</strong></div>
            </div>
          </section>

          <section className="game-ui-v2-rank-panel">
            <h3>{v2.nextRankProgress}</h3>
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
                      <div key={`req-${key}`} className="game-ui-v2-progress-row">
                        <div className="game-ui-v2-progress-label"><span>{resourceLabels[key]}</span><span>{have}/{need}</span></div>
                        <div className="game-ui-v2-progress-bar"><i style={{ width: `${pct}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
                {promoteReason ? <p className="game-ui-v2-subtle"><strong>{v2.blockedReason}:</strong> {promoteReason}</p> : <p className="game-ui-v2-subtle">{buildNextRankHint({ G, playerID: id, sharedRanks, resources, resourceLabels, promoteLabel: t.promote, lang })}</p>}
              </>
            ) : <p className="game-ui-v2-subtle">{v2.noNextRank}</p>}
          </section>

          <section className="game-ui-v2-players">
            <h3>{v2.playersOverview}</h3>
            <div className="game-ui-v2-players-grid">
              {playerIds.map((pid) => {
                const pResources = G.resources?.[pid];
                const pRankId = G.ranks?.[pid] ?? '';
                const pRank = sharedRanks.find((r) => r.id === pRankId)?.name ?? rankLabel(pRankId, lang);
                const active = ctx.currentPlayer === pid;
                const selectable = activeSelectionNeedsTarget && pid !== id;
                const pMeta = getNextRankSeatMeta({ G, playerID: pid, sharedRanks });
                const pThreatRow = threatRows.find((row) => row.pid === pid);
                const threatBadge = !pThreatRow
                  ? null
                  : pThreatRow.ratio >= 0.8
                    ? v2.threatHigh
                    : pThreatRow.ratio >= 0.45
                      ? v2.threatMedium
                      : v2.threatLow;
                return (
                  <button
                    key={`player-${pid}`}
                    type="button"
                    className={`game-ui-v2-player-card${active ? ' is-active' : ''}${pid === id ? ' is-self' : ''}${selectedTargetId === pid ? ' is-selected' : ''}${selectable ? ' is-selectable' : ''}`}
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
                      <span>#{pid}{pid === id ? ` · ${v2.you}` : ''}</span>
                    </div>
                    <div className="game-ui-v2-player-rank">{pRank}</div>
                    <div className="game-ui-v2-player-badges">
                      {threatBadge ? <span className="pill pill-badge">{threatBadge}</span> : null}
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
          </section>

          <section className="game-ui-v2-events">
            <h3>{v2.threatPanel}</h3>
            <div className="game-ui-v2-events-list">
              {threatRows.map((row) => (
                <div key={`threat-${row.pid}`} className="game-ui-v2-event-row">
                  <strong>{playerLabelById(row.pid)} · {Math.round(row.ratio * 100)}% {v2.nearPromotion}</strong>
                  <span>
                    {(row.nextRank ?? '—')}
                    {row.seatBlocked ? ` · ${v2.seatBlocked}` : ''}
                    {row.shieldUntil ? ` · ${v2.shieldUntil}: ${row.shieldUntil}` : ''}
                    {row.extraToken ? ` · ${v2.extraHandToken}: ${row.extraToken}` : ''}
                    {row.sukhpayPending ? ` · ${v2.sukhpayPending}` : ''}
                  </span>
                </div>
              ))}
              {!threatRows.length ? <p className="game-ui-v2-subtle">{lang === 'uk' ? 'Немає опонентів' : 'No opponents'}</p> : null}
            </div>
          </section>

          {pendingSelection ? (
            <section className="game-ui-v2-selection-panel">
              <div>
                <p className="game-ui-v2-kicker">{activeSelectionNeedsTarget ? v2.pickTarget : v2.pickResource}</p>
                <h3>{currentPendingCard ? cardTitle(currentPendingCard.id, currentPendingCard.title, lang) : pendingSelection.cardId}</h3>
                <p className="game-ui-v2-subtle">{activeSelectionNeedsTarget ? v2.selectableTargetHint : v2.selectableResourceHint}</p>
              </div>
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
                <button type="button" onClick={confirmPendingSelection}>{lang === 'uk' ? 'Підтвердити' : 'Confirm'}</button>
                <button type="button" className="ghost" onClick={() => { setPendingSelection(null); setSelectedTargetId(null); setSelectedResource(null); setNotice(null); }}>{v2.cancel}</button>
              </div>
            </section>
          ) : null}

          <section className="game-ui-v2-hand-section">
            <div className="game-ui-v2-hand-head">
              <div>
                <h3>{t.yourHand} ({hand.length}/8)</h3>
                {mustDiscardOverflow ? (
                  <p className="game-ui-v2-subtle is-warn">{lang === 'uk'
                    ? `Наприкінці ходу скиньте ${handOverflow} карт(и) до ліміту 8. ЛЯП/СКАНДАЛ кнопкою скиду не скидаються.`
                    : `Before ending the turn, discard ${handOverflow} card(s) to return to hand limit 8. LYAP/SCANDAL cannot be discarded with discard button.`}</p>
                ) : null}
              </div>
              <div className="game-ui-v2-hand-controls">
                <label>
                  <span>{v2.handFilter}</span>
                  <select value={handFilter} onChange={(e) => setHandFilter(e.target.value as HandFilter)}>
                    <option value="all">{v2.filterAll}</option>
                    <option value="playable">{v2.filterPlayable}</option>
                    {['LYAP', 'SCANDAL', 'SUPPORT', 'DECISION', 'NEUTRAL', 'VVNZ'].map((category) => (
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
                    lang={lang}
                    categoryText={categoryLabel(card.category, lang)}
                    openPreviewKey={openPreviewKey}
                    previewKey={`v2-hand-preview-${card.id}`}
                    onTogglePreview={togglePreview}
                    onClosePreview={() => setOpenPreviewKey(null)}
                    actionLabel={lang === 'uk' ? 'Зіграти' : 'Play'}
                    onAction={() => requestPlayHandCard(card)}
                    actionDisabled={!canPlayHandCard}
                    extraAction={canDiscardThisCard ? {
                      label: lang === 'uk' ? 'Скинути' : 'Discard',
                      onClick: () => moves.discardFromHand?.(card.id),
                      disabled: typeof moves.discardFromHand !== 'function',
                      className: 'game-card-inline-discard',
                    } : undefined}
                    utilityAction={{
                      label: v2.pinCard,
                      onClick: () => pinCardFromSource(card, t.yourHand, categoryLabel(card.category, lang)),
                      className: 'game-card-inline-pin',
                    }}
                    effectLabel={effectLabel}
                    badges={badges}
                    helperText={helperText}
                  />
                );
              })}
            </div>
          </section>

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
                    lang={lang}
                    categoryText={t.legendaryDeckLabel}
                    openPreviewKey={openPreviewKey}
                    previewKey={`v2-legendary-preview-${card.id}`}
                    onTogglePreview={togglePreview}
                    onClosePreview={() => setOpenPreviewKey(null)}
                    actionLabel={lang === 'uk' ? 'Зіграти легендарну' : 'Play legendary'}
                    onAction={() => requestPlayLegendaryCard(card)}
                    actionDisabled={typeof moves.playLegendaryCard !== 'function'}
                    utilityAction={{
                      label: v2.pinCard,
                      onClick: () => pinCardFromSource(card, t.legendaryHand, t.legendaryDeckLabel),
                      className: 'game-card-inline-pin',
                    }}
                    effectLabel={effectLabel}
                    badges={badges.length ? badges : undefined}
                  />
                );
              })}
            </div>
          </section>

          {ctx.gameover ? (
            <p className="gameover">{t.winner}: {playerLabelById(String((ctx.gameover as { winner?: string }).winner ?? ''))}</p>
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
                    <span>{row.text}</span>
                  </div>
                );
              })}
              {!latestEvents.length ? <p className="game-ui-v2-subtle">{lang === 'uk' ? 'Подій ще немає' : 'No events yet'}</p> : null}
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
            />
          </section>

          <section className="game-ui-v2-events">
            <h3>{v2.pinnedCard}</h3>
            {pinnedCard ? (
              <div className="game-ui-v2-pinned">
                {pinnedCard.image ? <img src={pinnedCard.image} alt={pinnedCard.title} /> : null}
                <div>
                  <strong>{pinnedCard.title}</strong>
                  <p className="game-ui-v2-subtle">{pinnedCard.categoryText} · {pinnedCard.sourceLabel}</p>
                  {pinnedCard.effects?.length ? (
                    <p className="game-ui-v2-subtle">{pinnedCard.effects.map((e) => `${effectLabel(e.resource)} ${fmtDelta(e.value)}`).join(', ')}</p>
                  ) : null}
                </div>
              </div>
            ) : <p className="game-ui-v2-subtle">{v2.noPinnedCard}</p>}
          </section>
        </aside>
      </div>

      <div className="game-ui-v2-mobile-bar" aria-label={v2.mobileActions}>
        <button type="button" onClick={() => canDraw && moves.drawCard()} disabled={!canDraw}>{t.draw}</button>
        <button type="button" onClick={() => { if (!canPlay || promoteReason) return; setPendingConfirm({ kind: 'promote', nextRankName: nextRankMeta?.nextRank?.name ?? null, reason: null }); }} disabled={!canPlay || Boolean(promoteReason)}>{t.promote}</button>
        <button type="button" onClick={() => canEndTurn && moves.pass()} disabled={!canEndTurn}>{t.endTurn}</button>
      </div>
    </section>
  );
};
