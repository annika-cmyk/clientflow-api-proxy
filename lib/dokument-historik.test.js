const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DOKUMENTATION_HISTORIK_FIELD,
  collectHistorikAttachments,
  pickHistorikFieldName,
  toHistorikDocumentItems
} = require('./dokument-historik');

describe('dokument-historik', () => {
  it('plockar filer från Dokumentation - historik', () => {
    const items = collectHistorikAttachments({
      Attachments: [{ filename: 'risk.pdf', url: 'https://example.com/risk.pdf' }],
      'Dokumentation - historik': [
        { id: 'attHist1', filename: 'export-2026-08-19.pdf', url: 'https://example.com/hist.pdf' }
      ]
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].fieldName, DOKUMENTATION_HISTORIK_FIELD);
    assert.equal(items[0].attachment.filename, 'export-2026-08-19.pdf');
    assert.equal(items[0].index, 0);
  });

  it('hittar fältet även utan bindestreck', () => {
    assert.equal(pickHistorikFieldName({
      'Dokumentation historik': []
    }), 'Dokumentation historik');
  });

  it('hoppar över tomma poster och dubbletter', () => {
    const items = collectHistorikAttachments({
      'Dokumentation - historik': [
        null,
        { id: 'att1', filename: 'a.pdf' },
        { id: 'att1', filename: 'a-kopia.pdf' }
      ]
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].attachment.filename, 'a.pdf');
  });

  it('hittar fältet även med annat bindestreck i namnet', () => {
    const items = collectHistorikAttachments({
      'Dokumentation — historik': [
        { id: 'attDash', filename: 'gammal-export.pdf', url: 'https://example.com/gammal.pdf' }
      ]
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].fieldName, 'Dokumentation — historik');
  });

  it('märker filerna så UI kan visa sektionen Dokumentation - historik', () => {
    const items = toHistorikDocumentItems({
      'Dokumentation - historik': [
        { id: 'attHist2', filename: 'kyc-2025.pdf', url: 'https://example.com/kyc.pdf' }
      ]
    });
    assert.equal(items.length, 1);
    assert.equal(items[0]._typ, 'historik');
    assert.equal(items[0]._category, 'historik');
    assert.equal(items[0]._sourceField, DOKUMENTATION_HISTORIK_FIELD);
    assert.equal(items[0]._sourceIndex, 0);
    assert.equal(items[0].filename, 'kyc-2025.pdf');
  });
});
