import { useEffect, useState } from 'react';

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
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
  winRatePct: number;
  avgTurns: number;
  bestRankId: string;
  bestRankName: string;
  resourcesGainedTotal: number;
  resourcesLostTotal: number;
  lyapsPlayedOnOthers: number;
  scandalsPlayedOnOthers: number;
  lastMatchAt: string | null;
};

export type UserSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  sourceIp: string | null;
  userAgent: string | null;
};

export type PublicUserProfile = {
  user: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
    createdAt: string;
  };
  stats: UserStats | null;
  recentMatches: Array<{
    matchId: string;
    playerId: string;
    playerName: string | null;
    linkedAt: string;
  }>;
};

export const useUserAccount = (args: { serverUrl: string; lang: 'uk' | 'en' }) => {
  const { serverUrl, lang } = args;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [resetTokenPreview, setResetTokenPreview] = useState<string>('');
  const [resetTokenExpiresAt, setResetTokenExpiresAt] = useState<string>('');
  const [publicProfile, setPublicProfile] = useState<PublicUserProfile | null>(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileError, setPublicProfileError] = useState('');

  const authBase = `${serverUrl}/api/auth`;
  const profileBase = `${serverUrl}/api/profile`;
  const userLobbyBase = `${serverUrl}/api/user-lobby`;

  const postJsonWithCsrf = async (url: string, body?: unknown) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    body: body ? JSON.stringify(body) : '{}',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: string }).error ?? 'Request failed'));
  }
  const nextCsrf = (payload as { csrfToken?: string }).csrfToken;
  if (typeof nextCsrf === 'string') setCsrfToken(nextCsrf);
  return payload as Record<string, unknown>;
};

  const refreshUser = async () => {
    setLoading(true);
    try {
      const meResponse = await fetch(`${authBase}/me`, { credentials: 'include' });
      const mePayload = await meResponse.json().catch(() => ({}));
      const nextCsrf = (mePayload as { csrfToken?: string }).csrfToken;
      if (typeof nextCsrf === 'string') setCsrfToken(nextCsrf);
      const nextUser = (mePayload as { user?: AuthUser | null }).user ?? null;
      setUser(nextUser);
      if (nextUser) {
        const profileResponse = await fetch(`${profileBase}/me`, { credentials: 'include' });
        const profilePayload = await profileResponse.json().catch(() => ({}));
        setStats((profilePayload as { stats?: UserStats | null }).stats ?? null);
        const sessionsResponse = await fetch(`${profileBase}/sessions`, { credentials: 'include' });
        const sessionsPayload = await sessionsResponse.json().catch(() => ({}));
        setSessions((sessionsPayload as { sessions?: UserSession[] }).sessions ?? []);
      } else {
        setStats(null);
        setSessions([]);
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
      setError('');
      setCsrfToken('');
    } finally {
      setBusy(false);
    }
  };

  const updateProfile = async (input: {
    displayName: string;
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

  const linkMatch = async (input: { matchID: string; playerID: string; playerName?: string }) => {
    if (!user) return;
    try {
      await postJsonWithCsrf(`${profileBase}/link-match`, input);
    } catch {
      // keep linking best-effort to avoid breaking room join flow
    }
  };

  const bindMatchSession = async (input: { matchID: string; playerID: string; credentials: string; playerName?: string }) => {
    if (!user) return;
    try {
      await postJsonWithCsrf(`${profileBase}/bind-session-match`, input);
    } catch {
      // keep binding best-effort to avoid breaking room join flow
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
      const payload = await postJsonWithCsrf(`${authBase}/request-password-reset`, { login });
      setResetTokenPreview(String((payload as { resetTokenPreview?: string | null }).resetTokenPreview ?? ''));
      setResetTokenExpiresAt(String((payload as { resetTokenExpiresAt?: string | null }).resetTokenExpiresAt ?? ''));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (input: { token: string; nextPassword: string }) => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${authBase}/reset-password`, input);
      setResetTokenPreview('');
      setResetTokenExpiresAt('');
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
    const response = await fetch(`${profileBase}/sessions`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    setSessions((payload as { sessions?: UserSession[] }).sessions ?? []);
  };

  const logoutAllSessions = async () => {
    setBusy(true);
    try {
      await postJsonWithCsrf(`${profileBase}/logout-all`);
      setUser(null);
      setStats(null);
      setSessions([]);
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

  const fetchPublicProfile = async (username: string) => {
    const normalized = username.trim();
    if (!normalized) {
      setPublicProfile(null);
      setPublicProfileError('');
      return null;
    }
    setPublicProfileLoading(true);
    setPublicProfileError('');
    try {
      const response = await fetch(`${serverUrl}/api/users/profile?username=${encodeURIComponent(normalized)}`, {
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !(payload as { ok?: boolean }).ok) {
        throw new Error(String((payload as { error?: string }).error ?? 'Request failed'));
      }
      const nextProfile = payload as PublicUserProfile & { ok: true };
      setPublicProfile({
        user: nextProfile.user,
        stats: nextProfile.stats ?? null,
        recentMatches: nextProfile.recentMatches ?? [],
      });
      return nextProfile;
    } catch (nextError) {
      const message = String(nextError instanceof Error ? nextError.message : nextError);
      setPublicProfile(null);
      setPublicProfileError(message);
      throw nextError;
    } finally {
      setPublicProfileLoading(false);
    }
  };

  return {
    user,
    stats,
    sessions,
    loading,
    busy,
    error,
    resetTokenPreview,
    resetTokenExpiresAt,
    publicProfile,
    publicProfileLoading,
    publicProfileError,
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
    fetchPublicProfile,
    linkMatch,
    bindMatchSession,
  };
};
