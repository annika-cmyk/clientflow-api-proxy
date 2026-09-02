/**
 * Byråprofil – fält för intern sårbarhet, kundstock, distribution, tjänster, geografi
 * samt historik, beroenden, högrisktjänster, kundintroduktion och outsourcing.
 * Används av API (Airtable-ensure/mappning), byråsidan och Kom igång-enkäten.
 */

const CHOICE_JA_NEJ = ['Ja', 'Nej'];
const CHOICE_JA_NEJ_DELVIS = ['Ja', 'Nej', 'Delvis'];
const CHOICE_JA_NEJ_VETEJ = ['Ja', 'Nej', 'Vet ej'];
const CHOICE_JA_NEJ_DELVIS_VETEJ = ['Ja', 'Nej', 'Delvis', 'Vet ej'];
const CHOICE_PERSONALOMSATTNING = ['Låg', 'Medel', 'Hög'];
const CHOICE_BANKID = ['Alltid', 'Oftast', 'Ibland', 'Nej'];
const CHOICE_BOKFORING = ['Digitalt (automatiserat)', 'Fysiskt (pärm/kvitton)', 'Blandat'];
const CHOICE_LEVERANS = ['På plats', 'Distans', 'Blandat'];
const CHOICE_KUNDINTRO = [
  'Egen marknadsföring',
  'Rekommendation från bank/advokat',
  'Walk-in via internet utan personlig relation',
  'Blandat'
];

/** @typedef {{ key: string, airtable: string, type: 'number'|'text'|'multiline'|'percent'|'select'|'multiselect', label: string, hint?: string, question: string, choices?: string[], section: string, existing?: boolean }} ByraProfilField */

