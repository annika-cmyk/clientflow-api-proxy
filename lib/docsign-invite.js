'use strict';

const crypto = require('crypto');

function normalizePersonName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function namesEqual(a, b) {
  const left = normalizePersonName(a);
  const right = normalizePersonName(b);
  return !!left && !!right && left === right;
}

function personNameFromAirtable(value) {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) {
    return value.map(personNameFromAirtable).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return String(value.name || value.fullName || value.Name || value.email || '').trim();
  }
  return String(value).trim();
}

function findUserByName(users, name) {
  const wanted = personNameFromAirtable(name);
  if (!wanted || !Array.isArray(users)) return null;
  const byId = users.find((u) => u && u.id && String(u.id) === wanted);
  if (byId) return byId;
  const norm = normalizePersonName(wanted);
  return users.find((u) => {
    const candidates = [u && u.name, u && u.fullName, u && u.email, u && u.id]
      .map((v) => normalizePersonName(v))
      .filter(Boolean);
    return candidates.includes(norm);
  }) || null;
}

function extractLinkedRecordId(value) {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return extractLinkedRecordId(value[0]);
  if (typeof value === 'object') return String(value.id || '').trim();
  return String(value).trim();
}

function resolveKlientansvarigSender({
  klientansvarigName,
  users,
  fallbackUser,
  byraNamn,
  requireFound = false
} = {}) {
  const wantedName = personNameFromAirtable(klientansvarigName);
  const named = findUserByName(users, wantedName);
  const name = String(wantedName || (named && named.name) || '').trim();
  const fallbackIsSamePerson = !requireFound && (
    namesEqual(fallbackUser && fallbackUser.name, name)
    || namesEqual(fallbackUser && fallbackUser.email, name)
    || namesEqual(fallbackUser && fallbackUser.email, named && named.email)
  );
  const email = String(
    (named && named.email)
    || (fallbackIsSamePerson && fallbackUser && fallbackUser.email)
    || ''
  ).trim();
  const resolvedByra = String(byraNamn || (named && named.byra) || (fallbackUser && fallbackUser.byra) || '').trim();
  const found = !!(named && named.email);
  if (requireFound) {
    return {
      name: name || String((named && named.name) || '').trim(),
      email: found ? email : '',
      byraNamn: resolvedByra,
      id: (named && named.id) || '',
      found,
      usedFallback: false,
      missing: found ? null : (name ? 'email' : 'name')
    };
  }
  const usedFallback = !found && !!(fallbackUser && fallbackUser.email);
  return {
    name: name || String((fallbackUser && fallbackUser.name) || '').trim(),
    email: email || String((fallbackUser && fallbackUser.email) || '').trim(),
    byraNamn: resolvedByra,
    id: (named && named.id) || (fallbackUser && fallbackUser.id) || '',
    found,
    usedFallback,
    missing: null
  };
}

function firstNameFromFullName(value) {
  const full = personNameFromAirtable(value);
  if (!full) return '';
  const first = full.split(/\s+/)[0];
  return first || '';
}

function senderDisplayName({ klientansvarigNamn, byraNamn } = {}) {
  const person = String(klientansvarigNamn || '').trim();
  const byra = String(byraNamn || '').trim();
  if (person && byra) return `${person} på ${byra}`;
  return byra || person || 'Byrån';
}

function documentLabel(kind) {
  if (kind === 'kyc') return 'KYC';
  if (kind === 'dokumentation') return 'byråns allmänna riskbedömning och rutiner';
  return 'uppdragsavtal';
}

function buildInviteComment({
  kind,
  byraNamn,
  klientansvarigNamn,
  konsultEmail,
  mottagareNamn,
  kundnamn
} = {}) {
  const fornamn = firstNameFromFullName(mottagareNamn) || firstNameFromFullName(kundnamn);
  const greeting = fornamn ? `Hej ${fornamn}` : 'Hej';
  const byra = String(byraNamn || 'redovisningsbyrån').trim();
  if (kind === 'dokumentation') {
    return [
      `${greeting},`,
      '',
      `Detta är en inbjudan att signera och godkänna den allmänna riskbedömningen och rutinerna för ${byra}.`,
      '',
      'När du har signerat räknas dokumentet som godkänt på signeringsdatumet.'
    ].join('\n');
  }
  const konsult = String(klientansvarigNamn || 'din redovisningskonsult').trim();
  const doc = documentLabel(kind);
  const email = String(konsultEmail || '').trim();
  const contact = email
    ? `Vid frågor kontakta din redovisningskonsult på ${email}.`
    : 'Vid frågor kontakta din redovisningskonsult.';
  return [
    `${greeting},`,
    '',
    `Detta är en inbjudan från din redovisningskonsult ${konsult} på ${byra} att signera ${doc}.`,
    '',
    contact
  ].join('\n');
}

