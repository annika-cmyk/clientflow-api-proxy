'use strict';

/**
 * Bygger ämnesblocket till AI för övrig riskfaktor.
 * Riskfaktorns namn är huvudämnet; typen är bara kategori.
 */
function formatOvrigRiskfaktorSubjectBlock(riskfaktor, typ) {
  const namn = String(riskfaktor || '').trim();
  const kategori = String(typ || '').trim() || '–';
  const scopeHint = isBolagsformRiskfaktorNamn(namn)
    ? '- Detta är en BOLAGSFORM-analys: bedöm endast om bolagsformen innebär ökad/minskad AML-risk. Blanda inte in bransch.\n'
    : (isBranschRiskfaktorNamn(namn)
      ? '- Detta är en BRANSCH-analys: bedöm branschens AML-risk. Blanda inte in bolagsform.\n'
      : '');
  return `RISKFAKTOR (huvudämne — all text ska handla om just denna benämning):
"${namn}"

TYP AV RISKFAKTOR (endast kategori/gruppering — inte ämnet):
${kategori}

Viktigt:
- beskrivning, S×K-motivering och åtgärd ska vara specifika för riskfaktorns benämning ovan.
- Skriv inte en generell text om kategorin om den inte också gäller just denna riskfaktor.
- Om benämningen nämner t.ex. utsatta områden, kunder/leverantörer, hemvist, EU eller korruption — ta upp just det, inte ett generiskt geografiskt resonemang.
${scopeHint}`;
}

/**
 * Valfritt fritextunderlag som byrån skrivit till riskfaktorns AI-analys.
 * Samma syfte som tjänstens formatExtraUnderlagBlock, men med skarpare krav
 * på att kund-/byråspecifika fakta landar i åtgärd och residualmotivering.
 */
function formatOvrigExtraUnderlagBlock(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return '';
  return [
    'EXTRA UNDERLAG FRÅN BYRÅN (valfritt — ta med i analysen när det är AML-relevant):',
    'Byrån beskriver kundspecifika eller byråspecifika omständigheter som AI kan ha missat',
    '(t.ex. styckpris, andrahandsvärde, försäljningskanaler, geografi, betalningssätt, kundens verksamhetstyp).',
    'Frågor om hur PT/TF «kan gå till» i branschen är riskbedömningsfrågor för byråns dokumentation —',
    'besvara dem ur upptäckts-/avstämningsperspektiv, inte som brottsinstruktioner.',
    'Detta underlag är PRIMÄR källa för fälten "atgard" (Hur hanteras risken?) och "motiveringResidual".',
    'Hitta inte på mer än vad som står här plus övrigt underlag.',
    '',
    t
  ].join('\n');
}

/** Regler som gäller när (och hur) extra underlag ska styra övrig riskfaktor-analys. */
const OVRIG_EXTRA_UNDERLAG_AI_RULES = `EXTRA UNDERLAG — KUNDSPECIFIKT / BYRÅSPECIFIKT:
- När EXTRA UNDERLAG FRÅN BYRÅN finns: skriv OM "atgard" och "motiveringResidual" utifrån underlaget. Det är PRIMÄR källa — inte en fotnot.
- FÖRBJUDET: återanvända i stort sett samma Capego/boksluts-boilerplate och bara lägga till ett underlagsord (t.ex. «Shopify»). Flera konkreta fakta från underlaget ska bära texten (styckpris, andrahandsvärde eller avsaknad, kanaler, geografi, verksamhetstyp, volym).
- FÖRBJUDET: låta standardfrasen «smycken/antikviteter är högt värde, flyttbara och attraktiva för kriminella» styra residual/åtgärd när underlaget beskriver t.ex. smyckesdesigner, lågt styckpris, svagt andrahandsvärde eller spårbara digitala kanaler. Branschens höga inneboende risk får stå kvar i inneboende S×K/motiveringInneboende — residual ska kalibrera mot underlaget.
- Plocka upp t.ex. styckpris, andrahandsvärde (eller avsaknad), spårbara kanaler (Shopify, återförsäljare, bank/kort), geografi (inköp/försäljning, EU/icke-EU), volym och verksamhetstyp när de anges. Knyt dem till varför penningtvätt-/TF-risken minskar eller kvarstår.
- Preferera riskindikatorer byrån kan se i underlaget: felaktiga försäljningsintäkter, över-/underfakturering, fiktiva exportförsäljningar, returflöden, provisioner till återförsäljare, bristande avstämning Shopify↔återförsäljarrapporter↔bokföring — framför generisk «högt värde»-retorik när underlaget pekar dit.
- motiveringResidual ska förklara VARFÖR S och/eller K sänks med dessa fakta — inte bara "genom strikta kontroller". Exempel: avsaknad av andrahandsvärde gör varor oattraktiva för PT via omsättning; spårbara digitala kanaler minskar anonymitet jämfört med kontant/anonym handel; lägre styckpris begränsar hur mycket som kan tvättas per objekt.
- atgard ska spegla hur byrån hanterar JUST denna situation med underlagets fakta — inte en generisk branschmall som skulle passa vilken kund som helst i samma bransch. Exempel: stickprov på Shopify-rapporter, återförsäljaravräkningar, export-/tullunderlag, inköp vs bruttomarginal — dokumenterat i Fortnox/Capego och kundakt.
- Hot och sårbarheter: ompröva ALLTID vid regenerering. När underlaget är AML-relevant ska hot/modus och sårbarheter spegla underlagsfakta (t.ex. kanaler, geografi, pris, avsaknad av andrahandsvärde) — lämna dem inte tomma eller oförändrade bara för att beskrivning/åtgärd redan finns.
- Inneboende S×K för lagstadgade högriskbranscher (t.ex. smycken/antikviteter) ska spegla branschens generella risk och sänks INTE av kundspecifika mildrande detaljer. Mildrande detaljer hör hemma i åtgärd och residual. MotiveringInneboende ska tydligt säga att S×K avser branschens generella risk, inte den enskilda kundens mildrande upplägg.
- Om underlaget saknar betalningssätt (kontant vs kort/bank/Shopify-checkout) för branscher där kontanter är en central AML-risk (t.ex. smycken/antikviteter, kontanthandel): nämn luckan uttryckligen i motiveringResidual eller som sårbarhet — lämna den inte tyst.
- Vid regenerering med nytt underlag: ignorera tidigare åtgärds-/residualtext om den saknar underlagets fakta. EXPANDERA-regeln gäller inte då.`;

