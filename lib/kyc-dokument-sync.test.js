const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildKycUtanforSyncPatch,
  listAktuellExternalKycDocs,
  UTANFOR_FIELD,
  UTFOERD_DATUM_FIELD
} = require('./kyc-dokument-sync');

test('listAktuellExternalKycDocs ignorerar historik och systemCreated', () => {
  const docs = listAktuellExternalKycDocs([
    { filename: 'external.pdf', category: 'riskbedomning', subcategory: 'kyc', createdDate: '2024-09-20' },
    { filename: 'signed.pdf', category: 'riskbedomning', subcategory: 'kyc', createdDate: '2026-01-01', systemCreated: true },
    { filename: 'old.pdf', category: 'historik_riskbedomning', subcategory: 'kyc', createdDate: '2020-01-01' },
    { filename: 'risk.pdf', category: 'riskbedomning', subcategory: 'kund_riskbedomning', createdDate: '2024-01-01' }
  ]);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].createdDate, '2024-09-20');
});

test('buildKycUtanforSyncPatch bockar i och sätter datum från KYC-dokument', () => {
  const patch = buildKycUtanforSyncPatch({}, [
    { filename: 'kyc.pdf', category: 'riskbedomning', subcategory: 'kyc', createdDate: '2024-09-20' }
  ]);
  assert.deepEqual(patch, {
    [UTANFOR_FIELD]: true,
    [UTFOERD_DATUM_FIELD]: '2024-09-20'
  });
});

test('buildKycUtanforSyncPatch uppdaterar datum om dokumentdatum ändrats', () => {
  const patch = buildKycUtanforSyncPatch({
    [UTANFOR_FIELD]: true,
    [UTFOERD_DATUM_FIELD]: '2026-08-26'
  }, [
    { filename: 'kyc.pdf', category: 'riskbedomning', subcategory: 'kyc', createdDate: '2024-09-20' }
  ]);
  assert.deepEqual(patch, { [UTFOERD_DATUM_FIELD]: '2024-09-20' });
});

test('buildKycUtanforSyncPatch hoppar över när KYC är signerad i ClientFlow', () => {
  const patch = buildKycUtanforSyncPatch({
    'KYC-formular (JSON)': JSON.stringify({ status: 'Signerat', inleedDokumentId: 'abc' })
  }, [
    { filename: 'kyc.pdf', category: 'riskbedomning', subcategory: 'kyc', createdDate: '2024-09-20' }
  ]);
  assert.equal(patch, null);
});

test('buildKycUtanforSyncPatch returnerar null utan aktuellt KYC-dokument', () => {
  assert.equal(buildKycUtanforSyncPatch({}, []), null);
  assert.equal(buildKycUtanforSyncPatch({}, [
    { filename: 'risk.pdf', category: 'riskbedomning', subcategory: 'ovrigt_risk', createdDate: '2024-01-01' }
  ]), null);
});
