/**
 * Byråprofil – fält för intern sårbarhet, kundstock, distribution, tjänster, geografi
 * samt historik, beroenden, högrisktjänster, kundintroduktion och outsourcing.
 * Används av API (Airtable-ensure/mappning), byråsidan och Kom igång-enkäten.
 */

const CHOICE_JA_NEJ = ['Ja', 'Nej'];
/** Historiskt namn – Delvis är borttaget; behålls som alias för Ja/Nej. */
const CHOICE_JA_NEJ_DELVIS = ['Ja', 'Nej'];
const CHOICE_JA_NEJ_VETEJ = ['Ja', 'Nej', 'Vet ej'];
/** Historiskt namn – Delvis är borttaget; behålls som alias för Ja/Nej/Vet ej. */
const CHOICE_JA_NEJ_DELVIS_VETEJ = ['Ja', 'Nej', 'Vet ej'];
const CHOICE_BOLAGSFORMER = [
  'AB',
  'Enskild firma',
  'HB',
  'KB',
  'Ekonomisk förening',
  'Bostadsrättsförening (BRF)',
  'Ideell förening',
  'Stiftelse',
  'Filial/utländskt bolag',
  'Övrigt'
];
const BOLAGSFORM_ALIASES = {
  ab: 'AB',
  aktiebolag: 'AB',
  aktiebolaget: 'AB',
  'enskild firma': 'Enskild firma',
  'enskild näringsidkare': 'Enskild firma',
  enskild: 'Enskild firma',
  ef: 'Enskild firma',
  hb: 'HB',
  handelsbolag: 'HB',
  kb: 'KB',
  kommanditbolag: 'KB',
  'ekonomisk förening': 'Ekonomisk förening',
  'ek. för.': 'Ekonomisk förening',
  'ek förening': 'Ekonomisk förening',
  brf: 'Bostadsrättsförening (BRF)',
  bostadsrättsförening: 'Bostadsrättsförening (BRF)',
  'bostadsrättsförening (brf)': 'Bostadsrättsförening (BRF)',
  'ideell förening': 'Ideell förening',
  'idiell förening': 'Ideell förening',
  ideell: 'Ideell förening',
  idiell: 'Ideell förening',
  stiftelse: 'Stiftelse',
  filial: 'Filial/utländskt bolag',
  'filial/utländskt bolag': 'Filial/utländskt bolag',
  'utländskt bolag': 'Filial/utländskt bolag',
  övrigt: 'Övrigt'
};
const CHOICE_PERSONALOMSATTNING = ['Låg', 'Medel', 'Hög'];
const CHOICE_BANKID = ['Alltid', 'Oftast', 'Ibland', 'Nej'];
const CHOICE_BOKFORING = ['Digitalt (automatiserat)', 'Fysiskt (pärm/kvitton)', 'Blandat'];
/** AML-relevanta mötes-/onboardingmodeller (single-select). */
const CHOICE_LEVERANS = [
  'Vi träffar kunder endast på distans',
  'Vi träffar kunder nästan uteslutande fysiskt – t.ex. överlämning av material',
  'Vi träffar kunder både fysiskt ibland och digitalt regelbundet',
  'Onboarding fysiskt, därefter främst distans',
  'Blandad modell – varierar kraftigt mellan kunder'
];

/** Äldre korta svar → kanoniskt val (befintliga Airtable-svar ska fortfarande synas). */
const LEVERANS_LEGACY_MAP = {
  'på plats': CHOICE_LEVERANS[1],
  distans: CHOICE_LEVERANS[0],
  blandat: CHOICE_LEVERANS[2]
};

function foldLeveranssatt(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}

function normalizeLeveranssatt(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  const folded = foldLeveranssatt(s);
  const exact = CHOICE_LEVERANS.find((c) => foldLeveranssatt(c) === folded);
  if (exact) return exact;
  if (Object.prototype.hasOwnProperty.call(LEVERANS_LEGACY_MAP, folded)) {
    return LEVERANS_LEGACY_MAP[folded];
  }
  return s;
}

function isLeveransEndastDistans(raw) {
  const t = foldLeveranssatt(normalizeLeveranssatt(raw) || raw);
  return t === 'distans' || t === foldLeveranssatt(CHOICE_LEVERANS[0]);
}

function isLeveransFramstFysiskt(raw) {
  const t = foldLeveranssatt(normalizeLeveranssatt(raw) || raw);
  return t === 'på plats' || t === foldLeveranssatt(CHOICE_LEVERANS[1]);
}

function isLeveransBlandad(raw) {
  const t = foldLeveranssatt(normalizeLeveranssatt(raw) || raw);
  if (t === 'blandat') return true;
  return (
    t === foldLeveranssatt(CHOICE_LEVERANS[2]) ||
    t === foldLeveranssatt(CHOICE_LEVERANS[3]) ||
    t === foldLeveranssatt(CHOICE_LEVERANS[4])
  );
}

function isLeveransMedDistans(raw) {
  return isLeveransEndastDistans(raw) || isLeveransBlandad(raw);
}

