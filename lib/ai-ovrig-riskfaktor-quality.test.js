'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  OVRIG_HARD_PRIORITY_RULES,
  validateOvrigAiPayload,
  extractUnderlagTokens,
  isVagueKalla
} = require('./ai-ovrig-riskfaktor-quality');

const goodExtra = [
  'Kunden är smyckesdesigner, inte klassisk juvelerare.',
  'Styckpris ca 1500 kr, inget tydligt andrahandsvärde.',
  'Inköp från Portugal, försäljning via Shopify och återförsäljare i UK och Schweiz.',
  'Export till USA. Returer och rabatter förekommer.'
].join(' ');

function basePayload(overrides = {}) {
  return Object.assign({
    beskrivning: 'Högriskbransch smycken/antikviteter enligt lag.',
    ptTfRelevans: 'PT',
    sannolikhet: 4,
    konsekvens: 4,
    sannolikhetEfter: 2,
    konsekvensEfter: 3,
    motiveringInneboende: 'Branschens generella risk S=4 K=4.',
    motiveringResidual:
      'Residual sänks eftersom styckpris ca 1500 kr, svagt andrahandsvärde och Shopify/återförsäljare i UK och Schweiz ger spårbara intäkter; inköp från Portugal och export till USA stäms av mot underlag.',
    atgard:
      'Vid löpande bokföring och bokslut stämmer klientansvarig stickprovvis av bokförda intäkter mot Shopify-rapporter, Shopify-utbetalningar, återförsäljaravräkningar från Schweiz och UK samt kundfakturor. Inköp från Portugal stäms av mot leverantörsfakturor och bruttomarginal. Avvikelser dokumenteras i Fortnox/Capego och sammanfattas i kundakten i ClientFlow. Saknas rimliga förklaringar eskaleras enligt AML-rutinen.',
    hot: [
      {
        titel: 'Fiktiv webshopförsäljning',
        beskrivning: 'Falska Shopify-intäkter kan legitimera brottsvinster i bokföring, moms och bokslut när orderdata, betalningar och avräkningar inte stämmer mot redovisade intäkter. Byrån upptäcker det genom avstämning mellan Shopify, återförsäljare, lager och marginal.',
        kalla: 'Nationell riskbedömning av penningtvätt och finansiering av terrorism i Sverige 2024/2025, avsnitt om varuhandlare'
      },
      {
        titel: 'Handelsbaserad PT',
        beskrivning: 'Över-/underfakturering vid import från Portugal och export till UK/USA kan flytta medel med skenbart legitim dokumentation. Byrån behöver stämma av inköp, frakt, lager och redovisad försäljning så att volymer och marginal hänger ihop.',
        kalla: 'Samordningsfunktionens vägledning till redovisningskonsulter och skatterådgivare, mars 2025'
      },
      {
        titel: 'Returer och krediteringar',
        beskrivning: 'Returer och rabatter kan skapa återbetalningar eller justeringar som används i upplägg. Stickprov på returflöden och krediteringar i Shopify och återförsäljaravräkningar minskar risken och dokumenteras i kundakten.',
        kalla: 'Brå 2015:22 Penningtvätt och annan penninghantering'
      }
    ],
    sarbarheter: [
      { titel: 'Netto Shopify', beskrivning: 'Utbetalningar är netto efter avgifter och returer.' },
      { titel: 'Avräkningar', beskrivning: 'Återförsäljarintäkter kan vara provisioner.' },
      { titel: 'Exportunderlag', beskrivning: 'UK/Schweiz/USA kräver sammanhängande underlag.' }
    ]
  }, overrides);
}

