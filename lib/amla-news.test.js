const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseRssItems,
  mergeRssItems,
  isRelevantForAgency,
  selectAgencyNews,
  buildAmlaNewsPayload,
  localizeItem,
  AMLA_RSS_URLS
} = require('./amla-news');

const KEEP_TITLES = [
  'Press Release: AMLA consults on harmonised risk assessments  in the non-financial sector',
  'Press Release: AMLA introduces a common EU approach to enforcing anti-money laundering rules',
  'Press Release: AMLA concludes public hearing on draft guidelines on ongoing monitoring of business relationships',
  'Press Release: AMLA launches public consultation on common format for reporting suspicions',
  'Press Release: AMLA and EDPB to develop Joint Guidelines on partnerships for information sharing',
  'Advisory note on money laundering risks as the MiCAR transitional period ends',
  'AMLA consults on draft Guidelines on ongoing monitoring of business relationships',
  'AMLA concludes public hearing on draft Guidelines on business-wide risk assessment',
  'AMLA concludes public hearing on draft RTS on group-wide requirements'
];

const DROP_TITLES = [
  'AMLA launches survey on Central Contact Points',
  'EBA publishes draft reporting framework for the 2027 eligibility data collection',
  'Press Release: AMLA finalises common formats for FIU cooperation and reporting to the EPPO',
  'Frequently asked questions on the reporting package for identifying provisionally eligible entities',
  'Press Release: AMLA finalises standards for supervisory cooperation in direct supervision',
  'Updated taxonomy for the 2027 risk assessment data collection',
  'AMLA Chair presents 2025 Consolidated Annual Activity Report to the European Parliament',
  'Press Release: AMLA consults on clear rules for cross-border FIU information exchanges',
  'AMLA Chair presents 2025 Consolidated Annual Activity Report to the European Parliament',
  'First AMLA Conference Recap: Key Moments and Insights',
  'AMLA Successfully Concludes its First Conference',
  'First AMLA Conference',
  'Webinar materials now available: identifying obliged entities eligible for direct supervision',
  'AMLA takes next step toward 2027 selection of entities for direct supervision',
  'AMLA hosts webinar on identification of entities eligible for direct supervision',
  'AMLA Executive Board Member Rikke-Louise Petersen interviewed by ACAMS moneylaundering.com',
  'AMLA Hosts its First Conference',
  'AMLA Executive Board Member Rikke-Louise Petersen opens ACAMS General Assembly in Frankfurt',
  'AMLA holds public hearings to consult on draft ITS for FIU cooperation',
  'AMLA Chair Bruna Szego speaks at ACAMS Germany 10th Anniversary event in Berlin',
  'AMLA Chair Bruna Szego addresses European Police Congress in Berlin',
  'AMLA Executive Director Nicolas Vasse speaks at ACPR\'s Rencontres Anti-Blanchiment in Paris'
];

const SAMPLE_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<item>
  <title>Press Release: AMLA consults on harmonised risk assessments  in the non-financial sector</title>
  <link>https://www.amla.europa.eu/non-financial</link>
  <guid>https://www.amla.europa.eu/node/258</guid>
  <description>&lt;p&gt;A shared methodology across the EU.&lt;/p&gt;</description>
  <pubDate>Mon, 13 Jul 2026 14:18:24 +0200</pubDate>
</item>
<item>
  <title>AMLA launches survey on Central Contact Points</title>
  <link>https://www.amla.europa.eu/ccp</link>
  <guid>https://www.amla.europa.eu/node/268</guid>
  <description>&lt;p&gt;EMIs and PSPs feedback on CCP.&lt;/p&gt;</description>
  <pubDate>Thu, 06 Aug 2026 09:29:05 +0200</pubDate>
</item>
<item>
  <title>AMLA concludes public hearing on draft Guidelines on business-wide risk assessment</title>
  <link>https://www.amla.europa.eu/bwra</link>
  <guid>https://www.amla.europa.eu/node/232</guid>
  <description>&lt;p&gt;Public hearing on BWRA.&lt;/p&gt;</description>
  <pubDate>Fri, 29 May 2026 11:02:03 +0200</pubDate>