const CHOICE_KUNDINTRO = [
  'Egen marknadsföring',
  'Rekommendation från bank/advokat',
  'Walk-in via internet utan personlig relation',
  'Blandat'
];
const CHOICE_BOKFORINGSSYSTEM = ['Visma', 'Spiris', 'Fortnox', 'BOKIO', 'OQTO', 'BRIOX', 'Annat'];
const CHOICE_BOKSLUTSSYSTEM = ['Capego', 'Fortnox', 'Visma', 'Annat'];
const CHOICE_KUNDHANTERINGSSYSTEM = ['ClientFlow', 'Accountec', 'Annat'];
const CHOICE_BETALNINGSMONSTER = [
  'Kontant',
  'Kort',
  'Swish',
  'Faktura',
  'Banköverföring',
  'Autogiro',
  'Bankgiro/Plusgiro'
];
const BETALNINGSMONSTER_ALIASES = {
  kontant: 'Kontant',
  kontanter: 'Kontant',
  kontantbetalning: 'Kontant',
  kontantbetalningar: 'Kontant',
  kort: 'Kort',
  kortbetalning: 'Kort',
  kortbetalningar: 'Kort',
  betalkort: 'Kort',
  kreditkort: 'Kort',
  debetkort: 'Kort',
  swish: 'Swish',
  faktura: 'Faktura',
  fakturor: 'Faktura',
  fakturering: 'Faktura',
  banköverföring: 'Banköverföring',
  bankoverforing: 'Banköverföring',
  överföring: 'Banköverföring',
  overforing: 'Banköverföring',
  banktransfer: 'Banköverföring',
  autogiro: 'Autogiro',
  bankgiro: 'Bankgiro/Plusgiro',
  plusgiro: 'Bankgiro/Plusgiro',
  'bankgiro/plusgiro': 'Bankgiro/Plusgiro',
  'bankgiro plusgiro': 'Bankgiro/Plusgiro'
};


