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
    assert.match(Ai.TJANST_BESKRIVNING_AI_RULES, /Byrån erbjuder tjänsten Bokslut/);
    assert.match(Ai.TJANST_BESKRIVNING_AI_RULES, /Hitta INTE på bemanning/);
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const chunk = index.slice(index.indexOf("app.post('/api/ai-byra-tjanst'"));
    assert.match(chunk, /TJANST_ANALYS_AI_RULES/);
    assert.match(chunk, /TJANST_BESKRIVNING_AI_RULES/);
    assert.match(chunk, /formatUtforandeBlock/);
    assert.match(chunk, /formatExponeringBlock/);
    assert.match(chunk, /wantsClientflowStatistik/);
    assert.match(chunk, /buildByraExponering/);
    assert.match(index, /\/api\/byra\/tjanst-exponering/);
    assert.match(index, /exponering\.ok === false/);
    assert.doesNotMatch(chunk.slice(0, 8000), /Skriv INTE in byråns storlek/);
  });
});
