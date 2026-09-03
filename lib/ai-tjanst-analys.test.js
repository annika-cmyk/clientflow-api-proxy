const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ai = require('./ai-tjanst-analys');
const Mallar = require('../public/js/tjanst-utforande-mallar');

describe('ai-tjanst-analys', () => {
  it('skiljer bekräftade byråfakta från saknad information', () => {
    const facts = Ai.knownByraFacts({
      antalAnstallda: 1,
      antalKunder: '',
      lopandeUtbildning: 'Ja'
    });
    assert.ok(facts.known.some((r) => r.key === 'antalAnstallda' && String(r.value) === '1'));
    assert.ok(facts.missing.includes('Antal kunder'));
    const block = Ai.formatByraFactsBlock({ antalAnstallda: 1 });
    assert.match(block, /Antal anställda: 1/);
    assert.match(block, /SAKNADE BYRÅUPPGIFTER/);
    assert.doesNotMatch(block, /hitta på/);
  });

  it('skriver uppgift saknas när utförande inte är ifyllt', () => {
    const empty = Ai.formatUtforandeBlock('Bokslut', Mallar.emptyState());
    assert.match(empty, /uppgift saknas|Inga utförandefrågor/i);
    const filled = Ai.formatUtforandeBlock('Bokslut', Mallar.upsertEntry(Mallar.emptyState(), 'bokslut', {
      aktiv: true,
      answers: { bsLopandeBokforing: ['Byrån'] }
    }));
    assert.match(filled, /Byrån/);
    assert.match(filled, /OBESVARADE UTFÖRANDEFRÅGOR/);
  });

  it('använder byråuppgifter när Clientflow-statistik inte är vald', () => {
    const expo = Ai.buildByraExponering({ answers: { antalKunderTjanst: '12' } }, { antalKunder: 40 });
    assert.equal(expo.kalla, 'byra');
    assert.equal(expo.antal_kunder, 12);
    const block = Ai.formatExponeringBlock(expo);
    assert.match(block, /ej hämtad från Clientflow/);
    assert.match(block, /40/);
    assert.match(block, /12/);
    assert.doesNotMatch(block, /systemhämtad/);
  });

  it('märker exponering utan kunddata som saknad, inte som nollkunder', () => {
    const block = Ai.formatExponeringBlock(null);
    assert.match(block, /uppgift saknas/);
    assert.doesNotMatch(block, /Antal kunder med tjänsten: 0/);
    const failed = Ai.formatExponeringBlock({
      ok: false,
      fel: 'Kunde inte läsa kunddata för er byrå.',
      antal_kunder: null,
      saknade: ['kunddata kunde inte hämtas']
    });
    assert.match(failed, /Kunde inte läsa kunddata/);
    assert.doesNotMatch(failed, /Antal kunder med tjänsten: 0/);
  });

  it('normaliserar evidens och åtgärdsstatus', () => {
    assert.equal(Ai.normalizeEvidens('bekräftad'), 'bekraftad');
    assert.equal(Ai.normalizeEvidens('A'), 'bekraftad');
    assert.equal(Ai.normalizeEvidens('generell'), 'tjanstetypisk');
    assert.equal(Ai.normalizeEvidens('uppgift saknas'), 'saknas');
    assert.equal(Ai.normalizeAtgardStatus('befintlig'), 'befintlig');
    assert.equal(Ai.normalizeAtgardStatus('rekommendation'), 'foreslagen');
    assert.match(Ai.evidensLabel('bekraftad'), /Bekräftad/);
  });

  it('AI-tjänstprompten förbjuder påhittade byråfakta och tillåter bekräftad tjänstebeskrivning', () => {
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /får inte hitta på/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /uppgift saknas/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /bekraftad/);
    assert.match(Ai.TJANST_BESKRIVNING_AI_RULES, /endast beskriva tjänstens omfattning/);
    assert.match(Ai.TJANST_BESKRIVNING_AI_RULES, /2–4 korta stycken/);
    assert.match(Ai.TJANST_BESKRIVNING_AI_RULES, /tjänsten är typiskt relevant för exempelvis/);
    assert.match(Ai.HOT_MODUS_AI_RULES, /kan utnyttjas/);
    assert.match(Ai.HOT_MODUS_AI_RULES, /2–4 meningar/);
    assert.match(Ai.HOT_MODUS_AI_RULES, /ROT-\/RUT-ansökningar/);
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const chunk = index.slice(index.indexOf("app.post('/api/ai-byra-tjanst'"));
    assert.match(chunk, /TJANST_ANALYS_AI_RULES/);
    assert.match(chunk, /TJANST_BESKRIVNING_AI_RULES/);
    assert.match(chunk, /HOT_MODUS_AI_RULES/);
    assert.match(chunk, /2-4 korta stycken/);
    assert.match(chunk, /formatUtforandeBlock/);
    assert.match(chunk, /formatExponeringBlock/);
    assert.match(chunk, /formatRiskreglerBlock/);
    assert.match(chunk, /applyRiskFloor/);
    assert.match(chunk, /wantsClientflowStatistik/);
    assert.match(chunk, /buildByraExponering/);
    assert.match(index, /\/api\/byra\/tjanst-exponering/);
    assert.doesNotMatch(chunk.slice(0, 8000), /Skriv INTE in byråns storlek/);
    assert.doesNotMatch(chunk, /Föredra ett konkret TF-hot när tjänsten kan användas för att flytta/);
    assert.match(chunk, /TF får inte vara spekulativt huvudhot/);
  });

  it('tvingar AML-fokus, reaktiv komplettering och residualgolv i prompten', () => {
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /AML-perspektiv/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /kvalitets-, skatte- eller affärsrisk/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /kunden får komplettera/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /reaktiv/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /inte sättas till låg bara för att någon åtgärd finns/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /rättsliga åtgärder från Skatteverket/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /osanna fakturor/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /spekulativa terrorismfinansieringsscenarier/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /ROT\/RUT-ADMINISTRATION/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /Residualrisken bedöms som normal, inte låg/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /minst ett TF- eller Båda-hot, eller en kort tfMotivering/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /FÄLTPLACERING/);
    assert.match(Ai.TJANST_ANALYS_AI_RULES, /endast beskriva tjänstens omfattning|får bara beskriva tjänstens omfattning/);
  });

  it('styr tjänstebeskrivning och hot\/modus till konkret AML-text', () => {
    assert.match(Ai.TJANST_BESKRIVNING_AI_RULES, /Sårbarheter/);
    assert.match(Ai.TJANST_BESKRIVNING_AI_RULES, /Riskreducerande åtgärder/);
    assert.match(Ai.TJANST_BESKRIVNING_AI_RULES, /påhittade kundtyper/);
    assert.doesNotMatch(Ai.TJANST_BESKRIVNING_AI_RULES, /Byrån erbjuder tjänsten Bokslut till 37 kunder/);
    assert.match(Ai.HOT_MODUS_AI_RULES, /ge legitimitet/);
    assert.match(Ai.HOT_MODUS_AI_RULES, /kapitaltillskott utan underlag/);
    assert.match(Ai.HOT_MODUS_AI_RULES, /felaktig fördelning mellan arbetskostnad och material/);
    assert.match(Ai.HOT_MODUS_AI_RULES, /inga dramatiska påståenden/);
    assert.match(Ai.formatByraFactsBlock({ antalAnstallda: 1 }), /fältet Tjänsten/);
  });

  it('sätter residualgolv Normal för ROT\/RUT med ansökan, betalning och utan rimlighet', () => {
    const state = Mallar.upsertEntry(Mallar.emptyState(), 'rot-rut', {
      aktiv: true,
      answers: {
        rotHjalper: 'I vissa uppdrag',
        rotUppgifter: ['Ansökan till Skatteverket', 'Betalningsuppgifter', 'Fakturaunderlag'],
        rotRimlighet: 'Nej, normalt inte',
        rotOklar: ['Kunden får komplettera']
      }
    });
    const signals = Ai.analyzeUtforandeSignals('ROT-/RUT-administration', state);
    assert.equal(signals.isRotRut, true);
    assert.equal(signals.handlesApplication, true);
    assert.equal(signals.handlesPayment, true);
    assert.equal(signals.noReasonableness, true);
    assert.equal(signals.hasPreventive, false);
    assert.equal(signals.customerSupplement, true);
    assert.equal(signals.inherentFloor, 'Normal');
    assert.equal(signals.residualFloor, 'Normal');
    const block = Ai.formatRiskreglerBlock(signals);
    assert.match(block, /TJÄNSTENS RISKREGLER/);
    assert.match(block, /reaktiv/);
    assert.match(block, /inte sättas till Låg/);
    assert.match(block, /Inte spekulativ terrorismfinansiering/);

    const RiskSkala = require('../public/js/risk-skala');
    const low = RiskSkala.assessRisk(2, 2);
    assert.equal(low.level, 'Låg');
    const floored = Ai.applyRiskFloor(low, signals.residualFloor);
    assert.equal(floored.floored, true);
    assert.equal(floored.level, 'Normal');
    assert.ok(floored.product >= 5);
    const kept = Ai.applyRiskFloor(RiskSkala.assessRisk(3, 3), 'Normal');
    assert.equal(kept.floored, false);
    assert.equal(kept.level, 'Normal');
    const mot = Ai.ensureResidualMotivering('', signals, true);
    assert.match(mot, /reaktiv/);
    assert.match(mot, /rimlighet/);
  });

  it('sänker inte residual när ROT\/RUT bara är enklare uppgifter eller har rimlighetskontroll', () => {
    const simple = Mallar.upsertEntry(Mallar.emptyState(), 'rot-rut', {
      aktiv: true,
      answers: {
        rotHjalper: 'Ja',
        rotUppgifter: ['Kundens personuppgifter', 'Fastighets-/bostadsuppgifter'],
        rotRimlighet: 'Nej, normalt inte',
        rotOklar: ['Kunden får komplettera']
      }
    });
    const simpleSignals = Ai.analyzeUtforandeSignals('ROT-/RUT-administration', simple);
    assert.equal(simpleSignals.simpleOnly, true);
    assert.equal(simpleSignals.residualFloor, '');
    assert.equal(simpleSignals.inherentFloor, '');
    assert.match(Ai.formatRiskreglerBlock(simpleSignals), /Lägre exponering/);

    const checked = Mallar.upsertEntry(Mallar.emptyState(), 'rot-rut', {
      aktiv: true,
      answers: {
        rotHjalper: 'Ja',
        rotUppgifter: ['Ansökan till Skatteverket', 'Betalningsuppgifter'],
        rotRimlighet: 'Ja, normalt',
        rotOklar: ['Byrån gör rimlighetsbedömning', 'Kunden får komplettera']
      }
    });
    const checkedSignals = Ai.analyzeUtforandeSignals('ROT-/RUT-administration', checked);
    assert.equal(checkedSignals.hasPreventive, true);
    assert.equal(checkedSignals.residualFloor, '');
    assert.equal(checkedSignals.inherentFloor, 'Normal');
  });
});
