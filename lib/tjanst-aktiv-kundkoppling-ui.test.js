const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('tjanst-aktiv-kundkoppling routes', () => {
  const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const byraJs = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
  const kundJs = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');

  it('PUT tjanst-utforande avvisar inaktivering när kunder är kopplade', () => {
    assert.match(index, /TjanstAktivKundkoppling/);
    assert.match(index, /tjanst_har_kunder/);
    assert.match(index, /findBlockedDeactivation/);
  });

  it('PUT tjanst-utforande avvisar radering av egen tjänst när kunder är kopplade', () => {
    assert.match(index, /findRemovals/);
    assert.match(index, /findBlockedDeletion/);
  });

  it('byra-tjanster berikar med aktiv och valbar', () => {
    assert.match(index, /enrichTjansterWithAktiv/);
    assert.match(index, /isSelectableForKund/);
    assert.match(index, /valbar:/);
  });

  it('UI blockerar inaktivering och visar låst växel', () => {
    assert.match(byraJs, /kundCountForUtforandeTjanst/);
    assert.match(byraJs, /Kan inte inaktivera/);
    assert.match(byraJs, /lockedInactive/);
    assert.match(byraJs, /tjanst_har_kunder/);
  });

  it('UI kan radera egen tjänst med bekräftelse och kundlås', () => {
    assert.match(byraJs, /deleteCustomUtforandeTjanst/);
    assert.match(byraJs, /data-delete-tjanst/);
    assert.match(byraJs, /tjanst-mall-delete/);
    assert.match(byraJs, /Kan inte radera/);
    assert.match(byraJs, /Vill du ta bort/);
    assert.match(byraJs, /removeEntry/);
    assert.match(byraJs, /api\/risk-assessments\//);
  });

  it('utförande-sparning köar och retryar vid 429', () => {
    assert.match(byraJs, /_utforandeSaveInFlight/);
    assert.match(byraJs, /_utforandeSavePending/);
    assert.match(byraJs, /airtable_rate_limit/);
    assert.match(byraJs, /allowRetry/);
    assert.match(byraJs, /fillUtforandeStatsHost/);
    assert.match(index, /withAirtableRetry/);
    assert.match(index, /airtable_rate_limit/);
    assert.match(index, /_tjanstUtforandeFieldReady/);
  });

  it('kundkort filtrerar till valbara aktiva tjänster', () => {
    assert.match(kundJs, /_isTjanstValbarForKund/);
    assert.match(kundJs, /_isTjanstValbarForKund\(t\)/);
  });
});
