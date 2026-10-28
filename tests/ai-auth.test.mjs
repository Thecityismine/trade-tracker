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

test('a guard on another key ignores the gateway key, and the other way round', () => {
  process.env.TRADE_FEED_KEY = 'feed-only-key';
  const feedOpts = { keyEnv: 'TRADE_FEED_KEY' };
  const h = (k) => req({ authorization: `Bearer ${k}`, 'x-forwarded-for': '7.7.7.7' });

  let res = mockRes();
  assert.equal(rejectUnauthorized(h('super-secret-value'), res, '/f', feedOpts), true);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /TRADE_FEED_KEY/);

  res = mockRes();
  assert.equal(rejectUnauthorized(h('feed-only-key'), res, '/f', feedOpts), false);

  res = mockRes();
  assert.equal(rejectUnauthorized(h('feed-only-key'), res, '/t'), true, 'feed key must not open the gateway');
  assert.equal(res.statusCode, 401);
  delete process.env.TRADE_FEED_KEY;
});
