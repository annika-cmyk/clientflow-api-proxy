/**
 * Gmail OAuth-konfig – saknade env och isOAuthConfigured.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_GMAIL_REDIRECT_URI', 'GOOGLE_REDIRECT_URI'];

function withEnv(overrides, fn) {
  const prev = {};
  for (const k of KEYS) {
    prev[k] = process.env[k];
    if (Object.prototype.hasOwnProperty.call(overrides, k)) {
      if (overrides[k] === undefined) delete process.env[k];
      else process.env[k] = overrides[k];
    }
  }
  try {
    // fresh require so module reads current env via functions (functions read env each call)
    delete require.cache[require.resolve('./oauth')];
    return fn(require('./oauth'));
  } finally {
    for (const k of KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    delete require.cache[require.resolve('./oauth')];
  }
}

test('listMissingOAuthEnv lists all three when empty', () => {
  withEnv({
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    GOOGLE_GMAIL_REDIRECT_URI: '',
    GOOGLE_REDIRECT_URI: ''
  }, (oauth) => {
    assert.deepEqual(oauth.listMissingOAuthEnv(), [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_GMAIL_REDIRECT_URI'
    ]);
    assert.equal(oauth.isOAuthConfigured(), false);
  });
});

test('listMissingOAuthEnv accepts GOOGLE_REDIRECT_URI fallback', () => {
  withEnv({
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_GMAIL_REDIRECT_URI: '',
    GOOGLE_REDIRECT_URI: 'https://www.app.clientflow.se/api/gmail/oauth/callback'
  }, (oauth) => {
    assert.deepEqual(oauth.listMissingOAuthEnv(), []);
    assert.equal(oauth.isOAuthConfigured(), true);
    assert.equal(
      oauth.getOAuthConfig().redirectUri,
      'https://www.app.clientflow.se/api/gmail/oauth/callback'
    );
  });
});

test('listMissingOAuthEnv prefers GOOGLE_GMAIL_REDIRECT_URI', () => {
  withEnv({
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_GMAIL_REDIRECT_URI: 'https://www.app.clientflow.se/api/gmail/oauth/callback',
    GOOGLE_REDIRECT_URI: 'https://example.com/wrong'
  }, (oauth) => {
    assert.equal(
      oauth.getOAuthConfig().redirectUri,
      'https://www.app.clientflow.se/api/gmail/oauth/callback'
    );
  });
});
