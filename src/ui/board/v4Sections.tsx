import { useEffect, useState, type ReactNode } from 'react';

export type V4FooterResourceItem = {
  key: string;
  icon: string;
  imageSrc?: string;
  label: string;
  value: number;
  highlighted: boolean;
  deficit: boolean;
};

export type V4OpponentCardItem = {
  id: string;
  name: string;
  rankName: string;
  cardsCount: number;
  resources: Array<{
    key: string;
    icon: string;
    imageSrc?: string;
    label: string;
    value: number;
  }>;
  isActive: boolean;
  isSelected: boolean;
  isTargetable: boolean;
  imageSrc?: string;
  initials: string;
};

const V4_PORTRAIT_CROP = {
  left: 46,
  right: 46,
  top: 165,
  bottom: 682,
} as const;

const portraitCropCache = new Map<string, string>();

const cropPortraitImage = async (src: string) => {
  const cached = portraitCropCache.get(src);
  if (cached) return cached;

  const result = await new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const sx = Math.max(0, V4_PORTRAIT_CROP.left);
      const sy = Math.max(0, V4_PORTRAIT_CROP.top);
      const sw = Math.max(1, img.naturalWidth - V4_PORTRAIT_CROP.left - V4_PORTRAIT_CROP.right);
      const sh = Math.max(1, img.naturalHeight - V4_PORTRAIT_CROP.top - V4_PORTRAIT_CROP.bottom);

      try {
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

  portraitCropCache.set(src, result);
  return result;
};

const V4PortraitImage = ({ src, alt }: { src: string; alt: string }) => {
  const [croppedSrc, setCroppedSrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    setCroppedSrc(src);
    void cropPortraitImage(src).then((nextSrc) => {
      if (!cancelled) setCroppedSrc(nextSrc);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return <img src={croppedSrc} alt={alt} />;
};

export const V4BottomBar = (props: {
  resources: V4FooterResourceItem[];
  rankName: string;
  rankHint: string;
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  secondaryActionLabel: string;
  secondaryActionDisabled: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
}) => {
  const {
    resources,
    rankName,
    rankHint,
    primaryActionLabel,
    primaryActionDisabled,
    secondaryActionLabel,
    secondaryActionDisabled,
    onPrimaryAction,
    onSecondaryAction,
  } = props;
  return (
    <div className="game-ui-v4-footer-bar">
      <div className="game-ui-v4-footer-resources">
        {resources.map((item) => (
          <span
            key={`footer-${item.key}`}
            className={`game-ui-v4-footer-resource${item.highlighted ? ' is-highlighted' : ''}${item.deficit ? ' is-deficit' : ''}`}
          >
            <span className="game-ui-v4-footer-resource-icon" aria-hidden="true">
              {item.imageSrc ? <img src={item.imageSrc} alt="" /> : item.icon}
            </span>
            <strong>{item.value}</strong>
            <span className="game-ui-v4-footer-resource-label">{item.label}</span>
          </span>
        ))}
      </div>
      <div className="game-ui-v4-footer-rank">
        <strong>{rankName}</strong>
        <small>{rankHint}</small>
      </div>
      <div className="game-ui-v4-footer-actions">
        <button type="button" className="is-primary" onClick={onPrimaryAction} disabled={primaryActionDisabled}>{primaryActionLabel}</button>
        <button type="button" className="is-secondary" onClick={onSecondaryAction} disabled={secondaryActionDisabled}>{secondaryActionLabel}</button>
      </div>
    </div>
  );
};

const V4OpponentCard = (props: {
  item: V4OpponentCardItem;
  handLabel: string;
  onClick: (id: string) => void;
}) => {
  const { item, handLabel, onClick } = props;
  return (
    <button
      type="button"
      className={`game-ui-v4-opponent-card${item.imageSrc ? '' : ' is-placeholder-card'}${item.isActive ? ' is-active' : ''}${item.isSelected ? ' is-selected' : ''}${item.isTargetable ? ' is-targetable' : ''}`}
      onClick={() => onClick(item.id)}
      disabled={!item.isTargetable}
    >
      <div className="game-ui-v4-opponent-main">
        <div className={`game-ui-v4-opponent-avatar${item.imageSrc ? '' : ' is-placeholder'}`}>
          {item.imageSrc ? (
            <V4PortraitImage src={item.imageSrc} alt={item.rankName} />
          ) : (
            <span className="game-ui-v4-opponent-avatar-fallback">{item.initials}</span>
          )}
        </div>
        <div className="game-ui-v4-opponent-copy">
          <strong>{item.name}</strong>
          <span>{item.rankName}</span>
          <small>{handLabel}: {item.cardsCount}</small>
        </div>
      </div>
      <aside className="game-ui-v4-opponent-resources" aria-label={`${item.name} resources`}>
        {item.resources.map((resource) => (
          <span
            key={`${item.id}-${resource.key}`}
            className="game-ui-v4-opponent-resource"
            title={`${resource.label}: ${resource.value}`}
          >
            <span className="game-ui-v4-opponent-resource-icon" aria-hidden="true">
              {resource.imageSrc ? <img src={resource.imageSrc} alt="" /> : resource.icon}
            </span>
            <strong>{resource.value}</strong>
          </span>
        ))}
      </aside>
    </button>
  );
};

export const V4OpponentsArea = (props: {
  leftItems: V4OpponentCardItem[];
  rightItems: V4OpponentCardItem[];
  handLabel: string;
  centerPortraitImage?: string;
  centerInitials: string;
  centerKicker: string;
  centerTitle: string;
  centerSubtitle: string;
  onOpponentClick: (id: string) => void;
}) => {
  const {
    leftItems,
    rightItems,
    handLabel,
    centerPortraitImage,
    centerInitials,
    centerKicker,
    centerTitle,
    centerSubtitle,
    onOpponentClick,
  } = props;
  return (
    <div className="game-ui-v4-opponents-area">
      <div className="game-ui-v4-opponents-side is-left">
        {leftItems.map((item) => (
          <V4OpponentCard key={`v4-left-${item.id}`} item={item} handLabel={handLabel} onClick={onOpponentClick} />
        ))}
      </div>
      <div className="game-ui-v4-center-badge">
        <div className="game-ui-v4-center-badge-portrait">
          {centerPortraitImage ? (
            <V4PortraitImage src={centerPortraitImage} alt={centerSubtitle || centerTitle} />
          ) : (
            <span>{centerInitials}</span>
          )}
        </div>
        <div className="game-ui-v4-center-badge-copy">
          <span>{centerKicker}</span>
          <strong>{centerTitle}</strong>
          <small>{centerSubtitle}</small>
        </div>
      </div>
      <div className="game-ui-v4-opponents-side is-right">
        {rightItems.map((item) => (
          <V4OpponentCard key={`v4-right-${item.id}`} item={item} handLabel={handLabel} onClick={onOpponentClick} />
        ))}
      </div>
    </div>
  );
};

export const V4BattlefieldSection = (props: {
  title: string;
  opponentCount: number;
  opponents: ReactNode;
  boardContent: ReactNode;
}) => {
  const { title, opponentCount, opponents, boardContent } = props;
  return (
    <section className="game-ui-v4-panel game-ui-v4-battlefield game-ui-v4-battlefield-panel">
      <h3>{title}</h3>
      <div className="game-ui-v4-board-surface" aria-hidden="true">
        <span className="game-ui-v4-board-ring game-ui-v4-board-ring-pressure" />
        <span className="game-ui-v4-board-ring game-ui-v4-board-ring-altar" />
        <span className="game-ui-v4-board-ring game-ui-v4-board-ring-tactical" />
        <span className="game-ui-v4-board-glow game-ui-v4-board-glow-left" />
        <span className="game-ui-v4-board-glow game-ui-v4-board-glow-right" />
      </div>
      <div className={`game-ui-v4-battlefield-shell is-opponents-${opponentCount}`}>
        {opponents}
        <div className="game-ui-v4-board-area">
          <div className="game-ui-v4-altar-lane game-ui-v4-board-center">
            {boardContent}
          </div>
        </div>
      </div>
    </section>
  );
};

export const V4PlayerDockSection = (props: {
  mainContent: ReactNode;
  sideContent?: ReactNode;
}) => {
  const { mainContent, sideContent } = props;
  return (
    <section className="game-ui-v4-panel game-ui-v4-player-dock">
      <div className="game-ui-v4-player-dock-main game-ui-v4-hand-frame">
        <div className="game-ui-v4-player-station" aria-hidden="true">
          <span className="game-ui-v4-player-station-edge" />
          <span className="game-ui-v4-player-station-glow" />
        </div>
        {mainContent}
      </div>
      <aside className="game-ui-v4-player-dock-side">
        {sideContent}
      </aside>
    </section>
  );
};