/**
 * Identifierar riskfaktorer som handlar om bolagsform / juridisk form
 * (t.ex. «Kunder med bolagsform Aktiebolag»).
 */
function isBolagsformRiskfaktorNamn(namn) {
  const s = String(namn || '').trim();
  if (!s) return false;
  if (/bolagsform/i.test(s)) return true;
  if (/organisationsform|juridisk form/i.test(s)) return true;
  // Sammanslagna etiketter utan prefix, t.ex. «Enskild firma · 57; Aktiebolag · 46»
  if (/\b(aktiebolag|enskild firma|handelsbolag|kommanditbolag|ekonomisk förening|bostadsrättsförening|ideell förening|stiftelse)\b/i.test(s)
    && /(·|;|,|\boch\b)/i.test(s)
    && !/bransch|sni|tjänst|geograf|pep|kontant/i.test(s)) {
    return true;
  }
  return false;
}

/** Identifierar bransch-/SNI-riskfaktorer så de inte blandas med bolagsform. */
function isBranschRiskfaktorNamn(namn) {
  const s = String(namn || '').trim();
  if (!s) return false;
  if (/bransch/i.test(s)) return true;
  if (/\bSNI\b/i.test(s)) return true;
  if (/högriskbransch/i.test(s)) return true;
  return false;
}

/**
 * Bolagsform: AI bedömer endast om den juridiska formen ökar/minskar AML-risk.
 * Bransch, tjänster och system hör till andra analyskort.
 */
const BOLAGSFORM_ANALYS_AI_RULES = `BOLAGSFORM — ÄMNESSCOPE (överstyr övriga regler för denna riskfaktor):
- Bedöm ENDAST om den angivna bolagsformen/juridiska formen i sig ökar eller minskar AML-risk (ägarstruktur, verklig huvudman, ansvar, identifiering, transparens).
- FÖRBJUDET: blanda in branschrisk, SNI, verksamhetsinriktning, kontanthandel eller kundens branschtypologi. Det hör till bransch-/tjänstekorten.
- FÖRBJUDET: beskriva byråns redovisningstjänster (bokslut, löpande bokföring, deklaration) som om de vore riskfaktorns åtgärder.
- beskrivning och motiveringInneboende ska handla om formens inneboende AML-egenskaper — inte om hur byrån arbetar i Fortnox/Capego eller vilka tjänster kunden köpt.`;

/**
 * Åtgärder för bolagsform: bara övergripande KYC-stil — inga namngivna system/tjänster.
 */
