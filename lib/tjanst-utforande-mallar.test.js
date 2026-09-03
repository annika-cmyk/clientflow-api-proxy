const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Mallar = require('../public/js/tjanst-utforande-mallar');

function renderUtforandeCardHtml(existing, opts = {}) {
  const js = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
  const match = js.match(/renderUtforandeCard\(template, entry\) \{([\s\S]*?)\n    \}/);
  assert.ok(match, 'hittar renderUtforandeCard');
  const fn = new Function('template', 'entry', match[1]);
  return fn.call({
    esc(value) { return String(value ?? ''); },
    findTjanstRiskByName() { return existing; },
    utforandeServiceIcon() { return 'fa-scale-balanced'; },
    kundCountForUtforandeTjanst() { return opts.kundCount || 0; },
    renderKundCountBadge(n) { return `<span class="risk-kund-count">${n} kunder</span>`; },
    renderUtforandeRiskMeta() { return '<span class="tjanst-mall-status">AML-analys finns</span>'; }
  }, { id: 'bokslut', name: 'Bokslut', description: 'Årsbokslut' }, { aktiv: true, namn: 'Bokslut' });
}

describe('tjanst-utforande-mallar', () => {
  it('har 16 standardtjänster med korta AML-frågor utan gemensamma basfrågor', () => {
    assert.equal(Mallar.SERVICE_TEMPLATES.length, 16);
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
    assert.match(html, /btn-add-row" id="tjanst-utforande-add-custom"/);
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
    assert.doesNotMatch(withAnalysis, />Aktiv</);
    const locked = renderUtforandeCardHtml({ id: 'risk-1' }, { kundCount: 3 });
    assert.match(locked, /disabled/);
    assert.match(locked, /is-locked/);
    assert.match(locked, /3 kunder har tjänsten/);
    assert.match(locked, /risk-kund-count/);
  });

  it('kortet öppnar riskbedömning med utförandefrågor i modalens utförandeflika', () => {
    const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(html, /data-tjanst-tab="utforande"/);
    assert.match(html, /data-tjanst-panel="utforande"/);
    assert.match(html, /tjanst-modal-utforande/);
    assert.match(html, /Generera AI-analys/);
    assert.match(html, /Frågor från din ClientFlow AI/);
    assert.match(html, /tjanst-modal-layout/);
    assert.match(html, /tjanst-tabs-kicker/);
    assert.match(html, /Din resa/);
    assert.match(html, /tjanst-tab-dot/);
    assert.match(html, /fa-wand-magic-sparkles/);
    assert.match(html, /id="tjanst-klarmarkera-btn"/);
    assert.match(html, /tjanst-klarmarkera-label/);
    assert.match(html, />Klarmarkera</);
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
    assert.doesNotMatch(js, /tjanst-mall-summary/);
    assert.doesNotMatch(css, /\.tjanst-mall-summary/);
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
    assert.match(css, /tjanst-klarmarkera-btn/);
    assert.match(css, /tjanst-panel-klar-bar/);
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
    assert.match(js, /tjanst-ai-summary-goto/);
    assert.match(js, /tjanst-mall-stats-note/);
    assert.match(html, /id="tjanst-ai-summary"[^>]*class="[^"]*tjanst-ai-summary/);
    assert.match(css, /tjanst-modal-utforande/);
    assert.match(css, /tjanst-utforande-ai-bar/);
    assert.match(css, /data-panel="analys"] \.risk-content-section \{\s*margin:\s*0;\s*padding:\s*1\.85rem 0 1\.9rem/);
    assert.doesNotMatch(css, /\.tjanst-mall-card\.is-inactive \.tjanst-mall-body \{\s*display:\s*none/);
    assert.doesNotMatch(css, /\.tjanst-mall-card:not\(\.is-view-fragor\):not\(\.is-view-analys\) \.tjanst-mall-body \{\s*display:\s*none/);
  });

  it('döljer sammanfattning på kort med analys och behåller tomt tillstånd', () => {
    const withAnalysis = renderUtforandeCardHtml({ id: 'risk-1' });
    assert.match(withAnalysis, /tjanst-mall-title-btn/);
    assert.match(withAnalysis, />Redigera</);
    assert.match(withAnalysis, /btn-ghost btn-sm tjanst-mall-edit/);
    assert.doesNotMatch(withAnalysis, /tjanst-mall-body/);
    assert.doesNotMatch(withAnalysis, /tjanst-mall-summary/);
    assert.doesNotMatch(withAnalysis, /Riskbedömning finns/);
    assert.doesNotMatch(withAnalysis, /Låt AI skapa ett utkast/);

    const empty = renderUtforandeCardHtml(null);
    assert.match(empty, /tjanst-mall-body/);
    assert.match(empty, /tjanst-mall-empty/);
    assert.match(empty, /Låt AI skapa ett utkast/);
    assert.match(empty, /Redigera manuellt/);
    assert.match(empty, /Ingen riskbedömning ännu/);
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
