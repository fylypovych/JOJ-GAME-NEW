import { useState } from 'react';
import { normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition } from '../../game/types';
import type { GameMode } from '../../game/types';
import type { Language } from '../i18n';
import { cardFlavor, cardTitleWithOverride, categoryLabel, text } from '../i18n';
import type { GalleryCategoryFilter, LobbyMatch, UserTab } from './model';

type T = ReturnType<typeof text>;

type AdminAuthCardProps = {
  t: T;
  serverUrl: string;
  adminAuthEnabled: boolean | null;
  adminTokenDraft: string;
  setAdminTokenDraft: (value: string) => void;
  adminAuthChecking: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  adminAuthError: string;
};

export const AdminAuthCard = ({
  t,
  serverUrl,
  adminAuthEnabled,
  adminTokenDraft,
  setAdminTokenDraft,
  adminAuthChecking,
  onSignIn,
  onSignOut,
  adminAuthError,
}: AdminAuthCardProps) => (
  <section className="board admin-auth-card">
    <h2>{t.adminLoginTitle}</h2>
    <p>{adminAuthEnabled === false ? t.adminAuthDisabledHint : t.adminLoginHint}</p>
    <p>
      {t.serverUrlLabel}: <code>{serverUrl}</code>
    </p>
    <p className="admin-auth-form">
      <label>
        {t.adminTokenLabel}:{' '}
        <input
          type="password"
          value={adminTokenDraft}
          onChange={(e) => setAdminTokenDraft(e.target.value)}
          placeholder="ADMIN_TOKEN"
        />
      </label>{' '}
      <button type="button" onClick={onSignIn} disabled={adminAuthChecking}>
        {adminAuthChecking ? t.adminAuthChecking : t.adminSignIn}
      </button>{' '}
      <button type="button" onClick={onSignOut}>
        {t.adminSignOut}
      </button>
    </p>
    {adminAuthError ? <p className="admin-error">{adminAuthError}</p> : null}
  </section>
);

type UserTabsProps = {
  t: T;
  activeUserTab: UserTab;
  setActiveUserTab: (tab: UserTab) => void;
  uiVariant?: 'v1' | 'v2';
};

export const UserTabs = ({ t, activeUserTab, setActiveUserTab, uiVariant = 'v1' }: UserTabsProps) => (
  <p className={`user-tabs${uiVariant === 'v2' ? ' user-tabs-v2' : ''}`}>
    <button type="button" onClick={() => setActiveUserTab('games')} disabled={activeUserTab === 'games'}>
      {t.userTabGames}
    </button>
    <button type="button" onClick={() => setActiveUserTab('gallery')} disabled={activeUserTab === 'gallery'}>
      {t.userTabGallery}
    </button>
    <button type="button" onClick={() => setActiveUserTab('rules')} disabled={activeUserTab === 'rules'}>
      {t.userTabRules}
    </button>
  </p>
);

type LobbySectionProps = {
  t: T;
  playerName: string;
  setPlayerName: (value: string) => void;
  roomCapacity: number;
  setRoomCapacity: (value: number) => void;
  gameMode: GameMode;
  setGameMode: (value: GameMode) => void;
  createRoom: () => void;
  refreshMatches: () => void;
  loading: boolean;
  error: string;
  matches: LobbyMatch[];
  joinRoom: (match: LobbyMatch) => void;
  optionalModules: Array<{ id: string; name: string; alwaysOn: boolean }>;
  selectedOptionalModuleIds: string[];
  setSelectedOptionalModuleIds: (ids: string[]) => void;
  uiVariant?: 'v1' | 'v2';
};

