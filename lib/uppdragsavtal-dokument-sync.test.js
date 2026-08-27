const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildUppdragsavtalUtanforSyncPatch,
  listExternalUppdragsavtalDocs,
  UTANFOR_FIELD,
  UTFOERD_DATUM_FIELD
} = require('./uppdragsavtal-dokument-sync');

const TODAY = '2026-08-27';

test('listExternalUppdragsavtalDocs ignorerar systemCreated och äldre än 5 år', () => {
  const docs = listExternalUppdragsavtalDocs([
    { filename: 'external.pdf', category: 'uppdragsavtal', createdDate: '2024-12-22' },
    { filename: 'signed.pdf', category: 'uppdragsavtal', createdDate: '2026-01-01', systemCreated: true },
    { filename: 'old.pdf', category: 'uppdragsavtal', createdDate: '2020-01-01' },
    { filename: 'kyc.pdf', category: 'riskbedomning', subcategory: 'kyc', createdDate: '2024-09-20' }
  ], TODAY);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].createdDate, '2024-12-22');
});

test('buildUppdragsavtalUtanforSyncPatch bockar i och sätter datum från dokument', () => {
  const patch = buildUppdragsavtalUtanforSyncPatch({}, [
    { filename: 'avtal.pdf', category: 'uppdragsavtal', createdDate: '2024-12-22' }
  ], { today: TODAY });
  assert.deepEqual(patch, {
    [UTANFOR_FIELD]: true,
    [UTFOERD_DATUM_FIELD]: '2024-12-22'
  });
});

test('buildUppdragsavtalUtanforSyncPatch uppdaterar datum om dokumentdatum ändrats', () => {
  const patch = buildUppdragsavtalUtanforSyncPatch({
    [UTANFOR_FIELD]: true,
    [UTFOERD_DATUM_FIELD]: '2026-08-26'
  }, [
    { filename: 'avtal.pdf', category: 'uppdragsavtal', createdDate: '2024-12-22' }
  ], { today: TODAY });
  assert.deepEqual(patch, { [UTFOERD_DATUM_FIELD]: '2024-12-22' });
});

test('buildUppdragsavtalUtanforSyncPatch hoppar över när ClientFlow-avtal är aktivt', () => {
  const patch = buildUppdragsavtalUtanforSyncPatch({}, [
    { filename: 'avtal.pdf', category: 'uppdragsavtal', createdDate: '2024-12-22' }
  ], {
    today: TODAY,
    avtalFields: { Avtalsstatus: 'Signerat' }
  });
  assert.equal(patch, null);
});

test('buildUppdragsavtalUtanforSyncPatch returnerar null utan giltigt uppdragsavtal', () => {
  assert.equal(buildUppdragsavtalUtanforSyncPatch({}, [], { today: TODAY }), null);
  assert.equal(buildUppdragsavtalUtanforSyncPatch({}, [
    { filename: 'old.pdf', category: 'uppdragsavtal', createdDate: '2018-01-01' }
  ], { today: TODAY }), null);
});
