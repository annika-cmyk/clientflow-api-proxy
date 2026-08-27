/**
 * Kundens riskprofil: beräknad residual (startpunkt) + byråns bedömda residual.
 * Inneboende risk sätts på tjänster/riskfaktorer, inte som ett separat kundval.
 */
(function (global) {
  var RiskSkala = (typeof module !== 'undefined' && module.exports)
    ? require('./risk-skala')
    : (global.RiskSkala || null);
  var RiskDimensioner = (typeof module !== 'undefined' && module.exports)
    ? require('./risk-dimensioner')
    : (global.RiskDimensioner || null);
  var TjanstForutsattning = (typeof module !== 'undefined' && module.exports)
    ? require('./tjanst-forutsattning')
    : (global.TjanstForutsattning || null);
  var OvrigaRiskKategorier = (typeof module !== 'undefined' && module.exports)
    ? require('./ovriga-risk-kategorier')
    : (global.OvrigaRiskKategorier || null);

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

  function dimensionStatusOf(fields, opts) {
    if (opts && opts.dimensionStatus) return opts.dimensionStatus;
    if (!RiskDimensioner || !RiskDimensioner.assessCustomerDimensions) return null;
    if (opts && (opts.linkedRiskRecords || opts.byraTemplates)) {
      return RiskDimensioner.assessCustomerDimensions({
        fields: fields,
        linkedRiskRecords: opts.linkedRiskRecords,
        byraTemplates: opts.byraTemplates
      });
    }
    return null;
  }

  function isPublicerbar(fields, opts) {
    if (!fields) return false;
    if (fields['Flik klar - Riskbedömning'] === false) return false;
    var flagged = fields['Flik klar - Riskbedömning'] === true || hasExplicitProfiles(fields);
    if (!flagged) return false;
    var dim = dimensionStatusOf(fields, opts);
    if (dim && dim.komplett === false) return false;
    return true;
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

  var RISKHOJANDE_DEFAULT_PRODUCT = 12;
  var RISKHOJANDE_GOLV_PRODUCT = 16;
  var STRUKTUR_FORHOJD_MIN = 10;
  var OACCEPTABEL_GOLV_PRODUCT = 20;
  var RISKHOJANDE_KLASS = {
    GOLV_HOG: 'GOLV_HOG',
    BIDRAR: 'BIDRAR_VID_KOMBINATION',
    INFORMATIV: 'INFORMATIV'
  };

  var DEFAULT_RISKHOJANDE_KATALOG = (OvrigaRiskKategorier && OvrigaRiskKategorier.defaultKatalog)
    ? OvrigaRiskKategorier.defaultKatalog()
    : {
      'Historik av brott / ekonomisk brottslighet': 'GOLV_HOG',
      'Otydlig affärsmodell': 'BIDRAR_VID_KOMBINATION',
      'Transaktioner utan tydligt syfte': 'BIDRAR_VID_KOMBINATION',
      'Svårt att bekräfta identitet': 'GOLV_HOG',
      'Svårt att få svar på frågor / undvikande beteende': 'BIDRAR_VID_KOMBINATION',
      'Komplicerad eller ovanlig ägarstruktur': 'BIDRAR_VID_KOMBINATION',
      'Kunder som handlar med kryptovaluta': 'GOLV_HOG',
      'Kunden har handel med högriskländer': 'GOLV_HOG',
      'Bristfälliga interna bokföringsrutiner hos kunden': 'BIDRAR_VID_KOMBINATION',
      'Ofta bytt redovisningskonsult/revisor utan naturlig förklaring': 'BIDRAR_VID_KOMBINATION',
      'Högriskbransch': 'BIDRAR_VID_KOMBINATION',
      'Distansrelation med BankID-verifiering': 'BIDRAR_VID_KOMBINATION'
    };

  function normalizeRiskhojandeKlass(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return normalizeRiskhojandeKlass(raw.klass || raw.typ || '');
    }
    var v = trimStr(raw).toUpperCase().replace(/\s+/g, '_');
    if (v === 'GOLV_HOG' || v === 'GOLV' || v === 'HOG' || v === 'HÖG') return RISKHOJANDE_KLASS.GOLV_HOG;
    if (v === 'BIDRAR_VID_KOMBINATION' || v === 'BIDRAR' || v === 'KOMBINATION') return RISKHOJANDE_KLASS.BIDRAR;
    if (v === 'INFORMATIV' || v === 'INFO') return RISKHOJANDE_KLASS.INFORMATIV;
    return '';
  }

  function normalizeRiskhojandeCategory(raw) {
    var src = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw.category || raw.kategori || raw.kategoriId || '')
      : raw;
    var v = trimStr(src).toLowerCase();
    if (v === 'samarbete' || v === 'a' || v === 'hur samarbetar vi?') return 'samarbete';
    if (v === 'kunden' || v === 'b' || v === 'vem är kunden?' || v === 'vem ar kunden?') return 'kunden';
    if (v === 'verksamheten' || v === 'c' || v === 'vad gör kunden?' || v === 'vad gor kunden?') return 'verksamheten';
    return '';
  }

  function defaultRiskhojandeCategory(namn) {
    if (OvrigaRiskKategorier && OvrigaRiskKategorier.findFactor) {
      var hit = OvrigaRiskKategorier.findFactor(namn);
      if (hit && hit.category) return hit.category;
    }
    return 'verksamheten';
  }

  function parseRiskhojandeKatalog(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
      var parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function isRemovedRiskhojandeKlass(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return isRemovedRiskhojandeKlass(raw.klass);
    }
    var v = trimStr(raw).toUpperCase().replace(/\s+/g, '_');
    return v === 'BORTTAGEN' || v === 'REMOVED' || v === 'TA_BORT';
  }

  function mergeRiskhojandeKatalog(overrides) {
    var out = {};
    Object.keys(DEFAULT_RISKHOJANDE_KATALOG).forEach(function (k) {
      out[k] = DEFAULT_RISKHOJANDE_KATALOG[k];
    });
    var extra = parseRiskhojandeKatalog(overrides);
    Object.keys(extra).forEach(function (k) {
      var label = canonicalRiskhojandeLabel(k);
      if (!label) return;
      if (isRemovedRiskhojandeKlass(extra[k])) {
        delete out[label];
        return;
      }
      var klass = normalizeRiskhojandeKlass(extra[k]);
      if (klass) out[label] = klass;
    });
    return out;
  }

  function persistRiskhojandeKatalog(working) {
    var parsed = parseRiskhojandeKatalog(working);
    var visible = {};
    var categories = {};
    Object.keys(parsed).forEach(function (k) {
      var label = canonicalRiskhojandeLabel(k);
      if (!label || isRemovedRiskhojandeKlass(parsed[k])) return;
      var klass = normalizeRiskhojandeKlass(parsed[k]);
      if (!klass) return;
      visible[label] = klass;
      categories[label] = normalizeRiskhojandeCategory(parsed[k]) || defaultRiskhojandeCategory(label);
    });
    var stored = {};
    Object.keys(visible).forEach(function (k) {
      stored[k] = { klass: visible[k], category: categories[k] || defaultRiskhojandeCategory(k) };
    });
    Object.keys(DEFAULT_RISKHOJANDE_KATALOG).forEach(function (k) {
      if (!visible[k]) stored[k] = 'BORTTAGEN';
    });
    return { visible: visible, stored: stored, categories: categories };
  }

  function mergeRiskhojandeKategorier(overrides) {
    var klassMap = mergeRiskhojandeKatalog(overrides);
    var extra = parseRiskhojandeKatalog(overrides);
    var out = {};
    Object.keys(klassMap).forEach(function (label) {
      var raw = extra[label];
      if (raw == null) {
        Object.keys(extra).some(function (k) {
          if (canonicalRiskhojandeLabel(k) === label) {
            raw = extra[k];
            return true;
          }
          return false;
        });
      }
      out[label] = normalizeRiskhojandeCategory(raw) || defaultRiskhojandeCategory(label);
    });
    return out;
  }

  function mergeRiskhojandeEntries(overrides) {
    var klassMap = mergeRiskhojandeKatalog(overrides);
    var catMap = mergeRiskhojandeKategorier(overrides);
    var out = {};
    Object.keys(klassMap).forEach(function (label) {
      out[label] = {
        klass: klassMap[label],
        category: catMap[label] || defaultRiskhojandeCategory(label)
      };
    });
    return out;
  }

  function klassForRiskhojande(namn, katalog) {
    var canon = canonicalRiskhojandeLabel(namn);
    var want = foldNamn(canon);
    if (!want) return RISKHOJANDE_KLASS.INFORMATIV;
    var map = katalog && typeof katalog === 'object' ? katalog : DEFAULT_RISKHOJANDE_KATALOG;
    if (map[canon]) return normalizeRiskhojandeKlass(map[canon]) || RISKHOJANDE_KLASS.BIDRAR;
    var found = '';
    Object.keys(map).forEach(function (k) {
      if (found) return;
      var fk = foldNamn(canonicalRiskhojandeLabel(k));
      if (!fk) return;
      if (fk === want || fk.indexOf(want) === 0 || want.indexOf(fk) === 0) {
        found = normalizeRiskhojandeKlass(map[k]);
      }
    });
    return found || RISKHOJANDE_KLASS.BIDRAR;
  }

  function extraKombinationsNamn(fields) {
    var extra = [];
    var hog = hogriskBranschVal(fields);
    if (hog && hog.length) extra.push('Högriskbransch');
    return extra;
  }

  function kombinationsLabels(fields) {
    var seen = {};
    var out = [];
    riskhojandeVal(fields).concat(extraKombinationsNamn(fields)).forEach(function (namn) {
      var canon = canonicalRiskhojandeLabel(namn);
      if (!canon) return;
      var key = foldNamn(canon);
      if (seen[key]) return;
      seen[key] = true;
      out.push(canon);
    });
    return out;
  }

  function beraknaRiskhojandeGolv(fields, katalog) {
    var labels = kombinationsLabels(fields);
    if (!labels.length) return null;
    var map = mergeRiskhojandeKatalog(katalog);
    var golv = [];
    var bidrar = [];
    labels.forEach(function (namn) {
      var klass = klassForRiskhojande(namn, map);
      if (klass === RISKHOJANDE_KLASS.GOLV_HOG) golv.push(namn);
      else if (klass === RISKHOJANDE_KLASS.BIDRAR) bidrar.push(namn);
    });
    if (golv.length) {
      return {
        niva: 'Hög',
        product: RISKHOJANDE_GOLV_PRODUCT,
        namn: golv.join(', '),
        drivandeFaktor: 'Golv satt av: ' + golv.join(', '),
        kalla: golv
      };
    }
    if (bidrar.length >= 2) {
      return {
        niva: 'Hög',
        product: RISKHOJANDE_GOLV_PRODUCT,
        namn: bidrar.join(' + '),
        drivandeFaktor: 'Golv satt av: ' + bidrar.join(' + '),
        kalla: bidrar
      };
    }
    return null;
  }

  function isRiskhojandeFlagItem(item) {
    return !!(item && item.source === 'riskhojande');
  }

  function struktureradeForhojda(poster, fields) {
    var flagNames = {};
    riskhojandeVal(fields).forEach(function (namn) {
      flagNames[foldNamn(namn)] = true;
    });
    var seen = {};
    return (Array.isArray(poster) ? poster : []).filter(function (item) {
      if (!item || isRiskhojandeFlagItem(item)) return false;
      var namn = foldNamn(item.namn);
      if (!namn || flagNames[namn] || seen[namn]) return false;
      var product = residualProductOf(item);
      var hit = product != null && isFinite(product)
        ? product >= STRUKTUR_FORHOJD_MIN
        : rankOf(item.residualLevel || item.level || '') >= 3;
      if (!hit) return false;
      seen[namn] = true;
      return true;
    });
  }

  function joinSvOch(names) {
    var list = (names || []).map(trimStr).filter(Boolean);
    if (!list.length) return 'okända poster';
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + ' och ' + list[1];
    return list.slice(0, -1).join(', ') + ' och ' + list[list.length - 1];
  }

  function formatOacceptabelDrivande(hogGolv, struktur) {
    var tagg = trimStr(hogGolv && hogGolv.namn) || 'varningstecken';
    var poster = joinSvOch((struktur || []).map(function (item) { return item.namn; }));
    return 'Golv Oacceptabel: ' + tagg + ' kombinerat med förhöjd/hög risk i ' + poster;
  }

  function applyOacceptabelGolv(result, fields) {
    var base = result || { niva: '', product: null, drivandeFaktor: '', drivande: null, poster: [] };
    if (base.ofullstandig) return base;
    var hog = base.golv;
    if (!hog || hog.niva !== 'Hög') return base;
    var struktur = struktureradeForhojda(base.poster, fields);
    if (struktur.length < 2) return base;
    var golv = {
      niva: 'Oacceptabel',
      product: OACCEPTABEL_GOLV_PRODUCT,
      namn: hog.namn,
      drivandeFaktor: formatOacceptabelDrivande(hog, struktur),
      kalla: (hog.kalla || []).concat(struktur.map(function (item) { return item.namn; })),
      skikt: 'OACCEPTABEL',
      struktur: struktur
    };
    if (rankOf(base.niva) > rankOf(golv.niva)) {
      return Object.assign({}, base, { golv: golv, hogGolv: hog });
    }
    return {
      niva: golv.niva,
      product: Math.max(Number(base.product) || 0, golv.product),
      drivandeFaktor: golv.drivandeFaktor,
      drivande: { kind: 'riskfaktor', namn: golv.namn, product: golv.product, level: golv.niva },
      poster: base.poster || [],
      golv: golv,
      hogGolv: hog
    };
  }

  function applyHogGolv(result, fields, katalog) {
    var base = result || { niva: '', product: null, drivandeFaktor: '', drivande: null, poster: [] };
    if (base.ofullstandig) return base;
    var golv = beraknaRiskhojandeGolv(fields, katalog);
    if (!golv) return base;
    golv.skikt = 'HOG';
    if (rankOf(base.niva) > rankOf(golv.niva)) {
      return Object.assign({}, base, { golv: golv });
    }
    return {
      niva: golv.niva,
      product: Math.max(Number(base.product) || 0, golv.product),
      drivandeFaktor: golv.drivandeFaktor,
      drivande: { kind: 'riskfaktor', namn: golv.namn, product: golv.product, level: golv.niva },
      poster: base.poster || [],
      golv: golv
    };
  }

  function applyRiskhojandeGolv(result, fields, katalog) {
    return applyOacceptabelGolv(applyHogGolv(result, fields, katalog), fields);
  }

  function golvSkulleHojaBedomd(fields, katalog, opts) {
    var base = (opts && opts.base) || {
      niva: '',
      product: null,
      drivandeFaktor: '',
      drivande: null,
      poster: (opts && opts.poster) || []
    };
    if (opts && (opts.tjanster || opts.riskfaktorer)) {
      base = beraknaForeslagenNiva({
        tjanster: opts.tjanster,
        riskfaktorer: (opts.riskfaktorer || []).concat(
          itemsFromRiskhojandeFlags(fields, opts.extraRecords, katalog)
        )
      });
    }
    var calc = applyRiskhojandeGolv(base, fields, katalog);
    if (!calc.golv) return null;
    var bedomd = readResidual(fields);
    if (!bedomd || rankOf(bedomd) < rankOf(calc.niva)) {
      return {
        golvNiva: calc.niva,
        bedomd: bedomd || '',
        drivandeFaktor: calc.drivandeFaktor,
        skikt: (calc.golv && calc.golv.skikt) || ''
      };
    }
    return null;
  }

  function canonicalRiskhojandeLabel(namn) {
    if (OvrigaRiskKategorier && OvrigaRiskKategorier.canonicalLabel) {
      return OvrigaRiskKategorier.canonicalLabel(namn);
    }
    var raw = trimStr(namn);
    if (/kortvarig|kortsiktig|tillf[äa]llig aff[äa]rsrelation/i.test(raw)) {
      return 'Ofta bytt redovisningskonsult/revisor utan naturlig förklaring';
    }
    return raw;
  }

  function riskhojandeVal(fields) {
    var raw = fields && fields['Riskhöjande faktorer övrigt'];
    var list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      var v = canonicalRiskhojandeLabel(item && item.name ? item.name : item);
      if (!v || v === '---' || v.toLowerCase() === 'inga') return;
      if (isNoneRiskOption(v)) return;
      if (OvrigaRiskKategorier && OvrigaRiskKategorier.isCoveredByDimension
        && OvrigaRiskKategorier.isCoveredByDimension(v)) return;
      var key = v.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(v);
    });
    return out;
  }

  function hasRiskhojandeVal(fields) {
    return riskhojandeVal(fields).length > 0;
  }

  function isIngaLabel(namn) {
    return foldNamn(namn) === 'inga';
  }

  function isNoneRiskOption(namn) {
    if (OvrigaRiskKategorier && OvrigaRiskKategorier.isNoneOption) {
      return OvrigaRiskKategorier.isNoneOption(namn);
    }
    var folded = foldNamn(namn);
    return folded.indexOf('inga varningsflaggor') === 0 || folded.indexOf('inga riskfaktorer') === 0;
  }

  function multiSelectList(raw) {
    var list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    return list.map(function (item) {
      return trimStr(item && item.name ? item.name : item);
    }).filter(function (v) { return v && v !== '---'; });
  }

  function exclusiveIngaCheck(raw) {
    var list = multiSelectList(raw);
    var hasInga = list.some(isIngaLabel);
    var others = list.filter(function (v) { return !isIngaLabel(v); });
    if (hasInga && others.length) {
      return {
        ok: false,
        error: '"Inga" kan inte kombineras med andra valda faktorer.',
        others: others
      };
    }
    return { ok: true, hasInga: hasInga, others: others };
  }

  function marksForRiskhojandeVal(labels, katalog) {
    var map = mergeRiskhojandeKatalog(katalog);
    var golvHog = [];
    var bidrar = [];
    (Array.isArray(labels) ? labels : []).forEach(function (namn) {
      var canon = canonicalRiskhojandeLabel(namn);
      if (!canon || isIngaLabel(canon) || isNoneRiskOption(canon)) return;
      var klass = klassForRiskhojande(canon, map);
      if (klass === RISKHOJANDE_KLASS.GOLV_HOG) golvHog.push(canon);
      else if (klass === RISKHOJANDE_KLASS.BIDRAR) bidrar.push(canon);
    });
    return {
      golvHog: golvHog,
      bidrarTillGolv: bidrar.length >= 2 ? bidrar : []
    };
  }

  function markKindForRiskhojande(namn, checkedLabels, katalog) {
    var canon = canonicalRiskhojandeLabel(namn);
    if (!canon || isIngaLabel(canon) || isNoneRiskOption(canon)) return '';
    var map = mergeRiskhojandeKatalog(katalog);
    if (klassForRiskhojande(canon, map) === RISKHOJANDE_KLASS.GOLV_HOG) return RISKHOJANDE_KLASS.GOLV_HOG;
    var marks = marksForRiskhojandeVal(checkedLabels, map);
    if (marks.bidrarTillGolv.indexOf(canon) !== -1) return RISKHOJANDE_KLASS.BIDRAR;
    return '';
  }

  function foldNamn(s) {
    return trimStr(s).toLowerCase().replace(/\s+/g, ' ');
  }

  function findRiskRecordByNamn(records, namn) {
    var want = foldNamn(canonicalRiskhojandeLabel(namn));
    if (!want) return null;
    var found = null;
    (Array.isArray(records) ? records : []).forEach(function (r) {
      if (!r || found) return;
      var f = r.fields || r;
      var recNamn = foldNamn(canonicalRiskhojandeLabel(f.Riskfaktor || f['Riskfaktor'] || f.Namn || f.namn || r.namn || ''));
      if (recNamn && recNamn === want) found = r;
    });
    return found;
  }

  function itemsFromRiskhojandeFlags(fields, extraRecords, katalog) {
    var map = mergeRiskhojandeKatalog(katalog);
    return riskhojandeVal(fields).map(function (namn) {
      var klass = klassForRiskhojande(namn, map);
      if (klass === RISKHOJANDE_KLASS.INFORMATIV) return null;
      var rec = findRiskRecordByNamn(extraRecords, namn);
      if (rec) {
        var fromRec = itemsFromRiskRecords([rec])[0];
        if (fromRec && fromRec.residualProduct != null) {
          fromRec.namn = namn;
          fromRec.source = 'riskhojande';
          return fromRec;
        }
      }
      var isGolv = klass === RISKHOJANDE_KLASS.GOLV_HOG;
      return {
        kind: 'riskfaktor',
        source: 'riskhojande',
        namn: namn,
        residualProduct: isGolv ? RISKHOJANDE_GOLV_PRODUCT : RISKHOJANDE_DEFAULT_PRODUCT,
        residualLevel: isGolv ? 'Hög' : 'Förhöjd'
      };
    }).filter(Boolean);
  }

  function residualDisplayOf(item) {
    if (item == null) return { namn: '', residualLevel: '', residualProduct: null };
    if (typeof item === 'string') {
      return { namn: trimStr(item), residualLevel: '', residualProduct: null };
    }
    var namn = trimStr(item.namn || item.titel || item.title || item.Riskfaktor || '');
    var product = residualProductOf(item);
    var level = labelOf(item.residualLevel || item.residualrisk || item.residual || item.level || '');
    if (!level && product != null && RiskSkala && RiskSkala.levelFromProduct) {
      var mapped = RiskSkala.levelFromProduct(product);
      level = mapped && mapped.label ? mapped.label : '';
    }
    return {
      namn: namn,
      residualLevel: level,
      residualProduct: product
    };
  }

  function formatPdfResidualLine(item, extraMark) {
    var d = residualDisplayOf(item);
    if (!d.namn) return '';
    var parts = [];
    if (d.residualLevel) {
      var sxk = d.residualProduct != null && isFinite(Number(d.residualProduct))
        ? ' (S×K ' + Number(d.residualProduct) + ')'
        : '';
      parts.push('Residual ' + d.residualLevel + sxk);
    }
    if (extraMark === RISKHOJANDE_KLASS.GOLV_HOG || (item && item.markKind === RISKHOJANDE_KLASS.GOLV_HOG)) {
      parts.push('Hög-golv');
    } else if (extraMark === RISKHOJANDE_KLASS.BIDRAR || (item && item.markKind === RISKHOJANDE_KLASS.BIDRAR)) {
      parts.push('Bidrar till Hög-golv');
    }
    return parts.length ? d.namn + ' — ' + parts.join(' · ') : d.namn;
  }

  function pdfNivaClass(level) {
    return (RiskSkala && RiskSkala.riskCss && RiskSkala.riskCss(level)) || 'normal';
  }

  function pdfRiskItemLi(item, esc) {
    var escape = typeof esc === 'function' ? esc : function (s) { return String(s == null ? '' : s); };
    var d = residualDisplayOf(item);
    if (!d.namn) return '';
    var mark = (item && item.markKind) || '';
    var html = escape(d.namn);
    if (d.residualLevel) {
      html += ' <span class="niva niva-' + pdfNivaClass(d.residualLevel) + '">Residual ' + escape(d.residualLevel) + '</span>';
      if (d.residualProduct != null && isFinite(Number(d.residualProduct))) {
        html += ' <span class="sxk">S×K ' + escape(String(d.residualProduct)) + '</span>';
      }
    }
    if (mark === RISKHOJANDE_KLASS.GOLV_HOG) {
      html += ' <span class="chip chip-neg">Hög-golv</span>';
    } else if (mark === RISKHOJANDE_KLASS.BIDRAR) {
      html += ' <span class="chip chip-bidrar">Bidrar till Hög-golv</span>';
    }
    return '<li>' + html + '</li>';
  }

  function pdfBulletList(items, emptyLabel, esc) {
    var escape = typeof esc === 'function' ? esc : function (s) { return String(s == null ? '' : s); };
    var list = (Array.isArray(items) ? items : []).map(function (item) {
      return typeof item === 'string' ? { namn: item } : item;
    }).filter(function (item) {
      return item && trimStr(item.namn);
    });
    if (!list.length) {
      if (emptyLabel) return '<p><span class="chip chip-pos">' + escape(emptyLabel) + '</span></p>';
      return '<p>—</p>';
    }
    return '<ul style="margin:0;padding-left:1.2rem;">' + list.map(function (item) {
      return pdfRiskItemLi(item, escape);
    }).join('') + '</ul>';
  }

  function withSharedResidual(names, residualItem, extra) {
    var d = residualDisplayOf(residualItem);
    return (Array.isArray(names) ? names : []).map(function (namn) {
      return Object.assign({
        namn: trimStr(namn),
        residualLevel: d.residualLevel,
        residualProduct: d.residualProduct
      }, extra || {});
    }).filter(function (item) { return item.namn; });
  }

  function formatDrivandeFaktor(kind, namn, product, item) {
    var prefix = kind === 'tjänst' ? 'tjänst' : 'riskfaktor';
    var name = trimStr(namn) || 'okänd post';
    var source = item && item.residualSource;
    var label = 'residual';
    if (source === 'inneboende') label = 'inneboende';
    else if (source === 'override') label = 'kundresidual';
    var sxk = product != null && isFinite(product) ? ' (' + label + ' S×K ' + product + ')' : '';
    var note = '';
    if (source === 'inneboende') note = ' — standardåtgärder ej uppfyllda';
    return prefix + ': ' + name + sxk + note;
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
          source: item.source || item.residualSource || '',
          residualSource: item.residualSource || '',
          namn: trimStr(item.namn || item.titel || item.title || item.Riskfaktor || ''),
          product: product,
          level: level,
          residualProduct: product,
          residualLevel: level,
          forutsattning: item.forutsattning || null
        });
      });
    }
    push('tjänst', src.tjanster || src.tjansterValda);
    push('riskfaktor', src.riskfaktorer || src.risker);
    return items;
  }

  function beraknaForeslagenNiva(kund) {
    var src = kund || {};
    var completeness = src.dimensionStatus || null;
    if (!completeness && RiskDimensioner && (src.linkedRiskRecords || src.byraTemplates || src.fields)) {
      completeness = RiskDimensioner.assessCustomerDimensions({
        fields: src.fields,
        linkedRiskRecords: src.linkedRiskRecords,
        byraTemplates: src.byraTemplates
      });
    }
    if (completeness && completeness.komplett === false) {
      return {
        niva: '',
        product: null,
        drivandeFaktor: '',
        drivande: null,
        poster: [],
        ofullstandig: true,
        saknadeDimensioner: completeness.saknade || [],
        varning: completeness.varning || (RiskDimensioner && RiskDimensioner.ofullstandigVarning
          ? RiskDimensioner.ofullstandigVarning(completeness.saknade)
          : '')
      };
    }
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
      drivandeFaktor: formatDrivandeFaktor(best.kind, best.namn, best.product, best),
      drivande: best,
      poster: items
    };
  }

  function itemsFromTjanstRecords(records, opts) {
    var kundState = TjanstForutsattning
      ? TjanstForutsattning.readKundState(opts && opts.fields)
      : {};
    return (Array.isArray(records) ? records : []).map(function (r) {
      if (TjanstForutsattning && TjanstForutsattning.applyToResidualItem) {
        var tjanst = (r && r.fields)
          ? {
            id: r.id,
            namn: trimStr(r.fields['Task Name'] || r.namn || ''),
            atgarder: TjanstForutsattning.parseAtgarder(r.fields['Tjänstespecifika åtgärder']),
            fields: r.fields
          }
          : r;
        var mapped = TjanstForutsattning.applyToResidualItem(tjanst, kundState);
        mapped.kind = 'tjänst';
        return mapped;
      }
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

  function isHogriskBranschNamn(namn) {
    return /h[öo]griskbransch/i.test(trimStr(namn));
  }

  function hogriskBranschVal(fields) {
    var raw = fields && fields['Kunden verkar i en högriskbransch'];
    var list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    return list.map(trimStr).filter(function (v) { return v && v !== '---'; });
  }

  function hasHogriskBranschVal(fields) {
    return hogriskBranschVal(fields).length > 0;
  }

  function findHogriskBranschRecords(records) {
    return (Array.isArray(records) ? records : []).filter(function (r) {
      if (!r) return false;
      var f = r.fields || r;
      var namn = f.Riskfaktor || f['Riskfaktor'] || f.namn || r.namn || '';
      return isHogriskBranschNamn(namn);
    });
  }

  function mergeHogriskBranschRisker(fields, riskRecords, extraRecords) {
    var risker = Array.isArray(riskRecords) ? riskRecords.slice() : [];
    if (!hasHogriskBranschVal(fields)) return risker;
    var seen = {};
    risker.forEach(function (r) {
      var id = r && r.id;
      if (id) seen[id] = true;
    });
    findHogriskBranschRecords(extraRecords).forEach(function (r) {
      if (!r) return;
      if (r.id && seen[r.id]) return;
      if (r.id) seen[r.id] = true;
      risker.push(r);
    });
    return risker;
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

  function foreslagenFromLinkedRecords(fields, tjanstRecords, riskRecords, opts) {
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
    var extra = [];
    if (opts && Array.isArray(opts.allaRiskRecords)) extra = extra.concat(opts.allaRiskRecords);
    extra = extra.concat(riskRecords || []);
    risker = mergeHogriskBranschRisker(f, risker, extra);
    var katalog = opts && opts.katalog;
    var templates = extra.length ? extra : (riskRecords || []);
    var dimensionStatus = RiskDimensioner && RiskDimensioner.assessCustomerDimensions
      ? RiskDimensioner.assessCustomerDimensions({
        fields: f,
        linkedRiskRecords: risker,
        byraTemplates: templates
      })
      : null;
    return applyRiskhojandeGolv(beraknaForeslagenNiva({
      tjanster: itemsFromTjanstRecords(tjanster, { fields: f }),
      riskfaktorer: itemsFromRiskRecords(risker).concat(itemsFromRiskhojandeFlags(f, extra, katalog)),
      dimensionStatus: dimensionStatus
    }), f, katalog);
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
    var foreslagnaAtgarder = [];
    if (opts && Array.isArray(opts.foreslagnaAtgarder)) foreslagnaAtgarder = opts.foreslagnaAtgarder;
    else if (Array.isArray(src.foreslagnaAtgarder)) foreslagnaAtgarder = src.foreslagnaAtgarder;
    return {
      foreslagenNiva: suggested,
      riskbedomning: motivering,
      kundRiskMotivering: motivering,
      atgarder: atgarder,
      foreslagnaAtgarder: foreslagnaAtgarder,
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
    isHogriskBranschNamn: isHogriskBranschNamn,
    hogriskBranschVal: hogriskBranschVal,
    hasHogriskBranschVal: hasHogriskBranschVal,
    findHogriskBranschRecords: findHogriskBranschRecords,
    mergeHogriskBranschRisker: mergeHogriskBranschRisker,
    RISKHOJANDE_DEFAULT_PRODUCT: RISKHOJANDE_DEFAULT_PRODUCT,
    RISKHOJANDE_GOLV_PRODUCT: RISKHOJANDE_GOLV_PRODUCT,
    STRUKTUR_FORHOJD_MIN: STRUKTUR_FORHOJD_MIN,
    OACCEPTABEL_GOLV_PRODUCT: OACCEPTABEL_GOLV_PRODUCT,
    RISKHOJANDE_KLASS: RISKHOJANDE_KLASS,
    DEFAULT_RISKHOJANDE_KATALOG: DEFAULT_RISKHOJANDE_KATALOG,
    extraKombinationsNamn: extraKombinationsNamn,
    kombinationsLabels: kombinationsLabels,
    canonicalRiskhojandeLabel: canonicalRiskhojandeLabel,
    riskhojandeVal: riskhojandeVal,
    hasRiskhojandeVal: hasRiskhojandeVal,
    normalizeRiskhojandeKlass: normalizeRiskhojandeKlass,
    parseRiskhojandeKatalog: parseRiskhojandeKatalog,
    mergeRiskhojandeKatalog: mergeRiskhojandeKatalog,
    mergeRiskhojandeKategorier: mergeRiskhojandeKategorier,
    mergeRiskhojandeEntries: mergeRiskhojandeEntries,
    persistRiskhojandeKatalog: persistRiskhojandeKatalog,
    normalizeRiskhojandeCategory: normalizeRiskhojandeCategory,
    defaultRiskhojandeCategory: defaultRiskhojandeCategory,
    isRemovedRiskhojandeKlass: isRemovedRiskhojandeKlass,
    klassForRiskhojande: klassForRiskhojande,
    beraknaRiskhojandeGolv: beraknaRiskhojandeGolv,
    applyHogGolv: applyHogGolv,
    applyOacceptabelGolv: applyOacceptabelGolv,
    applyRiskhojandeGolv: applyRiskhojandeGolv,
    struktureradeForhojda: struktureradeForhojda,
    formatOacceptabelDrivande: formatOacceptabelDrivande,
    golvSkulleHojaBedomd: golvSkulleHojaBedomd,
    itemsFromRiskhojandeFlags: itemsFromRiskhojandeFlags,
    residualDisplayOf: residualDisplayOf,
    formatPdfResidualLine: formatPdfResidualLine,
    pdfRiskItemLi: pdfRiskItemLi,
    pdfBulletList: pdfBulletList,
    withSharedResidual: withSharedResidual,
    isIngaLabel: isIngaLabel,
    isNoneRiskOption: isNoneRiskOption,
    exclusiveIngaCheck: exclusiveIngaCheck,
    marksForRiskhojandeVal: marksForRiskhojandeVal,
    markKindForRiskhojande: markKindForRiskhojande,
    foreslagenFromLinkedRecords: foreslagenFromLinkedRecords,
    formatDrivandeFaktor: formatDrivandeFaktor,
    residualAvvikerFranForeslagen: residualAvvikerFranForeslagen,
    avvikelseRiktning: avvikelseRiktning,
    canSaveResidual: canSaveResidual,
    writeForeslagenFields: writeForeslagenFields,
    hasExplicitProfiles: hasExplicitProfiles,
    isPublicerbar: isPublicerbar,
    dimensionStatusOf: dimensionStatusOf,
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
