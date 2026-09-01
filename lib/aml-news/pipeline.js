/**
 * Tre oberoende lager. Anropa dem var för sig — ingen gemensam agentloop.
 */
const { ingestSources } = require('./ingest');
const { classifyItem, needsAiSummary, heuristicClassify } = require('./classify');
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

/**
 * Klassificera pending-poster. Vid LLM-fel sparas heuristik så samma post
 * inte bränner tokens om och om igen.
 */
async function runClassifyLayer({ store, completeJson, limit = 20, classifiedAt, onFallback }) {
  if (!store || typeof store.listUnclassified !== 'function') {
    throw new Error('runClassifyLayer kräver store.listUnclassified');
  }
  if (typeof completeJson !== 'function') {
    throw new Error('runClassifyLayer kräver completeJson (ett enda LLM-anrop per post)');
  }
  const all = typeof store.list === 'function' ? await store.list() : await store.listUnclassified();
  const pending = (all || []).filter((row) => isRelevantForConsultants(row) && needsAiSummary(row));
  const slice = pending.slice(0, Math.max(0, Number(limit) || 0));
  const results = [];
  let fallbacks = 0;
  for (const item of slice) {
    try {
      const cls = await classifyItem(item, { completeJson, classifiedAt });
      await store.saveClassification(item.id, cls);
      results.push({ id: item.id, ok: true });
    } catch (err) {
      const msg = err.message || String(err);
      try {
        const fallback = {
          ...heuristicClassify(item),
          classified_at: classifiedAt || new Date().toISOString()
        };
        await store.saveClassification(item.id, fallback);
        fallbacks += 1;
        if (typeof onFallback === 'function') onFallback(item, err);
        results.push({ id: item.id, ok: true, fallback: true, error: msg });
      } catch (saveErr) {
        results.push({ id: item.id, ok: false, error: msg, saveError: saveErr.message || String(saveErr) });
      }
    }
  }
  return {
    layer: 'classify',
    attempted: slice.length,
    classified: results.filter((r) => r.ok && !r.fallback).length,
    fallbacks,
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