/**
 * @typedef {{ key: string, equals: string }} ByraProfilRequiredWhen
 * @typedef {{ key: string, airtable: string, type: 'number'|'text'|'multiline'|'percent'|'select'|'multiselect'|'bolagsformer', label: string, hint?: string, question: string, choices?: string[], allowCustom?: boolean, section: string, existing?: boolean, optional?: boolean, requiredWhen?: ByraProfilRequiredWhen }} ByraProfilField
 */

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
    key: 'bokforingssystem',
    airtable: 'Bokföringssystem',
    type: 'multiselect',
    label: 'Bokföringssystem',
    question: 'Vilka bokföringssystem använder byrån i det dagliga arbetet?',
    hint: 'Välj ett eller flera. Påverkar modellrisk – risken att ni litar blint på att systemet flaggar rätt.',
    choices: CHOICE_BOKFORINGSSYSTEM,
    section: 'intern'
  },
  {
    key: 'bokforingssystemAnnat',
    airtable: 'Bokföringssystem annat',
    type: 'text',
    label: 'Bokföringssystem (annat)',
    question: 'Ange vilket bokföringssystem ni använder.',
    hint: 'Fylls i när ni valt Annat.',
    section: 'intern',
    optional: true,
    requiredWhen: { key: 'bokforingssystem', equals: 'Annat' }
  },
  {
    key: 'bokslutssystem',
    airtable: 'Bokslutssystem',
    type: 'multiselect',
    label: 'Bokslutssystem',
    question: 'Vilka bokslutssystem använder byrån?',
    choices: CHOICE_BOKSLUTSSYSTEM,
    section: 'intern'
  },
  {
    key: 'bokslutssystemAnnat',
    airtable: 'Bokslutssystem annat',
    type: 'text',
    label: 'Bokslutssystem (annat)',
    question: 'Ange vilket bokslutssystem ni använder.',
    hint: 'Fylls i när ni valt Annat.',
    section: 'intern',
    optional: true,
    requiredWhen: { key: 'bokslutssystem', equals: 'Annat' }
  },
  {
    key: 'kundhanteringssystem',
    airtable: 'Kundhanteringssystem',
    type: 'multiselect',
    label: 'Kundhanteringssystem',
    question: 'Vilka kundhanteringssystem använder byrån?',
    choices: CHOICE_KUNDHANTERINGSSYSTEM,
    section: 'intern'
  },
  {
    key: 'kundhanteringssystemAnnat',
    airtable: 'Kundhanteringssystem annat',
    type: 'text',
    label: 'Kundhanteringssystem (annat)',
    question: 'Ange vilket kundhanteringssystem ni använder.',
    hint: 'Fylls i när ni valt Annat.',
    section: 'intern',
    optional: true,
    requiredWhen: { key: 'kundhanteringssystem', equals: 'Annat' }
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
    type: 'bolagsformer',
    label: 'Bolagsformer i kundstocken',
    question: 'Vilka bolagsformer finns i kundstocken? Ange ett uppskattat antal per form.',
    hint: 'Bocka alla former som förekommer. Antalet får vara ungefärligt – det används för att förstå kundstockens sammansättning.',
    choices: CHOICE_BOLAGSFORMER,
    section: 'kundstock',
    existing: true
  },
  {
    key: 'kundernasBranscher',
    airtable: 'Kundernas branscher',
    type: 'branscher',
    label: 'Kundernas branscher',
    question: 'Vilka branscher har ni era kunder i?',
    hint: 'Lägg till översiktsgrupper som är vanligast i kundstocken (t.ex. Bygg, IT, Handel) och ange ungefär hur många kunder per grupp. Specifika SNI-koder kan läggas till vid behov.',
    section: 'kundstock'
  },
  {
    key: 'branscherKundstock',
    airtable: 'Branscher i kundstocken',
    type: 'hogrisk-branscher',
    label: 'Högriskbranscher i kundstocken',
    question: 'Vilka högriskbranscher finns bland era kunder?',
    hint: 'Sök och lägg till högriskbranscher, ange ungefärligt antal. Välj Inga högriskbranscher om det inte finns några.',
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
    type: 'multiselect',
    allowCustom: true,
    label: 'Betalningsmönster',
    question: 'Vilka typiska betalningsmönster har kunderna?',
    hint: 'Välj ett eller flera. Lägg till egna alternativ vid behov.',
    choices: CHOICE_BETALNINGSMONSTER,
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
    key: 'komplexaAgarstrukturerAntal',
    airtable: 'Komplexa ägarstrukturer antal',
    type: 'number',
    label: 'Antal kunder med komplexa ägarstrukturer',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'kundstock',
    optional: true,
    requiredWhen: { key: 'komplexaAgarstrukturer', equals: 'Ja' }
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
    key: 'utlandskaAgareAntal',
    airtable: 'Utländska ägare antal',
    type: 'number',
    label: 'Antal kunder med utländska ägare',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'kundstock',
    optional: true,
    requiredWhen: { key: 'utlandskaAgare', equals: 'Ja' }
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
  {
    key: 'pepKunderAntal',
    airtable: 'PEP-kunder antal',
    type: 'number',
    label: 'Antal PEP-kunder',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'kundstock',
    optional: true,
    requiredWhen: { key: 'pepKunder', equals: 'Ja' }
  },

  // 3. Distribution
  {
    key: 'leveranssatt',
    airtable: 'Leveranssätt',
    type: 'select',
    label: 'Mötesform / leveranssätt',
    question: 'Hur sker kundkontakt och onboarding främst?',
    hint: 'Välj den modell som bäst beskriver hur ni möter och onboardar kunder.',
    choices: CHOICE_LEVERANS,
    section: 'distribution',
    existing: true,
    ui: 'stack'
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
    key: 'betalningsuppdragAntal',
    airtable: 'Betalningsuppdrag antal',
    type: 'number',
    label: 'Antal kunder med betalningsuppdrag',
    question: 'Ungefär hur många kunder gäller betalningsuppdraget?',
    hint: 'Visas när ni svarat Ja.',
    section: 'tjanster',
    optional: true,
    requiredWhen: { key: 'betalningsuppdrag', equals: 'Ja' }
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
  {
    key: 'kunderIUtsattaOmradenAntal',
    airtable: 'Kunder i utsatta områden antal',
    type: 'number',
    label: 'Antal kunder i utsatta områden',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'geografi',
    optional: true,
    requiredWhen: { key: 'kunderIUtsattaOmraden', equals: 'Ja' }
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
    hint: 'Visas när ni svarat Ja.',
    section: 'historik',
    optional: true,
    requiredWhen: { key: 'lanstyrelsenAnmarkningar', equals: 'Ja' }
  },
  {
    key: 'nearMisses',
    airtable: 'Near misses',
    type: 'select',
    label: 'Near misses (avböjt/avslutat pga misstanke eller risk)',
    question:
      'Finns kända "near misses" – fall där byrån avböjt eller avslutat uppdrag, eller tackat nej till en kund, på grund av misstanke eller för att ni inte kunnat hantera den risk kunden innebar?',
    hint:
      'Räkna även in uppdrag ni tackat nej till när risken inte gick att hantera på ett godtagbart sätt – inte bara avslutade kunder vid misstanke.',
    choices: CHOICE_JA_NEJ,
    section: 'historik'
  },
  {
    key: 'nearMissesDetalj',
    airtable: 'Near misses detalj',
    type: 'multiline',
    label: 'Beskrivning av near misses',
    question:
      'Beskriv kort sådana fall (utan att namnge kunder). Ange gärna om det gällde misstanke eller att risken inte kunde hanteras.',
    hint: 'Visas när ni svarat Ja.',
    section: 'historik',
    optional: true,
    requiredWhen: { key: 'nearMisses', equals: 'Ja' }
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
    hint: 'Visas när ni svarat Ja.',
    section: 'beroende',
    optional: true,
    requiredWhen: { key: 'storaKundberoenden', equals: 'Ja' }
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
    key: 'bolagsbildningAtKundAntal',
    airtable: 'Bolagsbildning åt kund antal',
    type: 'number',
    label: 'Antal kunder med bolagsbildning',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'hogrisktjanster',
    optional: true,
    requiredWhen: { key: 'bolagsbildningAtKund', equals: 'Ja' }
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
    key: 'styrelseEllerNomineeRollerAntal',
    airtable: 'Styrelse- eller nominee-roller antal',
    type: 'number',
    label: 'Antal kunder med styrelse-/nominee-roller',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'hogrisktjanster',
    optional: true,
    requiredWhen: { key: 'styrelseEllerNomineeRoller', equals: 'Ja' }
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
    key: 'satePostadressAntal',
    airtable: 'Säte eller postadress åt kund antal',
    type: 'number',
    label: 'Antal kunder med säte/postadress',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'hogrisktjanster',
    optional: true,
    requiredWhen: { key: 'satePostadress', equals: 'Ja' }
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
    key: 'fullmaktBolagsverketAntal',
    airtable: 'Fullmakt Bolagsverket antal',
    type: 'number',
    label: 'Antal kunder med Bolagsverket-fullmakt',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'hogrisktjanster',
    optional: true,
    requiredWhen: { key: 'fullmaktBolagsverket', equals: 'Ja' }
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
    key: 'ombudSkatteprocesserAntal',
    airtable: 'Ombud i skatteprocesser antal',
    type: 'number',
    label: 'Antal kunder i skatteprocesser',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'hogrisktjanster',
    optional: true,
    requiredWhen: { key: 'ombudSkatteprocesser', equals: 'Ja' }
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
  {
    key: 'generalfullmaktMyndighetAntal',
    airtable: 'Generalfullmakt myndighet antal',
    type: 'number',
    label: 'Antal kunder med generalfullmakt',
    question: 'Ungefär hur många kunder gäller det?',
    hint: 'Visas när ni svarat Ja.',
    section: 'hogrisktjanster',
    optional: true,
    requiredWhen: { key: 'generalfullmaktMyndighet', equals: 'Ja' }
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
    hint: 'Visas när ni svarat Ja.',
    section: 'outsourcing',
    optional: true,
    requiredWhen: { key: 'outsourcingUnderleverantorer', equals: 'Ja' }
  }
];

const HOGRISK_NONE_LABEL = 'Inga högriskbranscher';

const KundBranschAggregat = require('../public/js/kund-bransch-aggregat');
const COMMON_KUND_BRANSCHER = KundBranschAggregat.COMMON_KUND_BRANSCHER.slice();

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

function airtableTypeForField(field) {
  if (!field) return 'singleLineText';
  if (field.type === 'number' || field.type === 'percent') return 'number';
  if (field.type === 'select') return 'singleSelect';
  if (field.type === 'multiline' || field.type === 'bolagsformer' || field.type === 'branscher' || field.type === 'hogrisk-branscher') {
    return 'multilineText';
  }
  // text + multiselect: kommaseparerade/flerval måste vara text, inte singleSelect
  return 'singleLineText';
}

function airtableEnsureSpecs(fields = BYRA_PROFIL_FIELDS) {
  return fields
    .filter((f) => !f.existing)
    .map((f) => {
      const type = airtableTypeForField(f);
      if (type === 'number') {
        return { name: f.airtable, type: 'number', description: f.label, options: { precision: 0 } };
      }
      if (type === 'singleSelect') {
        return {
          name: f.airtable,
          type: 'singleSelect',
          description: f.label,
          options: { choices: (f.choices || []).map((name) => ({ name })) }
        };
      }
      return { name: f.airtable, type, description: f.label };
    });
}

function isBlankWriteValue(v) {
  if (v == null) return true;
  const s = String(v).trim();
  if (!s) return true;
  return /^välj(\.\.\.|…)?$/i.test(s);
}

function toTextOrNull(v) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const joined = v.map((x) => String(x || '').trim()).filter(Boolean).join(', ');
    return joined || null;
  }
  const s = String(v).trim();
  if (isBlankWriteValue(s)) return null;
  return s;
}

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Äldre Byråer-fält som är singleLineText i Airtable (inte number).
 * Numeriska värden måste skickas som sträng – annars: cannot accept the provided value.
 */
