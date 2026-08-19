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

const JUNK_LEAD = /kakor|cookies|surfa vidare|webbplatsen ska fungera|godkänner du att vi|hoppa till|till inneh[aå]ll|javascript m[aå]ste|din webbläsare|anv[aä]nder kakor/i;

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

function paragraphTexts(html) {
  const out = [];
  const re = /<(?:p|h2|h3|div)\b([^>]*)>([\s\S]*?)<\/(?:p|h2|h3|div)>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const attrs = m[1] || '';
    const prefer = /ingress|lead|preamble|intro|preamble|article__ingress|news-ingress/i.test(attrs);
    const text = stripHtml(m[2] || '');
    if (text.length < 40 || JUNK_LEAD.test(text)) continue;
    out.push({ text, prefer });
  }
  return out;
}

function extractArticleLead(html, opts = {}) {
  const max = opts.maxLength || 900;
  const metas = metaContents(html, ['description', 'og:description']);
  const paras = paragraphTexts(html);
  const chunks = [];
  const seen = new Set();
  function add(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean || seen.has(clean.toLowerCase())) return;
    if ([...seen].some((prev) => prev.includes(clean.toLowerCase()) || clean.toLowerCase().includes(prev))) {
      if (clean.length <= 80) return;
    }
    seen.add(clean.toLowerCase());
    chunks.push(clean);
  }
  metas.forEach(add);
  paras.filter((p) => p.prefer).forEach((p) => add(p.text));
  paras.filter((p) => !p.prefer).forEach((p) => add(p.text));
  let lead = chunks.join(' ');
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
  stripHtml,
  decodeEntities,
  absolutize,
  clipSentences,
  extractArticleLead
};
