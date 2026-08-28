/**
 * Två geografiska riskfaktortyper i databasen:
 * - byråns kunder / hemvist (statisk identitetsrisk)
 * - kundens kunder & leverantörer (dynamisk affärs-/transaktionsrisk)
 */
(function (global) {
  var TYP_BYRA = 'Geografisk riskfaktorer - här finns byråns kunder';
  var TYP_MOTPART = 'Geografisk riskfaktorer - här finns kundens kunder & leverantörer';
  var TYP_LEGACY = 'Geografiska riskfaktorer';

  var DIM_BYRA = 'geografiska';
  var DIM_MOTPART = 'geografiska_motparter';

  var MOTPART_NAME_RE = [
    /^närområde$/i,
    /^naromrade$/i,
    /^europa$/i,
    /utanför\s*eu/i,
    /utanfor\s*eu/i,
    /hög\s*korruption/i,
    /hog\s*korruption/i,
    /svag\s*kontroll/i,
    /kunder\s*&\s*leverant/i,
    /kunder\s+och\s+leverant/i,
    /kundens\s+kunder/i,
    /leverantörer\s+finns/i,
    /leverantorer\s+finns/i
  ];

  var BYRA_NAME_RE = [
    /hemvist/i,
    /utsatt\s+område/i,
    /utsatt\s+omrade/i,
    /byråns\s+kund/i,
    /byrans\s+kund/i
  ];

  function trimStr(value) {
    return value == null ? '' : String(value).trim();
  }

  function fold(value) {
    return trimStr(value)
      .toLowerCase()
      .normalize('NFC')
      .replace(/\s+/g, ' ');
  }

  function isGeoTyp(typ) {
    var key = fold(typ);
    if (!key) return false;
    return key === fold(TYP_BYRA)
      || key === fold(TYP_MOTPART)
      || key === fold(TYP_LEGACY)
      || key.indexOf('geograf') !== -1;
  }

  function classifyNamn(namn) {
    var raw = trimStr(namn);
    if (!raw) return DIM_BYRA;
    for (var i = 0; i < BYRA_NAME_RE.length; i += 1) {
      if (BYRA_NAME_RE[i].test(raw)) return DIM_BYRA;
    }
    for (var j = 0; j < MOTPART_NAME_RE.length; j += 1) {
      if (MOTPART_NAME_RE[j].test(raw)) return DIM_MOTPART;
    }
    return DIM_BYRA;
  }

  function typForDimension(dimId) {
    if (dimId === DIM_MOTPART) return TYP_MOTPART;
    return TYP_BYRA;
  }

  function dimensionForTyp(typ) {
    var key = fold(typ);
    if (key === fold(TYP_MOTPART)) return DIM_MOTPART;
    if (key === fold(TYP_BYRA) || key === fold(TYP_LEGACY) || key.indexOf('geograf') !== -1) {
      return DIM_BYRA;
    }
    return '';
  }

  function targetTypForRecord(fields) {
    var f = fields || {};
    var namn = f.Riskfaktor || f['Riskfaktor'] || f.namn || '';
    return typForDimension(classifyNamn(namn));
  }

  function needsTypMigration(fields) {
    var f = fields || {};
    var current = trimStr(f['Typ av riskfaktor']);
    if (!isGeoTyp(current)) return false;
    return fold(current) !== fold(targetTypForRecord(f));
  }

  var api = {
    TYP_BYRA: TYP_BYRA,
    TYP_MOTPART: TYP_MOTPART,
    TYP_LEGACY: TYP_LEGACY,
    DIM_BYRA: DIM_BYRA,
    DIM_MOTPART: DIM_MOTPART,
    isGeoTyp: isGeoTyp,
    classifyNamn: classifyNamn,
    typForDimension: typForDimension,
    dimensionForTyp: dimensionForTyp,
    targetTypForRecord: targetTypForRecord,
    needsTypMigration: needsTypMigration
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.GeoRiskTyper = api;
})(typeof window !== 'undefined' ? window : globalThis);
