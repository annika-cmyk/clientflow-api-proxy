const { AMLA_RSS_URLS, isRelevantForAgency } = require('../../amla-news');
const { fetchRssSource } = require('./rss');
const { extractLinks, stripHtml } = require('./html');

const AML_HINT = /penningtv[aä]tt|aml|kyc|ptl|finansiering av terrorism|terroristfinans|högrisk|hogrisk|fatf|kundk[aä]nnedom|misstanke|rapportering|redovisningskonsult|revisorsinspekt|ekonomisk brott|organiserad brott|svartarbete|momsbedr[aä]geri|verklig huvudman|bokf[oö]ring/i;
const SRF_HINT = /penningtv|ptl|aml|kyc|kundk[aä]nnedom|redovisning|bokf[oö]ring|konsult|revisor|rådgiv|radgiv|kvalitet|etik|lag/i;
const SKV_HINT = /penningtv|organiserad brott|ekonomisk brott|krypto|momsbedr[aä]geri|svartarbete|bokf[oö]ring|redovisning|kontrolluppgift|verklig huvudman|ubo|mekanismen|konto- och v[aä]rdefack|aml6|sj[aä]tte penningtv/i;

function listingAdapter(id, pages, opts = {}) {
  return {
    id,
    async fetch({ fetchText }) {
      const items = [];
      for (const page of pages) {
        try {
          const html = await fetchText(page);
          const links = extractLinks(html, page, {
            hrefIncludes: opts.hrefIncludes,
            titleOrHrefRe: opts.titleOrHrefRe || (opts.requireAmlHint === false ? null : AML_HINT),
            minTitleLength: opts.minTitleLength || 16
          });
          for (const link of links.slice(0, opts.limit || 12)) {
            items.push({
              source: id,
              source_url: link.source_url,
              title: link.title,
              published_at: '',
              raw_content: stripHtml(link.title)
            });
          }
        } catch (_) {
          /* isolated per page */
        }
      }
      return items;
    }
  };
}

const SOURCES = [
  {
    id: 'amla',
    async fetch({ fetchText }) {
      const rows = await fetchRssSource('amla', AMLA_RSS_URLS, fetchText);
      return rows.filter((row) => isRelevantForAgency({ title: row.title, description: row.raw_content }));
    }
  },
  {
    id: 'eurlex',
    async fetch({ fetchText }) {
      const urls = [
        'https://eur-lex.europa.eu/search.html?scope=EURLEX&text=%222016%2F1675%22&lang=en&type=quick&DTS_SUBDOM=LEGISLATION'
      ];
      const items = [];
      for (const page of urls) {
        try {
          const html = await fetchText(page);
          const links = extractLinks(html, page, {
            hrefIncludes: ['eur-lex.europa.eu'],
            titleOrHrefRe: /2016\/1675|high-risk third countr|h[oö]grisk/i,
            minTitleLength: 20
          });
          for (const link of links.slice(0, 15)) {
            items.push({
              source: 'eurlex',
              source_url: link.source_url,
              title: link.title,
              published_at: '',
              raw_content: link.title
            });
          }
        } catch (_) {}
      }
      return items;
    }
  },
  {
    id: 'fatf',
    async fetch({ fetchText }) {
      const pages = [
        'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html',
        'https://www.fatf-gafi.org/en/publications.html'
      ];
      const items = [];
      for (const page of pages) {
        try {
          const html = await fetchText(page);
          const links = extractLinks(html, page, {
            hrefIncludes: ['fatf-gafi.org'],
            titleOrHrefRe: /call for action|increased monitoring|high-risk|grey|black|public statement|jurisdictions under/i,
            minTitleLength: 18
          });
          for (const link of links.slice(0, 10)) {
            items.push({
              source: 'fatf',
              source_url: link.source_url,
              title: link.title,
              published_at: '',
              raw_content: link.title
            });
          }
        } catch (_) {}
      }
      return items;
    }
  },
  listingAdapter('lansstyrelsen', [
    'https://www.lansstyrelsen.se/stockholm/om-oss/pressrum/nyheter.html',
    'https://www.lansstyrelsen.se/vastra-gotaland/om-oss/pressrum/nyheter.html',
    'https://www.lansstyrelsen.se/skane/om-oss/pressrum/nyheter.html'
  ], { hrefIncludes: ['lansstyrelsen.se'] }),
  {
    id: 'finanspolisen',
    async fetch({ fetchText }) {
      const rss = await fetchRssSource('finanspolisen', [
        'https://polisen.se/aktuellt/rss/hela-landet/nyheter-hela-landet/'
      ], fetchText);
      const filtered = rss.filter((item) => AML_HINT.test(`${item.title} ${item.raw_content}`));
      if (filtered.length) return filtered;
      return listingAdapter('finanspolisen', [
        'https://polisen.se/om-polisen/organisation/sarskilda-organisationer/finanspolisen/'
      ], { hrefIncludes: ['polisen.se'] }).fetch({ fetchText });
    }
  },
  listingAdapter('samordningsfunktionen', [
    'https://www.regeringen.se/regeringens-politik/samordningsfunktionen-mot-penningtvatt-och-finansiering-av-terrorism/'
  ], { hrefIncludes: ['regeringen.se'], requireAmlHint: false }),
  listingAdapter('revisorsinspektionen', [
    'https://www.revisorsinspektionen.se/publikationer/nyheter/'
  ], { hrefIncludes: ['revisorsinspektionen.se'] }),
  listingAdapter('srf', [
    'https://www.srfkonsulterna.se/om-srf/nyheter/',
    'https://www.srfkonsulterna.se/nyheter/'
  ], { hrefIncludes: ['srfkonsulterna.se'], titleOrHrefRe: SRF_HINT, requireAmlHint: false }),
  {
    id: 'skatteverket',
    async fetch({ fetchText }) {
      const rss = await fetchRssSource('skatteverket', [
        'https://www.skatteverket.se/omoss/pressochmedia/nyheter.4.76a43be412206334b89800020843.html?rss=true'
      ], fetchText);
      const filteredRss = rss.filter((item) => SKV_HINT.test(`${item.title} ${item.raw_content}`));
      if (filteredRss.length) return filteredRss.slice(0, 15);
      return listingAdapter('skatteverket', [
        'https://www.skatteverket.se/omoss/pressochmedia/nyheter/2026.4.1522bf3f19aea8075ba98e.html',
        'https://www.skatteverket.se/omoss/pressochmedia/nyheter.html'
      ], {
        hrefIncludes: ['skatteverket.se'],
        titleOrHrefRe: SKV_HINT,
        requireAmlHint: false,
        limit: 15
      }).fetch({ fetchText });
    }
  },
  listingAdapter('ekobrottsmyndigheten', [
    'https://www.ekobrottsmyndigheten.se/aktuellt/'
  ], { hrefIncludes: ['ekobrottsmyndigheten.se'], titleOrHrefRe: AML_HINT, requireAmlHint: false })
];

function getSource(id) {
  return SOURCES.find((s) => s.id === id) || null;
}

module.exports = { SOURCES, getSource, AML_HINT, SRF_HINT, SKV_HINT };
