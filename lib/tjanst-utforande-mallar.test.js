const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Mallar = require('../public/js/tjanst-utforande-mallar');

describe('tjanst-utforande-mallar', () => {
  it('har 15 standardtjänster med korta AML-frågor utan gemensamma basfrågor', () => {
    assert.equal(Mallar.SERVICE_TEMPLATES.length, 15);
    assert.ok(Mallar.SERVICE_TEMPLATES.every((t) => t.aiQuestionSupport === true));
    assert.ok(Mallar.SERVICE_TEMPLATES.every((t) => t.replaceBaseQuestions === true));
    assert.equal(Mallar.BASE_QUESTIONS.length, 7);
    assert.equal(Mallar.BASE_QUESTIONS[0].id, 'aterkommande');
    Mallar.SERVICE_TEMPLATES.forEach((t) => {
      const qs = Mallar.questionsForTemplate(t);
      const serviceQs = qs.filter((q) => q.id !== 'hamtaClientflowStatistik' && q.id !== 'antalKunderTjanst');
      assert.ok(qs[0].id === 'hamtaClientflowStatistik', t.id);
      assert.ok(serviceQs.length >= 4 && serviceQs.length <= 8, t.id);
      assert.ok(serviceQs.every((q) => q.type === 'multi' || q.type === 'single'));
      assert.ok(!qs.some((q) => q.id === 'aterkommande'));
      assert.ok(!serviceQs.some((q) => /varierar mellan kunder/i.test((q.options || []).join(' '))));
    });
    const rot = Mallar.templateById('rot-rut');
    assert.ok(Mallar.questionsForTemplate(rot).some((q) => q.id === 'rotHjalper'));
  });

  it('matchar vanliga tjänstenamn till mallar', () => {
    assert.equal(Mallar.resolveTemplateId('ROT/RUT'), 'rot-rut');
    assert.equal(Mallar.resolveTemplateId('Löpande bokföring'), 'lopande-bokforing');
    assert.equal(Mallar.resolveTemplateId('Bokslut'), 'bokslut');
    assert.equal(Mallar.resolveTemplate('Moms').id, 'momsredovisning');
    assert.equal(Mallar.tjanstNamesMatch('Bokföring', 'Löpande bokföring'), true);
    assert.equal(Mallar.tjanstNamesMatch('ROT/RUT', 'ROT-/RUT-administration'), true);
    assert.equal(Mallar.tjanstNamesMatch('Moms', 'Momsredovisning'), true);
    assert.equal(Mallar.tjanstNamesMatch('Bokslut', 'Löpande bokföring'), false);
    assert.equal(Mallar.tjanstNamesMatch('Hållbarhetsrapport', 'Bokföring'), false);
  });

  it('ger egna tjänster bara basfrågor plus fritext, inte tjänstespecifika frågor', () => {
    const custom = Mallar.customTemplate({ id: 'custom:abc', namn: 'Hållbarhetsrapport' });
    assert.equal(custom.aiQuestionSupport, false);
    const qs = Mallar.questionsForTemplate(custom);
    assert.ok(qs.some((q) => q.id === 'hamtaClientflowStatistik'));
    assert.ok(qs.some((q) => q.id === 'aterkommande'));
    assert.ok(qs.some((q) => q.id === 'egenBeskrivning'));
    assert.ok(!qs.some((q) => q.id === 'rotHjalper'));
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
    assert.equal(qs.length, 10);
    assert.deepEqual(qs.map((q) => q.id), [
      'hamtaClientflowStatistik',
      'antalKunderTjanst',
      'bsLopandeBokforing',
      'bsAndraTjanster',
      'underlagKanal',
      'bsKunduppgifter',
      'bsBokningar',
      'bsJusteringar',
      'bsOverifierat',
      'bsAgarlan'
    ]);
    assert.ok(qs.slice(2).every((q) => q.type === 'multi' || q.type === 'single'));
    assert.ok(!qs.some((q) => q.id === 'aterkommande' || q.id === 'bsEgenBokforing'));
    const grouped = Mallar.groupQuestionsForTemplate(template);
    assert.equal(grouped.stats.length, 2);
    assert.equal(grouped.base.length, 8);
    assert.equal(grouped.extra.length, 0);
    assert.equal(qs[2].label, 'Vem har normalt skött den löpande bokföringen som bokslutet bygger på?');
    assert.ok(qs[4].options.includes('Möte/telefon/chatt'));
    assert.ok(!qs[4].options.includes('Varierar mellan kunder'));
  });

  it('sparar aktiv/inaktiv per mall utan att kräva analyspost', () => {
    let state = Mallar.emptyState();
    state = Mallar.upsertEntry(state, 'rot-rut', { aktiv: true, answers: { rotHjalper: 'Ja', rotUppgifter: ['Ansökan till Skatteverket'] } });
    const cards = Mallar.listCatalogCards(state);
    const rot = cards.find((c) => c.template.id === 'rot-rut');
    assert.equal(rot.entry.aktiv, true);
    assert.deepEqual(rot.entry.answers.rotUppgifter, ['Ansökan till Skatteverket']);
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

  it('kortet öppnar riskbedömning med utförandefrågor i modalens översikt', () => {
    const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(html, /tjanst-modal-utforande/);
    assert.match(js, /renderModalUtforande/);
    assert.match(js, /findUtforandeMallIdForNamn/);
    assert.match(js, /buildTjanstRiskSections/);
    assert.match(js, /Redigera riskbedömning/);
    assert.match(js, /Låt AI skapa ett utkast/);
    assert.match(js, /Redigera manuellt/);
    assert.match(js, /tjanst-mall-chip/);
    assert.match(js, /Så här görs tjänsten/);
    assert.match(js, /Kundunderlag/);
    assert.match(js, /hamtaClientflowStatistik/);
    assert.match(js, /tjanst-mall-stats/);
    assert.match(js, /tjanst-exponering/);
    assert.match(js, /tjanst-mall-stats-error/);
    assert.match(js, /findTjanstRisksByName/);
    assert.match(js, /expo\.ok === false/);
    assert.doesNotMatch(js, /data-utforande-view="fragor"/);
    assert.doesNotMatch(js, /<select class="dyn-typ"/);
    assert.doesNotMatch(js, /<select class="dyn-kategori"/);
    assert.doesNotMatch(js, /<select class="dyn-evidens"/);
    assert.match(css, /tjanst-mall-stats-error/);
    assert.match(css, /tjanst-mall-chip\.is-selected/);
    assert.match(css, /tjanst-mall-stat-grid/);
    assert.match(css, /tjanst-modal-utforande/);
    assert.match(css, /data-panel="analys"] \.risk-content-section \{\s*margin:\s*0;\s*padding:\s*1\.85rem 0 1\.9rem/);
    assert.doesNotMatch(css, /\.tjanst-mall-card\.is-inactive \.tjanst-mall-body \{\s*display:\s*none/);
    assert.doesNotMatch(css, /\.tjanst-mall-card:not\(\.is-view-fragor\):not\(\.is-view-analys\) \.tjanst-mall-body \{\s*display:\s*none/);
  });

  it('visar ROT-följdfrågor bara när tjänsten utförs', () => {
    const rot = Mallar.templateById('rot-rut');
    const grouped = Mallar.groupQuestionsForTemplate(rot);
    assert.equal(grouped.base.length, 4);
    assert.equal(grouped.extra.length, 0);
    const followUp = rot.questions.find((q) => q.id === 'rotUppgifter');
    assert.equal(Mallar.questionIsVisible(followUp, {}), false);
    assert.equal(Mallar.questionIsVisible(followUp, { rotHjalper: 'Nej' }), false);
    assert.equal(Mallar.questionIsVisible(followUp, { rotHjalper: 'Ja' }), true);
    const hidden = Mallar.formatAnswersForAi(rot, { answers: { rotHjalper: 'Nej', hamtaClientflowStatistik: 'Ja' }, kommentarer: {} });
    assert.equal(hidden.rows.length, 2);
    assert.ok(!hidden.unanswered.includes('Vilka uppgifter hanterar byrån normalt inom ROT/RUT?'));
    const open = Mallar.formatAnswersForAi(rot, { answers: { rotHjalper: 'Ja', hamtaClientflowStatistik: 'Ja' }, kommentarer: {} });
    assert.ok(open.unanswered.includes('Vilka uppgifter hanterar byrån normalt inom ROT/RUT?'));
  });

  it('visar uppskattat kundantal bara när Clientflow-statistik inte hämtas', () => {
    const antal = Mallar.STATISTIK_QUESTIONS.find((q) => q.id === 'antalKunderTjanst');
    assert.equal(Mallar.questionIsVisible(antal, {}), false);
    assert.equal(Mallar.questionIsVisible(antal, { hamtaClientflowStatistik: 'Ja' }), false);
    assert.equal(Mallar.questionIsVisible(antal, { hamtaClientflowStatistik: 'Nej' }), true);
    assert.equal(Mallar.wantsClientflowStatistik({ answers: { hamtaClientflowStatistik: 'Ja' } }), true);
    assert.equal(Mallar.wantsClientflowStatistik({ answers: { hamtaClientflowStatistik: 'Nej' } }), false);
    assert.equal(Mallar.wantsClientflowStatistik({ answers: {} }), false);
  });
});
