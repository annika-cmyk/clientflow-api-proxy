const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('loadTokenState', () => {
  let store;
  let axiosGet;
  const prevSecret = process.env.GMAIL_TOKEN_SECRET;

  beforeEach(() => {
    process.env.GMAIL_TOKEN_SECRET = 'test-secret-token-state';
    process.env.AIRTABLE_ACCESS_TOKEN = 'pat-test';
    process.env.AIRTABLE_BASE_ID = 'appTest';
    delete require.cache[require.resolve('./crypto')];
    delete require.cache[require.resolve('./store')];
    store = require('./store');
    const axios = require('axios');
    axiosGet = mock.method(axios, 'get', async () => ({ data: { fields: {} } }));
  });

  afterEach(() => {
    if (prevSecret == null) delete process.env.GMAIL_TOKEN_SECRET;
    else process.env.GMAIL_TOKEN_SECRET = prevSecret;
    mock.restoreAll();
    delete require.cache[require.resolve('./crypto')];
    delete require.cache[require.resolve('./store')];
  });

  it('returnerar missing när fältet är tomt', async () => {
    const state = await store.loadTokenState('recUser');
    assert.equal(state.reason, 'missing');
    assert.equal(state.tokens, null);
    assert.equal(axiosGet.mock.callCount(), 1);
  });

  it('returnerar ok med tokens när blob dekrypteras', async () => {
    const { encryptJson } = require('./crypto');
    const blob = encryptJson({
      refreshToken: 'rt-1',
      accessToken: 'at-1',
      email: 'a@b.se'
    });
    axiosGet.mock.mockImplementation(async () => ({
      data: { fields: { 'Gmail OAuth': blob } }
    }));
    const state = await store.loadTokenState('recUser');
    assert.equal(state.reason, 'ok');
    assert.equal(state.tokens.refreshToken, 'rt-1');
    assert.equal(state.tokens.email, 'a@b.se');
  });

  it('returnerar decrypt_failed vid fel nyckel', async () => {
    process.env.GMAIL_TOKEN_SECRET = 'other-secret';
    delete require.cache[require.resolve('./crypto')];
    const { encryptJson } = require('./crypto');
    const blob = encryptJson({ refreshToken: 'rt-1' });

    process.env.GMAIL_TOKEN_SECRET = 'test-secret-token-state';
    delete require.cache[require.resolve('./crypto')];
    delete require.cache[require.resolve('./store')];
    store = require('./store');
    const axios = require('axios');
    axiosGet = mock.method(axios, 'get', async () => ({
      data: { fields: { 'Gmail OAuth': blob } }
    }));

    const state = await store.loadTokenState('recUser');
    assert.equal(state.reason, 'decrypt_failed');
    assert.equal(state.tokens, null);
  });
});
