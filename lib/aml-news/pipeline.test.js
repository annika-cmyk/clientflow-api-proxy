const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStore } = require('./store-memory');
const { normalizeRawItem } = require('./ingest');
const { runIngestLayer, runClassifyLayer, runMatchLayer } = require('./pipeline');

describe('pipeline lager är oberoende', () => {
  it('ingest skriver bara råposter, classify anropar LLM en gång per post', async () => {
    const store = createMemoryStore();
    let llmCalls = 0;
    const ingest = await runIngestLayer({
      store,
      sources: [{
        id: 'fatf',
        async fetch() {
          return [{ source: 'fatf', source_url: 'https://fatf/x', title: 'Grey list update', published_at: '2026-09-01T12:00:00.000Z', raw_content: 'Iran remains' }];
        }
      }],
      fetchText: async () => '',
      fetchedAt: '2026-08-19T00:00:00.000Z'
    });
    assert.equal(ingest.layer, 'ingest');
    assert.equal(ingest.inserted, 1);
    const rows = await store.list();
    assert.equal(rows[0].category, undefined);

    const classify = await runClassifyLayer({
      store,
      completeJson: async () => {
        llmCalls += 1;
        return {
          category: 'hogriskstater',
          severity: 'informativ',
          summary_sv: 'FATF har uppdaterat listan över bevakade länder. För byrån betyder det att ni bör stämma av kunder med koppling till de nämnda staterna.',
          affected_industries: [],
          affected_geography: ['ir']
        };
      }
    });
    assert.equal(classify.layer, 'classify');
    assert.equal(llmCalls, 1);
    assert.equal((await store.list())[0].category, 'hogriskstater');
  });

  it('sparar heuristik-fallback vid LLM-fel så posten inte körs om', async () => {
    const store = createMemoryStore([{
      id: 'n1',
      source: 'finanspolisen',
      source_url: 'https://polisen.se/x',
      title: 'Ny information från myndigheten till byråer',
      raw_content: 'Ny information från myndigheten till byråer om rapportering.',
      content_hash: 'h1'
    }]);
    const classify = await runClassifyLayer({
      store,
      completeJson: async () => {
        throw new Error('Ogiltig klassificering från LLM');
      },
      limit: 5
    });
    assert.equal(classify.attempted, 1);
    assert.equal(classify.classified, 0);
    assert.equal(classify.fallbacks, 1);
    const row = (await store.list())[0];
    assert.ok(row.classified_at);
    assert.ok(row.summary_sv);
  });

  it('match körs utan LLM och ger samma resultat två gånger', () => {
    const item = {
      id: 'n1',
      category: 'lagandring',
      severity: 'informativ',
      affected_industries: [],
      affected_geography: ['se']
    };
    const profil = { byraId: 'B1', branscherKundstock: 'IT', geografiskMarknad: 'Sverige' };
    const a = runMatchLayer([item], profil);
    const b = runMatchLayer([item], profil);
    assert.deepEqual(a, b);
    assert.equal(a[0].relevance_tier, 'medium');
    assert.equal(a[0].firm_id, 'B1');
  });

  it('ingest är idempotent via store', async () => {
    const store = createMemoryStore();
    const item = normalizeRawItem({
      source: 'amla',
      source_url: 'https://amla/x',
      title: 'BWRA',
      published_at: '2026-09-01T12:00:00.000Z',
      raw_content: 'guidelines'
    }, '2026-08-19T00:00:00.000Z');
    await store.upsertMany([item]);
    const second = await runIngestLayer({
      store,
      sources: [{ id: 'amla', async fetch() { return [item]; } }],
      fetchText: async () => ''
    });
    assert.equal(second.inserted, 0);
    assert.equal((await store.list()).length, 1);
  });
});
