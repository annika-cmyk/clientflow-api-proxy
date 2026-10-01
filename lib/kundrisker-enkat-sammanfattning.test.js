const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEnkatApi(page) {
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
      body: { dataset: { enkatPage: page || 'kundrisker', riskPageScope: page || 'kundrisker' } },
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

  it('visar kundkort utan bransch/antal (de ligger på verksamhetssidan)', () => {
    const api = loadEnkatApi('kundrisker');
    const summary = api.buildSummary(profil, schema);
    assert.equal(summary.hasAnswers, true);
    const ids = summary.cards.map((c) => c.id);
    assert.equal(
      ids.join(','),
      'bolagsformer,betalning,personkopplingar,geografi,ursprung'
    );
    assert.ok(!ids.includes('branscher'));
    assert.ok(!ids.includes('antal'));
    const person = summary.cards.find((c) => c.id === 'personkopplingar');
    assert.equal(person.title, 'Personkopplingar');
    assert.equal(person.blocks.length, 3);
    const geo = summary.cards.find((c) => c.id === 'geografi');
    assert.equal(geo.blocks.map((b) => b.key).join(','),
      'andelInternationellHandel,sanktionslander,kunderIUtsattaOmraden');
    const ursprung = summary.cards.find((c) => c.id === 'ursprung');
    assert.equal(
      ursprung.blocks.map((b) => b.key).join(','),
      'kundIntroduktion,andelNystartadeBolag'
    );
  });

  it('visar antal + branscher på verksamhetssidan med högrisksammanfattning', () => {
    const api = loadEnkatApi('verksamhet');
    const summary = api.buildSummary(profil, schema);
    const ids = summary.cards.map((c) => c.id);
    assert.equal(ids.join(','), 'antal,branscher');
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

  it('lägger kryssruta på branschchip med komma i namnet', () => {
    const api = loadEnkatApi('verksamhet');
    const st = api.getState();
    st.profil = {
      ...profil,
      kundernasBranscher:
        'IT och konsultverksamhet: 34, Kultur, media och underhållning: 20, Utbildning: 20',
      branscherKundstock: 'Bygg: 12'
    };
    st.schema = schema;
    st.clientflowStat = null;
    st.chipSelection = Object.create(null);
    st.skippedIds = [];
    st.linkedMap = {};
    api.__test.refreshGroups();

    const kultur = api.__test.findOpenChipMatch(
      'Kultur, media och underhållning',
      'kundernasBranscher'
    );
    assert.ok(kultur, 'ska hitta öppet analysförslag för Kultur-branschen');
    assert.equal(kultur.group.id, 'ovriga-branscher');
    assert.equal(
      api.__test.formNameFromAnalysItem(kultur.item),
      'Kultur, media och underhållning'
    );

    const chips = api.__test.namedListChips(
      'kund-bransch',
      [
        { namn: 'IT och konsultverksamhet', antal: 34 },
        { namn: 'Kultur, media och underhållning', antal: 20 },
        { namn: 'Utbildning', antal: 20 },
        { namn: 'Bygg', antal: 12, hogrisk: true }
      ],
      '',
      'kundernasBranscher'
    );
    assert.match(chips, /data-chip-analys-item="bransch-kultur/);
    const kulturChip = chips.match(
      /<span class="statistik-stat-chip[^"]*"[^>]*>[\s\S]*?Kultur, media och underhållning · 20[\s\S]*?<\/span>\s*(?:<span|$)/
    );
    assert.ok(kulturChip, 'hittar Kultur-chipet i HTML');
    assert.match(kulturChip[0], /data-chip-analys-item="/);
    assert.match(kulturChip[0], /statistik-stat-chip-check/);
  });

  it('ger kryssruta på bolagsform-chips med antal, inte på Nej/noll', () => {
    const api = loadEnkatApi();
    const st = api.getState();
    st.profil = {
      ...profil,
      vanligasteBolagsformer:
        'Aktiebolag: 46, Enskild firma: 57, Bostadsrättsförening: 1, Ekonomisk förening: 1, Regioner: 1',
      betalningsmonster: ['Kort', 'Swish', 'Faktura', 'Bankgiro/Plusgiro'],
      komplexaAgarstrukturer: 'Nej',
      utlandskaAgare: 'Nej',
      pepKunder: 'Nej'
    };
    st.schema = schema;
    st.clientflowStat = {
      bolagsform: [
        { namn: 'Enskild firma', antal: 57 },
        { namn: 'Aktiebolag', antal: 46 },
        { namn: 'Bostadsrättsförening', antal: 1 },
        { namn: 'Ekonomisk förening', antal: 1 },
        { namn: 'Regioner', antal: 1 }
      ],
      antalPepEllerSanktion: 0
    };
    st.chipSelection = Object.create(null);
    st.skippedIds = [];
    st.linkedMap = {};
    api.__test.refreshGroups();

    assert.equal(api.__test.chipHasAnalysableData('Nej'), false);
    assert.equal(api.__test.chipHasAnalysableData('PEP eller anhörig till PEP · 0'), false);
    assert.equal(api.__test.chipHasAnalysableData('Aktiebolag · 46'), true);
    assert.equal(api.__test.chipHasAnalysableData('1 %'), true);

    // AB-alias ska matcha Aktiebolag-chipet
    const abAlias = api.__test.findOpenChipMatch('AB', 'vanligasteBolagsformer');
    assert.ok(abAlias, 'AB ska matcha öppet Aktiebolag-förslag');
    assert.match(abAlias.item.riskfaktor, /Aktiebolag|AB/i);

    const chips = api.__test.namedListChips(
      'bolagsform',
      st.clientflowStat.bolagsform,
      '',
      'vanligasteBolagsformer'
    );
    const checks = chips.match(/class="statistik-stat-chip-check"/g) || [];
    assert.equal(checks.length, 5, 'alla bolagsform-chips med antal > 0 ska ha kryssruta');

    const zero = api.__test.namedListChips(
      'bolagsform',
      [{ namn: 'Handelsbolag', antal: 0 }],
      '',
      'vanligasteBolagsformer'
    );
    assert.doesNotMatch(zero, /statistik-stat-chip-check/);

    const nej = api.__test.staticValueChips('Nej', 'komplexaAgarstrukturer');
    assert.doesNotMatch(nej, /statistik-stat-chip-check/);

    const betalning = api.__test.staticValueChips(
      'Kort, Swish, Faktura, Bankgiro/Plusgiro',
      'betalningsmonster'
    );
    assert.match(betalning, /statistik-stat-chip-check/);
    assert.equal((betalning.match(/class="statistik-stat-chip-check"/g) || []).length, 4);
  });

  it('markerar nestade analyserade riskfaktorer som gröna, högrisk lila', () => {
    const api = loadEnkatApi();
    assert.equal(api.__test.isOfficialHogriskRiskNamn('Kunder i högriskbransch: Bygg'), true);
    assert.equal(api.__test.isOfficialHogriskRiskNamn('Andel kunder i högriskbransch'), true);
    assert.equal(api.__test.isOfficialHogriskRiskNamn('Enskild firma · 57; Aktiebolag · 46'), false);

    const normal = api.__test.nestedRiskChipHtml({
      id: 'r1',
      fields: { Riskfaktor: 'Enskild firma · 57; Aktiebolag · 46' }
    });
    assert.match(normal, /kundrisker-enkat-nested-chip/);
    assert.match(normal, /btn-success/);
    assert.match(normal, /is-analyserad/);
    assert.doesNotMatch(normal, /is-hogrisk/);
    assert.doesNotMatch(normal, /data-hogrisk-analys/);

    const hog = api.__test.nestedRiskChipHtml({
      id: 'r2',
      fields: { Riskfaktor: 'Kunder i högriskbransch: Bygg' }
    });
    assert.match(hog, /is-analyserad/);
    assert.match(hog, /is-hogrisk/);
    assert.match(hog, /data-hogrisk-analys="1"/);
    assert.doesNotMatch(hog, /btn-success/);

    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(css, /\.kundrisker-enkat-nested-chip\.is-analyserad\.btn-success/);
    assert.match(css, /\.kundrisker-enkat-nested-chip\.is-analyserad\.is-hogrisk/);
    assert.match(css, /#bbf7d0/);
    assert.match(css, /#d8b4fe/);

    const ovriga = fs.readFileSync(
      path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'),
      'utf8'
    );
    assert.match(ovriga, /btn btn-sm btn-success is-analyserad/);
    assert.match(ovriga, /is-analyserad is-hogrisk/);
  });

  it('Koppla-modal har fällbara statistikgrupper och postval', () => {
    const js = fs.readFileSync(
      path.join(__dirname, '../public/js/kundrisker-enkat-sammanfattning.js'),
      'utf8'
    );
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(js, /openLinkFromRisk/);
    assert.match(js, /kundrisker-risk-link-group|data-link-group-toggle/);
    assert.match(js, /Hela området/);
    assert.match(js, /itemIds/);
    assert.match(js, /findItemsMatchingRiskName/);
    assert.match(css, /kundrisker-risk-link-groups/);
    assert.match(css, /kundrisker-risk-link-chevron/);
  });


  it('visar källbadge per block när kort blandar Clientflow och Byråprofil', () => {
    const api = loadEnkatApi();
    const st = api.getState();
    st.profil = { ...profil, pepKunder: 'Ja', pepKunderAntal: 2 };
    st.schema = schema;
    st.clientflowStat = {
      antalKunder: 106,
      antalPepEllerSanktion: 2,
      bolagsform: [{ namn: 'AB', antal: 46 }]
    };
    api.__test.refreshGroups();
    const pepBlock = { key: 'pepKunder', label: 'PEP', display: 'Ja · ca 2' };
    const komplexBlock = { key: 'komplexaAgarstrukturer', label: 'Komplexa', display: 'Ja · ca 3' };
    assert.equal(api.__test.itemUsesClientflow(pepBlock), true);
    assert.equal(api.__test.itemUsesClientflow(komplexBlock), false);
    const pepHtml = api.__test.renderCardBlock(pepBlock, { multiBlock: true, showSourceBadge: true });
    const komplexHtml = api.__test.renderCardBlock(komplexBlock, { multiBlock: true, showSourceBadge: true });
    assert.match(pepHtml, /data-source="clientflow"/);
    assert.match(pepHtml, /statistik-source-badge(?!--byraprofil)/);
    assert.match(komplexHtml, /data-source="byraprofil"/);
    assert.match(komplexHtml, /statistik-source-badge--byraprofil/);
    assert.match(api.__test.sourceBadgeHtml(true, { justerad: true }), /Clientflow · justerad/);
  });

});
