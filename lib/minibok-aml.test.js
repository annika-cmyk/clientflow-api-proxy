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
  parseSniCodes,
  parseInternationalTrade,
  parseChipList,
  parseLinkedIds,
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

  it('ignorerar Clientflow-placeholder som verksamhetstext', () => {
    const payload = mapCustomerAmlRisk({
      id: 'recPh',
      fields: {
        Verksamhet: 'Verksamhet',
        'Beskrivning av kunden': 'Beskrivning av kunden',
      },
    });
    assert.equal(payload.businessSummary, '');
    assert.equal(payload.customerDescription, '');
  });

  it('rensar HTML från KYC-verksamhet', () => {
    const payload = mapCustomerAmlRisk({
      id: 'recHtml',
      fields: {
        'KYC-formular': JSON.stringify({
          verksamhet:
            '<span style="font-size: 14.72px;">Bolaget ska bedriva handel med metallavfall&nbsp;</span><div>och skrot.</div>',
        }),
      },
    });
    assert.equal(
      payload.businessSummary,
      'Bolaget ska bedriva handel med metallavfall\noch skrot.'
    );
  });

  it('rensar HTML från fältet Verksamhet', () => {
    const payload = mapCustomerAmlRisk({
      id: 'recHtmlField',
      fields: {
        Verksamhet:
          '<span style="font-size: 14.72px;">Bolaget ska bedriva handel med metallavfall&nbsp;</span>',
      },
    });
    assert.equal(payload.businessSummary, 'Bolaget ska bedriva handel med metallavfall');
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

  it('läser Clientflow-KYC-fält som ofta är ifyllda men saknades i mappen', () => {
    const payload = mapCustomerAmlRisk(
      {
        id: 'recEf',
        fields: {
          Bolagsform: 'Enskild firma',
          Namn: 'Tobias Andersson',
          'Ytterligare beskrivning av kunden och verksamheten': 'Bygg och småjobb i Växjö.',
          'SNI kod': '01.131 Potatisodling',
          'Har företaget transaktioner med andra länder?': 'Nej',
          'Ägare EF': 'Tobias Andersson',
          PEP: 'Inte PEP',
          'Riskhöjande faktorer övrigt': [{ name: 'Kontanthantering' }],
          'Risker från KYC': 'Otydlig affärsmodell',
        },
      },
      { linkedRiskFactors: ['Kontanter i kassan [Kund] — Hög'] }
    );
    assert.equal(payload.businessSummary, 'Bygg och småjobb i Växjö.');
    assert.deepEqual(payload.industryCodes, ['01131']);
    assert.equal(payload.internationalTrade.answered, true);
    assert.equal(payload.internationalTrade.outsideSweden, false);
    assert.ok(payload.ownershipMarkers.includes('Tobias Andersson'));
    assert.ok(payload.riskRaisingFactors.includes('Kontanthantering'));
    assert.ok(payload.riskRaisingFactors.includes('Otydlig affärsmodell'));
    assert.ok(payload.riskRaisingFactors.includes('Kontanter i kassan [Kund] — Hög'));
    assert.equal(payload.pep, false);
    assert.equal(payload.pepRaw, 'Inte PEP');
  });

  it('kort Verksamhet döljer inte fet Beskrivning av kunden', () => {
    const payload = mapCustomerAmlRisk({
      id: 'recLong',
      fields: {
        Verksamhet: 'Jordbruk',
        Affärsmodell: 'Lantbruk',
        'Beskrivning av kunden':
          'Enskild firma med växtodling och maskinpark i Skåne, levererar spannmål till svenska uppköpare och hyr ut lagringsutrymme vintertid.',
      },
    });
    assert.match(payload.businessSummary, /växtodling/);
    assert.equal(
      payload.customerDescription,
      'Enskild firma med växtodling och maskinpark i Skåne, levererar spannmål till svenska uppköpare och hyr ut lagringsutrymme vintertid.'
    );
  });
});

describe('parseSniCodes / chips / linked ids', () => {
  it('normaliserar SNI med punkt', () => {
    assert.deepEqual(parseSniCodes('01.131 Potatisodling'), ['01131']);
    assert.deepEqual(parseSniCodes('69201 Redovisning'), ['69201']);
  });

  it('plockar namn från länkobjekt i chip och Användare', () => {
    assert.deepEqual(parseChipList([{ id: 'recR', name: 'Kontanthantering' }]), ['Kontanthantering']);
    assert.deepEqual(parseLinkedIds([{ id: 'recU1', name: 'Anna' }, 'recU2']), ['recU1', 'recU2']);
  });

  it('markerar explicit Nej som besvarad handel', () => {
    const t = parseInternationalTrade({ 'Har företaget transaktioner med andra länder?': 'Nej' }, {});
    assert.equal(t.answered, true);
    assert.equal(t.outsideSweden, false);
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
