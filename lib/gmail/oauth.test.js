/**
 * Gmail OAuth-konfig – saknade env, alias och isOAuthConfigured.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_GMAIL_REDIRECT_URI',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_GMAIL_CLIENT_ID',
  'GOOGLE_GMAIL_CLIENT_SECRET',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REDIRECT_URI'
];

function withEnv(overrides, fn) {
  const prev = {};
  for (const k of KEYS) {
    prev[k] = process.env[k];
    if (Object.prototype.hasOwnProperty.call(overrides, k)) {
      if (overrides[k] === undefined) delete process.env[k];
      else process.env[k] = overrides[k];
    } else {
      delete process.env[k];
    }
  }
  try {
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
  withEnv({}, (oauth) => {
    assert.deepEqual(oauth.listMissingOAuthEnv(), [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_GMAIL_REDIRECT_URI'
    ]);
    assert.equal(oauth.isOAuthConfigured(), false);
    assert.deepEqual(oauth.getOAuthEnvPresence().present, {
      GOOGLE_CLIENT_ID: false,
      GOOGLE_CLIENT_SECRET: false,
      GOOGLE_GMAIL_REDIRECT_URI: false
    });
  });
});

test('listMissingOAuthEnv accepts GOOGLE_REDIRECT_URI fallback', () => {
  withEnv({
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REDIRECT_URI: 'https://www.app.clientflow.se/api/gmail/oauth/callback'
  }, (oauth) => {
    assert.deepEqual(oauth.listMissingOAuthEnv(), []);
    assert.equal(oauth.isOAuthConfigured(), true);
    assert.equal(
      oauth.getOAuthConfig().redirectUri,
      'https://www.app.clientflow.se/api/gmail/oauth/callback'
    );
    assert.equal(oauth.getOAuthConfig().resolvedFrom.redirectUri, 'GOOGLE_REDIRECT_URI');
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
    assert.equal(oauth.getOAuthConfig().resolvedFrom.redirectUri, 'GOOGLE_GMAIL_REDIRECT_URI');
  });
});

test('accepts GOOGLE_GMAIL_CLIENT_ID / SECRET aliases', () => {
  withEnv({
    GOOGLE_GMAIL_CLIENT_ID: 'gmail-id',
    GOOGLE_GMAIL_CLIENT_SECRET: 'gmail-secret',
    GOOGLE_GMAIL_REDIRECT_URI: 'https://www.app.clientflow.se/api/gmail/oauth/callback'
  }, (oauth) => {
    assert.equal(oauth.isOAuthConfigured(), true);
    const cfg = oauth.getOAuthConfig();
    assert.equal(cfg.clientId, 'gmail-id');
    assert.equal(cfg.clientSecret, 'gmail-secret');
    assert.equal(cfg.resolvedFrom.clientId, 'GOOGLE_GMAIL_CLIENT_ID');
    assert.equal(cfg.resolvedFrom.clientSecret, 'GOOGLE_GMAIL_CLIENT_SECRET');
    assert.deepEqual(oauth.getOAuthEnvPresence().present, {
      GOOGLE_CLIENT_ID: true,
      GOOGLE_CLIENT_SECRET: true,
      GOOGLE_GMAIL_REDIRECT_URI: true
    });
  });
});

test('accepts GOOGLE_OAUTH_* and GMAIL_* aliases', () => {
  withEnv({
    GOOGLE_OAUTH_CLIENT_ID: 'oauth-id',
    GMAIL_CLIENT_SECRET: 'gmail-sec',
    GMAIL_REDIRECT_URI: 'https://www.app.clientflow.se/api/gmail/oauth/callback'
  }, (oauth) => {
    assert.equal(oauth.isOAuthConfigured(), true);
    const from = oauth.getOAuthConfig().resolvedFrom;
    assert.equal(from.clientId, 'GOOGLE_OAUTH_CLIENT_ID');
    assert.equal(from.clientSecret, 'GMAIL_CLIENT_SECRET');
    assert.equal(from.redirectUri, 'GMAIL_REDIRECT_URI');
  });
});

test('canonical names win over aliases', () => {
  withEnv({
    GOOGLE_CLIENT_ID: 'canonical-id',
    GOOGLE_GMAIL_CLIENT_ID: 'alias-id',
    GOOGLE_CLIENT_SECRET: 'canonical-secret',
    GOOGLE_GMAIL_CLIENT_SECRET: 'alias-secret',
    GOOGLE_GMAIL_REDIRECT_URI: 'https://www.app.clientflow.se/api/gmail/oauth/callback'
  }, (oauth) => {
    const cfg = oauth.getOAuthConfig();
    assert.equal(cfg.clientId, 'canonical-id');
    assert.equal(cfg.clientSecret, 'canonical-secret');
    assert.equal(cfg.resolvedFrom.clientId, 'GOOGLE_CLIENT_ID');
    assert.equal(cfg.resolvedFrom.clientSecret, 'GOOGLE_CLIENT_SECRET');
  });
});

test('whitespace-only values count as missing', () => {
  withEnv({
    GOOGLE_CLIENT_ID: '  ',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_GMAIL_REDIRECT_URI: 'https://www.app.clientflow.se/api/gmail/oauth/callback'
  }, (oauth) => {
    assert.deepEqual(oauth.listMissingOAuthEnv(), ['GOOGLE_CLIENT_ID']);
    assert.equal(oauth.isOAuthConfigured(), false);
    assert.equal(oauth.getOAuthEnvPresence().present.GOOGLE_CLIENT_ID, false);
    assert.equal(oauth.getOAuthEnvPresence().present.GOOGLE_CLIENT_SECRET, true);
    assert.equal(oauth.getOAuthEnvPresence().lengths.GOOGLE_CLIENT_ID, 0);
    assert.equal(oauth.getOAuthEnvPresence().lengths.GOOGLE_CLIENT_SECRET, 6);
  });
});

test('strips wrapping quotes from env values', () => {
  withEnv({
    GOOGLE_CLIENT_ID: '"quoted-id"',
    GOOGLE_CLIENT_SECRET: "'quoted-secret'",
    GOOGLE_GMAIL_REDIRECT_URI: '"https://www.app.clientflow.se/api/gmail/oauth/callback"'
  }, (oauth) => {
    const cfg = oauth.getOAuthConfig();
    assert.equal(cfg.clientId, 'quoted-id');
    assert.equal(cfg.clientSecret, 'quoted-secret');
    assert.equal(
      cfg.redirectUri,
      'https://www.app.clientflow.se/api/gmail/oauth/callback'
    );
    assert.equal(oauth.isOAuthConfigured(), true);
    assert.equal(oauth.getOAuthEnvPresence().lengths.GOOGLE_CLIENT_ID, 'quoted-id'.length);
  });
});

test('envLengths reports 0 when key missing', () => {
  withEnv({
    GOOGLE_CLIENT_ID: 'id-only'
  }, (oauth) => {
    const { lengths, present } = oauth.getOAuthEnvPresence();
    assert.equal(lengths.GOOGLE_CLIENT_ID, 7);
    assert.equal(lengths.GOOGLE_CLIENT_SECRET, 0);
    assert.equal(lengths.GOOGLE_GMAIL_REDIRECT_URI, 0);
    assert.equal(present.GOOGLE_CLIENT_ID, true);
    assert.equal(present.GOOGLE_CLIENT_SECRET, false);
  });
});
