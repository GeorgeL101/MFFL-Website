export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') || '';

export async function api<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include', // keep your Node session cookie
    headers: { accept: 'application/json', ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function ymd(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
