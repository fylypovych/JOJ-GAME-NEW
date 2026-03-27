import { useEffect, useState } from 'react';

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  role: 'user' | 'administrator';
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  preferredLang: 'uk' | 'en';
  profilePublic: boolean;
  showStatsPublic: boolean;
  showRecentMatchesPublic: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type UserStats = {
  matchesLinked: number;
  matchesFinished: number;
  wins: number;
  rankWins: number;
  scoreWins: number;
  stalledMatches: number;
  botMatchesFinished: number;
  winRatePct: number;
  avgTurns: number;
  bestRankId: string;
  bestRankName: string;
  resourcesGainedTotal: number;
  resourcesLostTotal: number;
  lyapsPlayedOnOthers: number;
  scandalsPlayedOnOthers: number;
  lastMatchAt: string | null;
  byMode: Array<{
    mode: 'standard' | 'standard_plus' | 'simplified';
    matchesFinished: number;
    wins: number;
    winRatePct: number;
  }>;
  byPlayerCount: Array<{
    playerCount: number;
    matchesFinished: number;
    wins: number;
    winRatePct: number;
  }>;
};

export type UserMatchHistoryItem = {
  matchId: string;
  playerId: string;
  playerName: string | null;
  winnerPlayerId: string | null;
  winnerPlayerName: string | null;
  endReason: string | null;
  turnsCompleted: number;
  gameMode: 'standard' | 'standard_plus' | 'simplified';
  playerCount: number;
  botCount: number;
  botDifficulty: 'easy' | 'normal' | 'hard' | null;
  finalRankId: string;
  finalResources: Record<string, number>;
  resourcesGainedTotal: number;
  resourcesLostTotal: number;
  lyapsPlayedOnOthers: number;
  scandalsPlayedOnOthers: number;
  linkedAt: string;
  persistedAt: string;
};

export type UserSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  sourceIp: string | null;
  userAgent: string | null;
};

export type UserAward = {
  awardId: string;
  key: string;
  title: string;
  description: string;
  category: 'general' | 'ranks' | 'resources' | 'actions';
  metric:
    | 'matches_linked'
    | 'matches_finished'
    | 'wins'
    | 'win_rate_pct'
    | 'avg_turns'
    | 'best_rank_order'
    | 'resources_gained_total'
    | 'resources_lost_total'
    | 'lyaps_played_on_others'
    | 'scandals_played_on_others';
  threshold: number;
  badgeLabel: string;
  badgeVariant: 'bronze' | 'silver' | 'gold' | 'special';
  iconPath: string | null;
  progressValue: number;
  awarded: boolean;
  awardedAt: string | null;
};

const USER_ACCOUNT_ERRORS = {
  genericRequest: 'Request failed',
} as const;

