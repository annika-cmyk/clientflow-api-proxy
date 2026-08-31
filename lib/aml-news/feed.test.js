const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildFirmFeed, filterFeed, attachRelevance, toPublicItem } = require('./feed');

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
      title: 'Ekonomisk brottslighet och penningtvätt',
      source: 'revisorsinspektionen',
      source_url: 'https://www.revisorsinspektionen.se/publikationer/nyheter/2026/ekonomisk-brottslighet-och-penningtvatt/',
      published_at: '2026-08-19T00:00:00.000Z',
      category: 'lagandring',
      severity: 'informativ',
      summary_sv: 'Ekonomisk brottslighet och penningtvätt',
      raw_content: 'I detta nyhetsbrev sammanfattar Revisorsinspektionen iakttagelser från tillsynen kring ekonomisk brottslighet och penningtvätt och ger exempel på användbara informationslänkar.',
      affected_industries: [],
      affected_geography: ['se']
    }], PROFIL, { minTier: 'low' });
    assert.equal(feed.length, 1);
    assert.notEqual(feed[0].summary, 'Ekonomisk brottslighet och penningtvätt');
    assert.ok(feed[0].summary.length > 80);
  });

  it('behåller AI-sammanfattning skriven till byrån', () => {
    const feed = buildFirmFeed([{
      id: '5',
      title: 'Ekonomisk brottslighet och penningtvätt',
      source: 'revisorsinspektionen',
      source_url: 'https://www.revisorsinspektionen.se/publikationer/nyheter/2026/ekonomisk-brottslighet-och-penningtvatt/',
      published_at: '2026-08-19T00:00:00.000Z',
      category: 'lagandring',
      severity: 'informativ',
      classified_at: '2026-08-19T12:00:00.000Z',
      summary_sv: 'Revisorsinspektionen samlar iakttagelser om penningtvätt. För byrån är det en påminnelse att hålla PTL-rutinerna aktuella även när kunden har revisor.',
      raw_content: 'I detta nyhetsbrev sammanfattar Revisorsinspektionen iakttagelser från tillsynen kring ekonomisk brottslighet och penningtvätt.',
      affected_industries: [],
      affected_geography: ['se']
    }], PROFIL, { minTier: 'low' });
    assert.match(feed[0].summary, /för byrån/i);
    assert.equal(feed[0].summaryKind, 'ai');
  });

  it('döljer RI-nyheter som inte rör AML eller ekonomisk brottslighet', () => {
    const feed = buildFirmFeed([
      {
        id: 'ri-career',
        title: 'Återkomma till yrket',
        source: 'revisorsinspektionen',
        source_url: 'https://www.revisorsinspektionen.se/bli-revisor/aterkomma-till-yrket/',
        published_at: '2026-08-19T00:00:00.000Z',
        category: 'lagandring',
        severity: 'informativ',
        summary_sv: 'Här hittar du information om vad som gäller för den som vill återkomma till yrket.',
        affected_industries: [],
        affected_geography: ['se']
      },
      {
        id: 'ri-aml',
        title: 'Revisorsinspektionen informerar – ekonomisk brottslighet och penningtvätt',
        source: 'revisorsinspektionen',
        source_url: 'https://www.revisorsinspektionen.se/publikationer/nyheter/2026/revisorsinspektionen-informerar---ekonomisk-brottslighet-och-penningtvatt/',
        published_at: '2026-08-18T00:00:00.000Z',
        category: 'lagandring',
        severity: 'informativ',
        summary_sv: 'Nyhetsbrev om penningtvättstillsyn.',
        affected_industries: [],
        affected_geography: ['se']
      }
    ], PROFIL, { minTier: 'low' });
    assert.ok(!feed.some((i) => i.id === 'ri-career'));
    assert.ok(feed.some((i) => i.id === 'ri-aml'));
  });

  it('visar inte hämtningsdatum som publiceringsdatum', () => {
    const shown = toPublicItem({
      id: 'old',
      title: 'Utredningen Stärkta åtgärder mot penningtvätt',
      source: 'finanspolisen',
      published_at: '',
      fetched_at: '2026-08-25T10:00:00.000Z',
      summary_sv: 'Kommittédirektiv 2019:80.',
      category: 'rapporteringsrutiner',
      severity: 'informativ'
    });
    assert.equal(shown.publishedAt, '');
    const dated = toPublicItem({
      id: 'dated',
      title: 'Webbinarium',
      published_at: '2025-04-19T08:00:00.000Z',
      fetched_at: '2026-08-25T10:00:00.000Z',
      summary_sv: 'Webbinariet hålls den 19 april.'
    });
    assert.match(dated.publishedAt, /^2025-04-19/);
  });

  it('härleder publiceringsår från käll-URL när datum saknas', () => {
    const shown = toPublicItem({
      id: 'ri-webbinarium',
      title: 'Webbinarium om finansiering av terrorism',
      source: 'revisorsinspektionen',
      source_url: 'https://www.revisorsinspektionen.se/publikationer/nyheter/2025/webbinarium-om-finansiering-av-terrorism/',
      published_at: '',
      fetched_at: '2026-08-25T10:00:00.000Z',
      summary_sv: 'Webbinariet hålls den 19 april.'
    });
    assert.match(shown.publishedAt, /^2025-/);
    assert.doesNotMatch(shown.publishedAt, /^2026-08-25/);
  });

  it('döljer arkivsidor från 2019–2020 som inte är aktuella nyheter', () => {
    const now = '2026-08-31T12:00:00.000Z';
    const feed = buildFirmFeed([
      {
        id: 'fi-2019',
        title: 'Utredningen Stärkta åtgärder mot penningtvätt och finansiering av terrorism, på riksdagens webbplats',
        source: 'finanspolisen',
        source_url: 'https://polisen.se/om-polisen/polisens-arbete/finanspolisen/',
        published_at: '',
        fetched_at: '2026-08-31T10:00:00.000Z',
        summary_sv: 'Kommittédirektiv Fi 2019:08 och 2019:80 samt 2020:122.',
        category: 'rapporteringsrutiner',
        severity: 'informativ',
        affected_industries: [],
        affected_geography: ['se']
      },
      {
        id: 'ri-2019',
        title: 'Tematillsyn penningtvätt',
        source: 'revisorsinspektionen',
        source_url: 'https://www.revisorsinspektionen.se/publikationer/nyheter/2019/tematillsyn-penningtvatt/',
        published_at: '',
        fetched_at: '2026-08-31T10:00:00.000Z',
        summary_sv: 'Tillsynen startar under våren 2019 och väntas avslutas under 2020.',
        category: 'lagandring',
        severity: 'informativ',
        affected_industries: [],
        affected_geography: ['se']
      },
      {
        id: 'fresh',
        title: 'EU högrisklista',
        source: 'eurlex',
        source_url: 'https://eur-lex.example/1',
        published_at: '2026-08-18T00:00:00.000Z',
        category: 'hogriskstater',
        severity: 'kraver_atgard',
        summary_sv: 'EU har uppdaterat förteckningen över högriskländer, inklusive hänvisning till 2016/1675.',
        affected_industries: [],
        affected_geography: ['ru']
      }
    ], PROFIL, { minTier: 'low', now });
    assert.ok(!feed.some((i) => i.id === 'fi-2019'));
    assert.ok(!feed.some((i) => i.id === 'ri-2019'));
    assert.ok(feed.some((i) => i.id === 'fresh'));
  });
});