export const LobbySection = ({
  t,
  playerName,
  setPlayerName,
  roomCapacity,
  setRoomCapacity,
  gameMode,
  setGameMode,
  createRoom,
  refreshMatches,
  loading,
  error,
  matches,
  joinRoom,
  optionalModules,
  selectedOptionalModuleIds,
  setSelectedOptionalModuleIds,
  uiVariant = 'v1',
}: LobbySectionProps) => {
  const toggleModule = (id: string, alwaysOn: boolean) => {
    if (alwaysOn) return;
    if (selectedOptionalModuleIds.includes(id)) {
      setSelectedOptionalModuleIds(selectedOptionalModuleIds.filter((row) => row !== id));
      return;
    }
    setSelectedOptionalModuleIds([...selectedOptionalModuleIds, id]);
  };

  return (
  <section className={`board${uiVariant === 'v2' ? ' board-v2-panel' : ''}`}>
    <h2>{t.lobbyTitle}</h2>
    <div className="lobby-layout">
      <div className="lobby-col">
        <h3>{t.roomListTitle}</h3>
        <p className="admin-controls">
          <button type="button" onClick={refreshMatches} disabled={loading}>
            {t.refreshRooms}
          </button>
        </p>
        {loading ? <p>{t.loadingRooms}</p> : null}
        {matches.length === 0 ? <p>{t.noRooms}</p> : null}
        {matches.map((match) => {
          const taken = match.players.filter((player) => Boolean(player.name)).length;
          const capacity = match.players.length;
          const hasFree = taken < capacity;
          return (
            <p key={match.matchID}>
              {match.matchID} | {taken}/{capacity}{' '}
              <button
                type="button"
                onClick={() => joinRoom(match)}
                disabled={!playerName.trim() || loading || !hasFree}
              >
                {t.joinRoom}
              </button>
            </p>
          );
        })}
      </div>
      <div className="lobby-col">
        <h3>{t.roomCreateTitle}</h3>
        <p>
          {t.playerName}:{' '}
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder={t.playerNamePlaceholder}
          />
        </p>
        <p>{t.roomCapacity}:</p>
        <p className="admin-controls">
          {[2, 3, 4, 5, 6].map((size) => (
            <button key={`room-cap-${size}`} type="button" aria-pressed={roomCapacity === size} onClick={() => setRoomCapacity(size)}>
              {roomCapacity === size ? '✓ ' : ''}{size}
            </button>
          ))}
        </p>
        <p>{t.gameModeLabel}:</p>
        <p className="admin-controls">
          {[
            { id: 'standard', label: t.gameModeStandard },
            { id: 'standard_plus', label: t.gameModeStandardPlus },
            { id: 'simplified', label: t.gameModeSimplified },
          ].map((mode) => (
            <button key={`room-mode-${mode.id}`} type="button" aria-pressed={gameMode === mode.id} onClick={() => setGameMode(mode.id as GameMode)}>
              {gameMode === mode.id ? '✓ ' : ''}{mode.label}
            </button>
          ))}
        </p>
        <p>{t.roomModulesLabel}:</p>
        <p className="admin-controls">
          {optionalModules.map((module) => {
            const enabled = selectedOptionalModuleIds.includes(module.id) || module.alwaysOn;
            return (
              <button
                key={`room-module-${module.id}`}
                type="button"
                aria-pressed={enabled}
                onClick={() => toggleModule(module.id, module.alwaysOn)}
                disabled={module.alwaysOn}
              >
                {enabled ? '✓ ' : ''}{module.name}{module.alwaysOn ? ` (${t.roomModuleAlwaysOn})` : ''}
              </button>
            );
          })}
        </p>
        <p className="admin-controls">
          <button type="button" onClick={createRoom} disabled={!playerName.trim() || loading}>
            {t.createRoom}
          </button>
        </p>
      </div>
    </div>
    {error ? <p className="admin-error">{error}</p> : null}
  </section>
);
};

type ActiveSessionSectionProps = {
  t: T;
  session: { matchID: string; playerID: string };
  playerName: string;
  sessionBroken: boolean;
  canStart: boolean;
  leaveRoom: () => void;
  loading: boolean;
  uiVariant?: 'v1' | 'v2';
};

