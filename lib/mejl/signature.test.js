const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LAYOUTS,
  normalizeSettings,
  renderSignatureHtml,
  plainTextSignature
} = require('./signature');

test('normalizeSettings fyller default layout', () => {
  const s = normalizeSettings({ name: 'Annika' });
  assert.equal(s.layout, 'text-left-portrait-right');
  assert.equal(s.name, 'Annika');
  assert.ok(LAYOUTS.includes(s.layout));
});

test('tomma fält renderas inte', () => {
  const html = renderSignatureHtml({
    name: 'Annika Rydén',
    phone: '070-246 29 21',
    email: '',
    address: '',
    website: '',
    freeText: '',
    disclaimer: '',
    title: 'Auktoriserad redovisningskonsult'
  });
  assert.match(html, /Annika Rydén/);
  assert.match(html, /070-246 29 21/);
  assert.match(html, /Auktoriserad/);
  assert.doesNotMatch(html, /E-post:/);
});

test('alla fyra layouts ger HTML när namn finns', () => {
  for (const layout of LAYOUTS) {
    const html = renderSignatureHtml({ layout, name: 'Test' });
    assert.ok(html.includes('Test'), layout);
  }
});

test('helt tom sidfot ger tom sträng', () => {
  assert.equal(renderSignatureHtml({}), '');
  assert.equal(plainTextSignature({}), '');
});
