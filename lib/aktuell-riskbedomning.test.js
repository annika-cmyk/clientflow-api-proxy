const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const A = require('./aktuell-riskbedomning');

const TODAY = '2026-08-26';

function baseFields(overrides = {}) {
  return {
    Namn: 'Test AB',
    Orgnr: '5561234567',
    'Entity screening datum': '2026-01-15',
    Kontaktpersoner: JSON.stringify([
      { namn: 'Anna Andersson', roller: ['VD'], pepSoktDatum: '2026-02-01' }
    ]),
    'Dokumentation Kategorier': JSON.stringify([
      { filename: 'riskbedomning.pdf', category: 'riskbedomning', subcategory: 'kund_riskbedomning' },
      { filename: 'KYC-signerat.pdf', category: 'riskbedomning', subcategory: 'kyc' }
    ]),
    'KYC-formular (JSON)': JSON.stringify({ status: 'Signerat' }),
    ...overrides
  };
}

describe('aktuell-riskbedomning', () => {
  it('är komplett när alla krav uppfylls', () => {
    const assess = A.assessAktuellRiskbedomning(baseFields(), TODAY);
    assert.equal(assess.complete, true);
    assert.deepEqual(assess.missing, []);
  });

  it('saknar kundens riskbedömning i aktuell dokumentation', () => {
    const fields = baseFields({
      'Dokumentation Kategorier': JSON.stringify([
        { filename: 'KYC-signerat.pdf', category: 'riskbedomning', subcategory: 'kyc' }
      ])
    });
    const assess = A.assessAktuellRiskbedomning(fields, TODAY);
    assert.equal(assess.complete, false);
    assert.ok(assess.missing.includes('kund_riskbedomning'));
  });

  it('räknar historik-risk som otillräcklig utan datumfält', () => {
    const fields = baseFields({
      'Dokumentation Kategorier': JSON.stringify([
        { filename: 'risk.pdf', category: 'historik_riskbedomning', subcategory: 'kund_riskbedomning' },
        { filename: 'KYC-signerat.pdf', category: 'riskbedomning', subcategory: 'kyc' }
      ])
    });
    assert.ok(A.assessAktuellRiskbedomning(fields, TODAY).missing.includes('kund_riskbedomning'));
  });

  it('accepterar Riskbedömning utförd datum utan dokumentmetadata', () => {
    const fields = baseFields({
      'Dokumentation Kategorier': JSON.stringify([
        { filename: 'KYC-signerat.pdf', category: 'riskbedomning', subcategory: 'kyc' }
      ]),
      'Riskbedömning utförd datum': '2026-06-01'
    });
    assert.equal(A.hasKundRiskbedomning(fields, TODAY), true);
    assert.equal(A.saknarAktuellRiskbedomning(fields, TODAY), false);
  });

  it('dashboard risk-läge listar bara saknad riskbedömning', () => {
    const row = A.dashboardRowFromRecord({
      id: 'rec1',
      fields: baseFields({
        'Dokumentation Kategorier': '[]',
        'KYC-formular (JSON)': JSON.stringify({ status: 'Utkast' }),
        'Entity screening datum': ''
      })
    }, TODAY, { mode: 'risk' });
    assert.deepEqual(row.missing, ['kund_riskbedomning']);
  });

  it('kräver signerat KYC i full assess', () => {
    const fields = baseFields({
      'Dokumentation Kategorier': JSON.stringify([
        { filename: 'risk.pdf', category: 'riskbedomning', subcategory: 'kund_riskbedomning' },
        { filename: 'kyc-utkast.pdf', category: 'riskbedomning', subcategory: 'kyc' }
      ]),
      'KYC-formular (JSON)': JSON.stringify({ status: 'Utkast' })
    });
    assert.ok(A.assessAktuellRiskbedomning(fields, TODAY).missing.includes('kyc_signerat'));
  });

  it('accepterar signerat KYC via status Signerat', () => {
    const fields = baseFields({
      'Dokumentation Kategorier': JSON.stringify([
        { filename: 'risk.pdf', category: 'riskbedomning', subcategory: 'kund_riskbedomning' }
      ]),
      'KYC-formular (JSON)': JSON.stringify({ status: 'Signerat' })
    });
    assert.equal(A.hasAktuelltKyc(fields), true);
    assert.equal(A.saknarAktuelltKyc(fields), false);
  });

  it('accepterar KYC utanför ClientFlow och UTFÖRD DATUM', () => {
    assert.equal(A.hasAktuelltKyc(baseFields({
      'KYC-formulär utanför ClientFlow': true,
      'KYC-formular (JSON)': JSON.stringify({ status: 'Utkast' }),
      'Dokumentation Kategorier': '[]'
    })), true);
    assert.equal(A.hasAktuelltKyc(baseFields({
      'KYC UTFÖRD DATUM': '2026-05-01',
      'KYC-formular (JSON)': JSON.stringify({ status: 'Utkast' }),
      'Dokumentation Kategorier': '[]'
    })), true);
  });

  it('accepterar uppdragsavtal via utanför, datum eller Signerat', () => {
    assert.equal(A.hasUppdragsavtal({ 'Uppdragsavtal utanför ClientFlow': true }, ''), true);
    assert.equal(A.hasUppdragsavtal({ 'Uppdragsavtal UTFÖRD DATUM': '2026-01-01' }, ''), true);
    assert.equal(A.hasUppdragsavtal({}, 'Signerat'), true);
    assert.equal(A.hasUppdragsavtal({}, 'Skickat till kund'), false);
    assert.equal(A.saknarUppdragsavtal({}, ''), true);
  });

  it('kräver företagsscreening inom ett år i full assess', () => {
    const fields = baseFields({ 'Entity screening datum': '2024-01-01' });
    assert.ok(A.assessAktuellRiskbedomning(fields, TODAY).missing.includes('entity_screening'));
  });

  it('kräver PEP-sökning inom ett år för alla personer i full assess', () => {
    const fields = baseFields({
      Kontaktpersoner: JSON.stringify([
        { namn: 'Anna Andersson', roller: ['VD'], pepSoktDatum: '2024-01-01' },
        { namn: 'Bo Bengtsson', roller: ['Styrelseledamot'], pepSoktDatum: '2026-03-01' }
      ])
    });
    assert.ok(A.assessAktuellRiskbedomning(fields, TODAY).missing.includes('person_screening'));
  });

  it('hoppar över företagsrader i personkravet', () => {
    const fields = baseFields({
      Kontaktpersoner: JSON.stringify([
        { namn: 'Dotterbolag AB', roller: ['Företag med ägarandelar'], pepSoktDatum: '' },
        { namn: 'Anna Andersson', roller: ['VD'], pepSoktDatum: '2026-02-01' }
      ])
    });
    assert.equal(A.assessAktuellRiskbedomning(fields, TODAY).complete, true);
  });

  it('dashboardRowFromRecord i full-läge inkluderar saknade delar', () => {
    const row = A.dashboardRowFromRecord({
      id: 'rec1',
      fields: baseFields({ 'Entity screening datum': '' })
    }, TODAY, { mode: 'full' });
    assert.equal(row.id, 'rec1');
    assert.ok(row.missing.includes('entity_screening'));
    assert.ok(row.missingLabels.some((l) => /företaget/i.test(l)));
  });
});