export const ActiveSessionSection = ({
  t,
  session,
  playerName,
  sessionBroken,
  canStart,
  leaveRoom,
  loading,
  uiVariant = 'v1',
}: ActiveSessionSectionProps) => (
  <section className={`board${uiVariant === 'v2' ? ' board-v2-panel' : ''}`}>
    <h2>
      {t.activeRoom}: {session.matchID}
    </h2>
    <p>
      {t.joinedAs}: {playerName || '-'} (#{session.playerID})
    </p>
    {sessionBroken ? <p>{t.noRooms}</p> : null}
    {!sessionBroken && !canStart ? <p>{t.waitingForPlayers}</p> : null}
    <button type="button" onClick={leaveRoom} disabled={loading}>
      {t.leaveRoom}
    </button>
  </section>
);

type GallerySectionProps = {
  t: T;
  lang: Language;
  galleryCategoryFilter: GalleryCategoryFilter;
  setGalleryCategoryFilter: (value: GalleryCategoryFilter) => void;
  galleryCards: CardDefinition[];
  galleryCategories: CardDefinition['category'][];
  effectLabel: (resource: 'time' | 'reputation' | 'discipline' | 'documents' | 'tech' | 'rank') => string;
  uiVariant?: 'v1' | 'v2';
};

export const GallerySection = ({
  t,
  lang,
  galleryCategoryFilter,
  setGalleryCategoryFilter,
  galleryCards,
  galleryCategories,
  effectLabel,
  uiVariant = 'v1',
}: GallerySectionProps) => {
  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const togglePreview = (key: string) => setOpenPreviewKey((prev) => (prev === key ? null : key));

  return (
    <section className={`board${uiVariant === 'v2' ? ' board-v2-panel board-v2-gallery' : ''}`}>
      <h2>{t.galleryTitle}</h2>
      <p>{t.galleryDescription}</p>
      <p className={`gallery-category-tabs${uiVariant === 'v2' ? ' gallery-category-tabs-v2' : ''}`}>
      <button
        type="button"
        onClick={() => setGalleryCategoryFilter('ALL')}
        disabled={galleryCategoryFilter === 'ALL'}
      >
        {t.allCategories}
      </button>
      {galleryCategories.map((cat) => (
        <button
          type="button"
          key={`gallery-filter-${cat}`}
          onClick={() => setGalleryCategoryFilter(cat)}
          disabled={galleryCategoryFilter === cat}
        >
          {categoryLabel(cat, lang)}
        </button>
      ))}
      </p>
      {galleryCards.length === 0 ? <p>{t.noCardsYet}</p> : null}
      <div className={`gallery-grid${uiVariant === 'v2' ? ' gallery-grid-v2' : ''}`}>
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
              src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
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
                src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                  alt={cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}
              />
                </div>
              </div>
              <h3>{cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}</h3>
              <p>{cardFlavor(card.flavor, lang, card.flavorEn)}</p>
              <div className="gallery-effects">
                {(card.effects ?? []).length === 0 ? (
                  <span className="pill pill-cost">0</span>
                ) : (card.effects ?? []).map((effect, idx) => (
                  <span key={`${card.id}-effect-${idx}`} className="pill pill-effect">
                    {effectLabel(effect.resource)}: {effect.value > 0 ? `+${effect.value}` : effect.value}
                  </span>
                ))}
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
  uiVariant = 'v1',
}: { t: T; rules: readonly string[]; uiVariant?: 'v1' | 'v2' }) => (
  <section className={`board${uiVariant === 'v2' ? ' board-v2-panel board-v2-rules' : ''}`}>
    <h2>{t.rulesTitle}</h2>
    <ol className={`rules-list${uiVariant === 'v2' ? ' rules-list-v2' : ''}`}>
      {rules.map((rule, index) => (
        <li key={`rule-${index}`}>{rule}</li>
      ))}
    </ol>
  </section>
);
