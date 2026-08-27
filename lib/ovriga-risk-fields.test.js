const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SCHEMA_FIELDS, applyOvrigExtraAirtableFields } = require('./ovriga-risk-fields');

describe('ovriga-risk-fields', () => {
  it('gör PT/TF obligatoriskt i skapa- och redigeraformuläret', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.match(html, /id="pt-tf"[^>]*required/);
    assert.match(html, /id="edit-pt-tf"[^>]*required/);
    assert.match(html, /Välj PT eller TF/);
    assert.match(js, /requirePtTf/);
    assert.match(js, /PT\/TF-relevans är obligatorisk/);
  });

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
    assert.match(putChunk, /aktuellOnlyToggle/);
  });
});
