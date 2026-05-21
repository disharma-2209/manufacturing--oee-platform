import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    useAuthStore.getState().clearAuth();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  download: async (path: string): Promise<Blob> => {
    const token = useAuthStore.getState().token;
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  },

  uploadFile: async <T>(path: string, formData: FormData): Promise<T> => {
    const token = useAuthStore.getState().token;
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
};

export function streamAIAnalysis(
  analysisType: string,
  uploadId?: number,
  extra?: Record<string, unknown>,
  onChunk?: (text: string) => void,
  onDone?: (fullResponse: string) => void,
  onError?: (error: string) => void
): () => void {
  const token = useAuthStore.getState().token;
  const controller = new AbortController();

  fetch(`${BASE_URL}/ai/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ analysisType, uploadId, extra }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      onError?.('Request failed');
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) { onError?.('No stream'); return; }
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              fullResponse += data.text;
              onChunk?.(data.text);
            }
            if (data.done) {
              onDone?.(data.fullResponse || fullResponse);
            }
            if (data.error) {
              onError?.(data.error);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError?.(err.message || 'Stream error');
    }
  });

  return () => controller.abort();
}
