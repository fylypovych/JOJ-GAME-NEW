import type { ReactNode, RefObject } from 'react';
import type { CardDefinition, JojGameState, ResourceKey, RankDefinition } from '../../game/types';
import { buildReplacementSlots } from './replacement';
import { BoardChatPanel, GameCardTile } from './components';
import { cardTitle, localizeSystemMessageText, rankLabel } from '../i18n';
import { BOARD_RESOURCE_ORDER } from './resourceConstants';
import type { BoardNotice } from './useBoardUiController';

export const BoardV1SelectionPanel = (props: {
  pendingSelection: { type: string; cardId: string } | null;
  activeSelectionNeedsTarget: boolean;
  activeSelectionNeedsReplacement: boolean;
  activeSelectionNeedsResource: boolean;
  currentPendingCard: CardDefinition | null;
  selectedTargetId: string | null;
  setSelectedTargetId: (value: string | null) => void;
  opponentIds: string[];
  playerLabelById: (id: string | null | undefined) => string;
  board: Record<string, string>;
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
    board,
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
    <div className="game-ui-v1-selection-panel game-ui-v1-selection-panel-inline">
      <div>
        <div className="game-ui-v1-steps" aria-label={board.stepAssistant}>
          <span className={activeSelectionNeedsTarget ? 'is-done' : ''}>{board.step1}</span>
          <span className={(!activeSelectionNeedsTarget && (activeSelectionNeedsReplacement || activeSelectionNeedsResource)) ? 'is-done' : ''}>{board.step2}</span>
          <span>{board.step3}</span>
        </div>
        <p className="game-ui-v1-kicker">
          {activeSelectionNeedsTarget
            ? board.pickTarget
            : (activeSelectionNeedsReplacement ? board.replacementSelection : board.pickResource)}
        </p>
        <h3>{currentPendingCard ? cardTitle(currentPendingCard.id, currentPendingCard.title, lang) : pendingSelection.cardId}</h3>
        <p className="game-ui-v1-subtle">
          {activeSelectionNeedsTarget
            ? board.selectableTargetHint
            : (activeSelectionNeedsReplacement ? board.replacementGuide : board.selectableResourceHint)}
        </p>
      </div>
      {activeSelectionNeedsTarget ? (
        <div className="game-ui-v1-chip-row">
          {opponentIds.map((pid) => (
            <button
              key={`pick-target-${pid}`}
              type="button"
              className={`game-ui-v1-pick-chip${selectedTargetId === pid ? ' is-selected' : ''}`}
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
              <p className="game-ui-v1-subtle">{board.replacementTarget}</p>
              <div className="game-ui-v1-chip-row">
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
                      className={`game-ui-v1-pick-chip${replacementActiveTargetId === pid ? ' is-selected' : ''}`}
                      onClick={() => setActiveReplacementTargetId(pid)}
                    >
                      {playerLabelById(pid)} ({selected}/{required})
                    </button>
                  );
                })}
              </div>
              {replacementActiveTargetId ? (
                <>
                  <p className="game-ui-v1-subtle">
                    {board.replacementProgress}: {replacementActiveSelected.length}/{replacementActiveSlots.length}
                  </p>
                  <div className="game-ui-v1-chip-row">
                    {BOARD_RESOURCE_ORDER.map((key) => (
                      <button
                        key={`replacement-resource-${key}`}
                        type="button"
                        className={`game-ui-v1-pick-chip${replacementActiveSlots[replacementActiveSelected.length] === key ? ' is-selected' : ''}`}
                        onClick={() => appendReplacementResource(key)}
                      >
                        {resourceLabels[key]} ({replacementActiveTargetResources?.[key] ?? 0})
                      </button>
                    ))}
                  </div>
                  <div className="game-ui-v1-selection-actions">
                    <button type="button" className="ghost" onClick={undoReplacementResource}>{board.undoPick}</button>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="game-ui-v1-subtle">{board.replacementNotRequired}</p>
          )}
        </>
      ) : null}
      {activeSelectionNeedsResource ? (
        <div className="game-ui-v1-chip-row">
          {BOARD_RESOURCE_ORDER.map((key) => (
            <button
              key={`pick-resource-${key}`}
              type="button"
              className={`game-ui-v1-pick-chip${selectedResource === key ? ' is-selected' : ''}`}
              onClick={() => setSelectedResource(key)}
            >
              {resourceLabels[key]} ({resources[key] ?? 0})
            </button>
          ))}
        </div>
      ) : null}
      <div className="game-ui-v1-selection-actions">
        <button type="button" onClick={confirmPendingSelection}>{board.confirm}</button>
        <button type="button" className="ghost" onClick={clearPendingSelection}>{board.cancel}</button>
      </div>
    </div>
  );
};

export const BoardV1NoticeStack = (props: {
  notices: BoardNotice[];
  dismissNotice: (noticeId: string) => void;
}) => {
  if (!props.notices.length) return null;
  return (
    <div className="game-ui-v1-notice-stack" aria-live="polite">
      {props.notices.map((notice) => (
        <div key={notice.id} className={`game-ui-v1-notice is-${notice.type}`}>
          <span>{notice.text}</span>
          <button type="button" className="ghost" onClick={() => props.dismissNotice(notice.id)}>×</button>
        </div>
      ))}
    </div>
  );
};

