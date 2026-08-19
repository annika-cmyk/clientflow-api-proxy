/**
 * AMLA-nyheter för redovisningsbyråer: parsea RSS, filtrera bort
 * bank-/FIU-/tillsynsadministrativa poster och lokalisera titel/sammanfattning.
 */

const AMLA_RSS_URL = 'https://www.amla.europa.eu/node/14/rss_en';
const AMLA_RSS_URLS = [
  'https://www.amla.europa.eu/node/14/rss_en',
  'https://www.amla.europa.eu/node/19/rss_en'
];

const EXCLUDE = [
  /central contact point|\bccp\b|electronic money|payment service provider|\b\s*emis?\b|\bpsps?\b/i,
  /eligib(?:le|ility).*(direct supervision|data collection)|provisionally eligible|reporting package/i,
  /direct supervision|supervisory cooperation in direct/i,
  /reporting framework|updated taxonomy|data model and taxonomy|(?:risk assessment )?data collection/i,
  /\bfiu\b|eppo|financial intelligence unit/i,
  /annual activity report|european parliament/i,
  /\bconference\b|webinar materials|hosts webinar|speaking engagement/i,
  /speaks at|addresses |interviewed|keynote|opens acams|general assembly/i,
  /successfully concludes its first|hosts its first conference|first amla conference/i
];

const INCLUDE = [
  { topic: 'non_financial', re: /non-financial sector|icke-finansiella/i },
  { topic: 'ongoing_monitoring', re: /ongoing monitoring/i },
  { topic: 'suspicion_reporting', re: /reporting suspicions|common format for reporting/i },
  { topic: 'enforcement', re: /enforcing anti-money laundering|enforcing breaches|common eu approach to enforcing/i },
  { topic: 'info_sharing', re: /information sharing|partnerships for information|edpb/i },
  { topic: 'micar', re: /micar|mica\b|crypto-asset/i },
  { topic: 'bwra', re: /business-wide risk assessment|\bbwra\b/i },
  { topic: 'group_wide', re: /group-wide requirements/i }
];

const SV_BY_TITLE = {
  'press release: amla consults on harmonised risk assessments in the non-financial sector': {
    title: 'AMLA samråder om enhetliga riskbedömningar i den icke-finansiella sektorn',
    summary: 'AMLA vill ha synpunkter på utkast till regler för hur tillsynsmyndigheter i varje EU-land ska bedöma penningtvätts- och finansieringsrisker hos företag och yrkesutövare i den icke-finansiella sektorn – bland annat redovisningsbyråer.'
  },
  'press release: amla introduces a common eu approach to enforcing anti-money laundering rules': {
    title: 'AMLA inför ett gemensamt EU-sätt att tillämpa penningtvättsreglerna',
    summary: 'För första gången ska tillsynsmyndigheter i hela EU använda samma metod när de hanterar överträdelser av reglerna mot penningtvätt och finansiering av terrorism.'
  },
  'press release: amla concludes public hearing on draft guidelines on ongoing monitoring of business relationships': {
    title: 'AMLA har hållit utfrågning om riktlinjer för löpande uppföljning av kundrelationer',
    summary: 'Den 2 juli 2026 höll AMLA en offentlig utfrågning om riktlinjer för löpande uppföljning av affärsrelationer – en del av EU:s nya penningtvättsregelverk och det riskbaserade arbetssättet.'
  },
  'press release: amla launches public consultation on common format for reporting suspicions': {
    title: 'AMLA samråder om ett gemensamt format för att rapportera misstankar',
    summary: 'AMLA vill ha synpunkter på utkast till standarder som enhetliggör hur företag och yrkesutövare rapporterar misstankar inom EU.'
  },
  'press release: amla and edpb to develop joint guidelines on partnerships for information sharing': {
    title: 'AMLA och EDPB tar fram gemensamma riktlinjer för informationsdelning',
    summary: 'AMLA och Europeiska dataskyddsstyrelsen (EDPB) samarbetar för att förtydliga hur information kan delas för att bekämpa ekonomisk brottslighet utan att bryta mot dataskyddet.'
  },
  'advisory note on money laundering risks as the micar transitional period ends': {
    title: 'Rådgivande notis om penningtvättsrisker när MiCA-övergångsperioden tar slut',
    summary: 'AMLA har publicerat en rådgivande notis om penningtvätts- och finansieringsrisker kopplade till att övergångsperioden enligt MiCA upphörde den 1 juli 2026. Relevant om kunder hanterar kryptoaccesser.'
  },
  'amla consults on draft guidelines on ongoing monitoring of business relationships': {
    title: 'AMLA samråder om riktlinjer för löpande uppföljning av kundrelationer',
    summary: 'AMLA har inlett ett samråd om hur skyldiga aktörer ska följa upp sina affärsrelationer, inklusive transaktioner och aktiviteter.'
  },
  'amla concludes public hearing on draft guidelines on business-wide risk assessment': {
    title: 'AMLA har hållit utfrågning om verksamhetsövergripande riskbedömning',
    summary: 'Den 28 maj 2026 höll AMLA en offentlig utfrågning om riktlinjer för verksamhetsövergripande riskbedömning (BWRA) – motsvarigheten till byråns allmänna riskbedömning.'
  },
  'amla concludes public hearing on draft rts on group-wide requirements': {
    title: 'AMLA har hållit utfrågning om koncerngemensamma krav',
    summary: 'Den 20 maj 2026 höll AMLA en offentlig utfrågning om utkast till tekniska standarder om koncerngemensamma penningtvättskrav, med över 650 deltagare.'
  }
};

