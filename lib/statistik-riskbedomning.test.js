const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  emptyStatistik,
  canBuildForUser,
  aggregateStatistik,
  buildKundantalMaps,
  buildTjanstExponering,
  collectLookupIds,
  isPepEllerSanktion,
  isPepFromKyc,
  isPepAnhorigFromKyc,
  isPepEllerAnhorigFromKyc,
  normalizeBolagsform,
  omsattningLabelForRecord,
  anstalldaLabelForRecord,
  recordMatchesOmsattningStat,
  recordMatchesAnstalldaStat
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
      PEP: 'Inte PEP',
      'Riskhöjande faktorer övrigt': ['Otydlig affärsmodell', 'Kontanthantering'],
      Bolagsform: 'Aktiebolag',
      'Omsättning': '1 500 000–10 000 000 kr',
      'Risksänkande faktorer': ['Långsiktig affärsrelation'],
      'KYC-formular (JSON)': JSON.stringify({
        skatterattslig_hemvist_foretag: 'Sverige',
        huvudman: [{ namn: 'Ali', skatterattslig_hemvist: 'Iran' }],
        internationellHandel: 'Ja',
        internationellaLander: 'Tyskland, Norge'
      })
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
      'Antal träffar PEP och sanktionslistor': 0,
      'KYC-formular (JSON)': JSON.stringify({ pep: 'Ja', pepFamilj: 'Nej' })
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
  it('räknar kundantal per id och namn', () => {
    const maps = buildKundantalMaps(records);
    assert.equal(maps.riskfaktorer.recRisk00000001, 1);
    assert.equal(maps.tjanster.recTjanst000001, 2);
    assert.equal(maps.tjanster.recTjanst000002, 1);
    assert.equal(maps.varningsflaggor['Otydlig affärsmodell'], 1);
    assert.equal(maps.risksankande['Långsiktig affärsrelation'], 1);
  });

  it('räknar kundexponering per tjänst och markerar saknad kunddata', () => {
    const expo = buildTjanstExponering(records, {
      tjanstId: 'recTjanst000001',
      tjanstNamn: 'Bokföring',
      tjanstIdToName: { recTjanst000001: 'Bokföring', recTjanst000002: 'ROT/RUT' }
    });
    assert.equal(expo.antal_kunder, 2);
    assert.equal(expo.pep, 1);
    assert.equal(expo.internationella_transaktioner, 1);
    assert.equal(expo.hogrisksbranscher, 1);
    const missing = buildTjanstExponering([], { unavailable: true });
    assert.equal(missing.antal_kunder, null);
    assert.ok(missing.saknade.includes('kunddata kunde inte hämtas'));
  });

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
    assert.equal(stat.varningsflaggor.find((f) => f.namn === 'Otydlig affärsmodell').antal, 1);
    assert.equal(stat.varningsflaggor.find((f) => f.namn === 'Kontantintensiv verksamhet'), undefined);
    assert.equal(stat.hemvist.find((h) => h.namn === 'Sverige').antal, 1);
    assert.equal(stat.hemvist.find((h) => h.namn === 'Iran').antal, 1);
    assert.equal(stat.hemvist.find((h) => h.namn === 'Iran').badge, 'FATF-svartlista');
    assert.equal(stat.bolagsform.find((b) => b.namn === 'Aktiebolag').antal, 1);
    assert.equal(stat.omsattning.find((o) => o.namn === '1 500 000–10 000 000 kr').antal, 1);
    assert.equal(stat.risksankande.find((r) => r.namn === 'Långsiktig affärsrelation').antal, 1);
    assert.equal(stat.handelslander.find((h) => h.namn === 'Tyskland').antal, 1);
    assert.equal(stat.antalKunderHogriskbransch, 1);
    assert.ok(stat.branschKategorier.length >= 1);
    assert.ok(stat.omsattningAnstalldaProfil.length >= 1);
  });

  it('räknar unika kunder per tjänst även vid dubbla länkar till samma namn', () => {
    const dupRecords = [
      {
        id: 'recKund00000001',
        fields: {
          Namn: 'Kund ett',
          'Kundens utvalda tjänster': ['recTjanst000001', 'recTjanst000002']
        }
      },
      {
        id: 'recKund00000002',
        fields: {
          Namn: 'Kund två',
          'Kundens utvalda tjänster': ['recTjanst000001']
        }
      }
    ];
    const dupLookups = {
      tjanstRecords: [
        { id: 'recTjanst000001', fields: { 'Task Name': 'BOKSLUT' } },
        { id: 'recTjanst000002', fields: { 'Task Name': 'BOKSLUT' } }
      ]
    };
    const stat = aggregateStatistik(dupRecords, dupLookups);
    assert.equal(stat.tjänster.find((t) => t.namn === 'BOKSLUT').antal, 2);
    const maps = buildKundantalMaps(dupRecords);
    assert.equal(maps.tjanster.recTjanst000001, 2);
    assert.equal(maps.tjanster.recTjanst000002, 1);
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

  it('känner av PEP och anhörig till PEP från KYC-formuläret', () => {
    assert.equal(isPepEllerSanktion({ 'KYC-formular (JSON)': JSON.stringify({ pep: 'Nej', pepFamilj: 'Nej' }) }), false);
    assert.equal(isPepFromKyc({ 'KYC-formular (JSON)': JSON.stringify({ pep: 'Ja' }) }), true);
    assert.equal(isPepAnhorigFromKyc({ 'KYC-formular (JSON)': JSON.stringify({ pepFamilj: 'Ja' }) }), true);
    assert.equal(isPepEllerAnhorigFromKyc({ 'KYC-formular (JSON)': JSON.stringify({ pep: 'Nej', pepFamilj: 'Ja' }) }), true);
    assert.equal(isPepEllerSanktion({ PEP: 'Ja', 'Antal träffar PEP och sanktionslistor': 3 }), false);
  });

  it('normaliserar bolagsformer till gemensamma etiketter', () => {
    assert.equal(normalizeBolagsform('AB'), 'Aktiebolag');
    assert.equal(normalizeBolagsform('aktiebolag'), 'Aktiebolag');
    assert.equal(normalizeBolagsform('EF'), 'Enskild firma');
    assert.equal(normalizeBolagsform('Fysiska personer'), 'Enskild firma');
    assert.equal(normalizeBolagsform('Enskild näringsverksamhet'), 'Enskild firma');
    const stat = aggregateStatistik([
      { id: 'rec1', fields: { Bolagsform: 'AB' } },
      { id: 'rec2', fields: { Bolagsform: 'Aktiebolag' } },
      { id: 'rec3', fields: { Bolagsform: 'EF' } },
      { id: 'rec4', fields: { Bolagsform: 'Fysiska personer' } },
      { id: 'rec5', fields: { Bolagsform: 'Enskild näringsverksamhet' } }
    ], {});
    assert.equal(stat.bolagsform.find((b) => b.namn === 'Aktiebolag').antal, 2);
    assert.equal(stat.bolagsform.find((b) => b.namn === 'Enskild firma').antal, 3);
    assert.equal(stat.bolagsform.length, 2);
  });

  it('returnerar tom statistik för användare utan byråfilter', () => {
    assert.equal(canBuildForUser({ role: 'Ledare' }), false);
    assert.equal(canBuildForUser({ role: 'Ledare', byraId: '12' }), true);
    assert.equal(emptyStatistik().antalKunder, 0);
    assert.equal(emptyStatistik().riskniva.Låg, 0);
  });

  it('matchar kunder på omsättnings- och anställda-intervall', () => {
    const fields = {
      'Omsättning': '1 500 000–10 000 000 kr',
      'KYC-formular (JSON)': JSON.stringify({ anstallda: '3' })
    };
    assert.equal(omsattningLabelForRecord(fields), '1 500 000–10 000 000 kr');
    assert.equal(anstalldaLabelForRecord(fields), '1–4 anställda');
    assert.equal(recordMatchesOmsattningStat(fields, '1 500 000–10 000 000 kr'), true);
    assert.equal(recordMatchesAnstalldaStat(fields, '1–4 anställda'), true);
    assert.equal(recordMatchesAnstalldaStat(fields, '5 eller fler anställda'), false);

    const stat = aggregateStatistik([
      { id: 'rec1', fields },
      { id: 'rec2', fields: { 'KYC-formular (JSON)': JSON.stringify({ anstallda: '0' }) } },
      { id: 'rec3', fields: {} }
    ], {});
    assert.equal(stat.anstallda.find((a) => a.namn === '1–4 anställda').antal, 1);
    assert.equal(stat.anstallda.find((a) => a.namn === 'Inga anställda').antal, 1);
    assert.equal(stat.anstallda.find((a) => a.namn === 'Okänt antal anställda').antal, 1);
    assert.equal(stat.omsattning.find((o) => o.namn === 'Okänd omsättning').antal, 2);
  });

  it('PDF-export och AI anropar inte längre statistik-API:t över HTTP', () => {
    const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(src, /function loadStatistikRiskbedomning/);
    assert.match(src, /loadStatistikRiskbedomning\(userData/);
    assert.match(src, /kundDold\.filterAktivaKunder/);
    assert.doesNotMatch(
      src,
      /\/api\/statistik-riskbedomning`, \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \}\)\.catch/
    );
    assert.equal((src.match(/\/api\/statistik-riskbedomning`/g) || []).length, 0);
  });
});
