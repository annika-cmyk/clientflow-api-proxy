'use strict';

const arKartlaggning = require('./ar-kartlaggning');

const RUTIN_FIELD_KEYS = {
  'syfte-policy': { label: '1. Syfte och omfattning policy', airtable: '1. Syfte och omfattning policy' },
  'centralt-funktionsansvarig': { label: '2. Centralt funktionsansvarig', airtable: '2. Centralt Funktionsansvarig ' },
  kundkannedom: { label: '3. Kundkännedomsåtgärder', airtable: '3. Kundkännedomsåtgärder ' },
  overvakning: { label: '4. Övervakning och rapportering', airtable: '4. Övervakning och Rapportering ' },
  'intern-kontroll': { label: '5. Intern kontroll', airtable: '5. Intern Kontroll ' },
  'anstallda-utbildning': { label: '6. Anställda och utbildning', airtable: '6. Anställda och Utbildning' },
  arkiv: { label: '7. Arkivering av dokumentation', airtable: '7. Arkivering av dokumentation' },
  'uppdatering-utvardering': { label: '8. Uppdatering och utvärdering', airtable: '8. Uppdatering och Utvärdering ' },
  kommunikation: { label: '9. Kommunikation', airtable: '9. Kommunikation' },
  registrering: { label: '10. Registrering byrån', airtable: '10. Registrering Byrån ' }
};

const FIELD_ID_TO_RUTIN_KEY = {
  'fld-syfte-policy': 'syfte-policy',
  'fld-centralt-funktionsansvarig': 'centralt-funktionsansvarig',
  'fld-kundkannedom': 'kundkannedom',
  'fld-overvakning': 'overvakning',
  'fld-intern-kontroll': 'intern-kontroll',
  'fld-anstallda-utbildning': 'anstallda-utbildning',
  'fld-arkiv': 'arkiv',
  'fld-uppdatering-utvardering': 'uppdatering-utvardering',
  'fld-kommunikation': 'kommunikation',
  'fld-registrering': 'registrering'
};

