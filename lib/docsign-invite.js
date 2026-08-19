'use strict';

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
  return kind === 'kyc' ? 'KYC' : 'uppdragsavtal';
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
  const konsult = String(klientansvarigNamn || 'din redovisningskonsult').trim();
  const byra = String(byraNamn || 'redovisningsbyrån').trim();
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

function buildStaffNotifySubject({ kind, kundnamn } = {}) {
  const kund = String(kundnamn || 'kunden').trim() || 'kunden';
  return kind === 'kyc'
    ? `KYC har skickats för signering – ${kund}`
    : `Uppdragsavtal har skickats för signering – ${kund}`;
}

function buildStaffNotifyText({ kind, byraNamn, klientansvarigNamn, kundnamn, signerNames } = {}) {
  const fornamn = firstNameFromFullName(klientansvarigNamn);
  const greeting = fornamn ? `Hej ${fornamn},` : 'Hej,';
  const kund = String(kundnamn || 'kunden').trim() || 'kunden';
  const title = kind === 'kyc' ? 'KYC' : 'Uppdragsavtal';
  const signers = (Array.isArray(signerNames) ? signerNames : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
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
  return next;
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
  applyDocsignInviteMeta
};
