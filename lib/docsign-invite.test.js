const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  findUserByName,
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

  it('bygger informativ inbjudan med byrå och klientansvarig', () => {
    const kyc = buildInviteComment({
      kind: 'kyc',
      byraNamn: 'Redovisningsbyrån Ryden & Co AB',
      klientansvarigNamn: 'Annika Rydén',
      kundnamn: 'MV-BYGG'
    });
    assert.match(kyc, /Annika Rydén på Redovisningsbyrån Ryden & Co AB/);
    assert.match(kyc, /kundkännedomsformulär/);
    assert.match(kyc, /MV-BYGG/);

    const avtal = buildInviteComment({
      kind: 'uppdragsavtal',
      byraNamn: 'Redovisningsbyrån Ryden & Co AB',
      klientansvarigNamn: 'Annika Rydén',
      kundnamn: 'MV-BYGG'
    });
    assert.match(avtal, /uppdragsavtal/);
    assert.match(avtal, /Annika Rydén/);
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
      kundnamn: 'MV-BYGG'
    });
    assert.equal(payload.name, 'Uppdragsavtal - MV-BYGG');
    assert.match(payload.comment, /Annika Rydén på Ryden/);
  });

  it('skriver intern notis till klientansvarig', () => {
    assert.match(buildStaffNotifySubject({ kind: 'kyc', kundnamn: 'MV-BYGG' }), /KYC.*MV-BYGG/);
    const text = buildStaffNotifyText({
      kind: 'uppdragsavtal',
      byraNamn: 'Ryden',
      klientansvarigNamn: 'Annika Rydén',
      kundnamn: 'MV-BYGG',
      signerNames: ['Maria Kund']
    });
    assert.match(text, /klientansvarig/);
    assert.match(text, /Maria Kund/);
    assert.match(text, /Annika Rydén på Ryden/);
  });
});
