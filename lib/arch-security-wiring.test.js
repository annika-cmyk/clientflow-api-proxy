'use strict';

/**
 * Wiring-tester för HIGH-severity arkitekturfixar (public sanitize, VH-gate,
 * lazy omprofilering, assertCustomerAccess på KYC).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexSrc = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

function routeSlice(marker) {
  const start = indexSrc.indexOf(marker);
  assert.ok(start >= 0, `Saknar markör: ${marker}`);
  const next = indexSrc.indexOf('\napp.', start + marker.length);
  return next >= 0 ? indexSrc.slice(start, next) : indexSrc.slice(start);
}

describe('arch-security wiring', () => {
  it('buildKundformularPublicResponse delegates to Kundformular.buildPublicResponse', () => {
    assert.match(indexSrc, /function buildKundformularPublicResponse/);
    assert.match(indexSrc, /Kundformular\.buildPublicResponse/);
    assert.doesNotMatch(
      routeSlice('function buildKundformularPublicResponse'),
      /inviteToken:\s*undefined|byraVhNote|reminderCount/
    );
  });

  it('KYC GET/POST/pdf/skicka/hamta call assertCustomerAccess', () => {
    const markers = [
      "app.get('/api/kyc-formular/:customerId'",
      "app.post('/api/kyc-formular/:customerId'",
      "app.post('/api/kyc-formular/:customerId/pdf'",
      "app.post('/api/kyc-formular/:customerId/skicka-for-signering'",
      "app.post('/api/kyc-formular/:customerId/hamta-signerat'"
    ];
    for (const marker of markers) {
      const slice = routeSlice(marker);
      assert.match(slice, /assertCustomerAccess\(req,\s*customerId/, `assertCustomerAccess saknas nära ${marker}`);
    }
  });

  it('GET kunddata applies lazyOmprofileringFields', () => {
    const slice = routeSlice("app.get('/api/kunddata/:id'");
    assert.match(slice, /lazyOmprofileringFields/);
    assert.match(slice, /effectiveKundProfileStatus/);
  });
});
