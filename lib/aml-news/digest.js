function sinceCutoff(iso, fallbackDays = 7) {
  if (iso) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return new Date(Date.now() - fallbackDays * 24 * 60 * 60 * 1000);
}

function selectDigestItems(items, opts = {}) {
  const minTier = opts.minTier || 'medium';
  const since = sinceCutoff(opts.since, opts.fallbackDays);
  const rank = { low: 1, medium: 2, high: 3 };
  const min = rank[minTier] || 2;
  return (items || [])
    .filter((row) => (rank[row.relevance_tier] || 0) >= min)
    .filter((row) => {
      const published = Date.parse(row.published_at || row.fetched_at || row.classified_at || 0);
      return Number.isNaN(published) || published >= since.getTime();
    })
    .sort((a, b) => String(b.published_at || b.fetched_at || '').localeCompare(String(a.published_at || a.fetched_at || '')));
}

function shouldSendWeeklyDigest(now, lastSentAt, opts = {}) {
  const weekday = typeof opts.weekday === 'number' ? opts.weekday : 1; // Monday
  const d = now instanceof Date ? now : new Date(now);
  if (d.getUTCDay() !== weekday) return false;
  if (!lastSentAt) return true;
  const last = Date.parse(lastSentAt);
  if (Number.isNaN(last)) return true;
  return d.getTime() - last >= 6 * 24 * 60 * 60 * 1000;
}

function buildDigestPayload(firm, items) {
  const selected = selectDigestItems(items, { since: firm.lastDigestAt, minTier: 'medium' });
  return {
    firm_id: firm.firmId || firm.byraId,
    byraNamn: firm.byraNamn || '',
    recipients: firm.recipients || [],
    items: selected,
    shouldSend: selected.length > 0
  };
}

module.exports = {
  selectDigestItems,
  shouldSendWeeklyDigest,
  buildDigestPayload
};