const LEGACY_TEXT_NUMBER_AIRTABLE_FIELDS = new Set([
  'Antal anställda',
  'Omsättning',
  'Antal kundföretag'
]);

function coerceLegacyTextNumberValue(airtableName, v) {
  if (!LEGACY_TEXT_NUMBER_AIRTABLE_FIELDS.has(airtableName)) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return v;
}

function sanitizeAirtablePatchFields(fields) {
  const out = {};
  Object.entries(fields || {}).forEach(([k, v]) => {
    if (typeof v === 'string' && isBlankWriteValue(v)) out[k] = null;
    else out[k] = coerceLegacyTextNumberValue(k, v);
  });
  return out;
}

/**
 * Mappar klientens byråprofil-body till Airtable-fält.
 * Tomma select-värden blir null (Airtable får inte "").
 */
function buildProfilAirtableFields(body, fields = BYRA_PROFIL_FIELDS) {
  const out = {};
  const errors = [];
  (fields || []).forEach((def) => {
    if (!body || !Object.prototype.hasOwnProperty.call(body, def.key)) return;
    if (body[def.key] === undefined) return;
    if (def.type === 'number' || def.type === 'percent') {
      const n = toNumberOrNull(body[def.key]);
      if (def.type === 'percent' && n != null && (n < 0 || n > 100)) {
        errors.push(`${def.label} måste vara mellan 0 och 100`);
        return;
      }
      if (def.key === 'antalKunder' && n != null && n < 0) {
        errors.push('Antal kunder måste vara 0 eller högre');
        return;
      }
      out[def.airtable] = coerceLegacyTextNumberValue(def.airtable, n);
      return;
    }
    let writeVal = body[def.key];
    if (def.key === 'leveranssatt') {
      writeVal = normalizeLeveranssatt(writeVal);
    } else if (def.key === 'betalningsmonster') {
      writeVal = normalizeBetalningsmonsterValue(writeVal, def.choices || CHOICE_BETALNINGSMONSTER);
    }
    out[def.airtable] = toTextOrNull(writeVal);
  });
  return { fields: out, errors };
}

