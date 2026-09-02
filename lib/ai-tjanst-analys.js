'use strict';

const ByraProfilFields = require('./byra-profil-fields');
const TjanstUtforandeMallar = require('../public/js/tjanst-utforande-mallar');

const EVIDENS = {
  bekraftad: 'bekraftad',
  tjanstetypisk: 'tjanstetypisk',
  saknas: 'saknas'
};

const EVIDENS_LABEL = {
  bekraftad: 'Bekräftad byråspecifik faktor',
  tjanstetypisk: 'Tjänstetypisk risk',
  saknas: 'Saknad information'
};

const TJANST_ANALYS_AI_RULES = `BYRÅSPECIFIK TJÄNSTEANALYS:
Du ska göra en AML-analys av en specifik tjänst som en redovisningsbyrå erbjuder.
Analysen ska vara byråspecifik och baseras på den information som lämnas om tjänsten, byråns arbetssätt, kundbas, riskindikatorer, distributionskanaler, geografiska kopplingar, bemanning och befintliga kontroller.

Du ska analysera:
- hur tjänsten kan utnyttjas för penningtvätt eller finansiering av terrorism
- vilka hot och modus som är relevanta
- vilka sårbarheter som finns hos byrån
- vilka faktorer som höjer eller sänker risken
- inneboende risk
- riskreducerande åtgärder
- residualrisk
- motivering till risknivåerna

Skilj tydligt mellan:
- bekräftade byråspecifika uppgifter
- generella/tjänstetypiska risker
- saknad information

Du får inte hitta på fakta om byrån. Om information saknas ska du ange detta och vid behov föreslå kompletterande frågor eller åtgärder.
Om uppgiften finns i underlaget: använd den.
Om uppgiften saknas: skriv "uppgift saknas".
Om något är en möjlig risk men inte bekräftad: markera den som möjlig sårbarhet / bör verifieras.
Om något är bekräftat: skriv det som faktisk byråspecifik sårbarhet.

Märk varje sårbarhet med evidens:
- "bekraftad" = bygger på en konkret uppgift i underlaget (t.ex. antal anställda, kundantal, ifyllda utförandefrågor)
- "tjanstetypisk" = generell risk för tjänstetypen, inte bekräftad hos just denna byrå
- "saknas" = slutsatsen hänger på information som saknas

Märk varje åtgärd med status:
- "befintlig" = byrån har redan uppgett att kontrollen/rutinen finns
- "foreslagen" = rekommendation som inte är bekräftad som införd

Analysen ska kunna användas som underlag till byråns allmänna riskbedömning.
Skriv inte en generell riskbedömning av tjänstetypen. Analysera hur just denna byrås sätt att tillhandahålla tjänsten kan utnyttjas.`;

function isBlank(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.filter(Boolean).length === 0;
  return String(v).trim() === '' || /^välj(\.\.\.|…)?$/i.test(String(v).trim());
}

function knownByraFacts(profil) {
  const p = profil || {};
  const known = [];
  const missing = [];
  const keys = [
    'antalAnstallda', 'antalKunder', 'vanligasteBolagsformer', 'branscherKundstock',
    'andelInternationellHandel', 'andelKontantintensiva', 'leveranssatt', 'geografiskMarknad',
    'komplexaAgarstrukturer', 'utlandskaAgare', 'pepKunder', 'sanktionslander',
    'lopandeUtbildning', 'auktoriseradeKonsulter', 'personalomsattning',
    'bokforingssystem', 'bokslutssystem', 'kundhanteringssystem',
    'betalningsuppdrag', 'outsourcingUnderleverantorer'
  ];
  const byKey = new Map((ByraProfilFields.BYRA_PROFIL_FIELDS || []).map((f) => [f.key, f]));
  keys.forEach((key) => {
    const def = byKey.get(key);
    const label = def ? def.label : key;
    if (isBlank(p[key])) missing.push(label);
    else known.push({ key: key, label: label, value: Array.isArray(p[key]) ? p[key].join(', ') : String(p[key]) });
  });
  return { known: known, missing: missing };
}

function formatByraFactsBlock(profil) {
  const { known, missing } = knownByraFacts(profil);
  const lines = ['BEKRÄFTADE BYRÅUPPGIFTER (använd som fakta, hitta inte på mer):'];
  if (!known.length) lines.push('- Inga byråuppgifter är ifyllda.');
  known.forEach((row) => lines.push(`- ${row.label}: ${row.value}`));
  lines.push('');
  lines.push('SAKNADE BYRÅUPPGIFTER (skriv "uppgift saknas", spekulera inte):');
  if (!missing.length) lines.push('- Inga av de prioriterade fälten saknas.');
  missing.forEach((label) => lines.push(`- ${label}`));
  return lines.join('\n');
}

