const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const kundkort = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

describe('beskrivningskort på kundkort och KYC', () => {
  it('har de fyra korten med rätt ledtexter', () => {
    assert.match(kundkort, /title: 'Verksamhet'/);
    assert.match(kundkort, /hint: 'Vad gör kunden'/);
    assert.match(kundkort, /title: 'Kostnader'/);
    assert.match(kundkort, /vilka leverantörerna är och hur betalning sker/);
    assert.match(kundkort, /title: 'Intäkterna'/);
    assert.match(kundkort, /hur möter de sina kunder \(digitalt, fysiskt möte\?\)/);
    assert.match(kundkort, /title: 'Bokföring'/);
    assert.match(kundkort, /Har kunden bytt konsulter\/revisor tidigare/);
    assert.match(kundkort, /field: 'Bokföring beskrivning'/);
    assert.match(kundkort, /beskrivning-inner/);
    assert.match(kundkort, /beskrivning-delkort/);
    assert.match(kundkort, /_maybeMigrateBeskrivningTillVerksamhet/);
    assert.match(kundkort, /_resolvedVerksamhetHtml/);
    assert.match(kundkort, /_isGenericKundbeskrivning/);
    assert.match(kundkort, /_meaningfulKundText/);
    assert.match(kundkort, /\/\^beskrivning av kunden\\\.\?\$\/i/);
  });

  it('lägger delkorten i Beskrivning av kunden och fyller verksamhet från gammal beskrivning', () => {
    assert.match(kundkort, /class="beskrivning-inner"/);
    assert.match(kundkort, /beskrivning-delkort-box/);
    assert.match(kundkort, /_renderBeskrivningDelkort[\s\S]*<!-- KORT 4: Redovisningsuppgifter -->/);
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(css, /\.beskrivning-delkort\s*\{[^}]*background:\s*transparent/);
    assert.match(css, /\.beskrivning-delkort-box\s*\{[^}]*background:\s*#f8fafc/);
    assert.match(kundkort, /_resolvedVerksamhetHtml\(fields\)/);
    assert.match(kundkort, /_maybeMigrateBeskrivningTillVerksamhet/);
  });

  it('synkar verksamhet, kostnader och intäkter till KYC men inte bokföring', () => {
    assert.match(kundkort, /id="kyc-verksamhet"/);
    assert.match(kundkort, /id="kyc-kostnader"/);
    assert.match(kundkort, /id="kyc-intakterna"/);
    assert.match(kundkort, /kycKey: 'verksamhet'/);
    assert.match(kundkort, /kycKey: 'kostnader'/);
    assert.match(kundkort, /kycKey: 'intakterna'/);
    assert.match(kundkort, /kycKey: null/);
    assert.doesNotMatch(kundkort, /id="kyc-bokforing"/);
    assert.match(kundkort, /kyc-beskrivning-card/);
    assert.match(kundkort, /kyc-beskrivning-block/);
    assert.match(kundkort, /kyc-beskrivning-title/);
    assert.match(kundkort, /kyc-beskrivning-card[\s\S]*id="kyc-verksamhet"/);
    assert.match(kundkort, /<!-- 5\. AFFÄRSFÖRBINDELSENS SYFTE OCH ART -->[\s\S]*kyc-beskrivning-card[\s\S]*<!-- 6\. INTERNATIONELL HANDEL -->/);
    assert.doesNotMatch(kundkort, /id="kyc-syfte-affarsrelation"[\s\S]*id="kyc-verksamhet"[\s\S]*id="kyc-tjanster"/);
    assert.match(kundkort, /f\['Beskrivning av kunden'\]/);
    assert.doesNotMatch(kundkort, /_kycPrefillText\(\s*f\['Verksamhet'\],\s*saved\.verksamhet,\s*f\['Verksamhetsbeskrivning'\]/);
  });

  it('skapar Airtable-fält och skriver tillbaka dem vid KYC-sparning', () => {
    assert.match(index, /name: 'Verksamhet'/);
    assert.match(index, /name: 'Kostnader'/);
    assert.match(index, /name: 'Intäkterna'/);
    assert.match(index, /name: 'Bokföring beskrivning'/);
    assert.match(index, /syncFields\['Verksamhet'\]/);
    assert.match(index, /syncFields\['Kostnader'\]/);
    assert.match(index, /syncFields\['Intäkterna'\]/);
    assert.match(index, /htmlPlainText\(String\(req\.body\.kostnader/);
  });

  it('avkodar &nbsp; när kundkort-text fylls i KYC', () => {
    assert.match(kundkort, /HtmlPlainText\.htmlToPlainText/);
    assert.doesNotMatch(kundkort, /if \(!\/\[<>\]\/.test\(raw\)\) return raw;/);
    const browserLib = fs.readFileSync(path.join(__dirname, '../public/js/html-plain-text.js'), 'utf8');
    assert.match(browserLib, /&nbsp;/);
  });

  it('visar datum för senaste riskbedömning vid dokumentera-knappen', () => {
    assert.match(kundkort, /_senasteRiskbedomningDatumLabel/);
    assert.match(kundkort, /riskbedomning-senaste-datum/);
    assert.match(kundkort, /Senaste riskbedömning:/);
    assert.match(index, /Riskbedömning utförd datum/);
  });

  it('låter ange skapat datum vid dokumentuppladdning', () => {
    assert.match(kundkort, /upload-doc-created-date/);
    assert.match(kundkort, /Skapat datum/);
    assert.match(kundkort, /createdDate: createdDate/);
    assert.match(index, /createdDate: createdDateInput/);
  });
});