function buildStaffNotifySubject({ kind, kundnamn, byraNamn } = {}) {
  if (kind === 'dokumentation') {
    return `Riskbedömning och rutiner har skickats för signering – ${String(byraNamn || 'byrån').trim() || 'byrån'}`;
  }
  const kund = String(kundnamn || 'kunden').trim() || 'kunden';
  return kind === 'kyc'
    ? `KYC har skickats för signering – ${kund}`
    : `Uppdragsavtal har skickats för signering – ${kund}`;
}

function buildStaffNotifyText({ kind, byraNamn, klientansvarigNamn, kundnamn, signerNames } = {}) {
  const fornamn = firstNameFromFullName(klientansvarigNamn);
  const greeting = fornamn ? `Hej ${fornamn},` : 'Hej,';
  const signers = (Array.isArray(signerNames) ? signerNames : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  if (kind === 'dokumentation') {
    const lines = [
      greeting,
      '',
      `Den allmänna riskbedömningen och rutinerna för ${byraNamn || 'byrån'} har skickats för BankID-signering.`
    ];
    if (signers.length) lines.push(`Det har skickats till ${signers.join(', ')}.`);
    lines.push('', 'Med vänliga hälsningar,', byraNamn || 'Byrån');
    return lines.join('\n');
  }
  const kund = String(kundnamn || 'kunden').trim() || 'kunden';
  const title = kind === 'kyc' ? 'KYC' : 'Uppdragsavtal';
  const lines = [
    greeting,
    '',
    `${title} för ${kund} har skickats för BankID-signering.`
  ];
  if (signers.length) lines.push(`Det har skickats till ${signers.join(', ')}.`);
  if (kind === 'uppdragsavtal') {
    lines.push(`Du ska också signera uppdragsavtalet för ${byraNamn || 'byrån'}.`);
  }
  lines.push('', 'Med vänliga hälsningar,', byraNamn || 'Byrån');
  return lines.join('\n');
}

function applyDocsignInviteMeta(payload, meta) {
  const next = { ...(payload || {}) };
  const comment = buildInviteComment(meta || {});
  next.comment = comment;
  // Inleeds mall skriver "Inbjudan kommer från {avsändare}".
  // Skicka byråns namn så det inte blir det tekniska kontonamnet ClientFlow.
  const fromName = String((meta && meta.byraNamn) || '').trim();
  if (fromName) {
    next.from_name = fromName;
  }
  // Alla byråer delar samma Inleed-konto. send_receipt går till kontoägaren
  // (t.ex. info@inleed.se), inte till avsändande byrå. Vi skickar kvittot själva.
  next.send_receipt = false;
  const callbackUrl = String((meta && meta.callbackUrl) || '').trim();
  if (callbackUrl) {
    next.callback_url = callbackUrl;
  }
  return next;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function uniqueEmails(values) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const raw = String(value || '').trim();
    const key = normalizeEmail(raw);
    if (!isValidEmail(raw) || seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

function receiptRecipients({ agencyEmail, signerEmails, partyEmails } = {}) {
  return uniqueEmails([
    agencyEmail,
    ...(Array.isArray(signerEmails) ? signerEmails : []),
    ...(Array.isArray(partyEmails) ? partyEmails : [])
  ]);
}

function normalizeSigners(signers) {
  return (Array.isArray(signers) ? signers : [])
    .map((s) => ({
      namn: String((s && (s.namn || s.name)) || '').trim(),
      epost: String((s && (s.epost || s.email)) || '').trim()
    }))
    .filter((s) => isValidEmail(s.epost));
}

function buildReceiptMeta({
  agencyEmail,
  agencyName,
  byraNamn,
  signers,
  kundnamn,
  kind
} = {}) {
  return {
    agencyEmail: String(agencyEmail || '').trim(),
    agencyName: String(agencyName || '').trim(),
    byraNamn: String(byraNamn || '').trim(),
    signers: normalizeSigners(signers),
    kundnamn: String(kundnamn || '').trim(),
    kind: String(kind || '').trim(),
    sentAt: ''
  };
}

function parseReceiptMeta(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function shouldSendReceipt(meta) {
  if (!meta || typeof meta !== 'object') return true;
  return !String(meta.sentAt || '').trim();
}

function markReceiptSent(meta, sentAt) {
  return { ...(meta || {}), sentAt: String(sentAt || new Date().toISOString()) };
}

function partyEmailsFromDoc(doc) {
  const parties = Array.isArray(doc && doc.parties) ? doc.parties : [];
  return uniqueEmails(parties.map((p) => p && (p.email || p.epost)));
}

function buildSignedReceiptSubject({ kind, kundnamn, byraNamn } = {}) {
  if (kind === 'dokumentation') {
    return `Riskbedömning och rutiner har signerats – ${String(byraNamn || 'byrån').trim() || 'byrån'}`;
  }
  const kund = String(kundnamn || 'kunden').trim() || 'kunden';
  return kind === 'kyc'
    ? `KYC har signerats – ${kund}`
    : `Uppdragsavtal har signerats – ${kund}`;
}

function buildSignedReceiptText({
  kind,
  toName,
  kundnamn,
  byraNamn,
  signerNames,
  hasAttachment = true
} = {}) {
  const fornamn = firstNameFromFullName(toName);
  const greeting = fornamn ? `Hej ${fornamn},` : 'Hej,';
  const signers = (Array.isArray(signerNames) ? signerNames : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  const attachmentLine = hasAttachment
    ? 'Det signerade dokumentet finns som bilaga.'
    : 'Det signerade dokumentet finns i ClientFlow.';
  if (kind === 'dokumentation') {
    const lines = [
      greeting,
      '',
      `Den allmänna riskbedömningen och rutinerna för ${byraNamn || 'byrån'} har signerats av alla undertecknare.`
    ];
    if (signers.length) lines.push(`Signerat av ${signers.join(', ')}.`);
    lines.push('', attachmentLine, '', 'Med vänliga hälsningar,', byraNamn || 'Byrån');
    return lines.join('\n');
  }
  const kund = String(kundnamn || 'kunden').trim() || 'kunden';
  const title = kind === 'kyc' ? 'KYC' : 'Uppdragsavtalet';
  const lines = [
    greeting,
    '',
    `${title} för ${kund} har signerats av alla undertecknare.`
  ];
  if (signers.length) lines.push(`Signerat av ${signers.join(', ')}.`);
  lines.push('', attachmentLine, '', 'Med vänliga hälsningar,', byraNamn || 'Byrån');
  return lines.join('\n');
}

function buildCallbackToken({ kind, recordId, secret } = {}) {
  const key = String(secret || '').trim();
  const payload = `${String(kind || '').trim()}:${String(recordId || '').trim()}`;
  if (!key || !recordId || !kind) return '';
  return crypto.createHmac('sha256', key).update(payload).digest('hex').slice(0, 32);
}

function verifyCallbackToken({ kind, recordId, token, secret } = {}) {
  const expected = buildCallbackToken({ kind, recordId, secret });
  const given = String(token || '').trim();
  if (!expected || !given || expected.length !== given.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  } catch (_) {
    return false;
  }
}

function publicAppBaseUrl(baseUrl) {
  return String(baseUrl || process.env.PUBLIC_BASE_URL || 'https://www.app.clientflow.se')
    .trim()
    .replace(/\/$/, '');
}

function buildCallbackUrl({ kind, recordId, secret, baseUrl } = {}) {
  const token = buildCallbackToken({ kind, recordId, secret });
  if (!token) return '';
  const q = new URLSearchParams({
    kind: String(kind || ''),
    record: String(recordId || ''),
    t: token
  });
  return `${publicAppBaseUrl(baseUrl)}/api/inleed/callback?${q.toString()}`;
}

function callbackSecret() {
  return String(process.env.DOCSIGN_CALLBACK_SECRET || process.env.DOCSIGN_API_KEY || '').trim();
}

module.exports = {
  namesEqual,
  normalizePersonName,
  personNameFromAirtable,
  findUserByName,
  extractLinkedRecordId,
  resolveKlientansvarigSender,
  firstNameFromFullName,
  senderDisplayName,
  buildInviteComment,
  buildStaffNotifySubject,
  buildStaffNotifyText,
  applyDocsignInviteMeta,
  normalizeEmail,
  isValidEmail,
  uniqueEmails,
  receiptRecipients,
  normalizeSigners,
  buildReceiptMeta,
  parseReceiptMeta,
  shouldSendReceipt,
  markReceiptSent,
  partyEmailsFromDoc,
  buildSignedReceiptSubject,
  buildSignedReceiptText,
  buildCallbackToken,
  verifyCallbackToken,
  buildCallbackUrl,
  callbackSecret,
  publicAppBaseUrl
};
