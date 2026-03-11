import { useState } from 'react';

type AdminJsonFetch = (url: string, init?: RequestInit) => Promise<Response>;

type AdminUserListItem = {
  id: string;
  username: string;
  email: string | null;
  role: 'user' | 'administrator';
  displayName: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string | null;
  linkedMatches: number;
  finishedMatches: number;
};

type AdminUserDetail = {
  user: {
    id: string;
    username: string;
    email: string | null;
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    preferredLang: 'uk' | 'en';
    createdAt: string;
    lastLoginAt: string | null;
    role: 'user' | 'administrator';
    status: 'active' | 'disabled';
  };
  stats: {
    matchesLinked: number;
    matchesFinished: number;
    wins: number;
    winRatePct: number;
    avgTurns: number;
    bestRankName: string;
    resourcesGainedTotal: number;
    resourcesLostTotal: number;
    lyapsPlayedOnOthers: number;
    scandalsPlayedOnOthers: number;
  };
  sessions: Array<{
    id: string;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
    sourceIp: string | null;
    userAgent: string | null;
  }>;
  linkedMatches: Array<{
    matchId: string;
    playerId: string;
    playerName: string | null;
    linkedAt: string;
  }>;
  persistedMatches: Array<{
    matchId: string;
    playerId: string;
    playerName: string | null;
    winnerPlayerId: string | null;
    endReason: string | null;
    turnsCompleted: number;
    finalRankId: string;
    resourcesGainedTotal: number;
    resourcesLostTotal: number;
    linkedAt: string;
  }>;
};

export const useAdminUsers = (args: {
  serverUrl: string;
  adminJsonFetch: AdminJsonFetch;
}) => {
  const { serverUrl, adminJsonFetch } = args;
  const [adminUsers, setAdminUsers] = useState<AdminUserListItem[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState('');
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [selectedAdminUserId, setSelectedAdminUserId] = useState('');
  const [selectedAdminUserDetail, setSelectedAdminUserDetail] = useState<AdminUserDetail | null>(null);
  const [adminResetTokenPreview, setAdminResetTokenPreview] = useState('');
  const [adminResetTokenExpiresAt, setAdminResetTokenExpiresAt] = useState('');
  const [adminCreateUserDraft, setAdminCreateUserDraft] = useState({
    username: '',
    displayName: '',
    email: '',
    password: '',
    role: 'user' as 'user' | 'administrator',
  });
  const [adminEditUserDraft, setAdminEditUserDraft] = useState({
    username: '',
    displayName: '',
    email: '',
    bio: '',
    avatarUrl: '',
    preferredLang: 'uk' as 'uk' | 'en',
  });

  const loadAdminUsers = async () => {
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const suffix = adminUserSearch.trim() ? `?search=${encodeURIComponent(adminUserSearch.trim())}` : '';
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users${suffix}`);
      const payload = (await response.json()) as { ok?: boolean; error?: string; users?: AdminUserListItem[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to load users');
      setAdminUsers(payload.users ?? []);
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const loadAdminUserDetail = async (userId: string) => {
    setSelectedAdminUserId(userId);
    setSelectedAdminUserDetail(null);
    setAdminResetTokenPreview('');
    setAdminResetTokenExpiresAt('');
    if (!userId) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/detail?userId=${encodeURIComponent(userId)}`);
      const payload = (await response.json()) as { ok?: boolean; error?: string; detail?: AdminUserDetail };
      if (!response.ok || !payload.ok || !payload.detail) throw new Error(payload.error || 'Failed to load user detail');
      setSelectedAdminUserDetail(payload.detail);
      setAdminEditUserDraft({
        username: payload.detail.user.username ?? '',
        displayName: payload.detail.user.displayName ?? '',
        email: payload.detail.user.email ?? '',
        bio: payload.detail.user.bio ?? '',
        avatarUrl: payload.detail.user.avatarUrl ?? '',
        preferredLang: payload.detail.user.preferredLang ?? 'uk',
      });
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const mutateSelectedUser = async (url: string, body: Record<string, unknown>, reloadList = true) => {
    if (!selectedAdminUserId) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Request failed');
      if (reloadList) await loadAdminUsers();
      await loadAdminUserDetail(selectedAdminUserId);
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const createAdminUser = async () => {
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminCreateUserDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; user?: { id?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to create user');
      setAdminCreateUserDraft({ username: '', displayName: '', email: '', password: '', role: 'user' });
      await loadAdminUsers();
      if (typeof payload.user?.id === 'string') await loadAdminUserDetail(payload.user.id);
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const issueAdminResetToken = async () => {
    const login = selectedAdminUserDetail?.user.username?.trim();
    if (!login) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/users/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        resetTokenPreview?: string | null;
        resetTokenExpiresAt?: string | null;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to issue reset token');
      setAdminResetTokenPreview(String(payload.resetTokenPreview ?? ''));
      setAdminResetTokenExpiresAt(String(payload.resetTokenExpiresAt ?? ''));
    } catch (error) {
      setAdminUsersError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminUsersLoading(false);
    }
  };

  return {
    adminUsers,
    adminUsersLoading,
    adminUsersError,
    adminUserSearch,
    setAdminUserSearch,
    selectedAdminUserId,
    selectedAdminUserDetail,
    adminResetTokenPreview,
    adminResetTokenExpiresAt,
    adminCreateUserDraft,
    setAdminCreateUserDraft,
    adminEditUserDraft,
    setAdminEditUserDraft,
    loadAdminUsers,
    loadAdminUserDetail,
    updateAdminUserStatus: (status: 'active' | 'disabled') =>
      mutateSelectedUser(`${serverUrl}/api/admin/users/status`, { userId: selectedAdminUserId, status }),
    updateAdminUserRole: (role: 'user' | 'administrator') =>
      mutateSelectedUser(`${serverUrl}/api/admin/users/role`, { userId: selectedAdminUserId, role }),
    updateAdminUserProfile: () =>
      mutateSelectedUser(`${serverUrl}/api/admin/users/update`, { userId: selectedAdminUserId, ...adminEditUserDraft }),
    logoutAdminUserSession: (sessionId: string) =>
      mutateSelectedUser(`${serverUrl}/api/admin/users/logout-session`, { sessionId }, false),
    logoutAllAdminUserSessions: () =>
      mutateSelectedUser(`${serverUrl}/api/admin/users/logout-all`, { userId: selectedAdminUserId }, false),
    createAdminUser,
    issueAdminResetToken,
  };
};
