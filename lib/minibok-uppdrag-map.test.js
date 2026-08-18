/**
 * Tester för uppdrag-boardfält som Minibok visar (rutin, anteckning, behöriga).
 * Kör: node --test lib/minibok-uppdrag-map.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mapUppdragBoardRow, noteFromUppdrag, parseRiskAtgarderValda } = require('./minibok-uppdrag-map');

describe('parseRiskAtgarderValda', () => {
  it('läser JSON och radbruten text', () => {
    assert.deepEqual(parseRiskAtgarderValda('["A","B"]'), ['A', 'B']);
    assert.deepEqual(parseRiskAtgarderValda('En\nTvå'), ['En', 'Två']);
  });
});

describe('noteFromUppdrag', () => {
  it('prioriterar periodens historikanteckning', () => {
    const fields = {
      Historik: JSON.stringify([
        { periodKey: '2026-Q2', note: 'Moms Q2 klar', status: 'Klar' },
      ]),
      Anteckning: 'Gammal mallanteckning',
      'Anteckning för denna körning': 'Pågående anteckning',
    };
    assert.equal(noteFromUppdrag(fields, '2026-Q2'), 'Moms Q2 klar');
    assert.equal(noteFromUppdrag(fields, '2026-Q1'), 'Pågående anteckning');
  });
});

describe('mapUppdragBoardRow', () => {
  it('exponerar rutin, anteckning, klientansvarig, behöriga och riskåtgärder', () => {
    const row = mapUppdragBoardRow({
      record: {
        id: 'recUpp',
        fields: {
          'Kund ID': 'recKund',
          Kundnamn: 'Test AB',
          Orgnr: '5566778899',
          Typ: 'Momsredovisning',
          Frekvens: 'Kvartalsvis',
          Ansvarig: 'Lisa Bok',
          Klientansvarig: '',
          _klientansvarigKund: 'Annika Rydén',
          _behoriga: ['Annika Rydén', 'Lisa Bok'],
          Rutin: 'Stäm av momsrapport mot huvudbok.',
          Anteckning: 'Känd säsongsvariation i Q2.',
          Historik: JSON.stringify([]),
          Status: 'Aktiv',
          'Riskåtgärder aktiverade': true,
          'Riskåtgärder valda': '["Kolla sanktionslistor"]',
        },
      },
      typ: 'Momsredovisning',
      periodKey: '2026-Q2',
      periodLabel: 'Moms Q2',
      deadline: '2026-08-17',
      startDate: '2026-04-01',
      month: '2026-08',
    });
    assert.equal(row.rutin, 'Stäm av momsrapport mot huvudbok.');
    assert.equal(row.anteckning, 'Känd säsongsvariation i Q2.');
    assert.equal(row.klientansvarig, 'Annika Rydén');
    assert.deepEqual(row.behoriga, ['Annika Rydén', 'Lisa Bok']);
    assert.deepEqual(row.riskAtgarderValda, ['Kolla sanktionslistor']);
    assert.equal(row.ansvarig, 'Lisa Bok');
  });
});
