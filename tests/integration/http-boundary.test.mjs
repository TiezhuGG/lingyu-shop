import test from 'node:test';
import assert from 'node:assert/strict';
import foundation from '../../packages/server-modules/dist/index.js';

const { ContractValidationException, HttpBoundaryFilter, parseContractProbe } = foundation;

test('contract probe schema accepts integer strings and rejects unknown fields without echoing input', () => {
  assert.deepEqual(parseContractProbe({ amountMinor: '1250', deliveryMode: 'pickup' }), { amountMinor: '1250', deliveryMode: 'pickup' });
  assert.throws(() => parseContractProbe({ amountMinor: 1250, deliveryMode: 'pickup', internalOnly: 'must-not-echo' }), error => {
    assert(error instanceof ContractValidationException);
    assert.deepEqual(error.details.fields, [
      { path: '/', rule: 'additionalProperties' },
      { path: '/amountMinor', rule: 'type' },
    ]);
    assert(!JSON.stringify(error.details).includes('must-not-echo'));
    return true;
  });
});

test('HTTP boundary exposes only stable data for unexpected errors', () => {
  const result = { headers: new Map(), statusCode: undefined, body: undefined };
  const response = {
    setHeader(name, value) { result.headers.set(name, value); },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; },
  };
  const host = {
    switchToHttp() {
      return {
        getRequest: () => ({ headers: {}, requestId: 'boundary-12345678' }),
        getResponse: () => response,
      };
    },
  };
  const originalError = console.error;
  const logs = [];
  console.error = (...parts) => logs.push(parts.join(' '));
  try {
    new HttpBoundaryFilter().catch(new Error('postgres://user:secret@host/database stack'), host);
  } finally {
    console.error = originalError;
  }
  assert.equal(result.statusCode, 500);
  assert.equal(result.headers.get('x-request-id'), 'boundary-12345678');
  assert.deepEqual(result.body, {
    code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId: 'boundary-12345678',
  });
  assert(!JSON.stringify(result.body).match(/postgres|secret|stack/i));
  assert.deepEqual(logs, ['API_UNHANDLED_ERROR requestId=boundary-12345678']);
});
