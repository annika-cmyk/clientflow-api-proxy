/**
 * Tre oberoende lager. Anropa dem var för sig — ingen gemensam agentloop.
 */
const { ingestSources } = require('./ingest');
const { classifyItem, needsAiSummary } = require('./classify');
const { isRelevantForConsultants } = require('./sources');
const { matchNewsToProfil } = require('./match');

async function runIngestLayer({ fetchText, store, sources, fetchedAt }) {
  if (!store || typeof store.upsertMany !== 'function') {
    throw new Error('runIngestLayer kräver store.upsertMany');
  }
  const ingested = await ingestSources({ fetchText, sources, fetchedAt });
  const upsert = await store.upsertMany(ingested.items);
  return {
    layer: 'ingest',
    inserted: upsert.inserted,
    fetched: ingested.items.length,
    errors: ingested.errors,
    fetchedAt: ingested.fetchedAt
  };
}

async function runClassifyLayer({ store, completeJson, limit = 20, classifiedAt, isEligible, selectCandidates, onSuccess, onFailure }) {
  if (!store || typeof store.listUnclassified !== 'function') {
    throw new Error('runClassifyLayer kräver store.listUnclassified');
  }
  if (typeof completeJson !== 'function') {
    throw new Error('runClassifyLayer kräver completeJson (ett enda LLM-anrop per post)');
  }
  const all = typeof store.list === 'function' ? await store.list() : await store.listUnclassified();
  const pending = (all || []).filter((row) => {
    if (!isRelevantForConsultants(row) || !needsAiSummary(row)) return false;
    if (typeof isEligible === 'function' && !isEligible(row)) return false;
    return true;
  });
  const slice = typeof selectCandidates === 'function'
    ? selectCandidates(pending, { limit: Math.max(0, Number(limit) || 0) })
    : pending.slice(0, Math.max(0, Number(limit) || 0));
  const results = [];
  for (const item of slice) {
    try {
      const cls = await classifyItem(item, { completeJson, classifiedAt });
      await store.saveClassification(item.id, cls);
      if (typeof onSuccess === 'function') onSuccess(item, cls);
      results.push({ id: item.id, ok: true });
    } catch (err) {
      if (typeof onFailure === 'function') onFailure(item, err);
      results.push({ id: item.id, ok: false, error: err.message || String(err) });
    }
  }
  return {
    layer: 'classify',
    attempted: slice.length,
    classified: results.filter((r) => r.ok).length,
    results
  };
}

function runMatchLayer(items, profil) {
  return (items || []).map((item) => ({
    ...matchNewsToProfil(item, profil),
    news_item_id: item.id || item.content_hash || null
  }));
}

module.exports = { runIngestLayer, runClassifyLayer, runMatchLayer };
