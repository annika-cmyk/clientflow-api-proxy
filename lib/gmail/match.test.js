const test = require('node:test');
const assert = require('node:assert/strict');
const {
  THRESHOLDS,
  foldName,
  labelLeafName,
  isUnderKunder,
  scoreNameMatch,
  collectMessageEmails,
  scoreEmailMatch,
  decideMatch,
  matchLabelsToCustomers,
  findKunderLabel
} = require('./match');

test('foldName normaliserar åäö och skiljetecken', () => {
  assert.equal(foldName('Rydén & Co AB'), 'ryden co ab');
});

test('foldName likställer & och och', () => {
  assert.equal(foldName('Rydén & Co AB'), foldName('Rydén och Co AB'));
});

test('labelLeafName tar sista delen', () => {
  assert.equal(labelLeafName('KUNDER/Acme AB'), 'Acme AB');
  assert.equal(labelLeafName('Acme AB'), 'Acme AB');
});

test('isUnderKunder kräver barn under KUNDER (case-insensitive rot)', () => {
  assert.equal(isUnderKunder('KUNDER'), false);
  assert.equal(isUnderKunder('KUNDER/Acme AB'), true);
  assert.equal(isUnderKunder('Kunder/Acme AB'), true);
  assert.equal(isUnderKunder('INBOX'), false);
});

test('scoreNameMatch ger högt betyg vid exakt och utan AB', () => {
  assert.equal(scoreNameMatch('Acme AB', 'Acme AB'), 100);
  assert.ok(scoreNameMatch('Acme', 'Acme AB') >= 90);
  assert.equal(scoreNameMatch('Helt annat', 'Acme AB'), 0);
});

test('scoreNameMatch: True Horses ↔ TRUE HORSES AB (Annika)', () => {
  const score = scoreNameMatch('True Horses', 'TRUE HORSES AB');
  assert.ok(score >= THRESHOLDS.LABEL_STRONG, `förväntade ≥${THRESHOLDS.LABEL_STRONG}, fick ${score}`);
  assert.equal(score, 90);
});

test('scoreNameMatch: Redovisningsbyrån Rydén & Co AB mot vanliga kundnamnsvarianter', () => {
  const label = 'Redovisningsbyrån Rydén & Co AB';
  assert.equal(scoreNameMatch(label, 'Redovisningsbyrån Rydén & Co AB'), 100);
  assert.ok(scoreNameMatch(label, 'Redovisningsbyrån Rydén och Co AB') >= 90);
  assert.ok(scoreNameMatch(label, 'Rydén & Co AB') >= 70, 'kortare kundnamn ska matcha via token-täckning');
  assert.ok(scoreNameMatch(label, 'Redovisningsbyårn Rydén & Co AB') >= 70, 'liten stavfel (byårn) ska matcha');
  assert.ok(scoreNameMatch(label, 'Redovisningsbyrån Rydén') >= 70);
  assert.equal(scoreNameMatch(label, 'Helt Annat Bolag AB'), 0);
});

test('collectMessageEmails plockar From/To/Cc', () => {
  const emails = collectMessageEmails({
    from: 'Anna Rider <Anna@TrueHorses.se>',
    to: 'annika@rydenredovisning.se',
    cc: 'info@truehorses.se, Other <other@x.se>'
  });
  assert.deepEqual(emails, [
    'anna@truehorses.se',
    'annika@rydenredovisning.se',
    'info@truehorses.se',
    'other@x.se'
  ]);
});

test('scoreEmailMatch: exakt case-insensitive mot företag eller kontakt', () => {
  const customer = {
    id: 'c1',
    namn: 'TRUE HORSES AB',
    email: 'info@truehorses.se',
    emails: ['info@truehorses.se', 'anna@truehorses.se']
  };
  assert.equal(scoreEmailMatch(['ANNA@TRUEHORSES.SE'], customer), THRESHOLDS.EMAIL_EXACT);
  assert.equal(scoreEmailMatch(['okand@example.com'], customer), 0);
});

test('decideMatch: stark etikett / enbart e-post / vag+e-post', () => {
  assert.equal(decideMatch(90, 0).reason, 'label');
  assert.equal(decideMatch(0, 100).reason, 'email');
  assert.equal(decideMatch(45, 100).reason, 'label+email');
  assert.equal(decideMatch(45, 0).accepted, false);
  assert.equal(decideMatch(0, 0).accepted, false);
});