const LEGACY_SELECT_SUFFIX = ' (legacy select)';

function legacySelectName(name) {
  return `${String(name || '').trim()}${LEGACY_SELECT_SUFFIX}`;
}

function isLegacySelectName(name) {
  const n = String(name || '').trim();
  return n.endsWith(LEGACY_SELECT_SUFFIX) || n.endsWith(' (singleSelect-legacy)');
}

function originalNameFromLegacy(name) {
  const n = String(name || '').trim();
  if (n.endsWith(LEGACY_SELECT_SUFFIX)) return n.slice(0, -LEGACY_SELECT_SUFFIX.length);
  if (n.endsWith(' (singleSelect-legacy)')) return n.slice(0, -' (singleSelect-legacy)'.length);
  return n;
}

function textStoredAirtableNames(fields = BYRA_PROFIL_FIELDS) {
  return fields
    .filter((f) => (
      f.type === 'text'
      || f.type === 'multiline'
      || f.type === 'multiselect'
      || f.type === 'bolagsformer'
      || f.type === 'branscher'
      || f.type === 'hogrisk-branscher'
    ))
    .map((f) => f.airtable);
}

function fieldsNeedingTextConversion(airtableFields, fields = BYRA_PROFIL_FIELDS) {
  const textNames = new Set(textStoredAirtableNames(fields));
  return (airtableFields || []).filter((f) => {
    const name = (f.name || '').trim();
    if (!textNames.has(name) && !textNames.has(originalNameFromLegacy(name))) return false;
    if (isLegacySelectName(name) && (f.type === 'singleSelect' || f.type === 'multipleSelects')) {
      return false;
    }
    return f.type === 'singleSelect' || f.type === 'multipleSelects';
  });
}

function selectChoicesByAirtableName(fields = BYRA_PROFIL_FIELDS) {
  const map = new Map();
  fields.forEach((f) => {
    if (f.type === 'select' && Array.isArray(f.choices) && f.choices.length) {
      map.set(f.airtable, f.choices.slice());
    }
  });
  return map;
}

function missingSelectChoices(airtableField, neededNames) {
  const existing = ((airtableField && airtableField.options && airtableField.options.choices) || [])
    .map((c) => String((c && c.name) || '').trim())
    .filter(Boolean);
  const have = new Set(existing.map((n) => n.toLowerCase()));
  return (neededNames || []).filter((name) => name && !have.has(String(name).trim().toLowerCase()));
}

function mergedSelectChoiceOptions(airtableField, neededNames) {
  const existing = ((airtableField && airtableField.options && airtableField.options.choices) || [])
    .filter((c) => c && String(c.name || '').trim());
  const missing = missingSelectChoices(airtableField, neededNames);
  return [...existing, ...missing.map((name) => ({ name }))];
}

function normalizeProfilValue(raw) {
  if (raw == null) return '';
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  }
  return raw;
}

function foldBetalningsmonsterToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function betalningsmonsterLookup(choices = CHOICE_BETALNINGSMONSTER) {
  const map = new Map();
  (choices || []).forEach((choice) => {
    const label = String(choice || '').trim();
    if (!label) return;
    map.set(foldBetalningsmonsterToken(label), label);
  });
  Object.entries(BETALNINGSMONSTER_ALIASES).forEach(([alias, canonical]) => {
    if (!(choices || []).includes(canonical)) return;
    map.set(foldBetalningsmonsterToken(alias), canonical);
  });
  return map;
}

const BETALNINGSMONSTER_PROSE_RE = /\b(är|ar|vanligast|vanliga|vanligt|hos|kunderna|typiska|främst|framst|mest|oftast|beskriv)\b/i;

