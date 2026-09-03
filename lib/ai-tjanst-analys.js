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
Du ska analysera tjänsten ur AML-perspektiv, inte som en allmän kvalitets-, skatte- eller affärsriskanalys.
Analysen ska vara byråspecifik och baseras på den information som lämnas om tjänsten, byråns arbetssätt, kundbas, riskindikatorer, distributionskanaler, geografiska kopplingar, bemanning och befintliga kontroller.

Utgå strikt från byråns svar på utförandefrågorna. Hitta inte på kontroller, rutiner eller faktiska omständigheter som inte framgår.

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
1. Hot/modus = hur tjänsten kan utnyttjas för penningtvätt eller finansiering av terrorism.
2. Sårbarhet = varför byrån kan vara exponerad.
3. Riskreducerande åtgärd = konkret rutin/kontroll som minskar risken.
4. Inneboende risk = risk före byråns kontroller.
5. Residualrisk = risk efter de kontroller som faktiskt finns.
6. Bekräftade byråspecifika uppgifter / generella tjänstetypiska risker / saknad information.

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

AML-FOKUS FÖR HOT OCH KONSEKVENS:
- Fokusera på felaktiga eller falska underlag, osanna fakturor, att transaktioner ges legitimitet, felaktiga utbetalningar eller skattereduktioner, och byrån som legitimerande mellanled.
- Typiska AML-hot för redovisningsbyråer (Länsstyrelsen): kontantbetalda fakturor, osanna fakturor, kapitaltillskott utan underlag, lån, utlandsbetalningar.
- Blanda inte ihop AML-risk med administrativ eller skatterättslig risk. Dåligt: "ekonomiska förluster och rättsliga åtgärder från Skatteverket."

RISKREGLER — exponering, åtgärder och residual:
- Om tjänsten innebär ansökan, rapportering eller inlämning till myndighet ska detta öka tjänstens exponering.
- Om tjänsten innebär hantering av betalningsuppgifter ska detta öka exponeringen.
- Om byrån svarar att rimlighetskontroll normalt inte görs ska detta anges som en kvarstående sårbarhet.
- Åtgärden "kunden får komplettera" är reaktiv och får bara sänka risken begränsat, särskilt om det saknas normal kontroll som upptäcker avvikelser. Utan rimlighetskontroll upptäcks inte oklarheten. Det är inte tillräckligt för låg residualrisk.
- Residualrisk ska normalt inte sättas till låg bara för att någon åtgärd finns.
- Residualrisk ska normalt inte sättas till låg om byrån hanterar ansökan till myndighet eller betalningsuppgifter och samtidigt saknar normal rimlighetskontroll.
- Låg residualrisk kräver minst en tydlig förebyggande kontroll, t.ex. rimlighetskontroll, kontroll av betalning mot faktura, kontroll vid avvikande belopp eller dokumenterad granskningsrutin.
- Motiveringen ska vara kort, konkret och kopplad till byråns egna svar.

TF — penningtvätt, terrorismfinansiering eller båda, i beskrivningen:
- Prioritera konkreta AML-mekanismer: osanna fakturor, felaktiga underlag, överdrivna kostnader, oklara betalningar, felaktiga utbetalningar och legitimering av transaktioner.
- Ange i varje hotbeskrivning om mekanismen avser penningtvätt, terrorismfinansiering eller båda.
- Avfärda inte terrorismfinansiering bara för att tjänsten inte direkt avser en ideell organisation eller utlandsbetalning. Bedrägerier och felaktiga utbetalningar kan vara en finansieringskälla.
- Kräv inte ett separat TF-hot per tjänst. Hitta inte på terrororganisationer eller svepande scenarier utan steg-för-steg-mekanism.
- Dåligt (vagt): "Tjänsten kan användas för att tvätta pengar."
- Dåligt (påhittad terrororg): "Falska ROT/RUT-tjänster kan deklareras för att flytta pengar till organisationer som finansierar terrorism."
- Bra: beskriv kedjan (oriktig uppgift → pengar in/flyttas/legitimeras → byråns roll) och säg om det kan vara PT, TF eller båda.

