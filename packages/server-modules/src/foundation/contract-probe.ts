import Ajv, { type AnySchema, type ErrorObject } from 'ajv';
import { contractOpenApi, type ContractProbeRequest, type ContractValidationDetails } from '@lingyu/contracts';
import { ContractValidationException, type ValidationDetails, type ValidationRule } from './http-boundary';

type JsonObject = { readonly [key: string]: unknown };
const schemas = (contractOpenApi as unknown as { readonly components: { readonly schemas: JsonObject } }).components.schemas;

function replaceComponentReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(replaceComponentReferences);
  if (value === null || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = key === '$ref' && typeof child === 'string' && child.startsWith('#/components/schemas/')
      ? '#/$defs/' + child.slice('#/components/schemas/'.length)
      : replaceComponentReferences(child);
  }
  return result;
}

const validatorSchema = replaceComponentReferences({
  $id: 'https://lingyu.local/contracts/contract-probe.schema.json',
  $defs: schemas,
  $ref: '#/$defs/ContractProbeRequest',
});
const validate = new Ajv({ allErrors: true, strict: true }).compile<ContractProbeRequest>(validatorSchema as AnySchema);
const validationRules = new Set<ValidationRule>(['additionalProperties', 'enum', 'minLength', 'pattern', 'required', 'type']);

function pathFor(error: ErrorObject): string {
  if (error.keyword === 'required' || error.keyword === 'additionalProperties') return '/';
  const segments = error.instancePath.split('/').filter(segment => /^[A-Za-z0-9_-]+$/.test(segment));
  return '/' + segments.join('/');
}

function validationDetails(errors: ErrorObject[] | null | undefined): ValidationDetails {
  const fields = (errors ?? []).slice(0, 20).map(error => ({
    path: pathFor(error),
    rule: validationRules.has(error.keyword as ValidationRule) ? error.keyword as ValidationRule : 'type' as ValidationRule,
  }));
  return { fields } as ContractValidationDetails;
}

export function parseContractProbe(input: unknown): ContractProbeRequest {
  if (validate(input)) return input as ContractProbeRequest;
  throw new ContractValidationException(validationDetails(validate.errors));
}
