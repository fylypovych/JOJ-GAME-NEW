import type { ReactNode, RefObject, SyntheticEvent } from 'react';
import { CARD_ASSET_BASE_PATH, normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition, JojGameState, ResourceKey } from '../../game/types';
import type { Language } from '../i18n';
import { cardFlavor, cardTitleWithOverride, categoryLabel, localizeSystemMessageText } from '../i18n';
import { createPortal } from 'react-dom';

type PilePreviewProps = {
  imageSrc?: string;
  alt: string;
  previewKey: string;
  openPreviewKey: string | null;
  onTogglePreview: (key: string) => void;
  onClosePreview: () => void;
  fallback?: ReactNode;
  variant?: 'default' | 'v1';
  theme?: 'v1' | 'v2';
};

export const PilePreview = ({
  imageSrc,
  alt,
  previewKey,
  openPreviewKey,
  onTogglePreview,
  onClosePreview,
  fallback,
  variant = 'default',
  theme = 'v2',
}: PilePreviewProps) => {
  if (!imageSrc) return <>{fallback ?? null}</>;
  const previewOpen = openPreviewKey === previewKey;
  return (
    <div className={`pile-preview${variant === 'v1' ? ' is-v1' : ''}${previewOpen ? ' has-open-preview' : ''}`}>
      <img src={imageSrc} alt={alt} onClick={(e) => { e.stopPropagation(); onTogglePreview(previewKey); }} />
      {previewOpen && typeof document !== 'undefined' ? createPortal(
        <div className={`pile-preview-modal is-theme-${theme}`} role="dialog" aria-modal="true" aria-label={alt} onClick={onClosePreview}>
          <div className="pile-preview-modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pile-preview-modal-close" aria-label={`Close ${alt}`} onClick={onClosePreview}>×</button>
            <img src={imageSrc} alt={alt} />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

type GameCardTileProps = {
  card: CardDefinition;
  resolvedImage?: string;
  lang: Language;
  categoryText: string;
  openPreviewKey: string | null;
  previewKey: string;
  onTogglePreview: (key: string) => void;
  onClosePreview: () => void;
  actionLabel: string;
  onAction: () => void;
  actionDisabled: boolean;
  actionTitle?: string;
  extraAction?: {
    label: string;
    onClick: () => void;
    disabled: boolean;
    className?: string;
  };
  utilityAction?: {
    label: string;
    onClick: () => void;
    className?: string;
  };
  effectLabel: (resource: ResourceKey | 'rank') => string;
  badges?: string[];
  helperText?: string;
  previewText?: string;
  variant?: 'default' | 'v1' | 'v3';
  selected?: boolean;
  onCardClick?: () => void;
};

export const GameCardTile = ({
  card,
  resolvedImage,
  lang,
  categoryText,
  openPreviewKey,
  previewKey,
  onTogglePreview,
  onClosePreview,
  actionLabel,
  onAction,
  actionDisabled,
  actionTitle,
  extraAction,
  utilityAction,
  effectLabel,
  badges,
  helperText,
  previewText,
  variant = 'default',
  selected = false,
  onCardClick,
}: GameCardTileProps) => {
  const imageSrc = normalizeImagePath(resolvedImage) ?? normalizeImagePath(card.image) ?? `${CARD_ASSET_BASE_PATH}${card.id}.png`;
  const categoryClass = `game-card-cat-${String(card.category).toLowerCase()}`;
  const withCacheBust = (src: string) => `${src}${src.includes('?') ? '&' : '?'}v=${Date.now()}`;
  const handleCardImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget as HTMLImageElement & { dataset: { retried?: string } };
    if (!img.dataset.retried) {
      img.dataset.retried = '1';
      img.src = withCacheBust(imageSrc);
      return;
    }
    img.style.display = 'none';
  };
  const title = cardTitleWithOverride(card.id, card.title, lang, card.titleEn);
  const flavorText = cardFlavor(card.flavor, lang, card.flavorEn);
  const effectEntries = card.effects ?? [];
  const variantClass = variant === 'v1' ? ' is-v1' : ' is-v3';
  return (
    <div
      className={`game-card ${categoryClass}${variantClass}${selected ? ' is-selected' : ''}${actionDisabled ? ' is-disabled' : ''}${onCardClick ? ' is-clickable' : ''}${openPreviewKey === previewKey ? ' has-open-preview' : ''}`.trim()}
      onClick={onCardClick}
    >
      <button
        type="button"
        className={`game-card-inline-action${variantClass}`}
        onClick={(e) => {
          e.stopPropagation();
          onAction();
        }}
        disabled={actionDisabled}
        title={actionTitle}
      >
        {actionLabel}
      </button>
      {extraAction ? (
        <button
          type="button"
          className={`game-card-inline-action${variantClass} ${extraAction.className ?? ''}`.trim()}
          onClick={(e) => {
            e.stopPropagation();
            extraAction.onClick();
          }}
          disabled={extraAction.disabled}
        >
          {extraAction.label}
        </button>
      ) : null}
      {utilityAction ? (
        <button
          type="button"
          className={`game-card-inline-action${variantClass} ${utilityAction.className ?? ''}`.trim()}
          onClick={(e) => {
            e.stopPropagation();
            utilityAction.onClick();
          }}
        >
          {utilityAction.label}
        </button>
      ) : null}
      <div className={`game-card-media${variantClass}`}>
        <img
          src={imageSrc}
          alt={title}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePreview(previewKey);
          }}
          onError={handleCardImageError}
        />
      </div>
      <div
        className={`game-card-popover${variantClass}${openPreviewKey === previewKey ? ' is-open' : ''}`}
        aria-hidden={openPreviewKey !== previewKey}
        onClick={(e) => { e.stopPropagation(); onClosePreview(); }}
      >
        <img
          src={imageSrc}
          alt={title}
          onError={handleCardImageError}
        />
      </div>
      <div className={`game-card-body${variantClass}`}>
        <strong>{title}</strong>
        <small>{categoryText || categoryLabel(card.category, lang)}</small>
        {badges?.length ? (
          <div className="game-card-row">
            {badges.map((badge, index) => (
              <span key={`badge-${card.id}-${index}`} className="pill pill-badge">{badge}</span>
            ))}
          </div>
        ) : null}
        {effectEntries.length ? (
          <div className="game-card-row">
            {effectEntries.map((effect, index) => (
              <span key={`effect-${card.id}-${effect.resource}-${index}`} className="pill pill-effect">
                {effectLabel(effect.resource)}: {effect.value > 0 ? `+${effect.value}` : effect.value}
              </span>
            ))}
          </div>
        ) : null}
        {helperText ? <small className="game-card-helper">{helperText}</small> : null}
        {previewText ? <small className="game-card-preview">{previewText}</small> : null}
        {flavorText ? <small className="game-card-helper">{flavorText}</small> : null}
      </div>
    </div>
  );
};

type ChatPanelProps = {
  chat: JojGameState['chat'];
  chatInput: string;
  setChatInput: (value: string) => void;
  onSend: () => void;
  playerLabelById: (id: string | null | undefined) => string;
  t: {
    chatTitle: string;
    systemTag: string;
    chatPlaceholder: string;
    sendMessage: string;
  };
  chatLogRef: RefObject<HTMLDivElement>;
  includeSystemMessages?: boolean;
  lang?: Language;
  readOnly?: boolean;
};

export const BoardChatPanel = ({
  chat,
  chatInput,
  setChatInput,
  onSend,
  playerLabelById,
  t,
  chatLogRef,
  includeSystemMessages = true,
  lang = 'uk',
  readOnly = false,
}: ChatPanelProps) => (
  <aside className="board-chat">
    <h3>{t.chatTitle}</h3>
    <div className="chat-log" ref={chatLogRef}>
      {(chat ?? [])
        .filter((row) => includeSystemMessages || row.type !== 'system')
        .map((row) => {
        const author = row.type === 'system' ? t.systemTag : playerLabelById(row.playerID);
        return (
          <p key={row.id} className={row.type === 'system' ? 'chat-system' : 'chat-player'}>
            <strong>{author}:</strong> {row.type === 'system' ? localizeSystemMessageText(row.text, lang) : row.text}
          </p>
        );
      })}
    </div>
    <form
      className="chat-input-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        onSend();
      }}
    >
      <input
        id="chat-input"
        name="chatMessage"
        autoComplete="off"
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !readOnly) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={t.chatPlaceholder}
        disabled={readOnly}
      />
      <button type="submit" disabled={readOnly}>{t.sendMessage}</button>
    </form>
  </aside>
);
