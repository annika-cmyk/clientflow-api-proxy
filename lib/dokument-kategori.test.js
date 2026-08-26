const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDokumentKategorier,
  normalizeDokumentCategory,
  matchDokumentKategori,
  matchDokumentKategoriAtIndex,
  findDokumentKategori,
  sanitizeDisplayName,
  upsertDokumentKategori,
  applyDokumentKategoriMeta,
  toDateOnly,
  isCreatedDateEditable,
  resolveCreatedDate
} = require('./dokument-kategori');

test('parses kategori-JSON and ignores junk', () => {
  assert.deepEqual(parseDokumentKategorier(''), []);
  assert.deepEqual(parseDokumentKategorier('not-json'), []);
  const parsed = parseDokumentKategorier(JSON.stringify([
    { filename: 'avtal.pdf', category: 'uppdragsavtal' },
    null
  ]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].category, 'uppdragsavtal');
});

test('normalizes unknown categories to ovrigt', () => {
  assert.equal(normalizeDokumentCategory('historik'), 'historik');
  assert.equal(normalizeDokumentCategory('historik_riskbedomning'), 'historik_riskbedomning');
  assert.equal(normalizeDokumentCategory('kyc'), 'kyc');
  assert.equal(normalizeDokumentCategory('okand'), 'ovrigt');
  assert.equal(normalizeDokumentCategory(''), 'ovrigt');
});

test('matches category by filename even when index is wrong', () => {
  const kategorier = [
    { filename: 'annan.pdf', category: 'ovrigt' },
    { filename: 'kyc-2024.pdf', category: 'kyc' }
  ];
  const used = new Set();
  const hit = matchDokumentKategori({ filename: 'kyc-2024.pdf' }, kategorier, used);
  assert.equal(hit.meta.category, 'kyc');
  assert.equal(hit.index, 1);
  assert.equal(used.has(1), true);
});

test('does not reuse the same kategori-rad for two files with the same name', () => {
  const kategorier = [
    { filename: 'spec.pdf', category: 'kyc' },
    { filename: 'spec.pdf', category: 'ovrigt' }
  ];
  const used = new Set();
  const first = matchDokumentKategori({ filename: 'spec.pdf' }, kategorier, used);
  const second = matchDokumentKategori({ filename: 'spec.pdf' }, kategorier, used);
  assert.equal(first.meta.category, 'kyc');
  assert.equal(second.meta.category, 'ovrigt');
});

test('falls back to index only when filename match is missing', () => {
  const kategorier = [{ filename: '', category: 'bolagsverket_skatteverket' }];
  const used = new Set();
  const hit = matchDokumentKategoriAtIndex({ filename: 'skatteverket.pdf' }, kategorier, 0, used);
  assert.equal(hit.meta.category, 'bolagsverket_skatteverket');
  assert.equal(matchDokumentKategoriAtIndex({ filename: 'annan.pdf' }, kategorier, 0, used), null);
});

test('sanitizeDisplayName trimmar, tar bort radbrytningar och begränsar längd', () => {
  assert.equal(sanitizeDisplayName('  BeLean AB - Risk.pdf  '), 'BeLean AB - Risk.pdf');
  assert.equal(sanitizeDisplayName('Rad\n1\r\n2'), 'Rad 1 2');
  assert.equal(sanitizeDisplayName('   ', 'fallback.pdf'), 'fallback.pdf');
  assert.equal(sanitizeDisplayName(''), 'Dokument');
  assert.equal(sanitizeDisplayName('x'.repeat(250)).length, 200);
});

test('upsertDokumentKategori uppdaterar befintlig rad och skapar ny vid behov', () => {
  const existing = [{ filename: 'risk.pdf', category: 'historik', attachmentId: 'att1' }];
  const updated = upsertDokumentKategori(existing, { id: 'att1', filename: 'risk.pdf' }, {
    displayName: 'BeLean AB - Riskbedömning',
    category: 'riskbedomning'
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].displayName, 'BeLean AB - Riskbedömning');
  assert.equal(updated[0].category, 'riskbedomning');
  assert.equal(updated[0].attachmentId, 'att1');

  const added = upsertDokumentKategori([], { id: 'att2', filename: 'kyc.pdf' }, {
    displayName: 'KYC 2026',
    category: 'kyc'
  });
  assert.equal(added.length, 1);
  assert.equal(added[0].filename, 'kyc.pdf');
  assert.equal(added[0].category, 'kyc');
});

test('applyDokumentKategoriMeta lägger visningsnamn och kategori ovanpå filen', () => {
  const overlay = applyDokumentKategoriMeta(
    { id: 'att9', filename: 'BeLean AB - Övrigt.pdf' },
    [{ filename: 'BeLean AB - Övrigt.pdf', displayName: 'Övriga underlag', category: 'kyc' }]
  );
  assert.equal(overlay.displayName, 'Övriga underlag');
  assert.equal(overlay.category, 'kyc');
  assert.equal(findDokumentKategori([{ filename: 'saknas.pdf', category: 'ovrigt' }], { filename: 'annan.pdf' }), null);
});

test('createdDate och systemCreated sparas i kategori-metadata', () => {
  const updated = upsertDokumentKategori([], { id: 'att3', filename: 'avtal.pdf' }, {
    category: 'uppdragsavtal',
    createdDate: '2024-03-15',
    systemCreated: true
  });
  assert.equal(updated[0].createdDate, '2024-03-15');
  assert.equal(updated[0].systemCreated, true);
  assert.equal(isCreatedDateEditable({ meta: updated[0] }), false);
  assert.equal(isCreatedDateEditable({ sourceField: 'Dokumentation - historik', typ: 'historik' }), true);
  assert.equal(resolveCreatedDate({ meta: updated[0], attachment: { filename: 'avtal.pdf' } }), '2024-03-15');
});
