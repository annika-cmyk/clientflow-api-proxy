const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const UppdragTyp = require('../public/js/uppdrag-typ');

describe('uppdrag-typ', () => {
  it('visar fritextnamn för eget uppdrag', () => {
    assert.equal(UppdragTyp.uppdragDisplayName('Eget uppdrag', { Namn: 'Rådgivning Q3' }), 'Rådgivning Q3');
    assert.equal(UppdragTyp.uppdragDisplayName('Eget uppdrag', {}), 'Eget uppdrag');
  });

  it('ger veckovis och engång för egna och årsvisa typer', () => {
    const choices = UppdragTyp.frekvensChoicesForTyp('Eget uppdrag', false);
    assert.ok(choices.includes('Veckovis'));
    assert.ok(choices.includes('Engång'));
    assert.ok(choices.includes('Årsvis'));
  });

  it('håller lön på varje månad', () => {
    assert.deepEqual(UppdragTyp.frekvensChoicesForTyp('Löneuppdrag innevarande', true), ['Varje månad']);
  });

  it('lägger veckovis och engång på bokslut och moms', () => {
    const bokslut = UppdragTyp.frekvensChoicesForTyp('Bokslut', false);
    const moms = UppdragTyp.frekvensChoicesForTyp('Momsredovisning', false);
    assert.ok(bokslut.includes('Veckovis'));
    assert.ok(bokslut.includes('Engång'));
    assert.ok(moms.includes('Veckovis'));
    assert.ok(moms.includes('Engång'));
  });
});
