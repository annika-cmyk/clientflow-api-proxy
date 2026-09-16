'use strict';

/**
 * Bygger ämnesblocket till AI för övrig riskfaktor.
 * Riskfaktorns namn är huvudämnet; typen är bara kategori.
 */
function formatOvrigRiskfaktorSubjectBlock(riskfaktor, typ) {
  const namn = String(riskfaktor || '').trim();
  const kategori = String(typ || '').trim() || '–';
  return `RISKFAKTOR (huvudämne — all text ska handla om just denna benämning):
"${namn}"

TYP AV RISKFAKTOR (endast kategori/gruppering — inte ämnet):
${kategori}

Viktigt:
- beskrivning, S×K-motivering och åtgärd ska vara specifika för riskfaktorns benämning ovan.
- Skriv inte en generell text om kategorin om den inte också gäller just denna riskfaktor.
- Om benämningen nämner t.ex. utsatta områden, kunder/leverantörer, hemvist, EU eller korruption — ta upp just det, inte ett generiskt geografiskt resonemang.`;
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
- Preferera risker som: felaktiga försäljningsintäkter, över-/underfakturering, fiktiva exportförsäljningar, returflöden, provisioner till återförsäljare, bristande avstämning Shopify↔återförsäljarrapporter↔bokföring — framför generisk «högt värde»-retorik när underlaget pekar dit.
- motiveringResidual ska förklara VARFÖR S och/eller K sänks med dessa fakta — inte bara "genom strikta kontroller". Exempel: avsaknad av andrahandsvärde gör varor oattraktiva för PT via omsättning; spårbara digitala kanaler minskar anonymitet jämfört med kontant/anonym handel; lägre styckpris begränsar hur mycket som kan tvättas per objekt.
- atgard ska spegla hur byrån hanterar JUST denna situation med underlagets fakta — inte en generisk branschmall som skulle passa vilken kund som helst i samma bransch. Exempel: stickprov på Shopify-rapporter, återförsäljaravräkningar, export-/tullunderlag, inköp vs bruttomarginal — dokumenterat i Fortnox/Capego och kundakt.
- Hot och sårbarheter: ompröva ALLTID vid regenerering. När underlaget är AML-relevant ska hot/modus och sårbarheter spegla underlagsfakta (t.ex. kanaler, geografi, pris, avsaknad av andrahandsvärde) — lämna dem inte tomma eller oförändrade bara för att beskrivning/åtgärd redan finns.
- Inneboende S×K för lagstadgade högriskbranscher (t.ex. smycken/antikviteter) ska spegla branschens generella risk och sänks INTE av kundspecifika mildrande detaljer. Mildrande detaljer hör hemma i åtgärd och residual. MotiveringInneboende ska tydligt säga att S×K avser branschens generella risk, inte den enskilda kundens mildrande upplägg.
- Om underlaget saknar betalningssätt (kontant vs kort/bank/Shopify-checkout) för branscher där kontanter är en central AML-risk (t.ex. smycken/antikviteter, kontanthandel): nämn luckan uttryckligen i motiveringResidual eller som sårbarhet — lämna den inte tyst.
- Vid regenerering med nytt underlag: ignorera tidigare åtgärds-/residualtext om den saknar underlagets fakta. EXPANDERA-regeln gäller inte då.`;

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
  readOvrigExtraUnderlag,
  OVRIG_EXTRA_UNDERLAG_AI_RULES
};