const QUESTIONS = {
  ar_beskrivning: [
    { id: 'ovriga_tjanster', text: 'Bedriver byrån andra tjänster utöver redovisning/bokföring (t.ex. rådgivning, bolagsbildning, lönehantering)?', hint: 'Beskriv kort vilka och ungefärlig andel.' },
    { id: 'kundprofil', text: 'Finns det kundtyper eller branscher ni medvetet prioriterar eller undviker?', hint: 'T.ex. endast svenska SME, inga utländska holdingbolag.' },
    { id: 'organisation', text: 'Hur är byrån organiserad (enmansbyrå, flera medarbetare, externa konsulter)?', hint: 'Antal personer och hur AML-arbetet fördelas.' }
  ],
  ar_vardering: [
    { id: 'topp_risker', text: 'Vilka risker bedömer ni som mest påtagliga just nu?', hint: 'T.ex. distanskunder, högriskbranscher, kapacitetsbrist.' },
    { id: 'forandringar', text: 'Har ni nyligen förändrat tjänsteutbud, kundbas eller arbetssätt?', hint: 'Ny tjänst, fler internationella kunder, ny medarbetare.' },
    { id: 'riskniva', text: 'Vilken sammantagen risknivå anser ni är rimlig för byrån?', hint: 'Låg, Normal, Förhöjd, Hög eller Oacceptabel – med kort motivering.' }
  ],
  'ar_kartlaggning:kunder': [
    { id: 'internationella', text: 'Har ni kunder med internationell koppling som inte framgår tydligt av statistiken?', hint: 'Utländska ägare, handel med tredjeland, utländska filialer.' },
    { id: 'komplexa', text: 'Finns komplexa kundstrukturer (koncerner, stiftelser, flera lager)?', hint: 'Ungefärligt antal eller exempel.' },
    { id: 'avvikande', text: 'Finns enskilda kunder som sticker ut riskmässigt?', hint: 'Mycket hög omsättning, PEP, tidigare avvikelser.' }
  ],
  'ar_kartlaggning:distribution': [
    { id: 'distans', text: 'Erbjuder ni tjänster på distans eller utan fysisk träff?', hint: 'Andel distanskunder eller helt digital onboarding.' },
    { id: 'externa', text: 'Använder ni externa leverantörer för KYC, screening eller betalningsflöden?', hint: 'Vilka delar och hur övervakar ni dem?' },
    { id: 'kontroll', text: 'Finns tjänster där ni har begränsad insyn i kundens faktiska användning?', hint: 'T.ex. generella rådgivningstjänster.' }
  ],
  'ar_kartlaggning:geografi': [
    { id: 'hogrisktredjeland', text: 'Har ni kunder med koppling till högrisktredjeland enligt EU?', hint: 'Land och ungefärligt antal.' },
    { id: 'bankid', text: 'Hur hanterar ni kunder utan svenskt BankID?', hint: 'Vidimerade kopior, videoidentifiering, etc.' },
    { id: 'lokalt', text: 'Är kunderna huvudsakligen lokala eller spridda geografiskt i Sverige?', hint: 'T.ex. en region vs hela landet.' }
  ],
  'ar_kartlaggning:verksamhet': [
    { id: 'storlek', text: 'Hur många anställda/medarbetare har byrån och hur fördelas kundansvaret?', hint: 'Enmansbyrå, 2–5 personer, etc.' },
    { id: 'kapacitet', text: 'Finns kapacitetsbegränsningar som påverkar er AML-överblick?', hint: 'Hög arbetsbelastning, inget bollplank, många kunder per person.' },
    { id: 'styrkor', text: 'Vilka styrkor har byrån i AML-arbetet?', hint: 'Kort beslutsväg, lång branscherfarenhet, dedikerad CF.' }
  ],
  'rutin:syfte-policy': [
    { id: 'omfattning', text: 'Vilka verksamhetsgrenar och tjänster ska policyn omfatta?', hint: 'Redovisning, rådgivning, lönehantering, etc.' },
    { id: 'syfte', text: 'Finns särskilda skäl till att ni uppdaterar policyn nu?', hint: 'Ny lagstiftning, ny medarbetare, tillsyn.' }
  ],
  'rutin:centralt-funktionsansvarig': [
    { id: 'cf_namn', text: 'Vem är centralt funktionsansvarig (CF) och vem ersätter vid frånvaro?', hint: 'Namn och backup.' },
    { id: 'cf_uppgifter', text: 'Vilka AML-uppgifter sköter CF i praktiken hos er?', hint: 'Utbildning, rapportering, uppdatering av rutiner.' }
  ],
  'rutin:kundkannedom': [
    { id: 'identifiering', text: 'Hur identifierar ni kunder i praktiken (BankID, pass, distans)?', hint: 'Beskriv er standardprocess.' },
    { id: 'forstarkt', text: 'När tillämpar ni förstärkt kundkännedom?', hint: 'PEP, högrisk, komplex struktur, distans.' },
    { id: 'verklig_huvudman', text: 'Hur kartlägger ni verklig huvudman och behörig företrädare?', hint: 'Bolagsverket, egen dokumentation, årlig kontroll.' }
  ],
  'rutin:overvakning': [
    { id: 'rapportering', text: 'Vem beslutar om och skickar rapporter om misstänkt aktivitet?', hint: 'CF, ledning, extern hjälp.' },
    { id: 'overvakning', text: 'Hur övervakar ni transaktioner och kundbeteende i vardagen?', hint: 'ClientFlow, manuella kontroller, avvikelselistor.' },
    { id: 'register', text: 'För du register över rapportering och avvikande händelser?', hint: 'Var och hur loggas det?' }
  ],
  'rutin:intern-kontroll': [
    { id: 'kontroller', text: 'Vilka interna kontroller genomför ni regelbundet?', hint: 'Stickprov, genomgång av KYC, dubbel signering.' },
    { id: 'revision', text: 'Gör ni intern revision eller extern granskning av AML-arbetet?', hint: 'Frekvens och omfattning.' }
  ],
  'rutin:anstallda-utbildning': [
    { id: 'utbildning', text: 'Hur ofta utbildas personalen i AML och vad omfattar utbildningen?', hint: 'Introduktion, årlig repetition, dokumentation.' },
    { id: 'nya', text: 'Hur introduceras nya medarbetare i rutinerna?', hint: 'Checklista, mentorskap, ClientFlow.' }
  ],
  'rutin:arkiv': [
    { id: 'lagring', text: 'Var och hur länge sparas KYC- och AML-dokumentation?', hint: 'ClientFlow, fysisk pärm, antal år.' },
    { id: 'atkomst', text: 'Vem har åtkomst till arkiverat material?', hint: 'Behörighetsnivåer.' }
  ],
  'rutin:uppdatering-utvardering': [
    { id: 'frekvens', text: 'Hur ofta uppdaterar och utvärderar ni rutiner och riskbedömning?', hint: 'Årligen, vid större förändring, etc.' },
    { id: 'ansvar', text: 'Vem ansvarar för att rutinerna hålls aktuella?', hint: 'CF, ledning.' }
  ],
  'rutin:kommunikation': [
    { id: 'intern', text: 'Hur kommuniceras AML-rutiner internt?', hint: 'Möten, intranät, e-post, ClientFlow.' },
    { id: 'extern', text: 'Informeras kunder om att ni följer penningtvättslagen?', hint: 'Avtal, webb, muntligt.' }
  ],
  'rutin:registrering': [
    { id: 'registrering', text: 'Är byrån registrerad hos Länsstyrelsen för redovisningstjänster?', hint: 'Datum, diarienummer om ni har.' },
    { id: 'andringar', text: 'Finns planerade förändringar i verksamheten som ska rapporteras?', hint: 'Nya tjänster, ny filial.' }
  ]
};

