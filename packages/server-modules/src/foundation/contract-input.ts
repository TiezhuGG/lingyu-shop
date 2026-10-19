import Ajv, { type AnySchema } from 'ajv';
import { contractOpenApi, type components } from '@lingyu/contracts';
import { ContractValidationException } from './http-boundary';
function references(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(references);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    key === '$ref' && typeof child === 'string' ? child.replace('#/components/schemas/', '#/$defs/') : references(child)]));
}
const ajv = new Ajv({ allErrors: true, strict: true });
const schemas = (contractOpenApi as unknown as { components: { schemas: object } }).components.schemas;
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function parseContractInput<N extends keyof components['schemas']>(name: N, input: unknown): components['schemas'][N] {
  let validate = validators.get(name);
  if (!validate) {
    validate = ajv.compile(references({ $defs: schemas, $ref: '#/$defs/' + name }) as AnySchema);
    validators.set(name, validate);
  }
  if (!validate(input)) throw new ContractValidationException({ fields: [{ path: '/', rule: 'type' }] });
  return input as components['schemas'][N];
}
