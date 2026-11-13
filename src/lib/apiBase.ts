const ELECTRON_CONTROL_BASE = 'http://127.0.0.1:45921';
const LOCAL_BACKEND_BASE = 'http://127.0.0.1:5001';

/**
 * Resolves relative `/api/*` paths when the app is loaded inside Electron from
 * a hosted origin (e.g. https://ecotrophy-inventory.web.app) or when a custom
 * backend base URL is configured via `VITE_API_BASE_URL`.
 */
export function resolveApiUrl(path: string): string {
  if (!path.startsWith('/api/')) return path;

  const customBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '');
  if (customBase) {
    return `${customBase}${path}`;
  }

  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    const isLocalHost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalHost) {
      if (path.startsWith('/api/desktop/')) {
        return `${ELECTRON_CONTROL_BASE}${path.slice('/api/desktop'.length)}`;
      }
      return `${LOCAL_BACKEND_BASE}${path}`;
    }
  }

  return path;
}

