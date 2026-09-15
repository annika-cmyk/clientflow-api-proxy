const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildAnalysGroups,
  filterOpenGroups,
  groupForField,
  buildMergedPrefill,
  buildSplitPrefills,
  shouldShowButtonForField,
  resolveGroupChecklistStatus,
  summarizeChecklistStatuses,
  normalizeSkippedGroupIds,
  groupIsFullyCovered,
  TYP_KUND,
  TYP_GEO_BYRA,
  TYP_GEO_MOTPART,
  SKIP_FIELD_KEYS
} = require('./kundrisker-profil-analysforslag');

describe('kundrisker-profil-analysforslag', () => {
  const richProfil = {
    antalKunder: 80,
    vanligasteBolagsformer: 'AB: 50, Enskild firma: 20, HB: 10',
    kundernasBranscher: 'Bygg och anläggning: 30, IT och konsultverksamhet: 20',
    branscherKundstock: 'Restaurang och café: 5, Bilhandel: 3',
    andelHogriskbransch: 10,
    andelKontantintensiva: 15,
    betalningsmonster: 'Kontant och Swish i butik, faktura i övrigt',
    komplexaAgarstrukturer: 'Ja',
    komplexaAgarstrukturerAntal: 4,
    utlandskaAgare: 'Ja',
    pepKunder: 'Ja',
    pepKunderAntal: 1,
    geografiskMarknad: 'Stockholm och Mälardalen',
    andelInternationellHandel: 25,
    sanktionslander: 'Ja',
    kunderIUtsattaOmraden: 'Ja',
    kunderIUtsattaOmradenAntal: 2,
    kundIntroduktion: 'Walk-in via internet utan personlig relation',
    andelNystartadeBolag: 20
  };

  it('föreslår bolagsformer med merge-default och kund-typ', () => {
    const groups = buildAnalysGroups(richProfil);
    const bolag = groups.find((g) => g.id === 'bolagsformer');
    assert.ok(bolag);
    assert.equal(bolag.buttonLabel, 'Analysera bolagsformer');
    assert.equal(bolag.defaultMode, 'merge');
    assert.equal(bolag.items.length, 3);
    assert.equal(bolag.items[0].typ, TYP_KUND);
    assert.ok(bolag.allowMerge && bolag.allowSplit);
  });

  it('föreslår högriskbranscher som split och övriga som merge', () => {
    const groups = buildAnalysGroups(richProfil);
    const hog = groups.find((g) => g.id === 'hogrisk-branscher');
    const ovr = groups.find((g) => g.id === 'ovriga-branscher');
    assert.ok(hog);
    assert.equal(hog.defaultMode, 'split');
    assert.ok(hog.items.every((i) => i.recommendedSeparate));
    assert.ok(ovr);
    assert.equal(ovr.defaultMode, 'merge');
    assert.ok(ovr.items.some((i) => /Bygg/.test(i.label)));
  });

  it('hoppar över antal kunder och föreslår ägarskap/PEP-grupp', () => {
    const groups = buildAnalysGroups(richProfil);
    assert.equal(shouldShowButtonForField('antalKunder', groups), false);
    assert.ok(SKIP_FIELD_KEYS.includes('antalKunder'));
    const agar = groups.find((g) => g.id === 'agarskap-pep');
    assert.ok(agar);
    assert.equal(agar.items.length, 3);
    assert.equal(agar.defaultMode, 'merge');
    assert.ok(groupForField(groups, 'pepKunder'));
  });

  it('använder geo-typer för marknad, handel, sanktion och utsatta områden', () => {
    const groups = buildAnalysGroups(richProfil);
    assert.equal(groups.find((g) => g.id === 'geo-marknad').items[0].typ, TYP_GEO_BYRA);
    assert.equal(groups.find((g) => g.id === 'geo-intl').items[0].typ, TYP_GEO_MOTPART);
    assert.equal(groups.find((g) => g.id === 'geo-sanktion').items[0].typ, TYP_GEO_MOTPART);
    assert.equal(groups.find((g) => g.id === 'geo-utsatt').items[0].typ, TYP_GEO_BYRA);
  });

  it('föreslår kontant, betalning, intro och nystartade vid relevanta svar', () => {
    const ids = buildAnalysGroups(richProfil).map((g) => g.id);
    assert.ok(ids.includes('kontant'));
    assert.ok(ids.includes('betalningsmonster'));
    assert.ok(ids.includes('kundintro'));
    assert.ok(ids.includes('nystartade'));
    const intro = buildAnalysGroups(richProfil).find((g) => g.id === 'kundintro');
    assert.equal(intro.recommended, true);
    assert.equal(intro.optional, false);
  });

  it('gör andel högrisk valfri endast när enskilda högriskbranscher saknas', () => {
    const withHog = buildAnalysGroups(richProfil).map((g) => g.id);
    assert.ok(!withHog.includes('andel-hogrisk'));
    const without = buildAnalysGroups({
      andelHogriskbransch: 12,
      branscherKundstock: 'Inga högriskbranscher'
    });
    assert.ok(without.some((g) => g.id === 'andel-hogrisk'));
    assert.equal(without.find((g) => g.id === 'andel-hogrisk').optional, true);
  });

  it('bygger merge- och split-prefills', () => {
    const bolag = buildAnalysGroups(richProfil).find((g) => g.id === 'bolagsformer');
    const merged = buildMergedPrefill(bolag.items);
    assert.ok(merged.riskfaktor);
    assert.match(merged.beskrivning, /•/);
    const split = buildSplitPrefills(bolag.items.slice(0, 2));
    assert.equal(split.length, 2);
    assert.equal(split[0].typ, TYP_KUND);
  });

  it('filtrerar bort förslag som redan finns som riskfaktor', () => {
    const groups = buildAnalysGroups({ andelKontantintensiva: 20 });
    const open = filterOpenGroups(groups, [
      { fields: { Riskfaktor: 'Kontantintensiva kunder' } }
    ]);
    assert.equal(open.length, 0);
  });

  it('markerar analyserad / avstådd / pending i checklist-status', () => {
    const groups = buildAnalysGroups({
      andelKontantintensiva: 20,
      geografiskMarknad: 'Hela Sverige',
      andelNystartadeBolag: 6
    });
    const kontant = groups.find((g) => g.id === 'kontant');
    const geo = groups.find((g) => g.id === 'geo-marknad');
    const nyst = groups.find((g) => g.id === 'nystartade');
    assert.equal(
      resolveGroupChecklistStatus(kontant, [{ fields: { Riskfaktor: 'Kontantintensiva kunder' } }], []).status,
      'analyserad'
    );
    assert.equal(resolveGroupChecklistStatus(geo, [], ['geo-marknad']).status, 'avstadd');
    assert.equal(resolveGroupChecklistStatus(nyst, [], []).status, 'pending');
    // Analyserad vinner över avstådd
    assert.equal(
      resolveGroupChecklistStatus(kontant, [{ fields: { Riskfaktor: 'Kontantintensiva kunder' } }], ['kontant']).status,
      'analyserad'
    );
    assert.ok(groupIsFullyCovered(kontant, [{ fields: { Riskfaktor: 'Kontantintensiva kunder' } }]));
    const summary = summarizeChecklistStatuses(groups, [{ fields: { Riskfaktor: 'Kontantintensiva kunder' } }], ['geo-marknad']);
    assert.equal(summary.analyserad, 1);
    assert.equal(summary.avstadd, 1);
    assert.equal(summary.pending, 1);
    assert.equal(summary.total, 3);
  });

  it('filtrerar bort avstådda grupper från öppna förslag', () => {
    const groups = buildAnalysGroups({ andelKontantintensiva: 20, geografiskMarknad: 'Sverige' });
    const open = filterOpenGroups(groups, [], ['kontant']);
    assert.equal(open.length, 1);
    assert.equal(open[0].id, 'geo-marknad');
    assert.deepEqual(normalizeSkippedGroupIds(['kontant', '', 'kontant', 'geo-marknad']), [
      'kontant',
      'geo-marknad'
    ]);
  });

  it('är inkopplat på kundrisker-sidan', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/kundrisker-mm.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundrisker-enkat-sammanfattning.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(html, /kundrisker-profil-analysforslag\.js\?v=2/);
    assert.match(html, /kundrisker-enkat-sammanfattning\.js\?v=8/);
    assert.doesNotMatch(html, /kundrisker-clientflow-statistik\.js/);
    assert.match(html, /statistik-kunder-modal\.js\?v=3/);
    assert.match(js, /KundriskerProfilAnalysForslag|KundriskerProfilAnalysforslag/);
    assert.match(js, /Analysera bolagsformer|data-analys-group|Skapa gemensam analys|data-analys-group/);
    assert.match(js, /openAddModal|openAddModal/);
    assert.match(js, /En analys per vald|En analys per/);
    assert.match(js, /data-analys-skip|Avstå/);
    assert.match(js, /data-analys-unskip|Ångra avstå/);
    assert.match(js, /kundriskAnalysSkipped|\/api\/byra-resa/);
    assert.match(js, /resolveGroupChecklistStatus|Ej gjord än|Analyserad/);
    assert.match(js, /statistik-source-badge--byraprofil|Byråprofil/);
    assert.match(js, /data-typ="bolagsform"|bolagsform/);
    assert.match(js, /statistik-stat-chip/);
    assert.match(js, /statistik-section/);
    assert.match(js, /\/api\/statistik-riskbedomning/);
    assert.match(js, /clientflowStat/);
    assert.match(js, /pep-sanktion/);
    assert.match(css, /kundrisker-analys/);
    assert.match(css, /kundrisker-enkat-stat/);
    assert.match(css, /statistik-stat-chip/);
    assert.match(css, /statistik-source-badge/);
  });
});
