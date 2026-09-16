/**
 * Mappar aggregerad kundstatistik från Clientflow till byråprofil-enkätfält.
 * Används så att byrån kan fylla statistiska frågor automatiskt istället för manuellt.
 */

const Statistik = require('./statistik-riskbedomning');
const ByraProfilFields = require('./byra-profil-fields');
const NavStatus = require('./nav-status');
const KundBranschAggregat = require('../public/js/kund-bransch-aggregat');
const kundDold = require('./kund-dold');

const SECTION_FIELD_KEYS = {
  kundstock: [
    'antalKunder',
    'kundResidualriskFordelning',
    'vanligasteBolagsformer',
    'kundernasBranscher',
    'branscherKundstock',
    'andelHogriskbransch',
    'andelKontantintensiva',
    'komplexaAgarstrukturer',
    'komplexaAgarstrukturerAntal',
    'utlandskaAgare',
    'utlandskaAgareAntal',
    'pepKunder',
    'pepKunderAntal'
  ],
  geografi: [
    'andelInternationellHandel',
    'sanktionslander',
    'kunderIUtsattaOmraden',
    'kunderIUtsattaOmradenAntal'
  ]
};

const ALL_FILLABLE_KEYS = Object.values(SECTION_FIELD_KEYS).flat();

function percentOf(part, total) {
  const t = Number(total) || 0;
  const p = Number(part) || 0;
  if (t <= 0) return 0;
  return Math.round((p / t) * 100);
}

function jaNejFromCount(n) {
  return Number(n) > 0 ? 'Ja' : 'Nej';
}

function cleanStatLabel(raw) {
  return String(raw || '')
    .replace(/[\r\n]+/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCountedList(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return ByraProfilFields.formatBolagsformer(
    list
      .map((row) => {
        const form = ByraProfilFields.matchBolagsform(cleanStatLabel(row && row.namn));
        const antal = Number(row && row.antal);
        if (!form || !Number.isFinite(antal) || antal <= 0) return null;
        return { form, count: String(Math.round(antal)) };
      })
      .filter(Boolean)
  );
}

/** riskniva från statistik är { Låg: n, Normal: n, … } — behåll skalans ordning. */
function formatRisknivaFordelning(riskniva) {
  const bag = riskniva && typeof riskniva === 'object' ? riskniva : {};
  const levels = ByraProfilFields.CHOICE_KUND_RESIDUALRISK || [
    'Låg',
    'Normal',
    'Förhöjd',
    'Hög',
    'Oacceptabel'
  ];
  return ByraProfilFields.formatBolagsformer(
    levels
      .map((level) => {
        const antal = Number(bag[level]);
        if (!Number.isFinite(antal) || antal <= 0) return null;
        return { form: level, count: String(Math.round(antal)) };
      })
      .filter(Boolean)
  );
}

function formatHogriskBranscher(rows, totalHogriskKunder) {
  if (!Number(totalHogriskKunder)) return ByraProfilFields.HOGRISK_NONE_LABEL;
  const formatted = formatCountedList(rows);
  return formatted || ByraProfilFields.HOGRISK_NONE_LABEL;
}

function countExtras(records) {
  let kontanter = 0;
  let komplex = 0;
  let utlandska = 0;
  let internationell = 0;
  let hogrisksland = 0;
  for (const rec of records || []) {
    const f = (rec && rec.fields) || {};
    if (Statistik.customerHasKontanter(f)) kontanter += 1;
    if (Statistik.customerHasKomplexAgarstruktur(f)) komplex += 1;
    if (NavStatus.hasForeignTaxResidence(f)) utlandska += 1;
    if ((Statistik.handelslanderFromRecord(f) || []).length) internationell += 1;
    if (Statistik.customerHasHogrisksland(f)) hogrisksland += 1;
  }
  return { kontanter, komplex, utlandska, internationell, hogrisksland };
}

/**
 * Bygger profilfältvärden från aktiva kundposter.
 * @param {Array} records – aktiva kunddata-records
 * @param {{ section?: string, lookups?: object }} [opts]
 * @returns {{ fields: object, meta: object, filledKeys: string[] }}
 */
function buildProfilFranClientflow(records, opts) {
  // Defense in depth: även om anroparen skickar alla poster räknas bara pågående.
  const list = kundDold.filterAktivaKunder(Array.isArray(records) ? records : []);
  const section = opts && opts.section ? String(opts.section).trim().toLowerCase() : '';
  const allowedKeys = section && SECTION_FIELD_KEYS[section]
    ? SECTION_FIELD_KEYS[section]
    : ALL_FILLABLE_KEYS;

  const stat = Statistik.aggregateStatistik(list, (opts && opts.lookups) || {});
  const extras = countExtras(list);
  const total = Number(stat.antalKunder) || list.length;
  const pep = Number(stat.antalPepEllerSanktion) || 0;
  const hogrisk = Number(stat.antalKunderHogriskbransch) || 0;
  const utsattTrff = Number(stat.utsattOmrade && stat.utsattOmrade.antalTrff) || 0;

  const allFields = {
    antalKunder: total,
    kundResidualriskFordelning: formatRisknivaFordelning(stat.riskniva),
    vanligasteBolagsformer: formatCountedList(stat.bolagsform),
    kundernasBranscher: formatCountedList(
      KundBranschAggregat.countKundBranschBuckets(list, {
        asValues: Statistik.asValues,
        parseKycJson: Statistik.parseKycJson
      })
    ),
    branscherKundstock: formatHogriskBranscher(stat.högriskbransch, hogrisk),
    andelHogriskbransch: percentOf(hogrisk, total),
    andelKontantintensiva: percentOf(extras.kontanter, total),
    komplexaAgarstrukturer: jaNejFromCount(extras.komplex),
    komplexaAgarstrukturerAntal: extras.komplex > 0 ? extras.komplex : '',
    utlandskaAgare: jaNejFromCount(extras.utlandska),
    utlandskaAgareAntal: extras.utlandska > 0 ? extras.utlandska : '',
    pepKunder: jaNejFromCount(pep),
    pepKunderAntal: pep > 0 ? pep : '',
    andelInternationellHandel: percentOf(extras.internationell, total),
    sanktionslander: jaNejFromCount(extras.hogrisksland),
    kunderIUtsattaOmraden: jaNejFromCount(utsattTrff),
    kunderIUtsattaOmradenAntal: utsattTrff > 0 ? utsattTrff : ''
  };

  const fields = {};
  const filledKeys = [];
  allowedKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(allFields, key)) return;
    const value = allFields[key];
    // Tomma följdfrågor (antal) hoppas över när svaret är Nej
    if (value === '' || value == null) return;
    fields[key] = value;
    filledKeys.push(key);
  });

  return {
    fields,
    filledKeys,
    sectionKeys: SECTION_FIELD_KEYS,
    meta: {
      antalKunder: total,
      antalKontantintensiva: extras.kontanter,
      antalKomplexaAgarstrukturer: extras.komplex,
      antalUtlandskaAgare: extras.utlandska,
      antalInternationellHandel: extras.internationell,
      antalHogrisksland: extras.hogrisksland,
      antalPep: pep,
      antalHogriskbransch: hogrisk,
      antalUtsattaOmraden: utsattTrff,
      section: section || null
    }
  };
}

module.exports = {
  SECTION_FIELD_KEYS,
  ALL_FILLABLE_KEYS,
  buildProfilFranClientflow,
  formatCountedList,
  formatRisknivaFordelning,
  percentOf
};
