const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ingestSources, upsertItems, normalizeRawItem } = require('./ingest');
const { contentHash } = require('./hash');
const { createMemoryStore } = require('./store-memory');

describe('ingest (layer 1)', () => {
  it('är idempotent på content_hash', () => {
    const a = normalizeRawItem({
      source: 'amla',
      source_url: 'https://example.com/a',
      title: 'Samma nyhet',
      raw_content: 'text'
    }, '2026-08-19T00:00:00.000Z');
    const b = normalizeRawItem({
      source: 'amla',
      source_url: 'https://example.com/a',
      title: 'Samma nyhet',
      raw_content: 'text'
    }, '2026-08-20T00:00:00.000Z');
    assert.equal(a.content_hash, b.content_hash);
    assert.equal(a.content_hash, contentHash(a));
    const once = upsertItems([], [a, b]);
    assert.equal(once.inserted, 1);
    const twice = upsertItems(once.items, [a]);
    assert.equal(twice.inserted, 0);
    assert.equal(twice.items.length, 1);
  });

  it('isolerar källfel och slår ihop lyckade adapters', async () => {
    const sources = [
      {
        id: 'ok',
        async fetch() {
          return [{ source: 'ok', source_url: 'https://ex/1', title: 'FATF grey list', raw_content: 'x' }];
        }
      },
      {
        id: 'broken',
        async fetch() { throw new Error('timeout'); }
      }
    ];
    const out = await ingestSources({ sources, fetchText: async () => '' });
    assert.equal(out.items.length, 1);
    assert.equal(out.errors.length, 1);
    assert.equal(out.errors[0].source, 'broken');
  });

  it('memory store skapar inte dubbletter vid omkörning', async () => {
    const store = createMemoryStore();
    const item = normalizeRawItem({
      source: 'fatf',
      source_url: 'https://fatf/x',
      title: 'Call for action',
      raw_content: 'Iran'
    }, '2026-08-19T00:00:00.000Z');
    assert.equal((await store.upsertMany([item])).inserted, 1);
    assert.equal((await store.upsertMany([item])).inserted, 0);
    assert.equal((await store.list()).length, 1);
  });
});
