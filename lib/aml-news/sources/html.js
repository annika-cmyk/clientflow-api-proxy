const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  aring: 'å',
  Auml: 'Ä',
  Ouml: 'Ö',
  Aring: 'Å',
  eacute: 'é',
  Eacute: 'É',
  ndash: '–',
  mdash: '—',
  hellip: '…'
};

const JUNK_LEAD = /kakor|cookies|surfa vidare|webbplatsen ska fungera|godkänner du att vi|hoppa till|till inneh[aå]ll|javascript m[aå]ste|din webbläsare|anv[aä]nder kakor|prenumerera på nyheter|e-posta till|box \d{3,}|^\d{3}\s?\d{2}\s+stockholm/i;

function decodeEntities(s) {
  return String(s || '')
    .replace(/&([a-zA-Z]+);/g, (m, name) => (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

const SV_MONTHS = {
  januari: 1, jan: 1, februari: 2, feb: 2, mars: 3, mar: 3, april: 4, apr: 4,
  maj: 5, juni: 6, jun: 6, juli: 7, jul: 7, augusti: 8, aug: 8,
  september: 9, sep: 9, oktober: 10, okt: 10, november: 11, nov: 11,
  december: 12, dec: 12
};

function isPlausiblePublishedMs(ms) {
  if (!Number.isFinite(ms)) return false;
  const min = Date.parse('1995-01-01T00:00:00.000Z');
  const max = Date.now() + (2 * 24 * 60 * 60 * 1000);
  return ms >= min && ms <= max;
}

function toIsoDate(raw) {
  const s = String(raw || '').trim();
  if (!s || /^invalid date$/i.test(s)) return '';
  const ms = Date.parse(s);
  if (!isPlausiblePublishedMs(ms)) return '';
  return new Date(ms).toISOString();
}

function isoFromParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day || 1);
  if (!y || y < 1995 || y > 2100 || !m || m < 1 || m > 12 || d < 1 || d > 31) return '';
  return toIsoDate(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00.000Z`);
}

function extractTrustedPublishedAtFromUrl(url) {
  const u = String(url || '');
  const ymd = u.match(/\/(20\d{2})[/_-](\d{1,2})[/_-](\d{1,2})(?:[/_-]|$)/);
  if (ymd) return isoFromParts(ymd[1], ymd[2], ymd[3]);
  const dash = u.match(/\/(20\d{2})-(\d{2})-(\d{2})(?:[/_-]|$)/);
  if (dash) return isoFromParts(dash[1], dash[2], dash[3]);
  return '';
}

function extractPublishedAtFromUrl(url) {
  const trusted = extractTrustedPublishedAtFromUrl(url);
  if (trusted) return trusted;
  const u = String(url || '');
  const ym = u.match(/\/(20\d{2})[/_-](\d{1,2})(?:[/_-]|$)/);
  if (ym && Number(ym[2]) >= 1 && Number(ym[2]) <= 12) return isoFromParts(ym[1], ym[2], 15);
  const year = u.match(/\/nyheter\/(20\d{2})(?:\/|$)/i) || u.match(/\/(20\d{2})\/[a-z0-9-]+\/?$/i);
  if (year) return isoFromParts(year[1], 6, 15);
  return '';
}

function extractPublishedAtFromText(text) {
  const src = String(text || '');
  const iso = src.match(/\b(20\d{2}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)\b/);
  if (iso) {
    const parsed = toIsoDate(iso[1]);
    if (parsed) return parsed;
  }
  const sv = src.match(/\b(\d{1,2})\s+(januari|jan|februari|feb|mars|mar|april|apr|maj|juni|jun|juli|jul|augusti|aug|september|sep|oktober|okt|november|nov|december|dec)\.?\s+(20\d{2})\b/i);
  if (sv) {
    const month = SV_MONTHS[sv[2].toLowerCase().replace(/\.$/, '')];
    return isoFromParts(sv[3], month, sv[1]);
  }
  return '';
}

const TRUSTED_PUBLISH_META = /^(article:published_time|og:published_time|pubdate|publishdate|publication_date|dc\.date\.issued|parsely-pub-date)$/;

const INDEX_URL_SEGMENTS = new Set([
  'aktuellt',
  'aktuellt.html',
  'hem',
  'home',
  'index',
  'index.html',
  'news',
  'nyheter',
  'nyheter.html',
  'om-oss',
  'press',
  'pressochmedia',
  'pressrum',
  'publications',
  'publications.html',
  'publikationer',
  'rapporter',
  'search',
  'search.html',
  'start'
]);

const EVERGREEN_SECTION_PATH = /\/polisens-arbete\/finanspolisen\/?$|high-risk-and-other-monitored-jurisdictions|\/samordningsfunktionen-mot-penningtvatt|\/penningtvatt-och-finansiering-av-terrorism\/?$|\/for-revisorer\/penningtvatt/i;

function extractTrustedPublishedAt(html, url) {
  const raw = String(html || '');
  const metaRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(raw))) {
    const tag = m[0];
    const name = ((tag.match(/(?:name|property|itemprop)=["']([^"']+)["']/i) || [])[1] || '').toLowerCase();
    if (!TRUSTED_PUBLISH_META.test(name)) continue;
    const content = (tag.match(/content=["']([^"']*)["']/i) || [])[1];
    const parsed = toIsoDate(content);
    if (parsed) return parsed;
  }
  const timeRe = /<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/gi;
  while ((m = timeRe.exec(raw))) {
    const parsed = toIsoDate(m[1]);
    if (parsed) return parsed;
  }
  return extractTrustedPublishedAtFromUrl(url);
}

function extractPublishedAt(html, url, title) {
  const trusted = extractTrustedPublishedAt(html, url);
  if (trusted) return trusted;
  const raw = String(html || '');
  const metaRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(raw))) {
    const tag = m[0];
    const name = ((tag.match(/(?:name|property|itemprop)=["']([^"']+)["']/i) || [])[1] || '').toLowerCase();
    if (!/^(date|dc\.date)$/.test(name)) continue;
    const content = (tag.match(/content=["']([^"']*)["']/i) || [])[1];
    const parsed = toIsoDate(content) || extractPublishedAtFromText(content);
    if (parsed) return parsed;
  }
  const fromHtml = extractPublishedAtFromText(stripHtml(raw.slice(0, 4000)));
  if (fromHtml) return fromHtml;
  const fromUrl = extractPublishedAtFromUrl(url);
  if (fromUrl) return fromUrl;
  return extractPublishedAtFromText(title);
}

function isIndexOrSectionUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return true;
  let path = '';
  try {
    path = new URL(raw).pathname.toLowerCase();
  } catch (_) {
    path = raw.toLowerCase().split('?')[0].split('#')[0];
  }
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/') return true;
  const last = (normalized.split('/').filter(Boolean).pop() || '');
  const lastStem = last.replace(/\.(html?|php|aspx)$/i, '');
  if (INDEX_URL_SEGMENTS.has(last) || INDEX_URL_SEGMENTS.has(lastStem)) return true;
  return EVERGREEN_SECTION_PATH.test(normalized);
}

function isGenericNewsTitle(title) {
  return /^(nyheter|aktuellt|press(meddelanden)?|news|publications?|publikationer)$/i.test(String(title || '').trim());
}

function isRealPublishedAt(value) {
  return !!toIsoDate(value);
}

function absolutize(href, base) {
  try {
    return new URL(href, base).toString();
  } catch (_) {
    return href;
  }
}

function extractLinks(html, baseUrl, opts = {}) {
  const minLen = opts.minTitleLength || 12;
  const seen = new Set();
  const out = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const href = absolutize(m[1], baseUrl);
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, ' '));
    if (!title || title.length < minLen) continue;
    if (seen.has(href)) continue;
    if (opts.hrefIncludes && !opts.hrefIncludes.some((p) => href.includes(p))) continue;
    if (opts.titleOrHrefRe && !opts.titleOrHrefRe.test(title + ' ' + href)) continue;
    if (isIndexOrSectionUrl(href) || isGenericNewsTitle(title)) continue;
    seen.add(href);
    const around = String(html || '').slice(Math.max(0, m.index - 500), Math.min(String(html || '').length, m.index + m[0].length + 500));
    const published_at = extractTrustedPublishedAt(around, href);
    out.push({ title, source_url: href, published_at });
  }
  return out;
}

const POLISEN_AML_REPORTS_URL = 'https://polisen.se/om-polisen/samordning-mot-penningtvatt-och-finansiering-av-terrorism/rapporter/';
const FINANSPOLISEN_PAGE_URL = 'https://polisen.se/om-polisen/polisens-arbete/finanspolisen/';

const POLISEN_REPORT_HINT = /omv[aä]rldsbevak|nationell[- _]?riskbed|national[- _]risk[- _]assessment|penningtv[aä]tt|penningstv[aä]tt|money[- ]launder|finansiering av terrorism|terroristfinans|terrorist financ|terrorfinans|hawala|neobank|visselbl[aå]s|whistleblow|finanspolisen informerar|finanpolisen informerar|fipo[-_ ]?informerar|modusrapport|cashing out|professional money launder|kryptovaluta|crypto exchange|utsatta omr[aå]den|v[aä]xlingskontor|betaltj[aä]nst|spelmarknad|underground banking|klientmedels|partihandel|bilhandel|bec-bedr[aä]geri|skuldebrev|falska (kontrakt|individ)|sj[aä]lvst[aä]ndigt f[oö]rverkande|otillb[oö]rliga kontakter|visa direct|politisk utsatt|utf[oö]rsel av kontanter/i;

const POLISEN_REPORT_SKIP = /kakor|h[aä]ndelsenotis|se [aä]ven publikation|till startsidan|s[aå] h[aä]r anv[aä]nder|rapporteringen ska ske|uppdraget som fiu|finanspolisens portal|lag\s*\(\s*20\d{2}:\d+|g[aå] direkt|visselbl[aå]sarfunktion|f[oö]lja oss|facebook|linkedin|@polisen\.se/i;

function isPolisenDocumentUrl(href) {
  const u = String(href || '').toLowerCase();
  if (!u || u.startsWith('mailto:') || u.startsWith('javascript:') || u.startsWith('tel:')) return false;
  if (/\.pdf(\?|#|$)/.test(u)) return true;
  if (/\/siteassets\/|\/contentassets\//.test(u)) return true;
  if (/sns\.se\/|bra\.se\/|riksdagen\.se\//.test(u)) return true;
  return false;
}

function cleanPolisenReportTitle(title) {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\((?:pdf|docx?|xlsx?)[,\s][^)]*\)\s*$/i, '')
    .trim();
}

function inferPolisenReportDate(title, href) {
  const hay = `${title || ''} ${href || ''}`;
  const nr = hay.match(/nr\s*(\d+)\s*[-_]\s*(\d{4})/i);
  if (nr) {
    const year = Number(nr[2]);
    const num = Math.min(4, Math.max(1, Number(nr[1])));
    const month = [2, 5, 8, 11][num - 1];
    return `${year}-${String(month).padStart(2, '0')}-01T12:00:00.000Z`;
  }
  const range = String(title || '').match(/\b(20\d{2})\s*\/\s*(20\d{2})\b/);
  if (range) return `${range[2]}-01-15T12:00:00.000Z`;
  const hrefYear = String(href || '').match(/(?:\/|_|-)(20\d{2})(?:[_./-])/);
  if (hrefYear) return `${hrefYear[1]}-06-01T12:00:00.000Z`;
  const titleYear = String(title || '').match(/\b(20\d{2})\b/);
  if (titleYear) return `${titleYear[1]}-06-01T12:00:00.000Z`;
  return '';
}

function isPolisenNavUrl(href) {
  const url = String(href || '').split('#')[0].replace(/\/$/, '');
  if (/\/aktuellt\/handelser\//i.test(url)) return true;
  if (/fipogoaml|svensk-forfattningssamling/i.test(url)) return true;
  if (/polisen\.se\/om-polisen\/samordning-mot-penningtvatt-och-finansiering-av-terrorism$/i.test(url)) return true;
  if (/polisen\.se\/om-polisen\/polisens-arbete\/finanspolisen$/i.test(url)) return true;
  return false;
}

function extractPolisenAmlReports(html, baseUrl) {
  const links = extractLinks(html, baseUrl, { minTitleLength: 8 });
  const seen = new Set();
  const out = [];
  for (const link of links) {
    const title = cleanPolisenReportTitle(link.title);
    const href = String(link.source_url || '').split('#')[0];
    if (title.length < 8) continue;
    if (!isPolisenDocumentUrl(href)) continue;
    if (POLISEN_REPORT_SKIP.test(title) || POLISEN_REPORT_SKIP.test(href)) continue;
    if (isPolisenNavUrl(href)) continue;
    if (!POLISEN_REPORT_HINT.test(`${title} ${href}`)) continue;
    const key = href.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      source_url: href,
      published_at: inferPolisenReportDate(title, href)
    });
  }
  return out;
}

function stripHtml(html) {
  return decodeEntities(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function clipSentences(text, max = 900) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (cut >= Math.floor(max * 0.4)) return slice.slice(0, cut + 1).trim();
  return `${slice.trim()}…`;
}

function metaContents(html, names) {
  const out = [];
  const re = /<meta\b[^>]*>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const tag = m[0];
    const name = ((tag.match(/(?:name|property)=["']([^"']+)["']/i) || [])[1] || '').toLowerCase();
    if (!names.includes(name)) continue;
    const content = (tag.match(/content=["']([^"']*)["']/i) || [])[1];
    const text = decodeEntities(content || '');
    if (text.length >= 40 && !JUNK_LEAD.test(text)) out.push(text);
  }
  return out;
}

function isNavDump(text) {
  const t = String(text || '');
  if (/Revision Bli revisor|För revisorer Tillsyn|Hem Press|Publicerat Regelverk|Om oss Karriär/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 8 && !/[.!?…]/.test(t)) {
    const caps = words.filter((w) => /^[A-ZÅÄÖ]/.test(w)).length;
    if (caps / words.length > 0.55) return true;
  }
  return false;
}

function paragraphTexts(html) {
  const out = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const attrs = m[1] || '';
    const prefer = /ingress|lead|preamble|intro|excerpt|article__ingress|news-ingress/i.test(attrs + m[2]);
    const text = stripHtml(m[2] || '');
    if (text.length < 40 || JUNK_LEAD.test(text) || isNavDump(text)) continue;
    out.push({ text, prefer });
  }
  return out;
}

function extractArticleLead(html, opts = {}) {
  const max = opts.maxLength || 900;
  const metas = metaContents(html, ['description', 'og:description']);
  const paras = paragraphTexts(html);
  const chunks = [];
  function add(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean || isNavDump(clean) || JUNK_LEAD.test(clean)) return;
    const lower = clean.toLowerCase();
    for (let i = 0; i < chunks.length; i += 1) {
      const prev = chunks[i].toLowerCase();
      if (prev === lower) return;
      if (lower.startsWith(prev.replace(/\.\.+$/, '')) || lower.includes(prev.replace(/\.\.+$/, ''))) {
        if (clean.length > chunks[i].length) chunks[i] = clean;
        return;
      }
      if (prev.includes(lower)) return;
    }
    chunks.push(clean);
  }
  metas.forEach(add);
  paras.filter((p) => p.prefer).forEach((p) => add(p.text));
  for (const p of paras.filter((row) => !row.prefer)) {
    add(p.text);
    if (chunks.join(' ').length >= Math.floor(max * 0.85)) break;
  }
  let lead = chunks.filter((c) => !isNavDump(c)).join(' ');
  if (lead.length < 80) lead = stripHtml(html);
  lead = lead.replace(/\s+/g, ' ').trim();
  if (JUNK_LEAD.test(lead.slice(0, 80))) {
    const skipped = chunks.filter((c) => !JUNK_LEAD.test(c)).join(' ');
    if (skipped.length >= 80) lead = skipped;
  }
  return clipSentences(lead, max);
}

module.exports = {
  extractLinks,
  extractPolisenAmlReports,
  inferPolisenReportDate,
  cleanPolisenReportTitle,
  POLISEN_AML_REPORTS_URL,
  FINANSPOLISEN_PAGE_URL,
  stripHtml,
  decodeEntities,
  absolutize,
  clipSentences,
  extractArticleLead,
  extractPublishedAt,
  extractPublishedAtFromUrl,
  extractTrustedPublishedAtFromUrl,
  extractTrustedPublishedAt,
  extractPublishedAtFromText,
  isIndexOrSectionUrl,
  isGenericNewsTitle,
  toIsoDate,
  isRealPublishedAt
};
