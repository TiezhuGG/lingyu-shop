import type { components } from './generated/openapi';

type ContractProbeRequest = components['schemas']['ContractProbeRequest'];
type ContractProbeSuccess = components['schemas']['ContractProbeSuccess'];
type DevelopmentLoginRequest = components['schemas']['DevelopmentLoginRequest'];
type RefreshSessionRequest = components['schemas']['RefreshSessionRequest'];
type AppSessionSuccess = components['schemas']['AppSessionSuccess'];
type CurrentCustomerSuccess = components['schemas']['CurrentCustomerSuccess'];

export interface ContractFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type ContractFetch = (url: string, init: {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}) => Promise<ContractFetchResponse>;

export type AppAuthFetch = (url: string, init: {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}) => Promise<ContractFetchResponse>;

export class ContractHttpError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super('Contract request failed');
  }
}

export function createContractClient(baseUrl: string, request: ContractFetch) {
  const endpoint = new URL('/api/v1/_contract/probe', baseUrl).toString();
  return Object.freeze({
    async contractProbe(input: ContractProbeRequest, requestId?: string): Promise<ContractProbeSuccess> {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (requestId !== undefined) headers['x-request-id'] = requestId;
      const response = await request(endpoint, { method: 'POST', headers, body: JSON.stringify(input) });
      const body = await response.json();
      if (!response.ok) throw new ContractHttpError(response.status, body);
      return body as ContractProbeSuccess;
    },
  });
}

export function createAppAuthClient(baseUrl: string, request: AppAuthFetch) {
  const endpoint = (path: string): string => new URL(path, baseUrl).toString();
  const post = async <T>(path: string, input: unknown): Promise<T> => {
    const response = await request(endpoint(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const body = await response.json();
    if (!response.ok) throw new ContractHttpError(response.status, body);
    return body as T;
  };
  return Object.freeze({
    developmentLogin(input: DevelopmentLoginRequest): Promise<AppSessionSuccess> { return post('/api/v1/app/auth/development-login', input); },
    refresh(input: RefreshSessionRequest): Promise<AppSessionSuccess> { return post('/api/v1/app/auth/refresh', input); },
    async logout(accessToken: string): Promise<void> {
      const response = await request(endpoint('/api/v1/app/auth/logout'), { method: 'POST', headers: { authorization: 'Bearer ' + accessToken } });
      const body = await response.json();
      if (!response.ok) throw new ContractHttpError(response.status, body);
    },
    async me(accessToken: string): Promise<CurrentCustomerSuccess> {
      const response = await request(endpoint('/api/v1/app/auth/me'), { method: 'GET', headers: { authorization: 'Bearer ' + accessToken } });
      const body = await response.json();
      if (!response.ok) throw new ContractHttpError(response.status, body);
      return body as CurrentCustomerSuccess;
    },
  });
}