describe('ai-ovrig-riskfaktor-quality', () => {
  it('har hårda prioriteringar för extra underlag, åtgärd och TF', () => {
    assert.match(OVRIG_HARD_PRIORITY_RULES, /EXTRA UNDERLAG/);
    assert.match(OVRIG_HARD_PRIORITY_RULES, /vid varje transaktion/);
    assert.match(OVRIG_HARD_PRIORITY_RULES, /Båda/);
    assert.match(OVRIG_HARD_PRIORITY_RULES, /exakta dokumentnamn/);
    assert.match(OVRIG_HARD_PRIORITY_RULES, /KÄLLUTDRAG/);
  });

  it('underkänner «vid varje transaktion» i åtgärd', () => {
    const bad = validateOvrigAiPayload(basePayload({
      atgard: 'Vid varje transaktion granskar klientansvarig underlaget i Capego. '.repeat(8)
    }), { extraUnderlag: goodExtra });
    assert.equal(bad.ok, false);
    assert.ok(bad.violations.some((v) => v.id === 'varje_transaktion'));
    assert.match(bad.repairHint, /REPARERA/);
  });

  it('underkänner generiskt svar som inte använder extra underlag', () => {
    const bad = validateOvrigAiPayload(basePayload({
      atgard: 'Klientansvarig gör stickprov på underlag i Capego och dokumenterar avvikelser i kundakten vid bokslut enligt rutin. '.repeat(3),
      motiveringResidual: 'Residual sänks genom strikta kontroller och dokumentation.'
    }), { extraUnderlag: goodExtra });
    assert.equal(bad.ok, false);
    assert.ok(bad.violations.some((v) => v.id === 'extra_underlag_saknas'));
  });

  it('underkänner vaga källor', () => {
    assert.equal(isVagueKalla('FATF-rapport om penningtvätt'), true);
    assert.equal(isVagueKalla('Nationell riskbedömning av penningtvätt'), true);
    assert.equal(
      isVagueKalla('Nationell riskbedömning av penningtvätt och finansiering av terrorism i Sverige 2024/2025, avsnitt om varuhandlare'),
      false
    );
    const bad = validateOvrigAiPayload(basePayload({
      hot: [
        { titel: 'A', beskrivning: 'Ett hot som beskriver modus steg för steg med bokföring och avstämning mot underlag i flera meningar för att passera längdkravet i validatorn.', kalla: 'FATF-rapport om penningtvätt' },
        { titel: 'B', beskrivning: 'Ett andra hot som beskriver modus steg för steg med bokföring och avstämning mot underlag i flera meningar för att passera längdkravet.', kalla: 'Nationell riskbedömning av penningtvätt' },
        { titel: 'C', beskrivning: 'Ett tredje hot som beskriver modus steg för steg med bokföring och avstämning mot underlag i flera meningar för att passera längdkravet.', kalla: 'Länsstyrelsen' }
      ]
    }), { extraUnderlag: goodExtra });
    assert.ok(bad.violations.some((v) => v.id === 'vag_kalla'));
  });

  it('kräver TF-hot när ptTfRelevans är Båda', () => {
    const bad = validateOvrigAiPayload(basePayload({
      ptTfRelevans: 'Båda'
    }), { extraUnderlag: goodExtra });
    assert.ok(bad.violations.some((v) => v.id === 'bada_utan_tf'));

    const ok = validateOvrigAiPayload(basePayload({
      ptTfRelevans: 'Båda',
      hot: [
        basePayload().hot[0],
        basePayload().hot[1],
        {
          titel: 'TF värdebärare',
          beskrivning: 'Terrorismfinansiering kan ske genom att smycken används som värdebärare, förs ut och säljs utomlands så att medel frigörs utanför Sverige. För denna designer med lågt styckpris och svagt andrahandsvärde är risken lägre men ska ändå följas upp vid oklara volymer eller leveranser.',
          kalla: 'Nationell riskbedömning 2024/2025, TF varuhandlare'
        }
      ]
    }), { extraUnderlag: goodExtra });
    assert.equal(ok.ok, true, JSON.stringify(ok.violations));
  });

  it('kräver minst 3 hot och 3 sårbarheter vid S×K ≥ 10', () => {
    const bad = validateOvrigAiPayload(basePayload({
      hot: basePayload().hot.slice(0, 2),
      sarbarheter: basePayload().sarbarheter.slice(0, 2)
    }), { extraUnderlag: goodExtra, sannolikhet: 4, konsekvens: 4 });
    assert.ok(bad.violations.some((v) => v.id === 'for_fa_hot'));
    assert.ok(bad.violations.some((v) => v.id === 'for_fa_sarbarheter'));
  });

  it('godkänner byrårealistiskt svar med underlagsfakta', () => {
    const tokens = extractUnderlagTokens(goodExtra);
    assert.ok(tokens.some((t) => /shopify/i.test(t)));
    const ok = validateOvrigAiPayload(basePayload(), { extraUnderlag: goodExtra });
    assert.equal(ok.ok, true, JSON.stringify(ok.violations));
  });

  it('kopplas in i ai-ovriga-riskfaktor-endpointen med retrieval och repair', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const chunk = index.slice(index.indexOf("app.post('/api/ai-ovriga-riskfaktor'"));
    assert.match(chunk, /OVRIG_HARD_PRIORITY_RULES/);
    assert.match(chunk, /validateOvrigAiPayload/);
    assert.match(chunk, /retrieveOvrigKallaUtdrag/);
    assert.match(chunk, /buildOvrigRepairPrompt/);
    assert.match(chunk, /vectorStoreForRun/);
    assert.match(chunk, /cf-ovrig-riskfaktor-fix/);
    assert.match(chunk, /retrieval:\s*\{/);
  });
});
