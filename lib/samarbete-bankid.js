/**
 * BankID-session för Samarbete (verifierat kundsvar).
 *
 * Mode:
 *  - mock (default utan provider): simulerar BankID så flödet går att testa
 *  - disabled: BankID-frågor kan inte låsas upp
 *
 * Session = HMAC-signerad token (cookie / Authorization header).
 * Senare: byt mock mot GrandID/Criipto i startBankId / pollBankId.
 */
const crypto = require('crypto');

const COOKIE_NAME = 'cf_samarbete_bankid';
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

function mode() {
  const raw = String(process.env.SAMARBETE_BANKID_MODE || '').trim().toLowerCase();
  if (raw === 'disabled' || raw === 'off') return 'disabled';
  if (raw === 'mock' || raw === 'demo') return 'mock';
  // Utan konfigurerad provider: mock så produkten går att använda/testa
  if (process.env.GRANDID_API_KEY || process.env.CRIIPTO_DOMAIN) return 'provider';
  return 'mock';
}

function secret() {
  return String(
    process.env.SAMARBETE_BANKID_SECRET ||
      process.env.GMAIL_TOKEN_SECRET ||
      process.env.JWT_SECRET ||
      'clientflow-samarbete-bankid'
  ).trim();
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64');
}

function signSession(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

function verifySession(token) {
  const raw = String(token || '').trim();
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  if (!payload.samarbeteToken) return null;
  return payload;
}

function createSession({ samarbeteToken, name, personalNumber }) {
  return signSession({
    samarbeteToken: String(samarbeteToken),
    name: String(name || '').trim(),
    personalNumber: String(personalNumber || '').trim(),
    exp: Date.now() + SESSION_TTL_MS,
    iat: Date.now()
  });
}

/** In-memory mock orders (process-local). */
const mockOrders = new Map();

function startBankId({ samarbeteToken, endUserIp }) {
  const m = mode();
  if (m === 'disabled') {
    const err = new Error('BankID är inte aktiverat. Kontakta byrån.');
    err.code = 'BANKID_DISABLED';
    throw err;
  }
  if (m === 'provider') {
    const err = new Error('BankID-provider är konfigurerad men inte inkopplad ännu. Använd mock tills vidare.');
    err.code = 'BANKID_PROVIDER_PENDING';
    throw err;
  }
  const orderRef = `mock_${crypto.randomBytes(12).toString('hex')}`;
  mockOrders.set(orderRef, {
    samarbeteToken: String(samarbeteToken),
    createdAt: Date.now(),
    endUserIp: endUserIp || '',
    status: 'pending',
    completeAt: Date.now() + 2500
  });
  return {
    mode: 'mock',
    orderRef,
    autoStartToken: null,
    qrStartToken: null,
    message: 'Öppna BankID-appen och legitimera dig. (Demoläge – slutförs automatiskt.)'
  };
}

function pollBankId(orderRef) {
  const m = mode();
  if (m === 'disabled') {
    return { status: 'failed', message: 'BankID är inte aktiverat' };
  }
  const order = mockOrders.get(String(orderRef || ''));
  if (!order) return { status: 'failed', message: 'Okänd BankID-order' };
  if (order.status === 'complete') {
    return {
      status: 'complete',
      name: order.name,
      personalNumber: order.personalNumber
    };
  }
  if (Date.now() >= order.completeAt) {
    order.status = 'complete';
    order.name = 'Test Testsson';
    order.personalNumber = '198001011234';
    mockOrders.set(orderRef, order);
    const sessionToken = createSession({
      samarbeteToken: order.samarbeteToken,
      name: order.name,
      personalNumber: order.personalNumber
    });
    return {
      status: 'complete',
      name: order.name,
      personalNumber: order.personalNumber,
      sessionToken
    };
  }
  return {
    status: 'pending',
    message: 'Väntar på BankID…'
  };
}

function readSessionFromRequest(req) {
  const header = req.get && req.get('x-samarbete-bankid');
  if (header) return verifySession(header);
  const auth = req.get && req.get('authorization');
  if (auth && /^Bearer\s+/i.test(auth)) {
    return verifySession(auth.replace(/^Bearer\s+/i, '').trim());
  }
  const cookieHeader = (req.headers && req.headers.cookie) || '';
  const match = String(cookieHeader).match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (match) {
    try {
      return verifySession(decodeURIComponent(match[1]));
    } catch (_) {
      return null;
    }
  }
  if (req.body && req.body.bankIdSession) return verifySession(req.body.bankIdSession);
  if (req.query && req.query.bankIdSession) return verifySession(req.query.bankIdSession);
  return null;
}

function sessionMatchesToken(session, samarbeteToken) {
  if (!session || !samarbeteToken) return false;
  return String(session.samarbeteToken) === String(samarbeteToken);
}

function setSessionCookie(res, sessionToken) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`
  );
}

module.exports = {
  COOKIE_NAME,
  mode,
  createSession,
  verifySession,
  startBankId,
  pollBankId,
  readSessionFromRequest,
  sessionMatchesToken,
  setSessionCookie
};
