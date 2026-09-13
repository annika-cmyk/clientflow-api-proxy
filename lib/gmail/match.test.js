const test = require('node:test');
const assert = require('node:assert/strict');
const {
  foldName,
  labelLeafName,
  isUnderKunder,
  scoreNameMatch,
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

test('scoreNameMatch: Redovisningsbyrån Rydén & Co AB mot vanliga kundnamnsvarianter', () => {
  const label = 'Redovisningsbyrån Rydén & Co AB';
  assert.equal(scoreNameMatch(label, 'Redovisningsbyrån Rydén & Co AB'), 100);
  assert.ok(scoreNameMatch(label, 'Redovisningsbyrån Rydén och Co AB') >= 90);
  assert.ok(scoreNameMatch(label, 'Rydén & Co AB') >= 70, 'kortare kundnamn ska matcha via token-täckning');
  assert.ok(scoreNameMatch(label, 'Redovisningsbyårn Rydén & Co AB') >= 70, 'liten stavfel (byårn) ska matcha');
  assert.ok(scoreNameMatch(label, 'Redovisningsbyrån Rydén') >= 70);
  assert.equal(scoreNameMatch(label, 'Helt Annat Bolag AB'), 0);
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
