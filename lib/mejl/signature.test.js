const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LAYOUTS,
  TEXT_COLOR,
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

test('all sidfotstext är svart i alla layouts (även trots gammal accent)', () => {
  const sample = {
    name: 'Annika Rydén',
    title: 'Konsult',
    phone: '070-246 29 21',
    email: 'annika@example.com',
    address: 'Gatan 1',
    website: 'www.rydenredovisning.se',
    freeText: 'Fritext',
    disclaimer: 'Disclaimer',
    accentColor: '#6B3FA0'
  };
  for (const layout of LAYOUTS) {
    const html = renderSignatureHtml({ ...sample, layout });
    assert.match(html, new RegExp(`color:${TEXT_COLOR}`), layout);
    assert.doesNotMatch(html, /#6B3FA0/i, layout);
    assert.doesNotMatch(html, /color:#111827/i, layout);
    assert.doesNotMatch(html, /color:#4b5563/i, layout);
    assert.doesNotMatch(html, /color:#6b7280/i, layout);
    // Länkar ska ha svart inline-färg (inte browser-blå)
    if (html.includes('mailto:') || html.includes('https://')) {
      assert.match(html, new RegExp(`style="color:${TEXT_COLOR};text-decoration:none;"`), layout);
    }
  }
  assert.equal(normalizeSettings(sample).accentColor, TEXT_COLOR);
});
