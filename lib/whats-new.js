/**
 * Användarvända ändringar som visas överst på dashboarden.
 * Lägg en ny post när du släpper något som påverkar slutanvändaren.
 * Dashboarden visar automatiskt de 5 viktigaste från den senaste månaden.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
const DEFAULT_LIMIT = 5;

const WHATS_NEW_ENTRIES = [
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Identifierade risker pekar på källsidorna',
    summary: 'Sektion 4 i den allmänna riskbedömningen hänvisar till Byråns tjänster och Övriga riskfaktorer. Hela underlaget från de sidorna visas i Dokumentationen och i den exporterade PDF:en.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'AI föreslår TF-hot när det saknas',
    summary: 'Om en tjänst saknar TF-hot kommer AI med ett konkret TF-förslag eller en motivering, i stället för att bara lämna den gula varningen tom.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'AI visar bara riktiga ändringar',
    summary: 'Granskningen hoppar över förslag som är samma text som redan står i fältet, så du inte får kort som ser ut som ändringar men inte ändrar något.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Tydligare status när avvikelse rapporterats',
    summary: 'Statusen heter nu Rapporterad till Finanspolisen (FM) överallt. Den korta varianten Rapporterad till FM slås ihop med den längre, så det inte finns två namn för samma sak.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Redigera AI-förslag och jämför med nuvarande text',
    summary: 'När AI granskar ifyllda fält ser du nuvarande text, om förslaget ändrar eller lägger till, och kan redigera texten innan du kopierar in den.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Polisens rapporter i AML-nyheter',
    summary: 'Omvärldsbevakningar, nationella riskbedömningar och forskningsrapporter från Polisens samordning mot penningtvätt visas nu på AML-nyheter, tillsammans med Finanspolisens övriga publikationer.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Inneboende risk och residualrisk förklaras',
    summary: 'Brickorna på tjänster och övriga riskfaktorer säger nu Inneboende risk respektive Residualrisk. En kort förklaring finns i sidhuvudet, i formulären och som hjälptext när du håller musen över brickan.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'TF-täckning på varje tjänst',
    summary: 'En tjänst som ska användas i den allmänna riskbedömningen måste ha minst ett TF-hot eller en motivering till varför PT-analysen räcker. Utkast kan fortfarande sparas utan det.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'AI granskar ifyllda texter',
    summary: 'När en tjänst eller riskfaktor redan har text tittar AI på den och lämnar kommentarer. Du kan kopiera in ett ändringsförslag eller avfärda det, utan att fälten skrivs över automatiskt.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'AI-beskrivning utan byrån',
    summary: 'AI-förslag för tjänstebeskrivning och inneboende risk nämner inte längre byrån, personal eller kapacitet. Fältet beskriver bara tjänsten och risken i sig.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'AI fungerar efter Assistants-API',
    summary: 'ClientFlow-AI använder OpenAI Responses i stället för Assistants API, som stängs 26 augusti 2026. Chatten och AI-förslag fungerar som tidigare. Ett öppet chattfönster från innan bytet startar en ny konversation.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Tydligare inneboende risk i formulären',
    summary: 'Tjänst och övriga riskfaktorer använder samma typ av fält: beskrivning plus inneboende risk, utan byråns åtgärder. Åtgärderna ligger i eget fält.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Snabbare AI-förslag',
    summary: 'AI-förslag för tjänster, övriga riskfaktorer och kundrisk läser inte längre in hela kunskapsbasen. Chatten och den allmänna riskbedömningen gör det fortfarande när det behövs.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Revisionslogg på Dokumentation',
    summary: 'Ledare ser en sökbar revisionslogg per byrå: riskändringar, AI-innehåll att granska, screeningträffar och avvikelser. Loggen är append-only och bevaras även om en kund döljs.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Exportera dokument som ZIP',
    summary: 'På kundkortets Dokumentation kan du bocka i filer och ladda ner valda som ZIP. På sidan Dokumentation finns också en knapp för att exportera byråns PDF:er och alla kunddokument.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Personregister på person- och orgnr',
    summary: 'Sök företrädare och verkliga huvudmän på personnummer eller organisationsnummer, även på dolda och avslutade kunder, och se bolag och uppdrag de senaste fem åren.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'S×K på övriga riskfaktorer',
    summary: 'Övriga riskfaktorer bedöms med sannolikhet och konsekvens (1–5). Inneboende risk och residualrisk efter åtgärd räknas som S×K, och PT/TF-relevans syns i listan och exporten.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Sannolikhet och konsekvens på byråns tjänster',
    summary: 'Risknivån för en tjänst räknas som S×K. Du sätter sannolikhet och konsekvens (1–5) och får inneboende risk samt residualrisk efter åtgärder.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Nya risknivåer går att spara',
    summary: 'Förhöjd, Normal och Oacceptabel kan sparas på tjänster, övriga riskfaktorer och kund. Tidigare fanns bara de gamla valen i underlaget.'
  },
  {
    date: '2026-08-21',
    importance: 2,
    title: 'Skriv in datum med tangenterna',
    summary: 'Datumfält som Utförd datum på KYC kan skrivas som ÅÅÅÅ-MM-DD. Kalendern finns kvar bredvid.'
  },
  {
    date: '2026-08-21',
    importance: 2,
    title: 'Aktuella körningar överst på kundkortet',
    summary: 'På fliken Uppdrag ligger aktuella körningar ovanför listan med alla uppdrag.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Datum för uppdragsavtal utanför ClientFlow',
    summary: 'När uppdragsavtalet finns utanför ClientFlow kan du ange avtalsdatum direkt i rutan på kundkortet.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Egna uppdrag och fler frekvenser',
    summary: 'På kundkortet kan du lägga upp uppdrag i fritext när standardtyperna inte räcker. Frekvensen kan vara veckovis eller engång.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Dra in dokument på kundkortet',
    summary: 'På fliken Dokumentation kan du släppa filer på en kategori eller öppna uppladdningen genom att släppa dem i fliken.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Byt namn och kategori på dokument',
    summary: 'På fliken Dokumentation kan du byta visningsnamn och flytta filer mellan kategorier, inklusive Dokumentation - historik.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Rätt start och deadline på årsvisa körningar',
    summary: 'Bokslut och deklaration flyttar startdatum ett år fram, inte till föregående deadline. Försenade körningar syns före nästa års.'
  },
  {
    date: '2026-08-21',
    importance: 2,
    title: 'Datum för KYC utanför ClientFlow',
    summary: 'När KYC finns utanför ClientFlow kan du ange utförd-datum direkt i rutan på kundkortet.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Förhandsgranska dokument på kundkortet',
    summary: 'På fliken Dokumentation kan du öppna PDF och bilder i en förhandsvisning utan att ladda ner dem.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Femgradig riskskala',
    summary: 'Tjänster, övriga riskfaktorer, kund och byrå använder samma skala: Låg, Normal, Förhöjd, Hög och Oacceptabel. Tidigare Medel visas som Normal.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Statistik i den allmänna riskbedömningen',
    summary: 'Dokumentationssidan och den exporterade PDF:en visar byråns kundstatistik. Siffrorna syns inte på redigeringssidan.'
  },
  {
    date: '2026-08-21',
    importance: 2,
    title: 'Snabbare uppdatering från Bolagsverket',
    summary: 'När du klickar Uppdatera på kundkortet är alla förändringar redan ibockade, så du kan spara direkt.'
  },
  {
    date: '2026-08-20',
    importance: 3,
    title: 'Dokumentation - historik på kundkortet',
    summary: 'Filer i Airtable-fältet Dokumentation - historik syns nu som en egen sektion under fliken Dokumentation.'
  },
  {
    date: '2026-08-19',
    importance: 2,
    title: 'Skicka feedback från dashboarden',
    summary: 'Länken Skicka feedback öppnar ett formulär. Meddelandet går till hej@clientflow.se.'
  },
  {
    date: '2026-08-19',
    importance: 5,
    title: 'AML-nyheter på dashboarden',
    summary: 'Nyheter från bland annat AMLA, Finanspolisen, Skatteverket, SRF och Revisorsinspektionen, med AI-sammanfattningar skrivna för små redovisningsbyråer.'
  },
  {
    date: '2026-08-19',
    importance: 5,
    title: 'KYC och uppdragsavtal via Inleed',
    summary: 'Signeringslänkar syns på KYC och avtalet, mejlet går till klientansvarig och byrån syns som avsändare – utan extra lagtext i inbjudan.'
  },
  {
    date: '2026-08-19',
    importance: 4,
    title: 'Export av rutiner och riskbedömning i historik',
    summary: 'När du exporterar till PDF sparas filen i historiken med datum, så du hittar tidigare underlag till Länsstyrelsen.'
  },
  {
    date: '2026-08-19',
    importance: 4,
    title: 'Dölj kund i listan',
    summary: 'Du kan dölja en kund från kundlistan. Länken finns kvar under Dokumentation så posten inte försvinner.'
  },
  {
    date: '2026-08-18',
    importance: 4,
    title: 'Tydligare uppdrag och tidsfrister',
    summary: 'Uppdrag visar färgade tidsfrister, du kan tilldela en körning till en kollega och bara öppna perioder syns på kundkortet.'
  },
  {
    date: '2026-08-19',
    importance: 3,
    title: 'Reviderad och godkänd-datum',
    summary: 'Allmän riskbedömning visar när dokumentet senast reviderades och godkändes.'
  },
  {
    date: '2026-08-19',
    importance: 3,
    title: 'KYC-rutin och identifierade risker',
    summary: 'Kundkännedomsåtgärder visar byråns KYC-rutin, och identifierade risker hämtas live från tjänster och övriga riskfaktorer.'
  },
  {
    date: '2026-08-19',
    importance: 3,
    title: 'Varning för SNI 46872 metallskrot',
    summary: 'Kundkortet varnar när verksamheten träffar högrisk-SNI 46872 (metallskrot, SNI 2025).'
  },
  {
    date: '2026-08-19',
    importance: 3,
    title: 'Fler dokument och verksam organisation',
    summary: 'Kundkortet tar emot flera dokument i vald kategori och visar F-skatt, moms och arbetsgivare från Bolagsverket.'
  },
  {
    date: '2026-08-11',
    importance: 3,
    title: 'Enklare KYC och ifylld risk-PDF',
    summary: 'KYC-formuläret är förenklat, och riskbedömningens PDF fylls med uppgifter som redan finns i ClientFlow.'
  },
  {
    date: '2026-08-03',
    importance: 2,
    title: 'Skapa företag utan organisationsnummer',
    summary: 'På kundlistan kan du lägga upp ett företag med plusknappen även när org.nr saknas.'
  }
];

const MONTHS_SV = ['jan.', 'feb.', 'mars', 'apr.', 'maj', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];

function parseEntryDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatSvDate(iso) {
  const d = parseEntryDate(iso);
  if (!d) return '';
  return `${d.getUTCDate()} ${MONTHS_SV[d.getUTCMonth()]}`;
}

function selectWhatsNew(entries, options) {
  const now = options && options.now ? new Date(options.now) : new Date();
  const days = options && options.days != null ? Number(options.days) : DEFAULT_DAYS;
  const limit = options && options.limit != null ? Number(options.limit) : DEFAULT_LIMIT;
  const cutoff = new Date(now.getTime() - days * DAY_MS);

  return (entries || [])
    .filter((entry) => {
      if (!entry || !entry.title || !entry.summary) return false;
      const date = parseEntryDate(entry.date);
      return date && date >= cutoff && date <= now;
    })
    .sort((a, b) => {
      const ia = Number(a.importance) || 0;
      const ib = Number(b.importance) || 0;
      if (ib !== ia) return ib - ia;
      const da = parseEntryDate(a.date).getTime();
      const db = parseEntryDate(b.date).getTime();
      if (db !== da) return db - da;
      return String(a.title).localeCompare(String(b.title), 'sv');
    })
    .slice(0, Math.max(0, limit))
    .map((entry) => ({
      date: entry.date,
      dateLabel: formatSvDate(entry.date),
      title: entry.title,
      summary: entry.summary
    }));
}

function getWhatsNewPayload(options) {
  return {
    intro: 'ClientFlow är under ett intensivt utvecklingsarbete! Här listar vi de ändringar som vi gjort den senaste tiden.',
    outro: 'Testa gärna och ge oss din feedback!',
    feedbackEmail: 'hej@clientflow.se',
    items: selectWhatsNew(WHATS_NEW_ENTRIES, options)
  };
}

module.exports = {
  WHATS_NEW_ENTRIES,
  DEFAULT_DAYS,
  DEFAULT_LIMIT,
  parseEntryDate,
  formatSvDate,
  selectWhatsNew,
  getWhatsNewPayload
};
