import document from './openapi.json';

export { createAppAuthClient, createContractClient, ContractHttpError } from './client';
export type { AppAuthFetch, ContractFetch, ContractFetchResponse } from './client';
export type { components, operations, paths } from './generated/openapi';

import type { components } from './generated/openapi';

// The JSON source is committed and is the only public schema source. It is
// deliberately exported for server-side validation, not reconstructed as DTOs.
export const contractOpenApi = Object.freeze(document);

export type ContractProbeRequest = components['schemas']['ContractProbeRequest'];
export type ContractProbeData = components['schemas']['ContractProbeData'];
export type ContractProbeSuccess = components['schemas']['ContractProbeSuccess'];
export type DevelopmentLoginRequest = components['schemas']['DevelopmentLoginRequest'];
export type RefreshSessionRequest = components['schemas']['RefreshSessionRequest'];
export type AppSessionData = components['schemas']['AppSessionData'];
export type AppSessionSuccess = components['schemas']['AppSessionSuccess'];
export type CurrentCustomerSuccess = components['schemas']['CurrentCustomerSuccess'];
export type ApiError = components['schemas']['ApiError'];
export type ContractValidationDetails = NonNullable<ApiError['details']>;
