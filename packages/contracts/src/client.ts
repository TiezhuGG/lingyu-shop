import type { components } from './generated/openapi';

type ContractProbeRequest = components['schemas']['ContractProbeRequest'];
type ContractProbeSuccess = components['schemas']['ContractProbeSuccess'];

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
