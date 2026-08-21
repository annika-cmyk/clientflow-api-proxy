const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SECTION_TITLE,
  normalizeStatistik,
  renderStatistikPdfHtml,
  renderStatistikWebHtml
} = require('./statistik-dokumentation');

const sample = {
  antalKunder: 12,
  riskniva: { Låg: 5, Normal: 3, Förhöjd: 2, Hög: 1, Oacceptabel: 1, Övrigt: 0 },
  antalPepEllerSanktion: 1,
  tjänster: [{ namn: 'Löpande bokföring', antal: 9 }],
  högriskbransch: [{ namn: 'Kontanthandel', antal: 2 }],
  riskfaktorerPerTyp: [{
    typ: 'Kund',
    antalKunder: 4,
    riskfaktorer: [{ namn: 'PEP i styrelsen', antal: 1 }]
  }]
};

describe('statistik-dokumentation', () => {
  it('normaliserar API-svaret med svenska nycklar', () => {
    const stat = normalizeStatistik(sample);
    assert.equal(stat.antalKunder, 12);
    assert.equal(stat.riskniva.Normal, 3);
    assert.equal(stat.riskniva.Förhöjd, 2);
    assert.equal(stat.riskniva.Hög, 1);
    assert.equal(stat.riskniva.Oacceptabel, 1);
    assert.equal(stat.tjanster[0].namn, 'Löpande bokföring');
    assert.equal(stat.hogriskbransch[0].antal, 2);
    assert.equal(stat.riskfaktorerPerTyp[0].riskfaktorer[0].namn, 'PEP i styrelsen');
  });

  it('räknar gammalt Medel som Normal', () => {
    const stat = normalizeStatistik({ riskniva: { Medel: 4, Normal: 1 } });
    assert.equal(stat.riskniva.Normal, 5);
  });

  it('bygger PDF-HTML med samma sektioner som statistiksidan', () => {
    const html = renderStatistikPdfHtml(sample);
    assert.match(html, new RegExp(SECTION_TITLE));
    assert.match(html, /Antal kunder \(byrån\)/);
    assert.match(html, /<td>12<\/td>/);
    assert.match(html, /Löpande bokföring/);
    assert.match(html, /Kontanthandel/);
    assert.match(html, /PEP i styrelsen/);
    assert.match(html, /Kunder per tjänst/);
    assert.match(html, /Högriskbransch/);
    assert.match(html, /Riskfaktorer per typ/);
  });

  it('bygger webb-HTML för dokumentationssidan', () => {
    const html = renderStatistikWebHtml(sample);
    assert.match(html, /dokumentation-statistik/);
    assert.match(html, /stat-number--normal/);
    assert.match(html, /stat-number--elevated/);
    assert.match(html, /stat-number--high/);
    assert.match(html, /stat-number--unacceptable/);
    assert.match(html, />3</);
    assert.match(html, /Löpande bokföring/);
  });

  it('visar tomma lägen utan att krascha', () => {
    const html = renderStatistikPdfHtml({});
    assert.match(html, /Inga tjänster valda hos kunderna/);
    assert.match(html, /Inga kunder med högriskbransch registrerad/);
    assert.match(html, /Inga kunder med riskfaktorer registrerade/);
  });

  it('ligger inte på redigeringssidan för allmän riskbedömning', () => {
    const editPage = fs.readFileSync(path.join(__dirname, '../public/allman-riskbedomning-byra.html'), 'utf8');
    assert.doesNotMatch(editPage, /statistik-dokumentation|dokumentation-statistik|riskbedomning-view/);
  });
});
