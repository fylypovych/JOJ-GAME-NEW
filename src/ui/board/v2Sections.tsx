import type { ReactNode, RefObject } from 'react';
import type { CardDefinition, JojGameState, ResourceKey, RankDefinition } from '../../game/types';
import { buildReplacementSlots } from './replacement';
import { BoardChatPanel, GameCardTile } from './components';
import { cardTitle, localizeSystemMessageText, rankLabel } from '../i18n';
import type { BoardNotice } from './useBoardV2UiController';

const RESOURCE_ORDER: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

export const BoardV2SelectionPanel = (props: {
  pendingSelection: { type: string; cardId: string } | null;
  activeSelectionNeedsTarget: boolean;
  activeSelectionNeedsReplacement: boolean;
  activeSelectionNeedsResource: boolean;
  currentPendingCard: CardDefinition | null;
  selectedTargetId: string | null;
  setSelectedTargetId: (value: string | null) => void;
  opponentIds: string[];
  playerLabelById: (id: string | null | undefined) => string;
  v2: Record<string, string>;
  lang: 'uk' | 'en';
  replacementTargetIds: string[];
  G: JojGameState;
  replacementSelectionsByTarget: Record<string, ResourceKey[]>;
  replacementActiveTargetId: string | null;
  setActiveReplacementTargetId: (value: string | null) => void;
  replacementActiveSelected: ResourceKey[];
  replacementActiveSlots: ResourceKey[];
  replacementActiveTargetResources: Record<ResourceKey, number> | null;
  resourceLabels: Record<ResourceKey, string>;
  appendReplacementResource: (resource: ResourceKey) => void;
  undoReplacementResource: () => void;
  selectedResource: ResourceKey | null;
  setSelectedResource: (value: ResourceKey | null) => void;
  resources: Record<ResourceKey, number>;
  confirmPendingSelection: () => void;
  clearPendingSelection: () => void;
  pickTargetNotice: (targetId: string) => void;
}) => {
  const {
    pendingSelection,
    activeSelectionNeedsTarget,
    activeSelectionNeedsReplacement,
    activeSelectionNeedsResource,
    currentPendingCard,
    selectedTargetId,
    setSelectedTargetId,
    opponentIds,
    playerLabelById,
    v2,
    lang,
    replacementTargetIds,
    G,
    replacementSelectionsByTarget,
    replacementActiveTargetId,
    setActiveReplacementTargetId,
    replacementActiveSelected,
    replacementActiveSlots,
    replacementActiveTargetResources,
    resourceLabels,
    appendReplacementResource,
    undoReplacementResource,
    selectedResource,
    setSelectedResource,
    resources,
    confirmPendingSelection,
    clearPendingSelection,
    pickTargetNotice,
  } = props;
  if (!pendingSelection) return null;
  return (
    <div className="game-ui-v2-selection-panel game-ui-v2-selection-panel-inline">
      <div>
        <div className="game-ui-v2-steps" aria-label={v2.stepAssistant}>
          <span className={activeSelectionNeedsTarget ? 'is-done' : ''}>{v2.step1}</span>
          <span className={(!activeSelectionNeedsTarget && (activeSelectionNeedsReplacement || activeSelectionNeedsResource)) ? 'is-done' : ''}>{v2.step2}</span>
          <span>{v2.step3}</span>
        </div>
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
                  const targetResources = G?.resources?.[pid] ?? null;
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
                        className={`game-ui-v2-pick-chip${replacementActiveSlots[replacementActiveSelected.length] === key ? ' is-selected' : ''}`}
                        onClick={() => appendReplacementResource(key)}
                      >
                        {resourceLabels[key]} ({replacementActiveTargetResources?.[key] ?? 0})
                      </button>
                    ))}
                  </div>
                  <div className="game-ui-v2-selection-actions">
                    <button type="button" className="ghost" onClick={undoReplacementResource}>{v2.undoPick}</button>
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
        <button type="button" className="ghost" onClick={clearPendingSelection}>{v2.cancel}</button>
      </div>
    </div>
  );
};

