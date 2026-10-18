import type { components } from '@lingyu/contracts';
type Schema = components['schemas'];
let csrf = '';
export class AdminRequestError extends Error {
  constructor(readonly status: number, readonly requestId?: string) { super('后台请求失败'); }
}
async function request<T>(path: string, method = 'GET', input?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  const response = await fetch('/api/v1/admin/' + path, { method, headers, credentials: 'same-origin', body: input === undefined ? undefined : JSON.stringify(input) });
  let body: { data?: T; requestId?: string };
  try { body = await response.json(); } catch { throw new AdminRequestError(response.status); }
  if (!response.ok) { if (response.status === 401) csrf = ''; throw new AdminRequestError(response.status, body.requestId); }
  return body.data as T;
}
export const adminApi = {
  async me() { const data = await request<Schema['AdminSessionData']>('auth/me'); csrf = data.csrfToken; return data; },
  async login(input: Schema['AdminLoginRequest']) { const data = await request<Schema['AdminSessionData']>('auth/login', 'POST', input); csrf = data.csrfToken; return data; },
  async logout() { await request('auth/logout', 'POST'); csrf = ''; },
  list: () => request<Schema['AdminAccountData'][]>('iam/admins'),
  create: (input: Schema['AdminCreateRequest']) => request<Schema['AdminAccountData']>('iam/admins', 'POST', input),
  update: (id: string, input: Schema['AdminUpdateRequest']) => request<Schema['AdminAccountData']>('iam/admins/' + id, 'PATCH', input),
  audit: () => request<Schema['AdminAuditItem'][]>('iam/audit'),
};
