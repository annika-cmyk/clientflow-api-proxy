/**
 * Kundens riskprofil: explicit vald inneboende- och residualnivå + fritextmotivering.
 * Ingen S×K-produkt — till skillnad från tjänster och övriga riskfaktorer.
 */
(function (global) {
  var RiskSkala = (typeof module !== 'undefined' && module.exports)
    ? require('./risk-skala')
    : (global.RiskSkala || null);

  var FIELDS = {
    INNEBOENDE: 'Kund inneboende riskprofil',
    RESIDUAL: 'Riskniva',
    RESIDUAL_LEGACY: 'sammanlagd risk',
    MOTIVERING: 'Byrans riskbedomning',
    ATGARDER: 'Atgarder riskbedomning'
  };

  var SAMMANTAGEN_RE = /den\s+sammantagna\s+riskbedömningen\s+är|sammantagen\s+riskbedömning\s+är|den\s+sammanlagda\s+risk(?:nivån|bedömningen)\s+är/i;

  var AI_RULES = `KUNDENS RISKPROFIL — explicit vald nivå, inte S×K och inte en slutsatsmening:
- Föreslå inneboendeRiskprofil och residualRiskprofil som egna enum-värden: Låg, Normal, Förhöjd, Hög eller Oacceptabel.
- residualRiskprofil är risken EFTER byråns kontroller (screening, sanktionslistor, stickprov). inneboendeRiskprofil är risken i kunden/verksamheten innan de kontrollerna.
- Använd INTE sannolikhet × konsekvens. Det är metodik för tjänster och riskfaktorer, inte för kundens riskprofil.
- riskbedomning (motivering) ska beskriva VILKA faktorer som identifierats och VARFÖR de är riskhöjande eller risksänkande. Avsluta INTE med en sammanfattande nivåmening.
- FÖRBJUDET i riskbedomning: "den sammantagna riskbedömningen är [nivå]", "sammanlagd risknivå är", eller liknande. Nivån uttrycks BARA i enum-fälten.
- nivaMotivering: 1–2 meningar om VARFÖR just de två nivåerna föreslås. Den texten är hjälptext i redigeringsläget, inte kundRiskMotivering.
- Om kunden har valda tjänster: residualRiskprofil bör inte ligga under den högsta residualnivån bland de tjänsterna. Det är en rekommendation, inte ett förbud — motivera om du ändå föreslår lägre.`;

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function fieldStr(fields, key) {
    if (!fields) return '';
    return trimStr(fields[key]);
  }

  function labelOf(raw) {
    return (RiskSkala && RiskSkala.riskLabelSv(raw)) || '';
  }

  function rankOf(raw) {
    return RiskSkala ? RiskSkala.riskRank(raw) : 0;
  }

  function readInneboende(fields) {
    return labelOf(fieldStr(fields, FIELDS.INNEBOENDE));
  }

  function readResidual(fields) {
    return labelOf(fieldStr(fields, FIELDS.RESIDUAL) || fieldStr(fields, FIELDS.RESIDUAL_LEGACY) || fieldStr(fields, 'Risknivå'));
  }

  function readMotivering(fields) {
    return fieldStr(fields, FIELDS.MOTIVERING);
  }

  function hasExplicitProfiles(fields) {
    return !!(readInneboende(fields) && readResidual(fields));
  }

  function isPublicerbar(fields) {
    if (!fields) return false;
    if (fields['Flik klar - Riskbedömning'] === true) return true;
    if (fields['Flik klar - Riskbedömning'] === false) return false;
    return hasExplicitProfiles(fields);
  }

  function needsLegacyReview(fields) {
    if (readInneboende(fields)) return false;
    return !!(readResidual(fields) || readMotivering(fields) || fieldStr(fields, 'Motivering'));
  }

  function hasSammantagenSlutsats(text) {
    return SAMMANTAGEN_RE.test(trimStr(text));
  }

  function stripSammantagenSlutsats(text) {
    var raw = trimStr(text);
    if (!raw) return '';
    return raw
      .replace(/[^.?!]*den\s+sammantagna\s+riskbedömningen\s+är[^.?!]*[.?!]?/gi, ' ')
      .replace(/[^.?!]*sammantagen\s+riskbedömning\s+är[^.?!]*[.?!]?/gi, ' ')
      .replace(/[^.?!]*den\s+sammanlagda\s+risk(?:nivån|bedömningen)\s+är[^.?!]*[.?!]?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slutsatsVarning(text) {
    return hasSammantagenSlutsats(text)
      ? 'Motiveringen innehåller en sammanfattande nivåmening. Nivån ska bara väljas i fälten inneboende/residual.'
      : '';
  }

  function readAtgarder(fields) {
    return fieldStr(fields, FIELDS.ATGARDER);
  }

  function tjanstResidualFloor(items) {
    var best = { level: '', rank: 0, namn: '' };
    (Array.isArray(items) ? items : []).forEach(function (t) {
      if (!t) return;
      var level = labelOf(t.residualrisk || t.residualLevel || t.residual || '');
      var rank = rankOf(level);
      if (rank > best.rank) {
        best = { level: level, rank: rank, namn: trimStr(t.namn || t.titel || t.title || '') };
      }
    });
    return best;
  }

  function residualBelowFloor(residual, floorLevel) {
    var r = rankOf(residual);
    var f = rankOf(floorLevel);
    return r > 0 && f > 0 && r < f;
  }

  function floorWarning(residual, floor) {
    if (!floor || !floor.level || !residualBelowFloor(residual, floor.level)) return '';
    var tjanst = floor.namn ? 'tjänsten ' + floor.namn : 'en vald tjänst';
    return 'Vald residual (' + residual + ') ligger under ' + tjanst + ' (' + floor.level + '). Det är tillåtet men ska vara ett medvetet val.';
  }

  function normalizeAiPayload(raw, opts) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var inneboende = labelOf(src.inneboendeRiskprofil || src.kundInneboendeRiskprofil || src.inneboende);
    var residual = labelOf(src.residualRiskprofil || src.kundResidualRiskprofil || src.riskniva || src.residual);
    var motivering = trimStr(src.riskbedomning || src.kundRiskMotivering || src.motivering);
    var nivaMotivering = trimStr(src.nivaMotivering || src.niva_motivering);
    var atgarder = trimStr(src.atgarder);
    var slutsats = hasSammantagenSlutsats(motivering);
    if (slutsats) motivering = stripSammantagenSlutsats(motivering);
    var floor = (opts && opts.tjanstFloor) || { level: '', namn: '' };
    return {
      inneboendeRiskprofil: inneboende,
      residualRiskprofil: residual,
      kundInneboendeRiskprofil: inneboende,
      kundResidualRiskprofil: residual,
      riskniva: residual,
      riskbedomning: motivering,
      kundRiskMotivering: motivering,
      nivaMotivering: nivaMotivering,
      atgarder: atgarder,
      harSammantagenSlutsats: slutsats,
      slutsatsVarning: slutsats ? slutsatsVarning(src.riskbedomning || src.kundRiskMotivering || motivering) : '',
      tjanstResidualFloor: floor.level || '',
      tjanstResidualNamn: floor.namn || '',
      residualUnderTjanstegolv: residualBelowFloor(residual, floor.level),
      tjanstGolvVarning: floorWarning(residual, floor)
    };
  }

  var api = {
    FIELDS: FIELDS,
    SAMMANTAGEN_RE: SAMMANTAGEN_RE,
    AI_RULES: AI_RULES,
    readInneboende: readInneboende,
    readResidual: readResidual,
    readMotivering: readMotivering,
    readAtgarder: readAtgarder,
    hasExplicitProfiles: hasExplicitProfiles,
    isPublicerbar: isPublicerbar,
    needsLegacyReview: needsLegacyReview,
    hasSammantagenSlutsats: hasSammantagenSlutsats,
    stripSammantagenSlutsats: stripSammantagenSlutsats,
    slutsatsVarning: slutsatsVarning,
    tjanstResidualFloor: tjanstResidualFloor,
    residualBelowFloor: residualBelowFloor,
    floorWarning: floorWarning,
    normalizeAiPayload: normalizeAiPayload
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.KundRiskprofil = api;
})(typeof window !== 'undefined' ? window : globalThis);
