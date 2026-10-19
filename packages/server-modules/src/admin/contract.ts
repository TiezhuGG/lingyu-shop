import { parseContractInput } from '../foundation/contract-input';
type Name = 'AdminLoginRequest' | 'AdminCreateRequest' | 'AdminUpdateRequest';
export function parseAdminInput<N extends Name>(name: N, input: unknown) {
  return parseContractInput(name, input);
}
