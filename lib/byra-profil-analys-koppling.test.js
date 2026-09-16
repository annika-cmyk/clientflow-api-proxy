const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TARGETS,
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

  it('bygger deep-links tillbaka till rätt enkätsektion', () => {
    assert.equal(enkateHref('intern'), 'byra-profil-enkate.html?section=intern');
    assert.equal(enkateHref('distribution'), 'byra-profil-enkate.html?section=distribution');
    assert.equal(enkateHref('kundstock'), 'byra-profil-enkate.html?section=kundstock');
    assert.equal(enkateSectionForFokus('verksamhet'), 'intern');
    assert.equal(enkateSectionForFokus('distribution'), 'distribution');
    assert.match(enkateHrefForFokus('verksamhet'), /section=intern/);
  });

  it('läser fokus från querystring', () => {
    assert.equal(fokusFromUrlSearch('?fokus=verksamhet'), 'verksamhet');
    assert.equal(fokusFromUrlSearch('?foo=1&fokus=distribution'), 'distribution');
    assert.equal(isKnownFokus('verksamhet'), true);
    assert.equal(isKnownFokus('kund'), false);
  });

  it('kopplar profilfält till enkätsektion', () => {
    assert.equal(enkateSectionForFieldKey('antalAnstallda'), 'intern');
    assert.equal(enkateSectionForFieldKey('leveranssatt'), 'distribution');
    assert.equal(enkateSectionForFieldKey('bankIdKrav'), 'distribution');
  });

  it('exporteras via byra-profil-fields', () => {
    assert.equal(PROFIL_SECTION_ANALYSIS_TARGETS, TARGETS);
    const summary = buildKunderEnkatSummary({});
    assert.match(summary.enkateHref, /section=kundstock/);
    assert.equal(summary.analysisHref, 'kundrisker-mm.html');
  });

  it('är inkopplat i enkät, övriga och API-schema', () => {
    const enkHtml = fs.readFileSync(path.join(__dirname, '../public/byra-profil-enkate.html'), 'utf8');
    const enkJs = fs.readFileSync(path.join(__dirname, '../public/js/byra-profil-enkate.js'), 'utf8');
    const ovrHtml = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const ovrJs = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    const indexJs = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const kundJs = fs.readFileSync(path.join(__dirname, '../public/js/kundrisker-enkat-sammanfattning.js'), 'utf8');

    assert.match(enkHtml, /byra-profil-analys-koppling\.js\?v=1/);
    assert.match(enkJs, /renderAnalysisBridge/);
    assert.match(enkJs, /ByraProfilAnalysKoppling/);
    assert.match(ovrHtml, /byra-profil-analys-koppling\.js\?v=1/);
    assert.match(ovrHtml, /section=intern/);
    assert.match(ovrHtml, /section=distribution/);
    assert.match(ovrJs, /applyAnalysisFokusFromUrl/);
    assert.match(ovrJs, /data-risk-fokus/);
    assert.match(ovrJs, /renderByraProfilKaskadLinks/);
    assert.match(indexJs, /analysisTargets/);
    assert.match(kundJs, /section=kundstock/);
    assert.match(kundJs, /kundrisker-mm|Vilka är våra kunder|Från byråprofilen/);
  });
});
