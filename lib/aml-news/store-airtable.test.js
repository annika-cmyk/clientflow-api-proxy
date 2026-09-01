'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toClassificationFields, toFields } = require('./store-airtable');

describe('store-airtable classification fields', () => {
  it('toClassificationFields inkluderar bara klassningsfält', () => {
    const fields = toClassificationFields({
      category: 'lagandring',
      severity: 'informativ',
      summary_sv: 'En längre sammanfattning för redovisningsbyråer om vad som gäller.',
      affected_industries: ['bygg'],
      affected_geography: ['se'],
      classified_at: '2026-09-01T12:00:00.000Z'
    });
    assert.equal(fields.category, 'lagandring');
    assert.equal(fields.classified_at, '2026-09-01T12:00:00.000Z');
    assert.equal(fields.source, undefined);
    assert.equal(fields.title, undefined);
    assert.equal(fields.content_hash, undefined);
    assert.equal(fields.raw_content, undefined);
  });

  it('toFields för upsert behåller identitet separat från klassning', () => {
    const fields = toFields({
      source: 'finanspolisen',
      source_url: 'https://example.com/x',
      title: 'Omvärldsbevakning',
      content_hash: 'abc',
      raw_content: 'text'
    });
    assert.equal(fields.source, 'finanspolisen');
    assert.equal(fields.content_hash, 'abc');
  });
});
