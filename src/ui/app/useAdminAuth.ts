import { useEffect, useState } from 'react';

type Params = {
  isAdminRoute: boolean;
  serverUrl: string;
  adminTokenStorageKey: string;
  initialToken: string;
  unauthorizedText: string;
  serverUnavailableText: string;
};

export const useAdminAuth = ({
  isAdminRoute,
  serverUrl,
  adminTokenStorageKey,
  initialToken,
  unauthorizedText,
  serverUnavailableText,
}: Params) => {
  const [adminToken, setAdminToken] = useState<string>(initialToken);
  const [adminTokenDraft, setAdminTokenDraft] = useState<string>(initialToken);
  const [adminAuthChecking, setAdminAuthChecking] = useState<boolean>(false);
  const [adminAuthorized, setAdminAuthorized] = useState<boolean>(!isAdminRoute);
  const [adminAuthEnabled, setAdminAuthEnabled] = useState<boolean | null>(null);
  const [adminAuthError, setAdminAuthError] = useState<string>('');

  const adminFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers ?? undefined);
    const token = adminToken.trim();
    if (token) headers.set('x-admin-token', token);
    const response = await fetch(input, { ...init, headers });
    if (response.status === 401) {
      setAdminAuthorized(false);
      setAdminAuthError(unauthorizedText);
    }
    return response;
  };

  const verifyAdminToken = async (candidateToken: string): Promise<boolean> => {
    setAdminAuthChecking(true);
    setAdminAuthError('');
    try {
      const headers = new Headers();
      if (candidateToken.trim()) headers.set('x-admin-token', candidateToken.trim());
      const response = await fetch(`${serverUrl}/api/admin/verify`, { headers });
      if (!response.ok) {
        setAdminAuthorized(false);
        setAdminAuthError(response.status === 401 ? unauthorizedText : serverUnavailableText);
        return false;
      }
      const trimmed = candidateToken.trim();
      setAdminToken(trimmed);
      window.localStorage.setItem(adminTokenStorageKey, trimmed);
      setAdminAuthorized(true);
      return true;
    } catch {
      setAdminAuthorized(false);
      setAdminAuthError(serverUnavailableText);
      return false;
    } finally {
      setAdminAuthChecking(false);
    }
  };

  useEffect(() => {
    if (!isAdminRoute) {
      setAdminAuthorized(true);
      setAdminAuthError('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${serverUrl}/api/health`);
        if (response.ok) {
          const payload = (await response.json()) as { adminAuthEnabled?: boolean };
          if (!cancelled && typeof payload.adminAuthEnabled === 'boolean') {
            setAdminAuthEnabled(payload.adminAuthEnabled);
          }
        }
      } catch {
        if (!cancelled) setAdminAuthEnabled(null);
      }
      if (!cancelled) {
        void verifyAdminToken(adminToken);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);

  return {
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
  };
};
