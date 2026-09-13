const test = require('node:test');
const assert = require('assert/strict');
const {
  classifyLabel,
  resolveMessageLabels,
  listKunderChildLabels,
  planKunderLabelSwitch,
  normalizeKunderLabelName,
  findLabelByName,
  sanitizeModifyIds,
  isSystemLabelId
} = require('./labels-edit');

const LABELS = [
  { id: 'INBOX', name: 'INBOX', type: 'system' },
  { id: 'SENT', name: 'SENT', type: 'system' },
  { id: 'L0', name: 'KUNDER', type: 'user' },
  { id: 'L1', name: 'KUNDER/Linda Fiore AB', type: 'user' },
  { id: 'L2', name: 'KUNDER/Betongkoll', type: 'user' },
  { id: 'L3', name: 'Privat', type: 'user' }
];

test('classifyLabel skiljer system, rot och KUNDER-barn', () => {
  assert.equal(classifyLabel(LABELS[0]).isSystem, true);
  assert.equal(classifyLabel(LABELS[0]).displayName, 'Inkorg');
  assert.equal(classifyLabel(LABELS[2]).isKunderRoot, true);
  assert.equal(classifyLabel(LABELS[3]).isKunderChild, true);
  assert.equal(classifyLabel(LABELS[3]).leaf, 'Linda Fiore AB');
  assert.equal(classifyLabel(LABELS[5]).isKunder, false);
});

test('resolveMessageLabels sorterar KUNDER-barn först', () => {
  const resolved = resolveMessageLabels(
    ['INBOX', 'L3', 'L1', 'L0'],
    LABELS
  );
  assert.equal(resolved[0].id, 'L1');
  assert.equal(resolved[1].id, 'L0');
  assert.equal(resolved[2].id, 'L3');
  assert.equal(resolved[3].id, 'INBOX');
});

test('listKunderChildLabels returnerar bara barn', () => {
  const kids = listKunderChildLabels(LABELS);
  assert.deepEqual(
    kids.map((k) => k.leaf).sort(),
    ['Betongkoll', 'Linda Fiore AB']
  );
});

test('planKunderLabelSwitch byter barn och behåller övrigt', () => {
  const plan = planKunderLabelSwitch({
    currentLabelIds: ['INBOX', 'L1', 'L3'],
    allLabels: LABELS,
    setLabelId: 'L2'
  });
  assert.deepEqual(plan.addLabelIds, ['L2']);
  assert.deepEqual(plan.removeLabelIds, ['L1']);
});

test('planKunderLabelSwitch no-op om redan satt', () => {
  const plan = planKunderLabelSwitch({
    currentLabelIds: ['INBOX', 'L2'],
    allLabels: LABELS,
    setLabelId: 'L2'
  });
  assert.deepEqual(plan.addLabelIds, []);
  assert.deepEqual(plan.removeLabelIds, []);
});

test('planKunderLabelSwitch avvisar icke-KUNDER', () => {
  assert.throws(
    () =>
      planKunderLabelSwitch({
        currentLabelIds: ['INBOX'],
        allLabels: LABELS,
        setLabelId: 'L3'
      }),
    (err) => err.code === 'NOT_KUNDER_CHILD'
  );
});

test('normalizeKunderLabelName prefixar rot', () => {
  assert.equal(normalizeKunderLabelName('Acme AB'), 'KUNDER/Acme AB');
  assert.equal(normalizeKunderLabelName('KUNDER/Acme AB'), 'KUNDER/Acme AB');
  assert.equal(normalizeKunderLabelName(''), null);
});

test('findLabelByName är case-insensitive via fold', () => {
  const hit = findLabelByName(LABELS, 'kunder/linda fiore ab');
  assert.equal(hit.id, 'L1');
});

test('sanitizeModifyIds filtrerar systemetiketter', () => {
  const got = sanitizeModifyIds(['INBOX', 'L1'], ['SENT', 'L2']);
  assert.deepEqual(got.addLabelIds, ['L1']);
  assert.deepEqual(got.removeLabelIds, ['L2']);
  assert.equal(isSystemLabelId('TRASH'), true);
});
