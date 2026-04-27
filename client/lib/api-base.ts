const RAW_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim();
const BROWSER_PROXY_BASE = '/api';
const API_FALLBACK_PORTS = ['5000', '3000'];

function normalizeBaseUrl(url: string | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function browserHostFallback(primaryBaseUrl: string | null): string | null {
  if (typeof window === 'undefined') return null;

  const host = window.location.hostname;
  if (!host) return null;

  let protocol: 'http:' | 'https:' = window.location.protocol === 'https:' ? 'https:' : 'http:';
  let port = API_FALLBACK_PORTS[0];

  if (primaryBaseUrl) {
    try {
      const parsed = new URL(primaryBaseUrl);
      protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
      if (parsed.port) port = parsed.port;
      if (parsed.hostname === host) return null;
    } catch {
      // Ignore parse errors and use defaults.
    }
  }

  return `${protocol}//${host}:${port}`;
}

function replaceUrlPort(url: string, port: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.port = port;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function addCandidate(candidates: string[], candidate: string | null): void {
  if (!candidate) return;
  if (candidates.includes(candidate)) return;
  candidates.push(candidate);
}

function apiBaseCandidates(): string[] {
  const candidates: string[] = [];
  const primary = normalizeBaseUrl(RAW_BASE_URL);

  if (typeof window !== 'undefined') {
    addCandidate(candidates, BROWSER_PROXY_BASE);
  }

  if (primary) {
    addCandidate(candidates, primary);
  } else if (typeof window === 'undefined') {
    addCandidate(candidates, 'http://localhost:5000');
    addCandidate(candidates, 'http://localhost:3000');
  }

  const fallback = browserHostFallback(primary);

  for (const port of API_FALLBACK_PORTS) {
    addCandidate(candidates, primary ? replaceUrlPort(primary, port) : null);
    addCandidate(candidates, fallback ? replaceUrlPort(fallback, port) : null);
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    for (const port of API_FALLBACK_PORTS) {
      addCandidate(candidates, `${protocol}//localhost:${port}`);
    }
  }

  return candidates;
}

export function buildApiUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const candidates = apiBaseCandidates();
  let lastError: unknown = null;

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(buildApiUrl(baseUrl, path), init);

      // If Next.js proxying via /api fails (wrong upstream port, backend down, etc.),
      // continue trying direct candidates before surfacing an error.
      if (
        baseUrl === BROWSER_PROXY_BASE &&
        !response.ok &&
        (response.status === 404 || response.status >= 500)
      ) {
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  const tried = candidates.length > 0 ? candidates.join(', ') : 'no configured API URL';
  const reason = lastError instanceof Error ? lastError.message : 'Unknown network error';
  throw new TypeError(`Failed to fetch API for ${path}. Tried: ${tried}. Reason: ${reason}`);
}
