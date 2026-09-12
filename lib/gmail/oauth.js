/**
 * Google OAuth för Gmail (användarens egen inkorg).
 */
const crypto = require('crypto');
const axios = require('axios');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.modify',
  'openid',
  'email',
  'profile'
].join(' ');

/** Env-namn som måste finnas för Gmail OAuth (synkade med docs/GMAIL_SETUP.md). */
const OAUTH_ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_GMAIL_REDIRECT_URI'
];

function getOAuthConfig() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = String(
    process.env.GOOGLE_GMAIL_REDIRECT_URI ||
      process.env.GOOGLE_REDIRECT_URI ||
      ''
  ).trim();
  return { clientId, clientSecret, redirectUri };
}

/** Returnerar vilka av GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI som saknas. */
function listMissingOAuthEnv() {
  const cfg = getOAuthConfig();
  const missing = [];
  if (!cfg.clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!cfg.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!cfg.redirectUri) missing.push('GOOGLE_GMAIL_REDIRECT_URI');
  return missing;
}

function isOAuthConfigured() {
  return listMissingOAuthEnv().length === 0;
}

function buildAuthUrl(state) {
  const { clientId, redirectUri } = getOAuthConfig();
  if (!clientId || !redirectUri) {
    throw new Error('Google OAuth är inte konfigurerad');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: String(state || '')
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth är inte konfigurerad');
  }
  const body = new URLSearchParams({
    code: String(code || ''),
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });
  const res = await axios.post('https://oauth2.googleapis.com/token', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000
  });
  return res.data;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth är inte konfigurerad');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: String(refreshToken || ''),
    grant_type: 'refresh_token'
  });
  const res = await axios.post('https://oauth2.googleapis.com/token', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000
  });
  return res.data;
}

async function revokeToken(token) {
  if (!token) return;
  try {
    await axios.post(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      null,
      { timeout: 10000 }
    );
  } catch (_) {
    /* ignore revoke errors */
  }
}

function createSignedState(payload, secret) {
  const body = Buffer.from(JSON.stringify({
    ...payload,
    nonce: crypto.randomBytes(8).toString('hex'),
    exp: Date.now() + 15 * 60 * 1000
  }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedState(state, secret) {
  const raw = String(state || '');
  const [body, sig] = raw.split('.');
  if (!body || !sig) throw new Error('Ogiltig OAuth-state');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Ogiltig OAuth-signatur');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error('OAuth-state har gått ut');
  }
  return payload;
}

module.exports = {
  SCOPES,
  OAUTH_ENV_KEYS,
  getOAuthConfig,
  listMissingOAuthEnv,
  isOAuthConfigured,
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  createSignedState,
  verifySignedState
};
