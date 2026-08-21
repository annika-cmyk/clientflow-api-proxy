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
    seen.add(href);
    out.push({ title, source_url: href });
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
  extractArticleLead
};
