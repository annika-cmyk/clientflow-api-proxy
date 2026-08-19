const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildFirmFeed, filterFeed, attachRelevance } = require('./feed');

const PROFIL = {
  byraId: 'B1',
  branscherKundstock: 'Bygg',
  geografiskMarknad: 'Sverige',
  andelInternationellHandel: 20
};

const ITEMS = [
  {
    id: '1',
    title: 'EU högrisklista',
    source: 'eurlex',
    source_url: 'https://eur-lex.example/1',
    published_at: '2026-08-18T00:00:00.000Z',
    category: 'hogriskstater',
    severity: 'kraver_atgard',
    summary_sv: 'EU har uppdaterat förteckningen över högriskländer.',
    affected_industries: [],
    affected_geography: ['ru']
  },
  {
    id: '2',
    title: 'Allmänt tips',
    source: 'srf',
    source_url: 'https://srf.example/2',
    published_at: '2026-08-17T00:00:00.000Z',
    category: 'ovrigt',
    severity: 'informativ',
    summary_sv: 'Allmän information utan tydlig åtgärd för byrån idag.',
    affected_industries: [],
    affected_geography: []
  },
  {
    id: '3',
    title: 'Byggvägledning',
    source: 'lansstyrelsen',
    source_url: 'https://lst.example/3',
    published_at: '2026-08-16T00:00:00.000Z',
    category: 'branschspecifik',
    severity: 'informativ',
    summary_sv: 'Ny vägledning för byggbranschens kundkännedom.',
    affected_industries: ['bygg'],
    affected_geography: ['se']
  }
];

describe('feed (layer 3 + filter)', () => {
  it('filtrerar bort låg relevans som standard', () => {
    const feed = buildFirmFeed(ITEMS, PROFIL, {});
    assert.ok(feed.every((i) => i.relevanceTier !== 'low'));
    assert.ok(feed.some((i) => i.id === '1'));
    assert.ok(!feed.some((i) => i.id === '2'));
  });

  it('filtrerar på kategori och sökord', () => {
    const matched = ITEMS.map((item) => attachRelevance(item, PROFIL));
    const onlyBygg = filterFeed(matched, { category: 'branschspecifik', minTier: 'low' });
    assert.equal(onlyBygg.length, 1);
    assert.equal(onlyBygg[0].id, '3');
    const search = filterFeed(matched, { q: 'högrisk', minTier: 'low' });
    assert.equal(search.length, 1);
    assert.equal(search[0].id, '1');
  });

  it('lägger på förklaringar så centralt funktionsansvarig ser varför', () => {
    const feed = buildFirmFeed(ITEMS, PROFIL, { minTier: 'low' });
    const high = feed.find((i) => i.id === '1');
    assert.ok(high.reasons.length);
    assert.match(high.reasons.join(' '), /högrisk|internationell/i);
  });

  it('ersätter titel-sammanfattning med längre artikeltext', () => {
    const feed = buildFirmFeed([{
      id: '4',
      title: 'Återkomma till yrket',
      source: 'revisorsinspektionen',
      source_url: 'https://ri.example/aterkomma',
      published_at: '2026-08-19T00:00:00.000Z',
      category: 'lagandring',
      severity: 'informativ',
      summary_sv: 'Återkomma till yrket',
      raw_content: 'Här hittar du information om vad som gäller för den som tidigare har varit auktoriserad eller godkänd revisor och vill återkomma till yrket. De grundläggande kraven för auktorisation gäller fortfarande.',
      affected_industries: [],
      affected_geography: ['se']
    }], PROFIL, { minTier: 'low' });
    assert.equal(feed.length, 1);
    assert.notEqual(feed[0].summary, 'Återkomma till yrket');
    assert.ok(feed[0].summary.length > 80);
  });
});
