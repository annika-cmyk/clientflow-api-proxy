const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const View = require('../public/js/identifierade-risker-view');

describe('identifierade-risker-view', () => {
  it('renderar tjänst som expanderbart kort med S×K och hot-tagg', () => {
    const html = View.render({
      tjanster: [{
        namn: 'Hantering av anläggningsregister och avskrivningar',
        tjanstebeskrivning: 'Byrån hanterar anläggningsregister.',
        sannolikhet: 2,
        konsekvens: 2,
        hot: [{ typ: 'PT', titel: 'Felaktiga avskrivningar', beskrivning: 'Kan dölja medel.' }],
        sarbarheter: [{ kategori: 'Verksamhet', titel: 'Bristande kontroll', beskrivning: 'Svagt underlag.' }],
        atgarder: [{ titel: 'Avstämning', beskrivning: 'Stäms av i Fortnox.' }],
        ptTfRelevans: 'TF',
        aktuell: true
      }],
      ovriga: []
    });
    assert.match(html, /Hantering av anläggningsregister/);
    assert.match(html, /risk-item/);
    assert.match(html, /Inneboende risk: Låg/);
    assert.match(html, /tag-pt/);
    assert.match(html, /Felaktiga avskrivningar/);
    assert.match(html, /Sårbarheter/);
    assert.match(html, /Avstämning/);
    assert.match(html, /Produkter och tjänster/);
    assert.doesNotMatch(html, /Redigera|Ta bort|Klarmarkera/);
  });

  it('renderar övrig riskfaktor med åtgärd och residualbricka', () => {
    const html = View.render({
      tjanster: [],
      ovriga: [{
        typ: 'Kunder',
        namn: 'Kontantintensiva kunder',
        beskrivning: 'Kontanter ökar risken.',
        atgard: 'Fråga om kassahantering.',
        sannolikhet: 4,
        konsekvens: 4,
        sannolikhetEfter: 2,
        konsekvensEfter: 3,
        ptTfRelevans: 'TF'
      }]
    });
    assert.match(html, /Kunder: Kontantintensiva kunder/);
    assert.match(html, /pt-tf-tag/);
    assert.match(html, /Inneboende risk: Hög/);
    assert.match(html, /Residualrisk: Normal/);
    assert.match(html, /Fråga om kassahantering/);
    assert.match(html, /ovriga-riskfaktorer\.html/);
  });

  it('tomt underlag hänvisar till källsidorna', () => {
    const html = View.render({ tjanster: [], ovriga: [] });
    assert.match(html, /Byråns tjänster/);
    assert.match(html, /Övriga riskfaktorer/);
    assert.doesNotMatch(html, /risk-item/);
  });

  it('dokumentation och AR laddar kortvyn', () => {
    const dok = fs.readFileSync(path.join(__dirname, '../public/dokumentation.html'), 'utf8');
    const ar = fs.readFileSync(path.join(__dirname, '../public/allman-riskbedomning-byra.html'), 'utf8');
    const dokJs = fs.readFileSync(path.join(__dirname, '../public/js/dokumentation.js'), 'utf8');
    const arJs = fs.readFileSync(path.join(__dirname, '../public/js/allman-riskbedomning-byra.js'), 'utf8');
    assert.match(dok, /identifierade-risker-view\.js/);
    assert.match(ar, /identifierade-risker-view\.js/);
    assert.match(dokJs, /IdentifieradeRiskerView/);
    assert.match(arJs, /IdentifieradeRiskerView\.mount/);
    assert.match(ar, /id="identifierade-risker-live"/);
  });
});
