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
- När EXTRA UNDERLAG FRÅN BYRÅN finns: använd konkreta fakta därifrån i "atgard" och "motiveringResidual". Boilerplate som bara säger dokumentation i Capego/bokslutsprogram och att klientansvarig säkerställer underlag — utan att nämna underlagets fakta — är FÖRBJUDET.
- Plocka upp t.ex. styckpris, andrahandsvärde (eller avsaknad), spårbara kanaler (Shopify, återförsäljare, bank/kort), geografi, volym och verksamhetstyp när de anges. Knyt dem till varför penningtvätt-/TF-risken minskar eller kvarstår.
- motiveringResidual ska förklara VARFÖR S och/eller K sänks med dessa fakta — inte bara "genom strikta kontroller". Exempel: avsaknad av andrahandsvärde gör varor oattraktiva för PT via omsättning; spårbara digitala kanaler minskar anonymitet jämfört med kontant/anonym handel.
- atgard ska spegla hur byrån hanterar JUST denna situation med underlagets fakta — inte en generisk branschmall som skulle passa vilken kund som helst i samma bransch.
- Inneboende S×K för lagstadgade högriskbranscher (t.ex. smycken/antikviteter) ska spegla branschens generella risk och sänks INTE av kundspecifika mildrande detaljer. Mildrande detaljer hör hemma i åtgärd och residual.
- Om underlaget saknar betalningssätt (kontant vs kort/bank/Shopify-checkout) för branscher där kontanter är en central AML-risk (t.ex. smycken/antikviteter, kontanthandel): nämn luckan uttryckligen i motiveringResidual eller som sårbarhet — lämna den inte tyst.`;

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
