import type { ReactNode, RefObject } from 'react';
import type { CardDefinition, JojGameState, ResourceKey } from '../../game/types';
import { buildReplacementSlots } from './replacement';
import { BoardChatPanel, GameCardTile } from './components';
import { cardTitle, localizeSystemMessageText } from '../i18n';
import { BOARD_RESOURCE_ORDER } from './resourceConstants';
import type { BoardNotice } from './useBoardV2UiController';

export const V4Header = (props: {
  title: string;
  roomMeta?: { matchID: string; playerID?: string | null } | null;
  playerName: string;
  spectatorLabel: string;
  activeRoomLabel: string;
  joinedAsLabel: string;
  spectatorModeLabel: string;
  stageFocus?: string;
  seatConnectionMissing: boolean;
  seatConnectionMissingText: string;
  onLeaveRoom?: () => void;
  leaveRoomLabel: string;
  requestEndGameLabel: string;
  onRequestEndGame: () => void;
  requestEndGameDisabled: boolean;
  onCopyInvite?: () => void;
  copyInviteLabel?: string;
  onCopyInviteLink?: () => void;
  copyInviteLinkLabel?: string;
  sideContent?: ReactNode;
}) => {
  const {
    title,
    roomMeta,
    playerName,
    spectatorLabel,
    activeRoomLabel,
    joinedAsLabel,
    spectatorModeLabel,
    stageFocus,
    seatConnectionMissing,
    seatConnectionMissingText,
    onLeaveRoom,
    leaveRoomLabel,
    requestEndGameLabel,
    onRequestEndGame,
    requestEndGameDisabled,
    onCopyInvite,
    copyInviteLabel,
    onCopyInviteLink,
    copyInviteLinkLabel,
    sideContent,
  } = props;
  return (
    <header className="game-ui-v4-header">
      <div className="game-ui-v4-header-main">
        <p className="game-ui-v4-kicker">JOJ V4 TCG</p>
        <h2>{title}</h2>
        {roomMeta ? (
          <div className="game-ui-v4-room-meta">
            <p className="game-ui-v4-subtle">{activeRoomLabel}: <strong>{roomMeta.matchID}</strong></p>
            <p className="game-ui-v4-subtle">
              {roomMeta.playerID ? `${joinedAsLabel}: ${playerName || '-'} (#${roomMeta.playerID})` : `${spectatorModeLabel}: ${playerName || spectatorLabel}`}
            </p>
          </div>
        ) : null}
        {stageFocus ? <p className="game-ui-v4-subtle game-ui-v4-stage-focus">{stageFocus}</p> : null}
        {seatConnectionMissing ? <p className="admin-error">{seatConnectionMissingText}</p> : null}
      </div>
      <div className="game-ui-v4-header-actions">
        {sideContent ? <div className="game-ui-v4-header-tools">{sideContent}</div> : null}
        <div className="game-ui-v4-header-button-row">
          {onCopyInvite && copyInviteLabel ? (
            <button type="button" className="game-ui-v4-header-copy" onClick={onCopyInvite}>
              {copyInviteLabel}
            </button>
          ) : null}
          {onCopyInviteLink && copyInviteLinkLabel ? (
            <button type="button" className="game-ui-v4-header-copy" onClick={onCopyInviteLink}>
              {copyInviteLinkLabel}
            </button>
          ) : null}
          {onLeaveRoom ? (
            <button type="button" className="game-ui-v4-header-leave" onClick={onLeaveRoom}>
              {leaveRoomLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="game-ui-v4-header-leave"
            onClick={onRequestEndGame}
            disabled={requestEndGameDisabled}
          >
            {requestEndGameLabel}
          </button>
        </div>
      </div>
    </header>
  );
};

export const V4NoticeStack = (props: {
  notices: BoardNotice[];
  dismissNotice: (noticeId: string) => void;
}) => {
  if (!props.notices.length) return null;
  return (
    <div className="game-ui-v4-notice-stack" aria-live="polite">
      {props.notices.map((notice) => (
        <div key={notice.id} className={`game-ui-v4-notice is-${notice.type}`}>
          <span>{notice.text}</span>
          <button type="button" className="ghost" onClick={() => props.dismissNotice(notice.id)}>×</button>
        </div>
      ))}
    </div>
  );
};

export const V4SelectionPanel = (props: {
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
    <div className="game-ui-v4-selection-panel game-ui-v4-selection-panel-inline">
      <div>
        <div className="game-ui-v4-steps" aria-label={v2.stepAssistant}>
          <span className={activeSelectionNeedsTarget ? 'is-done' : ''}>{v2.step1}</span>
          <span className={(!activeSelectionNeedsTarget && (activeSelectionNeedsReplacement || activeSelectionNeedsResource)) ? 'is-done' : ''}>{v2.step2}</span>
          <span>{v2.step3}</span>
        </div>
        <p className="game-ui-v4-kicker">
          {activeSelectionNeedsTarget
            ? v2.pickTarget
            : (activeSelectionNeedsReplacement ? v2.replacementSelection : v2.pickResource)}
        </p>
        <h3>{currentPendingCard ? cardTitle(currentPendingCard.id, currentPendingCard.title, lang) : pendingSelection.cardId}</h3>
        <p className="game-ui-v4-subtle">
          {activeSelectionNeedsTarget
            ? v2.selectableTargetHint
            : (activeSelectionNeedsReplacement ? v2.replacementGuide : v2.selectableResourceHint)}
        </p>
      </div>
      {activeSelectionNeedsTarget ? (
        <div className="game-ui-v4-chip-row">
          {opponentIds.map((pid) => (
            <button
              key={`pick-target-${pid}`}
              type="button"
              className={`game-ui-v4-pick-chip${selectedTargetId === pid ? ' is-selected' : ''}`}
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
              <p className="game-ui-v4-subtle">{v2.replacementTarget}</p>
              <div className="game-ui-v4-chip-row">
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
                      className={`game-ui-v4-pick-chip${replacementActiveTargetId === pid ? ' is-selected' : ''}`}
                      onClick={() => setActiveReplacementTargetId(pid)}
                    >
                      {playerLabelById(pid)} ({selected}/{required})
                    </button>
                  );
                })}
              </div>
              {replacementActiveTargetId ? (
                <>
                  <p className="game-ui-v4-subtle">
                    {v2.replacementProgress}: {replacementActiveSelected.length}/{replacementActiveSlots.length}
                  </p>
                  <div className="game-ui-v4-chip-row">
                    {BOARD_RESOURCE_ORDER.map((key) => (
                      <button
                        key={`replacement-resource-${key}`}
                        type="button"
                        className={`game-ui-v4-pick-chip${replacementActiveSlots[replacementActiveSelected.length] === key ? ' is-selected' : ''}`}
                        onClick={() => appendReplacementResource(key)}
                      >
                        {resourceLabels[key]} ({replacementActiveTargetResources?.[key] ?? 0})
                      </button>
                    ))}
                  </div>
                  <div className="game-ui-v4-selection-actions">
                    <button type="button" className="ghost" onClick={undoReplacementResource}>{v2.undoPick}</button>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="game-ui-v4-subtle">{v2.replacementNotRequired}</p>
          )}
        </>
      ) : null}
      {activeSelectionNeedsResource ? (
        <div className="game-ui-v4-chip-row">
          {BOARD_RESOURCE_ORDER.map((key) => (
            <button
              key={`pick-resource-${key}`}
              type="button"
              className={`game-ui-v4-pick-chip${selectedResource === key ? ' is-selected' : ''}`}
              onClick={() => setSelectedResource(key)}
            >
              {resourceLabels[key]} ({resources[key] ?? 0})
            </button>
          ))}
        </div>
      ) : null}
      <div className="game-ui-v4-selection-actions">
        <button type="button" onClick={confirmPendingSelection}>{v2.confirm}</button>
        <button type="button" className="ghost" onClick={clearPendingSelection}>{v2.cancel}</button>
      </div>
    </div>
  );
};

export const V4HandSection = (props: {
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
    <section className="game-ui-v4-hand-section">
      <div className="game-ui-v4-hand-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="game-ui-v4-subtle">{subtitle}</p> : null}
        </div>
        {headRight}
      </div>
      <div className="hand game-ui-v4-hand-grid">
        {cards.map((card) => (
          <GameCardTile
            key={`tile-${title}-${card.id}`}
            card={card}
            resolvedImage={cardImageById[card.id]}
            lang={lang}
            variant="v3"
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

export const V4SidePanel = (props: {
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
    <aside className="game-ui-v4-side">
      <section className="game-ui-v4-events game-ui-v4-mobile-tabs">
        <div className="game-ui-v4-tab-row">
          <button type="button" className={sidePanelTab === 'events' ? 'is-active' : ''} onClick={() => setSidePanelTab('events')}>{v2.openEvents}</button>
          <button type="button" className={sidePanelTab === 'chat' ? 'is-active' : ''} onClick={() => setSidePanelTab('chat')}>{v2.openChat}</button>
          <button type="button" className={sidePanelTab === 'help' ? 'is-active' : ''} onClick={() => setSidePanelTab('help')}>{v2.openHelp}</button>
        </div>
      </section>
      <section className={`game-ui-v4-events${sidePanelTab !== 'events' ? ' game-ui-v4-mobile-hidden' : ''}`}>
        <h3>{eventsTitle}</h3>
        <div className="game-ui-v4-events-list">
          {latestEvents.map((row) => {
            const author = row.type === 'system' ? t.systemTag : playerLabelById(row.playerID);
            return (
              <div key={`v4-evt-${row.id}`} className={`game-ui-v4-event-row ${row.type === 'system' ? 'is-system' : ''} is-${row.tone}`}>
                <div className="game-ui-v4-event-head">
                  <strong>{author}</strong>
                  <span className={`game-ui-v4-event-chip is-${row.tone}`}>{row.label}</span>
                </div>
                <span>{row.type === 'system' ? localizeSystemMessageText(row.text, lang) : row.text}</span>
              </div>
            );
          })}
          {!latestEvents.length ? <p className="game-ui-v4-subtle">{v2.noEventsYet}</p> : null}
        </div>
      </section>
      <section className={sidePanelTab !== 'chat' ? 'game-ui-v4-mobile-hidden' : ''}>
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
      <section className={sidePanelTab !== 'help' ? 'game-ui-v4-mobile-hidden' : ''}>
        <div className="board-chat game-ui-v4-help-panel">
          <h3>{helpTitle}</h3>
          <div className="game-ui-v4-help-list">
            {helpItems.map((item, index) => (
              <div key={`help-${index}`} className={`game-ui-v4-help-row${item.tone ? ` is-${item.tone}` : ''}`}>
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
