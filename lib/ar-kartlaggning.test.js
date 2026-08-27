'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const arKartlaggning = require('./ar-kartlaggning');

describe('ar-kartlaggning', () => {
  it('parseKartlaggningJson hanterar objekt och sträng', () => {
    assert.deepEqual(arKartlaggning.parseKartlaggningJson('{"kunder":"Hej"}'), { kunder: 'Hej' });
    assert.deepEqual(arKartlaggning.parseKartlaggningJson({ geografi: 'Sverige' }), { geografi: 'Sverige' });
    assert.deepEqual(arKartlaggning.parseKartlaggningJson(''), {});
  });

  it('serializeKartlaggningJson sparar bara ifyllda avsnitt', () => {
    assert.equal(
      arKartlaggning.serializeKartlaggningJson({ kunder: 'A', distribution: '', geografi: 'B' }),
      '{"kunder":"A","geografi":"B"}'
    );
  });

  it('formatStatBlock inkluderar utökad kundstatistik', () => {
    const text = arKartlaggning.formatStatBlock({
      antalKunder: 5,
      riskniva: { Låg: 2, Normal: 1, Förhöjd: 1, Hög: 1, Oacceptabel: 0 },
      antalPepEllerSanktion: 0,
      antalKunderHogriskbransch: 2,
      bolagsform: [{ namn: 'AB', antal: 3 }],
      branschKategorier: [{ namn: 'Bygg', antal: 2, hogrisk: true }],
      omsattningAnstalldaProfil: [{ omsattning: '0–200 000 kr', anstallda: 'Inga anställda', antal: 3 }],
      anstallda: [{ namn: 'Inga anställda', antal: 3 }],
      risksankande: [{ namn: 'Långsiktig affärsrelation', antal: 4 }],
      handelslander: [{ namn: 'Tyskland', antal: 1 }]
    });
    assert.match(text, /Antal kunder: 5/);
    assert.match(text, /Bolagsformer: AB: 3 kunder/);
    assert.match(text, /högriskbransch/);
    assert.match(text, /Gällande omsättning och antal anställda/);
    assert.match(text, /Långsiktig affärsrelation/);
    assert.match(text, /Handelsländer/);
  });

  it('formatBranschKategorier grupperar högrisk och övriga kategorier', () => {
    const text = arKartlaggning.formatBranschKategorier({
      antalKunder: 10,
      antalKunderHogriskbransch: 3,
      branschKategorier: [
        { namn: 'Bygg', antal: 2, hogrisk: true },
        { namn: 'Handel', antal: 4, hogrisk: false }
      ]
    });
    assert.match(text, /3 av 10 kunder \(30 %\) verkar i högriskbransch/);
    assert.match(text, /Högriskbranscher: Bygg \(2\)/);
    assert.match(text, /Övriga branschkategorier: Handel \(4\)/);
  });

  it('formatOmsattningAnstalldaNarrative beskriver andelar och avvikare', () => {
    const text = arKartlaggning.formatOmsattningAnstalldaNarrative({
      antalKunder: 10,
      omsattningAnstalldaProfil: [
        { omsattning: '0–200 000 kr', anstallda: 'Inga anställda', antal: 5 },
        { omsattning: '200 000–1,5 miljoner kr', anstallda: 'Inga anställda', antal: 4 },
        { omsattning: 'Över 10 miljoner kr', anstallda: '5 eller fler anställda', antal: 1 }
      ]
    });
    assert.match(text, /5 kunder \(50 %\) har 0–200 000 kr och inga anställda/);
    assert.match(text, /sticker ut/);
  });

  it('formatByraVerksamhetBlock fokuserar på byråns egna omständigheter', () => {
    const text = arKartlaggning.formatByraVerksamhetBlock({
      antalKunder: 115,
      tjänster: [{ namn: 'Bokföring' }, { namn: 'Lön' }],
      branschKategorier: [{ namn: 'Bygg' }, { namn: 'Handel' }, { namn: 'IT' }]
    }, {
      'Antal anställda': 3,
      'Omsättning': '5000000',
      'Antal kundföretag': '115'
    });
    assert.match(text, /Byråns antal anställda: 3/);
    assert.match(text, /Antal aktiva kunder i ClientFlow: 115/);
    assert.match(text, /Kunder per anställd \(ungefär\): 38/);
    assert.match(text, /Antal olika branschkategorier/);
    assert.doesNotMatch(text, /PEP/);
    assert.doesNotMatch(text, /Risknivåer/);
  });

  it('buildAiSystemPrompt för verksamhet förbjuder kundfokus', () => {
    const prompt = arKartlaggning.buildAiSystemPrompt('verksamhet');
    assert.match(prompt, /ENDAST beskriva byråns egna/);
    assert.match(prompt, /inte kundernas risknivåer/);
    assert.match(prompt, /många kunder per anställd/);
    assert.match(prompt, /organisation, arbetssätt, kompetens och kontrollmiljö/);
  });

  it('buildAiUserPrompt för verksamhet inkluderar vägledande fråga', () => {
    const prompt = arKartlaggning.buildAiUserPrompt('verksamhet', {
      statistikText: 'Byråns antal anställda: 2',
      befintligText: ''
    });
    assert.match(prompt, /Hur kan byråns organisation, arbetssätt, kompetens eller kontrollmiljö/);
    assert.match(prompt, /redovisningstjänst utnyttjas för penningtvätt/);
  });

  it('buildAiUserPrompt för verksamhet använder byrådata-rubrik', () => {
    const prompt = arKartlaggning.buildAiUserPrompt('verksamhet', {
      statistikText: 'Byråns antal anställda: 2',
      byraProfil: 'BYRÅPROFIL: kunddata'
    });
    assert.match(prompt, /BYRÅDATA/);
    assert.doesNotMatch(prompt, /BYRÅPROFIL/);
  });

  it('serializeKartlaggningJson sparar layout med rubriker och dolda block', () => {
    assert.equal(
      arKartlaggning.serializeKartlaggningJson({
        kunder: 'Text',
        layout: { titles: { 'ar-kunder': 'Min rubrik' }, hidden: ['ar-flaggor-chart'] }
      }),
      '{"kunder":"Text","layout":{"titles":{"ar-kunder":"Min rubrik"},"hidden":["ar-flaggor-chart"]}}'
    );
  });

  it('extractArLayout plockar ut titles och hidden', () => {
    assert.deepEqual(
      arKartlaggning.extractArLayout({ layout: { titles: { a: 'B' }, hidden: ['x'] } }),
      { titles: { a: 'B' }, hidden: ['x'] }
    );
  });

  it('buildAiUserPrompt inkluderar infotext och BankID för geografi', () => {
    const prompt = arKartlaggning.buildAiUserPrompt('geografi', {
      statistikText: 'Antal kunder: 1',
      befintligText: ''
    });
    assert.match(prompt, /2\.1\.4 Geografiska/);
    assert.match(prompt, /LÄNSSTYRELSENS KRAV/);
    assert.match(prompt, /BankID/);
  });
});

