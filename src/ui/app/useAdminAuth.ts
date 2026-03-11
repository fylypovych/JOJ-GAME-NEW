import { useEffect, useState } from 'react';

type Params = {
  isAdminRoute: boolean;
  serverUrl: string;
  defaultServerUrl: string;
  serverUrlStorageKey: string;
  adminTokenStorageKey: string;
  initialToken: string;
  unauthorizedText: string;
  serverUnavailableText: string;
};

export const useAdminAuth = ({
  isAdminRoute,
  serverUrl,
  defaultServerUrl,
  serverUrlStorageKey,
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

  const tryVerify = async (targetServerUrl: string, candidateToken: string) => {
    const headers = new Headers();
    if (candidateToken.trim()) headers.set('x-admin-token', candidateToken.trim());
    const response = await fetch(`${targetServerUrl}/api/admin/verify`, { headers, credentials: 'include' });
    return response;
  };

  const adminFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers ?? undefined);
    const token = adminToken.trim();
    if (token) headers.set('x-admin-token', token);
    const response = await fetch(input, { ...init, headers, credentials: 'include' });
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
      let response = await tryVerify(serverUrl, candidateToken);
      let resolvedServerUrl = serverUrl;
      if (!response.ok && response.status >= 500 && defaultServerUrl && defaultServerUrl !== serverUrl) {
        try {
          const fallbackResponse = await tryVerify(defaultServerUrl, candidateToken);
          if (fallbackResponse.ok || fallbackResponse.status === 401) {
            response = fallbackResponse;
            resolvedServerUrl = defaultServerUrl;
            window.localStorage.setItem(serverUrlStorageKey, defaultServerUrl);
          }
        } catch {
          // ignore fallback failure here, outer catch will handle the original network problem
        }
      }
      if (!response.ok) {
        setAdminAuthorized(false);
        setAdminAuthError(response.status === 401 ? unauthorizedText : serverUnavailableText);
        return false;
      }
      const trimmed = candidateToken.trim();
      setAdminToken(trimmed);
      window.localStorage.setItem(adminTokenStorageKey, trimmed);
      setAdminAuthorized(true);
      if (resolvedServerUrl !== serverUrl) {
        window.location.reload();
      }
      return true;
    } catch {
      if (defaultServerUrl && defaultServerUrl !== serverUrl) {
        try {
          const fallbackResponse = await tryVerify(defaultServerUrl, candidateToken);
          if (!fallbackResponse.ok) {
            setAdminAuthorized(false);
            setAdminAuthError(fallbackResponse.status === 401 ? unauthorizedText : serverUnavailableText);
            return false;
          }
          const trimmed = candidateToken.trim();
          window.localStorage.setItem(serverUrlStorageKey, defaultServerUrl);
          setAdminToken(trimmed);
          window.localStorage.setItem(adminTokenStorageKey, trimmed);
          setAdminAuthorized(true);
          window.location.reload();
          return true;
        } catch {
          // fall through to unavailable state
        }
      }
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