function looksLikeBetalningsmonsterList(parts, lookup) {
  if (!parts.length) return false;
  const conjunctionRe = /\b(och|eller|samt|i|hos|med|via)\b/i;
  return parts.every((part) => {
    const key = foldBetalningsmonsterToken(part);
    if (lookup.has(key)) return true;
    // Egna alternativ: korta etiketter utan meningsbyggnad
    if (conjunctionRe.test(part) || BETALNINGSMONSTER_PROSE_RE.test(part)) return false;
    const words = part.split(/\s+/).filter(Boolean);
    return part.length <= 40 && words.length <= 3;
  });
}

/**
 * Tolkar lagrat betalningsmönster (fritext eller kommaseparerad lista) till etiketter.
 * Bakåtkompatibelt: "Faktura och Swish är vanligast." → ["Faktura", "Swish"].
 */
function parseBetalningsmonster(raw, choices = CHOICE_BETALNINGSMONSTER) {
  const text = Array.isArray(raw)
    ? raw.map((v) => String(v || '').trim()).filter(Boolean).join(', ')
    : String(raw == null ? '' : raw).trim();
  if (!text) return [];

  const lookup = betalningsmonsterLookup(choices);
  const parts = text.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);

  if (looksLikeBetalningsmonsterList(parts, lookup)) {
    const out = [];
    const seen = new Set();
    parts.forEach((part) => {
      const canon = lookup.get(foldBetalningsmonsterToken(part)) || part;
      const key = foldBetalningsmonsterToken(canon);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(canon);
    });
    return out;
  }

  const foldedHaystack = foldBetalningsmonsterToken(text);
  const selected = [];
  const seen = new Set();
  const matchKeys = [...lookup.entries()].sort((a, b) => b[0].length - a[0].length);
  matchKeys.forEach(([fold, canon]) => {
    const key = foldBetalningsmonsterToken(canon);
    if (!fold || !key || seen.has(key)) return;
    if (!foldedHaystack.includes(fold)) return;
    seen.add(key);
    selected.push(canon);
  });

  let remainder = text;
  const removeLabels = new Set();
  selected.forEach((label) => removeLabels.add(String(label).toLowerCase()));
  Object.entries(BETALNINGSMONSTER_ALIASES).forEach(([alias, canonical]) => {
    if (selected.includes(canonical)) removeLabels.add(String(alias).toLowerCase());
  });
  [...removeLabels]
    .sort((a, b) => b.length - a.length)
    .forEach((label) => {
      remainder = remainder.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
    });
  const fillerFolds = new Set([
    'och', 'eller', 'samt', 'ar', 'vanligast', 'vanliga', 'vanligt', 'hos', 'kunderna',
    'typiska', 'framst', 'mest', 'oftast', 'i', 'butik', 'ovrigt', 'ovrig',
    'via', 'med', 'av', 'den', 'det', 'de', 'en', 'ett', 'som', 'for', 'till', 'fran',
    'pa', 'om', 'att', 'sa', 'bara', 'ocksa', 'mm'
  ]);
  remainder = remainder
    .split(/[^a-zA-ZåäöÅÄÖ0-9]+/)
    .map((tok) => String(tok || '').trim())
    .filter((tok) => {
      if (!tok || tok.length < 2) return false;
      const fold = foldBetalningsmonsterToken(tok);
      return !fillerFolds.has(fold) && !fillerFolds.has(tok.toLowerCase());
    })
    .join(' ')
    .trim();

  if (selected.length) {
    if (remainder.length >= 3) {
      selected.push(remainder.charAt(0).toUpperCase() + remainder.slice(1));
    }
    return selected;
  }
  return [text];
}

function formatBetalningsmonster(selected) {
  const list = Array.isArray(selected) ? selected : parseBetalningsmonster(selected);
  return list.map((s) => String(s || '').trim()).filter(Boolean).join(', ');
}

function normalizeBetalningsmonsterValue(raw, choices = CHOICE_BETALNINGSMONSTER) {
  return formatBetalningsmonster(parseBetalningsmonster(raw, choices));
}


function selectedValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function valueIncludesChoice(value, choice) {
  const target = String(choice || '').trim().toLowerCase();
  if (!target) return false;
  return selectedValues(value).some((v) => v.toLowerCase() === target);
}

function mapProfilFromAirtable(fields) {
  const f = fields || {};
  const out = {};
  BYRA_PROFIL_FIELDS.forEach((def) => {
    let raw = f[def.airtable];
    if (raw == null || raw === '') {
      raw = f[legacySelectName(def.airtable)] ?? f[`${def.airtable} (singleSelect-legacy)`];
    }
    let normalized = normalizeProfilValue(raw);
    if (def.key === 'leveranssatt') {
      normalized = normalizeLeveranssatt(normalized);
    } else if (def.key === 'betalningsmonster' && normalized) {
      normalized = normalizeBetalningsmonsterValue(normalized, def.choices || CHOICE_BETALNINGSMONSTER);
    }
    out[def.key] = normalized;
  });
  // Bakåtkompatibla alias
  if (!out.andelInternationellHandel && f['Andel internationell handel'] != null) {
    out.andelInternationellHandel = f['Andel internationell handel'];
  }
  return out;
}

