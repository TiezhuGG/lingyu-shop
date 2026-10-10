import type { ContractProbeRequest, ContractProbeSuccess } from '@lingyu/contracts';

// Compile-only compatibility probe for the generated public contract.
export type MiniappContractCompatibility = {
  readonly request: ContractProbeRequest;
  readonly response: ContractProbeSuccess;
};
