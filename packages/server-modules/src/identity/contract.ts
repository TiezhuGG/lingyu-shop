import Ajv, { type AnySchema, type ErrorObject } from 'ajv';
import { contractOpenApi, type components } from '@lingyu/contracts';
import { ContractValidationException, type ValidationDetails, type ValidationRule } from '../foundation/http-boundary';

type JsonObject = { readonly [key: string]: unknown };
const schemas = (contractOpenApi as unknown as { readonly components: { readonly schemas: JsonObject } }).components.schemas;
type DevelopmentLoginRequest = components['schemas']['DevelopmentLoginRequest'];
type RefreshSessionRequest = components['schemas']['RefreshSessionRequest'];

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
function validator(name: string) {
  return new Ajv({ allErrors: true, strict: true }).compile(replaceComponentReferences({
    $id: 'https://lingyu.local/contracts/' + name + '.schema.json', $defs: schemas, $ref: '#/$defs/' + name,
  }) as AnySchema);
}
const validateDevelopmentLogin = validator('DevelopmentLoginRequest');
const validateRefresh = validator('RefreshSessionRequest');
const validationRules = new Set<ValidationRule>(['additionalProperties', 'enum', 'maxLength', 'minLength', 'pattern', 'required', 'type']);

function details(errors: ErrorObject[] | null | undefined): ValidationDetails {
  return { fields: (errors ?? []).slice(0, 20).map(error => ({
    path: error.keyword === 'required' || error.keyword === 'additionalProperties' ? '/' : error.instancePath || '/',
    rule: validationRules.has(error.keyword as ValidationRule) ? error.keyword as ValidationRule : 'type' as ValidationRule,
  })) };
}
function parse<T>(input: unknown, validate: ReturnType<typeof validator>): T {
  if (validate(input)) return input as T;
  throw new ContractValidationException(details(validate.errors));
}
export function parseDevelopmentLogin(input: unknown): DevelopmentLoginRequest { return parse(input, validateDevelopmentLogin); }
export function parseRefreshSession(input: unknown): RefreshSessionRequest { return parse(input, validateRefresh); }
