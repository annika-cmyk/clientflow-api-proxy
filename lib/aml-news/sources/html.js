function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
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

module.exports = { extractLinks, stripHtml, decodeEntities, absolutize };