/** @type {ByraProfilField[]} */
const BYRA_PROFIL_FIELDS = [
  // 1. Intern profil
  {
    key: 'antalAnstallda',
    airtable: 'Antal anställda',
    type: 'number',
    label: 'Antal anställda',
    question: 'Hur många anställda har byrån (inkl. dig själv)?',
    hint: 'Enmansbyråer saknar ofta naturlig fyraögonprincip.',
    section: 'intern',
    existing: true
  },
  {
    key: 'antalKontor',
    airtable: 'Antal kontor',
    type: 'number',
    label: 'Antal kontor',
    question: 'Hur många kontor har byrån?',
    section: 'intern'
  },
  {
    key: 'omsattning',
    airtable: 'Omsättning',
    type: 'text',
    label: 'Omsättning (SEK)',
    question: 'Ungefär vilken årsomsättning har byrån (SEK)?',
    section: 'intern',
    existing: true
  },
  {
    key: 'itSystem',
    airtable: 'IT-system',
    type: 'text',
    label: 'IT-system i det dagliga arbetet',
    question: 'Vilka IT-system används i det dagliga arbetet (t.ex. Fortnox, ClientFlow, eget system)?',
    hint: 'Påverkar modellrisk – risken att ni litar blint på att systemet flaggar rätt.',
    section: 'intern'
  },
  {
    key: 'auktoriseradeKonsulter',
    airtable: 'Auktoriserade konsulter',
    type: 'select',
    label: 'Auktoriserade konsulter',
    question: 'Har byrån auktoriserade konsulter?',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'intern'
  },
  {
    key: 'lopandeUtbildning',
    airtable: 'Löpande utbildning',
    type: 'select',
    label: 'Löpande utbildning',
    question: 'Sker löpande AML-/PT-utbildning för personalen?',
    choices: CHOICE_JA_NEJ,
    section: 'intern'
  },
  {
    key: 'personalomsattning',
    airtable: 'Personalomsättning',
    type: 'select',
    label: 'Personalomsättning',
    question: 'Hur ser personalomsättningen ut?',
    choices: CHOICE_PERSONALOMSATTNING,
    section: 'intern'
  },

  // 2. Kundstock
  {
    key: 'antalKunder',
    airtable: 'Antal kunder',
    type: 'number',
    label: 'Antal kunder',
    question: 'Hur många kunder har byrån ungefär?',
    section: 'kundstock',
    existing: true
  },
  {
    key: 'vanligasteBolagsformer',
    airtable: 'Vanligaste bolagsformer',
    type: 'text',
    label: 'Vanligaste bolagsformer',
    question: 'Vilka bolagsformer är vanligast i kundstocken (t.ex. AB, enskild firma)?',
    section: 'kundstock',
    existing: true
  },
  {
    key: 'branscherKundstock',
    airtable: 'Branscher i kundstocken',
    type: 'multiselect',
    label: 'Högriskbranscher i kundstocken',
    question: 'Vilka högriskbranscher finns bland era kunder?',
    hint: 'T.ex. bygg, restaurang, bilhandel, bemanning, skrot/metall.',
    section: 'kundstock',
    existing: true
  },
  {
    key: 'andelHogriskbransch',
    airtable: 'Andel kunder i högriskbransch',
    type: 'percent',
    label: 'Andel kunder i högriskbransch',
    question: 'Ungefär hur stor andel av kunderna verkar i högriskbranscher?',
    section: 'kundstock'
  },
  {
    key: 'andelKontantintensiva',
    airtable: 'Andel kontantintensiva kunder',
    type: 'percent',
    label: 'Andel kontantintensiva kunder',
    question: 'Hur stor andel av kunderna hanterar kontanter, kort eller Swish i stor skala?',
    section: 'kundstock',
    existing: true
  },
  {
    key: 'betalningsmonster',
    airtable: 'Betalningsmönster',
    type: 'multiline',
    label: 'Betalningsmönster',
    question: 'Beskriv kort typiska betalningsmönster hos kunderna (kontant, kort, Swish, faktura).',
    section: 'kundstock'
  },
  {
    key: 'komplexaAgarstrukturer',
    airtable: 'Komplexa ägarstrukturer',
    type: 'select',
    label: 'Komplexa ägarstrukturer',
    question: 'Finns kunder med komplexa bolagskonstruktioner?',
    choices: CHOICE_JA_NEJ_DELVIS_VETEJ,
    section: 'kundstock'
  },
  {
    key: 'utlandskaAgare',
    airtable: 'Utländska ägare',
    type: 'select',
    label: 'Utländska ägare',
    question: 'Finns kunder med utländska ägare eller huvudmän?',
    choices: CHOICE_JA_NEJ_DELVIS_VETEJ,
    section: 'kundstock'
  },
  {
    key: 'pepKunder',
    airtable: 'PEP-kunder',
    type: 'select',
    label: 'PEP-kunder',
    question: 'Finns politiskt utsatta personer (PEP) bland kunderna eller deras ägare?',
    choices: CHOICE_JA_NEJ_VETEJ,
    section: 'kundstock'
  },

  // 3. Distribution
  {
    key: 'leveranssatt',
    airtable: 'Leveranssätt',
    type: 'select',
    label: 'Mötesform / leveranssätt',
    question: 'Sker kundkontakt och onboarding främst fysiskt, digitalt på distans eller blandat?',
    choices: CHOICE_LEVERANS,
    section: 'distribution',
    existing: true
  },
  {
    key: 'bankIdKrav',
    airtable: 'BankID-krav',
    type: 'select',
    label: 'BankID vid avtal och KYC',
    question: 'Kräver byrån BankID vid digital signering av avtal och KYC?',
    choices: CHOICE_BANKID,
    section: 'distribution'
  },

  // 4. Tjänster
  {
    key: 'kundGorLopande',
    airtable: 'Kunden gör löpande bokföring',
    type: 'select',
    label: 'Kunden gör löpande bokföring',
    question: 'Sköter kunden ofta sin egen löpande bokföring medan byrån gör bokslut?',
    hint: 'Ökar sårbarheten när byrån saknar insyn i dagliga transaktioner.',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'tjanster'
  },
  {
    key: 'betalningsuppdrag',
    airtable: 'Betalningsuppdrag',
    type: 'select',
    label: 'Betalningsuppdrag',
    question: 'Har byrån behörighet att genomföra betalningar åt kunder (betalningsuppdrag)?',
    hint: 'Röd flagga enligt Länsstyrelsen – höjer ofta risken markant.',
    choices: CHOICE_JA_NEJ,
    section: 'tjanster'
  },
  {
    key: 'bokforingsmetod',
    airtable: 'Bokföringsmetod',
    type: 'select',
    label: 'Bokföringsmetod',
    question: 'Sker bokföringen främst via digitala flöden, fysiska underlag eller blandat?',
    choices: CHOICE_BOKFORING,
    section: 'tjanster'
  },

  // 5. Geografi
  {
    key: 'geografiskMarknad',
    airtable: 'Geografisk marknad',
    type: 'text',
    label: 'Geografisk marknad',
    question: 'Var finns byråns kunder geografiskt?',
    section: 'geografi',
    existing: true
  },
  {
    key: 'andelInternationellHandel',
    airtable: 'Andel kunder med internationell handel',
    type: 'percent',
    label: 'Andel kunder med internationell handel',
    question: 'Hur stor andel av kunderna har affärsförbindelser med utlandet?',
    section: 'geografi',
    existing: true
  },
  {
    key: 'sanktionslander',
    airtable: 'Sanktionsländer eller högriskländer',
    type: 'select',
    label: 'Sanktionsländer / högriskländer',
    question: 'Förekommer transaktioner med länder utanför EU/EES, högrisktredjeländer eller skatteparadis?',
    choices: CHOICE_JA_NEJ_DELVIS_VETEJ,
    section: 'geografi'
  },
  {
    key: 'kunderIUtsattaOmraden',
    airtable: 'Kunder i utsatta områden',
    type: 'select',
    label: 'Kunder i utsatta områden',
    question:
      'Har byrån kunder vars verksamhet (t.ex. butik, restaurang, verkstad) är fysiskt belägen i ett område som finns med på Polismyndighetens lista över utsatta områden?',
    hint: 'Gäller fysisk belägenhet enligt Polismyndighetens lista över utsatta / särskilt utsatta områden.',
    choices: CHOICE_JA_NEJ_DELVIS_VETEJ,
    section: 'geografi'
  },

  // 6. Historik och track record
  {
    key: 'finanspolisenAvvikelserAntal',
    airtable: 'Avvikelserapporter Finanspolisen antal',
    type: 'number',
    label: 'Avvikelserapporter till Finanspolisen (antal)',
    question: 'Hur många avvikelserapporter har byrån lämnat till Finanspolisen under de senaste tre åren?',
    hint: 'Ange 0 om inga rapporter lämnats.',
    section: 'historik'
  },
  {
    key: 'finanspolisenAvvikelserTyp',
    airtable: 'Avvikelserapporter Finanspolisen typ',
    type: 'multiline',
    label: 'Typ av misstanke i avvikelserapporter',
    question: 'Vilken typ av misstanke gällde rapporterna (t.ex. penningtvätt, terroristfinansiering)?',
    hint: 'Ange "Ej aktuellt" om antalet är 0.',
    section: 'historik'
  },
  {
    key: 'lanstyrelsenAnmarkningar',
    airtable: 'Anmärkningar Länsstyrelsen tillsyn',
    type: 'select',
    label: 'Anmärkningar från Länsstyrelsens tillsyn',
    question: 'Har byrån fått anmärkningar från Länsstyrelsens tillsyn?',
    choices: CHOICE_JA_NEJ_VETEJ,
    section: 'historik'
  },
  {
    key: 'lanstyrelsenAnmarkningarDetalj',
    airtable: 'Anmärkningar Länsstyrelsen detalj',
    type: 'multiline',
    label: 'Beskrivning av tillsynsanmärkningar',
    question: 'Beskriv eventuella anmärkningar från Länsstyrelsen kort.',
    hint: 'Ange "Inga" om ni svarat Nej.',
    section: 'historik'
  },
  {
    key: 'nearMisses',
    airtable: 'Near misses',
    type: 'select',
    label: 'Near misses (avböjt/avslutat pga misstanke)',
    question:
      'Finns kända "near misses" – fall där byrån avböjt eller avslutat kundrelation på grund av misstanke?',
    choices: CHOICE_JA_NEJ,
    section: 'historik'
  },
  {
    key: 'nearMissesDetalj',
    airtable: 'Near misses detalj',
    type: 'multiline',
    label: 'Beskrivning av near misses',
    question: 'Beskriv kort sådana fall (utan att namnge kunder i onödan).',
    hint: 'Ange "Inga" om ni svarat Nej.',
    section: 'historik'
  },

  // 7. Ekonomiska beroendeförhållanden
  {
    key: 'storaKundberoenden',
    airtable: 'Stora kundberoenden',
    type: 'select',
    label: 'Enskilda kunder med stor andel av omsättningen',
    question: 'Finns enskilda kunder som utgör en stor andel av byråns omsättning?',
    hint: 'Koncentration till få stora kunder kan öka sårbarheten och påverka oberoendet.',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'beroende'
  },
  {
    key: 'storaKundberoendenAndel',
    airtable: 'Andel omsättning största kunderna',
    type: 'percent',
    label: 'Andel omsättning från de största kunderna',
    question: 'Ungefär hur stor andel av omsättningen kommer från de största kunderna (t.ex. topp 1–3)?',
    hint: 'Ange 0 om ni inte har sådana beroenden.',
    section: 'beroende'
  },

  // 8. Tjänster med förhöjd risk
  {
    key: 'bolagsbildningAtKund',
    airtable: 'Bolagsbildning åt kund',
    type: 'select',
    label: 'Bolagsbildning åt kund',
    question: 'Erbjuder byrån bolagsbildning å kunds vägnar?',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'hogrisktjanster'
  },
  {
    key: 'styrelseEllerNomineeRoller',
    airtable: 'Styrelse- eller nominee-roller',
    type: 'select',
    label: 'Styrelseuppdrag eller nominee-liknande roller',
    question: 'Tar byrån styrelseuppdrag eller nominee-liknande roller för kunds räkning?',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'hogrisktjanster'
  },
  {
    key: 'satePostadress',
    airtable: 'Säte eller postadress åt kund',
    type: 'select',
    label: 'Säte / postadress ("brevlådeföretag")',
    question: 'Tillhandahåller byrån säte eller postadress åt kunder (s.k. brevlådeföretag)?',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'hogrisktjanster'
  },
  {
    key: 'fullmaktBolagsverket',
    airtable: 'Fullmakt Bolagsverket',
    type: 'select',
    label: 'Fullmakt hos Bolagsverket',
    question:
      'Har byrån fullmakt hos Bolagsverket att ändra bolagsuppgifter åt kunden (t.ex. styrelse, firmatecknare eller adress)?',
    hint:
      'Känsligare än vanligt deklarationsombud – kan i praktiken användas för att ta över kontrollen över ett bolag (klassisk metod vid bolagskapningar/målvaktsupplägg).',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'hogrisktjanster'
  },
  {
    key: 'ombudSkatteprocesser',
    airtable: 'Ombud i skatteprocesser',
    type: 'select',
    label: 'Ombud i skatteprocesser / tvister',
    question:
      'Företräder byrån kunder i utredning, revision eller överklagande hos Skatteverket (utöver löpande deklarationer)?',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'hogrisktjanster'
  },
  {
    key: 'generalfullmaktMyndighet',
    airtable: 'Generalfullmakt myndighet',
    type: 'select',
    label: 'Generalfullmakt / obegränsad myndighetsfullmakt',
    question:
      'Har byrån generalfullmakt eller obegränsad fullmakt hos någon myndighet (till skillnad från avgränsad fullmakt för ett specifikt ärendeslag)?',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'hogrisktjanster'
  },

  // 9. Kundens ursprung/introduktion
  {
    key: 'kundIntroduktion',
    airtable: 'Kundens ursprung introduktion',
    type: 'select',
    label: 'Hur nya kunder kommer in',
    question:
      'Hur kommer nya kunder främst in – egen marknadsföring, rekommendation från bank/advokat, eller walk-in via internet utan personlig relation?',
    choices: CHOICE_KUNDINTRO,
    section: 'kundintro'
  },
  {
    key: 'andelNystartadeBolag',
    airtable: 'Andel nystartade bolag',
    type: 'percent',
    label: 'Andel nystartade bolag i kundstocken',
    question: 'Ungefär hur stor andel av kunderna är nystartade bolag utan längre historik?',
    hint: 'Nystartade bolag utan historik innebär ofta högre risk.',
    section: 'kundintro'
  },

  // 10. Outsourcing / underleverantörer
  {
    key: 'outsourcingUnderleverantorer',
    airtable: 'Outsourcing underleverantörer',
    type: 'select',
    label: 'Externa underleverantörer i produktionen',
    question:
      'Anlitar byrån externa parter (t.ex. i annat land) för delar av den egna produktionen/leveransen?',
    hint:
      'Gäller byråns egen leveranskedja – en egen sårbarhetskälla utöver vem som gör kundens förarbete.',
    choices: CHOICE_JA_NEJ_DELVIS,
    section: 'outsourcing'
  },
  {
    key: 'outsourcingUnderleverantorerDetalj',
    airtable: 'Outsourcing underleverantörer detalj',
    type: 'multiline',
    label: 'Beskrivning av outsourcing',
    question: 'Beskriv kort vilka delar som outsourcas och var (land/region) om relevant.',
    hint: 'Ange "Inga" om ni svarat Nej.',
    section: 'outsourcing'
  }
];

