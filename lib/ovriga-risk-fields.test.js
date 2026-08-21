const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SCHEMA_FIELDS, applyOvrigExtraAirtableFields } = require('./ovriga-risk-fields');

describe('ovriga-risk-fields', () => {
  it('listar Riskpoäng och PT/TF-relevans som extra schemafält', () => {
    assert.deepEqual(SCHEMA_FIELDS.map((f) => f.name), ['Riskpoäng', 'PT/TF-relevans']);
  });

  it('lägger extra fält ovanpå mappade Airtable-fält', () => {
    const out = applyOvrigExtraAirtableFields({
      Riskfaktor: 'Kontanter',
      'Riskpoäng': '{"sannolikhet":3}',
      'PT/TF-relevans': 'TF'
    }, { fldBXz24TIPi0dayY: 'Kontanter' });
    assert.equal(out.fldBXz24TIPi0dayY, 'Kontanter');
    assert.equal(out.Riskpoäng, '{"sannolikhet":3}');
    assert.equal(out['PT/TF-relevans'], 'TF');
  });

  it('PUT-vägen droppar okända namn och försöker skapa extra fält', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /applyOvrigExtraAirtableFields/);
    assert.match(index, /ensureAirtableTableFields/);
    assert.match(index, /writeAirtableFieldsRetryUnknown/);
    assert.match(index, /dropUnknown:\s*true/);
    const putChunk = index.slice(index.indexOf("app.put('/api/risk-factors/:id'"));
    assert.match(putChunk, /dropUnknown:\s*true/);
    assert.match(putChunk, /ensureAirtableTableFields/);
    assert.match(putChunk, /writeAirtableFieldsRetryUnknown/);
  });
});
