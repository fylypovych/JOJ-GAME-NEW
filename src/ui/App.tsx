import { useEffect, useMemo, useState } from 'react';
import { LobbyClient } from 'boardgame.io/client';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import type { CardDefinition, RankDefinition } from '../game/types';
import {
  addCustomCardToSharedDeckTemplate,
  addCardToSharedDeckTemplate,
  type DeckTarget,
  exportSharedDeckTemplateJson,
  getCardCatalog,
  getSharedRanks,
  getSharedDeckTemplate,
  getSharedDeckTemplateStats,
  importSharedDeckTemplateJson,
  jojGame,
  removeCardAtFromSharedDeckTemplate,
  runGameSimulations,
  setSharedRanks,
  resetSharedRanks,
  resetSharedDeckTemplate,
  setSharedDeckBackImage,
  shuffleSharedDeckTemplate,
  updateCardAtInSharedDeckTemplate,
} from '../game/jojGame';
import { AdminPage } from './AdminPage';
import { Board } from './Board';
import type { Language } from './i18n';
import { defaultLanguage, text } from './i18n';
import {
  ADMIN_TOKEN_STORAGE_KEY,
  DEFAULT_SERVER_URL,
  GAME_NAME,
  PLAYER_NAME_STORAGE_KEY,
  RANKS_STORAGE_KEY,
  SERVER_URL_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SHARED_TEMPLATE_STORAGE_KEY,
  type GalleryCategoryFilter,
  galleryCategories,
  getConfiguredServerUrl,
  normalizeServerUrl,
  parseSession,
  type LobbyMatch,
  type Session,
  type SharedDeckTemplate,
  type UserTab,
} from './app/model';
import {
  ActiveSessionSection,
  AdminAuthCard,
  GallerySection,
  LobbySection,
  RulesSection,
  UserTabs,
} from './app/sections';
import { useAdminAuth } from './app/useAdminAuth';
import { useAdminSnapshot } from './app/useAdminSnapshot';

const SERVER_URL = getConfiguredServerUrl();

