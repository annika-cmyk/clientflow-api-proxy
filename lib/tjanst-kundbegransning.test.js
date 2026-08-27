const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TKB = require('./tjanst-kundbegransning');
const TjanstKatalog = require('../public/js/tjanst-katalog');

const CATALOG = TjanstKatalog.catalogFromRecords([
  { id: 'recKbr000001', namn: 'Upprätta kontrollbalansräkning', aktuell: true },
  { id: 'recBok000001', namn: 'Bokslut', aktuell: true }
]);

describe('tjanst-kundbegransning', () => {
  it('känner igen kontrollbalansräkning', () => {
    assert.equal(TKB.isKontrollbalansNamn('Upprätta kontrollbalansräkning'), true);
    assert.equal(TKB.isKontrollbalansNamn('Bokslut'), false);
  });

  it('tillåter kontrollbalans bara för ENA Operations', () => {
    assert.equal(TKB.customerMayHaveKontrollbalans('ENA Operations AB'), true);
    assert.equal(
      TKB.customerMayHaveKontrollbalans('ENA Operations AB, EnaSweden, Affärsutveckling Polen'),
      true
    );
    assert.equal(TKB.customerMayHaveKontrollbalans('Gehricke, Andreas'), false);
  });

  it('filtrerar bort kontrollbalans för andra kunder', () => {
    const filtered = TKB.filterKundTjansterIds(
      ['recKbr000001', 'recBok000001'],
      CATALOG,
      'Gehricke, Andreas',
      TjanstKatalog
    );
    assert.deepEqual(filtered, ['recBok000001']);
  });

  it('behåller kontrollbalans för ENA Operations', () => {
    const filtered = TKB.filterKundTjansterIds(
      ['recKbr000001', 'recBok000001'],
      CATALOG,
      'ENA Operations AB',
      TjanstKatalog
    );
    assert.deepEqual(filtered, ['recKbr000001', 'recBok000001']);
  });
});
