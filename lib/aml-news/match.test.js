const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { matchNewsToProfil } = require('./match');

/**
 * Tabelldriven svit: lägg en ny rad för ny bransch/geografi utan ny testkod.
 */
const CASES = [
  {
    name: 'lagändring är minst medium för alla byråer',
    item: { category: 'lagandring', severity: 'informativ', affected_industries: [], affected_geography: ['se'] },
    profil: { branscherKundstock: 'IT', geografiskMarknad: 'Sverige', andelInternationellHandel: 0 },
    expectTier: 'medium'
  },
  {
    name: 'högriskstat + utlandshandel + kräver åtgärd = high',
    item: { category: 'hogriskstater', severity: 'kraver_atgard', affected_industries: [], affected_geography: ['ru'] },
    profil: { branscherKundstock: 'handel', geografiskMarknad: 'Sverige', andelInternationellHandel: 25 },
    expectTier: 'high'
  },
  {
    name: 'högriskstat utan utlandshandel stannar lägre',
    item: { category: 'hogriskstater', severity: 'informativ', affected_industries: [], affected_geography: ['ir'] },
    profil: { branscherKundstock: 'IT', geografiskMarknad: 'Sverige', andelInternationellHandel: 0 },
    expectTier: 'low'
  },
  {
    name: 'branschspecifik bygg matchar byggkundstock',
    item: { category: 'branschspecifik', severity: 'informativ', affected_industries: ['bygg'], affected_geography: ['se'] },
    profil: { branscherKundstock: 'Bygg och anläggning', geografiskMarknad: 'Västra Götaland', andelInternationellHandel: 0 },
    expectTier: 'high',
    expectReason: /bygg/
  },
  {
    name: 'branschspecifik jord_skog utan overlap blir low',
    item: { category: 'branschspecifik', severity: 'informativ', affected_industries: ['jord_skog'], affected_geography: [] },
    profil: { branscherKundstock: 'IT-konsulter', geografiskMarknad: 'Sverige', andelInternationellHandel: 0 },
    expectTier: 'low'
  },
  {
    name: 'import_export-nyhet matchar utrikeshandel i kundstock',
    item: { category: 'branschspecifik', severity: 'kraver_atgard', affected_industries: ['import_export'], affected_geography: ['cn'] },
    profil: { branscherKundstock: 'Import och export', geografiskMarknad: 'Sverige och Kina', andelInternationellHandel: 40 },
    expectTier: 'high'
  },
  {
    name: 'kundkännedom är relevant för alla',
    item: { category: 'kundkannedom', severity: 'kraver_atgard', affected_industries: [], affected_geography: ['se'] },
    profil: { branscherKundstock: 'restaurang', geografiskMarknad: 'Skåne' },
    expectTier: 'high'
  },
  {
    name: 'rapporteringsrutiner + kräver åtgärd = high',
    item: { category: 'rapporteringsrutiner', severity: 'kraver_atgard', affected_industries: [], affected_geography: ['se'] },
    profil: { branscherKundstock: 'handel', geografiskMarknad: 'Sverige' },
    expectTier: 'high'
  },
  {
    name: 'övrigt utan träffar är low/medium, inte high',
    item: { category: 'ovrigt', severity: 'informativ', affected_industries: [], affected_geography: [] },
    profil: { branscherKundstock: 'IT', geografiskMarknad: 'Sverige' },
    expectMaxScore: 2
  },
  {
    name: 'betalningsuppdrag höjer högriskstat',
    item: { category: 'hogriskstater', severity: 'informativ', affected_industries: [], affected_geography: ['mm'] },
    profil: { branscherKundstock: 'redovisning', tjanster: ['Utföra betalningsuppdrag'], andelInternationellHandel: 0 },
    expectReason: /betalningsuppdrag/
  }
];

describe('matchNewsToProfil (tabelldriven)', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = matchNewsToProfil(c.item, c.profil);
      if (c.expectTier) assert.equal(out.relevance_tier, c.expectTier);
      if (c.expectMaxScore != null) assert.ok(out.relevance_score <= c.expectMaxScore);
      if (c.expectReason) assert.match(out.reasons.join(' | '), c.expectReason);
      assert.ok(Array.isArray(out.reasons) && out.reasons.length > 0);
    });
  }
});