ROT/RUT-ADMINISTRATION — extra scoring:
- Om byrån endast hanterar enklare uppgifter och inte skickar ansökan: lägre exponering.
- Om byrån hanterar fakturaunderlag, arbetskostnad/materialkostnad eller ansökan till Skatteverket: normal eller förhöjd inneboende risk.
- Om byrån även hanterar betalningsuppgifter: öka sårbarheten.
- Om byrån inte normalt kontrollerar rimlighet: residualrisk kan normalt inte bli låg.
- Önskat residualresonemang när ansökan eller betalningsuppgifter finns utan rimlighetskontroll: "Residualrisken bedöms som normal, inte låg, eftersom byrån hanterar ansökan till Skatteverket och betalningsuppgifter men normalt inte kontrollerar ROT/RUT-underlagets rimlighet. Att kunden får komplettera vid oklarheter minskar risken i vissa fall, men åtgärden är främst reaktiv och förutsätter att avvikelsen först upptäcks."
- Hot/modus för ROT/RUT ska särskilt beakta: oriktiga eller påhittade ansökningar, felaktiga uppgifter om utfört arbete, överdriven arbetskostnad, felaktig uppdelning mellan arbete och material, osanna fakturor, oklara betalningar, felaktiga utbetalningar från Skatteverket, att offentliga medel kan genereras och därefter användas, tas ut eller föras vidare, och att detta kan vara relevant för både penningtvätt och terrorismfinansiering.

FÄLTPLACERING:
- Fältet "Tjänsten" (beskrivning) får bara beskriva tjänstens omfattning och vad byrån gör inom tjänsten.
- Kontroller, rutiner, åtgärder, brister i kontroller och residualrisk hör under Sårbarheter eller Riskreducerande åtgärder — inte i tjänstebeskrivningen.
- Bemanning, allmän byråinformation och geografisk kundspridning hör inte i tjänstebeskrivningen, om spridningen inte är direkt kopplad till tjänstens leverans.
- Byråfakta ska bara användas som bakgrund i riskmotivering om de är relevanta, inte skrivas in i tjänstebeskrivningen.

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
  const lines = [
    'BEKRÄFTADE BYRÅUPPGIFTER (bakgrund till riskmotivering och sårbarheter om relevant — skriv inte in bemanning, residualrisk eller allmän byråfakta i fältet Tjänsten):'
  ];
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

function buildByraExponering(entry, profil) {
  const answers = (entry && entry.answers) || {};
  const uppskattat = answers.antalKunderTjanst;
  return {
    kalla: 'byra',
    antal_kunder: isBlank(uppskattat) ? null : (Number(uppskattat) || String(uppskattat).trim()),
    antal_kunder_byra: isBlank(profil && profil.antalKunder) ? null : profil.antalKunder,
    riskklass_hog: null,
    riskklass_forhojd: null,
    riskklass_normal: null,
    riskklass_lag: null,
    riskklass_saknas: null,
    kontanthantering: null,
    internationella_transaktioner: null,
    hogrisksbranscher: null,
    pep: null,
    hogrisksland: null,
    komplex_agarstruktur: null,
    kyc_finns: null,
    saknade: ['Byrån valde att inte hämta kundstatistik från Clientflow']
  };
}

