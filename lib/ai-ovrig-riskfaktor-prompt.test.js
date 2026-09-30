'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  formatOvrigRiskfaktorSubjectBlock,
  formatOvrigExtraUnderlagBlock,
  formatOvrigSubjectScopeRules,
  resolveOvrigAtgardAiRules,
  resolveOvrigExtraUnderlagAiRules,
  ovrigAtgardSchemaHint,
  readOvrigExtraUnderlag,
  isBolagsformRiskfaktorNamn,
  isBranschRiskfaktorNamn,
  BOLAGSFORM_ANALYS_AI_RULES,
  BOLAGSFORM_ATGARD_AI_RULES,
  BOLAGSFORM_EXTRA_UNDERLAG_AI_RULES,
  BRANSCH_ANALYS_AI_RULES,
  OVRIG_EXTRA_UNDERLAG_AI_RULES
} = require('./ai-ovrig-riskfaktor-prompt');

describe('ai-ovrig-riskfaktor-prompt', () => {
  it('låter riskfaktorns namn styra och typen vara kategori', () => {
    const block = formatOvrigRiskfaktorSubjectBlock(
      'Kundens har kunder/leverantörer i utsatta områden',
      'Geografisk riskfaktorer - här finns kundens kunder & leverantörer'
    );
    assert.match(block, /RISKFAKTOR \(huvudämne/);
    assert.match(block, /Kundens har kunder\/leverantörer i utsatta områden/);
    assert.match(block, /TYP AV RISKFAKTOR \(endast kategori/);
    assert.match(block, /utsatta områden/);
    assert.ok(
      block.indexOf('Kundens har kunder/leverantörer i utsatta områden')
        < block.indexOf('TYP AV RISKFAKTOR'),
      'namnet ska komma före typen'
    );
  });

  it('används i ai-ovriga-riskfaktor-endpointen', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /ai-ovrig-riskfaktor-prompt/);
    assert.match(index, /formatOvrigRiskfaktorSubjectBlock/);
    const chunk = index.slice(index.indexOf("app.post('/api/ai-ovriga-riskfaktor'"));
    assert.match(chunk, /formatOvrigRiskfaktorSubjectBlock\(riskfaktor,\s*typ\)/);
    assert.doesNotMatch(
      chunk.slice(0, 2500),
      /TYP AV RISKFAKTOR: \$\{typ/
    );
  });

  it('formaterar extra underlag med krav på åtgärd och residual', () => {
    assert.equal(formatOvrigExtraUnderlagBlock(''), '');
    assert.equal(formatOvrigExtraUnderlagBlock('   '), '');
    const block = formatOvrigExtraUnderlagBlock(
      'Styckpris ca 1500 kr, inget andrahandsvärde, säljer via Shopify.'
    );
    assert.match(block, /EXTRA UNDERLAG FRÅN BYRÅN/);
    assert.match(block, /atgard/);
    assert.match(block, /motiveringResidual/);
    assert.match(block, /Styckpris ca 1500 kr/);
    assert.match(block, /Shopify/);
    assert.match(block, /upptäckts-\/avstämningsperspektiv/);
  });

  it('läser extra underlag från toppnivå eller befintligt', () => {
    assert.equal(readOvrigExtraUnderlag({ extraUnderlag: 'Toppnivå' }), 'Toppnivå');
    assert.equal(
      readOvrigExtraUnderlag({ befintligt: { extraUnderlag: 'Nested' } }),
      'Nested'
    );
    assert.equal(
      readOvrigExtraUnderlag({
        extraUnderlag: 'Topp',
        befintligt: { extraUnderlag: 'Nested' }
      }),
      'Topp'
    );
    assert.equal(readOvrigExtraUnderlag({}), '');
  });

  it('har skarpa regler mot Capego-boilerplate utan underlagsfakta', () => {
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /Capego/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /motiveringResidual/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /andrahandsvärde/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /betalningssätt/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /Inneboende S.K för lagstadgade/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /sänks INTE av kundspecifika/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /skriv OM/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /EXPANDERA/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /Hot och sårbarheter/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /ompröva ALLTID/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /högt värde, flyttbara/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /Shopify/);
    assert.match(OVRIG_EXTRA_UNDERLAG_AI_RULES, /över-\/underfakturering/);
  });

  it('endpointen kräver kompletta hot/sårbarheter i AI-svaret', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const chunk = index.slice(index.indexOf("app.post('/api/ai-ovriga-riskfaktor'"));
    assert.match(chunk, /KOMPLETT SVAR \(krav\)/);
    assert.match(chunk, /Hoppa aldrig över hot eller sårbarheter/);
    assert.match(chunk, /ANTAL \(minst/);
    assert.match(chunk, /faltSomGenererades: 'beskrivning,hot,sarbarheter,sxk,atgard'/);
  });

  it('endpointen väger in extra underlag i prompten', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const chunk = index.slice(index.indexOf("app.post('/api/ai-ovriga-riskfaktor'"));
    assert.match(chunk, /readOvrigExtraUnderlag/);
    assert.match(chunk, /formatOvrigExtraUnderlagBlock/);
    assert.match(chunk, /resolveOvrigExtraUnderlagAiRules/);
    assert.match(chunk, /extraUnderlagAiRules/);
    assert.match(chunk, /extraUnderlagBlock/);
    assert.match(chunk, /preferUnderlagRewrite/);
    assert.match(chunk, /formatOvrigExistingBlock\(befintligt,\s*\{/);
  });

  it('lägger statiska AI-regler i instructions och variabelt underlag i input (prompt cache)', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const chunk = index.slice(index.indexOf("app.post('/api/ai-ovriga-riskfaktor'"));
    assert.match(chunk, /const systemPrompt = `/);
    assert.match(chunk, /const userPrompt = `/);
    assert.match(chunk, /promptCacheKey:\s*cacheKey/);
    assert.match(chunk, /cf-ovrig-riskfaktor-rev/);
    assert.match(chunk, /cf-ovrig-riskfaktor-gen/);
    assert.match(chunk, /cf-ovrig-riskfaktor-fix/);
    assert.match(chunk, /maxOutputTokens:\s*8192/);
    assert.match(chunk, /resolveByraAnalysModel/);
    assert.match(chunk, /aiModel:\s*byraAnalysModel/);
    const sysStart = chunk.indexOf('const systemPrompt');
    const userStart = chunk.indexOf('const userPrompt');
    assert.ok(sysStart > 0 && userStart > sysStart);
    const sysPart = chunk.slice(sysStart, userStart);
    assert.match(sysPart, /PEDAGOGISK_ANALYS_AI_RULES/);
    assert.match(sysPart, /MOTIVERING_AI_RULES/);
    assert.match(sysPart, /OVRIG_HARD_PRIORITY_RULES/);
    assert.match(sysPart, /OVRIG_COMPLIANCE_FRAME/);
    assert.doesNotMatch(sysPart, /formatOvrigRiskfaktorSubjectBlock/);
    assert.match(chunk.slice(userStart, userStart + 800), /formatOvrigRiskfaktorSubjectBlock/);
  });

  it('klienten skickar extraUnderlag och skriver in åtgärd/residual vid regenerering', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.match(js, /extraUnderlag:\s*befintligt\.extraUnderlag/);
    assert.match(js, /body:\s*JSON\.stringify\(\{\s*riskfaktor,\s*typ,\s*befintligt,\s*extraUnderlag:/);
    assert.match(js, /preferUnderlagRewrite:\s*!!befintligt\.extraUnderlag/);
    assert.match(js, /skrivit om åtgärd och residual utifrån Extra underlag/);
  });

  it('identifierar bolagsform- och branschnamn', () => {
    assert.equal(isBolagsformRiskfaktorNamn('Kunder med bolagsform Aktiebolag'), true);
    assert.equal(
      isBolagsformRiskfaktorNamn('Kunder med bolagsformerna Enskild firma, Aktiebolag'),
      true
    );
    assert.equal(isBolagsformRiskfaktorNamn('Enskild firma · 57; Aktiebolag · 46'), true);
    assert.equal(isBolagsformRiskfaktorNamn('Kunder i högriskbransch: Smycken'), false);
    assert.equal(isBranschRiskfaktorNamn('Kunder i högriskbransch: Smycken'), true);
    assert.equal(isBranschRiskfaktorNamn('Kunder i bransch: Bygg'), true);
    assert.equal(isBranschRiskfaktorNamn('Kunder med bolagsform Aktiebolag'), false);
  });

  it('bolagsform-regler förbjuder namngivna system/tjänster och kräver övergripande åtgärder', () => {
    assert.match(BOLAGSFORM_ANALYS_AI_RULES, /ENDAST om den angivna bolagsformen/);
    assert.match(BOLAGSFORM_ANALYS_AI_RULES, /ökar eller minskar AML-risk/);
    assert.match(BOLAGSFORM_ANALYS_AI_RULES, /FÖRBJUDET: blanda in branschrisk/);
    assert.match(BOLAGSFORM_ATGARD_AI_RULES, /FÖRBJUDET att namnge/);
    assert.match(BOLAGSFORM_ATGARD_AI_RULES, /Fortnox/);
    assert.match(BOLAGSFORM_ATGARD_AI_RULES, /Capego/);
    assert.match(BOLAGSFORM_ATGARD_AI_RULES, /BankID/);
    assert.match(BOLAGSFORM_ATGARD_AI_RULES, /kundkännedomsåtgärder/);
    assert.match(BOLAGSFORM_ATGARD_AI_RULES, /uppföljning/);
    assert.match(BOLAGSFORM_ATGARD_AI_RULES, /dokumentation/);
    assert.match(BOLAGSFORM_ATGARD_AI_RULES, /FÅR INTE gå in i detaljer/);
    assert.match(BOLAGSFORM_ATGARD_AI_RULES, /Tjänster och system hanteras separat/);
    assert.match(BOLAGSFORM_EXTRA_UNDERLAG_AI_RULES, /Fortnox\/Capego\/BankID/);
    assert.match(BRANSCH_ANALYS_AI_RULES, /bolagsform/);
  });

  it('formatOvrigSubjectScopeRules och resolve-hjälpare väljer bolagsform-scope', () => {
    const bolag = formatOvrigSubjectScopeRules('Kunder med bolagsform Enskild firma');
    assert.match(bolag, /BOLAGSFORM — ÄMNESSCOPE/);
    assert.match(bolag, /BOLAGSFORM — RISKREDUCERANDE ÅTGÄRDER/);
    assert.match(bolag, /Fortnox/);
    assert.match(bolag, /kundkännedomsåtgärder/);
    assert.doesNotMatch(bolag, /BRANSCH — ÄMNESSCOPE/);

    const bransch = formatOvrigSubjectScopeRules('Kunder i högriskbransch: Smycken');
    assert.match(bransch, /BRANSCH — ÄMNESSCOPE/);
    assert.doesNotMatch(bransch, /BOLAGSFORM — RISKREDUCERANDE/);

    assert.equal(formatOvrigSubjectScopeRules('Kunder i utsatta områden'), '');

    assert.equal(
      resolveOvrigAtgardAiRules('Kunder med bolagsform Aktiebolag', 'DEFAULT'),
      BOLAGSFORM_ATGARD_AI_RULES
    );
    assert.equal(resolveOvrigAtgardAiRules('Annan faktor', 'DEFAULT'), 'DEFAULT');
    assert.equal(
      resolveOvrigExtraUnderlagAiRules('Kunder med bolagsform Aktiebolag'),
      BOLAGSFORM_EXTRA_UNDERLAG_AI_RULES
    );
    assert.equal(resolveOvrigExtraUnderlagAiRules('Smycken'), OVRIG_EXTRA_UNDERLAG_AI_RULES);

    const hint = ovrigAtgardSchemaHint('Kunder med bolagsform Aktiebolag');
    assert.match(hint, /övergripande/);
    assert.match(hint, /Fortnox/);
    assert.match(hint, /BankID/);
    assert.doesNotMatch(hint, /VAD kontrolleras, VEM, NÄR/);
  });

  it('endpointen kopplar in bolagsform-scope och byter bort AtgardKonkret för bolagsform', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const chunk = index.slice(index.indexOf("app.post('/api/ai-ovriga-riskfaktor'"));
    assert.match(chunk, /formatOvrigSubjectScopeRules\(riskfaktor\)/);
    assert.match(chunk, /resolveOvrigAtgardAiRules\(riskfaktor,\s*AtgardKonkret\.AI_RULES\)/);
    assert.match(chunk, /resolveOvrigExtraUnderlagAiRules\(riskfaktor\)/);
    assert.match(chunk, /ovrigAtgardSchemaHint\(riskfaktor\)/);
    assert.match(chunk, /isBolagsformRiskfaktorNamn\(riskfaktor\)/);
    assert.match(chunk, /\$\{subjectScopeRules\}/);
    assert.match(chunk, /\$\{atgardAiRules\}/);
    assert.match(chunk, /\$\{extraUnderlagAiRules\}/);
    assert.match(chunk, /\$\{atgardSchemaHint\}/);
    assert.match(chunk, /cacheScopeSuffix/);
    assert.match(chunk, /cf-ovrig-riskfaktor-gen\$\{cacheScopeSuffix\}/);
    const sysStart = chunk.indexOf('const systemPrompt');
    const userStart = chunk.indexOf('const userPrompt');
    const sysPart = chunk.slice(sysStart, userStart);
    assert.doesNotMatch(sysPart, /\$\{AtgardKonkret\.AI_RULES\}/);
    assert.doesNotMatch(sysPart, /\$\{OVRIG_EXTRA_UNDERLAG_AI_RULES\}/);
  });

  it('ämnesblocket märker bolagsform-analys utan bransch', () => {
    const block = formatOvrigRiskfaktorSubjectBlock(
      'Kunder med bolagsform Aktiebolag',
      'Riskfaktorer kopplat till kund'
    );
    assert.match(block, /BOLAGSFORM-analys/);
    assert.match(block, /ökad\/minskad AML-risk/);
    assert.match(block, /Blanda inte in bransch/);
  });

});