export const BoardV2NoticeStack = (props: {
  notices: BoardNotice[];
  dismissNotice: (noticeId: string) => void;
}) => {
  if (!props.notices.length) return null;
  return (
    <div className="game-ui-v2-notice-stack" aria-live="polite">
      {props.notices.map((notice) => (
        <div key={notice.id} className={`game-ui-v2-notice is-${notice.type}`}>
          <span>{notice.text}</span>
          <button type="button" className="ghost" onClick={() => props.dismissNotice(notice.id)}>×</button>
        </div>
      ))}
    </div>
  );
};

export const BoardV2HandSection = (props: {
  title: string;
  subtitle?: string;
  headRight?: ReactNode;
  cards: CardDefinition[];
  cardImageById: Record<string, string>;
  lang: 'uk' | 'en';
  openPreviewKey: string | null;
  togglePreview: (key: string) => void;
  closePreview: () => void;
  categoryText: (card: CardDefinition) => string;
  actionLabel: string;
  onAction: (card: CardDefinition) => void;
  actionDisabled: (card: CardDefinition) => boolean;
  actionTitle?: (card: CardDefinition) => string | undefined;
  effectLabel: (resource: ResourceKey | 'rank') => string;
  badges?: (card: CardDefinition) => string[] | undefined;
  helperText?: (card: CardDefinition) => string | undefined;
  previewText?: (card: CardDefinition) => string | undefined;
  extraAction?: (card: CardDefinition) => { label: string; onClick: () => void; disabled?: boolean; className?: string } | undefined;
}) => {
  const { title, subtitle, headRight, cards, cardImageById, lang, openPreviewKey, togglePreview, closePreview, categoryText, actionLabel, onAction, actionDisabled, actionTitle, effectLabel, badges, helperText, previewText, extraAction } = props;
  return (
    <section className="game-ui-v2-hand-section">
      <div className="game-ui-v2-hand-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="game-ui-v2-subtle">{subtitle}</p> : null}
        </div>
        {headRight}
      </div>
      <div className="hand game-ui-v2-hand-grid">
        {cards.map((card) => (
          <GameCardTile
            key={`tile-${title}-${card.id}`}
            card={card}
            resolvedImage={cardImageById[card.id]}
            lang={lang}
            categoryText={categoryText(card)}
            openPreviewKey={openPreviewKey}
            previewKey={`preview-${title}-${card.id}`}
            onTogglePreview={togglePreview}
            onClosePreview={closePreview}
            actionLabel={actionLabel}
            onAction={() => onAction(card)}
            actionDisabled={actionDisabled(card)}
            actionTitle={actionTitle?.(card)}
            effectLabel={effectLabel}
            badges={badges?.(card)}
            helperText={helperText?.(card)}
            previewText={previewText?.(card)}
            extraAction={(() => {
              const action = extraAction?.(card);
              return action ? { ...action, disabled: Boolean(action.disabled) } : undefined;
            })()}
          />
        ))}
      </div>
    </section>
  );
};

