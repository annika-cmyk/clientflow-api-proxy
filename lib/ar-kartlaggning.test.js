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
      bolagsform: [{ namn: 'AB', antal: 3 }],
      omsattning: [{ namn: '0–200 000 kr', antal: 2 }],
      risksankande: [{ namn: 'Långsiktig affärsrelation', antal: 4 }],
      handelslander: [{ namn: 'Tyskland', antal: 1 }]
    });
    assert.match(text, /Antal kunder: 5/);
    assert.match(text, /Bolagsformer: AB: 3 kunder/);
    assert.match(text, /Omsättningsintervall/);
    assert.match(text, /Långsiktig affärsrelation/);
    assert.match(text, /Handelsländer/);
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
    assert.match(html, /data-ai-kartlaggning="kunder"/);
    assert.match(html, /id="ar-infotext-kunder"/);
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
    assert.match(js, /initAiKartlaggning/);
    assert.match(js, /\/api\/ai-ar-kartlaggning/);
    assert.match(js, /readKartlaggningFromForm/);
  });
});