test('matchLabelsToCustomers: True Horses etikett → TRUE HORSES AB', () => {
  const labels = [
    { id: 'L0', name: 'KUNDER' },
    { id: 'L1', name: 'KUNDER/True Horses' }
  ];
  const customers = [{ id: 'c1', namn: 'TRUE HORSES AB', emails: [] }];
  const result = matchLabelsToCustomers(labels, customers);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].customerId, 'c1');
  assert.equal(result.matches[0].matchReason, 'label');
  assert.ok(result.matches[0].score >= THRESHOLDS.LABEL_STRONG);
});

test('matchLabelsToCustomers: enbart e-post matchar trots olikt etikettnamn', () => {
  const labels = [{ id: 'L1', name: 'KUNDER/Helt Annat Namn' }];
  const customers = [
    {
      id: 'c1',
      namn: 'TRUE HORSES AB',
      emails: ['info@truehorses.se']
    }
  ];
  const withoutEmail = matchLabelsToCustomers(labels, customers);
  assert.equal(withoutEmail.matches.length, 0);

  const withEmail = matchLabelsToCustomers(labels, customers, {
    messageEmailsByLabelId: {
      L1: ['bokning@other.se', 'INFO@TrueHorses.se']
    }
  });
  assert.equal(withEmail.matches.length, 1);
  assert.equal(withEmail.matches[0].customerId, 'c1');
  assert.equal(withEmail.matches[0].matchReason, 'email');
  assert.equal(withEmail.matches[0].emailScore, 100);
});

test('matchLabelsToCustomers: vag etikett + e-post → label+email', () => {
  const labels = [{ id: 'L1', name: 'KUNDER/True Company' }];
  const customers = [
    { id: 'c1', namn: 'TRUE HORSES AB', emails: ['info@truehorses.se'] },
    { id: 'c2', namn: 'Annat Bolag AB', emails: ['other@x.se'] }
  ];
  assert.equal(scoreNameMatch('True Company', 'TRUE HORSES AB'), 55);
  const nameOnly = matchLabelsToCustomers(labels, customers);
  assert.equal(nameOnly.matches.length, 0, 'vag etikett ensam ska inte räcka');

  const withEmail = matchLabelsToCustomers(labels, customers, {
    messageEmailsByLabelId: { L1: ['info@truehorses.se'] }
  });
  assert.equal(withEmail.matches.length, 1);
  assert.equal(withEmail.matches[0].customerId, 'c1');
  assert.equal(withEmail.matches[0].matchReason, 'label+email');
  assert.equal(withEmail.matches[0].score, 55);
  assert.equal(withEmail.matches[0].emailScore, 100);
});

test('matchLabelsToCustomers kopplar etiketter till kunder', () => {
  const labels = [
    { id: 'L0', name: 'KUNDER' },
    { id: 'L1', name: 'KUNDER/Acme AB' },
    { id: 'L2', name: 'KUNDER/Okänd Firma' },
    { id: 'L3', name: 'Privat' }
  ];
  const customers = [
    { id: 'c1', namn: 'Acme AB' },
    { id: 'c2', namn: 'Beta HB' }
  ];
  const result = matchLabelsToCustomers(labels, customers);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].customerId, 'c1');
  assert.equal(result.matches[0].labelId, 'L1');
  assert.equal(result.unmatchedLabels.length, 1);
  assert.equal(result.unmatchedLabels[0].labelId, 'L2');
});

test('matchLabelsToCustomers: Rydén-etikett mot kortare kundnamn', () => {
  const labels = [
    { id: 'L0', name: 'KUNDER' },
    { id: 'L1', name: 'KUNDER/Redovisningsbyrån Rydén & Co AB' }
  ];
  const customers = [{ id: 'c1', namn: 'Rydén & Co AB' }];
  const result = matchLabelsToCustomers(labels, customers);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].customerId, 'c1');
  assert.equal(result.unmatchedLabels.length, 0);
});

test('matchLabelsToCustomers: Rydén-etikett mot stavfel i kundnamn', () => {
  const labels = [{ id: 'L1', name: 'KUNDER/Redovisningsbyrån Rydén & Co AB' }];
  const customers = [{ id: 'c1', namn: 'Redovisningsbyårn Rydén & Co AB' }];
  const result = matchLabelsToCustomers(labels, customers);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].customerId, 'c1');
});

test('findKunderLabel hittar rotetiketten', () => {
  const labels = [
    { id: 'a', name: 'INBOX' },
    { id: 'b', name: 'KUNDER' }
  ];
  assert.equal(findKunderLabel(labels).id, 'b');
});

test('THRESHOLDS dokumenterar förväntade värden', () => {
  assert.equal(THRESHOLDS.LABEL_STRONG, 70);
  assert.equal(THRESHOLDS.LABEL_WEAK, 40);
  assert.equal(THRESHOLDS.EMAIL_EXACT, 100);
});
