const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Kundresa = require('./kundresa');
const Kundformular = require('./kundformular');

describe('kundresa', () => {
  it('exposes four uppläggningssteg', () => {
    assert.equal(Kundresa.KUNDRESA_STEPS.length, 4);
    assert.equal(Kundresa.KUNDRESA_STEPS[0].key, 'foretag_personer');
    assert.equal(Kundresa.KUNDRESA_STEPS[1].key, 'beskrivning_fragor');
    assert.equal(Kundresa.KUNDRESA_STEPS[2].key, 'redovisning_tjanster');
    assert.equal(Kundresa.KUNDRESA_STEPS[3].key, 'kyc_skicka');
  });

  it('exposes stable cardIds per steg for popup mount', () => {
    assert.deepEqual(Kundresa.KUNDRESA_STEPS[0].cardIds, ['bolagsverket-card', 'roller-card']);
    assert.deepEqual(Kundresa.KUNDRESA_STEPS[1].cardIds, ['beskrivning-card', 'kycformular-content']);
    assert.deepEqual(Kundresa.KUNDRESA_STEPS[2].cardIds, ['redovisning-card', 'nykund-tjanster-card']);
    assert.deepEqual(Kundresa.KUNDRESA_STEPS[3].cardIds, ['kycformular-content']);
    assert.deepEqual(Kundresa.cardIdsForKundresaStep('foretag_personer'), ['bolagsverket-card', 'roller-card']);
    const summary = Kundresa.buildKundresaSummary({
      fields: { Bolagsform: 'Aktiebolag' },
      form: Kundformular.emptyForm(),
      kyc: {}
    });
    assert.deepEqual(summary.steps[0].cardIds, ['bolagsverket-card', 'roller-card']);
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
      () => Kundresa.assertVhAllowsAction(form, 'kyc_skicka_till_kund', { bolagsform: 'Aktiebolag' }),
      (err) => err && err.code === 'VH_HARD_GATE' && err.status === 409
    );
    assert.throws(
      () => Kundresa.assertVhAllowsAction(form, 'save_residual', { bolagsform: 'Aktiebolag' }),
      (err) => err && err.code === 'VH_HARD_GATE' && err.status === 409
    );
    assert.doesNotThrow(() => Kundresa.assertVhAllowsAction(form, 'save', { bolagsform: 'Aktiebolag' }));
  });

  it('VH_BLOCKED_ACTIONS includes KYC send and residual save', () => {
    assert.ok(Kundresa.VH_BLOCKED_ACTIONS.has('kyc_skicka_for_signering'));
    assert.ok(Kundresa.VH_BLOCKED_ACTIONS.has('kyc_skicka_till_kund'));
    assert.ok(Kundresa.VH_BLOCKED_ACTIONS.has('save_residual'));
    assert.ok(Kundresa.VH_BLOCKED_ACTIONS.has('mark_sent'));
  });

  it('index.js gates KYC skicka and residual save on VH', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /assertVhAllowsAction\(kfForm,\s*'kyc_skicka_for_signering'/);
    assert.match(index, /assertVhAllowsAction\(kfForm,\s*'kyc_skicka_till_kund'/);
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

  it('gates later steps when VH is blocked (AB)', () => {
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
        Bolagsform: 'Aktiebolag',
        'Entity screening datum': '2026-08-01',
        Kontaktpersoner: JSON.stringify([
          { namn: 'Anna', roller: ['Verklig huvudman'], epost: 'a@b.se', telefon: '070123' }
        ])
      },
      form,
      kyc: {}
    });
    assert.equal(summary.blocked, true);
    assert.equal(summary.steps[0].status, 'attention');
    assert.equal(summary.steps[1].gated, true);
    assert.equal(summary.steps[2].status, 'gated');
    assert.equal(summary.steps[3].status, 'gated');
  });

  it('marks next step after VH Ja when screening och VH-kontakt finns', () => {
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
        Bolagsform: 'Aktiebolag',
        'Entity screening datum': '2026-08-01',
        Kontaktpersoner: JSON.stringify([
          { namn: 'Anna', roller: ['Verklig huvudman'], epost: 'a@b.se', telefon: '070123' }
        ])
      },
      form,
      kyc: {}
    });
    assert.equal(summary.blocked, false);
    assert.equal(summary.steps[0].done, true);
    assert.equal(summary.steps[1].status, 'next');
    assert.match(summary.progressLabel, /1 av 4/);
  });

  it('stegfokus: 1 personer, 2 frågor, 3 redovisning, 4 skicka KYC', () => {
    const [s1, s2, s3, s4] = Kundresa.KUNDRESA_STEPS;
    assert.equal(s1.focus, 'foretag_personer');
    assert.equal(s1.tab, 'foretagsinformation');
    assert.equal(s2.focus, 'beskrivning_fragor');
    assert.equal(s2.tab, 'kycformular');
    assert.equal(s3.focus, 'redovisning_tjanster');
    assert.equal(s3.tab, 'foretagsinformation');
    assert.equal(s4.focus, 'kyc_skicka');
    assert.equal(s4.tab, 'kycformular');
  });

  it('visar alla fyra steg även för enskild firma (VH ingår i steg 1)', () => {
    const summary = Kundresa.buildKundresaSummary({
      fields: {
        Namn: 'Anna Andersson',
        Orgnr: '198001011234',
        Verksamhet: 'Konsult',
        'Bolagsverket uppdaterad': '2026-09-01',
        Bolagsform: 'Enskild firma',
        'Entity screening datum': '2026-08-01'
      },
      form: Kundformular.emptyForm(),
      kyc: {}
    });
    assert.equal(summary.vhGate.relevant, false);
    assert.equal(summary.vhGate.blocked, false);
    assert.equal(summary.total, 4);
    assert.equal(summary.steps.length, 4);
    assert.deepEqual(summary.steps.map((s) => s.key), [
      'foretag_personer',
      'beskrivning_fragor',
      'redovisning_tjanster',
      'kyc_skicka'
    ]);
    assert.equal(summary.steps[0].done, true);
    assert.equal(summary.steps[1].status, 'next');
    assert.match(summary.progressLabel, /1 av 4/);
  });

  it('kräver VH med kontaktuppgifter för AB i steg 1', () => {
    assert.equal(
      Kundresa.step1Complete({
        Namn: 'Acme AB',
        Orgnr: '5566778899',
        'Bolagsverket uppdaterad': '2026-09-01',
        Bolagsform: 'Aktiebolag',
        'Entity screening datum': '2026-08-01',
        Kontaktpersoner: JSON.stringify([
          { namn: 'Anna', roller: ['Verklig huvudman'], epost: 'a@b.se' }
        ])
      }, { bolagsform: 'Aktiebolag' }),
      false
    );
    assert.equal(
      Kundresa.step1Complete({
        Namn: 'Acme AB',
        Orgnr: '5566778899',
        'Bolagsverket uppdaterad': '2026-09-01',
        Bolagsform: 'Aktiebolag',
        'Entity screening datum': '2026-08-01',
        Kontaktpersoner: JSON.stringify([
          { namn: 'Anna', roller: ['Verklig huvudman'], epost: 'a@b.se', telefon: '0701' }
        ])
      }, { bolagsform: 'Aktiebolag' }),
      true
    );
  });

  it('kräver inte VH för enskild firma i steg 1', () => {
    assert.equal(
      Kundresa.step1Complete({
        Namn: 'Anna',
        Orgnr: '198001011234',
        'Bolagsverket uppdaterad': '2026-09-01',
        Bolagsform: 'Enskild firma',
        'Entity screening datum': '2026-08-01'
      }, { bolagsform: 'Enskild firma' }),
      true
    );
  });

  it('assessStep1Substatus flaggar telefon/screening och sätter «sak kvar»-etikett', () => {
    const fields = {
      Namn: 'Paprikas Consulting AB',
      Orgnr: '559317-8402',
      'Bolagsverket uppdaterad': '2026-09-01',
      Bolagsform: 'Aktiebolag',
      Kontaktpersoner: JSON.stringify([
        { namn: 'Peter Bodor', roller: ['Verklig huvudman'], epost: 'peter@paprikas.se' }
      ])
    };
    const sub = Kundresa.assessStep1Substatus(fields, { bolagsform: 'Aktiebolag' });
    assert.equal(sub.items.find((i) => i.key === 'bolagsverket').status, 'done');
    assert.equal(sub.items.find((i) => i.key === 'personer').status, 'attention');
    assert.match(sub.items.find((i) => i.key === 'personer').detail, /Telefon/);
    assert.equal(sub.items.find((i) => i.key === 'screening').status, 'attention');
    assert.ok(sub.remaining.includes('telefon för verklig huvudman'));
    assert.ok(sub.remaining.includes('screena företaget'));
    assert.match(sub.remainingLabel, /^Kvar:/);

    const summary = Kundresa.buildKundresaSummary({
      fields,
      form: Kundformular.emptyForm(),
      kyc: {}
    });
    assert.ok(summary.step1Substatus);
    assert.match(summary.steps[0].label, /sak/);
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

  it('assessStep3Substatus listar tomma redovisningsfält och saknade tjänster', () => {
    const empty = Kundresa.assessStep3Substatus({ Bolagsform: 'Aktiebolag' });
    assert.ok(empty.remaining.includes('bank'));
    assert.ok(empty.remaining.includes('välj minst en tjänst'));
    assert.match(empty.remainingLabel, /^Kvar:/);

    const filled = Kundresa.assessStep3Substatus({
      Redovisningsmetod: 'Fakturametoden',
      Redovisningsperiod: 'Månad',
      'Räkenskapsår': 'Kalenderår',
      Bokforingsprogram: 'Fortnox',
      Bank: 'SEB',
      'Omsättning': '1–3 MSEK',
      'Kundens utvalda tjänster': ['rec1']
    });
    assert.equal(filled.remaining.length, 0);
    assert.equal(filled.remainingLabel, '');

    const summary = Kundresa.buildKundresaSummary({
      fields: { Bolagsform: 'Aktiebolag' },
      form: Kundformular.emptyForm(),
      kyc: {}
    });
    assert.ok(summary.step3Substatus);
    assert.match(summary.step3Substatus.remainingLabel, /Kvar:/);
  });

  it('steg 4 visar Skickat/Besvarat — aldrig Klart före utskick', () => {
    const pending = Kundresa.buildKundresaSummary({
      fields: {
        Namn: 'Alf Isenberg',
        Orgnr: '198001011234',
        Verksamhet: 'Konsult',
        'Bolagsverket uppdaterad': '2026-09-01',
        Bolagsform: 'Enskild firma',
        'Entity screening datum': '2026-08-01',
        Kontaktpersoner: JSON.stringify([
          { namn: 'Alf Isenberg', roller: ['Ägare EF'], epost: 'alf.isenberg@gmail.com', telefon: '0701' }
        ]),
        Redovisningsmetod: 'Faktureringsmetoden',
        Redovisningsperiod: 'Månad',
        'Kundens utvalda tjänster': ['Bokföring']
      },
      form: Kundformular.emptyForm(),
      kyc: { verksamhet: 'x', kostnader: 'y', intakterna: 'z', kapitalUrsprung: 'a', anstallda: '1', omsattning: '1', internationellHandel: 'Nej', kontanter: 'Nej', kryptovaluta: 'Nej', vh_noterat_bolag: false }
    });
    const s4p = pending.steps[3];
    assert.equal(s4p.done, false);
    assert.notEqual(s4p.label, 'Klart');
    assert.ok(pending.step4Send.canSend);
    assert.equal(pending.step4Send.defaultRecipient.epost, 'alf.isenberg@gmail.com');

    const sent = Kundresa.assessStep4KycStatus({}, { status: 'Skickat för ifyllnad', inviteSentAt: '2026-10-29T10:00:00Z', inviteToken: 'x' });
    assert.equal(sent.label, 'Skickat');
    assert.equal(sent.done, true);

    const answered = Kundresa.assessStep4KycStatus({}, { status: 'Besvarat av kund', customerAnsweredAt: '2026-11-02T10:00:00Z' });
    assert.equal(answered.label, 'Besvarat');

    const noEmail = Kundresa.assessStep4SendReadiness({
      Bolagsform: 'Enskild firma',
      Kontaktpersoner: JSON.stringify([{ namn: 'Alf', roller: ['Ägare EF'] }])
    }, { form: Kundformular.emptyForm(), bolagsform: 'Enskild firma' });
    assert.equal(noEmail.canSend, false);
    assert.ok(noEmail.blockers.some((b) => /e-post/i.test(b)));
  });

});