</item>
</channel></rss>`;

describe('amla-news filter', () => {
  it('behåller nyheter som rör redovisningsbyråers PTL-arbete', () => {
    for (const title of KEEP_TITLES) {
      assert.equal(isRelevantForAgency({ title, description: '' }), true, title);
    }
  });

  it('filtrerar bort bank-, FIU- och evenemangsnyheter', () => {
    for (const title of DROP_TITLES) {
      assert.equal(isRelevantForAgency({ title, description: '' }), false, title);
    }
  });
});

describe('amla-news parse + localize', () => {
  it('parsear RSS-poster och tar bort HTML', () => {
    const items = parseRssItems(SAMPLE_RSS);
    assert.equal(items.length, 3);
    assert.equal(items[0].guid, 'https://www.amla.europa.eu/node/258');
    assert.equal(items[0].description, 'A shared methodology across the EU.');
  });

  it('bygger svensk payload utan CCP-enkät', () => {
    const payload = buildAmlaNewsPayload(SAMPLE_RSS, { lang: 'sv', fetchedAt: '2026-08-19T00:00:00.000Z' });
    assert.equal(payload.total, 3);
    assert.equal(payload.shown, 2);
    assert.equal(payload.lang, 'sv');
    assert.ok(payload.items.every((i) => !/central contact|ccp/i.test(i.titleEn)));
    const nf = payload.items.find((i) => /non-financial/i.test(i.titleEn));
    assert.ok(nf);
    assert.match(nf.title, /icke-finansiella/);
    assert.match(nf.summary, /redovisningsbyråer/);
  });

  it('kan visa original på engelska', () => {
    const item = localizeItem({
      title: KEEP_TITLES[0],
      description: 'A shared methodology across the EU.',
      link: 'https://example.com',
      guid: 'g1',
      pubDate: 'Mon, 13 Jul 2026 14:18:24 +0200'
    }, 'en');
    assert.equal(item.lang, 'en');
    assert.match(item.title, /non-financial sector/i);
    assert.equal(item.summary, 'A shared methodology across the EU.');
  });

  it('sorterar nyast först', () => {
    const items = selectAgencyNews(parseRssItems(SAMPLE_RSS), 'sv');
    assert.equal(items.length, 2);
    assert.ok(items[0].publishedAt > items[1].publishedAt);
  });

  it('slår ihop två RSS-flöden och tar bort dubbletter', () => {
    const extra = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>Press Release: AMLA consults on harmonised risk assessments  in the non-financial sector</title>
        <link>https://www.amla.europa.eu/non-financial</link>
        <guid>https://www.amla.europa.eu/node/258</guid>
        <description>Duplicate from news-articles feed.</description>
        <pubDate>Mon, 13 Jul 2026 14:18:24 +0200</pubDate>
      </item>
      <item>
        <title>AMLA consults on draft Guidelines on ongoing monitoring of business relationships</title>
        <link>https://www.amla.europa.eu/monitoring</link>
        <guid>https://www.amla.europa.eu/node/235</guid>
        <description>Only in the news-articles feed.</description>
        <pubDate>Wed, 03 Jun 2026 16:01:30 +0200</pubDate>
      </item>
    </channel></rss>`;
    const merged = mergeRssItems([SAMPLE_RSS, extra]);
    assert.equal(merged.length, 4);
    const payload = buildAmlaNewsPayload([SAMPLE_RSS, extra], { lang: 'sv' });
    assert.equal(payload.total, 4);
    assert.equal(payload.shown, 3);
    assert.ok(AMLA_RSS_URLS.includes('https://www.amla.europa.eu/node/19/rss_en'));
    assert.ok(payload.items.some((i) => /löpande uppföljning/i.test(i.title)));
  });
});
