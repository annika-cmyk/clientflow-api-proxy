const { extractArticleLead } = require('./sources/html');
const { isThinSummary } = require('./classify');

function normalizeText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function newsItemNeedsBody(item) {
  const title = normalizeText(item && item.title);
  const raw = normalizeText(item && item.raw_content);
  if (!raw || raw.length < 80) return true;
  return isThinSummary({ title, summary_sv: raw });
}

function withTimeout(promise, ms) {
  if (!ms) return promise;
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    })
  ]);
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: items.length ? n : 0 }, () => worker()));
  return out;
}

function isArticleUrl(url) {
  const u = String(url || '').toLowerCase();
  if (!u.startsWith('http')) return false;
  if (/rss=true|\.xml(\?|$)|\/search\.html|\/nyheter\/?$|\/aktuellt\/?$|\/publications\/?$/.test(u)) return false;
  return true;
}

async function enrichItemsWithArticleBodies(items, fetchText, opts = {}) {
  const concurrency = opts.concurrency || 6;
  const rows = items || [];
  return mapPool(rows, concurrency, async (item) => {
    if (!newsItemNeedsBody(item) || typeof fetchText !== 'function') return item;
    if (!isArticleUrl(item.source_url)) return item;
    try {
      const html = await withTimeout(fetchText(item.source_url), opts.timeoutMs || 6000);
      const lead = extractArticleLead(html, { maxLength: opts.maxLength || 1200 });
      if (!lead || lead.length < 80) return item;
      if (isThinSummary({ title: item.title, summary_sv: lead })) return item;
      return { ...item, raw_content: lead };
    } catch (_) {
      return item;
    }
  });
}

module.exports = { newsItemNeedsBody, enrichItemsWithArticleBodies, isArticleUrl };
