const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  emptyStatistik,
  canBuildForUser,
  aggregateStatistik,
  collectLookupIds,
  isPepEllerSanktion
} = require('./statistik-riskbedomning');
const { renderStatistikPdfHtml } = require('./statistik-dokumentation');

const records = [
  {
    id: 'recKund00000001',
    fields: {
      Namn: 'Alfa AB',
      Riskniva: '',
      'sammanlagd risk': 'Hög',
      'Kundens utvalda tjänster': ['recTjanst000001', 'recTjanst000002'],
      'Kunden verkar i en högriskbransch': ['Kontanthandel'],
      'risker kopplat till tjänster': ['recRisk00000001'],
      PEP: 'Inte PEP'
    }
  },
  {
    id: 'recKund00000002',
    fields: {
      Namn: 'Beta AB',
      Riskniva: 'Låg',
      'Kundens utvalda tjänster': [{ id: 'recTjanst000001' }],
      Riskpoäng: JSON.stringify({
        sannolikhet: 2,
        konsekvens: 2,
        sannolikhetEfter: 1,
        konsekvensEfter: 2
      }),
      PEP: ['Ja, i styrelsen'],
      'Antal träffar PEP och sanktionslistor': 0
    }
  },
  {
    id: 'recKund00000003',
    fields: {
      Namn: 'Gamma AB',
      'Kundens utvalda tjänster': ['Löpande bokföring'],
      'Kunden verkar i en högriskbransch': '---'
    }
  }
];

const lookups = {
  tjanstRecords: [
    { id: 'recTjanst000001', fields: { 'Task Name': 'Bokföring' } },
    { id: 'recTjanst000002', fields: { 'Task Name': 'ROT/RUT' } }
  ],
  riskfaktorRecords: [
    { id: 'recRisk00000001', fields: { Riskfaktor: 'Komplex ägarstruktur', 'Typ av riskfaktor': 'Kund' } }
  ]
};

describe('statistik-riskbedomning', () => {
  it('räknar kunder även när intern HTTP-fallback tidigare nollställde allt', () => {
    const stat = aggregateStatistik(records, lookups);
    assert.equal(stat.antalKunder, 3);
    assert.equal(stat.antalPepEllerSanktion, 1);
    assert.equal(stat.tjänster.find((t) => t.namn === 'Bokföring').antal, 2);
    assert.equal(stat.tjänster.find((t) => t.namn === 'ROT/RUT').antal, 1);
    assert.equal(stat.tjänster.find((t) => t.namn === 'Löpande bokföring').antal, 1);
    assert.equal(stat.högriskbransch[0].namn, 'Kontanthandel');
    assert.equal(stat.riskfaktorerPerTyp[0].typ, 'Kund');
    assert.equal(stat.riskfaktorerPerTyp[0].antalKunder, 1);
    assert.equal(stat.riskfaktorerPerTyp[0].riskfaktorer[0].namn, 'Komplex ägarstruktur');
  });

  it('räknar residualrisk från Riskpoäng och sammanlagd risk, inte bara Riskniva', () => {
    const stat = aggregateStatistik(records, lookups);
    // recKund1: sammanlagd risk Hög (ingen residual-S×K)
    // recKund2: residual 1×2 = 2 → Låg (vinner över Riskniva)
    // recKund3: ingen nivå
    assert.equal(stat.riskniva.Hög, 1);
    assert.equal(stat.riskniva.Låg, 1);
    assert.equal(stat.riskniva.Normal, 0);
  });

  it('ger PDF-HTML med faktiska antal i stället för nollor', () => {
    const html = renderStatistikPdfHtml(aggregateStatistik(records, lookups));
    assert.match(html, /<td>3<\/td>/);
    assert.match(html, /Bokföring/);
    assert.match(html, /Kontanthandel/);
    assert.match(html, /Komplex ägarstruktur/);
    assert.doesNotMatch(html, /Inga tjänster valda hos kunderna/);
  });

  it('samlar bara Airtable-id:n för uppslag', () => {
    const ids = collectLookupIds(records);
    assert.deepEqual(ids.tjanstIds.sort(), ['recTjanst000001', 'recTjanst000002']);
    assert.deepEqual(ids.riskfaktorIds, ['recRisk00000001']);
  });

  it('känner av PEP och sanktionsträffar', () => {
    assert.equal(isPepEllerSanktion({ PEP: 'Inte PEP' }), false);
    assert.equal(isPepEllerSanktion({ PEP: 'Ja' }), true);
    assert.equal(isPepEllerSanktion({ 'Antal träffar PEP och sanktionslistor': 2 }), true);
  });

  it('returnerar tom statistik för användare utan byråfilter', () => {
    assert.equal(canBuildForUser({ role: 'Ledare' }), false);
    assert.equal(canBuildForUser({ role: 'Ledare', byraId: '12' }), true);
    assert.equal(emptyStatistik().antalKunder, 0);
    assert.equal(emptyStatistik().riskniva.Låg, 0);
  });

  it('PDF-export och AI anropar inte längre statistik-API:t över HTTP', () => {
    const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(src, /function loadStatistikRiskbedomning/);
    assert.match(src, /loadStatistikRiskbedomning\(userData/);
    assert.doesNotMatch(
      src,
      /\/api\/statistik-riskbedomning`, \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \}\)\.catch/
    );
    assert.equal((src.match(/\/api\/statistik-riskbedomning`/g) || []).length, 0);
  });
});