const NetworkClient = Client({
  game: jojGame,
  board: Board,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

const lobbyClient = new LobbyClient({ server: SERVER_URL });

const TEMPLATE_API = `${SERVER_URL}/api/shared-deck-template`;
const RANKS_API = `${SERVER_URL}/api/shared-ranks`;
const ADMIN_RESTART_API = `${SERVER_URL}/api/admin/restart`;
const ADMIN_MATCH_STATE_API = `${SERVER_URL}/api/admin/match-state`;

export const App = () => {
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  const [lang, setLang] = useState<Language>(() => {
    const stored = window.localStorage.getItem('joj-lang');
    return stored === 'en' || stored === 'uk' ? stored : defaultLanguage;
  });
  const [playerName, setPlayerName] = useState<string>(() => window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? '');
  const [roomCapacity, setRoomCapacity] = useState<number>(2);
  const [matches, setMatches] = useState<LobbyMatch[]>([]);
  const [session, setSession] = useState<Session | null>(() => parseSession(window.localStorage.getItem(SESSION_STORAGE_KEY)));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [matchesSynced, setMatchesSynced] = useState<boolean>(false);

  const [, setSharedDeckVersion] = useState<number>(0);
  const [sharedDeckTemplate, setSharedDeckTemplate] = useState<SharedDeckTemplate>(getSharedDeckTemplate);
  const [cardCatalog, setCardCatalog] = useState<CardDefinition[]>(getCardCatalog);
  const [sharedRanks, setSharedRanksState] = useState<RankDefinition[]>(getSharedRanks);
  const [activeUserTab, setActiveUserTab] = useState<UserTab>('games');
  const [galleryCategoryFilter, setGalleryCategoryFilter] = useState<GalleryCategoryFilter>('ALL');
  const [serverUrlDraft, setServerUrlDraft] = useState<string>(() => window.localStorage.getItem(SERVER_URL_STORAGE_KEY) ?? SERVER_URL);

  const t = text(lang);
  const {
    adminToken,
    setAdminToken,
    adminTokenDraft,
    setAdminTokenDraft,
    adminAuthChecking,
    adminAuthorized,
    setAdminAuthorized,
    adminAuthEnabled,
    adminAuthError,
    setAdminAuthError,
    adminFetch,
    verifyAdminToken,
  } = useAdminAuth({
    isAdminRoute,
    serverUrl: SERVER_URL,
    adminTokenStorageKey: ADMIN_TOKEN_STORAGE_KEY,
    initialToken: window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '',
    unauthorizedText: t.adminUnauthorized,
    serverUnavailableText: t.serverUnavailable,
  });
  const sharedDeckStats = getSharedDeckTemplateStats();
  const galleryCards = useMemo(() => (
    [...cardCatalog]
      .filter((card) => galleryCategoryFilter === 'ALL' || card.category === galleryCategoryFilter)
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
  ), [cardCatalog, galleryCategoryFilter]);
  const effectLabel = (resource: 'time' | 'reputation' | 'discipline' | 'documents' | 'tech' | 'rank') =>
    resource === 'rank' ? t.rankResource : t.resources[resource];
  const rules = t.rulesList;
  const saveServerUrl = (nextValue: string) => {
    const normalized = normalizeServerUrl(nextValue || DEFAULT_SERVER_URL) || DEFAULT_SERVER_URL;
    window.localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
    setServerUrlDraft(normalized);
    window.location.reload();
  };
  const resetServerUrl = () => {
    window.localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    setServerUrlDraft(DEFAULT_SERVER_URL);
    window.location.reload();
  };
  const syncTemplateToServer = async (json: string) => {
    try {
      const response = await adminFetch(`${TEMPLATE_API}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json }),
      });
      if (!response.ok) return false;
      return true;
    } catch {
      return false;
    }
  };

  const syncRanksToServer = async (ranks: RankDefinition[]) => {
    try {
      const response = await adminFetch(RANKS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranks }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const loadTemplateFromServer = async (): Promise<boolean> => {
    try {
      const response = await fetch(TEMPLATE_API);
      if (!response.ok) return false;
      const payload = (await response.json()) as { json?: string };
      if (typeof payload.json !== 'string') return false;
      const result = importSharedDeckTemplateJson(payload.json);
      if (!result.ok) return false;
      setSharedDeckTemplate(getSharedDeckTemplate());
      setCardCatalog(getCardCatalog());
      window.localStorage.setItem(SHARED_TEMPLATE_STORAGE_KEY, exportSharedDeckTemplateJson());
      setSharedDeckVersion((v) => v + 1);
      return true;
    } catch {
      return false;
    }
  };

  const loadRanksFromServer = async (): Promise<boolean> => {
    try {
      const response = await fetch(RANKS_API);
      if (!response.ok) return false;
      const payload = (await response.json()) as { ranks?: RankDefinition[] };
      if (!Array.isArray(payload.ranks)) return false;
      if (!setSharedRanks(payload.ranks)) return false;
      setSharedRanksState(getSharedRanks());
      window.localStorage.setItem(RANKS_STORAGE_KEY, JSON.stringify(getSharedRanks()));
      return true;
    } catch {
      return false;
    }
  };

  const refreshSharedDeckTemplate = (sync = true) => {
    setSharedDeckTemplate(getSharedDeckTemplate());
    setCardCatalog(getCardCatalog());
    const json = exportSharedDeckTemplateJson();
    window.localStorage.setItem(SHARED_TEMPLATE_STORAGE_KEY, json);
    setSharedDeckVersion((v) => v + 1);
    if (sync) {
      void syncTemplateToServer(json);
    }
  };

  const refreshMatches = async () => {
    setLoading(true);
    setError('');
    try {
      const response = (await lobbyClient.listMatches(GAME_NAME)) as { matches: LobbyMatch[] };
      setMatches(response.matches ?? []);
      setMatchesSynced(true);
    } catch {
      setError(t.serverUnavailable);
    } finally {
      setLoading(false);
    }
  };

  const createRoom = async () => {
    const name = playerName.trim();
    if (!name) {
      setError(t.enterName);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await lobbyClient.createMatch(GAME_NAME, {
        numPlayers: Math.max(2, Math.min(6, roomCapacity)),
      });
      const matchID = result.matchID;
      const joined = await lobbyClient.joinMatch(GAME_NAME, matchID, {
        playerID: '0',
        playerName: name,
      });
      const nextSession: Session = {
        matchID,
        playerID: joined.playerID,
        credentials: joined.playerCredentials,
      };
      setSession(nextSession);
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      await refreshMatches();
    } catch {
      setError(t.createFailed);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (match: LobbyMatch) => {
    const name = playerName.trim();
    if (!name) {
      setError(t.enterName);
      return;
    }

    const freePlayer = match.players.find((player) => !player.name);
    if (!freePlayer) {
      setError(t.roomFull);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const joined = await lobbyClient.joinMatch(GAME_NAME, match.matchID, {
        playerID: String(freePlayer.id),
        playerName: name,
      });
      const nextSession: Session = {
        matchID: match.matchID,
        playerID: joined.playerID,
        credentials: joined.playerCredentials,
      };
      setSession(nextSession);
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      await refreshMatches();
    } catch {
      setError(t.joinFailed);
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      await lobbyClient.leaveMatch(GAME_NAME, session.matchID, {
        playerID: session.playerID,
        credentials: session.credentials,
      });
    } catch {
      // match may already be gone; continue clearing local session
    } finally {
      setSession(null);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      await refreshMatches();
      setLoading(false);
    }
  };

  const activeMatch = useMemo(
    () => matches.find((match) => match.matchID === session?.matchID) ?? null,
    [matches, session?.matchID],
  );
  const adminMatchID = useMemo(() => session?.matchID ?? matches[0]?.matchID ?? '', [matches, session?.matchID]);
  const { snapshot } = useAdminSnapshot({
    isAdminRoute,
    adminAuthorized,
    adminMatchID,
    adminFetch,
    adminMatchStateApi: ADMIN_MATCH_STATE_API,
  });
  const roomPlayerNames = useMemo<Record<string, string>>(() => {
    if (!activeMatch) return {};
    return activeMatch.players.reduce<Record<string, string>>((acc, player) => {
      const name = player.name?.trim();
      if (name) acc[String(player.id)] = name;
      return acc;
    }, {});
  }, [activeMatch]);

  const canStart = Boolean(activeMatch && activeMatch.players.every((player) => Boolean(player.name)));
  const sessionBroken = Boolean(session && matchesSynced && !activeMatch && !loading);

  useEffect(() => {
    void (async () => {
      const loadedFromServer = await loadTemplateFromServer();
      if (!loadedFromServer) {
        const saved = window.localStorage.getItem(SHARED_TEMPLATE_STORAGE_KEY);
        if (saved) {
          const result = importSharedDeckTemplateJson(saved);
          if (result.ok) {
            refreshSharedDeckTemplate(false);
          }
        }
      }
      const loadedRanksFromServer = await loadRanksFromServer();
      if (!loadedRanksFromServer) {
        const saved = window.localStorage.getItem(RANKS_STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as RankDefinition[];
            if (setSharedRanks(parsed)) {
              setSharedRanksState(getSharedRanks());
            }
          } catch {
            // ignore
          }
        }
      }
    })();
  }, []);

  useEffect(() => {
    refreshMatches();
    const id = window.setInterval(() => {
      refreshMatches();
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!sessionBroken) return;
    setSession(null);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [sessionBroken]);

  useEffect(() => {
    window.localStorage.setItem('joj-lang', lang);
    document.documentElement.lang = lang;
    document.title = isAdminRoute ? t.adminTitle : t.gameTitle;
  }, [isAdminRoute, lang, t.adminTitle, t.gameTitle]);

  useEffect(() => {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
  }, [playerName]);

  return (
    <main className="app">
      <h1>{isAdminRoute ? t.adminTitle : t.gameTitle}</h1>
      <p className="app-top-row">
        {t.language}:{' '}
        <button type="button" onClick={() => setLang('uk')} disabled={lang === 'uk'}>
          {t.langUk}
        </button>{' '}
        <button type="button" onClick={() => setLang('en')} disabled={lang === 'en'}>
          {t.langEn}
        </button>
      </p>
      <p className="app-link-row">
        {isAdminRoute ? <a href="/">{t.openGame}</a> : <a href="/admin">{t.openAdmin}</a>}
      </p>

      {isAdminRoute ? (
        <AdminAuthCard
          t={t}
          serverUrl={SERVER_URL}
          adminAuthEnabled={adminAuthEnabled}
          adminTokenDraft={adminTokenDraft}
          setAdminTokenDraft={setAdminTokenDraft}
          adminAuthChecking={adminAuthChecking}
          onSignIn={() => {
            void verifyAdminToken(adminTokenDraft);
          }}
          onSignOut={() => {
            setAdminToken('');
            setAdminTokenDraft('');
            setAdminAuthorized(false);
            setAdminAuthError('');
            window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
          }}
          adminAuthError={adminAuthError}
        />
      ) : null}

      {!isAdminRoute ? (
        <UserTabs t={t} activeUserTab={activeUserTab} setActiveUserTab={setActiveUserTab} />
      ) : null}

      {!isAdminRoute && activeUserTab === 'games' && !session ? (
        <LobbySection
          t={t}
          playerName={playerName}
          setPlayerName={setPlayerName}
          roomCapacity={roomCapacity}
          setRoomCapacity={setRoomCapacity}
          createRoom={() => { void createRoom(); }}
          refreshMatches={() => { void refreshMatches(); }}
          loading={loading}
          error={error}
          matches={matches}
          joinRoom={(match) => { void joinRoom(match); }}
        />
      ) : null}

      {!isAdminRoute && activeUserTab === 'games' && session ? (
        <ActiveSessionSection
          t={t}
          session={session}
          playerName={playerName}
          sessionBroken={sessionBroken}
          canStart={canStart}
          leaveRoom={() => { void leaveRoom(); }}
          loading={loading}
        />
      ) : null}

      <div style={{ display: !isAdminRoute && activeUserTab === 'games' && session && canStart ? 'block' : 'none' }}>
        {session ? (
          <NetworkClient
            key={`${session.matchID}:${session.playerID}`}
            matchID={session.matchID}
            playerID={session.playerID}
            credentials={session.credentials}
            lang={lang}
            playerName={playerName}
            knownPlayerNames={roomPlayerNames}
            sharedRanks={sharedRanks}
          />
        ) : null}
      </div>

      {!isAdminRoute && activeUserTab === 'gallery' ? (
        <GallerySection
          t={t}
          lang={lang}
          galleryCategoryFilter={galleryCategoryFilter}
          setGalleryCategoryFilter={setGalleryCategoryFilter}
          galleryCards={galleryCards}
          galleryCategories={galleryCategories}
          effectLabel={effectLabel}
        />
      ) : null}

      {!isAdminRoute && activeUserTab === 'rules' ? (
        <RulesSection t={t} rules={rules} />
      ) : null}

      {isAdminRoute && adminAuthorized ? (
        <AdminPage
          lang={lang}
          adminToken={adminToken}
          serverUrl={SERVER_URL}
          serverUrlDraft={serverUrlDraft}
          onServerUrlDraftChange={setServerUrlDraft}
          onSaveServerUrl={saveServerUrl}
          onResetServerUrl={resetServerUrl}
          matches={matches.map((m) => ({ id: m.matchID, createdAt: Date.now() }))}
          activeMatchId={adminMatchID}
          snapshot={snapshot}
          deckStats={{
            deck: sharedDeckStats.deck,
            discard: 0,
            legendary: sharedDeckStats.legendary,
            rankTrack: sharedDeckStats.rankTrack,
          }}
          sharedDeckTemplate={sharedDeckTemplate}
          cardCatalog={cardCatalog}
          onCreateMatch={createRoom}
          onResetMatch={() => {}}
          onDeleteMatch={() => {}}
          onResetAll={() => {
            window.localStorage.removeItem(SESSION_STORAGE_KEY);
            window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
            setSession(null);
            setPlayerName('');
            setError('');
            void refreshMatches();
          }}
          onRestartServer={async () => {
            try {
              const response = await adminFetch(ADMIN_RESTART_API, { method: 'POST' });
              return response.ok;
            } catch {
              return false;
            }
          }}
          onShuffleDeck={() => {
            shuffleSharedDeckTemplate();
            refreshSharedDeckTemplate();
          }}
          onAddCard={(target: DeckTarget, cardId: string) => {
            addCardToSharedDeckTemplate(target, cardId);
            refreshSharedDeckTemplate();
          }}
          onAddCustomCard={(target: DeckTarget, card: CardDefinition) => {
            addCustomCardToSharedDeckTemplate(target, card);
            refreshSharedDeckTemplate();
          }}
          onUpdateCard={(target: DeckTarget, index: number, card: CardDefinition) => {
            updateCardAtInSharedDeckTemplate(target, index, card);
            refreshSharedDeckTemplate();
          }}
          onRemoveCard={(target: DeckTarget, index: number) => {
            removeCardAtFromSharedDeckTemplate(target, index);
            refreshSharedDeckTemplate();
          }}
          onResetTemplate={() => {
            resetSharedDeckTemplate();
            refreshSharedDeckTemplate();
          }}
          onSetDeckBackImage={(path?: string) => {
            setSharedDeckBackImage(path);
            refreshSharedDeckTemplate();
          }}
          onExportTemplate={() => exportSharedDeckTemplateJson()}
          onImportTemplate={(json: string) => {
            const result = importSharedDeckTemplateJson(json);
            if (!result.ok) return result.error;
            refreshSharedDeckTemplate();
            return null;
          }}
          sharedRanks={sharedRanks}
          onUpdateRanks={(nextRanks: RankDefinition[]) => {
            const ok = setSharedRanks(nextRanks);
            if (!ok) return false;
            const normalized = getSharedRanks();
            setSharedRanksState(normalized);
            window.localStorage.setItem(RANKS_STORAGE_KEY, JSON.stringify(normalized));
            void syncRanksToServer(normalized);
            return true;
          }}
          onResetRanks={() => {
            resetSharedRanks();
            const normalized = getSharedRanks();
            setSharedRanksState(normalized);
            window.localStorage.setItem(RANKS_STORAGE_KEY, JSON.stringify(normalized));
            void adminFetch(`${RANKS_API}/reset`, { method: 'POST' });
          }}
          onRunSimulations={(players: number, simulations: number) =>
            runGameSimulations(players, simulations)
          }
        />
      ) : null}
    </main>
  );
};
