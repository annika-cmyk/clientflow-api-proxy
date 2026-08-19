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
