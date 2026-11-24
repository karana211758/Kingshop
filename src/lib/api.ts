// In-memory access token holder (never persisted to localStorage or sessionStorage)
let memoryAccessToken: string | null = null;

export function setMemoryAccessToken(token: string | null) {
  memoryAccessToken = token;
}

export function getMemoryAccessToken(): string | null {
  return memoryAccessToken;
}

export class ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;

  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    retryOnAuth?: boolean;
  } = {}
): Promise<T> {
  const { method = 'GET', body, retryOnAuth = true } = options;

  const headers: Record<string, string> = {
    'X-Requested-With': 'KING-CAMERA-SHOP',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (memoryAccessToken) {
    headers['Authorization'] = `Bearer ${memoryAccessToken}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && retryOnAuth && path !== '/api/auth/refresh') {
    // Attempt silent rotating refresh once
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'X-Requested-With': 'KING-CAMERA-SHOP' },
      credentials: 'include',
    });
    if (refreshRes.ok) {
      const refreshJson = (await refreshRes.json()) as { accessToken?: string };
      if (refreshJson.accessToken) {
        setMemoryAccessToken(refreshJson.accessToken);
        return apiFetch<T>(path, { method, body, retryOnAuth: false });
      }
    } else {
      setMemoryAccessToken(null);
    }
  }

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      typeof json.error === 'string' ? json.error : 'Request failed',
      response.status,
      json
    );
  }

  return json as T;
}
