const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_KALLOR,
  mergeKallaState,
  kallaIdsAnvanda,
  kallaCatalogComplete,
  parseByraResaState,
  buildByraResaState,
  createCustomKallaId,
  normalizeCustomKallor,
  RESA_STEPS,
  PERSONUPPGIFTER_FIELD,
  BYRA_RESA_STATE_FIELD,
  countCompletedSteps,
  resolveStepCardStatuses,
  STEP_STATUS,
  step8Ready,
  NRA_SOURCE_ID
} = require('./byra-resa');
const Mallar = require('../public/js/tjanst-utforande-mallar');

describe('byra-resa', () => {
  it('exposes eight journey steps and curated sources', () => {
    assert.equal(RESA_STEPS.length, 8);
    assert.ok(DEFAULT_KALLOR.length >= 5);
    assert.equal(PERSONUPPGIFTER_FIELD, 'Behandling av personuppgifter');
    assert.equal(BYRA_RESA_STATE_FIELD, 'Byråresa state');
    assert.equal(RESA_STEPS[2].title, 'Vilka är våra kunder');
    assert.equal(RESA_STEPS[2].href, 'kundrisker-mm.html');
    assert.equal(RESA_STEPS[3].title, 'Övriga riskfaktorer');
    assert.equal(RESA_STEPS[3].href, 'ovriga-riskfaktorer.html');
    assert.ok(DEFAULT_KALLOR.some((k) => k.id === NRA_SOURCE_ID));
    assert.match(RESA_STEPS[7].desc, /källkatalog/i);
    assert.doesNotMatch(RESA_STEPS[7].desc, /NRA-checklista/i);
  });

  it('counts completed AML-profil steps for sidebar progress', () => {
    assert.deepEqual(countCompletedSteps({}), { done: 0, total: 8 });
    assert.deepEqual(countCompletedSteps({ 1: true, 2: true, 5: true }), { done: 3, total: 8 });
    assert.deepEqual(
      countCompletedSteps({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true }),
      { done: 8, total: 8 }
    );
  });

  it('merges saved kalla state onto the default catalog', () => {
    const rows = mergeKallaState({
      [NRA_SOURCE_ID]: { status: 'anvander', note: 'Kap 7' },
      'eu-snra': { status: 'inte_relevant', note: '' }
    });
    const nra = rows.find((r) => r.id === NRA_SOURCE_ID);
    const snra = rows.find((r) => r.id === 'eu-snra');
    const fatf = rows.find((r) => r.id === 'fatf-recommendations');
    assert.equal(nra.status, 'anvander');
    assert.equal(nra.note, 'Kap 7');
    assert.ok(nra.url);
    assert.equal(snra.status, 'inte_relevant');
    assert.equal(fatf.status, 'unset');
  });

  it('includes custom sources in the merged catalog', () => {
    const custom = normalizeCustomKallor([{ label: 'Branschvägledning X', url: 'example.com/x' }]);
    assert.equal(custom.length, 1);
    assert.ok(custom[0].id.startsWith('custom-'));
    assert.equal(custom[0].url, 'https://example.com/x');
    const rows = mergeKallaState({ [custom[0].id]: { status: 'anvander' } }, custom);
    assert.equal(rows.length, DEFAULT_KALLOR.length + 1);
    const own = rows.find((r) => r.id === custom[0].id);
    assert.equal(own.custom, true);
    assert.equal(own.status, 'anvander');
    assert.equal(own.label, 'Branschvägledning X');
  });

  it('lists only sources marked anvander for AI grounding', () => {
    assert.deepEqual(
      kallaIdsAnvanda({
        [NRA_SOURCE_ID]: { status: 'anvander' },
        'fatf-recommendations': { status: 'tagit_del' },
        'eu-snra': { status: 'inte_relevant' }
      }),
      [NRA_SOURCE_ID]
    );
  });

  it('requires every source including custom to leave unset before catalog is complete', () => {
    assert.equal(kallaCatalogComplete({}), false);
    const all = {};
    DEFAULT_KALLOR.forEach((k, i) => {
      all[k.id] = { status: i % 2 ? 'anvander' : 'inte_relevant' };
    });
    assert.equal(kallaCatalogComplete(all), true);
    const custom = [{ id: 'custom-extra', label: 'Extra', url: '' }];
    assert.equal(kallaCatalogComplete(all, custom), false);
    all['custom-extra'] = { status: 'tagit_del' };
    assert.equal(kallaCatalogComplete(all, custom), true);
  });

  it('parses and rebuilds state JSON with customKallor stably', () => {
    const raw = JSON.stringify({
      version: 1,
      steps: { 2: true, 6: true },
      kalla: {
        [NRA_SOURCE_ID]: { status: 'anvander', note: 'x' },
        'custom-policy': { status: 'tagit_del' }
      },
      customKallor: [{ id: 'custom-policy', label: 'Intern policy', url: 'https://example.com/p' }]
    });
    const parsed = parseByraResaState(raw);
    assert.equal(parsed.steps[2], true);
    assert.equal(parsed.steps[1], false);
    assert.equal(parsed.kalla[NRA_SOURCE_ID].status, 'anvander');
    assert.equal(parsed.customKallor.length, 1);
    assert.equal(parsed.customKallor[0].id, 'custom-policy');
    assert.equal(parsed.riskFactorCatalogVersion, 1);
    const built = buildByraResaState(parsed);
    assert.equal(built.version, 1);
    assert.equal(built.steps[6], true);
    assert.equal(built.customKallor[0].label, 'Intern policy');
    assert.ok(built.kalla['custom-policy']);
    assert.equal(built.riskFactorCatalogVersion, 1);
  });

  it('preserves riskFactorCatalogVersion through parse/build', () => {
    const parsed = parseByraResaState({ riskFactorCatalogVersion: 7, steps: { 1: true } });
    assert.equal(parsed.riskFactorCatalogVersion, 7);
    const built = buildByraResaState({ ...parsed, riskFactorCatalogVersion: 7 });
    assert.equal(built.riskFactorCatalogVersion, 7);
    assert.equal(parseByraResaState({ riskFactorCatalogVersion: 0 }).riskFactorCatalogVersion, 1);
    assert.equal(parseByraResaState({ riskFactorCatalogVersion: '3.9' }).riskFactorCatalogVersion, 3);
  });

  it('preserves kundriskAnalysSkipped group ids through parse/build', () => {
    const parsed = parseByraResaState({
      kundriskAnalysSkipped: ['kontant', 'geo-marknad', 'kontant', '']
    });
    assert.deepEqual(parsed.kundriskAnalysSkipped, ['kontant', 'geo-marknad']);
    const built = buildByraResaState(parsed);
    assert.deepEqual(built.kundriskAnalysSkipped, ['kontant', 'geo-marknad']);
    assert.deepEqual(parseByraResaState({}).kundriskAnalysSkipped, []);
  });

  it('creates stable unique custom ids', () => {
    const a = createCustomKallaId('Min Källa');
    const b = createCustomKallaId('Min Källa', [a]);
    assert.equal(a, 'custom-min-kalla');
    assert.equal(b, 'custom-min-kalla-2');
  });

  it('resolves step card statuses: done, next, attention, pending', () => {
    const rows = resolveStepCardStatuses({
      steps: { 1: true },
      attentionStepIds: [3]
    });
    assert.equal(rows[0].status, STEP_STATUS.DONE);
    assert.equal(rows[0].label, 'Klart');
    assert.equal(rows[1].status, STEP_STATUS.NEXT);
    assert.equal(rows[1].label, 'Nästa steg');
    assert.equal(rows[2].status, STEP_STATUS.ATTENTION);
    assert.equal(rows[2].label, 'Kräver uppmärksamhet');
    assert.equal(rows[3].status, STEP_STATUS.PENDING);
    assert.equal(rows[3].label, 'Ej påbörjat');
  });

  it('gives each RESA step a distinct icon', () => {
    const icons = RESA_STEPS.map((s) => s.icon);
    assert.equal(icons.length, 8);
    assert.equal(new Set(icons).size, 8);
    icons.forEach((icon) => assert.match(icon, /^fa-/));
  });

  it('treats NRA as source catalog entry, not a checklist gate', () => {
    const all = {};
    DEFAULT_KALLOR.forEach((k) => {
      all[k.id] = { status: 'tagit_del' };
    });
    all[NRA_SOURCE_ID] = { status: 'anvander' };
    assert.equal(kallaCatalogComplete(all, []), true);
    assert.equal(step8Ready(all, []), true);
  });

  it('ignores legacy nraChecklist in parse/build', () => {
    const built = buildByraResaState({
      kalla: { [NRA_SOURCE_ID]: { status: 'anvander' } },
      nraChecklist: { 'nra-kap-4-tf': { answer: 'ja', why: '' } }
    });
    assert.deepEqual(built.nraChecklist, {});
    const parsed = parseByraResaState(JSON.stringify({
      ...built,
      nraChecklist: { 'nra-kap-4-tf': { answer: 'ja' } }
    }));
    assert.deepEqual(parsed.nraChecklist, {});
  });

  it('step 8 is ready when källa catalog is complete (no NRA checklist)', () => {
    const incomplete = {};
    DEFAULT_KALLOR.forEach((k) => {
      incomplete[k.id] = { status: 'unset' };
    });
    assert.equal(step8Ready(incomplete, []), false);

    const complete = {};
    DEFAULT_KALLOR.forEach((k) => {
      complete[k.id] = { status: k.id === NRA_SOURCE_ID ? 'anvander' : 'tagit_del' };
    });
    assert.equal(step8Ready(complete, []), true);
  });
});

describe('NRA as källtagg destinations', () => {
  it('exposes Terrorfinansiering as kundriskfaktor', () => {
    const src = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-risk-kategorier.js'), 'utf8');
    assert.match(src, /id:\s*'terrorfinansiering'/);
    assert.match(src, /terrorfinansieringsrisk/i);
    assert.match(src, /ideell\/insamling\/internationell/);
  });

  it('exposes Formella intyg as service template with NRA-tagged katalog', () => {
    const tmpl = Mallar.SERVICE_TEMPLATES.find((t) => t.id === 'formella-intyg');
    assert.ok(tmpl);
    assert.equal(tmpl.name, 'Formella intyg');
    assert.equal(Mallar.resolveTemplateId('Kreditintyg'), 'formella-intyg');

    const katalog = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/riskanalys-tjanst-katalog.json'), 'utf8')
    );
    assert.ok(katalog.tjanster['Formella intyg']);
    assert.ok(katalog.tjanster['Formella intyg'].some((row) => /NRA|Nationell riskbedömning/i.test(row.kalla || '')));
  });
});