export const useUserAccount = (args: { serverUrl: string; lang: 'uk' | 'en' }) => {
  const { serverUrl, lang } = args;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [awards, setAwards] = useState<UserAward[]>([]);
  const [matchHistory, setMatchHistory] = useState<UserMatchHistoryItem[]>([]);

  const authBase = `${serverUrl}/api/auth`;
  const profileBase = `${serverUrl}/api/profile`;
  const userLobbyBase = `${serverUrl}/api/user-lobby`;

  const applyPayloadCsrf = (payload: unknown) => {
    const nextCsrf = (payload as { csrfToken?: string })?.csrfToken;
    if (typeof nextCsrf === 'string' && nextCsrf.trim()) setCsrfToken(nextCsrf);
  };

  const ensureCsrfToken = async () => {
    if (csrfToken.trim()) return csrfToken;
    const response = await fetch(`${authBase}/me`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String((payload as { error?: string }).error ?? USER_ACCOUNT_ERRORS.genericRequest));
    }
    applyPayloadCsrf(payload);
    const nextCsrf = typeof (payload as { csrfToken?: string }).csrfToken === 'string'
      ? String((payload as { csrfToken?: string }).csrfToken)
      : '';
    return nextCsrf;
  };

  const postJsonWithCsrf = async (url: string, body?: unknown) => {
    const token = await ensureCsrfToken();
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: body ? JSON.stringify(body) : '{}',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String((payload as { error?: string }).error ?? USER_ACCOUNT_ERRORS.genericRequest));
    }
    applyPayloadCsrf(payload);
    return payload as Record<string, unknown>;
  };

  const fetchJson = async (url: string) => {
    const response = await fetch(url, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    applyPayloadCsrf(payload);
    if (!response.ok) {
      throw new Error(String((payload as { error?: string }).error ?? USER_ACCOUNT_ERRORS.genericRequest));
    }
    return payload as Record<string, unknown>;
  };

  const refreshUser = async () => {
    setLoading(true);
    try {
      const mePayload = await fetchJson(`${authBase}/me`);
      const nextUser = (mePayload as { user?: AuthUser | null }).user ?? null;
      setUser(nextUser);
      if (nextUser) {
        const profilePayload = await fetchJson(`${profileBase}/me`);
        setStats((profilePayload as { stats?: UserStats | null }).stats ?? null);
        setAwards((profilePayload as { awards?: UserAward[] }).awards ?? []);
        setMatchHistory((profilePayload as { matchHistory?: UserMatchHistoryItem[] }).matchHistory ?? []);
        const sessionsPayload = await fetchJson(`${profileBase}/sessions`);
        setSessions((sessionsPayload as { sessions?: UserSession[] }).sessions ?? []);
      } else {
        setStats(null);
        setSessions([]);
        setAwards([]);
        setMatchHistory([]);
      }
      setError('');
    } catch (nextError) {
      setError(String(nextError instanceof Error ? nextError.message : nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, [serverUrl]);

  const register = async (input: {
    username: string;
    email: string;
    password: string;
    displayName: string;
  }) => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${authBase}/register`, { ...input, preferredLang: lang });
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  const login = async (input: { login: string; password: string }) => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${authBase}/login`, input);
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${authBase}/logout`);
      setUser(null);
      setStats(null);
      setSessions([]);
      setAwards([]);
      setMatchHistory([]);
      setError('');
      setCsrfToken('');
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  const updateProfile = async (input: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    preferredLang: 'uk' | 'en';
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  }) => {
    setBusy(true);
    try {
      const payload = await postJsonWithCsrf(`${profileBase}/me`, input);
      setUser((payload as { user?: AuthUser }).user ?? null);
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  const bindMatchSession = async (input: { matchID: string; playerID: string; credentials: string; playerName?: string }) => {
    if (!user) return;
    try {
      await postJsonWithCsrf(`${profileBase}/bind-session-match`, input);
      setError('');
      return true;
    } catch (nextError) {
      setError(String(nextError instanceof Error ? nextError.message : nextError));
      return false;
    }
  };

  const changePassword = async (input: { currentPassword: string; nextPassword: string }) => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${authBase}/change-password`, input);
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  const requestPasswordReset = async (login: string) => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${authBase}/request-password-reset`, { login });
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (input: { token: string; nextPassword: string }) => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${authBase}/reset-password`, input);
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  const refreshSessions = async () => {
    if (!user) {
      setSessions([]);
      return;
    }
    const payload = await fetchJson(`${profileBase}/sessions`);
    setSessions((payload as { sessions?: UserSession[] }).sessions ?? []);
  };

  const logoutAllSessions = async () => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${profileBase}/logout-all`);
      setUser(null);
      setStats(null);
      setSessions([]);
      setAwards([]);
      setMatchHistory([]);
      setError('');
      setCsrfToken('');
    } finally {
      setBusy(false);
    }
  };

  const logoutSession = async (sessionId: string) => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${profileBase}/logout-session`, { sessionId });
      await refreshSessions();
    } finally {
      setBusy(false);
    }
  };

  const createAndJoinOwnedMatch = async (input: {
    gameName: string;
    numPlayers: number;
    setupData: unknown;
    playerName: string;
  }) => {
    const payload = await postJsonWithCsrf(`${userLobbyBase}/create-and-join`, input);
    return (payload as { session: { matchID: string; playerID: string; credentials: string } }).session;
  };

  const joinOwnedMatch = async (input: {
    gameName: string;
    matchID: string;
    playerID: string;
    playerName: string;
  }) => {
    const payload = await postJsonWithCsrf(`${userLobbyBase}/join`, input);
    return (payload as { session: { matchID: string; playerID: string; credentials: string } }).session;
  };

  return {
    user,
    stats,
    awards,
    matchHistory,
    sessions,
    loading,
    busy,
    error,
    setError,
    refreshUser,
    refreshSessions,
    register,
    login,
    logout,
    updateProfile,
    changePassword,
    requestPasswordReset,
    resetPassword,
    logoutAllSessions,
    logoutSession,
    createAndJoinOwnedMatch,
    joinOwnedMatch,
    bindMatchSession,
  };
};
