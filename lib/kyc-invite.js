/**
 * KYC-invite: HMAC-signerad länk så kunden kan fylla i KYC-formuläret.
 * Efter ifyllnad genereras PDF och skickas till Inleed (BankID) med sparade signerare.
 */

const crypto = require('crypto');

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Status när invite skickats och byrån väntar på kundens ifyllnad. */
const STATUS_FILL_PENDING = 'Skickat för ifyllnad';
/** Status när kunden skickat in svar (innan/under Inleed-utskick). */
const STATUS_ANSWERED = 'Besvarat av kund';
/** Status när PDF skickats till Inleed för BankID (befintlig). */
const STATUS_SENT_SIGN = 'Skickat till kund';
const STATUS_SIGNED = 'Signerat';
const STATUS_SAVED = 'Sparat';

const INVITE_FIELDS = [
  'inviteToken',
  'inviteExpiresAt',
  'inviteSentAt',
  'pendingSignerare',
  'customerAnsweredAt',
  'answeredByCustomer'
];

function trimStr(v) {
  return String(v == null ? '' : v).trim();
}

function inviteSecret() {
  return String(
    process.env.KYC_INVITE_SECRET
      || process.env.KUNDFORMULAR_INVITE_SECRET
      || process.env.JWT_SECRET
      || process.env.GMAIL_TOKEN_SECRET
      || 'clientflow-kyc-invite'
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

function publicAppBaseUrl(baseUrl) {
  return String(baseUrl || process.env.PUBLIC_BASE_URL || 'https://www.app.clientflow.se')
    .trim()
    .replace(/\/$/, '');
}

function createInviteToken(customerId, { expiresAtMs, ttlMs = INVITE_TTL_MS } = {}) {
  const cid = trimStr(customerId);
  if (!cid) return null;
  const exp = Number.isFinite(Number(expiresAtMs))
    ? Number(expiresAtMs)
    : (Date.now() + (Number(ttlMs) > 0 ? Number(ttlMs) : INVITE_TTL_MS));
  const payload = {
    c: cid,
    e: exp,
    k: 'kyc',
    n: crypto.randomBytes(8).toString('hex')
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', inviteSecret()).update(body).digest());
  return {
    token: `${body}.${sig}`,
    expiresAt: new Date(exp).toISOString(),
    expiresAtMs: exp,
    customerId: cid
  };
}

function verifyInviteToken(token) {
  const raw = trimStr(token);
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', inviteSecret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || !payload.c || !payload.e) return null;
  if (payload.k && payload.k !== 'kyc') return null;
  if (Date.now() > Number(payload.e)) {
    const err = new Error('Länken har gått ut. Be byrån skicka en ny.');
    err.code = 'INVITE_EXPIRED';
    throw err;
  }
  return {
    customerId: String(payload.c),
    expiresAtMs: Number(payload.e),
    nonce: payload.n ? String(payload.n) : ''
  };
}

function buildInviteUrl(token, baseUrl) {
  const t = trimStr(token);
  if (!t) return '';
  return `${publicAppBaseUrl(baseUrl)}/kyc-svar.html?token=${encodeURIComponent(t)}`;
}

function normalizeSignerare(list) {
  return (Array.isArray(list) ? list : [])
    .map((s) => ({
      namn: trimStr(s?.namn),
      epost: trimStr(s?.epost),
      personnr: trimStr(s?.personnr),
      telefon: trimStr(s?.telefon)
    }))
    .filter((s) => s.namn && s.epost);
}

function inviteIsActive(kyc, token) {
  if (!kyc || typeof kyc !== 'object') return false;
  if (!kyc.inviteToken || !token) return false;
  if (trimStr(kyc.inviteToken) !== trimStr(token)) return false;
  if (kyc.inviteExpiresAt) {
    const exp = Date.parse(kyc.inviteExpiresAt);
    if (Number.isFinite(exp) && Date.now() > exp) return false;
  }
  const status = trimStr(kyc.status);
  if (status === STATUS_ANSWERED || status === STATUS_SENT_SIGN || status === STATUS_SIGNED) {
    return false;
  }
  if (String(kyc.inleedDokumentId || '').trim()) return false;
  if (kyc.customerAnsweredAt) return false;
  return status === STATUS_FILL_PENDING || status === STATUS_SAVED || !status;
}

function applyInviteSent(kyc, {
  customerId,
  signerare,
  ttlMs = INVITE_TTL_MS,
  now = new Date()
} = {}) {
  const base = kyc && typeof kyc === 'object' ? { ...kyc } : {};
  const invite = createInviteToken(customerId, { ttlMs });
  if (!invite) {
    const err = new Error('Kunde inte skapa invite-token (saknar kund-id).');
    err.code = 'INVITE_CREATE_FAILED';
    throw err;
  }
  const pending = normalizeSignerare(signerare);
  if (!pending.length) {
    const err = new Error('Välj minst en signerare med namn och e-post (används när kunden svarat).');
    err.code = 'SIGNERARE_REQUIRED';
    throw err;
  }
  base.inviteToken = invite.token;
  base.inviteExpiresAt = invite.expiresAt;
  base.inviteSentAt = now.toISOString();
  base.pendingSignerare = pending;
  base.status = STATUS_FILL_PENDING;
  base.customerAnsweredAt = null;
  base.answeredByCustomer = false;
  return {
    kyc: base,
    invite,
    inviteUrl: buildInviteUrl(invite.token)
  };
}

/**
 * Whitelist av kundredigerbara KYC-fält (samma som _collectKYCFormularData).
 */
function normalizeCustomerAnswers(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const person = (p) => ({
    namn: trimStr(p?.namn),
    personnr: trimStr(p?.personnr),
    skatterattslig_hemvist: trimStr(p?.skatterattslig_hemvist || p?.hemvist) || 'Sverige',
    hemvist: trimStr(p?.hemvist || p?.skatterattslig_hemvist) || 'Sverige',
    tin: trimStr(p?.tin)
  });
  const persons = (list) => (Array.isArray(list) ? list : []).map(person)
    .filter((p) => p.namn || p.personnr || p.tin);
  const janej = (v) => {
    const s = trimStr(v);
    if (s === 'Ja' || s === 'Nej') return s;
    return '';
  };
  const foretradare = persons(src.foretradare);
  const huvudman = persons(src.huvudman);
  return {
    foretagsnamn: trimStr(src.foretagsnamn),
    orgnr: trimStr(src.orgnr),
    bolagsform: trimStr(src.bolagsform),
    skatterattslig_hemvist_foretag: trimStr(src.skatterattslig_hemvist_foretag) || 'Sverige',
    tin_foretag: trimStr(src.tin_foretag),
    foretradare,
    foretradareNamn: foretradare[0]?.namn || '',
    foretradarePnr: foretradare[0]?.personnr || '',
    skatterattslig_hemvist_foretradare: foretradare[0]?.skatterattslig_hemvist || 'Sverige',
    tin_foretradare: foretradare[0]?.tin || '',
    huvudman,
    huvudmanInfo: trimStr(src.huvudmanInfo) || huvudman
      .map((p) => (p.personnr ? `${p.namn} (${p.personnr})` : p.namn))
      .filter(Boolean)
      .join('\n'),
    huvudmanAnnatSatt: trimStr(src.huvudmanAnnatSatt),
    vh_agarandel: (() => {
      if (src.vh_agarandel === null || src.vh_agarandel === undefined || src.vh_agarandel === '') return null;
      const n = Number(src.vh_agarandel);
      return Number.isFinite(n) ? n : null;
    })(),
    vh_noterat_bolag: src.vh_noterat_bolag === true || src.vh_noterat_bolag === 'true' || src.vh_noterat_bolag === 'Ja',
    vh_utlandska_agare: src.vh_utlandska_agare === true || src.vh_utlandska_agare === 'true' || src.vh_utlandska_agare === 'Ja',
    pep: janej(src.pep),
    pepDetaljer: trimStr(src.pepDetaljer),
    pepFamilj: janej(src.pepFamilj),
    pepFamiljDetaljer: trimStr(src.pepFamiljDetaljer),
    verksamhet: trimStr(src.verksamhet),
    kostnader: trimStr(src.kostnader),
    intakterna: trimStr(src.intakterna),
    syfte_affarsrelation: trimStr(src.syfte_affarsrelation),
    tjanster: trimStr(src.tjanster),
    kapitalUrsprung: trimStr(src.kapitalUrsprung),
    anstallda: trimStr(src.anstallda),
    omsattning: trimStr(src.omsattning),
    internationellHandel: janej(src.internationellHandel),
    internationellaLander: trimStr(src.internationellaLander),
    kontanter: janej(src.kontanter),
    kontanterAndel: trimStr(src.kontanterAndel),
    kryptovaluta: janej(src.kryptovaluta),
    bekraftelse: src.bekraftelse === true || src.bekraftelse === 'true' || src.bekraftelse === 'Ja'
  };
}

function applyCustomerAnswers(kyc, answers, { now = new Date(), markAnswered = false } = {}) {
  const base = kyc && typeof kyc === 'object' ? { ...kyc } : {};
  const normalized = normalizeCustomerAnswers(answers);
  Object.assign(base, normalized);
  base.updatedAt = now.toISOString();
  base.updatedBy = 'kund';
  if (markAnswered) {
    base.status = STATUS_ANSWERED;
    base.customerAnsweredAt = now.toISOString();
    base.answeredByCustomer = true;
  } else if (trimStr(base.status) !== STATUS_FILL_PENDING) {
    base.status = STATUS_FILL_PENDING;
  }
  return base;
}

function preserveInviteFields(existing, next) {
  const out = { ...next };
  for (const field of INVITE_FIELDS) {
    const prev = existing?.[field];
    if (prev != null && prev !== '' && (out[field] == null || out[field] === '')) {
      out[field] = prev;
    }
  }
  return out;
}

function redactInviteForAgency(kyc) {
  if (!kyc || typeof kyc !== 'object') return kyc;
  const out = { ...kyc };
  if (out.inviteToken) out.inviteToken = '[redacted]';
  return out;
}

function publicKycPayload(kyc, { companyName, byraName, bolagsform } = {}) {
  const answers = normalizeCustomerAnswers(kyc || {});
  const status = trimStr(kyc?.status);
  const answered = status === STATUS_ANSWERED || status === STATUS_SENT_SIGN || status === STATUS_SIGNED
    || !!kyc?.customerAnsweredAt;
  return {
    success: true,
    companyName: companyName || answers.foretagsnamn || '',
    byraName: byraName || '',
    bolagsform: bolagsform || answers.bolagsform || '',
    status,
    answered,
    readOnly: answered,
    answers
  };
}

function agencyInviteSummary(kyc, { baseUrl } = {}) {
  const active = !!(kyc?.inviteToken
    && trimStr(kyc.status) === STATUS_FILL_PENDING
    && !kyc.customerAnsweredAt
    && !String(kyc.inleedDokumentId || '').trim());
  const inviteUrl = active ? buildInviteUrl(kyc.inviteToken, baseUrl) : '';
  return {
    inviteActive: active && !!inviteUrl,
    inviteUrl,
    inviteExpiresAt: kyc?.inviteExpiresAt || null,
    inviteSentAt: kyc?.inviteSentAt || null,
    pendingSignerareCount: Array.isArray(kyc?.pendingSignerare) ? kyc.pendingSignerare.length : 0
  };
}

module.exports = {
  INVITE_TTL_MS,
  STATUS_FILL_PENDING,
  STATUS_ANSWERED,
  STATUS_SENT_SIGN,
  STATUS_SIGNED,
  STATUS_SAVED,
  INVITE_FIELDS,
  createInviteToken,
  verifyInviteToken,
  buildInviteUrl,
  inviteIsActive,
  normalizeSignerare,
  normalizeCustomerAnswers,
  applyInviteSent,
  applyCustomerAnswers,
  preserveInviteFields,
  redactInviteForAgency,
  publicKycPayload,
  agencyInviteSummary,
  publicAppBaseUrl
};
