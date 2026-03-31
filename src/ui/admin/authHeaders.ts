const readCookie = (name: string) => {
  if (typeof document === 'undefined' || typeof document.cookie !== 'string') return '';
  const prefix = `${name}=`;
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!value) return '';
  return decodeURIComponent(value.slice(prefix.length));
};

export const getAdminCsrfToken = () => readCookie('joj_user_csrf');

export const buildAdminHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  const csrfToken = getAdminCsrfToken();
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  return headers;
};
