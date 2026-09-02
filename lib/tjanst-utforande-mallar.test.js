const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Mallar = require('../public/js/tjanst-utforande-mallar');

describe('tjanst-utforande-mallar', () => {
  it('har 15 standardtjänster med AI-frågor och gemensamma basfrågor', () => {
    assert.equal(Mallar.SERVICE_TEMPLATES.length, 15);
    assert.ok(Mallar.SERVICE_TEMPLATES.every((t) => t.aiQuestionSupport === true));
    assert.equal(Mallar.BASE_QUESTIONS.length, 7);
    assert.equal(Mallar.BASE_QUESTIONS[0].id, 'aterkommande');
    const rot = Mallar.templateById('rot-rut');
    const qs = Mallar.questionsForTemplate(rot);
    assert.ok(qs.length > Mallar.BASE_QUESTIONS.length);
    assert.ok(qs.some((q) => q.id === 'rotVad'));
  });

  it('matchar vanliga tjänstenamn till mallar', () => {
    assert.equal(Mallar.resolveTemplateId('ROT/RUT'), 'rot-rut');
    assert.equal(Mallar.resolveTemplateId('Löpande bokföring'), 'lopande-bokforing');
    assert.equal(Mallar.resolveTemplateId('Bokslut'), 'bokslut');
    assert.equal(Mallar.resolveTemplate('Moms').id, 'momsredovisning');
  });

  it('ger egna tjänster bara basfrågor plus fritext, inte tjänstespecifika frågor', () => {
    const custom = Mallar.customTemplate({ id: 'custom:abc', namn: 'Hållbarhetsrapport' });
    assert.equal(custom.aiQuestionSupport, false);
    const qs = Mallar.questionsForTemplate(custom);
    assert.ok(qs.some((q) => q.id === 'aterkommande'));
    assert.ok(qs.some((q) => q.id === 'egenBeskrivning'));
    assert.ok(!qs.some((q) => q.id === 'rotVad'));
    assert.ok(!qs.some((q) => /hot|residual|penningtvätt/i.test(q.label)));
  });

  it('formaterar svar till AI och listar obesvarade frågor', () => {
    const template = Mallar.templateById('bokslut');
    const formatted = Mallar.formatAnswersForAi(template, {
      answers: { aterkommande: 'Återkommande', bsEgenBokforing: 'Ja, huvudsakligen' },
      kommentarer: {}
    });
    assert.ok(formatted.rows.some((r) => r.id === 'aterkommande' && r.svar === 'Återkommande'));
    assert.ok(formatted.unanswered.includes('Vem lämnar eller skapar normalt det underlag som används i tjänsten?'));
  });

  it('sparar aktiv/inaktiv per mall utan att kräva analyspost', () => {
    let state = Mallar.emptyState();
    state = Mallar.upsertEntry(state, 'rot-rut', { aktiv: true, answers: { rotVad: ['Skickar in ansökan'] } });
    const cards = Mallar.listCatalogCards(state);
    const rot = cards.find((c) => c.template.id === 'rot-rut');
    assert.equal(rot.entry.aktiv, true);
    assert.deepEqual(rot.entry.answers.rotVad, ['Skickar in ansökan']);
    assert.ok(cards.some((c) => c.template.id === 'bokslut' && c.entry.aktiv === false));
  });

  it('sidan visar katalog, hjälptext och inte AML-teorifrågor till byrån', () => {
    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    assert.match(html, /tjanst-utforande-katalog/);
    assert.match(html, /Du behöver inte själv bedöma penningtvättsrisken/);
    assert.match(html, /tjanst-utforande-mallar\.js/);
    assert.match(html, /Lägg till egen tjänst/);
    assert.doesNotMatch(html, /Vilka hot finns mot tjänsten/);
    assert.doesNotMatch(html, /Vad är residualrisken/);
  });
});
