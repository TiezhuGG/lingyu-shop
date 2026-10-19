import { BadRequestException } from '@nestjs/common';
import { parseContractInput } from '../foundation/contract-input';
export function parseStorefrontUpdate(input: unknown) {
  const value = parseContractInput('StorefrontUpdateRequest', input);
  const displayName = value.displayName.trim();
  if (!displayName || new Set(value.fulfillmentRules.map(rule => rule.method)).size !== 3 ||
      value.fulfillmentRules.some(rule => rule.method !== 'PICKUP' && rule.pickupAddress !== null)) throw new BadRequestException();
  return { ...value, displayName, fulfillmentRules: value.fulfillmentRules.map(rule => ({ ...rule,
    serviceDescription: rule.serviceDescription?.trim() || null, pickupAddress: rule.pickupAddress?.trim() || null,
  })) };
}
