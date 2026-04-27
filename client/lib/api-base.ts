const RAW_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim();

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
  let port = '5000';

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

function apiBaseCandidates(): string[] {
  const candidates: string[] = [];
  const primary = normalizeBaseUrl(RAW_BASE_URL);

  if (primary) {
    candidates.push(primary);
  } else if (typeof window === 'undefined') {
    candidates.push('http://localhost:5000');
  }

  const fallback = browserHostFallback(primary);
  if (fallback && !candidates.includes(fallback)) {
    candidates.push(fallback);
  }

  return candidates;
}

export function buildApiUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const candidates = apiBaseCandidates();
  let lastError: unknown = null;

  for (const baseUrl of candidates) {
    try {
      return await fetch(buildApiUrl(baseUrl, path), init);
    } catch (error) {
      lastError = error;
    }
  }

  const tried = candidates.length > 0 ? candidates.join(', ') : 'no configured API URL';
  const reason = lastError instanceof Error ? lastError.message : 'Unknown network error';
  throw new TypeError(`Failed to fetch API for ${path}. Tried: ${tried}. Reason: ${reason}`);
}