const HOGRISK_NONE_LABEL = 'Inga högriskbranscher';

const BYRA_PROFIL_SECTIONS = [
  {
    id: 'intern',
    title: 'Byråns interna profil',
    subtitle: 'Verksamhetsspecifika omständigheter som påverkar inre sårbarhet.'
  },
  {
    id: 'kundstock',
    title: 'Kundstockens sammansättning',
    subtitle: 'Kundfaktorer som påverkar den inneboende sannolikheten att tjänster utnyttjas.'
  },
  {
    id: 'distribution',
    title: 'Distributionskanaler',
    subtitle: 'Hur byrån samarbetar med och identifierar kunden.'
  },
  {
    id: 'tjanster',
    title: 'Tjänsternas karaktär',
    subtitle: 'Hur tjänsterna faktiskt utförs i praktiken.'
  },
  {
    id: 'geografi',
    title: 'Geografi och internationell koppling',
    subtitle: 'Utländska affärer, högriskländer och utsatta områden.'
  },
  {
    id: 'historik',
    title: 'Historik och track record',
    subtitle: 'Tidigare avvikelser, tillsynsanmärkningar och near misses.'
  },
  {
    id: 'beroende',
    title: 'Ekonomiska beroendeförhållanden',
    subtitle: 'Om enskilda kunder utgör en stor andel av byråns omsättning.'
  },
  {
    id: 'hogrisktjanster',
    title: 'Tjänster med förhöjd risk i sig',
    subtitle: 'Bolagsbildning, nominee-roller, säte/postadress och känsliga fullmakter.'
  },
  {
    id: 'kundintro',
    title: 'Kundens ursprung och introduktion',
    subtitle: 'Hur kunder kommer in och andel nystartade bolag.'
  },
  {
    id: 'outsourcing',
    title: 'Outsourcing och underleverantörer',
    subtitle: 'Externa parter i byråns egen leveranskedja.'
  }
].map((section) => ({
  ...section,
  fieldKeys: BYRA_PROFIL_FIELDS.filter((f) => f.section === section.id).map((f) => f.key)
}));

