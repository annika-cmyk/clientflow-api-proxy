const { heuristicClassify, isThinSummary } = require('./classify');
const { isRelevantForConsultants } = require('./sources');
const {
  extractPublishedAt,
  extractPublishedAtFromText,
  extractTrustedPublishedAtFromUrl,
  isIndexOrSectionUrl,
  isGenericNewsTitle,
  isTopicPageTitle,
  isNewsArticleUrl,
  isRealPublishedAt,
  toIsoDate
} = require('./sources/html');

const RSS_NEWS_SOURCES = new Set(['amla']);

const DAY_MS = 24 * 60 * 60 * 1000;
const NEWS_FEED_START = '2026-09-01';

function resolvePublishedAt(row) {
  if (isRealPublishedAt(row.published_at)) return toIsoDate(row.published_at) || row.published_at;
  return extractPublishedAt('', row.source_url, row.title)
    || extractPublishedAtFromText(`${row.raw_content || ''} ${row.summary_sv || ''}`)
    || '';
}

function trustedPublishedAt(row) {
  const fromUrl = extractTrustedPublishedAtFromUrl(row && row.source_url);
  if (fromUrl) return fromUrl;
  if (!isNewsArticleItem(row)) return '';
  if (isRealPublishedAt(row && row.published_at)) {
    return toIsoDate(row.published_at) || row.published_at;
  }
  return '';
}

function isNewsArticleItem(row) {
  if (!row) return false;
  if (isGenericNewsTitle(row.title)) return false;
  if (isIndexOrSectionUrl(row.source_url)) return false;
  if (isNewsArticleUrl(row.source_url)) return true;
  if (isTopicPageTitle(row.title)) return false;
  return RSS_NEWS_SOURCES.has(row.source) && isRealPublishedAt(row.published_at);
}

function isRecentNews(row, now = new Date()) {
  if (!isNewsArticleItem(row)) return false;
  const published = trustedPublishedAt(row);
  if (!published) return false;
  const ms = Date.parse(published);
  if (!Number.isFinite(ms)) return false;
  const startMs = Date.parse(`${NEWS_FEED_START}T00:00:00.000Z`);
  if (Number.isFinite(startMs) && ms < startMs) return false;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (Number.isFinite(nowMs) && ms > nowMs + (2 * DAY_MS)) return false;
  return true;
}

function ensureClassification(item) {
  const hasAi = item && item.classified_at && String(item.summary_sv || '').trim() && !isThinSummary(item);
  if (hasAi) return item;
  const hasCls = item && item.category && item.severity && String(item.summary_sv || '').trim();
  if (!hasCls) return { ...item, ...heuristicClassify(item) };
  if (!isThinSummary(item)) return item;
  const heuristic = heuristicClassify(item);
  return {
    ...item,
    ...heuristic,
    category: item.category,
    severity: item.severity,
    summary_sv: heuristic.summary_sv
  };
}

function filterFeed(items, query = {}) {
  const category = String(query.category || '').trim();
  const severity = String(query.severity || '').trim();
  const q = String(query.q || '').trim().toLowerCase();
  const now = query.now ? new Date(query.now) : new Date();
  return (items || []).filter((row) => {
    if (!isRelevantForConsultants(row)) return false;
    if (!isRecentNews(row, now)) return false;
    if (category && row.category !== category) return false;
    if (severity && row.severity !== severity) return false;
    if (q) {
      const hay = `${row.title || ''} ${row.summary_sv || ''} ${row.source || ''} ${row.source_url || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortChronological(items) {
  return [...(items || [])].sort((a, b) => {
    const da = Date.parse(trustedPublishedAt(a) || a.published_at || 0) || 0;
    const db = Date.parse(trustedPublishedAt(b) || b.published_at || 0) || 0;
    if (db !== da) return db - da;
    return String(b.title || '').localeCompare(String(a.title || ''), 'sv');
  });
}

function toPublicItem(row) {
  return {
    id: row.id || row.content_hash,
    source: row.source || '',
    sourceUrl: row.source_url || '',
    title: row.title || '',
    publishedAt: resolvePublishedAt(row),
    summary: row.summary_sv || '',
    summaryKind: row.classified_at ? 'ai' : 'excerpt',
    category: row.category || '',
    severity: row.severity || '',
    affectedIndustries: row.affected_industries || [],
    affectedGeography: row.affected_geography || [],
    classifiedAt: row.classified_at || ''
  };
}

function buildFirmFeed(items, _profil, query) {
  const classified = (items || []).map(ensureClassification);
  return sortChronological(filterFeed(classified, query)).map(toPublicItem);
}

module.exports = {
  ensureClassification,
  filterFeed,
  sortChronological,
  resolvePublishedAt,
  trustedPublishedAt,
  isNewsArticleItem,
  isRecentNews,
  NEWS_FEED_START,
  toPublicItem,
  buildFirmFeed
};