function formatExponeringBlock(exponering) {
  if (!exponering || typeof exponering !== 'object') {
    return 'KUNDEXPONERING FÖR TJÄNSTEN:\n- uppgift saknas (kunddata kunde inte hämtas).';
  }
  const fmt = (v) => (v == null ? 'uppgift saknas' : String(v));
  if (exponering.kalla === 'byra') {
    return [
      'KUNDEXPONERING FÖR TJÄNSTEN (ej hämtad från Clientflow):',
      `- Byråns totala antal kunder (byråuppgifter): ${fmt(exponering.antal_kunder_byra)}`,
      `- Antal kunder med tjänsten (byråns uppskattning): ${fmt(exponering.antal_kunder)}`,
      '- Kontanter, utlandstransaktioner, PEP och riskklass per kund: uppgift saknas (hämtas bara vid Ja på Hämta statistik från Clientflow).'
    ].join('\n');
  }
  if (exponering.ok === false || exponering.antal_kunder == null) {
    const reason = exponering.fel || (exponering.saknade && exponering.saknade[0]) || 'kunddata kunde inte hämtas';
    return `KUNDEXPONERING FÖR TJÄNSTEN:\n- uppgift saknas (${reason}).`;
  }
  const lines = [
    'KUNDEXPONERING FÖR JUST DENNA TJÄNST (systemhämtad från Clientflow, bekräftad om tal anges):',
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

const ROT_RUT_RESIDUAL_EXEMPEL =
  'Residualrisken bedöms som normal, inte låg, eftersom byrån hanterar ansökan till Skatteverket och betalningsuppgifter men normalt inte kontrollerar ROT/RUT-underlagets rimlighet. Att kunden får komplettera vid oklarheter minskar risken i vissa fall, men åtgärden är främst reaktiv och förutsätter att avvikelsen först upptäcks.';

function foldText(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function asAnswerList(raw) {
  if (Array.isArray(raw)) return raw.map((v) => String(v || '').trim()).filter(Boolean);
  if (raw == null || raw === '') return [];
  return [String(raw).trim()].filter(Boolean);
}

function matchesAny(text, patterns) {
  const folded = foldText(text);
  return patterns.some((p) => folded.includes(foldText(p)));
}

function listMatches(list, patterns) {
  return asAnswerList(list).some((v) => matchesAny(v, patterns));
}

function loadRiskSkala() {
  return require('../public/js/risk-skala');
}

function analyzeUtforandeSignals(namn, state) {
  const hit = TjanstUtforandeMallar.findEntryForNamn(state, namn);
  const template = hit
    ? (TjanstUtforandeMallar.templateById(hit.mallId) || TjanstUtforandeMallar.resolveTemplate(namn))
    : TjanstUtforandeMallar.resolveTemplate(namn);
  const entry = hit ? hit.entry : null;
  const answers = (entry && entry.answers) || {};
  const mallId = (template && template.id) || (hit && hit.mallId) || '';
  const isRotRut = mallId === 'rot-rut' || /\brot\b|\brut\b|rot rut/.test(foldText(namn));

  const rotUppgifter = asAnswerList(answers.rotUppgifter);
  const rotOklar = asAnswerList(answers.rotOklar);
  const rotRimlighet = String(answers.rotRimlighet || '');
  const kontrollInnan = String(answers.kontrollInnanSlut || '');
  const avvikelse = asAnswerList(answers.avvikelseHantering);

  const handlesApplication = listMatches(rotUppgifter, ['ansokan till skatteverket', 'ansökan till skatteverket']);
  const handlesPayment = listMatches(rotUppgifter, ['betalningsuppgifter']);
  const handlesInvoice = listMatches(rotUppgifter, ['fakturaunderlag']);
  const handlesLabor = listMatches(rotUppgifter, ['arbetskostnad', 'materialkostnad']);
  const simpleOnly = isRotRut
    && rotUppgifter.length > 0
    && !handlesApplication
    && !handlesInvoice
    && !handlesLabor
    && !handlesPayment;

  const noReasonableness = matchesAny(rotRimlighet, ['nej, normalt inte', 'nej normalt inte'])
    || matchesAny(kontrollInnan, ['nej, normalt inte', 'nej normalt inte']);
  const normalReasonableness = matchesAny(rotRimlighet, ['ja, normalt', 'ja normalt'])
    || matchesAny(kontrollInnan, ['ja, alltid', 'ja alltid']);
  const preventiveFromHandling = listMatches(rotOklar, [
    'rimlighetsbedomning',
    'rimlighetsbedömning',
    'ansvarig granskar'
  ]) || listMatches(avvikelse, ['ansvarig på byrån granskar', 'ärendet pausas']);
  const hasPreventive = normalReasonableness || preventiveFromHandling;
  const customerSupplement = listMatches(rotOklar, ['kunden får komplettera', 'kunden far komplettera'])
    || listMatches(avvikelse, ['komplettering', 'komplettera']);

  const allValues = Object.keys(answers).reduce((acc, key) => acc.concat(asAnswerList(answers[key])), []);
  const handlesAuthorityGeneric = handlesApplication || listMatches(allValues, [
    'ansokan till',
    'ansökan till'
  ]);
  const handlesPaymentGeneric = handlesPayment || listMatches(allValues, ['betalningsuppgifter']);

  const lines = [];
  let residualFloor = '';
  let inherentFloor = '';

  if (isRotRut) {
    if (simpleOnly) {
      lines.push('- Byrån hanterar endast enklare ROT/RUT-uppgifter och skickar inte ansökan. Lägre exponering.');
    }
    if (handlesInvoice || handlesLabor || handlesApplication) {
      inherentFloor = 'Normal';
      lines.push('- Byrån hanterar fakturaunderlag, arbetskostnad/materialkostnad eller ansökan till Skatteverket. Inneboende risk ska vara minst Normal.');
    }
    if (handlesPayment) {
      lines.push('- Byrån hanterar betalningsuppgifter. Det ökar sårbarheten.');
    }
    if (noReasonableness) {
      lines.push('- Byrån svarar att rimlighetskontroll normalt inte görs. Ange det som kvarstående sårbarhet.');
    }
    if (customerSupplement) {
      lines.push('- «Kunden får komplettera» är reaktiv och får bara sänka residualrisken begränsat, särskilt utan normal kontroll som upptäcker avvikelser.');
    }
    const exposedWithoutCheck = (handlesApplication || handlesPayment || handlesInvoice || handlesLabor)
      && noReasonableness
      && !hasPreventive;
    if (exposedWithoutCheck) {
      residualFloor = 'Normal';
      lines.push('- Residualrisk ska inte sättas till Låg (S×K ≤ 4). Sätt minst Normal. Låg residual kräver minst en tydlig förebyggande kontroll.');
      if (handlesApplication || handlesPayment) {
        lines.push(`- Motivera residual så här: ${ROT_RUT_RESIDUAL_EXEMPEL}`);
      }
    }
    lines.push('- Huvudhot: konkret mekanism kring oriktiga/påhittade ROT-/RUT-ansökningar, felaktiga uppgifter om utfört arbete, överdriven arbetskostnad, felaktig uppdelning arbete/material, osanna fakturor, oklara betalningar och felaktiga utbetalningar från Skatteverket. Offentliga medel kan därefter användas, tas ut eller föras vidare. Kan avse både penningtvätt och terrorismfinansiering — avfärda inte TF bara för att tjänsten inte avser ideell organisation eller utlandsbetalning. Hitta inte på terrororganisationer; beskriv kedjan steg för steg.');
  } else {
    if (handlesAuthorityGeneric) {
      lines.push('- Tjänsten innebär ansökan, rapportering eller inlämning till myndighet. Det ökar exponeringen.');
    }
    if (handlesPaymentGeneric) {
      lines.push('- Byrån hanterar betalningsuppgifter. Det ökar exponeringen.');
    }
    if (noReasonableness) {
      lines.push('- Rimlighetskontroll görs normalt inte. Ange det som kvarstående sårbarhet.');
    }
    if (customerSupplement) {
      lines.push('- «Kunden får komplettera» är reaktiv och får bara sänka residualrisken begränsat.');
    }
    if ((handlesAuthorityGeneric || handlesPaymentGeneric) && noReasonableness && !hasPreventive) {
      residualFloor = 'Normal';
      lines.push('- Residualrisk ska inte sättas till Låg när byrån hanterar myndighetsinlämning eller betalningsuppgifter och saknar normal rimlighetskontroll.');
    }
  }

  return {
    mallId: mallId,
    isRotRut: isRotRut,
    handlesApplication: handlesApplication,
    handlesPayment: handlesPayment || handlesPaymentGeneric,
    handlesInvoice: handlesInvoice,
    handlesLabor: handlesLabor,
    simpleOnly: simpleOnly,
    noReasonableness: noReasonableness,
    hasPreventive: hasPreventive,
    customerSupplement: customerSupplement,
    residualFloor: residualFloor,
    inherentFloor: inherentFloor,
    lines: lines,
    exampleMotivering: residualFloor ? ROT_RUT_RESIDUAL_EXEMPEL : ''
  };
}

function formatRiskreglerBlock(namn, state) {
  const signals = typeof namn === 'object' && namn && namn.lines
    ? namn
    : analyzeUtforandeSignals(namn, state);
  if (!signals.lines.length) return '';
  return ['TJÄNSTENS RISKREGLER (från utförandesvaren — följ dessa när du sätter S×K):']
    .concat(signals.lines)
    .join('\n');
}

function applyRiskFloor(assessment, minLevel) {
  const RiskSkala = loadRiskSkala();
  if (!minLevel || !assessment || !assessment.level) {
    return Object.assign({}, assessment || {}, { floored: false });
  }
  if (RiskSkala.riskRank(assessment.level) >= RiskSkala.riskRank(minLevel)) {
    return Object.assign({}, assessment, { floored: false });
  }
  let s = Number(assessment.sannolikhet) || 2;
  let k = Number(assessment.konsekvens) || 2;
  let next = RiskSkala.assessRisk(s, k);
  while (next.level && RiskSkala.riskRank(next.level) < RiskSkala.riskRank(minLevel) && (s < 5 || k < 5)) {
    if (s <= k && s < 5) s += 1;
    else if (k < 5) k += 1;
    else break;
    next = RiskSkala.assessRisk(s, k);
  }
  return Object.assign({}, next, { floored: true, floorLevel: minLevel });
}

function ensureResidualMotivering(text, signals, floored) {
  const current = String(text || '').trim();
  if (!floored || !signals) return current;
  if (/reaktiv|rimlighet/.test(current)) return current;
  const extra = signals.exampleMotivering || ROT_RUT_RESIDUAL_EXEMPEL;
  return current ? `${current} ${extra}` : extra;
}

const TJANST_BESKRIVNING_AI_RULES = `FÄLTET "TJÄNSTEN" (beskrivning):
I fältet "Tjänsten" får du endast beskriva tjänstens omfattning och vad byrån gör inom tjänsten.

Ta inte med:
- kontroller
- rutiner
- åtgärder
- brister i kontroller
- residualrisk
- bemanning
- allmän byråinformation
- geografisk kundspridning, om det inte är direkt kopplat till tjänstens leverans

Kontroller, rutiner och brister ska placeras under "Sårbarheter" eller "Riskreducerande åtgärder".
Byråfakta ska endast användas som bakgrund i riskmotivering om det är relevant, inte skrivas in i tjänstebeskrivningen.

När du beskriver tjänsten ska du skriva en mer utvecklad men fortfarande konkret beskrivning.

Tjänstebeskrivningen ska normalt innehålla:
1. Vad tjänsten innebär i praktiken.
2. Vilka moment byrån utför inom tjänsten.
3. Vilka kundtyper eller branscher tjänsten typiskt berör, om det framgår av byråns svar eller byråprofil.
4. Om tjänsten innebär kontakt med myndighet, bank eller annan extern part.
5. Om tjänsten är särskilt regelstyrd eller historiskt känslig för fel, bedrägerier, osanna underlag eller ekonomisk brottslighet.
6. Varför tjänsten är relevant ur AML-perspektiv.

Ta inte med:
- byråns kontroller,
- rutiner,
- riskreducerande åtgärder,
- bemanning,
- residualrisk,
- påhittade kundtyper eller branscher.

Om branscher saknas i byråns uppgifter, skriv inte att byrån har sådana kunder. Skriv i stället "tjänsten är typiskt relevant för exempelvis...".

Tjänstebeskrivningen ska vara 2–4 korta stycken, inte bara en mening.

Förbjudna fraser i beskrivningen: "byrån säkerställer", "vi kontrollerar", "byrån har rutiner för", "vi granskar", "vi följer upp", "byrån tillämpar".
Motivering av sannolikhet, konsekvens och residualrisk hör inte i beskrivningen.`;

const HOT_MODUS_AI_RULES = `HOT OCH MODUS:
När du skriver Hot och modus ska texten vara konkret och begriplig för en redovisningsbyrå.

Beskriv inte bara att tjänsten "kan utnyttjas" eller "kan användas för att tvätta pengar". Förklara mekanismen steg för steg:
1. Vilken uppgift, faktura, betalning eller ansökan kan vara felaktig?
2. Hur kan tjänsten användas för att få in pengar, flytta pengar eller legitimera pengar?
3. Vilken roll får byrån genom att administrera, bokföra, kontrollera eller lämna in uppgifterna?
4. Kan hotet avse penningtvätt, terrorismfinansiering eller båda?

Svara på punkt 4 i beskrivningen (även om typfältet inte visas i UI). Typ PT, TF eller Båda ska stämma med beskrivningen. Kräv inte ett separat TF-hot per tjänst.

Avfärda inte terrorismfinansiering bara för att tjänsten inte direkt avser en ideell organisation eller utlandsbetalning. Bedrägerier och felaktiga utbetalningar kan vara en finansieringskälla.

Hitta inte på terrororganisationer eller svepande scenarier utan konkret kedja. Prioritera praktiska modus för redovisningsbyråer, t.ex. osanna fakturor, felaktiga underlag, överdrivna kostnader, oklara betalningar, kapitaltillskott utan underlag, lån från privatpersoner och utlandsbetalningar.

För ROT-/RUT-administration ska AI särskilt beakta:
- oriktiga eller påhittade ROT-/RUT-ansökningar,
- felaktiga uppgifter om utfört arbete,
- överdriven arbetskostnad,
- felaktig uppdelning mellan arbete och material (felaktig fördelning mellan arbetskostnad och material),
- osanna fakturor,
- oklara betalningar,
- felaktiga utbetalningar från Skatteverket,
- att offentliga medel kan genereras och därefter användas, tas ut eller föras vidare,
- att detta kan vara relevant för både penningtvätt och terrorismfinansiering.

Beskriv hur byråns administration, bokföring, kontroll eller inlämning kan ge uppgifterna ökad legitimitet.

Varje hot ska ha:
- kort titel
- konkret beskrivning på 2–4 meningar som täcker de fyra punkterna
- inga vaga formuleringar
- inga dramatiska påståenden utan förklaring

Dåligt: "Tjänsten kan utnyttjas för penningtvätt."
Dåligt: "Tjänsten kan användas för att tvätta pengar."
Dåligt (påhittad terrororg): "Falska ROT/RUT-tjänster kan deklareras för att flytta pengar till organisationer som finansierar terrorism."
Bra: "Oriktiga eller påhittade ROT-/RUT-ansökningar med överdriven arbetskostnad och felaktig uppdelning mellan arbete och material kan ge felaktiga utbetalningar från Skatteverket. De offentliga medlen kan därefter tas ut eller föras vidare. Byrån som administrerar och lämnar in uppgifterna ger underlaget ökad legitimitet. Mekanismen kan avse både penningtvätt och terrorismfinansiering som finansieringskälla."`;

module.exports = {
  EVIDENS,
  EVIDENS_LABEL,
  TJANST_ANALYS_AI_RULES,
  TJANST_BESKRIVNING_AI_RULES,
  HOT_MODUS_AI_RULES,
  ROT_RUT_RESIDUAL_EXEMPEL,
  isBlank,
  knownByraFacts,
  formatByraFactsBlock,
  formatUtforandeBlock,
  buildByraExponering,
  formatExponeringBlock,
  normalizeEvidens,
  normalizeAtgardStatus,
  evidensLabel,
  analyzeUtforandeSignals,
  formatRiskreglerBlock,
  applyRiskFloor,
  ensureResidualMotivering
};
