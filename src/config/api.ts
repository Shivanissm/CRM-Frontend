const rawBase = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
const normalizedBase = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

const resolveIsLocalhost = (): boolean => {
  if (typeof window === 'undefined') return import.meta.env.DEV;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost')
  );
};

const LOCAL_BACKEND_BASE = 'http://localhost:8080';
const isLocal = resolveIsLocalhost();
const preferredBase = isLocal ? LOCAL_BACKEND_BASE : normalizedBase;
const effectiveBase = (preferredBase || '').replace(/\/+$/, '');

export const withApiBase = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return effectiveBase ? `${effectiveBase}${normalizedPath}` : normalizedPath;
};


