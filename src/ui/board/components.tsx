import type { ReactNode, RefObject, SyntheticEvent } from 'react';
import { normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition, JojGameState, ResourceKey } from '../../game/types';
import type { Language } from '../i18n';
import { cardFlavor, cardTitleWithOverride, categoryLabel, localizeSystemMessageText } from '../i18n';

type PilePreviewProps = {
  imageSrc?: string;
  alt: string;
  previewKey: string;
  openPreviewKey: string | null;
  onTogglePreview: (key: string) => void;
  onClosePreview: () => void;
  fallback?: ReactNode;
};

export const PilePreview = ({
  imageSrc,
  alt,
  previewKey,
  openPreviewKey,
  onTogglePreview,
  onClosePreview,
  fallback,
}: PilePreviewProps) => {
  if (!imageSrc) return <>{fallback ?? null}</>;
  return (
    <div className="pile-preview">
      <img src={imageSrc} alt={alt} onClick={(e) => { e.stopPropagation(); onTogglePreview(previewKey); }} />
      <div
        className={`game-card-popover${openPreviewKey === previewKey ? ' is-open' : ''}`}
        aria-hidden={openPreviewKey !== previewKey}
        onClick={(e) => { e.stopPropagation(); onClosePreview(); }}
      >
        <img src={imageSrc} alt={alt} />
      </div>
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
  extraAction,
  utilityAction,
  effectLabel,
  badges,
  helperText,
}: GameCardTileProps) => {
  const imageSrc = normalizeImagePath(resolvedImage) ?? normalizeImagePath(card.image) ?? `/cards/${card.id}.png`;
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
  return (
    <div className="game-card">
      <button
        type="button"
        className="game-card-inline-action"
        onClick={onAction}
        disabled={actionDisabled}
      >
        {actionLabel}
      </button>
      {extraAction ? (
        <button
          type="button"
          className={`game-card-inline-action ${extraAction.className ?? ''}`.trim()}
          onClick={extraAction.onClick}
          disabled={extraAction.disabled}
        >
          {extraAction.label}
        </button>
      ) : null}
      {utilityAction ? (
        <button
          type="button"
          className={`game-card-inline-action ${utilityAction.className ?? ''}`.trim()}
          onClick={utilityAction.onClick}
        >
          {utilityAction.label}
        </button>
      ) : null}
      <div className="game-card-media">
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
        className={`game-card-popover${openPreviewKey === previewKey ? ' is-open' : ''}`}
        aria-hidden={openPreviewKey !== previewKey}
        onClick={(e) => { e.stopPropagation(); onClosePreview(); }}
      >
        <img
          src={imageSrc}
          alt={title}
          onError={handleCardImageError}
        />
      </div>
      <div className="game-card-body">
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
        onSend();
      }}
    >
      <input
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        placeholder={t.chatPlaceholder}
      />
      <button type="submit">{t.sendMessage}</button>
    </form>
  </aside>
);