function formatUtforandeBlock(namn, state) {
  const hit = TjanstUtforandeMallar.findEntryForNamn(state, namn);
  const template = hit
    ? (TjanstUtforandeMallar.templateById(hit.mallId) || TjanstUtforandeMallar.resolveTemplate(namn))
    : TjanstUtforandeMallar.resolveTemplate(namn);
  if (!template && !hit) {
    return 'HUR TJÄNSTEN UTFÖRS:\n- uppgift saknas (byrån har inte fyllt i utförandefrågor för denna tjänst).';
  }
  const entry = hit ? hit.entry : TjanstUtforandeMallar.emptyEntry(template.id);
  const formatted = TjanstUtforandeMallar.formatAnswersForAi(template, entry);
  const lines = [
    'HUR TJÄNSTEN UTFÖRS HOS JUST DENNA BYRÅ:',
    `Mall: ${template.name}${template.aiQuestionSupport === false ? ' (egen tjänst, endast basfrågor)' : ''}.`,
    `Tjänsten är markerad som: ${entry.aktiv ? 'aktiv' : 'inaktiv / ej bekräftad i katalogen'}.`
  ];
  if (!formatted.rows.length) {
    lines.push('- Inga utförandefrågor är besvarade. Behandla arbetssättet som "uppgift saknas".');
  }
  formatted.rows.forEach((row) => {
    lines.push(`- ${row.label}: ${row.svar}${row.kommentar ? ` (kommentar: ${row.kommentar})` : ''}`);
  });
  if (formatted.unanswered.length) {
    lines.push('');
    lines.push('OBESVARADE UTFÖRANDEFRÅGOR:');
    formatted.unanswered.forEach((label) => lines.push(`- ${label}`));
  }
  return lines.join('\n');
}

function formatExponeringBlock(exponering) {
  if (!exponering || typeof exponering !== 'object') {
    return 'KUNDEXPONERING FÖR TJÄNSTEN:\n- uppgift saknas (kunddata kunde inte hämtas).';
  }
  const fmt = (v) => (v == null ? 'uppgift saknas' : String(v));
  const lines = [
    'KUNDEXPONERING FÖR JUST DENNA TJÄNST (systemhämtad, bekräftad om tal anges):',
    `- Antal kunder med tjänsten: ${fmt(exponering.antal_kunder)}`,
    `- Riskklass hög/oacceptabel: ${fmt(exponering.riskklass_hog)}`,
    `- Riskklass förhöjd: ${fmt(exponering.riskklass_forhojd)}`,
    `- Riskklass normal: ${fmt(exponering.riskklass_normal)}`,
    `- Riskklass låg: ${fmt(exponering.riskklass_lag)}`,
    `- Riskklass saknas: ${fmt(exponering.riskklass_saknas)}`,
    `- Kontanthantering: ${fmt(exponering.kontanthantering)}`,
    `- Internationella transaktioner: ${fmt(exponering.internationella_transaktioner)}`,
    `- Högriskbranscher: ${fmt(exponering.hogrisksbranscher)}`,
    `- PEP eller PEP-anhörig: ${fmt(exponering.pep)}`,
    `- Koppling till högriskland: ${fmt(exponering.hogrisksland)}`,
    `- Komplex ägarstruktur: ${fmt(exponering.komplex_agarstruktur)}`,
    `- KYC-underlag finns: ${fmt(exponering.kyc_finns)}`
  ];
  if (Array.isArray(exponering.saknade) && exponering.saknade.length) {
    lines.push('Saknade exponeringsuppgifter:');
    exponering.saknade.forEach((s) => lines.push(`- ${s}`));
  }
  return lines.join('\n');
}

function normalizeEvidens(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === EVIDENS.bekraftad || t === 'bekräftad' || t === 'bekraftad byraspecifik' || t === 'a') {
    return EVIDENS.bekraftad;
  }
  if (t === EVIDENS.tjanstetypisk || t === 'generell' || t === 'typisk' || t === 'b') {
    return EVIDENS.tjanstetypisk;
  }
  if (t === EVIDENS.saknas || t === 'saknad' || t === 'uppgift saknas' || t === 'c') {
    return EVIDENS.saknas;
  }
  return EVIDENS.tjanstetypisk;
}

function normalizeAtgardStatus(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'befintlig' || t === 'finns' || t === 'nuvarande') return 'befintlig';
  return 'foreslagen';
}

function evidensLabel(value) {
  return EVIDENS_LABEL[normalizeEvidens(value)] || EVIDENS_LABEL.tjanstetypisk;
}

const TJANST_BESKRIVNING_AI_RULES = `TJÄNSTEBESKRIVNING — vad tjänsten innebär hos just denna byrå:
- Fältet "beskrivning" ska kort beskriva vad tjänsten innebär för byrån, med bekräftade fakta från underlaget (t.ex. antal kunder, hur underlag tas emot, om byrån även sköter löpande bokföring).
- Du FÅR nämna byrån när uppgiften är bekräftad: "Byrån erbjuder tjänsten Bokslut till 37 kunder."
- Hitta INTE på bemanning, kapacitet, kontor eller kontroller som inte finns i underlaget.
- Ta ALDRIG med byråns kontroller, rutiner eller åtgärder i beskrivningen. De hör i atgarder.
- Förbjudna fraser i beskrivningen: "byrån säkerställer", "vi kontrollerar", "byrån har rutiner för", "vi granskar", "vi följer upp", "byrån tillämpar".
- Om kundantal eller utförande saknas: skriv det, spekulera inte.
- Motivering av sannolikhet och konsekvens hör i motiveringInneboende, inte i beskrivningen.`;

module.exports = {
  EVIDENS,
  EVIDENS_LABEL,
  TJANST_ANALYS_AI_RULES,
  TJANST_BESKRIVNING_AI_RULES,
  isBlank,
  knownByraFacts,
  formatByraFactsBlock,
  formatUtforandeBlock,
  formatExponeringBlock,
  normalizeEvidens,
  normalizeAtgardStatus,
  evidensLabel
};
