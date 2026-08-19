const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { SOURCES, getSource } = require('./sources');

const EXPECTED = [
  'amla',
  'eurlex',
  'fatf',
  'lansstyrelsen',
  'finanspolisen',
  'samordningsfunktionen',
  'revisorsinspektionen',
  'srf',
  'skatteverket',
  'ekobrottsmyndigheten'
];

describe('källadaptrar', () => {
  it('har en isolerad adapter per källa i specifikationen', () => {
    assert.deepEqual(SOURCES.map((s) => s.id).sort(), EXPECTED.slice().sort());
    for (const id of EXPECTED) {
      const src = getSource(id);
      assert.ok(src, id);
      assert.equal(typeof src.fetch, 'function');
    }
  });

  it('låter en trasig källa vara tyst utan att stoppa övriga', async () => {
    const fatf = getSource('fatf');
    const items = await fatf.fetch({
      fetchText: async () => { throw new Error('down'); }
    });
    assert.deepEqual(items, []);
  });

  it('hämtar Skatteverket-nyheter med AML-filter', async () => {
    const html = `
      <a href="https://www.skatteverket.se/penningtvatt">Ändringar i Mekanismen med anledning av sjätte penningtvättsdirektivet</a>
      <a href="https://www.skatteverket.se/punktskatt">Tillfälligt sänkt skatt på bensin</a>
    `;
    const items = await getSource('skatteverket').fetch({
      fetchText: async (url) => (String(url).includes('rss') ? '' : html)
    });
    assert.ok(items.some((i) => /penningtvätt/i.test(i.title)));
    assert.ok(!items.some((i) => /bensin/i.test(i.title)));
  });
});
