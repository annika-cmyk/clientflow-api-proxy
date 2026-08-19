'use strict';

function namesEqual(a, b) {
  const left = String(a || '').trim().toLowerCase();
  const right = String(b || '').trim().toLowerCase();
  return !!left && !!right && left === right;
}

function findUserByName(users, name) {
  const wanted = String(name || '').trim();
  if (!wanted || !Array.isArray(users)) return null;
  const lower = wanted.toLowerCase();
  return users.find((u) => {
    const candidates = [u && u.name, u && u.fullName, u && u.email]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    return candidates.includes(lower);
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
  byraNamn
} = {}) {
  const named = findUserByName(users, klientansvarigName);
  const name = String(klientansvarigName || (named && named.name) || (fallbackUser && fallbackUser.name) || '').trim();
  const fallbackIsSamePerson = namesEqual(fallbackUser && fallbackUser.name, name)
    || namesEqual(fallbackUser && fallbackUser.email, name)
    || namesEqual(fallbackUser && fallbackUser.email, named && named.email);
  const email = String(
    (named && named.email)
    || (fallbackIsSamePerson && fallbackUser && fallbackUser.email)
    || ''
  ).trim();
  const resolvedByra = String(byraNamn || (named && named.byra) || (fallbackUser && fallbackUser.byra) || '').trim();
  const usedFallback = !email && !!(fallbackUser && fallbackUser.email);
  return {
    name: name || String((fallbackUser && fallbackUser.name) || '').trim(),
    email: email || String((fallbackUser && fallbackUser.email) || '').trim(),
    byraNamn: resolvedByra,
    found: !!(named && named.email),
    usedFallback
  };
}

function senderDisplayName({ klientansvarigNamn, byraNamn } = {}) {
  const person = String(klientansvarigNamn || '').trim();
  const byra = String(byraNamn || '').trim();
  if (person && byra) return `${person} på ${byra}`;
  return byra || person || 'Byrån';
}

function buildInviteComment({ kind, byraNamn, klientansvarigNamn, kundnamn } = {}) {
  const sender = senderDisplayName({ klientansvarigNamn, byraNamn });
  const kund = String(kundnamn || 'ert företag').trim() || 'ert företag';
  const contact = klientansvarigNamn
    ? `${klientansvarigNamn}${byraNamn ? ` på ${byraNamn}` : ''}`
    : (byraNamn || 'byrån');
  if (kind === 'kyc') {
    return [
      `${sender} har skickat ett kundkännedomsformulär (KYC) för ${kund}.`,
      'Vi ber er gå igenom uppgifterna och signera med BankID. Formuläret behövs enligt penningtvättslagen innan uppdraget kan utföras.',
      `Vid frågor, kontakta ${contact}.`
    ].join(' ');
  }
  return [
    `${sender} har skickat ett uppdragsavtal för ${kund}.`,
    `Avtalet beskriver uppdraget mellan er och ${byraNamn || 'byrån'}. Vi ber er läsa igenom det och signera med BankID.`,
    `Vid frågor, kontakta ${contact}.`
  ].join(' ');
}

function buildStaffNotifySubject({ kind, kundnamn } = {}) {
  const kund = String(kundnamn || 'kunden').trim() || 'kunden';
  return kind === 'kyc'
    ? `KYC har skickats för signering – ${kund}`
    : `Uppdragsavtal har skickats för signering – ${kund}`;
}

function buildStaffNotifyText({ kind, byraNamn, klientansvarigNamn, kundnamn, signerNames } = {}) {
  const sender = senderDisplayName({ klientansvarigNamn, byraNamn });
  const kund = String(kundnamn || 'kunden').trim() || 'kunden';
  const signers = (Array.isArray(signerNames) ? signerNames : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  const signerLine = signers.length
    ? `Det har skickats till: ${signers.join(', ')}.`
    : 'Det har skickats till kundens undertecknare.';
  if (kind === 'kyc') {
    return [
      `Hej ${klientansvarigNamn || ''},`.replace(/Hej ,/, 'Hej,'),
      '',
      `Ett kundkännedomsformulär (KYC) för ${kund} har skickats för BankID-signering.`,
      signerLine,
      `Utskicket går från ${sender}.`,
      '',
      'Du får det här mejlet eftersom du är klientansvarig för kunden.',
      '',
      `Med vänliga hälsningar,`,
      byraNamn || 'Byrån'
    ].join('\n');
  }
  return [
    `Hej ${klientansvarigNamn || ''},`.replace(/Hej ,/, 'Hej,'),
    '',
    `Ett uppdragsavtal för ${kund} har skickats för BankID-signering.`,
    signerLine,
    `Du är klientansvarig och ska också signera avtalet för ${byraNamn || 'byrån'}.`,
    `Utskicket går från ${sender}.`,
    '',
    `Med vänliga hälsningar,`,
    byraNamn || 'Byrån'
  ].join('\n');
}

function applyDocsignInviteMeta(payload, meta) {
  const next = { ...(payload || {}) };
  const comment = buildInviteComment(meta || {});
  next.comment = comment;
  return next;
}

module.exports = {
  namesEqual,
  findUserByName,
  extractLinkedRecordId,
  resolveKlientansvarigSender,
  senderDisplayName,
  buildInviteComment,
  buildStaffNotifySubject,
  buildStaffNotifyText,
  applyDocsignInviteMeta
};
