const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveSenasteRiskbedomningDatum,
  formatSenasteRiskbedomningSv
} = require('./senaste-riskbedomning-datum');

describe('senaste-riskbedomning-datum', () => {
  it('väljer senaste datum från fält och dokumentation', () => {
    assert.equal(
      resolveSenasteRiskbedomningDatum({
        'Riskbedömning utförd datum': '2026-01-10',
        'Kundens riskbedömning godkänd': '2026-03-15',
        'Dokumentation Kategorier': JSON.stringify([
          {
            category: 'riskbedomning',
            subcategory: 'kund_riskbedomning',
            filename: 'Riskbedomning-KYC-Test-2026-02-20.pdf',
            createdDate: '2026-02-20'
          }
        ])
      }),
      '2026-03-15'
    );
  });

  it('returnerar tomt när inget datum finns', () => {
    assert.equal(resolveSenasteRiskbedomningDatum({}), '');
  });

  it('formaterar datum på svenska', () => {
    assert.equal(formatSenasteRiskbedomningSv('2026-03-15'), '2026-03-15');
  });
});
