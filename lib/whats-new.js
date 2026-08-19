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