function fieldsForSection(sectionId) {
  return BYRA_PROFIL_FIELDS.filter((f) => f.section === sectionId);
}

function airtableEnsureSpecs(fields = BYRA_PROFIL_FIELDS) {
  return fields
    .filter((f) => !f.existing)
    .map((f) => {
      if (f.type === 'number' || f.type === 'percent') {
        return { name: f.airtable, type: 'number', description: f.label, options: { precision: 0 } };
      }
      if (f.type === 'select') {
        return {
          name: f.airtable,
          type: 'singleSelect',
          description: f.label,
          options: { choices: (f.choices || []).map((name) => ({ name })) }
        };
      }
      if (f.type === 'multiline') {
        return { name: f.airtable, type: 'multilineText', description: f.label };
      }
      return { name: f.airtable, type: 'singleLineText', description: f.label };
    });
}

function mapProfilFromAirtable(fields) {
  const f = fields || {};
  const out = {};
  BYRA_PROFIL_FIELDS.forEach((def) => {
    const raw = f[def.airtable];
    out[def.key] = raw == null ? '' : raw;
  });
  // Bakåtkompatibla alias
  if (!out.andelInternationellHandel && f['Andel internationell handel'] != null) {
    out.andelInternationellHandel = f['Andel internationell handel'];
  }
  return out;
}

function isAnsweredValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some((v) => String(v || '').trim());
  return String(value).trim() !== '';
}

function unansweredKeys(profil, fields = BYRA_PROFIL_FIELDS) {
  const p = profil || {};
  return fields.filter((f) => !isAnsweredValue(p[f.key])).map((f) => f.key);
}

function isProfilComplete(profil, fields = BYRA_PROFIL_FIELDS) {
  return unansweredKeys(profil, fields).length === 0;
}

function formatProfilPromptBlock(profil) {
  const p = profil || {};
  const lines = ['BYRÅPROFIL (för kalibrering av risknivåer):'];
  BYRA_PROFIL_FIELDS.forEach((f) => {
    const v = p[f.key];
    const shown = isAnsweredValue(v) ? (Array.isArray(v) ? v.join(', ') : String(v)) : '–';
    const suffix = f.type === 'percent' && isAnsweredValue(v) && !String(v).includes('%') ? '%' : '';
    lines.push(`- ${f.label}: ${shown}${suffix}`);
  });
  return lines.join('\n');
}

module.exports = {
  BYRA_PROFIL_FIELDS,
  BYRA_PROFIL_SECTIONS,
  HOGRISK_NONE_LABEL,
  fieldsForSection,
  airtableEnsureSpecs,
  mapProfilFromAirtable,
  isAnsweredValue,
  unansweredKeys,
  isProfilComplete,
  formatProfilPromptBlock
};
