const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Kundresa = require('./kundresa');
const Kundformular = require('./kundformular');

describe('kundresa', () => {
  it('exposes six fas-2 steps', () => {
    assert.equal(Kundresa.KUNDRESA_STEPS.length, 6);
    assert.equal(Kundresa.KUNDRESA_STEPS[0].key, 'sok_hamta');
    assert.equal(Kundresa.KUNDRESA_STEPS[1].key, 'vh_ombud');
    assert.equal(Kundresa.KUNDRESA_STEPS[3].key, 'kundformular');
    assert.equal(Kundresa.KUNDRESA_STEPS[5].comingSoonBankId, true);
  });

  it('VH hard gate blocks when Osäker/Nej', () => {
    const form = Kundformular.applySave(
      Kundformular.emptyForm(),
      { byraVhBekraftelse: 'Osaker', byraVhNote: 'Behöver utredas' },
      { actor: 'byra', action: 'set_byra_vh' }
    );
    const gate = Kundresa.assessVhHardGate(form, { bolagsform: 'Aktiebolag' });
    assert.equal(gate.blocked, true);
    assert.equal(gate.value, 'Osaker');
    assert.equal(gate.code, 'VH_HARD_GATE');

    assert.throws(
      () => Kundresa.assertVhAllowsAction(form, 'mark_sent', { bolagsform: 'Aktiebolag' }),
      (err) => err && err.code === 'VH_HARD_GATE' && err.status === 409
    );
    // save tillåts fortfarande
    assert.doesNotThrow(() => Kundresa.assertVhAllowsAction(form, 'save', { bolagsform: 'Aktiebolag' }));
  });

  it('VH gate is inactive for enskild firma', () => {
    const form = Kundformular.applySave(
      Kundformular.emptyForm(),
      { byraVhBekraftelse: 'Nej' },
      { actor: 'byra', action: 'set_byra_vh' }
    );
    const gate = Kundresa.assessVhHardGate(form, { bolagsform: 'Enskild firma' });
    assert.equal(gate.blocked, false);
    assert.equal(gate.relevant, false);
    assert.equal(gate.complete, true);
  });

  it('gates later steps when VH is blocked', () => {
    const form = Kundformular.applySave(
      Kundformular.emptyForm(),
      { byraVhBekraftelse: 'Nej' },
      { actor: 'byra', action: 'set_byra_vh' }
    );
    const summary = Kundresa.buildKundresaSummary({
      fields: {
        Namn: 'Acme AB',
        Orgnr: '556677-8899',
        'Bolagsverket uppdaterad': '2026-09-01',
        Bolagsform: 'Aktiebolag'
      },
      form,
      kyc: {}
    });
    assert.equal(summary.blocked, true);
    assert.equal(summary.steps[0].status, 'done');
    assert.equal(summary.steps[1].status, 'attention');
    assert.equal(summary.steps[2].gated, true);
    assert.equal(summary.steps[3].status, 'gated');
    assert.equal(summary.steps[5].status, 'gated');
  });

  it('marks next step and progress when VH is Ja', () => {
    const form = Kundformular.applySave(
      Kundformular.emptyForm(),
      { byraVhBekraftelse: 'Ja' },
      { actor: 'byra', action: 'set_byra_vh' }
    );
    const summary = Kundresa.buildKundresaSummary({
      fields: {
        Namn: 'Acme AB',
        Orgnr: '556677-8899',
        Verksamhet: 'Handel',
        'Bolagsverket uppdaterad': '2026-09-01',
        Bolagsform: 'Aktiebolag'
      },
      form
    });
    assert.equal(summary.blocked, false);
    assert.equal(summary.steps[1].done, true);
    assert.equal(summary.steps[2].status, 'next');
    assert.match(summary.progressLabel, /2 av 6/);
  });
});
