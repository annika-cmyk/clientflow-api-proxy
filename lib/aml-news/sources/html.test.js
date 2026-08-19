const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractArticleLead, decodeEntities, clipSentences } = require('./html');

describe('extractArticleLead', () => {
  it('plockar meta och stycken och hoppar över kakor', () => {
    const html = `
      <meta name="description" content="I detta nyhetsbrev sammanfattar Revisorsinspektionen iakttagelser från tillsynen.">
      <p>På revisorsinspektionen.se använder vi kakor (cookies) för att webbplatsen ska fungera på ett bra sätt för dig.</p>
      <p>Myndigheten ger exempel på informationslänkar som revisorer kan anv&auml;nda i penningtv&auml;ttsarbetet.</p>
    `;
    const lead = extractArticleLead(html);
    assert.match(lead, /tillsynen|penningtvätt/i);
    assert.doesNotMatch(lead, /kakor/);
    assert.ok(lead.length > 60);
    assert.doesNotMatch(lead, /Bli revisor|Tillsyn Publicerat|prenumerera på nyheter/);
  });

  it('tar inte med sidmeny efter en bra ingress', () => {
    const html = `
      <meta name="description" content="Här hittar du information om vad som gäller för den som tidigare har varit auktoriserad eller godkänd revisor och vill återkomma till yrket.">
      <p>Här hittar du information om vad som gäller för den som tidigare har varit auktoriserad eller godkänd revisor och vill återkomma till yrket.</p>
      <div>Revision Bli revisor För revisorer Tillsyn Publicerat Regelverk Om oss Karriär</div>
      <p>Revision Bli revisor För revisorer Tillsyn Publicerat Regelverk Om oss Karriär</p>
    `;
    const lead = extractArticleLead(html);
    assert.match(lead, /auktoriserad eller godkänd revisor/);
    assert.doesNotMatch(lead, /Bli revisor|Om oss Karriär/);
  });

  it('ersätter avhuggen meta med det längre stycket', () => {
    const html = `
      <meta name="description" content="Sex personer åtalas vid Stockholms tingsrätt för grov ekonomisk brottslighet. Åtalet gäller bland annat flera grova bokföringsbrott, grova skattebrott och..">
      <p>Sex personer åtalas vid Stockholms tingsrätt för grov ekonomisk brottslighet. Åtalet gäller bland annat flera grova bokföringsbrott, grova skattebrott och penningtvätt kopplade till två bolag och dess företrädare.</p>
      <p>Den misstänkta brottsligheten har pågått mellan den 18 februari 2021 fram tills att företagen gick i konkurs i juni 2025. Bristerna i bokföringen uppgår till drygt 115 miljoner kronor.</p>
    `;
    const lead = extractArticleLead(html);
    assert.match(lead, /penningtvätt kopplade/);
    assert.match(lead, /115 miljoner/);
    assert.doesNotMatch(lead, /och\.\./);
  });

  it('avkodar namngivna entiteter', () => {
    assert.equal(decodeEntities('penningtv&auml;tt och &aring;terkomma'), 'penningtvätt och återkomma');
  });

  it('klipper på meningsgräns', () => {
    const text = `${'A'.repeat(40)}. ${'B'.repeat(40)}. ${'C'.repeat(400)}`;
    const clipped = clipSentences(text, 120);
    assert.match(clipped, /\.$/);
    assert.ok(clipped.length <= 120);
  });
});
