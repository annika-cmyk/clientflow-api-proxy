const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  findUserByName,
  personNameFromAirtable,
  extractLinkedRecordId,
  resolveKlientansvarigSender,
  senderDisplayName,
  buildInviteComment,
  buildStaffNotifySubject,
  buildStaffNotifyText,
  applyDocsignInviteMeta
} = require('./docsign-invite');

describe('docsign-invite', () => {
  const users = [
    { id: 'rec1', name: 'Annika Rydén', email: 'annika@ryden.se', byra: 'Redovisningsbyrån Ryden & Co AB' },
    { id: 'rec2', name: 'Lisa Bok', email: 'lisa@ryden.se', byra: 'Redovisningsbyrån Ryden & Co AB' }
  ];

  it('hittar klientansvarig på namn', () => {
    const hit = findUserByName(users, 'Annika Rydén');
    assert.equal(hit.email, 'annika@ryden.se');
    assert.equal(findUserByName(users, 'okänd'), null);
  });

  it('läser kund-id från länkfält', () => {
    assert.equal(extractLinkedRecordId(['recABC1234567890']), 'recABC1234567890');
    assert.equal(extractLinkedRecordId({ id: 'recXYZ1234567890' }), 'recXYZ1234567890');
    assert.equal(extractLinkedRecordId('recSolo1234567890'), 'recSolo1234567890');
  });

  it('använder klientansvarig som avsändare när e-post finns', () => {
    const sender = resolveKlientansvarigSender({
      klientansvarigName: 'Annika Rydén',
      users,
      fallbackUser: { name: 'Lisa Bok', email: 'lisa@ryden.se', byra: 'Redovisningsbyrån Ryden & Co AB' },
      byraNamn: 'Redovisningsbyrån Ryden & Co AB'
    });
    assert.equal(sender.name, 'Annika Rydén');
    assert.equal(sender.email, 'annika@ryden.se');
    assert.equal(sender.found, true);
    assert.equal(sender.usedFallback, false);
    assert.equal(sender.byraNamn, 'Redovisningsbyrån Ryden & Co AB');
  });

  it('läser namn från Airtable-länk och matchar utan diakrit', () => {
    assert.equal(personNameFromAirtable({ name: 'Annika Rydén' }), 'Annika Rydén');
    assert.equal(findUserByName(users, 'Annika Ryden').email, 'annika@ryden.se');
  });

  it('kräver klientansvarig med e-post när avtalet ska signeras', () => {
    const missing = resolveKlientansvarigSender({
      klientansvarigName: '',
      users,
      fallbackUser: { name: 'Lisa Bok', email: 'lisa@ryden.se' },
      requireFound: true
    });
    assert.equal(missing.found, false);
    assert.equal(missing.email, '');
    assert.equal(missing.missing, 'name');

    const noMail = resolveKlientansvarigSender({
      klientansvarigName: 'Okänd Person',
      users,
      fallbackUser: { name: 'Lisa Bok', email: 'lisa@ryden.se' },
      requireFound: true
    });
    assert.equal(noMail.found, false);
    assert.equal(noMail.email, '');
    assert.equal(noMail.missing, 'email');
  });

  it('faller tillbaka på inloggad användare om klientansvarig saknar e-post', () => {
    const sender = resolveKlientansvarigSender({
      klientansvarigName: 'Okänd Person',
      users,
      fallbackUser: { name: 'Lisa Bok', email: 'lisa@ryden.se', byra: 'Ryden' },
      byraNamn: 'Ryden'
    });
    assert.equal(sender.email, 'lisa@ryden.se');
    assert.equal(sender.usedFallback, true);
    assert.equal(sender.name, 'Okänd Person');
  });

  it('bygger en kort inbjudan med förnamn, konsult och mejladress', () => {
    const kyc = buildInviteComment({
      kind: 'kyc',
      byraNamn: 'Redovisningsbyrån Ryden & Co AB',
      klientansvarigNamn: 'Annika Rydén',
      konsultEmail: 'annika@ryden.se',
      mottagareNamn: 'Maria Svensson',
      kundnamn: 'MV-BYGG'
    });
    assert.match(kyc, /^Hej Maria,/);
    assert.match(kyc, /din redovisningskonsult Annika Rydén på Redovisningsbyrån Ryden & Co AB att signera KYC/);
    assert.match(kyc, /uppdatera dessa dokument med jämna mellanrum/);
    assert.match(kyc, /kontakta din redovisningskonsult på annika@ryden\.se/);
    assert.equal((kyc.match(/Annika Rydén/g) || []).length, 1);
    assert.equal((kyc.match(/Redovisningsbyrån Ryden & Co AB/g) || []).length, 1);

    const avtal = buildInviteComment({
      kind: 'uppdragsavtal',
      byraNamn: 'Redovisningsbyrån Ryden & Co AB',
      klientansvarigNamn: 'Annika Rydén',
      konsultEmail: 'annika@ryden.se',
      mottagareNamn: 'Maria Svensson'
    });
    assert.match(avtal, /att signera uppdragsavtal/);
    assert.doesNotMatch(avtal, /KYC/);
    assert.equal(
      senderDisplayName({ klientansvarigNamn: 'Annika Rydén', byraNamn: 'Ryden' }),
      'Annika Rydén på Ryden'
    );
  });

  it('lägger kommentaren på Docsign-payloaden', () => {
    const payload = applyDocsignInviteMeta({ name: 'Uppdragsavtal - MV-BYGG' }, {
      kind: 'uppdragsavtal',
      byraNamn: 'Ryden',
      klientansvarigNamn: 'Annika Rydén',
      konsultEmail: 'annika@ryden.se',
      mottagareNamn: 'Maria Svensson'
    });
    assert.equal(payload.name, 'Uppdragsavtal - MV-BYGG');
    assert.match(payload.comment, /Hej Maria,/);
    assert.match(payload.comment, /annika@ryden\.se/);
    assert.doesNotMatch(payload.comment, /ClientFlow/);
    assert.equal(payload.from_name, 'Ryden');
  });

  it('skriver intern notis till klientansvarig utan upprepning', () => {
    assert.match(buildStaffNotifySubject({ kind: 'kyc', kundnamn: 'MV-BYGG' }), /KYC.*MV-BYGG/);
    const text = buildStaffNotifyText({
      kind: 'uppdragsavtal',
      byraNamn: 'Ryden',
      klientansvarigNamn: 'Annika Rydén',
      kundnamn: 'MV-BYGG',
      signerNames: ['Maria Kund']
    });
    assert.match(text, /^Hej Annika,/);
    assert.match(text, /Maria Kund/);
    assert.equal((text.match(/Annika/g) || []).length, 1);
  });
});
