const TOKEN_KEY = import.meta.env.VITE_AUTH_TOKEN_KEY || 'authToken';
const USER_KEY = import.meta.env.VITE_AUTH_USER_KEY || 'authUser';

type StorageMode = 'local' | 'session';

const storages: Array<Storage | null> = [
  typeof window !== 'undefined' ? window.localStorage : null,
  typeof window !== 'undefined' ? window.sessionStorage : null,
];

const resolveStorage = (mode: StorageMode): Storage | null => {
  if (typeof window === 'undefined') return null;
  return mode === 'local' ? window.localStorage : window.sessionStorage;
};

export const getStoredToken = (): string | null => {
  for (const storage of storages) {
    try {
      const token = storage?.getItem(TOKEN_KEY) || storage?.getItem('token');
      if (token && token.trim()) {
        return token.trim();
      }
    } catch (error) {
      console.warn('Unable to read auth token from storage', error);
    }
  }
  return null;
};

export interface StoredAuthUser {
  userId?: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  tokenType?: string;
}

export const getStoredUser = (): StoredAuthUser | null => {
  for (const storage of storages) {
    try {
      const raw = storage?.getItem(USER_KEY);
      if (raw) {
        return JSON.parse(raw) as StoredAuthUser;
      }
    } catch (error) {
      console.warn('Unable to parse stored auth user', error);
    }
  }
  return null;
};

export const storeAuthSession = (
  token: string,
  options: {
    remember?: boolean;
    user?: StoredAuthUser;
  } = {}
): void => {
  const { remember = true, user } = options;
  const targetStorage = resolveStorage(remember ? 'local' : 'session');
  if (!targetStorage) return;

  try {
    targetStorage.setItem(TOKEN_KEY, token);
    if (user) {
      targetStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  } catch (error) {
    console.error('Failed to store auth session', error);
  }
};

export const clearAuthSession = (): void => {
  for (const storage of storages) {
    try {
      storage?.removeItem(TOKEN_KEY);
      storage?.removeItem('token');
      storage?.removeItem(USER_KEY);
    } catch (error) {
      console.warn('Unable to clear auth storage', error);
    }
  }
};

let logoutRedirectScheduled = false;

const resolveLoginPath = (): string => {
  const fallback = '/login';
  if (typeof window === 'undefined') {
    return fallback;
  }
  const custom = import.meta.env?.VITE_LOGIN_ROUTE;
  if (typeof custom === 'string' && custom.trim().length > 0) {
    return custom.trim();
  }
  return fallback;
};

export const logoutAndRedirect = (): void => {
  clearAuthSession();
  if (typeof window === 'undefined') {
    return;
  }
  if (logoutRedirectScheduled) {
    return;
  }
  logoutRedirectScheduled = true;

  const loginPath = resolveLoginPath();
  if (window.location.pathname === loginPath) {
    window.location.reload();
    return;
  }

  window.location.replace(loginPath);
};


