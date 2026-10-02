import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOrganizationId, requireOrganizationId } from './organizationId.js';
test('unresolved IDs cannot target a customer', () => {
 for (const value of [null, undefined, '', '1abc', '1.5', true, {}, [], 0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(parseOrganizationId(value), null);
  assert.throws(() => requireOrganizationId(value));
 }
});
test('legitimate organization one and other customer IDs are preserved', () => {
 for (const value of [1, '1', 2, ' 42 ']) assert.equal(requireOrganizationId(value), Number(value));
});
