import assert from 'node:assert/strict';
import test from 'node:test';
import { rejectUnauthorized } from '../api/_ai/auth.js';

const mockRes = () => ({
  statusCode: null, body: null, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(p) { this.body = p; return this; },
  end() { return this; }
});
const req = (headers = {}, method = 'GET') => ({ method, headers: { host: 'x', ...headers } });

test('missing key is rejected', () => {
  process.env.AI_GATEWAY_KEY = 'super-secret-value';
  const res = mockRes();
  assert.equal(rejectUnauthorized(req(), res, '/t'), true);
  assert.equal(res.statusCode, 401);
});

test('wrong key is rejected, including a length-mismatched one', () => {
  for (const bad of ['nope', 'super-secret-valuX', 'super-secret-value-longer']) {
    const res = mockRes();
    assert.equal(rejectUnauthorized(req({ authorization: `Bearer ${bad}` }), res, '/t'), true, bad);
    assert.equal(res.statusCode, 401);
  }
});

test('correct key passes', () => {
  const res = mockRes();
  assert.equal(rejectUnauthorized(req({ authorization: 'Bearer super-secret-value' }), res, '/t'), false);
});

test('unset server key fails closed with 500, not open', () => {
  delete process.env.AI_GATEWAY_KEY;
  const res = mockRes();
  assert.equal(rejectUnauthorized(req({ authorization: 'Bearer anything' }), res, '/t'), true);
  assert.equal(res.statusCode, 500);
  process.env.AI_GATEWAY_KEY = 'super-secret-value';
});

test('CORS preflight is answered without a key', () => {
  const res = mockRes();
  assert.equal(rejectUnauthorized(req({}, 'OPTIONS'), res, '/t'), true);
  assert.equal(res.statusCode, 204);
});

test('rate limit trips after sustained calls', () => {
  const headers = { authorization: 'Bearer super-secret-value', 'x-forwarded-for': '9.9.9.9' };
  let limited = 0;
  for (let i = 0; i < 200; i += 1) {
    const res = mockRes();
    if (rejectUnauthorized(req(headers), res, '/t') && res.statusCode === 429) limited += 1;
  }
  assert.ok(limited > 0, 'expected some requests to be rate limited');
  assert.equal(limited, 80, '120 allowed out of 200');
});

test('responses are never cached', () => {
  const res = mockRes();
  rejectUnauthorized(req({ authorization: 'Bearer super-secret-value', 'x-forwarded-for': '1.1.1.1' }), res, '/t');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
