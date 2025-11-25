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

// Log API base URL in development for debugging
if (import.meta.env.DEV) {
  console.log('API Base URL:', effectiveBase || '(using relative paths)');
}

export const withApiBase = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = effectiveBase ? `${effectiveBase}${normalizedPath}` : normalizedPath;
  
  // Warn in production if no base URL is set and we're not on localhost
  if (!import.meta.env.DEV && !effectiveBase && !isLocal) {
    console.warn(
      'VITE_API_BASE_URL is not set. API calls will use relative paths. ' +
      'If your backend is on a different domain, you may encounter CORS errors. ' +
      'Set VITE_API_BASE_URL environment variable to your backend URL.'
    );
  }
  
  return fullUrl;
};


