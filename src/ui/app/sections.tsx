import { normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition } from '../../game/types';
import type { Language } from '../i18n';
import { cardTitle, categoryLabel, text } from '../i18n';
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
};

export const UserTabs = ({ t, activeUserTab, setActiveUserTab }: UserTabsProps) => (
  <p className="user-tabs">
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
  createRoom: () => void;
  refreshMatches: () => void;
  loading: boolean;
  error: string;
  matches: LobbyMatch[];
  joinRoom: (match: LobbyMatch) => void;
};

export const LobbySection = ({
  t,
  playerName,
  setPlayerName,
  roomCapacity,
  setRoomCapacity,
  createRoom,
  refreshMatches,
  loading,
  error,
  matches,
  joinRoom,
}: LobbySectionProps) => (
  <section className="board">
    <h2>{t.lobbyTitle}</h2>
    <p>
      {t.playerName}:{' '}
      <input
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder={t.playerNamePlaceholder}
      />
    </p>
    <p>
      {t.roomCapacity}:{' '}
      <select value={roomCapacity} onChange={(e) => setRoomCapacity(Number(e.target.value))}>
        <option value={2}>2</option>
        <option value={3}>3</option>
        <option value={4}>4</option>
        <option value={5}>5</option>
        <option value={6}>6</option>
      </select>{' '}
      <button type="button" onClick={createRoom} disabled={!playerName.trim() || loading}>
        {t.createRoom}
      </button>{' '}
      <button type="button" onClick={refreshMatches} disabled={loading}>
        {t.refreshRooms}
      </button>
    </p>

    {error ? <p className="admin-error">{error}</p> : null}
    {loading ? <p>{t.loadingRooms}</p> : null}

    <h3>{t.availableRooms}</h3>
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
  </section>
);

type ActiveSessionSectionProps = {
  t: T;
  session: { matchID: string; playerID: string };
  playerName: string;
  sessionBroken: boolean;
  canStart: boolean;
  leaveRoom: () => void;
  loading: boolean;
};

export const ActiveSessionSection = ({
  t,
  session,
  playerName,
  sessionBroken,
  canStart,
  leaveRoom,
  loading,
}: ActiveSessionSectionProps) => (
  <section className="board">
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
};

export const GallerySection = ({
  t,
  lang,
  galleryCategoryFilter,
  setGalleryCategoryFilter,
  galleryCards,
  galleryCategories,
  effectLabel,
}: GallerySectionProps) => (
  <section className="board">
    <h2>{t.galleryTitle}</h2>
    <p>{t.galleryDescription}</p>
    <p className="gallery-category-tabs">
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
    <div className="gallery-grid">
      {galleryCards.map((card) => (
        <article key={card.id} className="gallery-card">
          <div className="gallery-card-image">
            <img
              src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
              alt={cardTitle(card.id, card.title, lang)}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="gallery-card-popover" aria-hidden="true">
              <img
                src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                alt={cardTitle(card.id, card.title, lang)}
              />
            </div>
          </div>
          <h3>{cardTitle(card.id, card.title, lang)}</h3>
          <p>{card.flavor ?? ''}</p>
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
      ))}
    </div>
  </section>
);

export const RulesSection = ({ t, rules }: { t: T; rules: string[] }) => (
  <section className="board">
    <h2>{t.rulesTitle}</h2>
    <ol className="rules-list">
      {rules.map((rule, index) => (
        <li key={`rule-${index}`}>{rule}</li>
      ))}
    </ol>
  </section>
);