describe('allmän riskbedömning HTML – sektion 2 kartläggning', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/allman-riskbedomning-byra.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../public/js/allman-riskbedomning-byra.js'), 'utf8');

  it('har metod för riskbedömning som 1.1 under syfte och omfattning', () => {
    const start = html.indexOf('data-card-id="fld-sektion1"');
    const end = html.indexOf('data-card-id="fld-sektion2"');
    const sektion1 = html.slice(start, end);
    assert.match(sektion1, /1\.1 Metod för Riskbedömning/);
    assert.match(sektion1, /id="fld-metod-riskbedomning"/);
    assert.doesNotMatch(sektion1, /3\. Metod för Riskbedömning/);
    assert.match(sektion1, /byra-card--flat/);
    assert.doesNotMatch(sektion1, /ar-underkort-card/);
  });

  it('har underkort 2.1 med tjänster, kunder, distribution, geografi och verksamhet', () => {
    assert.match(html, /2\.1 Kartläggning av byråns verksamhet/);
    assert.doesNotMatch(html, /Byråns nyckeltal/);
    assert.doesNotMatch(html, /fld-antal-anstallda/);
    assert.match(html, /2\.1\.1 Våra tjänster/);
    assert.doesNotMatch(html, /Vi erbjuder följande tjänster/);
    assert.match(html, /id="ar-tjanster-chart"/);
    assert.match(html, /2\.1\.2 Kunder/);
    assert.match(html, /id="fld-ar-kunder"/);
    assert.match(html, /2\.1\.3 Distributionskanaler/);
    assert.match(html, /2\.1\.4 Geografiska förhållanden/);
    assert.match(html, /2\.1\.5 Verksamhetsspecifika omständigheter/);
    assert.match(html, /Hur kan byråns organisation, arbetssätt, kompetens eller kontrollmiljö/);
    assert.doesNotMatch(html, /ar-verksamhet-chart/);
    assert.doesNotMatch(html, /ar-verksamhet-live/);
    assert.match(html, /btn-ar-save-layout/);
    assert.match(html, /data-ar-title-id="ar-verksamhet"/);
    assert.match(html, /data-lansstyrelse="kunder"/);
    assert.match(html, /ar-info-tip/);
    assert.doesNotMatch(html, /id="ar-infotext-kunder"/);
    assert.match(html, /id="ar-bankid-text"/);
  });

  it('stapeldiagrammet ligger i avsnitt 2.1.1, inte i avsnitt 3', () => {
    const start = html.indexOf('data-field-id="fld-identifierade-risker"');
    const end = html.indexOf('data-card-id="fld-identifierade-nya"');
    const card3 = html.slice(start, end);
    assert.doesNotMatch(card3, /id="ar-tjanster-chart"/);
    assert.match(html, /id="ar-tjanster-chart"/);
  });

  it('JS laddar och sparar kartläggning JSON', () => {
    assert.match(js, /AR Kartläggning \(JSON\)/);
    assert.match(js, /Hur kan byråns organisation, arbetssätt, kompetens eller kontrollmiljö/);
    assert.match(js, /initAiKartlaggning/);
    assert.match(js, /\/api\/ai-ar-kartlaggning/);
    assert.match(js, /initArLayoutEditor/);
    assert.match(js, /readFullKartlaggningJson/);
  });

  it('redigera-knappar i nästlade fält döljer inte hela sektionskortet', () => {
    assert.match(js, /function cardDirectView/);
    assert.match(js, /:scope > \.byra-card-view/);
    assert.match(js, /editButtonsOwnedByCard/);
    assert.match(js, /hasAttribute\('data-card-id'\) && !card\.hasAttribute\('data-field-id'\)/);
  });

  it('backend skapar AR Kartläggning-fält vid behov', () => {
    const indexSrc = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(indexSrc, /ensureArKartlaggningField/);
    assert.match(indexSrc, /arKartlaggning\.KARTLAGGNING_FIELD/);
  });
});