const PHRASE_SV = [
  [/Press Release:\s*/gi, 'Pressmeddelande: '],
  [/public consultation/gi, 'offentligt samråd'],
  [/public hearing/gi, 'offentlig utfrågning'],
  [/draft Guidelines/gi, 'utkast till riktlinjer'],
  [/draft guidelines/gi, 'utkast till riktlinjer'],
  [/business relationships/gi, 'kundrelationer'],
  [/ongoing monitoring/gi, 'löpande uppföljning'],
  [/non-financial sector/gi, 'den icke-finansiella sektorn'],
  [/money laundering/gi, 'penningtvätt'],
  [/terrorist financing|terrorism financing/gi, 'finansiering av terrorism'],
  [/obliged entities/gi, 'skyldiga aktörer'],
  [/risk assessments?/gi, 'riskbedömning'],
  [/anti-money laundering rules/gi, 'penningtvättsregler']
];

function normalizeTitle(title) {
  return String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function decodeXml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function stripHtml(s) {
  return decodeXml(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(xml, tag) {
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'));
  if (cdata) return cdata[1];
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : '';
}

function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const block = m[1];
    const title = stripHtml(extractTag(block, 'title'));
    const link = decodeXml(extractTag(block, 'link')) || decodeXml(extractTag(block, 'guid'));
    const guid = decodeXml(extractTag(block, 'guid')) || link;
    const description = stripHtml(extractTag(block, 'description'));
    const pubDate = decodeXml(extractTag(block, 'pubDate'));
    items.push({ title, link, guid, description, pubDate });
  }
  return items;
}

function itemDedupeKey(item) {
  const guid = String(item && item.guid || '').trim().toLowerCase();
  if (guid) return 'guid:' + guid;
  const link = String(item && item.link || '').trim().toLowerCase();
  if (link) return 'link:' + link;
  return 'title:' + normalizeTitle(item && item.title);
}

function mergeRssItems(xmlOrList) {
  const xmls = Array.isArray(xmlOrList) ? xmlOrList : [xmlOrList];
  const seen = new Set();
  const merged = [];
  for (const xml of xmls) {
    for (const item of parseRssItems(xml)) {
      const key = itemDedupeKey(item);
      if (!item.title || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function classifyNewsItem(item) {
  const hay = `${item.title || ''} ${item.description || ''}`;
  for (const re of EXCLUDE) {
    if (re.test(hay)) {
      return { keep: false, topic: null, reason: 'irrelevant_for_agency' };
    }
  }
  for (const row of INCLUDE) {
    if (row.re.test(hay)) {
      return { keep: true, topic: row.topic, reason: row.topic };
    }
  }
  return { keep: false, topic: null, reason: 'no_agency_topic' };
}

function isRelevantForAgency(item) {
  return classifyNewsItem(item).keep;
}

function translatePhrases(text) {
  let out = String(text || '');
  for (const [re, sv] of PHRASE_SV) out = out.replace(re, sv);
  return out.replace(/\s+/g, ' ').trim();
}

function localizeItem(item, lang) {
  const classification = classifyNewsItem(item);
  const titleEn = item.title || '';
  const summaryEn = item.description || '';
  const curated = SV_BY_TITLE[normalizeTitle(titleEn)];
  const useSv = lang !== 'en';
  let title = titleEn;
  let summary = summaryEn;
  let translated = false;
  if (useSv && curated) {
    title = curated.title;
    summary = curated.summary;
    translated = true;
  } else if (useSv) {
    title = translatePhrases(titleEn);
    summary = translatePhrases(summaryEn);
    translated = title !== titleEn || summary !== summaryEn;
  }
  return {
    id: item.guid || item.link,
    guid: item.guid || item.link,
    link: item.link,
    pubDate: item.pubDate || '',
    publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    title,
    summary,
    titleEn,
    summaryEn,
    lang: useSv ? 'sv' : 'en',
    translated,
    topic: classification.topic,
    reason: classification.reason
  };
}

function selectAgencyNews(items, lang) {
  const locale = lang === 'en' ? 'en' : 'sv';
  return (items || [])
    .filter(isRelevantForAgency)
    .map((item) => localizeItem(item, locale))
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
}

function buildAmlaNewsPayload(xmlOrList, opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'sv';
  const parsed = mergeRssItems(xmlOrList);
  const kept = selectAgencyNews(parsed, lang);
  const sources = Array.isArray(opts.sources) && opts.sources.length ? opts.sources : AMLA_RSS_URLS;
  return {
    source: sources[0],
    sources,
    sourceLabel: 'AMLA',
    lang,
    fetchedAt: opts.fetchedAt || new Date().toISOString(),
    total: parsed.length,
    shown: kept.length,
    items: kept
  };
}

module.exports = {
  AMLA_RSS_URL,
  AMLA_RSS_URLS,
  parseRssItems,
  mergeRssItems,
  itemDedupeKey,
  classifyNewsItem,
  isRelevantForAgency,
  localizeItem,
  selectAgencyNews,
  buildAmlaNewsPayload,
  normalizeTitle
};
