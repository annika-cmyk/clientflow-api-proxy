const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEnkatApi() {
  const forslagCode = fs.readFileSync(
    path.join(__dirname, '../public/js/kundrisker-profil-analysforslag.js'),
    'utf8'
  );
  const enkatCode = fs.readFileSync(
    path.join(__dirname, '../public/js/kundrisker-enkat-sammanfattning.js'),
    'utf8'
  );
  const sandbox = {
    console,
    window: {},
    document: {
      readyState: 'complete',
      getElementById: () => null,
      addEventListener: () => {}
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(forslagCode + '\n' + enkatCode, sandbox);
  return sandbox.window.KundriskerEnkatSammanfattning;
}

describe('kundrisker-enkat-sammanfattning composite cards', () => {
  const schema = {
    sections: [
      {
        id: 'kundstock',
        title: 'Kundstock',
        fieldKeys: [
          'antalKunder',
          'vanligasteBolagsformer',
          'kundernasBranscher',
          'branscherKundstock',
          'andelHogriskbransch',
          'andelKontantintensiva',
          'betalningsmonster',
          'komplexaAgarstrukturer',
          'utlandskaAgare',
          'pepKunder'
        ]
      },
      {
        id: 'geografi',
        title: 'Geografi',
        fieldKeys: [
          'geografiskMarknad',
          'andelInternationellHandel',
          'sanktionslander',
          'kunderIUtsattaOmraden'
        ]
      },
      {
        id: 'kundintro',
        title: 'Intro',
        fieldKeys: ['kundIntroduktion', 'andelNystartadeBolag']
      }
    ],
    fields: [
      { key: 'antalKunder', label: 'Antal kunder', type: 'number' },
      { key: 'vanligasteBolagsformer', label: 'Bolagsformer', type: 'bolagsformer' },
      { key: 'kundernasBranscher', label: 'Branscher', type: 'branscher' },
      { key: 'branscherKundstock', label: 'Högrisk', type: 'hogrisk-branscher' },
      { key: 'andelHogriskbransch', label: 'Andel högrisk', type: 'percent' },
      { key: 'andelKontantintensiva', label: 'Kontant', type: 'percent' },
      { key: 'betalningsmonster', label: 'Betalmönster', type: 'multiselect', choices: ['Kort', 'Swish'] },
      { key: 'komplexaAgarstrukturer', label: 'Komplexa', type: 'select', choices: ['Ja', 'Nej'] },
      { key: 'utlandskaAgare', label: 'Utländska', type: 'select', choices: ['Ja', 'Nej'] },
      { key: 'pepKunder', label: 'PEP', type: 'select', choices: ['Ja', 'Nej'] },
      { key: 'geografiskMarknad', label: 'Marknad', type: 'text' },
      { key: 'andelInternationellHandel', label: 'Intl', type: 'percent' },
      { key: 'sanktionslander', label: 'Sanktion', type: 'select', choices: ['Ja', 'Nej'] },
      { key: 'kunderIUtsattaOmraden', label: 'Utsatta', type: 'select', choices: ['Ja', 'Nej'] },
      { key: 'kundIntroduktion', label: 'Intro', type: 'select', choices: ['Egen marknadsföring'] },
      { key: 'andelNystartadeBolag', label: 'Nystartade', type: 'percent' }
    ]
  };

  const profil = {
    antalKunder: 106,
    vanligasteBolagsformer: 'AB: 46, Enskild firma: 57',
    kundernasBranscher: 'IT: 28, Jordbruk: 20',
    branscherKundstock: 'Bygg: 12, Städning: 1',
    andelHogriskbransch: 13,
    andelKontantintensiva: 1,
    betalningsmonster: ['Kort', 'Swish'],
    komplexaAgarstrukturer: 'Nej',
    utlandskaAgare: 'Nej',
    pepKunder: 'Nej',
    geografiskMarknad: 'Hela Sverige',
    andelInternationellHandel: 12,
    sanktionslander: 'Nej',
    kunderIUtsattaOmraden: 'Ja',
    kundIntroduktion: 'Egen marknadsföring',
    andelNystartadeBolag: 6
  };

  it('slår ihop fält till de sex sammansatta korten (+ antal) med branscher överst', () => {
    const api = loadEnkatApi();
    const summary = api.buildSummary(profil, schema);
    assert.equal(summary.hasAnswers, true);
    const ids = summary.cards.map((c) => c.id);
    assert.equal(
      ids.join(','),
      'antal,branscher,bolagsformer,betalning,personkopplingar,geografi,ursprung'
    );
    const bransch = summary.cards.find((c) => c.id === 'branscher');
    assert.equal(
      bransch.blocks.map((b) => b.key).join(','),
      'kundernasBranscher'
    );
    assert.equal(
      (bransch.absorbKeys || []).join(','),
      'branscherKundstock,andelHogriskbransch'
    );
    assert.match(bransch.desc, /Samordningsfunktionen/);
    assert.match(bransch.desc, /106 kunder/);
    assert.match(bransch.desc, /13\s*%/);
    assert.doesNotMatch(bransch.blocks.map((b) => b.key).join(','), /andelHogrisk|branscherKundstock/);
    const person = summary.cards.find((c) => c.id === 'personkopplingar');
    assert.equal(person.title, 'Personkopplingar');
    assert.equal(person.blocks.length, 3);
    const geo = summary.cards.find((c) => c.id === 'geografi');
    assert.equal(geo.blocks.length, 4);
    const ursprung = summary.cards.find((c) => c.id === 'ursprung');
    assert.equal(
      ursprung.blocks.map((b) => b.key).join(','),
      'kundIntroduktion,andelNystartadeBolag'
    );
  });

  it('markerar högriskbranscher i den sammanslagna listan', () => {
    const api = loadEnkatApi();
    const chips = api.__test.namedListChips(
      'kund-bransch',
      [
        { namn: 'IT och konsultverksamhet', antal: 28 },
        { namn: 'Bygg', antal: 12, hogrisk: true },
        { namn: 'Smycken/antikviteter', antal: 1, hogrisk: true }
      ],
      '',
      'kundernasBranscher'
    );
    assert.match(chips, /statistik-stat-chip--hogrisk/);
    assert.match(chips, /Högrisk/);
    assert.match(chips, /data-typ="hogriskbransch"/);
    assert.match(chips, /data-typ="kund-bransch"/);
  });

  it('bygger sammanfattningsmening med myndighetsnamn', () => {
    const api = loadEnkatApi();
    assert.equal(api.HOGRISK_AUTHORITY, 'Samordningsfunktionen');
    const desc = api.buildBranschSummaryDesc({
      antalKunder: 100,
      kundernasBranscher: 'IT: 40, Bygg: 10',
      branscherKundstock: 'Bygg: 10',
      andelHogriskbransch: 10
    });
    assert.match(desc, /100 kunder/);
    assert.match(desc, /2 olika huvudbranscher/);
    assert.match(desc, /Samordningsfunktionen/);
    assert.match(desc, /penningtvätt/);
  });

  it('lägger kryssruta på analysbara chips och bygger prefill från val', () => {
    const api = loadEnkatApi();
    const st = api.getState();
    st.profil = profil;
    st.schema = schema;
    st.clientflowStat = null;
    st.chipSelection = Object.create(null);
    st.skippedIds = [];
    st.linkedMap = {};
    api.__test.refreshGroups();

    const bolagMatch = api.__test.findOpenChipMatch('AB', 'vanligasteBolagsformer');
    assert.ok(bolagMatch);
    assert.equal(bolagMatch.group.id, 'bolagsformer');
    assert.match(bolagMatch.item.id, /^bolag-/);

    const chips = api.__test.namedListChips(
      'bolagsform',
      [{ namn: 'AB', antal: 46 }, { namn: 'Enskild firma', antal: 57 }],
      '',
      'vanligasteBolagsformer'
    );
    assert.match(chips, /data-chip-analys-item="/);
    assert.match(chips, /statistik-stat-chip-check/);
    assert.match(chips, /statistik-stat-chip-hit/);

    st.chipSelection[bolagMatch.item.id] = bolagMatch.group.id;
    const hog = api.__test.findOpenChipMatch('Bygg', 'branscherKundstock');
    assert.ok(hog);
    st.chipSelection[hog.item.id] = hog.group.id;

    assert.match(api.__test.chipAnalysBarHtml(), /Skapa analys/);
    assert.match(api.__test.chipAnalysBarHtml(), /2 valda/);

    const prefills = api.__test.prefillsFromChipSelection();
    assert.ok(prefills.length >= 2);
    const names = prefills.map((p) => p.riskfaktor || p.namn || '').join(' | ');
    assert.match(names, /bolagsform/i);
    assert.match(names, /högriskbransch|Bygg/i);
  });
});