function isHogriskAnswered(value) {
  const raw = value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value).trim();
  if (!raw) return false;
  if (raw === HOGRISK_NONE_LABEL) return true;
  return parseBolagsformer(raw).some((r) => r.form && String(r.count || '').trim() !== '');
}

function isAnsweredValue(value, field) {
  if (field && (field.type === 'bolagsformer' || field.type === 'branscher')) {
    return isBolagsformerAnswered(value);
  }
  if (field && (field.type === 'hogrisk-branscher' || field.key === 'branscherKundstock')) {
    return isHogriskAnswered(value);
  }
  if (value == null) return false;
  if (Array.isArray(value)) return value.some((v) => String(v || '').trim());
  return String(value).trim() !== '';
}

function isFieldRequired(field, profil) {
  if (!field) return false;
  if (field.requiredWhen && field.requiredWhen.key) {
    return valueIncludesChoice((profil || {})[field.requiredWhen.key], field.requiredWhen.equals);
  }
  return !field.optional;
}

function unansweredKeys(profil, fields = BYRA_PROFIL_FIELDS) {
  const p = profil || {};
  return fields.filter((f) => isFieldRequired(f, p) && !isAnsweredValue(p[f.key], f)).map((f) => f.key);
}

function isProfilComplete(profil, fields = BYRA_PROFIL_FIELDS) {
  return unansweredKeys(profil, fields).length === 0;
}

function formatProfilPromptBlock(profil) {
  const p = profil || {};
  const lines = ['BYRÅPROFIL (för kalibrering av risknivåer):'];
  BYRA_PROFIL_FIELDS.forEach((f) => {
    if (f.optional && !isFieldRequired(f, p) && !isAnsweredValue(p[f.key])) return;
    const v = p[f.key];
    const shown = isAnsweredValue(v) ? (Array.isArray(v) ? v.join(', ') : String(v)) : '–';
    const suffix = f.type === 'percent' && isAnsweredValue(v) && !String(v).includes('%') ? '%' : '';
    lines.push(`- ${f.label}: ${shown}${suffix}`);
  });
  return lines.join('\n');
}


/** Sektioner i byråprofilen som är relevanta för sidan Vilka är våra kunder. */
const KUNDER_PAGE_PROFIL_SECTION_IDS = ['kundstock', 'geografi', 'kundintro'];

function formatCountedListDisplay(value) {
  const rows = parseBolagsformer(value);
  if (!rows.length) {
    const raw = value == null ? '' : String(value).trim();
    return raw || '';
  }
  return rows
    .map((r) => {
      const form = String((r && r.form) || '').trim();
      const count = String((r && r.count) || '').trim();
      if (!form) return '';
      return count ? `${form} · ${count}` : form;
    })
    .filter(Boolean)
    .join(', ');
}

function formatProfilDisplayValue(field, value) {
  if (!isAnsweredValue(value, field)) return '';
  if (field && (field.key === 'branscherKundstock' || field.type === 'hogrisk-branscher')) {
    const raw = value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value).trim();
    if (raw === HOGRISK_NONE_LABEL) return HOGRISK_NONE_LABEL;
    return formatCountedListDisplay(raw) || raw;
  }
  if (field && (field.type === 'bolagsformer' || field.type === 'branscher' || field.key === 'kundernasBranscher')) {
    return formatCountedListDisplay(value) || String(value).trim();
  }
  if (field && (field.key === 'betalningsmonster' || (field.type === 'multiselect' && field.allowCustom))) {
    return parseBetalningsmonster(value, field.choices || CHOICE_BETALNINGSMONSTER).join(' · ');
  }
  if (field && field.type === 'percent') {
    const s = String(value).trim();
    return s.includes('%') ? s : `${s} %`;
  }
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  return String(value).trim();
}

function companionAntalField(field, sectionFields) {
  if (!field) return null;
  return (
    (sectionFields || []).find(
      (f) =>
        f &&
        f.requiredWhen &&
        f.requiredWhen.key === field.key &&
        f.type === 'number' &&
        /antal/i.test(f.key)
    ) || null
  );
}

/**
 * Read-only sammanfattning av enkät-svar för sidan Vilka är våra kunder.
 * Visar endast ifyllda fält; antal-följdfrågor slås ihop med Ja/Nej-svaret.
 */
