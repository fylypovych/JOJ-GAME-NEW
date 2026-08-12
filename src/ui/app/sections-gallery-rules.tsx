import { useEffect, useState } from 'react';
import {
  CARD_ASSET_BASE_PATH,
  normalizeImagePath,
} from '../../game/imagePaths';
import {
  cardFlavor,
  cardTitleWithOverride,
  categoryLabel,
  text,
} from '../i18n';
import type { Language } from '../i18n';
import type { GalleryCategoryFilter } from './model';
import { useGallery } from '../providers/GalleryContext';
import type { ProjectPage } from '../../content/types';

type T = ReturnType<typeof text>;

const GALLERY_EAGER_IMAGE_COUNT = 12;
const GALLERY_HIGH_PRIORITY_IMAGE_COUNT = 4;

type GallerySectionProps = {
  t: T;
  lang: Language;
  galleryCategoryFilter: GalleryCategoryFilter;
  setGalleryCategoryFilter: (value: GalleryCategoryFilter) => void;
  effectLabel: (
    resource:
      | 'time'
      | 'reputation'
      | 'discipline'
      | 'documents'
      | 'tech'
      | 'rank',
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
  const { galleryCards, availableGalleryCategories } = useGallery();

  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const togglePreview = (key: string) =>
    setOpenPreviewKey((prev) => (prev === key ? null : key));

  useEffect(() => {
    if (
      availableGalleryCategories.length > 0 &&
      !availableGalleryCategories.includes(galleryCategoryFilter)
    ) {
      setGalleryCategoryFilter(availableGalleryCategories[0]);
    }
  }, [
    availableGalleryCategories,
    galleryCategoryFilter,
    setGalleryCategoryFilter,
  ]);

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
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'inherit',
          padding: '8px 0',
        }}
      >
        {availableGalleryCategories.map((cat) => (
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
        {galleryCards.map((card, index) => {
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
                  src={
                    normalizeImagePath(card.image) ??
                    `${CARD_ASSET_BASE_PATH}${card.id}.png`
                  }
                  alt={cardTitleWithOverride(
                    card.id,
                    card.title,
                    lang,
                    card.titleEn,
                  )}
                  loading={index < GALLERY_EAGER_IMAGE_COUNT ? 'eager' : 'lazy'}
                  fetchPriority={
                    index < GALLERY_HIGH_PRIORITY_IMAGE_COUNT ? 'high' : 'auto'
                  }
                  decoding="async"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    const fallbackSrc = `${CARD_ASSET_BASE_PATH}${card.id}.png`;
                    if (
                      img.src !== fallbackSrc &&
                      img.src !== window.location.origin + fallbackSrc
                    ) {
                      img.src = fallbackSrc;
                    } else {
                      img.style.display = 'none';
                    }
                  }}
                />
                {isOpen ? (
                  <div
                    className="gallery-card-popover is-open"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenPreviewKey(null);
                    }}
                  >
                    <img
                      src={
                        normalizeImagePath(card.image) ??
                        `${CARD_ASSET_BASE_PATH}${card.id}.png`
                      }
                      alt={cardTitleWithOverride(
                        card.id,
                        card.title,
                        lang,
                        card.titleEn,
                      )}
                      decoding="async"
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        const fallbackSrc = `${CARD_ASSET_BASE_PATH}${card.id}.png`;
                        if (
                          img.src !== fallbackSrc &&
                          img.src !== window.location.origin + fallbackSrc
                        ) {
                          img.src = fallbackSrc;
                        }
                      }}
                    />
                  </div>
                ) : null}
              </div>
              <h3>
                {cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}
              </h3>
              <p>{cardFlavor(card.flavor, lang, card.flavorEn)}</p>
              <div className="gallery-effects">
                {(card.effects ?? []).length === 0 ? (
                  <span className="pill pill-cost">0</span>
                ) : (
                  (card.effects ?? []).map((effect, idx) => (
                    <span
                      key={`${card.id}-effect-${idx}`}
                      className="pill pill-effect"
                    >
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
  lang,
  serverUrl,
  uiVariant = 'v2',
}: {
  t: T;
  rules: readonly string[];
  lang: Language;
  serverUrl: string;
  uiVariant?: 'v1' | 'v2';
}) => {
  const [page, setPage] = useState<ProjectPage | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${serverUrl}/api/content/rules`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ page?: ProjectPage | null }>;
      })
      .then((payload) => {
        if (active) setPage(payload.page ?? null);
      })
      .catch(() => {
        if (active) setPage(null);
      });
    return () => {
      active = false;
    };
  }, [serverUrl]);

  const localized = (uk: string, en: string) =>
    lang === 'en' && en.trim() ? en : uk;
  const pageBody = page ? localized(page.body, page.bodyEn) : '';
  const displayedRules = pageBody.trim()
    ? pageBody
        .split(/\n\s*\n/)
        .map((rule) => rule.trim())
        .filter(Boolean)
    : [...rules];
  const title = page ? localized(page.title, page.titleEn) : t.rulesTitle;
  const summary = page ? localized(page.summary, page.summaryEn) : '';

  return (
    <section
      className={`board board-v2-panel board-v2-rules${
        uiVariant === 'v1' ? ' board-v1-panel board-v1-rules' : ''
      }`}
    >
      <h2>{title}</h2>
      {summary ? <p className="rules-introduction">{summary}</p> : null}
      <ol className="rules-list">
        {displayedRules.map((rule, index) => (
          <li key={`rule-${index}`}>{rule}</li>
        ))}
      </ol>
    </section>
  );
};
