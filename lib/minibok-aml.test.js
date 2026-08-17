/**
 * Enhetstester för AML-mappning (utan Airtable I/O).
 * Kör: node --test lib/minibok-aml.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapOverallRisk,
  mapCustomerAmlRisk,
  mapAgencyAmlRisk,
  mapAgencyAmlPolicy,
} = require('./minibok-aml');

describe('mapOverallRisk', () => {
  it('mappar svenska nivåer', () => {
    assert.equal(mapOverallRisk('Lag'), 'low');
    assert.equal(mapOverallRisk('Medel'), 'medium');
    assert.equal(mapOverallRisk('Hog'), 'high');
    assert.equal(mapOverallRisk('Hög'), 'high');
  });
});

describe('mapCustomerAmlRisk', () => {
  it('mappar Riskniva, Omsättning, UBO och riskåtgärder', () => {
    const payload = mapCustomerAmlRisk(
      {
        id: 'recABC',
        fields: {
          Orgnr: '556677-8899',
          Riskniva: 'Medel',
          Omsättning: '0–200 000 kr',
          'Riskbedömning utförd datum': '2026-03-12',
          'Byrans riskbedomning': 'Normal konsultverksamhet',
          'Atgarder riskbedomning': 'Kolla sanktionslistor vid kvartalsmoms\nUppdatera KYC vid bokslut',
          'Verklig huvudman': 'Annika Rydén',
          Kontaktpersoner: JSON.stringify([
            { namn: 'Bosse Boll', roller: ['Verklig huvudman'] },
          ]),
          'KYC-formular (JSON)': JSON.stringify({ omsattning: '0–200 000 kr', pep: false }),
          PEP: false,
        },
      },
      {
        riskAtgarderAktiverade: true,
        riskActionsAssigned: [
          { text: 'Kolla sanktionslistor vid kvartalsmoms', periodKind: 'vat', uppdragTyp: 'Momsredovisning' },
        ],
      }
    );
    assert.equal(payload.customerId, 'recABC');
    assert.equal(payload.orgNr, '5566778899');
    assert.equal(payload.overallRisk, 'medium');
    assert.equal(payload.expectedTurnoverRange, '0–200 000 kr');
    assert.equal(payload.riskAtgarderAktiverade, true);
    assert.equal(payload.requiredActions.length, 2);
    const vat = payload.riskActions.find((a) => a.periodKind === 'vat');
    const other = payload.riskActions.find((a) => a.periodKind === 'unassigned');
    assert.equal(vat && vat.text, 'Kolla sanktionslistor vid kvartalsmoms');
    assert.equal(other && other.text, 'Uppdatera KYC vid bokslut');
    assert.ok(payload.ownershipMarkers.includes('Annika Rydén'));
    assert.ok(payload.ownershipMarkers.includes('Bosse Boll'));
    assert.equal(payload.assessedAt, '2026-03-12');
  });

  it('första saknade risknivå → overallRisk null (okänt ≠ medium)', () => {
    const payload = mapCustomerAmlRisk({ id: 'rec1', fields: {} });
    assert.equal(payload.overallRisk, null);
  });
});

describe('mapAgencyAmlRisk / policy', () => {
  it('plockar värdering och policysektioner', () => {
    const record = {
      id: 'recByra',
      fields: {
        '8. Värdering av sammantagen risk': 'Byråns sammantagna risk bedöms som medel.',
        'Uppdaterad datum': '2026-01-15',
        '1. Syfte och omfattning policy': 'Syftet är att förhindra penningtvätt.',
        '3. Kundkännedomsåtgärder ': 'KYC enligt rutin.',
        'Policydokumentet reviderat och godkänt': '2026-01-15',
      },
    };
    const risk = mapAgencyAmlRisk(record);
    assert.equal(risk.byraRecordId, 'recByra');
    assert.match(risk.summary, /sammantagna risk/);
    assert.equal(risk.assessedAt, '2026-01-15');

    const policy = mapAgencyAmlPolicy(record);
    assert.ok(policy.rules.some((r) => r.id === 'syfte'));
    assert.ok(policy.rules.some((r) => r.id === 'cash_text' && r.match));
    assert.ok(policy.summaryMarkdown.includes('penningtvätt'));
  });
});
