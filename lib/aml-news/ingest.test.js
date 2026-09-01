const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ingestSources, upsertItems, normalizeRawItem } = require('./ingest');
const { contentHash } = require('./hash');
const { createMemoryStore } = require('./store-memory');

describe('ingest (layer 1)', () => {
  it('är idempotent på content_hash', () => {
    const a = normalizeRawItem({
      source: 'amla',
      source_url: 'https://example.com/a',
      title: 'Samma nyhet',
      raw_content: 'text'
    }, '2026-08-19T00:00:00.000Z');
    const b = normalizeRawItem({
      source: 'amla',
      source_url: 'https://example.com/a',
      title: 'Samma nyhet',
      raw_content: 'text'
    }, '2026-08-20T00:00:00.000Z');
    assert.equal(a.content_hash, b.content_hash);
    assert.equal(a.content_hash, contentHash(a));
    const once = upsertItems([], [a, b]);
    assert.equal(once.inserted, 1);
    const twice = upsertItems(once.items, [a]);
    assert.equal(twice.inserted, 0);
    assert.equal(twice.items.length, 1);
  });

  it('isolerar källfel och slår ihop lyckade adapters', async () => {
    const sources = [
      {
        id: 'ok',
        async fetch() {
          return [{ source: 'ok', source_url: 'https://www.fatf-gafi.org/en/news/grey-list', title: 'FATF grey list', published_at: '2026-09-01T12:00:00.000Z', raw_content: 'x' }];
        }
      },
      {
        id: 'broken',
        async fetch() { throw new Error('timeout'); }
      }
    ];
    const out = await ingestSources({ sources, fetchText: async () => '' });
    assert.equal(out.items.length, 1);
    assert.equal(out.errors.length, 1);
    assert.equal(out.errors[0].source, 'broken');
  });

  it('memory store skapar inte dubbletter vid omkörning', async () => {
    const store = createMemoryStore();
    const item = normalizeRawItem({
      source: 'fatf',
      source_url: 'https://fatf/x',
      title: 'Call for action',
      raw_content: 'Iran'
    }, '2026-08-19T00:00:00.000Z');
    assert.equal((await store.upsertMany([item])).inserted, 1);
    assert.equal((await store.upsertMany([item])).inserted, 0);
    assert.equal((await store.list()).length, 1);
  });

  it('hämtar artikeltext när listningen bara har titeln', async () => {
    const out = await ingestSources({
      fetchedAt: '2026-08-19T00:00:00.000Z',
      sources: [{
        id: 'revisorsinspektionen',
        async fetch() {
          return [{
            source: 'revisorsinspektionen',
            source_url: 'https://www.revisorsinspektionen.se/publikationer/nyheter/2026/aterkomma-till-yrket/',
            title: 'Återkomma till yrket',
            published_at: '2026-09-01T12:00:00.000Z',
            raw_content: 'Återkomma till yrket'
          }];
        }
      }],
      fetchText: async (url) => {
        if (!String(url).includes('aterkomma-till-yrket')) return '';
        return `
          <meta name="description" content="Här hittar du information om vad som gäller för den som tidigare har varit auktoriserad eller godkänd revisor och vill återkomma till yrket.">
          <p>På revisorsinspektionen.se använder vi kakor (cookies) för att webbplatsen ska fungera.</p>
          <p>Om du tidigare har varit auktoriserad revisor och vill återkomma till yrket så gäller de grundläggande kraven för auktorisation.</p>
        `;
      }
    });
    assert.equal(out.items.length, 1);
    assert.ok(out.items[0].raw_content.length > 80);
    assert.notEqual(out.items[0].raw_content, 'Återkomma till yrket');
    assert.match(out.items[0].raw_content, /auktoriserad|godkänd revisor/i);
  });

  it('uppdaterar kort raw_content för samma url utan att skapa dubblett', () => {
    const short = normalizeRawItem({
      source: 'ri',
      source_url: 'https://ri.example/x',
      title: 'Nyhet',
      raw_content: 'Nyhet'
    }, '2026-08-19T00:00:00.000Z');
    const long = {
      ...short,
      raw_content: 'Nyheten förklarar hur byrån ska hantera ny vägledning om kundkännedom och rapportering.'
    };
    const first = upsertItems([], [short]);
    const second = upsertItems(first.items, [long]);
    assert.equal(second.inserted, 0);
    assert.equal(second.items.length, 1);
    assert.match(second.items[0].raw_content, /kundkännedom/);
  });

  it('hoppar över arkivsidor äldre än nyhetsfönstret', async () => {
    const out = await ingestSources({
      fetchedAt: '2026-09-01T10:00:00.000Z',
      now: '2026-09-01T10:00:00.000Z',
      skipEnrich: true,
      sources: [{
        id: 'finanspolisen',
        async fetch() {
          return [{
            source: 'finanspolisen',
            source_url: 'https://polisen.se/om-polisen/polisens-arbete/finanspolisen/',
            title: 'Utredningen Stärkta åtgärder mot penningtvätt',
            published_at: '2019-06-15T12:00:00.000Z',
            raw_content: 'Kommittédirektiv Fi 2019:08.'
          }, {
            source: 'finanspolisen',
            source_url: 'https://polisen.se/aktuellt/nyheter.html',
            title: 'Nyheter',
            published_at: '2026-09-01T08:00:00.000Z',
            raw_content: 'Startsida för nyheter, en mening justerad.'
          }, {
            source: 'finanspolisen',
            source_url: 'https://polisen.se/aktuellt/penningtvatt-2026/',
            title: 'Ny vägledning om rapportering',
            published_at: '',
            raw_content: 'Finanspolisen uppdaterar rapporteringsrutinen.'
          }, {
            source: 'finanspolisen',
            source_url: 'https://polisen.se/aktuellt/2026/09/01/ny-vagledning-om-rapportering/',
            title: 'Ny vägledning om rapportering',
            published_at: '2026-09-01T08:00:00.000Z',
            raw_content: 'Finanspolisen publicerar ny vägledning om rapportering.'
          }];
        }
      }],
      fetchText: async () => ''
    });
    assert.equal(out.items.length, 1);
    assert.match(out.items[0].title, /Ny vägledning/);
    assert.match(out.items[0].source_url, /2026\/09\/01/);
  });

  it('fyller i publiceringsdatum på en redan sparad nyhet', () => {
    const undated = normalizeRawItem({
      source: 'ri',
      source_url: 'https://ri.example/webbinarium',
      title: 'Webbinarium om finansiering av terrorism',
      raw_content: 'Webbinariet hålls den 19 april och handlar om finansiering av terrorism.'
    }, '2026-08-25T10:00:00.000Z');
    const dated = { ...undated, published_at: '2025-04-19T08:00:00.000Z' };
    const first = upsertItems([], [undated]);
    const second = upsertItems(first.items, [dated]);
    assert.equal(second.inserted, 0);
    assert.match(second.items[0].published_at, /^2025-04-19/);
  });
});
