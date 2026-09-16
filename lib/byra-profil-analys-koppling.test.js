/**
 * Koppling byråprofil-enkät (byråquiz) ↔ analyssidor.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TARGETS,
  SECTION_ALIASES,
  canonicalSectionId,
  targetForSection,
  analysisHref,
  enkateHref,
  enkateSectionForFokus,
  enkateHrefForFokus,
  enkateSectionForFieldKey,
  fokusFromUrlSearch,
  isKnownFokus
} = require('../public/js/byra-profil-analys-koppling');
const {
  PROFIL_SECTION_ANALYSIS_TARGETS,
  buildKunderEnkatSummary
} = require('./byra-profil-fields');

describe('byra-profil-analys-koppling', () => {
  it('mappar quiz-sida 1 (intern) till verksamhetsspecifika på Övriga', () => {
    const t = targetForSection('intern');
    assert.ok(t);
    assert.equal(t.fokus, 'verksamhet');
    assert.equal(t.pageHref, 'ovriga-riskfaktorer.html');
    assert.match(analysisHref('intern'), /fokus=verksamhet/);
    assert.match(t.shortLabel, /Verksamhetsspecifika/);
  });

  it('mappar kundstock till Vilka är våra kunder', () => {
    const t = targetForSection('kundstock');
    assert.ok(t);
    assert.equal(t.pageHref, 'kundrisker-mm.html');
    assert.equal(analysisHref('kundstock'), 'kundrisker-mm.html');
    assert.match(t.ctaLabel, /Vilka är våra kunder/);
  });

  it('mappar distributionskanaler till Övriga med fokus=distribution', () => {
    const t = targetForSection('distribution');
    assert.ok(t);
    assert.equal(t.fokus, 'distribution');
    assert.match(analysisHref('distribution'), /fokus=distribution/);
    assert.match(t.shortLabel, /Distributionskanaler/);
  });

  it('mappar steg 4+8 (tjänster) till Byråns tjänster med samma mål', () => {
    const t4 = targetForSection('tjanster');
    const t8 = targetForSection('hogrisktjanster');
    assert.equal(t4.pageHref, 'riskbedomning-byra.html');
    assert.equal(t8.pageHref, 'riskbedomning-byra.html');
    assert.equal(analysisHref('tjanster'), 'riskbedomning-byra.html');
    assert.equal(analysisHref('hogrisktjanster'), 'riskbedomning-byra.html');
    assert.equal(canonicalSectionId('hogrisktjanster'), 'tjanster');
    assert.equal(enkateHref('hogrisktjanster'), 'byra-profil-enkate.html?section=tjanster');
  });

  it('mappar geografi till Övriga med fokus=geografi', () => {
    const t = targetForSection('geografi');
    assert.equal(t.pageHref, 'ovriga-riskfaktorer.html');
    assert.equal(t.fokus, 'geografi');
    assert.match(analysisHref('geografi'), /fokus=geografi/);
  });

  it('mappar historik till AR och beroende/outsourcing till verksamhet (alias intern)', () => {
    assert.equal(targetForSection('historik').pageHref, 'allman-riskbedomning-byra.html');
    assert.match(analysisHref('historik'), /fokus=historik/);
    assert.equal(targetForSection('beroende').fokus, 'verksamhet');
    assert.equal(targetForSection('outsourcing').fokus, 'verksamhet');
    assert.equal(SECTION_ALIASES.beroende, 'intern');
    assert.equal(SECTION_ALIASES.outsourcing, 'intern');
    assert.equal(enkateHref('beroende'), 'byra-profil-enkate.html?section=intern');
    assert.equal(enkateHref('outsourcing'), 'byra-profil-enkate.html?section=intern');
  });

  it('bygger deep-links tillbaka till rätt enkätsektion', () => {
    assert.equal(enkateHref('intern'), 'byra-profil-enkate.html?section=intern');
    assert.equal(enkateHref('distribution'), 'byra-profil-enkate.html?section=distribution');
    assert.equal(enkateHref('kundstock'), 'byra-profil-enkate.html?section=kundstock');
    assert.equal(enkateSectionForFokus('verksamhet'), 'intern');
    assert.equal(enkateSectionForFokus('distribution'), 'distribution');
    assert.equal(enkateSectionForFokus('geografi'), 'geografi');
    assert.equal(enkateSectionForFokus('historik'), 'historik');
    assert.match(enkateHrefForFokus('verksamhet'), /section=intern/);
  });

  it('läser fokus från querystring', () => {
    assert.equal(fokusFromUrlSearch('?fokus=verksamhet'), 'verksamhet');
    assert.equal(fokusFromUrlSearch('?foo=1&fokus=distribution'), 'distribution');
    assert.equal(isKnownFokus('verksamhet'), true);
    assert.equal(isKnownFokus('geografi'), true);
    assert.equal(isKnownFokus('historik'), true);
    assert.equal(isKnownFokus('kund'), false);
  });

  it('kopplar profilfält till enkätsektion (efter merge)', () => {
    assert.equal(enkateSectionForFieldKey('antalAnstallda'), 'intern');
    assert.equal(enkateSectionForFieldKey('kundResidualriskFordelning'), 'kundstock');
    assert.equal(enkateSectionForFieldKey('leveranssatt'), 'distribution');
    assert.equal(enkateSectionForFieldKey('bankIdKrav'), 'distribution');
    assert.equal(enkateSectionForFieldKey('betalningsuppdrag'), 'tjanster');
    assert.equal(enkateSectionForFieldKey('bolagsbildningAtKund'), 'tjanster');
    assert.equal(enkateSectionForFieldKey('storaKundberoenden'), 'intern');
    assert.equal(enkateSectionForFieldKey('outsourcingUnderleverantorer'), 'intern');
  });

  it('exporteras via byra-profil-fields', () => {
    assert.equal(PROFIL_SECTION_ANALYSIS_TARGETS, TARGETS);
    const summary = buildKunderEnkatSummary({});
    assert.match(summary.enkateHref, /section=kundstock/);
    assert.equal(summary.analysisHref, 'kundrisker-mm.html');
  });

  it('är inkopplat i enkät, övriga, AR och API-schema', () => {
    const enkHtml = fs.readFileSync(path.join(__dirname, '../public/byra-profil-enkate.html'), 'utf8');
    const enkJs = fs.readFileSync(path.join(__dirname, '../public/js/byra-profil-enkate.js'), 'utf8');
    const ovrHtml = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const ovrJs = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    const indexJs = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const kundJs = fs.readFileSync(path.join(__dirname, '../public/js/kundrisker-enkat-sammanfattning.js'), 'utf8');
    const arHtml = fs.readFileSync(path.join(__dirname, '../public/allman-riskbedomning-byra.html'), 'utf8');
    const arJs = fs.readFileSync(path.join(__dirname, '../public/js/allman-riskbedomning-byra.js'), 'utf8');

    assert.match(enkHtml, /byra-profil-analys-koppling\.js\?v=1/);
    assert.match(enkJs, /renderAnalysisBridge/);
    assert.match(enkJs, /ByraProfilAnalysKoppling/);
    assert.match(enkJs, /canonicalSectionId/);
    assert.match(ovrHtml, /byra-profil-analys-koppling\.js\?v=1/);
    assert.match(ovrHtml, /section=intern/);
    assert.match(ovrHtml, /section=distribution/);
    assert.match(ovrJs, /applyAnalysisFokusFromUrl/);
    assert.match(ovrJs, /data-risk-fokus/);
    assert.match(ovrJs, /geografiskMarknad/);
    assert.match(ovrJs, /renderByraProfilKaskadLinks/);
    assert.match(indexJs, /analysisTargets/);
    assert.match(kundJs, /section=kundstock/);
    assert.match(kundJs, /kundrisker-mm|Vilka är våra kunder|Från byråprofilen/);
    assert.match(kundJs, /kundResidualriskFordelning/);
    assert.match(kundJs, /riskniva/);
    assert.match(enkJs, /renderRiskFordelning|risk-fordelning/);
    assert.match(enkHtml, /byra-profil-enkate\.js\?v=20260916riskfordelning/);
    assert.match(arHtml, /id="ar-historik-track-record"/);
    assert.match(arHtml, /id="fld-ar-historik"/);
    assert.match(arHtml, /data-ai-kartlaggning="historik"/);
    assert.match(arJs, /loadByraProfilHistorik|applyHistorikFokusFromUrl/);
    assert.match(arJs, /fld-ar-historik/);
    const kopplingSrc = fs.readFileSync(path.join(__dirname, '../public/js/byra-profil-analys-koppling.js'), 'utf8');
    assert.match(kopplingSrc, /utsatta områden.*Vilka är våra kunder/s);
  });
});
