/**
 * Kundens riskprofil: beräknad residual (startpunkt) + byråns bedömda residual.
 * Inneboende risk sätts på tjänster/riskfaktorer, inte som ett separat kundval.
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
    ATGARDER: 'Atgarder riskbedomning',
    FORESLAGEN: 'Kund föreslagen nivå',
    DRIVANDE: 'Kund föreslagen drivande faktor',
    AVVIKELSE: 'Kund avvikelse motivering'
  };

  var SAMMANTAGEN_RE = /den\s+sammantagna\s+riskbedömningen\s+är|sammantagen\s+riskbedömning\s+är|den\s+sammanlagda\s+risk(?:nivån|bedömningen)\s+är/i;

  var AI_RULES = `KUNDENS RISKPROFIL — beräknad residual + byråns bedömda risk:
- Föreslå INTE residualRiskprofil eller bedömdRisk. Den maskinella startpunkten är den beräknade residualnivån (högsta residual-S×K bland valda tjänster och riskfaktorer).
- Residual/bedömd risk är CFA:s aktiva val. Du får inte själv besluta att avvika från förslaget.
- Inneboende risk finns bara på tjänster och riskfaktorer — inte som ett separat kundval.
- riskbedomning (motivering) ska beskriva VILKA faktorer som identifierats och VARFÖR de är riskhöjande eller risksänkande. Avsluta INTE med en sammanfattande nivåmening.
- FÖRBJUDET i riskbedomning: "den sammantagna riskbedömningen är [nivå]", "sammanlagd risknivå är", eller liknande.
- Om användaren redan har avvikit från den beräknade residualen: du får hjälpa till att formulera avvikelseMotivering utifrån det användaren redan skrivit. Hitta inte på en avvikelse.`;

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

  function readBedomd(fields) {
    return readResidual(fields);
  }

  function readMotivering(fields) {
    return fieldStr(fields, FIELDS.MOTIVERING);
  }

  function hasExplicitProfiles(fields) {
    return !!readResidual(fields);
  }

  function isPublicerbar(fields) {
    if (!fields) return false;
    if (fields['Flik klar - Riskbedömning'] === true) return true;
    if (fields['Flik klar - Riskbedömning'] === false) return false;
    return hasExplicitProfiles(fields);
  }

  function needsLegacyReview() {
    return false;
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
      ? 'Motiveringen innehåller en sammanfattande nivåmening. Nivån ska bara väljas som bedömd residualrisk.'
      : '';
  }

  function readAtgarder(fields) {
    return fieldStr(fields, FIELDS.ATGARDER);
  }

  function readForeslagen(fields) {
    return labelOf(fieldStr(fields, FIELDS.FORESLAGEN));
  }

  function readDrivande(fields) {
    return fieldStr(fields, FIELDS.DRIVANDE);
  }

  function readAvvikelseMotivering(fields) {
    return fieldStr(fields, FIELDS.AVVIKELSE);
  }

  function residualProductOf(item) {
    if (!item) return null;
    if (item.residualProduct != null && isFinite(Number(item.residualProduct))) {
      return Number(item.residualProduct);
    }
    if (item.product != null && item.kind !== 'tjänst' && item.source === 'residual') {
      return Number(item.product);
    }
    var assessed = RiskSkala
      ? RiskSkala.assessRisk(item.sannolikhetEfter, item.konsekvensEfter)
      : null;
    return assessed && assessed.product != null ? assessed.product : null;
  }

  function formatDrivandeFaktor(kind, namn, product) {
    var prefix = kind === 'tjänst' ? 'tjänst' : 'riskfaktor';
    var name = trimStr(namn) || 'okänd post';
    var sxk = product != null && isFinite(product) ? ' (residual S×K ' + product + ')' : '';
    return prefix + ': ' + name + sxk;
  }

  function collectResidualItems(kund) {
    var src = kund && typeof kund === 'object' ? kund : {};
    var items = [];
    function push(kind, raw) {
      (Array.isArray(raw) ? raw : []).forEach(function (item) {
        if (!item) return;
        var product = residualProductOf(item);
        if (product == null) return;
        var level = labelOf(item.residualLevel || item.residualrisk || item.residual || '');
        if (!level && RiskSkala && RiskSkala.levelFromProduct) {
          var mapped = RiskSkala.levelFromProduct(product);
          level = mapped && mapped.label ? mapped.label : '';
        }
        items.push({
          kind: item.kind || kind,
          namn: trimStr(item.namn || item.titel || item.title || item.Riskfaktor || ''),
          product: product,
          level: level
        });
      });
    }
    push('tjänst', src.tjanster || src.tjansterValda);
    push('riskfaktor', src.riskfaktorer || src.risker);
    return items;
  }

  function beraknaForeslagenNiva(kund) {
    var items = collectResidualItems(kund);
    var best = null;
    items.forEach(function (item) {
      if (!best || item.product > best.product) best = item;
    });
    if (!best) {
      return {
        niva: '',
        product: null,
        drivandeFaktor: '',
        drivande: null,
        poster: items
      };
    }
    var mapped = RiskSkala && RiskSkala.levelFromProduct
      ? RiskSkala.levelFromProduct(best.product)
      : null;
    var niva = (mapped && mapped.label) || best.level || '';
    return {
      niva: niva,
      product: best.product,
      drivandeFaktor: formatDrivandeFaktor(best.kind, best.namn, best.product),
      drivande: best,
      poster: items
    };
  }

  function itemsFromTjanstRecords(records) {
    return (Array.isArray(records) ? records : []).map(function (r) {
      var f = (r && r.fields) || r || {};
      var scored = RiskSkala && RiskSkala.readTjanstRisk ? RiskSkala.readTjanstRisk(f) : {};
      return {
        kind: 'tjänst',
        namn: trimStr(f['Task Name'] || f.namn || (r && r.namn) || ''),
        residualProduct: scored.residualProduct,
        residualLevel: scored.residualLevel,
        sannolikhetEfter: scored.sannolikhetEfter,
        konsekvensEfter: scored.konsekvensEfter
      };
    });
  }

  function itemsFromRiskRecords(records) {
    return (Array.isArray(records) ? records : []).map(function (r) {
      var f = (r && r.fields) || r || {};
      var scored = RiskSkala && RiskSkala.readOvrigRisk ? RiskSkala.readOvrigRisk(f) : {};
      return {
        kind: 'riskfaktor',
        namn: trimStr(f.Riskfaktor || f['Riskfaktor'] || f.namn || (r && r.namn) || ''),
        residualProduct: scored.residualProduct,
        residualLevel: scored.residualLevel,
        sannolikhetEfter: scored.sannolikhetEfter,
        konsekvensEfter: scored.konsekvensEfter
      };
    });
  }

  function recordIdOf(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    return trimStr(value.id || value.recId);
  }

  function indexRecordsById(records) {
    var map = {};
    (Array.isArray(records) ? records : []).forEach(function (r) {
      if (r && r.id) map[r.id] = r;
    });
    return map;
  }

  function foreslagenFromLinkedRecords(fields, tjanstRecords, riskRecords) {
    var f = fields || {};
    var tjanstIds = Array.isArray(f['Kundens utvalda tjänster']) ? f['Kundens utvalda tjänster'] : [];
    var linked = Array.isArray(f['risker kopplat till tjänster']) ? f['risker kopplat till tjänster'] : [];
    var tjanstSet = {};
    tjanstIds.forEach(function (id) {
      var key = recordIdOf(id);
      if (key) tjanstSet[key] = true;
    });
    var tjanstById = indexRecordsById(tjanstRecords);
    var riskById = indexRecordsById(riskRecords);
    var tjanster = tjanstIds.map(function (id) { return tjanstById[recordIdOf(id)]; }).filter(Boolean);
    var risker = linked
      .map(recordIdOf)
      .filter(function (id) { return id && !tjanstSet[id]; })
      .map(function (id) { return riskById[id]; })
      .filter(Boolean);
    return beraknaForeslagenNiva({
      tjanster: itemsFromTjanstRecords(tjanster),
      riskfaktorer: itemsFromRiskRecords(risker)
    });
  }

  function residualAvvikerFranForeslagen(residual, suggested) {
    var r = labelOf(residual);
    var s = labelOf(suggested);
    return !!(r && s && r !== s);
  }

  function avvikelseRiktning(residual, suggested) {
    if (!residualAvvikerFranForeslagen(residual, suggested)) return '';
    var r = rankOf(residual);
    var s = rankOf(suggested);
    if (r > s) return 'skärpt';
    if (r < s) return 'lättat';
    return '';
  }

  function canSaveResidual(residual, suggested, avvikelseMotivering) {
    if (!residualAvvikerFranForeslagen(residual, suggested)) {
      return { ok: true, required: false };
    }
    if (trimStr(avvikelseMotivering)) {
      return { ok: true, required: true };
    }
    return {
      ok: false,
      required: true,
      error: 'Motivering till avvikelse från beräknad nivå krävs innan ändringen kan sparas.'
    };
  }

  function writeForeslagenFields(result) {
    var calc = result || {};
    var out = {};
    out[FIELDS.FORESLAGEN] = calc.niva || null;
    out[FIELDS.DRIVANDE] = calc.drivandeFaktor || '';
    return out;
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
    return 'Bedömd residual (' + residual + ') ligger under ' + tjanst + ' (' + floor.level + '). Det är tillåtet men ska vara ett medvetet val.';
  }

  function normalizeAiPayload(raw, opts) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var suggested = labelOf((opts && opts.foreslagenNiva) || src.foreslagenNiva);
    var motivering = trimStr(src.riskbedomning || src.kundRiskMotivering || src.motivering);
    var atgarder = trimStr(src.atgarder);
    var avvikelseMotivering = trimStr(src.avvikelseMotivering || src.kundAvvikelseMotivering);
    var slutsats = hasSammantagenSlutsats(motivering);
    if (slutsats) motivering = stripSammantagenSlutsats(motivering);
    var floor = (opts && opts.tjanstFloor) || { level: '', namn: '' };
    return {
      foreslagenNiva: suggested,
      riskbedomning: motivering,
      kundRiskMotivering: motivering,
      atgarder: atgarder,
      avvikelseMotivering: avvikelseMotivering,
      harSammantagenSlutsats: slutsats,
      slutsatsVarning: slutsats ? slutsatsVarning(src.riskbedomning || src.kundRiskMotivering || motivering) : '',
      tjanstResidualFloor: floor.level || '',
      tjanstResidualNamn: floor.namn || '',
      residualUnderTjanstegolv: residualBelowFloor(suggested, floor.level),
      tjanstGolvVarning: floorWarning(suggested, floor)
    };
  }

  var api = {
    FIELDS: FIELDS,
    SAMMANTAGEN_RE: SAMMANTAGEN_RE,
    AI_RULES: AI_RULES,
    readInneboende: readInneboende,
    readResidual: readResidual,
    readBedomd: readBedomd,
    readMotivering: readMotivering,
    readAtgarder: readAtgarder,
    readForeslagen: readForeslagen,
    readDrivande: readDrivande,
    readAvvikelseMotivering: readAvvikelseMotivering,
    beraknaForeslagenNiva: beraknaForeslagenNiva,
    itemsFromTjanstRecords: itemsFromTjanstRecords,
    itemsFromRiskRecords: itemsFromRiskRecords,
    foreslagenFromLinkedRecords: foreslagenFromLinkedRecords,
    formatDrivandeFaktor: formatDrivandeFaktor,
    residualAvvikerFranForeslagen: residualAvvikerFranForeslagen,
    avvikelseRiktning: avvikelseRiktning,
    canSaveResidual: canSaveResidual,
    writeForeslagenFields: writeForeslagenFields,
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
