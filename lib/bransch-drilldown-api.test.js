const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Aggregat = require('../public/js/kund-bransch-aggregat');
const Statistik = require('./statistik-riskbedomning');

describe('bransch-drilldown API wiring', () => {
  it('exponerar endpoint i index.js', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /\/api\/statistik-riskbedomning\/bransch-drilldown/);
    assert.match(index, /drilldownKundBransch|drilldownHogriskBransch/);
  });

  it('statistik-riskbedomning delegerar till aggregat', () => {
    const records = [
      { id: 'recF', fields: { Namn: 'Fastighetsbolaget', 'SNI kod': '68201 - Uthyrning och förvaltning av egna eller arrenderade bostäder' } },
      { id: 'recB', fields: { Namn: 'Byggare', Bransch: '41200 - Byggande av bostadshus och andra byggnader' } }
    ];
    const result = Statistik.drilldownKundBransch(records, 'Fastighet');
    assert.equal(result.antalKunder, 1);
    assert.equal(result.kunder[0].namn, 'Fastighetsbolaget');
    assert.match(result.kunder[0].sni, /68201/);
    assert.equal(Aggregat.resolveBucketName('Fastighet'), 'Fastighet');
  });
});