function contextKey(opts) {
  const context = String((opts && opts.context) || '').trim();
  const section = String((opts && opts.section) || '').trim();
  const fieldKey = String((opts && opts.fieldKey) || '').trim();
  if (context === 'ar_kartlaggning' && section) return `ar_kartlaggning:${section}`;
  if (context === 'rutin' && fieldKey) return `rutin:${fieldKey}`;
  return context;
}

function getTitle(opts) {
  const key = contextKey(opts);
  if (key.startsWith('ar_kartlaggning:')) {
    const section = key.split(':')[1];
    return arKartlaggning.SECTION_LABELS[section] || 'Kartläggning';
  }
  if (key.startsWith('rutin:')) {
    const fk = key.split(':')[1];
    return (RUTIN_FIELD_KEYS[fk] && RUTIN_FIELD_KEYS[fk].label) || 'Rutin';
  }
  if (key === 'ar_beskrivning') return '2. Beskrivning av byråns verksamhet';
  if (key === 'ar_vardering') return '8. Värdering av sammantagen risk';
  return 'Textförslag';
}

function getQuestions(opts) {
  const key = contextKey(opts);
  return (QUESTIONS[key] || []).map((q) => ({ ...q, optional: q.optional !== false }));
}

function normalizeClarifications(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const answer = String(item.answer == null ? '' : item.answer).trim();
      if (!answer) return null;
      const question = String(item.question || item.text || item.id || `Fråga ${idx + 1}`).trim();
      return { id: String(item.id || `q${idx}`), question, answer };
    })
    .filter(Boolean);
}

function formatClarificationsBlock(clarifications) {
  const items = normalizeClarifications(clarifications);
  if (!items.length) return '';
  return [
    '',
    'SVAR FRÅN BYRÅN (behandla som auktoritativ källa – skriv inte emot dem, utelämna det som inte besvarats):',
    ...items.map((c) => `- ${c.question}: ${c.answer}`)
  ].join('\n');
}

function buildRutinSystemPrompt(fieldKey) {
  const meta = RUTIN_FIELD_KEYS[fieldKey] || { label: fieldKey };
  return `Du är en AML/KYC-specialist på en svensk redovisningsbyrå. Skriv avsnittet "${meta.label}" i byråns interna rutiner och riktlinjer enligt penningtvättslagen (4 kap. 3 §).

Skriv på svenska, professionellt och konkret så att personalen kan följa rutinen i vardagen. Beskriv vem som gör vad, hur och när. Använd punktlistor där det underlättar.

Hitta aldrig på fakta som inte framgår av underlaget eller användarens svar. Ge endast den färdiga brödtexten utan rubrik eller inledning som "Här är...".`;
}

function buildRutinUserPrompt(fieldKey, ctx) {
  const meta = RUTIN_FIELD_KEYS[fieldKey] || { label: fieldKey };
  const parts = [
    `Skriv avsnittet "${meta.label}" för byråns rutiner och riktlinjer.`,
    '',
    'UNDERLAG FRÅN BYRÅNS ALLMÄNNA RISKBEDÖMNING (kontext):',
    ctx.arSyfte ? `Syfte och omfattning: ${ctx.arSyfte.slice(0, 500)}` : '',
    ctx.arBeskrivning ? `Beskrivning av verksamheten: ${ctx.arBeskrivning.slice(0, 500)}` : '',
    ctx.cfPerson ? `Centralt funktionsansvarig: ${ctx.cfPerson}` : '',
    ''
  ].filter(Boolean);
  if (ctx.befintligText) {
    parts.push('BEFINTLIG TEXT (förfina/uppdatera om relevant):', ctx.befintligText.slice(0, 2000), '');
  }
  if (ctx.byraProfil) {
    parts.push('BYRÅPROFIL:', ctx.byraProfil, '');
  }
  const clarBlock = formatClarificationsBlock(ctx.clarifications);
  if (clarBlock) parts.push(clarBlock.trim());
  return parts.join('\n');
}

module.exports = {
  RUTIN_FIELD_KEYS,
  FIELD_ID_TO_RUTIN_KEY,
  getTitle,
  getQuestions,
  normalizeClarifications,
  formatClarificationsBlock,
  buildRutinSystemPrompt,
  buildRutinUserPrompt,
  contextKey
};