function buildKunderEnkatSummary(profil, opts = {}) {
  const p = profil || {};
  const sectionIds =
    Array.isArray(opts.sectionIds) && opts.sectionIds.length ? opts.sectionIds : KUNDER_PAGE_PROFIL_SECTION_IDS;
  const groups = [];
  let answeredCount = 0;

  sectionIds.forEach((sectionId) => {
    const section = BYRA_PROFIL_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    const sectionFields = fieldsForSection(sectionId);
    const items = [];
    const mergedAntalKeys = new Set();

    sectionFields.forEach((field) => {
      if (!field || mergedAntalKeys.has(field.key)) return;
      if (field.requiredWhen) return;

      const antalField = companionAntalField(field, sectionFields);
      if (antalField) mergedAntalKeys.add(antalField.key);

      if (!isAnsweredValue(p[field.key], field)) return;

      let display = formatProfilDisplayValue(field, p[field.key]);
      if (antalField && isAnsweredValue(p[antalField.key], antalField)) {
        const n = String(p[antalField.key]).trim();
        display = `${display} · ca ${n}`;
      }

      items.push({
        key: field.key,
        label: field.label,
        display
      });
      answeredCount += 1;
    });

    if (items.length) {
      groups.push({
        id: section.id,
        title: section.title,
        items
      });
    }
  });

  return {
    hasAnswers: answeredCount > 0,
    answeredCount,
    groups,
    enkateHref: 'byra-profil-enkate.html?section=kundstock'
  };
}

function stripBolagsformArticle(name) {
  return String(name || '')
    .trim()
    .replace(/^(en|ett)\s+/i, '')
    .trim();
}

function matchBolagsform(name, choices = CHOICE_BOLAGSFORMER) {
  const cleaned = stripBolagsformArticle(name);
  if (!cleaned) return '';
  const key = cleaned.toLowerCase();
  if (BOLAGSFORM_ALIASES[key]) return BOLAGSFORM_ALIASES[key];
  const exact = (choices || []).find((c) => String(c).toLowerCase() === key);
  return exact || cleaned;
}

function parseBolagsformer(value) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return [];
  const parts = raw.split(/[,;|]/).flatMap((part) => {
    const text = String(part || '').trim();
    if (!text) return [];
    if (/:\s*\d+\s*$/.test(text)) return [text];
    return text.split(/\s+och\s+/i).map((s) => s.trim()).filter(Boolean);
  });
  const seen = new Map();
  parts.forEach((part) => {
    const counted = String(part).trim().match(/^(.+?):\s*(\d+)\s*$/);
    const form = matchBolagsform(counted ? counted[1] : part);
    if (!form) return;
    const count = counted ? counted[2] : '';
    const key = form.toLowerCase();
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, { form, count });
      return;
    }
    if (!prev.count && count) prev.count = count;
  });
  return Array.from(seen.values());
}

function formatBolagsformer(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((r) => {
      const form = String((r && r.form) || '').trim();
      if (!form) return '';
      const count = String((r && r.count) || '').trim();
      return count ? `${form}: ${count}` : form;
    })
    .filter(Boolean)
    .join(', ');
}

function isBolagsformerAnswered(value) {
  const rows = parseBolagsformer(value);
  return rows.some((r) => r.form && String(r.count || '').trim() !== '');
}

module.exports = {
  BYRA_PROFIL_FIELDS,
  BYRA_PROFIL_SECTIONS,
  KUNDER_PAGE_PROFIL_SECTION_IDS,
  HOGRISK_NONE_LABEL,
  COMMON_KUND_BRANSCHER,
  CHOICE_BOKFORINGSSYSTEM,
  CHOICE_BOKSLUTSSYSTEM,
  CHOICE_KUNDHANTERINGSSYSTEM,
  CHOICE_LEVERANS,
  LEVERANS_LEGACY_MAP,
  normalizeLeveranssatt,
  isLeveransEndastDistans,
  isLeveransFramstFysiskt,
  isLeveransBlandad,
  isLeveransMedDistans,
  CHOICE_BETALNINGSMONSTER,
  fieldsForSection,
  airtableEnsureSpecs,
  airtableTypeForField,
  mapProfilFromAirtable,
  isAnsweredValue,
  isFieldRequired,
  unansweredKeys,
  isProfilComplete,
  formatProfilPromptBlock,
  formatProfilDisplayValue,
  buildKunderEnkatSummary,
  selectedValues,
  valueIncludesChoice,
  normalizeProfilValue,
  parseBetalningsmonster,
  formatBetalningsmonster,
  normalizeBetalningsmonsterValue,
  CHOICE_BOLAGSFORMER,
  matchBolagsform,
  parseBolagsformer,
  formatBolagsformer,
  isBolagsformerAnswered,
  isHogriskAnswered,
  isBlankWriteValue,
  toTextOrNull,
  toNumberOrNull,
  sanitizeAirtablePatchFields,
  coerceLegacyTextNumberValue,
  LEGACY_TEXT_NUMBER_AIRTABLE_FIELDS,
  buildProfilAirtableFields,
  textStoredAirtableNames,
  fieldsNeedingTextConversion,
  selectChoicesByAirtableName,
  missingSelectChoices,
  mergedSelectChoiceOptions,
  LEGACY_SELECT_SUFFIX,
  legacySelectName,
  isLegacySelectName,
  originalNameFromLegacy
};
