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
  fieldStr,
  airtableCellStr,
  normalizeFieldKey,
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

  it('mappar SNI, verksamhet-fallbacks, handel och risksänkande åtgärder', () => {
    const payload = mapCustomerAmlRisk(
      {
        id: 'recRich',
        fields: {
          'Verksamhetsbeskrivning': 'Bolagsverketstext som bara är fallback',
          'Beskrivning av kunden': 'Redovisningsbyrå med lantbrukskunder i Småland.',
          'SNI kod': '69201 Redovisning\n01500 - Blandat jordbruk',
          'Har företaget transaktioner med andra länder?': 'Ja',
          'Internationella länder': 'Norge, Danmark',
          'Risksänkande åtgjärder': 'Förstärkt KYC vid nya motparter',
          'Risksänkande faktorer': 'Långvarig kundrelation\nInga kontanter',
          'Riskhöjande faktorer övrigt': ['Kontanthantering'],
          Motivering: 'Medelrisk p.g.a. blandad verksamhet',
          Klientansvarig: 'Annika Rydén',
          'Kundens riskbedömning godkänd': '2026-04-01',
        },
      },
      {
        behoriga: [{ id: 'recU1', name: 'Lisa Bok', email: 'lisa@ex.se' }],
        clientflowNotes: [{ id: 'n1', type: 'AML', date: '2026-03-01', text: 'Känd gårdskund' }],
      }
    );
    assert.equal(payload.businessSummary, 'Redovisningsbyrå med lantbrukskunder i Småland.');
    assert.deepEqual(payload.industryCodes, ['69201', '01500']);
    assert.equal(payload.internationalTrade.outsideSweden, true);
    assert.deepEqual(payload.internationalTrade.countries, ['Norge', 'Danmark']);
    assert.equal(payload.riskReducingMeasures, 'Förstärkt KYC vid nya motparter');
    assert.ok(payload.riskReducingFactors.includes('Långvarig kundrelation'));
    assert.ok(payload.riskRaisingFactors.includes('Kontanthantering'));
    assert.equal(payload.klientansvarig, 'Annika Rydén');
    assert.equal(payload.behoriga[0].name, 'Lisa Bok');
    assert.equal(payload.clientflowNotes[0].text, 'Känd gårdskund');
    assert.equal(payload.approvedAt, '2026-04-01');
    assert.equal(payload.rationale, 'Medelrisk p.g.a. blandad verksamhet');
  });

  it('matchar Risknivå med diakrit och länkade namnobjekt', () => {
    assert.equal(normalizeFieldKey('Risknivå'), 'riskniva');
    assert.equal(airtableCellStr([{ id: 'recU1', name: 'Mirsad Rrahmani' }]), 'Mirsad Rrahmani');
    assert.equal(fieldStr({ 'Risknivå': 'Hög' }, 'Riskniva'), 'Hög');
    const payload = mapCustomerAmlRisk({
      id: 'recAccent',
      fields: {
        'Risknivå': 'Hög',
        Klientansvarig: [{ id: 'recU1', name: 'Mirsad Rrahmani' }],
        'SNI-koder': '62010 Dataprogrammering',
      },
    });
    assert.equal(payload.overallRisk, 'high');
    assert.equal(payload.overallRiskRaw, 'Hög');
    assert.equal(payload.klientansvarig, 'Mirsad Rrahmani');
    assert.deepEqual(payload.industryCodes, ['62010']);
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

  it('lägger focusAreas från byrå-risk på policy-payloaden', () => {
    const record = {
      id: 'recByra',
      fields: {
        '4. Identifierade Risker och Sårbarheter': '- Kontanter\n- Högriskländer: Iran, Nordkorea',
        '1. Syfte och omfattning policy': 'Policy.',
      },
    };
    const policy = mapAgencyAmlPolicy(record);
    assert.ok(policy.focusAreas.includes('Kontanter'));
    assert.ok(policy.geoHighRiskList.includes('Iran'));
    assert.ok(policy.geoHighRiskList.includes('Nordkorea'));
  });
});
