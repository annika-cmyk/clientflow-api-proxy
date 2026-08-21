const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractArticleLead, extractPolisenAmlReports, inferPolisenReportDate, decodeEntities, clipSentences } = require('./html');

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

  it('plockar Polisens omvärldsbevakningar och riskbedömningar', () => {
    const html = `
      <a href="/om-polisen/om-webbplatsen/om-cookies--kakor/">Så här använder polisen.se kakor</a>
      <a href="/aktuellt/handelser/2026/augusti/21/21-augusti-14.06-ovrigt-fagersta/">Polisens händelsenotis</a>
      <a href="/siteassets/dokument/om-polisen/penningtvatt/omvarldsbevakningar/omvarldsbevakning-penningtvatt-och-finansiering-av-terrorism-nr-2-2026.pdf">Omvärldsbevakning penningtvätt och finansiering av terrorism nr 2-2026 (pdf, 476 kB)</a>
      <a href="https://www.sns.se/artiklar/money-laundering-and-whistleblowers/">Penningtvätt och visselblåsare, på SNS webbplats (In English)</a>
      <a href="/siteassets/dokument/om-polisen/penningtvatt/nationell-riskbedomning-av-penningtvatt-och-finansiering-av-terrorism-i-sverige-2024_2025.pdf">Nationell riskbedömning av penningtvätt och finansiering av terrorism i Sverige 2024/2025 (pdf, 6 MB)</a>
      <a href="/siteassets/dokument/om-polisen/penningtvatt/national-risk-assessment-2023_2024.pdf">National risk assessment 2023/2024 - Neobanks (pdf, 1 MB)</a>
      <a href="https://bra.se/rapporter/arkiv/2021-04-28-finansiering-av-terrorism">Finansiering av terrorism – en studie av motåtgärder, på BRÅ:s webbplats</a>
      <a href="/contentassets/6cb30ec0b6c94950b2900eb0fd07c649/foimemo7363-jonsson-tf.pdf">Effektiviteten i EU:s åtgärder mot terroristfinansiering (pdf, 1 MB)</a>
      <a href="/om-polisen/samordning-mot-penningtvatt-och-finansiering-av-terrorism/det-svenska-systemet/">Det svenska systemet</a>
      <a href="/om-polisen/om-polisen/polisens-visselblasarfunktion/">Polisens visselblåsarfunktion</a>
      <a href="mailto:samordning-penningtvatt.terrorfinansiering@polisen.se">samordning-penningtvatt.terrorfinansiering@polisen.se</a>
      <a href="/om-polisen/polisens-arbete/finanspolisen/#publikationer">Se även publikationer från Finanspolisen</a>
      <a href="/om-polisen/samordning-mot-penningtvatt-och-finansiering-av-terrorism/">Till startsidan för Samordningsfunktionen</a>
    `;
    const items = extractPolisenAmlReports(html, 'https://polisen.se/om-polisen/samordning-mot-penningtvatt-och-finansiering-av-terrorism/rapporter/');
    assert.ok(items.some((i) => /omvärldsbevakning/i.test(i.title) && /nr 2-2026/.test(i.title)));
    assert.ok(items.some((i) => /nationell riskbedömning/i.test(i.title) && /2024\/2025/.test(i.title)));
    assert.ok(items.some((i) => /neobanks/i.test(i.title)));
    assert.ok(items.some((i) => /sns\.se/.test(i.source_url)));
    assert.ok(items.some((i) => /bra\.se/.test(i.source_url)));
    assert.ok(items.some((i) => /terroristfinansiering/i.test(i.title)));
    assert.ok(!items.some((i) => /kakor|händelsenotis|se även|till startsidan|det svenska systemet|visselblåsarfunktion|@polisen/i.test(i.title)));
    const scan = items.find((i) => /nr 2-2026/.test(i.title));
    assert.match(scan.published_at, /^2026-05-01/);
    assert.doesNotMatch(scan.title, /pdf, 476/);
  });

  it('läser år ur omvärldsbevakningens nummer', () => {
    assert.match(inferPolisenReportDate('Omvärldsbevakning nr 1-2026', ''), /^2026-02-01/);
    assert.match(inferPolisenReportDate('Nationell riskbedömning 2024/2025', ''), /^2025-01-15/);
  });

  it('klipper på meningsgräns', () => {
    const text = `${'A'.repeat(40)}. ${'B'.repeat(40)}. ${'C'.repeat(400)}`;
    const clipped = clipSentences(text, 120);
    assert.match(clipped, /\.$/);
    assert.ok(clipped.length <= 120);
  });
});
