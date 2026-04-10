import { useMemo, useState } from 'react';
import { CARD_ASSET_BASE_PATH, normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition } from '../../game/types';
import { cardFlavor, cardTitleWithOverride, categoryLabel, text } from '../i18n';
import type { Language } from '../i18n';
import type { GalleryCategoryFilter } from './model';
import { galleryCategories } from './model';
import { useGallery } from '../providers/GalleryContext';

type T = ReturnType<typeof text>;

type GallerySectionProps = {
  t: T;
  lang: Language;
  galleryCategoryFilter: GalleryCategoryFilter;
  setGalleryCategoryFilter: (value: GalleryCategoryFilter) => void;
  effectLabel: (
    resource: 'time' | 'reputation' | 'discipline' | 'documents' | 'tech' | 'rank',
  ) => string;
  uiVariant?: 'v1' | 'v2';
};

export const GallerySection = ({
  t,
  lang,
  galleryCategoryFilter,
  setGalleryCategoryFilter,
  effectLabel,
  uiVariant = 'v2',
}: GallerySectionProps) => {
  const { galleryCards } = useGallery();
  
  // Derive categories from cards
  const derivedCategories = useMemo(() => {
    const cats = new Set(galleryCards.map((c) => c.category));
    return galleryCategories.filter(
      (c) => cats.has(c as CardDefinition['category']) || c === 'RANK' || c === 'ALL'
    );
  }, [galleryCards]);
  
  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const togglePreview = (key: string) =>
    setOpenPreviewKey((prev) => (prev === key ? null : key));

  return (
    <section
      className={`board board-v2-panel board-v2-gallery${
        uiVariant === 'v1' ? ' board-v1-panel board-v1-gallery' : ''
      }`}
    >
      <h2>{t.galleryTitle}</h2>
      <p>{t.galleryDescription}</p>
      <nav
        className="gallery-category-tabs"
        style={{ position: 'sticky', top: 0, zIndex: 10, background: 'inherit', padding: '8px 0' }}
      >
        <button
          type="button"
          onClick={() => setGalleryCategoryFilter('ALL')}
          disabled={galleryCategoryFilter === 'ALL'}
        >
          {t.allCategories}
        </button>
        {derivedCategories.map((cat) => (
          <button
            type="button"
            key={`gallery-filter-${cat}`}
            onClick={() => setGalleryCategoryFilter(cat)}
            disabled={galleryCategoryFilter === cat}
          >
            {categoryLabel(cat, lang)}
          </button>
        ))}
      </nav>
      {galleryCards.length === 0 ? <p>{t.noCardsYet}</p> : null}
      <div className="gallery-grid">
        {galleryCards.map((card) => {
          const previewKey = `gallery-${card.id}`;
          const isOpen = openPreviewKey === previewKey;
          return (
            <article key={card.id} className="gallery-card">
              <div
                className={`gallery-card-image${isOpen ? ' is-open' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => togglePreview(previewKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    togglePreview(previewKey);
                  }
                  if (e.key === 'Escape') {
                    setOpenPreviewKey(null);
                  }
                }}
              >
                <img
                  src={normalizeImagePath(card.image) ?? `${CARD_ASSET_BASE_PATH}${card.id}.png`}
                  alt={cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div
                  className={`gallery-card-popover${isOpen ? ' is-open' : ''}`}
                  aria-hidden={!isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenPreviewKey(null);
                  }}
                >
                  <img
                    src={normalizeImagePath(card.image) ?? `${CARD_ASSET_BASE_PATH}${card.id}.png`}
                    alt={cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}
                  />
                </div>
              </div>
              <h3>{cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}</h3>
              <p>{cardFlavor(card.flavor, lang, card.flavorEn)}</p>
              <div className="gallery-effects">
                {(card.effects ?? []).length === 0 ? (
                  <span className="pill pill-cost">0</span>
                ) : (
                  (card.effects ?? []).map((effect, idx) => (
                    <span key={`${card.id}-effect-${idx}`} className="pill pill-effect">
                      {effectLabel(effect.resource)}:{' '}
                      {effect.value > 0 ? `+${effect.value}` : effect.value}
                    </span>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export const RulesSection = ({
  t,
  rules,
  uiVariant = 'v2',
}: {
  t: T;
  rules: readonly string[];
  uiVariant?: 'v1' | 'v2';
}) => (
  <section
    className={`board board-v2-panel board-v2-rules${
      uiVariant === 'v1' ? ' board-v1-panel board-v1-rules' : ''
    }`}
  >
    <h2>{t.rulesTitle}</h2>
    <ol className="rules-list">
      {rules.map((rule, index) => (
        <li key={`rule-${index}`}>{rule}</li>
      ))}
    </ol>
  </section>
);

