const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildStrukturellaLuckor } = require('./strukturella-luckor');

describe('strukturella-luckor', () => {
  it('samlar tjänsteavvikelser, saknad PT/TF och dimensionluckor', () => {
    const report = buildStrukturellaLuckor({
      kunder: [
        {
          id: 'recA',
          fields: {
            Namn: 'Alfa AB',
            'Kundens utvalda tjänster': ['BOKSLUT', 'Moms', 'Avstämning'],
            'risker kopplat till tjänster': []
          }
        },
        {
          id: 'recB',
          fields: {
            Namn: 'Beta AB',
            'Kundens utvalda tjänster': ['recBokslut01'],
            'risker kopplat till tjänster': ['recGeo'],
            'Kunden verkar i en högriskbransch': ['Bygg']
          }
        }
      ],
      tjanster: [{ id: 'recBokslut01', fields: { 'Task Name': 'Bokslut' } }, { id: 'recMoms', fields: { 'Task Name': 'Momsredovisning' } }],
      ovriga: [
        { id: 'recGeo', fields: { Riskfaktor: 'Europa', 'Typ av riskfaktor': 'Geografiska riskfaktorer', 'PT/TF-relevans': 'PT' } },
        { id: 'recDist', fields: { Riskfaktor: 'Fysiskt möte', 'Typ av riskfaktor': 'Distrubutionskanaler' } },
        { id: 'recKund', fields: { Riskfaktor: 'Privatkunder', 'Typ av riskfaktor': 'Riskfaktorer kopplat till kund', 'PT/TF-relevans': 'PT' } }
      ]
    });
    assert.ok(report.tjanst.antalKunder >= 1);
    const alfa = report.tjanst.kunder.find((k) => k.namn === 'Alfa AB');
    assert.ok(alfa);
    assert.deepEqual(alfa.normalize.map((n) => n.till), ['Bokslut', 'Momsredovisning']);
    assert.deepEqual(alfa.askAnnika, ['Avstämning']);
    assert.equal(report.pttf.antal, 1);
    assert.equal(report.pttf.mallar[0].namn, 'Fysiskt möte');
    assert.ok(report.dimensioner.antal >= 1);
    assert.equal(report.samlad.kunder[0].namn, 'Alfa AB');
    assert.ok(report.samlad.kunder[0].antalLuckor > report.samlad.kunder[1].antalLuckor);
  });
});
