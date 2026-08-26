const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  archivePriorOnNew,
  applyAgeBasedArchive,
  buildPersonScreeningKey,
  inferSubcategoryFromAttachment,
  shouldArchiveByAge,
  syncRiskMetadata
} = require('./dokument-risk-subkategori');

test('infers subcategory from filename and type', () => {
  assert.equal(inferSubcategoryFromAttachment({ filename: 'kund-KYC-signerat-2024-01-01.pdf' }, {}), 'kyc');
  assert.equal(inferSubcategoryFromAttachment({ filename: 'riskbedomning-kyc.pdf', _typ: 'riskbedomning' }, {}), 'kund_riskbedomning');
  assert.equal(inferSubcategoryFromAttachment({ filename: 'pep-screening_anna_2024-01-01.pdf', _typ: 'pep' }, {}), 'pep_sanktion');
  assert.equal(inferSubcategoryFromAttachment({ filename: 'notering.pdf' }, { category: 'riskbedomning' }), 'ovrigt_risk');
});

test('archives prior aktuell docs when new doc of same subcategory is saved', () => {
  const before = [
    { filename: 'old-kyc.pdf', category: 'riskbedomning', subcategory: 'kyc', createdDate: '2024-01-01' },
    { filename: 'new-kyc.pdf', category: 'riskbedomning', subcategory: 'kyc', createdDate: '2025-01-01' }
  ];
  const after = archivePriorOnNew(before, {
    subcategory: 'kyc',
    keepFilename: 'new-kyc.pdf'
  });
  assert.equal(after[0].category, 'historik_riskbedomning');
  assert.equal(after[1].category, 'riskbedomning');
});

test('archives prior PEP screening only for same screening key', () => {
  const key = buildPersonScreeningKey('Anna Andersson', '198001011234');
  const before = [
    { filename: 'pep1.pdf', category: 'riskbedomning', subcategory: 'pep_sanktion', screeningKey: key },
    { filename: 'pep2.pdf', category: 'riskbedomning', subcategory: 'pep_sanktion', screeningKey: 'person:other:123' }
  ];
  const after = archivePriorOnNew(before, {
    subcategory: 'pep_sanktion',
    screeningKey: key,
    keepFilename: 'pep-new.pdf'
  });
  assert.equal(after[0].category, 'historik_riskbedomning');
  assert.equal(after[1].category, 'riskbedomning');
});

test('archives by age according to subcategory rules', () => {
  assert.equal(shouldArchiveByAge('kyc', '2018-01-01', '2026-01-01'), true);
  assert.equal(shouldArchiveByAge('kyc', '2020-01-01', '2026-01-01'), false);
  assert.equal(shouldArchiveByAge('kund_riskbedomning', '2024-01-01', '2026-01-01'), true);
  assert.equal(shouldArchiveByAge('kund_riskbedomning', '2025-06-01', '2026-01-01'), false);
});

test('syncRiskMetadata assigns subcategory and archives old aktuell docs', () => {
  const kategorier = [
    { filename: 'risk.pdf', category: 'riskbedomning', subcategory: 'kund_riskbedomning', createdDate: '2020-01-01' }
  ];
  const attachments = [
    { filename: 'risk.pdf', _typ: 'riskbedomning' }
  ];
  const { nextKategorier, changed } = syncRiskMetadata(kategorier, attachments, '2026-01-01');
  assert.equal(changed, true);
  assert.equal(nextKategorier[0].category, 'historik_riskbedomning');
  assert.equal(nextKategorier[0].subcategory, 'kund_riskbedomning');
});

test('applyAgeBasedArchive moves expired aktuell entries to historik', () => {
  const list = [
    { filename: 'pep.pdf', category: 'riskbedomning', subcategory: 'pep_sanktion', createdDate: '2024-01-01' }
  ];
  const after = applyAgeBasedArchive(list, '2026-02-01');
  assert.equal(after[0].category, 'historik_riskbedomning');
});
