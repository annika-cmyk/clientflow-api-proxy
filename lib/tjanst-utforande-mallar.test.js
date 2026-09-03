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
      answers: { bsLopandeBokforing: ['Byrån'] },
      kommentarer: {}
    });
    assert.ok(formatted.rows.some((r) => r.id === 'bsLopandeBokforing' && r.svar === 'Byrån'));
    assert.ok(formatted.unanswered.includes('Hur får byrån normalt tillgång till information inför bokslut?'));
    assert.ok(!formatted.unanswered.includes('Vem lämnar eller skapar normalt det underlag som används i tjänsten?'));
    assert.ok(!formatted.rows.some((r) => r.id === 'aterkommande'));
  });

  it('ersätter basfrågorna för Bokslut med åtta tjänstespecifika utförandefrågor', () => {
    const template = Mallar.templateById('bokslut');
    assert.equal(template.replaceBaseQuestions, true);
    const qs = Mallar.questionsForTemplate(template);
    assert.equal(qs.length, 8);
    assert.deepEqual(qs.map((q) => q.id), [
      'bsLopandeBokforing',
      'bsAndraTjanster',
      'underlagKanal',
      'bsKunduppgifter',
      'bsBokningar',
      'bsJusteringar',
      'bsOverifierat',
      'bsAgarlan'
    ]);
    assert.ok(qs.every((q) => q.type === 'multi' || q.type === 'single'));
    assert.ok(!qs.some((q) => q.id === 'aterkommande' || q.id === 'bsEgenBokforing'));
    const grouped = Mallar.groupQuestionsForTemplate(template);
    assert.equal(grouped.base.length, 8);
    assert.equal(grouped.extra.length, 0);
    assert.equal(qs[0].label, 'Vem har normalt skött den löpande bokföringen som bokslutet bygger på?');
    assert.ok(qs[2].options.includes('Möte/telefon/chatt'));
    assert.ok(!qs[2].options.includes('Varierar mellan kunder'));
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

  it('sidan visar katalog och inte AML-teorifrågor till byrån', () => {
    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    assert.match(html, /tjanst-utforande-katalog/);
    assert.match(html, /Vilka tjänster erbjuder ni/);
    assert.match(html, /tjanst-utforande-mallar\.js/);
    assert.match(html, /Lägg till egen tjänst/);
    assert.doesNotMatch(html, /Aktivera de tjänster ni erbjuder/);
    assert.doesNotMatch(html, /Ni behöver inte själva bedöma penningtvättsrisken/);
    assert.doesNotMatch(html, /Vilka hot finns mot tjänsten/);
    assert.doesNotMatch(html, /Vad är residualrisken/);
    assert.match(html, /risk-assessment-section" hidden/);
  });

  it('kortet växlar mellan utförandefrågor och riskbedömning', () => {
    const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(js, /data-utforande-view="fragor"/);
    assert.match(js, /data-utforande-view="analys"/);
    assert.match(js, /buildTjanstRiskSections/);
    assert.match(js, /Redigera riskbedömning/);
    assert.match(js, /Låt AI skapa ett utkast/);
    assert.match(js, /Hantera manuellt/);
    assert.match(js, /tjanst-mall-chip/);
    assert.match(js, /Så här görs tjänsten/);
    assert.match(css, /is-view-fragor/);
    assert.match(css, /is-view-analys/);
    assert.match(css, /tjanst-mall-chip\.is-selected/);
    assert.doesNotMatch(css, /\.tjanst-mall-card\.is-inactive \.tjanst-mall-body \{\s*display:\s*none/);
  });

  it('delar frågorna i bas och tjänstespecifikt', () => {
    const rot = Mallar.groupQuestionsForTemplate(Mallar.templateById('rot-rut'));
    assert.equal(rot.base.length, Mallar.BASE_QUESTIONS.length);
    assert.ok(rot.extra.some((q) => q.id === 'rotVad'));
    assert.ok(!rot.extra.some((q) => q.id === 'aterkommande'));
  });
});
