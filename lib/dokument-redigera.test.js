const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  inferCategoryFromSource,
  destinationFieldForCategory,
  planDokumentEdit
} = require('./dokument-redigera');
const { DOKUMENTATION_HISTORIK_FIELD } = require('./dokument-historik');

describe('dokument-redigera', () => {
  it('gissar kategori från källfältet', () => {
    assert.equal(inferCategoryFromSource('Dokumentation - historik', {
      'Dokumentation - historik': []
    }), 'historik');
    assert.equal(inferCategoryFromSource('Riskbedömning dokument', {}), 'riskbedomning');
    assert.equal(inferCategoryFromSource('Senaste årsredovisning fil', {}), 'arsredovisning');
    assert.equal(inferCategoryFromSource('Dokumentation', {}), null);
  });

  it('flyttar bara när historik byts mot annan kategori', () => {
    const fields = {
      Dokumentation: [],
      'Dokumentation - historik': []
    };
    assert.equal(
      destinationFieldForCategory(DOKUMENTATION_HISTORIK_FIELD, 'kyc', fields),
      'Dokumentation'
    );
    assert.equal(
      destinationFieldForCategory('Dokumentation', 'historik', fields),
      DOKUMENTATION_HISTORIK_FIELD
    );
    assert.equal(
      destinationFieldForCategory('Dokumentation', 'kyc', fields),
      'Dokumentation'
    );
    assert.equal(
      destinationFieldForCategory(DOKUMENTATION_HISTORIK_FIELD, 'historik', fields),
      DOKUMENTATION_HISTORIK_FIELD
    );
  });

  it('uppdaterar skapat datum för uppladdade dokument', () => {
    const plan = planDokumentEdit({
      fields: {
        'Dokumentation - historik': [
          { id: 'att1', filename: 'Gammalt avtal.pdf', url: 'https://example.com/avtal.pdf' }
        ]
      },
      sourceField: 'Dokumentation - historik',
      sourceIndex: 0,
      createdDate: '2019-06-01'
    });
    assert.equal(plan.moved, false);
    assert.equal(plan.createdDate, '2019-06-01');
    const meta = JSON.parse(plan.patchFields['Dokumentation Kategorier']);
    assert.equal(meta[0].createdDate, '2019-06-01');
  });

  it('stoppar redigering av skapat datum för ClientFlow-dokument', () => {
    const blocked = planDokumentEdit({
      fields: {
        Dokumentation: [
          { id: 'att1', filename: 'Uppdragsavtal-signerat.pdf', url: 'https://example.com/avtal.pdf' }
        ],
        'Dokumentation Kategorier': JSON.stringify([
          { filename: 'Uppdragsavtal-signerat.pdf', category: 'uppdragsavtal', createdDate: '2025-01-23', systemCreated: true }
        ])
      },
      sourceField: 'Dokumentation',
      sourceIndex: 0,
      createdDate: '2020-01-01'
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.error, /ClientFlow/i);
  });

  it('byter bara visningsnamn utan att flytta filen', () => {
    const plan = planDokumentEdit({
      fields: {
        'Dokumentation - historik': [
          { id: 'att1', filename: 'BeLean AB - Riskbedömning.pdf', url: 'https://example.com/risk.pdf' }
        ]
      },
      sourceField: 'Dokumentation - historik',
      sourceIndex: 0,
      displayName: 'Riskbedömning BeLean'
    });
    assert.equal(plan.moved, false);
    assert.equal(plan.nextCategory, 'historik');
    assert.equal(plan.displayName, 'Riskbedömning BeLean');
    assert.equal(plan.patchFields['Dokumentation - historik'], undefined);
    const meta = JSON.parse(plan.patchFields['Dokumentation Kategorier']);
    assert.equal(meta[0].displayName, 'Riskbedömning BeLean');
    assert.equal(meta[0].category, 'historik');
  });

  it('byter kategori från historik utan att flytta bilagan i Airtable', () => {
    const plan = planDokumentEdit({
      fields: {
        Dokumentation: [{ id: 'keep', filename: 'kvar.pdf', url: 'https://example.com/kvar.pdf' }],
        'Dokumentation - historik': [
          { id: 'attHist', filename: 'BeLean AB - Övrigt.pdf', url: 'https://example.com/ovrigt.pdf' }
        ]
      },
      sourceField: 'Dokumentation - historik',
      sourceIndex: 0,
      category: 'ovrigt',
      customCategory: 'Övriga underlag'
    });
    assert.equal(plan.moved, false);
    assert.equal(plan.destField, 'Dokumentation - historik');
    assert.equal(plan.patchFields['Dokumentation - historik'], undefined);
    assert.equal(plan.patchFields.Dokumentation, undefined);
    const meta = JSON.parse(plan.patchFields['Dokumentation Kategorier']);
    assert.equal(meta[0].category, 'ovrigt');
    assert.equal(meta[0].customCategory, 'Övriga underlag');
  });

  it('byter kategori till historik utan att flytta bilagan i Airtable', () => {
    const plan = planDokumentEdit({
      fields: {
        Dokumentation: [
          { id: 'attDok', filename: 'avtal.pdf', url: 'https://example.com/avtal.pdf' }
        ],
        'Dokumentation Kategorier': JSON.stringify([
          { filename: 'avtal.pdf', category: 'uppdragsavtal', attachmentId: 'attDok' }
        ])
      },
      sourceField: 'Dokumentation',
      sourceIndex: 0,
      category: 'historik'
    });
    assert.equal(plan.moved, false);
    assert.equal(plan.destField, 'Dokumentation');
    assert.equal(plan.patchFields.Dokumentation, undefined);
    assert.equal(plan.patchFields[DOKUMENTATION_HISTORIK_FIELD], undefined);
    const meta = JSON.parse(plan.patchFields['Dokumentation Kategorier']);
    assert.equal(meta[0].category, 'historik');
    assert.equal(meta[0].attachmentId, 'attDok');
  });

  it('byter kategori inom Dokumentation utan att flytta', () => {
    const plan = planDokumentEdit({
      fields: {
        Dokumentation: [
          { id: 'attDok', filename: 'kyc.pdf', url: 'https://example.com/kyc.pdf' }
        ],
        'Dokumentation Kategorier': JSON.stringify([
          { filename: 'kyc.pdf', category: 'kyc', attachmentId: 'attDok', displayName: 'KYC BeLean' }
        ])
      },
      sourceField: 'Dokumentation',
      sourceIndex: 0,
      category: 'uppdragsavtal'
    });
    assert.equal(plan.moved, false);
    assert.equal(plan.displayName, 'KYC BeLean');
    const meta = JSON.parse(plan.patchFields['Dokumentation Kategorier']);
    assert.equal(meta[0].category, 'uppdragsavtal');
    assert.equal(meta[0].displayName, 'KYC BeLean');
  });

  it('avvisar ogiltigt index och ogiltig kategori', () => {
    const missing = planDokumentEdit({
      fields: { Dokumentation: [] },
      sourceField: 'Dokumentation',
      sourceIndex: 0,
      displayName: 'X'
    });
    assert.equal(missing.status, 400);
    const badCat = planDokumentEdit({
      fields: {
        Dokumentation: [{ id: 'a', filename: 'a.pdf', url: 'https://example.com/a.pdf' }]
      },
      sourceField: 'Dokumentation',
      sourceIndex: 0,
      category: 'hemlig'
    });
    assert.equal(badCat.status, 400);
    assert.match(badCat.error, /kategori/i);
  });
});
