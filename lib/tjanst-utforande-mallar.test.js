const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Mallar = require('../public/js/tjanst-utforande-mallar');

function renderUtforandeCardHtml(existing, opts = {}) {
  const js = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
  const RiskSkala = require('../public/js/risk-skala');
  const match = js.match(/renderUtforandeCard\(template, entry\) \{([\s\S]*?)\n    \}/);
  assert.ok(match, 'hittar renderUtforandeCard');
  const fn = new Function('template', 'entry', match[1]);
  const template = opts.template || { id: 'bokslut', name: 'Bokslut', description: 'Årsbokslut' };
  const entry = opts.entry || { aktiv: true, namn: template.name };
  const ctx = {
    esc(value) { return String(value ?? ''); },
    findTjanstRiskByName() { return existing; },
    utforandeServiceIcon() { return 'fa-scale-balanced'; },
    kundCountForUtforandeTjanst() { return opts.kundCount || 0; },
    renderKundCountBadge(n) { return `<span class="risk-kund-count">${n} kunder</span>`; },
    getRiskLevelClass(level) {
      return (RiskSkala && RiskSkala.riskItemClass(level)) || 'risk-normal';
    },
    formatCatalogRiskBadge(label) {
      return String(label || '')
        .replace(/\(S\s*[×xX]\s*K\s+(\d+)\)/g, '($1)')
        .replace(/:\s*([^\s(]+)/, (_, level) => ': ' + String(level).toLocaleLowerCase('sv-SE'));
    },
    renderUtforandeOverview() { return '<div class="tjanst-mall-summary">översikt</div>'; }
  };
  if (opts.useRealRiskMeta) {
    const metaMatch = js.match(/renderUtforandeRiskMeta\(risk\) \{([\s\S]*?)\n    \}/);
    assert.ok(metaMatch, 'hittar renderUtforandeRiskMeta');
    const metaFn = new Function('risk', metaMatch[1]);
    ctx.renderUtforandeRiskMeta = function (risk) {
      return metaFn.call(this, risk);
    };
  } else {
    ctx.renderUtforandeRiskMeta = () => '<span class="tjanst-mall-status">AML-analys finns</span>';
  }
  const prev = global.window;
  global.window = { RiskSkala };
  try {
    return fn.call(ctx, template, entry);
  } finally {
    if (prev === undefined) delete global.window;
    else global.window = prev;
  }
}

describe('tjanst-utforande-mallar', () => {
  it('har 16 standardtjänster med korta AML-frågor utan gemensamma basfrågor', () => {
    assert.equal(Mallar.SERVICE_TEMPLATES.length, 17);
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
    assert.equal(Mallar.resolveTemplateId('Kapitalvinstberäkningar'), 'kapitalvinstberakningar');
    assert.equal(Mallar.resolveTemplateId('Kapitalvinst'), 'kapitalvinstberakningar');
    assert.equal(Mallar.tjanstNamesMatch('Bokföring', 'Löpande bokföring'), true);
    assert.equal(Mallar.tjanstNamesMatch('ROT/RUT', 'ROT-/RUT-administration'), true);
    assert.equal(Mallar.tjanstNamesMatch('Moms', 'Momsredovisning'), true);
    assert.equal(Mallar.tjanstNamesMatch('Bokslut', 'Löpande bokföring'), false);
    assert.equal(Mallar.tjanstNamesMatch('Hållbarhetsrapport', 'Bokföring'), false);
  });

  it('har AML-utförandefrågor för Kapitalvinstberäkningar', () => {
    const template = Mallar.templateById('kapitalvinstberakningar');
    assert.ok(template);
    assert.equal(template.name, 'Kapitalvinstberäkningar');
    const qs = Mallar.questionsForTemplate(template);
    assert.deepEqual(qs.filter((q) => !['hamtaClientflowStatistik', 'antalKunderTjanst'].includes(q.id)).map((q) => q.id), [
      'kvBeraknar',
      'kvTillgangar',
      'kvUnderlag',
      'kvKontroll',
      'kvUtland',
      'kvNarstaende',
      'kvOklar'
    ]);
    const followUp = template.questions.find((q) => q.id === 'kvTillgangar');
    assert.equal(Mallar.questionIsVisible(followUp, {}), false);
    assert.equal(Mallar.questionIsVisible(followUp, { kvBeraknar: 'Nej' }), false);
    assert.equal(Mallar.questionIsVisible(followUp, { kvBeraknar: 'Ja' }), true);
    assert.ok(followUp.options.includes('Kryptovaluta eller andra digitala tillgångar'));
    const oklar = template.questions.find((q) => q.id === 'kvOklar');
    assert.ok(oklar.options.includes('Kunden får komplettera i efterhand'));
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

  it('removeEntry tar bort egna och standardtjänster från katalogen', () => {
    let state = Mallar.emptyState();
    const added = Mallar.addCustomService(state, 'ffff');
    state = added.state;
    state = Mallar.upsertEntry(state, 'bokslut', { aktiv: true });
    const afterCustom = Mallar.removeEntry(state, added.id);
    assert.equal(Object.prototype.hasOwnProperty.call(afterCustom.tjanster, added.id), false);
    assert.ok(afterCustom.tjanster.bokslut);
    const afterMall = Mallar.removeEntry(afterCustom, 'bokslut');
    assert.equal(Object.prototype.hasOwnProperty.call(afterMall.tjanster, 'bokslut'), false);
    assert.ok(afterMall.excludedMallIds.includes('bokslut'));
    const cards = Mallar.listCatalogCards(afterMall);
    assert.ok(!cards.some((c) => c.template.id === added.id));
    assert.ok(!cards.some((c) => c.template.id === 'bokslut'));
    const restored = Mallar.addStandardService(afterMall, 'bokslut');
    assert.ok(Mallar.listCatalogCards(restored).some((c) => c.template.id === 'bokslut'));
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
    assert.ok(qs[4].options.includes('Uppladdning i kundmapp (utan BankID-inlogg)'));
    assert.ok(!qs[4].options.includes('Varierar mellan kunder'));

    const bokforing = Mallar.templateById('lopande-bokforing');
    const bokforingQs = Mallar.questionsForTemplate(bokforing);
    const materialKanal = bokforingQs.find((q) => q.id === 'underlagKanal');
    assert.equal(materialKanal.label, 'Hur får byrån normalt materialet?');
    assert.ok(materialKanal.options.includes('Uppladdning i kundmapp (utan BankID-inlogg)'));

    const baseKanal = Mallar.BASE_QUESTIONS.find((q) => q.id === 'underlagKanal');
    assert.ok(baseKanal.options.includes('Uppladdning i kundmapp (utan BankID-inlogg)'));
  });

  it('årsredovisning har fem utförandefrågor utan bank/investerare-frågan', () => {
    const template = Mallar.templateById('arsredovisning');
    const qs = Mallar.questionsForTemplate(template);
    const serviceQs = qs.filter((q) => q.id !== 'hamtaClientflowStatistik' && q.id !== 'antalKunderTjanst');
    assert.equal(serviceQs.length, 5);
    assert.deepEqual(serviceQs.map((q) => q.id), [
      'arUpprattar',
      'arInlamning',
      'arEgetBokslut',
      'arAvvikande',
      'arNarstaende'
    ]);
    assert.ok(!qs.some((q) => q.id === 'arExternPart'));
    assert.ok(!qs.some((q) => /bank, investerare|annan extern part/i.test(q.label || '')));
  });

  it('betalningsuppdrag frågar om klientmedelskonto tidigt i utförandemallen', () => {
    const template = Mallar.templateById('betalningsuppdrag');
    assert.ok(template);
    const qs = Mallar.questionsForTemplate(template);
    const serviceQs = qs.filter((q) => q.id !== 'hamtaClientflowStatistik' && q.id !== 'antalKunderTjanst');
    assert.equal(serviceQs[0].id, 'betKlientmedelskonto');
    assert.equal(serviceQs[0].label, 'Har byrån klientmedelskonto?');
    assert.equal(serviceQs[0].type, 'single');
    assert.deepEqual(serviceQs[0].options, ['Ja', 'Nej']);
    assert.ok(!serviceQs[0].showWhen);
    assert.ok(!serviceQs.some((q) => q.id === 'betUtfor'));
    assert.ok(!serviceQs.some((q) => /Utför byrån betalningar/i.test(q.label || '')));
    assert.deepEqual(serviceQs.map((q) => q.id), [
      'betKlientmedelskonto',
      'betVad',
      'betGodkannande',
      'betNya',
      'betSarskild',
      'betOklar'
    ]);
    assert.ok(serviceQs.every((q) => !q.showWhen));
    const grouped = Mallar.groupQuestionsForTemplate(template);
    assert.equal(grouped.base[0].id, 'betKlientmedelskonto');
    const formatted = Mallar.formatAnswersForAi(template, {
      answers: { betKlientmedelskonto: 'Ja', betUtfor: 'Nej', betVad: ['Löner'] },
      kommentarer: {}
    });
    assert.ok(formatted.rows.some((r) => r.id === 'betKlientmedelskonto' && r.svar === 'Ja'));
    assert.ok(formatted.rows.some((r) => r.id === 'betVad'));
    assert.ok(!formatted.rows.some((r) => r.id === 'betUtfor'));
  });

  it('läser klientmedelskonto-svar från utförande (föredrar betalningsuppdrag)', () => {
    assert.equal(Mallar.resolveKlientmedelskontoAnswer({
      tjanster: { betalningsuppdrag: { answers: { betKlientmedelskonto: 'Nej' } } }
    }), 'Nej');
    assert.equal(Mallar.hasKlientmedelskonto({
      tjanster: { betalningsuppdrag: { answers: { betKlientmedelskonto: 'Nej' } } }
    }), false);
    assert.equal(Mallar.hasKlientmedelskonto({
      tjanster: { betalningsuppdrag: { answers: { betKlientmedelskonto: 'Ja' } } }
    }), true);
    assert.equal(Mallar.hasKlientmedelskonto({ tjanster: {} }), null);
  });

  it('hittar aktiv betalningsuppdrag-tjänst', () => {
    let state = Mallar.emptyState();
    state = Mallar.applyStandardKatalog(state);
    state = Mallar.upsertEntry(state, 'betalningsuppdrag', { aktiv: false });
    assert.equal(Mallar.findActiveBetalningsuppdrag(state).active, false);
    state = Mallar.upsertEntry(state, 'betalningsuppdrag', { aktiv: true });
    const hit = Mallar.findActiveBetalningsuppdrag(state);
    assert.equal(hit.active, true);
    assert.equal(hit.mallId, 'betalningsuppdrag');
    assert.match(hit.name, /Betalningsuppdrag/);
  });

  it('sparar aktiv/inaktiv per mall utan att kräva analyspost', () => {
    let state = Mallar.emptyState();
    state = Mallar.applyStandardKatalog(state);
    state = Mallar.upsertEntry(state, 'rot-rut', { aktiv: true, answers: { rotHjalper: 'Ja', rotUppgifter: ['Ansökan till Skatteverket'] } });
    const cards = Mallar.listCatalogCards(state);
    const rot = cards.find((c) => c.template.id === 'rot-rut');
    assert.equal(rot.entry.aktiv, true);
    assert.deepEqual(rot.entry.answers.rotUppgifter, ['Ansökan till Skatteverket']);
    assert.ok(cards.some((c) => c.template.id === 'bokslut' && c.entry.aktiv === true));
  });

  it('första besök: val mellan standardtjänster och egna', () => {
    const empty = Mallar.emptyState();
    assert.equal(Mallar.needsKatalogChoice(empty), true);
    assert.equal(Mallar.listCatalogCards(empty).length, 0);

    const standard = Mallar.applyStandardKatalog(empty);
    assert.equal(standard.katalogVal, 'standard');
    assert.equal(Mallar.needsKatalogChoice(standard), false);
    const standardCards = Mallar.listCatalogCards(standard);
    assert.ok(standardCards.length >= Mallar.SERVICE_TEMPLATES.length);
    assert.ok(standardCards.every((c) => !Mallar.isCustomId(c.template.id) ? c.entry.aktiv === true : true));
    assert.ok(standardCards.filter((c) => !Mallar.isCustomId(c.template.id)).every((c) => c.entry.aktiv === true));

    const egna = Mallar.applyEgnaKatalog(Mallar.emptyState());
    assert.equal(egna.katalogVal, 'egna');
    assert.equal(Mallar.needsKatalogChoice(egna), false);
    assert.equal(Mallar.listCatalogCards(egna).length, 0);

    const withCustom = Mallar.addCustomService(egna, 'Min tjänst');
    assert.equal(withCustom.state.katalogVal, 'egna');
    assert.equal(Mallar.listCatalogCards(withCustom.state).length, 1);
    assert.ok(Mallar.isCustomId(withCustom.id));

    // Egna + en tillagd standard visar bara den tillagda, inte hela listan
    const withOneStandard = Mallar.addStandardService(withCustom.state, 'bokslut');
    const mixed = Mallar.listCatalogCards(withOneStandard);
    assert.equal(mixed.filter((c) => !Mallar.isCustomId(c.template.id)).length, 1);
    assert.ok(mixed.some((c) => c.template.id === 'bokslut'));
  });

  it('sidan visar katalogval och Klarmarkera-stöd i enkäten', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    assert.match(js, /needsKatalogChoice/);
    assert.match(js, /Använd standardtjänster/);
    assert.match(js, /Lägg till egna tjänster/);
    assert.match(js, /applyStandardKatalog|applyEgnaKatalog/);
    assert.match(js, /setUtforandeKatalogFooterVisible/);
    assert.match(js, /addStandardUtforandeTjanst/);
    assert.match(js, /addCustomUtforandeTjanst/);
    assert.match(js, /tjanst-add-standard|tjanst-katalog-footer/);
    assert.match(js, /data-toggle-overview|Visa översikt/);
    assert.match(js, /deleteUtforandeTjanst/);
    assert.doesNotMatch(js, /const deleteBtn = isCustom/);
    assert.match(js, /tjanst-mall-top-actions/);
    assert.match(js, /Lägg till källa \(valfritt\)/);

    const htmlPage = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    assert.match(htmlPage, /Lägg till standardtjänst/);
    assert.match(htmlPage, /Skapa egen tjänst/);
    assert.match(htmlPage, /id="tjanst-katalog-footer"/);

    const enkate = fs.readFileSync(path.join(__dirname, '../public/js/byra-profil-enkate.js'), 'utf8');
    assert.match(enkate, /goToFirstUnanswered/);
    assert.match(enkate, /aria-disabled/);
    assert.match(enkate, /Klarmarkera|byra-enkate-finish/);

    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(css, /tjanst-katalog-val/);
    assert.match(css, /tjanst-mall-top-actions/);
    assert.match(css, /tjanst-katalog-footer\[hidden\]/);
    assert.match(css, /byra-enkate-bolagsformer[\s\S]*width:\s*max-content/);
    assert.match(css, /\.byra-enkate-bolagsformer-row[\s\S]*display:\s*contents/);
    assert.match(css, /grid-template-columns:\s*max-content\s+5rem/);
  });

  it('sidan visar katalog och inte AML-teorifrågor till byrån', () => {
    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    assert.match(html, /tjanst-utforande-katalog/);
    assert.match(html, /id="tjanst-katalog-footer"/);
    assert.match(html, /data-add-standard-tjanst/);
    assert.match(html, /data-add-custom-tjanst/);
    assert.match(html, /Lägg till standardtjänst/);
    assert.match(html, /Skapa egen tjänst/);
    assert.match(html, /Vilka tjänster erbjuder ni/);
    assert.match(html, /tjanst-utforande-mallar\.js/);
    assert.match(html, /Lägg till egen tjänst/);
    assert.match(html, /btn-add-row" id="tjanst-utforande-add-custom" hidden/);
    assert.match(html, /risk-guide-chevron/);
    assert.doesNotMatch(html, /Aktivera de tjänster ni erbjuder/);
    assert.doesNotMatch(html, /Ni behöver inte själva bedöma penningtvättsrisken/);
    assert.doesNotMatch(html, /Vilka hot finns mot tjänsten/);
    assert.doesNotMatch(html, /Vad är residualrisken/);
    assert.match(html, /risk-assessment-section" hidden/);
  });

  it('kortlistan använder växel, ikonbadge och ghost-redigera', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(js, /tjanst-mall-switch/);
    assert.match(js, /tjanst-mall-icon/);
    assert.match(js, /Aktivera tjänsten/);
    assert.match(js, /Inaktivera tjänsten/);
    assert.match(js, /btn-ghost btn-sm tjanst-mall-edit/);
    assert.match(js, /formatCatalogRiskBadge/);
    assert.match(js, /utforandeServiceIcon/);
    assert.doesNotMatch(js, /tjanst-mall-toggle/);
    assert.doesNotMatch(js, />Aktiv<|>Inaktiv</);
    assert.match(css, /--surface-1:/);
    assert.match(css, /--accent-muted:/);
    assert.match(css, /\.tjanst-mall-switch-ui/);
    assert.match(css, /\.tjanst-mall-icon\.is-active/);
    assert.match(css, /\.tjanst-mall-meta \.risk-level-badge\.risk-normal/);
    assert.match(css, /body\.riskbedomning-byra-page \.risk-guide-summary/);
    const withAnalysis = renderUtforandeCardHtml({ id: 'risk-1' });
    assert.match(withAnalysis, /tjanst-mall-switch/);
    assert.match(withAnalysis, /aria-label="Inaktivera tjänsten"/);
    assert.match(withAnalysis, /tjanst-mall-icon is-active/);
    assert.match(withAnalysis, /fas fa-scale-balanced/);
    assert.match(withAnalysis, /tjanst-mall-desc/);
    assert.match(withAnalysis, /btn-ghost btn-sm tjanst-mall-edit/);
    assert.match(withAnalysis, /risk-row-menu/);
    assert.match(withAnalysis, /data-risk-menu-toggle/);
    assert.match(withAnalysis, /data-delete-tjanst/);
    assert.match(withAnalysis, /tjanst-mall-top-actions/);
    assert.match(withAnalysis, /data-toggle-overview/);
    assert.doesNotMatch(withAnalysis, />Aktiv</);
    const locked = renderUtforandeCardHtml({ id: 'risk-1' }, { kundCount: 3 });
    assert.match(locked, /disabled/);
    assert.match(locked, /is-locked/);
    assert.match(locked, /3 kunder har tjänsten/);
    assert.match(locked, /risk-kund-count/);
    const customCard = renderUtforandeCardHtml(null, {
      template: { id: 'custom:ffff', name: 'ffff', description: '' },
      entry: { aktiv: true, namn: 'ffff' }
    });
    assert.match(customCard, /data-delete-tjanst/);
    assert.match(customCard, /tjanst-mall-delete/);
    assert.match(customCard, /tjanst-mall-top-actions/);
    assert.match(customCard, /Ta bort/);
    assert.match(withAnalysis, /Ta bort/);
    assert.match(js, /risk-row-menu/);
    assert.match(js, /fa-calendar-check/);
    assert.match(js, /fa-calculator/);
    assert.match(css, /\.tjanst-mall-card\.risk-elevated/);
    assert.match(css, /\.risk-row-menu-btn/);
    assert.match(css, /#d97706/);
    assert.match(css, /\.risk-level-badge\.risk-elevated[\s\S]*?#c2410c/);
    assert.match(css, /\.tjanst-mall-meta \.risk-level-badge\.risk-unacceptable[\s\S]*?#3b0764/);
    assert.match(css, /\.risk-level-badge\.risk-unacceptable[\s\S]*?#3b0764/);
    assert.doesNotMatch(css, /\.tjanst-mall-icon\.risk-high/);
    assert.doesNotMatch(css, /\.tjanst-mall-icon\.risk-unacceptable/);
    assert.match(css, /Risknivå visas via badges/);
    assert.doesNotMatch(js, /iconRiskClass/);
    const oacceptabelCard = renderUtforandeCardHtml({
      id: 'risk-oacc',
      fields: {
        'Task Name': 'Betalningsuppdrag och betalningshantering',
        Riskpoäng: JSON.stringify({ sannolikhet: 5, konsekvens: 5, sannolikhetEfter: 3, konsekvensEfter: 3 })
      }
    }, {
      template: { id: 'betalningsuppdrag', name: 'Betalningsuppdrag och betalningshantering', description: '' },
      entry: { aktiv: true, namn: 'Betalningsuppdrag och betalningshantering' },
      useRealRiskMeta: true
    });
    assert.match(oacceptabelCard, /risk-level-badge risk-unacceptable/);
    assert.match(oacceptabelCard, /oacceptabel/i);
    assert.match(oacceptabelCard, /tjanst-mall-icon is-active"/);
    assert.doesNotMatch(oacceptabelCard, /tjanst-mall-icon is-active risk-/);
    const customLocked = renderUtforandeCardHtml({ id: 'risk-c' }, {
      template: { id: 'custom:dfff', name: 'dfff', description: '' },
      entry: { aktiv: true, namn: 'dfff' },
      kundCount: 2
    });
    assert.match(customLocked, /data-delete-tjanst[^>]*disabled/);
    assert.match(customLocked, /Kan inte raderas — 2 kunder har tjänsten/);
  });

  it('kortet öppnar riskbedömning med utförandefrågor i modalens utförandeflika', () => {
    const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(html, /data-tjanst-tab="utforande"/);
    assert.match(html, /data-tjanst-panel="utforande"/);
    assert.match(html, /tjanst-modal-utforande/);
    assert.match(html, /Generera AI-analys/);
    assert.match(html, /tjanst-ai-extra-underlag/);
    assert.match(html, /Extra underlag till analysen/);
    assert.match(html, /falska mejl som ser ut att komma från kunden/);
    assert.match(html, /Lägg till eget/);
    assert.match(js, /persistAiExtraUnderlag/);
    assert.match(js, /extraUnderlag:/);
    assert.match(js, /replaceTjanstListPreservingUser/);
    assert.match(js, /userAdded: true/);
    assert.match(js, /listDiffPreserveUserAdded/);
    assert.match(css, /tjanst-ai-extra-underlag/);
    assert.match(css, /dyn-user-badge/);
    assert.match(html, /Frågor från din ClientFlow AI/);
    assert.match(html, /tjanst-modal-layout/);
    assert.match(html, /tjanst-tabs-kicker/);
    assert.match(html, /Din resa/);
    assert.match(html, /tjanst-tab-dot/);
    assert.match(html, /fa-wand-magic-sparkles/);
    assert.match(html, /id="tjanst-klarmarkera-btn"/);
    assert.match(html, /tjanst-klarmarkera-label/);
    assert.match(html, />Klarmarkera</);
    assert.match(html, /id="tjanst-resa-progress"/);
    assert.doesNotMatch(html, /tjanst-tab-count/);
    assert.doesNotMatch(html, /tjanst-tab-icon/);
    assert.doesNotMatch(html, />Utförandefrågor</);
    const tabOrder = [...html.matchAll(/data-tjanst-tab="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(tabOrder, ['utforande', 'oversikt', 'hot', 'sarbarhet', 'inneboende', 'atgard', 'residual']);
    const panelOrder = [...html.matchAll(/data-tjanst-panel="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(panelOrder, ['utforande', 'oversikt', 'hot', 'sarbarhet', 'inneboende', 'atgard', 'residual']);
    assert.match(html, /data-tjanst-tab="utforande"[^>]*aria-selected="true"/);
    assert.doesNotMatch(html, /Börja med utförandefrågor/);
    assert.doesNotMatch(html, /tjanst-modal-kicker/);
    assert.match(js, /renderModalUtforande/);
    assert.match(js, /setTjanstTab\('utforande'\)/);
    assert.match(js, /const id = tabId \|\| 'utforande'/);
    assert.match(js, /this\.setTjanstTab\('utforande'\);\s*this\.updateTjanstLists\(\)/);
    assert.match(js, /toggleKlarmarkering/);
    assert.match(js, /syncTjanstTabDoneState/);
    assert.match(js, /klarmarkeradeFlikar/);
    assert.match(js, /setKlarmarkeradeFlikar/);
    assert.match(js, /Ta bort klarmarkering/);
    assert.match(js, /autosizeTjanstTextareas/);
    assert.match(js, /syncEditingRiskKlarmarkering/);
    assert.match(js, /persistKlarmarkeringQuietly/);
    assert.match(js, /isTjanstResaComplete/);
    assert.match(js, /tjanst-mall-klar-badge/);
    assert.match(js, /is-resa-complete/);
    assert.match(js, /Frågor från din ClientFlow AI/);
    assert.match(js, /dyn-row-kind/);
    assert.match(js, /findUtforandeMallIdForNamn/);
    assert.match(js, /buildTjanstRiskSections/);
    assert.match(js, /tjanst-mall-title-btn/);
    assert.match(js, /data-open-analys>\$\{existing \? 'Redigera'/);
    assert.match(js, /Låt AI skapa ett utkast/);
    assert.match(js, /Redigera manuellt/);
    assert.match(js, /analysHtml \? `<div class="tjanst-mall-body">/);
    assert.doesNotMatch(js, /Riskbedömning finns/);
    assert.match(js, /tjanst-mall-summary|tjanst-mall-overview/);
    assert.match(css, /tjanst-mall-overview|tjanst-katalog-footer/);
    assert.match(js, /tjanst-mall-chip/);
    assert.match(js, /Så här görs tjänsten/);
    assert.match(js, /Kundunderlag/);
    assert.match(js, /hamtaClientflowStatistik/);
    assert.match(js, /tjanst-mall-stats/);
    assert.match(js, /tjanst-exponering/);
    assert.match(js, /tjanst-mall-stats-error/);
    assert.match(js, /findTjanstRisksByName/);
    assert.match(js, /findTjanstRisksByExactName/);
    assert.match(js, /expo\.ok === false/);
    assert.doesNotMatch(js, /Matchade kundernas tjänst/);
    assert.doesNotMatch(js, /data-utforande-view="fragor"/);
    assert.doesNotMatch(js, /<select class="dyn-typ"/);
    assert.doesNotMatch(js, /<select class="dyn-kategori"/);
    assert.doesNotMatch(js, /<select class="dyn-evidens"/);
    assert.match(css, /tjanst-mall-stats-error/);
    assert.match(css, /tjanst-mall-stats-note/);
    assert.match(css, /tjanst-modal-layout/);
    assert.match(css, /tjanst-tab-dot/);
    assert.match(css, /tjanst-tabs-kicker/);
    assert.match(css, /\.tjanst-tab\.is-done \.tjanst-tab-dot/);
    assert.match(css, /\.tjanst-tab\.is-done \.tjanst-tab-dot::after/);
    assert.match(css, /tjanst-klarmarkera-btn/);
    assert.match(css, /tjanst-panel-klar-bar/);
    assert.match(css, /tjanst-resa-progress/);
    assert.match(css, /tjanst-mall-klar-badge/);
    assert.match(css, /field-sizing:\s*content/);
    assert.match(css, /tjanst-panel #tjanst-beskrivning[^}]*overflow-y:\s*hidden/);
    assert.match(css, /\.tjanst-tabs\s*\{[^}]*flex-direction:\s*column/);
    assert.match(css, /\.tjanst-tabs\s*\{[^}]*background:\s*transparent/);
    assert.match(css, /\.tjanst-tabs-steps::before/);
    assert.match(css, /@media \(max-width: 960px\)[\s\S]*?\.tjanst-tabs-steps\s*\{[^}]*overflow-x:\s*auto/);
    assert.match(css, /tjanst-mall-chip\.is-selected/);
    assert.match(css, /tjanst-mall-chip:hover:not\(\.is-selected\)/);
    assert.match(css, /transition:\s*background-color 120ms ease/);
    assert.match(css, /border-radius:\s*99px/);
    assert.match(css, /padding:\s*9px 22px/);
    assert.match(css, /tjanst-mall-stat-grid/);
    assert.match(css, /tjanst-mall-options[\s\S]*?flex-wrap:\s*wrap/);
    assert.match(css, /tjanst-ai-summary/);
    assert.match(js, /data-goto-tab/);
    assert.match(js, /Granska alla/);
    assert.match(js, /tjanst-mall-stats-note/);
    assert.match(html, /id="tjanst-ai-summary"[^>]*class="[^"]*tjanst-ai-summary/);
    assert.match(css, /tjanst-modal-utforande/);
    assert.match(css, /tjanst-utforande-ai-bar/);
    assert.match(css, /data-panel="analys"] \.risk-content-section \{\s*margin:\s*0;\s*padding:\s*1\.85rem 0 1\.9rem/);
    assert.doesNotMatch(css, /\.tjanst-mall-card\.is-inactive \.tjanst-mall-body \{\s*display:\s*none/);
    assert.doesNotMatch(css, /\.tjanst-mall-card:not\(\.is-view-fragor\):not\(\.is-view-analys\) \.tjanst-mall-body \{\s*display:\s*none/);
  });

  it('låter kort med analys fälla ut översikt utan att öppna redigera', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    assert.match(js, /data-toggle-overview/);
    assert.match(js, /fa-chevron-down/);
    assert.match(js, /Visa översikt/);
    assert.match(js, /tjanst-mall-summary-heading/);
    assert.match(js, /Hot och modus/);
    assert.match(js, /Riskreducerande åtgärder/);
    assert.match(js, /Utförandesvar/);
    assert.match(js, /renderUtforandeOverviewAnswers/);
    assert.match(js, /renderOverviewSemanticPanels/);
    assert.match(js, /tjanst-ov-panel--\$\{kind\}/);
    assert.match(js, /tjanst-ov-panel-list/);
    assert.match(js, /tjanst-ov-panel-item/);
    assert.match(js, /\.filter\(Boolean\)\.join\(''\)/);
    assert.match(js, /fa-triangle-exclamation/);
    assert.match(js, /fa-shield-halved/);
    assert.match(js, /fa-comment-dots/);
    assert.doesNotMatch(js, /lines\.length >= 4/);
    assert.doesNotMatch(js, /motIn\.slice\(0, 280\)/);
    assert.match(html, /riskbedomning-byra\.v5\.js\?v=64/);
    assert.match(js, /Dölj översikt/);
    assert.match(css, /\.tjanst-mall-expand\.btn-ghost/);
    assert.match(css, /tjanst-ov-panel--hot/);
    assert.match(css, /--tjanst-ov-hot/);
    assert.match(css, /\.tjanst-ov-panel-list/);
    assert.match(css, /\.tjanst-ov-panel-item/);

    const withAnalysis = renderUtforandeCardHtml({ id: 'risk-1' });
    assert.match(withAnalysis, /tjanst-mall-title-btn/);
    assert.match(withAnalysis, />Redigera</);
    assert.match(withAnalysis, /btn-ghost btn-sm tjanst-mall-edit/);
    assert.match(withAnalysis, /data-toggle-overview/);
    assert.match(withAnalysis, /Visa översikt/);
    assert.match(withAnalysis, /fa-chevron-down/);
    assert.match(withAnalysis, /tjanst-mall-overview/);
    assert.match(withAnalysis, /data-delete-tjanst/);
    assert.doesNotMatch(withAnalysis, /Låt AI skapa ett utkast/);

    const empty = renderUtforandeCardHtml(null);
    assert.match(empty, /tjanst-mall-body/);
    assert.match(empty, /tjanst-mall-empty/);
    assert.match(empty, /Låt AI skapa ett utkast/);
    assert.match(empty, /Redigera manuellt/);
    assert.match(empty, /Ingen riskbedömning ännu/);
    assert.match(empty, /data-delete-tjanst/);
    assert.doesNotMatch(empty, /data-toggle-overview/);
  });

  it('tydliggör att kunden kompletterar i efterhand och mappar gamla svar', () => {
    const label = 'Kunden får komplettera i efterhand';
    const dek = Mallar.templateById('deklarationer');
    const dekOklar = Mallar.questionsForTemplate(dek).find((q) => q.id === 'dekOklar');
    assert.equal(dekOklar.label, 'Hur hanteras uppgifter som inte kan styrkas?');
    assert.ok(dekOklar.options.includes(label));
    assert.ok(!dekOklar.options.includes('Kunden får komplettera'));

    Mallar.SERVICE_TEMPLATES.forEach((t) => {
      Mallar.questionsForTemplate(t).forEach((q) => {
        (q.options || []).forEach((opt) => {
          assert.notEqual(opt, 'Kunden får komplettera', `${t.id}.${q.id}`);
        });
      });
    });

    const rawState = {
      version: 1,
      tjanster: {
        deklarationer: {
          id: 'deklarationer',
          aktiv: true,
          answers: { dekOklar: ['Kunden får komplettera', 'Underlaget dokumenteras'] },
          kommentarer: {}
        }
      }
    };
    const entry = Mallar.getEntry(rawState, 'deklarationer');
    assert.deepEqual(entry.answers.dekOklar, [label, 'Underlaget dokumenteras']);
    const saved = Mallar.upsertEntry(Mallar.emptyState(), 'rot-rut', {
      answers: { rotOklar: ['Kunden får komplettera'] }
    });
    assert.deepEqual(Mallar.getEntry(saved, 'rot-rut').answers.rotOklar, [label]);
    const formatted = Mallar.formatAnswersForAi(Mallar.templateById('rot-rut'), {
      answers: { rotHjalper: 'Ja', rotOklar: ['Kunden får komplettera'], hamtaClientflowStatistik: 'Ja' }
    });
    assert.ok(formatted.rows.some((r) => r.id === 'rotOklar' && r.svar.includes(label)));
  });

  it('inkluderar Tillgångar i lantbruk bland anläggningstillgångar', () => {
    const template = Mallar.templateById('anlaggningsregister');
    const qs = Mallar.questionsForTemplate(template);
    const tillgangar = qs.find((q) => q.id === 'anlTillgangar');
    assert.equal(tillgangar.label, 'Vilka typer av tillgångar hanteras normalt?');
    assert.ok(tillgangar.options.includes('Tillgångar i lantbruk'));
    assert.ok(tillgangar.options.includes('Immateriella tillgångar'));
    assert.equal(tillgangar.options[tillgangar.options.length - 1], 'Annat');
    assert.ok(tillgangar.options.indexOf('Tillgångar i lantbruk') < tillgangar.options.indexOf('Annat'));
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

  it('formaterar katalogbadges till sentence case utan S×K-prefix', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const match = js.match(/formatCatalogRiskBadge\(label\) \{([\s\S]*?)\n    \}/);
    assert.ok(match, 'hittar formatCatalogRiskBadge');
    const fn = new Function('label', match[1]);
    assert.equal(fn('Inneboende risk: Normal (S×K 9)'), 'Inneboende risk: normal (9)');
    assert.equal(fn('Residualrisk: Låg (S×K 4)'), 'Residualrisk: låg (4)');
    assert.equal(fn('Inneboende risk: Hög (S×K 16)'), 'Inneboende risk: hög (16)');
  });
});
