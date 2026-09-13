const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SCHEMA_FIELDS, applyOvrigExtraAirtableFields, isRiskFactorLightPatch } = require('./ovriga-risk-fields');

describe('ovriga-risk-fields', () => {
  it('klassificerar lätta katalog-/statuspatchar utan PT/TF', () => {
    const { isRiskFactorLightPatch } = require('./ovriga-risk-fields');
    assert.equal(isRiskFactorLightPatch({ Aktuell: true }), true);
    assert.equal(isRiskFactorLightPatch({ 'Typ av riskfaktor': 'Riskfaktorer kopplat till kund' }), true);
    assert.equal(isRiskFactorLightPatch({ Riskfaktor: 'Kontanter' }), true);
    assert.equal(isRiskFactorLightPatch({
      Riskfaktor: 'Kontanter',
      'Typ av riskfaktor': 'Riskfaktorer kopplat till kund'
    }), true);
    assert.equal(isRiskFactorLightPatch({}), false);
    assert.equal(isRiskFactorLightPatch({ Riskfaktor: 'X', 'PT/TF-relevans': 'PT' }), false);
    assert.equal(isRiskFactorLightPatch({ Riskfaktor: 'X', Riskpoäng: '{}' }), false);
  });

  it('sidladdningsmigreringar skickar minimal PUT-payload', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.match(js, /migrateRenamedRiskFactorLabels[\s\S]*?\{\s*Riskfaktor:\s*canonical\s*\}/);
    assert.match(js, /migrateMisplacedKundTransactionFactors[\s\S]*?\{\s*'Typ av riskfaktor':\s*want\s*\}/);
    assert.match(js, /migrateRenamedGeoTyp[\s\S]*?\{\s*'Typ av riskfaktor':\s*newTyp\s*\}/);
    assert.doesNotMatch(js, /migrateRenamedRiskFactorLabels[\s\S]*?\{\s*\.\.\.fields,\s*Riskfaktor:/);
    assert.doesNotMatch(js, /migrateMisplacedKundTransactionFactors[\s\S]*?\{\s*\.\.\.fields,\s*'Typ av riskfaktor'/);
    assert.doesNotMatch(js, /migrateRenamedGeoTyp[\s\S]*?\{\s*\.\.\.fields,\s*'Typ av riskfaktor'/);
  });
  it('gör PT/TF obligatoriskt i skapa- och redigeraformuläret', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.match(html, /id="pt-tf"[^>]*required/);
    assert.match(html, /id="edit-pt-tf"[^>]*required/);
    assert.match(html, /Välj PT eller TF/);
    assert.match(js, /requirePtTf/);
    assert.match(js, /PT\/TF-relevans är obligatorisk/);
  });

  it('listar Riskpoäng, PT/TF-relevans och Aktuell som extra schemafält', () => {
    assert.deepEqual(SCHEMA_FIELDS.map((f) => f.name), ['Riskpoäng', 'PT/TF-relevans', 'Aktuell']);
  });

  it('sparar Aktuell som checkbox via fältnamn (inte ogiltigt fldAktuell)', () => {
    const out = applyOvrigExtraAirtableFields({ Aktuell: true }, { fldBXz24TIPi0dayY: 'Ombud' });
    assert.equal(out.Aktuell, true);
    assert.equal(out.fldAktuell, undefined);
    assert.equal(out.fldBXz24TIPi0dayY, 'Ombud');
    const off = applyOvrigExtraAirtableFields({ Aktuell: false }, {});
    assert.equal(off.Aktuell, false);
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
    assert.match(putChunk, /isRiskFactorLightPatch/);
    assert.match(putChunk, /lightPatch/);
    assert.doesNotMatch(putChunk, /fldAktuell/);
    assert.match(putChunk, /!lightPatch && rejectRiskWithoutMotivering/);
  });
});
