const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDokumentKategorier,
  normalizeDokumentCategory,
  matchDokumentKategori,
  matchDokumentKategoriAtIndex
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
