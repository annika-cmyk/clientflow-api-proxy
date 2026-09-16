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
  'Inköp från Portugal, försäljning via Shopify och återförsäljare i UK och Schweiz.'
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
      'Residual sänks eftersom styckpris ca 1500 kr, svagt andrahandsvärde och Shopify/återförsäljare ger spårbara intäkter från Portugal till UK/Schweiz.',
    atgard:
      'Vid löpande bokföring och bokslut gör klientansvarig stickprov på Shopify-rapporter och återförsäljaravräkningar. Avvikelser dokumenteras i Fortnox och kundakten i ClientFlow.',
    hot: [
      {
        titel: 'Fiktiv webshopförsäljning',
        beskrivning: 'Falska Shopify-intäkter legitimera brottsvinster i bokföringen.',
        kalla: 'Nationell riskbedömning av penningtvätt och finansiering av terrorism i Sverige 2024/2025, avsnitt om varuhandlare'
      },
      {
        titel: 'Handelsbaserad PT',
        beskrivning: 'Över-/underfakturering vid import från Portugal och export till UK/USA.',
        kalla: 'Samordningsfunktionens vägledning till redovisningskonsulter och skatterådgivare, mars 2025'
      },
      {
        titel: 'Returer och krediteringar',
        beskrivning: 'Returer skapar återbetalningar som kan användas i upplägg.',
        kalla: 'Brå 2015:22 Penningtvätt och annan penninghantering'
      }
    ],
    sarbarheter: [
      { titel: 'Netto Shopify', beskrivning: 'Utbetalningar är netto efter avgifter.' },
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
    assert.match(OVRIG_HARD_PRIORITY_RULES, /irrelevanta file_search/);
  });

  it('underkänner «vid varje transaktion» i åtgärd', () => {
    const bad = validateOvrigAiPayload(basePayload({
      atgard: 'Vid varje transaktion granskar klientansvarig underlaget i Capego.'
    }), { extraUnderlag: goodExtra });
    assert.equal(bad.ok, false);
    assert.ok(bad.violations.some((v) => v.id === 'varje_transaktion'));
    assert.match(bad.repairHint, /REPARERA/);
  });

  it('underkänner generiskt svar som inte använder extra underlag', () => {
    const bad = validateOvrigAiPayload(basePayload({
      atgard: 'Klientansvarig gör stickprov på underlag i Capego.',
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
        { titel: 'A', beskrivning: 'Beskrivning enough text here.', kalla: 'FATF-rapport om penningtvätt' },
        { titel: 'B', beskrivning: 'Beskrivning enough text here.', kalla: 'Nationell riskbedömning av penningtvätt' },
        { titel: 'C', beskrivning: 'Beskrivning enough text here.', kalla: 'Länsstyrelsen' }
      ]
    }), { extraUnderlag: goodExtra });
    assert.ok(bad.violations.some((v) => v.id === 'vag_kalla'));
  });

  it('kräver TF-förklaring när ptTfRelevans är Båda', () => {
    const bad = validateOvrigAiPayload(basePayload({
      ptTfRelevans: 'Båda',
      hot: [
        { titel: 'PT1', beskrivning: 'Penningtvätt via fakturor.', kalla: 'Nationell riskbedömning 2024/2025, kap. 4' },
        { titel: 'PT2', beskrivning: 'Exportintäkter utan underlag.', kalla: 'Samordningsfunktionens vägledning mars 2025' },
        { titel: 'PT3', beskrivning: 'Returer i bokföringen.', kalla: 'Brå 2015:22 Penningtvätt' }
      ]
    }), { extraUnderlag: goodExtra });
    assert.ok(bad.violations.some((v) => v.id === 'bada_utan_tf'));

    const ok = validateOvrigAiPayload(basePayload({
      ptTfRelevans: 'Båda',
      hot: [
        { titel: 'PT1', beskrivning: 'Penningtvätt via fakturor.', kalla: 'Nationell riskbedömning 2024/2025, kap. 4' },
        { titel: 'PT2', beskrivning: 'Exportintäkter utan underlag.', kalla: 'Samordningsfunktionens vägledning mars 2025' },
        {
          titel: 'TF värdebärare',
          beskrivning: 'Lyxvaror kan föras ut och säljas för terrorismfinansiering, men lägre här p.g.a. styckpris.',
          kalla: 'Nationell riskbedömning 2024/2025, TF'
        }
      ]
    }), { extraUnderlag: goodExtra });
    assert.equal(ok.ok, true);
  });

  it('kräver minst 3 hot vid S×K ≥ 10', () => {
    const bad = validateOvrigAiPayload(basePayload({
      hot: [
        { titel: 'A', beskrivning: 'Ett.', kalla: 'Nationell riskbedömning 2024/2025, kap. 4' },
        { titel: 'B', beskrivning: 'Två.', kalla: 'Samordningsfunktionens vägledning mars 2025' }
      ]
    }), { extraUnderlag: goodExtra, sannolikhet: 4, konsekvens: 4 });
    assert.ok(bad.violations.some((v) => v.id === 'for_fa_hot'));
  });

  it('godkänner byrårealistiskt svar med underlagsfakta', () => {
    const tokens = extractUnderlagTokens(goodExtra);
    assert.ok(tokens.some((t) => /shopify/i.test(t)));
    const ok = validateOvrigAiPayload(basePayload(), { extraUnderlag: goodExtra });
    assert.equal(ok.ok, true);
    assert.equal(ok.violations.length, 0);
  });

  it('kopplas in i ai-ovriga-riskfaktor-endpointen', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const chunk = index.slice(index.indexOf("app.post('/api/ai-ovriga-riskfaktor'"));
    assert.match(chunk, /OVRIG_HARD_PRIORITY_RULES/);
    assert.match(chunk, /validateOvrigAiPayload/);
    assert.match(chunk, /repairHint/);
    assert.match(chunk, /cf-ovrig-riskfaktor-fix/);
    assert.match(chunk, /quality:\s*\{/);
  });
});