export const BoardV1HandSection = (props: {
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
  selected?: (card: CardDefinition) => boolean;
  cardClickAction?: (card: CardDefinition) => void;
}) => {
  const { title, subtitle, headRight, cards, cardImageById, lang, openPreviewKey, togglePreview, closePreview, categoryText, actionLabel, onAction, actionDisabled, actionTitle, effectLabel, badges, helperText, previewText, extraAction, selected, cardClickAction } = props;
  return (
    <section className="game-ui-v1-hand-section">
      <div className="game-ui-v1-hand-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="game-ui-v1-subtle">{subtitle}</p> : null}
        </div>
        {headRight}
      </div>
      <div className="hand game-ui-v1-hand-grid">
        {cards.map((card) => (
          <GameCardTile
            key={`tile-${title}-${card.id}`}
            card={card}
            resolvedImage={cardImageById[card.id]}
            lang={lang}
            variant="v1"
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
            selected={selected?.(card) ?? false}
            onCardClick={cardClickAction ? () => cardClickAction(card) : undefined}
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

export const BoardV1SidePanel = (props: {
  sidePanelTab: 'events' | 'chat' | 'help';
  setSidePanelTab: (tab: 'events' | 'chat' | 'help') => void;
  board: Record<string, string>;
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
    board,
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
    <aside className="game-ui-v1-side">
      <section className="game-ui-v1-events game-ui-v1-mobile-tabs">
        <div className="game-ui-v1-tab-row">
          <button type="button" className={sidePanelTab === 'events' ? 'is-active' : ''} onClick={() => setSidePanelTab('events')}>{board.openEvents}</button>
          <button type="button" className={sidePanelTab === 'chat' ? 'is-active' : ''} onClick={() => setSidePanelTab('chat')}>{board.openChat}</button>
          <button type="button" className={sidePanelTab === 'help' ? 'is-active' : ''} onClick={() => setSidePanelTab('help')}>{board.openHelp}</button>
        </div>
      </section>
      <section className={`game-ui-v1-events${sidePanelTab !== 'events' ? ' game-ui-v1-mobile-hidden' : ''}`}>
        <h3>{eventsTitle}</h3>
        <div className="game-ui-v1-events-list">
          {latestEvents.map((row) => {
            const author = row.type === 'system' ? t.systemTag : playerLabelById(row.playerID);
            return (
              <div key={`v1-evt-${row.id}`} className={`game-ui-v1-event-row ${row.type === 'system' ? 'is-system' : ''} is-${row.tone}`}>
                <div className="game-ui-v1-event-head">
                  <strong>{author}</strong>
                  <span className={`game-ui-v1-event-chip is-${row.tone}`}>{row.label}</span>
                </div>
                <span>{row.type === 'system' ? localizeSystemMessageText(row.text, lang) : row.text}</span>
              </div>
            );
          })}
          {!latestEvents.length ? <p className="game-ui-v1-subtle">{board.noEventsYet}</p> : null}
        </div>
      </section>
      <section className={sidePanelTab !== 'chat' ? 'game-ui-v1-mobile-hidden' : ''}>
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
      <section className={sidePanelTab !== 'help' ? 'game-ui-v1-mobile-hidden' : ''}>
        <div className="board-chat game-ui-v1-help-panel">
          <h3>{helpTitle}</h3>
          <div className="game-ui-v1-help-list">
            {helpItems.map((item, index) => (
              <div key={`help-${index}`} className={`game-ui-v1-help-row${item.tone ? ` is-${item.tone}` : ''}`}>
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

export const BoardV1PlayerOverview = (props: {
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
  board: Record<string, string>;
  getNextRankSeatMeta: (args: { G: JojGameState; playerID: string; sharedRanks: RankDefinition[] }) => { seatBlocked: boolean };
  layout?: 'grid' | 'lane';
}) => {
  const { opponentIds, G, sharedRanks, ctxCurrentPlayer, lang, selectedTargetId, activeSelectionNeedsTarget, setSelectedTargetId, postTargetPick, playerLabelById, resourceLabels, board, getNextRankSeatMeta, layout = 'grid' } = props;
  return (
    <div className={layout === 'lane' ? 'game-ui-v1-player-lane' : 'game-ui-v1-players-grid'}>
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
            className={`game-ui-v1-player-card${layout === 'lane' ? ' is-lane' : ' is-grid'}${active ? ' is-active' : ''}${selectedTargetId === pid ? ' is-selected' : ''}${selectable ? ' is-selectable' : ''}${active && selectable ? ' is-priority' : ''}`}
            onClick={() => {
              if (!selectable) return;
              setSelectedTargetId(pid);
              postTargetPick(pid);
            }}
            disabled={!selectable}
            title={selectable ? board.selectableTargetHint : undefined}
          >
            <div className="game-ui-v1-player-head">
              <strong>{playerLabelById(pid)}</strong>
              <span>#{pid}</span>
            </div>
            <div className="game-ui-v1-player-rank">{pRank}</div>
            <div className="game-ui-v1-player-badges">
              {active ? <span className="pill pill-badge">{board.currentTurn}</span> : null}
              {selectable ? <span className="pill pill-badge">{board.targetableNow}</span> : null}
              {pMeta.seatBlocked ? <span className="pill pill-badge">{board.seatBlocked}</span> : null}
              {(G.lyapScandalShieldUntilTurn?.[pid] ?? 0) > 0 ? <span className="pill pill-badge">{board.shieldUntil}: {G.lyapScandalShieldUntilTurn?.[pid] ?? 0}</span> : null}
            </div>
            <div className="game-ui-v1-player-resources">
              {BOARD_RESOURCE_ORDER.map((key) => (
                <span key={`${pid}-${key}`}>{resourceLabels[key]}: {pResources?.[key] ?? 0}</span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
};

