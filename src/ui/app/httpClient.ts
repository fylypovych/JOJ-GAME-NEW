import { getAdminCsrfToken, getCsrfToken } from '../admin/authHeaders';

type CsrfMode = 'none' | 'user' | 'admin';

type JsonRequestOptions = RequestInit & {
  csrf?: CsrfMode;
  bodyJson?: unknown;
};

const getRequestCsrfToken = (csrf: CsrfMode) => {
  if (csrf === 'admin') return getAdminCsrfToken();
  if (csrf === 'user') return getCsrfToken() || getAdminCsrfToken();
  return '';
};

const ensureUserCsrfToken = async (serverUrl: string) => {
  const existing = getRequestCsrfToken('user');
  if (existing) return existing;
  const response = await fetch(`${serverUrl}/api/auth/me`, { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: string }).error ?? 'Request failed'));
  }
  return getRequestCsrfToken('user');
};

export const createBrowserApiClient = (serverUrl: string) => {
  const requestJson = async <T = Record<string, unknown>>(input: string, options: JsonRequestOptions = {}): Promise<T> => {
    const headers = new Headers(options.headers ?? undefined);
    if (!headers.has('Content-Type') && typeof options.bodyJson !== 'undefined') {
      headers.set('Content-Type', 'application/json');
    }
    const csrfMode = options.csrf ?? 'none';
    const csrfToken = csrfMode === 'user'
      ? await ensureUserCsrfToken(serverUrl)
      : getRequestCsrfToken(csrfMode);
    if (csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
    const response = await fetch(input, {
      ...options,
      headers,
      credentials: 'include',
      body: typeof options.bodyJson === 'undefined'
        ? options.body
        : JSON.stringify(options.bodyJson),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String((payload as { error?: string }).error ?? 'Request failed'));
    }
    return payload as T;
  };

  const getJson = <T = Record<string, unknown>>(input: string, options: RequestInit = {}) =>
    requestJson<T>(input, { ...options, method: options.method ?? 'GET' });

  const postJson = <T = Record<string, unknown>>(input: string, bodyJson?: unknown, options: Omit<JsonRequestOptions, 'bodyJson' | 'method'> = {}) =>
    requestJson<T>(input, { ...options, method: 'POST', bodyJson });

  const fetchWithCredentials = (input: RequestInfo | URL, init: RequestInit = {}) =>
    fetch(input, { ...init, credentials: 'include' });

  return {
    getJson,
    postJson,
    requestJson,
    fetchWithCredentials,
  };
};
