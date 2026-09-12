'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('./risk-factor-catalog');
const ByraResa = require('./byra-resa');

describe('risk-factor-catalog', () => {
  it('defaults missing catalog version to 1', () => {
    assert.equal(Catalog.readCatalogVersion({}), 1);
    assert.equal(Catalog.readCatalogVersion(null), 1);
    assert.equal(Catalog.readKundCatalogVersion({}), 1);
  });

  it('bumps version and builds a non-AR-invalidating risk event', () => {
    const state = ByraResa.parseByraResaState({});
    const bumped = Catalog.bumpCatalogVersion(state, {
      refId: 'recFactor1',
      namn: 'Distansrelation',
      by: 'anna@byra.se'
    });
    assert.equal(bumped.version, 2);
    assert.equal(bumped.state.riskFactorCatalogVersion, 2);
    assert.equal(bumped.event.type, Catalog.EVENT_TYPE);
    assert.equal(bumped.event.refId, 'recFactor1');
    assert.equal(bumped.event.namn, 'Distansrelation');
    assert.equal(bumped.event.arInvalidated, false);

    const withEvent = ByraResa.appendRiskEvent(bumped.state, bumped.event);
    assert.equal(Catalog.readCatalogVersion(withEvent), 2);
    assert.equal(withEvent.arDeltaPending, false);
    assert.equal(withEvent.riskEvents.length, 1);
    assert.equal(withEvent.riskEvents[0].type, Catalog.EVENT_TYPE);
  });

  it('persists catalog version through byråresa parse/build', () => {
    const built = ByraResa.buildByraResaState({
      riskFactorCatalogVersion: 4,
      steps: { 1: true }
    });
    assert.equal(built.riskFactorCatalogVersion, 4);
    const roundtrip = ByraResa.parseByraResaState(ByraResa.serializeByraResaState(built));
    assert.equal(roundtrip.riskFactorCatalogVersion, 4);
    assert.equal(roundtrip.steps[1], true);
  });

  it('stamps kund and detects behöver_omprofilering against newer catalog', () => {
    const stamp = Catalog.kundStampFields(2);
    assert.equal(stamp[Catalog.KUND_FIELDS.CATALOG_VERSION], 2);
    assert.equal(stamp[Catalog.KUND_FIELDS.PROFILE_STATUS], Catalog.PROFILE_STATUS.OK);
    assert.equal(Catalog.needsOmprofilering(stamp, 2), false);
    assert.equal(Catalog.needsOmprofilering(stamp, 3), true);
    assert.deepEqual(Catalog.kundOmprofileringFields(), {
      [Catalog.KUND_FIELDS.PROFILE_STATUS]: 'behöver_omprofilering'
    });
  });

  it('wires risk-factor writes and kund residual save in index.js', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /risk-factor-catalog/);
    assert.match(index, /bumpRiskFactorCatalogForRequest/);
    assert.match(index, /readRiskFactorCatalogVersionForRequest/);
    assert.match(index, /KUND_FIELDS\.CATALOG_VERSION/);
    assert.equal(Catalog.KUND_FIELDS.CATALOG_VERSION, 'Riskfaktor katalogversion');
    assert.match(index, /behöver_omprofilering/);
    assert.match(index, /kundStampFields/);
    assert.match(index, /options:\s*\{\s*precision:\s*0\s*\}/);
    assert.match(index, /katalogbump efter delete/);
    assert.match(index, /katalogbump efter create/);
    assert.match(index, /katalogbump efter update/);
  });

  it('shows catalog version on övriga riskfaktorer UI', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.match(html, /byra-profil-katalogversion/);
    assert.match(html, /ovriga-riskfaktorer\.js\?v=\d+/);
    assert.match(js, /loadRiskFactorCatalogVersion/);
    assert.match(js, /riskFactorCatalogVersion/);
    assert.match(js, /\/api\/byra-resa/);
  });
});
