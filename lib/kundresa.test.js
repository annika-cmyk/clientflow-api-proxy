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
    assert.throws(
      () => Kundresa.assertVhAllowsAction(form, 'kyc_skicka_for_signering', { bolagsform: 'Aktiebolag' }),
      (err) => err && err.code === 'VH_HARD_GATE' && err.status === 409
    );
    assert.throws(
      () => Kundresa.assertVhAllowsAction(form, 'save_residual', { bolagsform: 'Aktiebolag' }),
      (err) => err && err.code === 'VH_HARD_GATE' && err.status === 409
    );
    // save tillåts fortfarande
    assert.doesNotThrow(() => Kundresa.assertVhAllowsAction(form, 'save', { bolagsform: 'Aktiebolag' }));
  });

  it('VH_BLOCKED_ACTIONS includes KYC send and residual save', () => {
    assert.ok(Kundresa.VH_BLOCKED_ACTIONS.has('kyc_skicka_for_signering'));
    assert.ok(Kundresa.VH_BLOCKED_ACTIONS.has('save_residual'));
    assert.ok(Kundresa.VH_BLOCKED_ACTIONS.has('mark_sent'));
  });

  it('index.js gates KYC skicka and residual save on VH', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /assertVhAllowsAction\(kfForm,\s*'kyc_skicka_for_signering'/);
    assert.match(index, /assertVhAllowsAction\(kfForm,\s*'save_residual'/);
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

  it('steg 2 focuses VH panel; steg 4 opens kundformulär', () => {
    const step2 = Kundresa.KUNDRESA_STEPS[1];
    const step4 = Kundresa.KUNDRESA_STEPS[3];
    assert.equal(step2.focus, 'vh');
    assert.equal(step2.tab, '');
    assert.equal(step4.tab, 'kundformular');
    assert.notEqual(step2.tab, step4.tab);
  });

  it('assessVhAlignment compares byrå and kund against same register', () => {
    let form = Kundformular.emptyForm();
    form = Kundformular.applySave(form, {
      huvudman: [{ namn: 'Anna Andersson', personnr: '198001011234' }],
      vh_bekraftelse: 'Ja'
    }, { actor: 'kund', action: 'save' });
    form = Kundformular.applySave(form, {
      byraVhBekraftelse: 'Ja'
    }, { actor: 'byra', action: 'set_byra_vh' });

    const align = Kundresa.assessVhAlignment(form, { bolagsform: 'Aktiebolag' });
    assert.equal(align.status, 'match');
    assert.equal(align.register.length, 1);
    assert.equal(align.register[0].namn, 'Anna Andersson');

    const mismatchForm = Kundformular.applySave(form, {
      byraVhBekraftelse: 'Nej',
      byraVhNote: 'Avviker'
    }, { actor: 'byra', action: 'set_byra_vh' });
    const mismatch = Kundresa.assessVhAlignment(mismatchForm, { bolagsform: 'Aktiebolag' });
    assert.equal(mismatch.status, 'mismatch');

    const summary = Kundresa.buildKundresaSummary({
      form,
      fields: { Bolagsform: 'Aktiebolag' }
    });
    assert.equal(summary.vhAlignment.status, 'match');
    assert.equal(summary.byraVhBekraftelse, 'Ja');
  });
});
