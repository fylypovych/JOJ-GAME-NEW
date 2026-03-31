import { useEffect, useState } from 'react';
import { getAdminCsrfToken } from '../admin/authHeaders';

type Params = {
  isAdminRoute: boolean;
  serverUrl: string;
  defaultServerUrl: string;
  serverUrlStorageKey: string;
  unauthorizedText: string;
  serverUnavailableText: string;
};

export const useAdminAuth = ({
  isAdminRoute,
  serverUrl,
  defaultServerUrl,
  serverUrlStorageKey,
  unauthorizedText,
  serverUnavailableText,
}: Params) => {
  const [adminAuthChecking, setAdminAuthChecking] = useState<boolean>(false);
  const [adminAuthorized, setAdminAuthorized] = useState<boolean>(!isAdminRoute);
  const [adminAuthEnabled, setAdminAuthEnabled] = useState<boolean | null>(null);
  const [adminAuthError, setAdminAuthError] = useState<string>('');

  const tryVerify = async (targetServerUrl: string) => {
    const response = await fetch(`${targetServerUrl}/api/admin/verify`, { credentials: 'include' });
    return response;
  };

  const adminFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers ?? undefined);
    const csrfToken = getAdminCsrfToken();
    if (csrfToken && !headers.has('x-csrf-token')) headers.set('x-csrf-token', csrfToken);
    const response = await fetch(input, { ...init, headers, credentials: 'include' });
    if (response.status === 401) {
      setAdminAuthorized(false);
      setAdminAuthError(unauthorizedText);
    }
    return response;
  };

  const verifyAdminToken = async (): Promise<boolean> => {
    setAdminAuthChecking(true);
    setAdminAuthError('');
    try {
      let response = await tryVerify(serverUrl);
      let resolvedServerUrl = serverUrl;
      if (!response.ok && response.status >= 500 && defaultServerUrl && defaultServerUrl !== serverUrl) {
        try {
          const fallbackResponse = await tryVerify(defaultServerUrl);
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
      setAdminAuthorized(true);
      if (resolvedServerUrl !== serverUrl) {
        window.location.reload();
      }
      return true;
    } catch {
      if (defaultServerUrl && defaultServerUrl !== serverUrl) {
        try {
          const fallbackResponse = await tryVerify(defaultServerUrl);
          if (!fallbackResponse.ok) {
            setAdminAuthorized(false);
            setAdminAuthError(fallbackResponse.status === 401 ? unauthorizedText : serverUnavailableText);
            return false;
          }
          window.localStorage.setItem(serverUrlStorageKey, defaultServerUrl);
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
        void verifyAdminToken();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);

  return {
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