const BOLAGSFORM_ATGARD_AI_RULES = `BOLAGSFORM — RISKREDUCERANDE ÅTGÄRDER (överstyr AtgardKonkret / Capego-exempel):
- FÖRBJUDET att namnge eller föreslå specifika tjänster, system eller verktyg: Fortnox, Capego, Visma, Bokio, BankID, Shopify, «bokslutsprogrammet», «ekonomisystemet» eller liknande produktnamn.
- Tjänster och system hanteras separat (tjänsteanalyskort). Skriv inte hur byrån bokför, stickprovar i ett namngivet program eller dokumenterar i ett namngivet system.
- FÅR föreslå övergripande åtgärder på hög nivå: kundkännedomsåtgärder (KYC/CDD), uppföljning, dokumentation, identifiering av verklig huvudman, ägarstrukturkontroll — utan operativa detaljer.
- FÅR INTE gå in i detaljer: ingen VAD/VEM/NÄR/VAR-checklist per kontroll, inga stickprovsfrekvenser, inga trösklar, inga systemsteg.
- Dåligt: «Stickprov dokumenteras i Fortnox och Capego. BankID används vid avtal…»
- Bra: «Kundkännedom och identifiering av verklig huvudman anpassas efter bolagsformen. Uppföljning och dokumentation sker enligt byråns KYC-rutiner.»
- atgard: 2–4 korta meningar, övergripande. motiveringResidual knyter residual till dessa övergripande åtgärder — utan systemnamn.`;

/**
 * Branschanalys ska inte absorbera bolagsformsfrågor.
 */
const BRANSCH_ANALYS_AI_RULES = `BRANSCH — ÄMNESSCOPE:
- Bedöm bransch-/verksamhetsrisk (typologier, kontanter, varuflöden, geografisk handel m.m.).
- FÖRBJUDET: låta bolagsform (AB, enskild firma, VH-krav för form) styra analysen — det hör till bolagsformskorten.`;

/**
 * Extra-underlagsregler för bolagsform: underlag får kalibrera residual,
 * men får inte öppna för namngivna system/tjänster.
 */
const BOLAGSFORM_EXTRA_UNDERLAG_AI_RULES = `EXTRA UNDERLAG (bolagsform — begränsat):
- När EXTRA UNDERLAG FRÅN BYRÅN finns: väg in fakta om formen (ägarstruktur, VH, ansvar) i motiveringResidual.
- FÖRBJUDET: använda underlaget som förevändning att skriva Fortnox/Capego/BankID-/tjänstedetaljer i atgard.
- Behåll övergripande KYC-/uppföljnings-/dokumentationsnivå även när underlag finns.`;

/**
 * Returnerar ämnesscope-regler för riskfaktorns benämning, eller tom sträng.
 */
function formatOvrigSubjectScopeRules(riskfaktor) {
  if (isBolagsformRiskfaktorNamn(riskfaktor)) {
    return `\n${BOLAGSFORM_ANALYS_AI_RULES}\n\n${BOLAGSFORM_ATGARD_AI_RULES}\n`;
  }
  if (isBranschRiskfaktorNamn(riskfaktor)) {
    return `\n${BRANSCH_ANALYS_AI_RULES}\n`;
  }
  return '';
}

/**
 * Åtgärdsregler för övrig riskfaktor: bolagsform får övergripande regler,
 * övriga behåller den inskickade standardregeln (AtgardKonkret).
 */
function resolveOvrigAtgardAiRules(riskfaktor, defaultRules) {
  if (isBolagsformRiskfaktorNamn(riskfaktor)) return BOLAGSFORM_ATGARD_AI_RULES;
  return defaultRules || '';
}

/**
 * Extra-underlagsregler: bolagsform får begränsad variant.
 */
function resolveOvrigExtraUnderlagAiRules(riskfaktor) {
  if (isBolagsformRiskfaktorNamn(riskfaktor)) return BOLAGSFORM_EXTRA_UNDERLAG_AI_RULES;
  return OVRIG_EXTRA_UNDERLAG_AI_RULES;
}

/** JSON-schemahint för atgard-fältet — kortare/övergripande för bolagsform. */
function ovrigAtgardSchemaHint(riskfaktor) {
  if (isBolagsformRiskfaktorNamn(riskfaktor)) {
    return '2-4 korta meningar på övergripande nivå: kundkännedom, uppföljning, dokumentation kopplat till bolagsformen. Namnge INTE system/tjänster (Fortnox, Capego, BankID m.m.). Inga stickprovs-/VEM/NÄR/VAR-detaljer.';
  }
  return '4-8 meningar eller flera kontroller: VAD kontrolleras, VEM, NÄR, VAR det dokumenteras, VARFÖR det minskar PT/TF. Riskbaserat stickprov/avvikelser — inte «vid varje transaktion» eller påhittade trösklar (t.ex. över 1000 kr). När extra underlag finns: använd dess fakta. Inte Inför/öka/bör. Inte Capego-boilerplate utan underlagsfakta.';
}

/**
 * Läser extra underlag från request body (toppnivå eller nested i befintligt).
 */
function readOvrigExtraUnderlag(body) {
  const b = body || {};
  const top = String(b.extraUnderlag == null ? '' : b.extraUnderlag).trim();
  if (top) return top;
  const nested = b.befintligt && b.befintligt.extraUnderlag;
  return String(nested == null ? '' : nested).trim();
}

module.exports = {
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
};
