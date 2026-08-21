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

  it('tar bara Revisorsinspektionen-nyheter om AML eller ekonomisk brottslighet', async () => {
    const html = `
      <a href="https://www.revisorsinspektionen.se/publikationer/nyheter/2026/revisorsinspektionen-informerar---ekonomisk-brottslighet-och-penningtvatt/">Revisorsinspektionen informerar - ekonomisk brottslighet och penningtvätt</a>
      <a href="https://www.revisorsinspektionen.se/bli-revisor/aterkomma-till-yrket/">Återkomma till yrket</a>
      <a href="https://www.revisorsinspektionen.se/publikationer/nyheter/2026/ny-vagledning-om-revisorsexamen/">Ny vägledning om revisorsexamen</a>
      <a href="https://www.revisorsinspektionen.se/for-revisorer/penningtvatt-och-finansiering-av-terrorism/">Penningtvätt och finansiering av terrorism</a>
      <a href="https://www.revisorsinspektionen.se/publikationer/nyheter/2025/revisorsinspektionen-genomforde-webbinariet-revisorsyttranden--ett-verktyg-i-kampen-mot-ekonomisk-brottslighet/">Webbinarium: revisorsyttranden mot ekonomisk brottslighet</a>
    `;
    const items = await getSource('revisorsinspektionen').fetch({ fetchText: async () => html });
    assert.ok(items.some((i) => /penningtvätt/i.test(i.title)));
    assert.ok(items.some((i) => /ekonomisk brottslighet/i.test(i.title)));
    assert.ok(!items.some((i) => /återkomma/i.test(i.title)));
    assert.ok(!items.some((i) => /revisorsexamen/i.test(i.title)));
    assert.ok(items.every((i) => /\/publikationer\/nyheter\//.test(i.source_url)));
  });

  it('slår ihop Finanspolisens RSS med Polisens rapporter', async () => {
    const rss = `<?xml version="1.0"?><rss><channel>
      <item><title>Misstänkt penningtvätt i Stockholm</title><link>https://polisen.se/aktuellt/penningtvatt-stockholm/</link><description>Nyhet om penningtvätt</description></item>
      <item><title>Trafikolycka i Göteborg</title><link>https://polisen.se/aktuellt/trafik/</link><description>Olycka</description></item>
    </channel></rss>`;
    const reports = `
      <a href="/siteassets/dokument/om-polisen/penningtvatt/omvarldsbevakningar/omvarldsbevakning-nr-2-2026.pdf">Omvärldsbevakning penningtvätt och finansiering av terrorism nr 2-2026 (pdf, 476 kB)</a>
      <a href="/om-polisen/om-webbplatsen/om-cookies--kakor/">Så här använder polisen.se kakor</a>
    `;
    const items = await getSource('finanspolisen').fetch({
      fetchText: async (url) => {
        const u = String(url);
        if (u.includes('rss')) return rss;
        if (u.includes('/rapporter')) return reports;
        return '';
      }
    });
    assert.ok(items.some((i) => /stockholm/i.test(i.title)));
    assert.ok(!items.some((i) => /trafikolycka/i.test(i.title)));
    assert.ok(items.some((i) => /omvärldsbevakning/i.test(i.title)));
    assert.ok(!items.some((i) => /kakor/i.test(i.title)));
  });
});
