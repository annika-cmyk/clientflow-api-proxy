const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_KALLOR,
  mergeKallaState,
  kallaIdsAnvanda,
  kallaCatalogComplete,
  parseByraResaState,
  buildByraResaState,
  RESA_STEPS,
  PERSONUPPGIFTER_FIELD,
  BYRA_RESA_STATE_FIELD
} = require('./byra-resa');

describe('byra-resa', () => {
  it('exposes eight journey steps and curated sources', () => {
    assert.equal(RESA_STEPS.length, 8);
    assert.ok(DEFAULT_KALLOR.length >= 5);
    assert.equal(PERSONUPPGIFTER_FIELD, 'Behandling av personuppgifter');
    assert.equal(BYRA_RESA_STATE_FIELD, 'Byråresa state');
  });

  it('merges saved kalla state onto the default catalog', () => {
    const rows = mergeKallaState({
      'nra-2024-2025': { status: 'anvander', note: 'Kap 7' },
      'eu-snra': { status: 'inte_relevant', note: '' }
    });
    const nra = rows.find((r) => r.id === 'nra-2024-2025');
    const snra = rows.find((r) => r.id === 'eu-snra');
    const fatf = rows.find((r) => r.id === 'fatf-recommendations');
    assert.equal(nra.status, 'anvander');
    assert.equal(nra.note, 'Kap 7');
    assert.ok(nra.url);
    assert.equal(snra.status, 'inte_relevant');
    assert.equal(fatf.status, 'unset');
  });

  it('lists only sources marked anvander for AI grounding', () => {
    assert.deepEqual(
      kallaIdsAnvanda({
        'nra-2024-2025': { status: 'anvander' },
        'fatf-recommendations': { status: 'tagit_del' },
        'eu-snra': { status: 'inte_relevant' }
      }),
      ['nra-2024-2025']
    );
  });

  it('requires every source to leave unset before catalog is complete', () => {
    assert.equal(kallaCatalogComplete({}), false);
    const all = {};
    DEFAULT_KALLOR.forEach((k, i) => {
      all[k.id] = { status: i % 2 ? 'anvander' : 'inte_relevant' };
    });
    assert.equal(kallaCatalogComplete(all), true);
  });

  it('parses and rebuilds state JSON stably', () => {
    const raw = JSON.stringify({
      version: 1,
      steps: { 2: true, 6: true },
      kalla: { 'nra-2024-2025': { status: 'anvander', note: 'x' } }
    });
    const parsed = parseByraResaState(raw);
    assert.equal(parsed.steps[2], true);
    assert.equal(parsed.steps[1], false);
    assert.equal(parsed.kalla['nra-2024-2025'].status, 'anvander');
    const built = buildByraResaState(parsed);
    assert.equal(built.version, 1);
    assert.equal(built.steps[6], true);
  });
});
