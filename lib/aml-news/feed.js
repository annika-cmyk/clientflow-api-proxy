const { heuristicClassify, isThinSummary } = require('./classify');
const { matchNewsToProfil } = require('./match');
const { isRelevantForConsultants } = require('./sources');
const { extractPublishedAt, extractPublishedAtFromText, isRealPublishedAt, toIsoDate } = require('./sources/html');

const TIER_RANK = { low: 1, medium: 2, high: 3 };
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_NEWS_AGE_DAYS = 540;

function yearsInText(text) {
  const years = [];
  const re = /\b(20\d{2})\b/g;
  let m;
  const src = String(text || '');
  while ((m = re.exec(src))) years.push(Number(m[1]));
  return years;
}

function resolvePublishedAt(row) {
  if (isRealPublishedAt(row.published_at)) return toIsoDate(row.published_at) || row.published_at;
  return extractPublishedAt('', row.source_url, row.title)
    || extractPublishedAtFromText(`${row.raw_content || ''} ${row.summary_sv || ''}`)
    || '';
}

function isRecentNews(row, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) return true;
  const minMs = nowMs - MAX_NEWS_AGE_DAYS * DAY_MS;
  const minYear = new Date(minMs).getUTCFullYear();
  const resolved = resolvePublishedAt(row);
  if (resolved) {
    const ms = Date.parse(resolved);
    if (Number.isFinite(ms)) return ms >= minMs;
  }
  const years = yearsInText(`${row.title || ''} ${row.raw_content || ''} ${row.summary_sv || ''}`);
  if (years.length) return Math.max(...years) >= minYear;
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

function attachRelevance(item, profil) {
  const classified = ensureClassification(item);
  const match = matchNewsToProfil(classified, profil);
  return { ...classified, ...match };
}

function filterFeed(items, query = {}) {
  const category = String(query.category || '').trim();
  const severity = String(query.severity || '').trim();
  const minTier = String(query.minTier || 'medium').trim() || 'medium';
  const q = String(query.q || '').trim().toLowerCase();
  const min = TIER_RANK[minTier] || TIER_RANK.medium;
  const now = query.now ? new Date(query.now) : new Date();
  return (items || []).filter((row) => {
    if (!isRelevantForConsultants(row)) return false;
    if (!isRecentNews(row, now)) return false;
    if (category && row.category !== category) return false;
    if (severity && row.severity !== severity) return false;
    if ((TIER_RANK[row.relevance_tier] || 0) < min) return false;
    if (q) {
      const hay = `${row.title || ''} ${row.summary_sv || ''} ${row.source || ''} ${row.source_url || ''} ${(row.reasons || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortChronological(items) {
  return [...(items || [])].sort((a, b) => {
    const da = Date.parse(a.published_at || a.fetched_at || 0) || 0;
    const db = Date.parse(b.published_at || b.fetched_at || 0) || 0;
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
    relevanceScore: row.relevance_score,
    relevanceTier: row.relevance_tier,
    reasons: row.reasons || [],
    classifiedAt: row.classified_at || ''
  };
}

function buildFirmFeed(items, profil, query) {
  const matched = (items || []).map((item) => attachRelevance(item, profil));
  return sortChronological(filterFeed(matched, query)).map(toPublicItem);
}

module.exports = {
  TIER_RANK,
  ensureClassification,
  attachRelevance,
  filterFeed,
  sortChronological,
  resolvePublishedAt,
  isRecentNews,
  MAX_NEWS_AGE_DAYS,
  toPublicItem,
  buildFirmFeed
};
