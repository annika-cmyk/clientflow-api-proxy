const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KundRiskprofil = require('../public/js/kund-riskprofil');

describe('riskbedömning PDF empty states och riskaptit', () => {
  const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

  it('PDF visar emptyLabel-chippar för alla riskfaktorsektioner', () => {
    assert.match(index, /Inga geografiska riskfaktorer/);
    assert.match(index, /Inga riskfaktorer kopplat till kunden/);
    assert.match(index, /Inga distributionskanaler/);
    assert.match(index, /Inga verksamhetsspecifika riskfaktorer/);
    assert.match(index, /Inga övriga riskhöjande faktorer/);
    assert.match(index, /Inga risksänkande faktorer/);
    assert.match(index, /varningsflaggorExplicitNone/);
    assert.match(index, /Inga varningsflaggor/);
  });

  it('PDF inkluderar riskaptitbeslut och byråns motivering', () => {
    assert.match(index, /Riskaptitbeslut/);
    assert.match(index, /riskaptitMotivering/);
    assert.match(index, /uppdragsAvgorande/);
    assert.match(index, /byransRiskbedomning \|\| data\.motivering/);
  });

  it('dokumentera-gaten används i PDF-endpointen', () => {
    assert.match(index, /riskbedomningDokumentera\.canDokumentera/);
  });

  it('pdfBulletList visar green chip vid emptyLabel', () => {
    const html = KundRiskprofil.pdfBulletList([], 'Inga verksamhetsspecifika riskfaktorer', (s) => s);
    assert.match(html, /chip-pos/);
    assert.match(html, /Inga verksamhetsspecifika riskfaktorer/);
  });
});