export const BoardV2SidePanel = (props: {
  sidePanelTab: 'events' | 'chat' | 'help';
  setSidePanelTab: (tab: 'events' | 'chat' | 'help') => void;
  v2: Record<string, string>;
  latestEvents: Array<{ id: string; type: 'player' | 'system'; text: string; playerID?: string; label: string; tone: 'neutral' | 'warn' | 'good' | 'legendary' }>;
  eventsTitle: string;
  spectatorMode?: boolean;
  t: ReturnType<typeof import('../i18n').text>;
  playerLabelById: (id: string | null | undefined) => string;
  lang: 'uk' | 'en';
  G: JojGameState;
  chatInput: string;
  setChatInput: (value: string) => void;
  sendChatMessage: () => void;
  chatLogRef: RefObject<HTMLDivElement | null>;
  helpTitle: string;
  helpItems: Array<{ label: string; value: string; tone?: 'neutral' | 'warn' | 'good' }>;
}) => {
  const {
    sidePanelTab,
    setSidePanelTab,
    v2,
    latestEvents,
    eventsTitle,
    spectatorMode = false,
    t,
    playerLabelById,
    lang,
    G,
    chatInput,
    setChatInput,
    sendChatMessage,
    chatLogRef,
    helpTitle,
    helpItems,
  } = props;
  return (
    <aside className="game-ui-v2-side">
      <section className="game-ui-v2-events game-ui-v2-mobile-tabs">
        <div className="game-ui-v2-side-tab-row">
          <button type="button" className={sidePanelTab === 'events' ? 'is-active' : ''} onClick={() => setSidePanelTab('events')}>{v2.openEvents}</button>
          <button type="button" className={sidePanelTab === 'chat' ? 'is-active' : ''} onClick={() => setSidePanelTab('chat')}>{v2.openChat}</button>
          <button type="button" className={sidePanelTab === 'help' ? 'is-active' : ''} onClick={() => setSidePanelTab('help')}>{v2.openHelp}</button>
        </div>
      </section>
      <section className={`game-ui-v2-events${sidePanelTab !== 'events' ? ' game-ui-v2-mobile-hidden' : ''}`}>
        <h3>{eventsTitle}</h3>
        <div className="game-ui-v2-events-list">
          {latestEvents.map((row) => {
            const author = row.type === 'system' ? t.systemTag : playerLabelById(row.playerID);
            return (
              <div key={`v2-evt-${row.id}`} className={`game-ui-v2-event-row ${row.type === 'system' ? 'is-system' : ''} is-${row.tone}`}>
                <div className="game-ui-v2-event-head">
                  <strong>{author}</strong>
                  <span className={`game-ui-v2-event-chip is-${row.tone}`}>{row.label}</span>
                </div>
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
          chatLogRef={chatLogRef as RefObject<HTMLDivElement>}
          includeSystemMessages={false}
          lang={lang}
          readOnly={spectatorMode}
        />
      </section>
      <section className={sidePanelTab !== 'help' ? 'game-ui-v2-mobile-hidden' : ''}>
        <div className="board-chat game-ui-v2-help-panel">
          <h3>{helpTitle}</h3>
          <div className="game-ui-v2-help-list">
            {helpItems.map((item, index) => (
              <div key={`help-${index}`} className={`game-ui-v2-help-row${item.tone ? ` is-${item.tone}` : ''}`}>
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </aside>
  );
};

export const BoardV2PlayerOverview = (props: {
  opponentIds: string[];
  G: JojGameState;
  sharedRanks: RankDefinition[];
  ctxCurrentPlayer?: string;
  lang: 'uk' | 'en';
  selectedTargetId: string | null;
  activeSelectionNeedsTarget: boolean;
  setSelectedTargetId: (value: string | null) => void;
  postTargetPick: (pid: string) => void;
  playerLabelById: (id: string | null | undefined) => string;
  resourceLabels: Record<ResourceKey, string>;
  v2: Record<string, string>;
  getNextRankSeatMeta: (args: { G: JojGameState; playerID: string; sharedRanks: RankDefinition[] }) => { seatBlocked: boolean };
}) => {
  const { opponentIds, G, sharedRanks, ctxCurrentPlayer, lang, selectedTargetId, activeSelectionNeedsTarget, setSelectedTargetId, postTargetPick, playerLabelById, resourceLabels, v2, getNextRankSeatMeta } = props;
  return (
    <div className="game-ui-v2-players-grid">
      {opponentIds.map((pid) => {
        const pResources = G.resources?.[pid];
        const pRankId = G.ranks?.[pid] ?? '';
        const pRank = sharedRanks.find((r) => r.id === pRankId)?.name ?? rankLabel(pRankId, lang);
        const active = ctxCurrentPlayer === pid;
        const selectable = activeSelectionNeedsTarget;
        const pMeta = getNextRankSeatMeta({ G, playerID: pid, sharedRanks });
        return (
          <button
            key={`player-${pid}`}
            type="button"
            className={`game-ui-v2-player-card${active ? ' is-active' : ''}${selectedTargetId === pid ? ' is-selected' : ''}${selectable ? ' is-selectable' : ''}${active && selectable ? ' is-priority' : ''}`}
            onClick={() => {
              if (!selectable) return;
              setSelectedTargetId(pid);
              postTargetPick(pid);
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
              {active ? <span className="pill pill-badge">{v2.currentTurn ?? 'Current turn'}</span> : null}
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
  );
};
