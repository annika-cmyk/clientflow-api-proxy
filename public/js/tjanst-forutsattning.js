/**
 * Tjänsteåtgärder: byrårutin (gäller alltid) eller kundberoende förutsättning.
 * Per kund: uppfylld-status + ev. residual-override när förutsättningen saknas.
 */
(function (global) {
  var RiskSkala = (typeof module !== 'undefined' && module.exports)
    ? require('./risk-skala')
    : (global.RiskSkala || null);

  var FIELD = 'Kund tjänsteförutsättningar';
  var TYP = {
    BYRARUTIN: 'byrarutin',
    KUNDBEROENDE: 'kundberoende_forutsattning'
  };
  var UPPFYLLD = {
    JA: 'Ja',
    DELVIS: 'Delvis',
    NEJ: 'Nej',
    EJ_BEDOMD: 'Ej bedömd'
  };
  var NEJ_WARNING = '⚠ Standardåtgärder ej uppfyllda hos denna kund — residualrisk kräver manuell bedömning.';
  var DELVIS_WARNING = 'Standardåtgärder är bara delvis uppfyllda hos denna kund — överväg en kundspecifik residual.';
  var EJ_BEDOMD_HINT = 'Kundberoende förutsättning är inte bedömd ännu.';
  var MOTIVERING_ERROR = 'Motivering krävs när en förutsättning är Delvis eller Nej.';

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function fold(value) {
    return trimStr(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function parseJson(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch (_) {
      return fallback;
    }
  }

  function parseAtgarder(raw) {
    if (Array.isArray(raw)) return raw.filter(function (x) { return x && typeof x === 'object'; });
    var parsed = parseJson(raw, []);
    return Array.isArray(parsed) ? parsed.filter(function (x) { return x && typeof x === 'object'; }) : [];
  }

  function atgardText(item) {
    if (!item) return '';
    return [item.titel, item.title, item.namn, item.beskrivning, item.description]
      .map(trimStr)
      .filter(Boolean)
      .join(' ');
  }

  function atgardTitel(item) {
    if (!item) return '';
    return trimStr(item.titel || item.title || item.namn);
  }

  function atgardKey(item) {
    if (!item) return '';
    if (item.id) return trimStr(item.id);
    var titel = fold(atgardTitel(item));
    if (titel) return titel;
    return fold(item.beskrivning || item.description).slice(0, 48);
  }

  function normalizeAtgardTyp(raw) {
    var v = fold(raw).replace(/\s+/g, '_');
    if (v === TYP.BYRARUTIN || v === 'byra_rutin' || v === 'byrarutin') return TYP.BYRARUTIN;
    if (v === TYP.KUNDBEROENDE || v === 'kundberoende' || v === 'forutsattning') return TYP.KUNDBEROENDE;
    return '';
  }

  function normalizeUppfylld(raw) {
    var v = fold(raw);
    if (v === 'ja' || v === 'uppfylld') return UPPFYLLD.JA;
    if (v === 'delvis') return UPPFYLLD.DELVIS;
    if (v === 'nej' || v === 'ej uppfylld') return UPPFYLLD.NEJ;
    if (v === 'ej bedomd' || v === 'obedomd' || v === '') return UPPFYLLD.EJ_BEDOMD;
    return UPPFYLLD.EJ_BEDOMD;
  }

  function isKundberoende(item) {
    return normalizeAtgardTyp(item && item.atgardTyp) === TYP.KUNDBEROENDE;
  }

  function kundberoendeAtgarder(raw) {
    return parseAtgarder(raw).filter(isKundberoende);
  }

  var KUND_HINT_RE = /\b(automatiserad|lagervardering|lagerhantering|lagersystem|lagerprogram|hos kunden|kundens system|kundens rutin|kundens program|kundens underlag|forutsatter|forutsattning|kunden sjalv|kunden har|regelbundna avstamningar|regelbunden avstamning|affarssystem|kassasystem)\b/;
  var BYRA_HINT_RE = /\b(byran|vi kontrollerar|vi granskar|vi stämmer|vi stamer|vi dokumenterar|bokslutsprogram|intern rutin|intern kontroll|handlaggare|kann kunden|kyc)\b/;

  function suggestAtgardTyp(item) {
    var text = fold(atgardText(item));
    if (!text) return { typ: '', reason: '' };
    var kund = KUND_HINT_RE.test(text);
    var byra = BYRA_HINT_RE.test(text);
    if (kund && !byra) {
      return { typ: TYP.KUNDBEROENDE, reason: 'Formuleringen förutsätter system eller rutin hos kunden.' };
    }
    if (byra && !kund) {
      return { typ: TYP.BYRARUTIN, reason: 'Formuleringen beskriver något byrån gör.' };
    }
    if (kund && byra) {
      return { typ: TYP.KUNDBEROENDE, reason: 'Blandad text — föreslås som kundberoende så ni kan bedöma den per kund.' };
    }
    return { typ: '', reason: '' };
  }

  function typLabel(typ) {
    if (typ === TYP.KUNDBEROENDE) return 'Kundberoende förutsättning';
    if (typ === TYP.BYRARUTIN) return 'Byrårutin';
    return 'Ej klassificerad';
  }

  function parseKundState(raw) {
    var parsed = parseJson(raw, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  function readKundState(fields) {
    return parseKundState(fields && fields[FIELD]);
  }

  function serializeKundState(state) {
    return JSON.stringify(state && typeof state === 'object' ? state : {});
  }

  function tjanstEntry(state, tjanstId) {
    var map = parseKundState(state);
    var key = trimStr(tjanstId);
    var entry = key && map[key] ? map[key] : {};
    if (!entry || typeof entry !== 'object') entry = {};
    return {
      forutsattningar: entry.forutsattningar && typeof entry.forutsattningar === 'object'
        ? entry.forutsattningar
        : {},
      override: entry.override && typeof entry.override === 'object' ? entry.override : null
    };
  }

  function readUppfylld(entry, key) {
    var row = entry && entry.forutsattningar ? entry.forutsattningar[key] : null;
    if (!row) return { uppfylld: UPPFYLLD.EJ_BEDOMD, motivering: '' };
    return {
      uppfylld: normalizeUppfylld(row.uppfylld || row.forutsattningUppfylld),
      motivering: trimStr(row.motivering || row.forutsattningMotivering)
    };
  }

  function parseOverride(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var s = Number(raw.sannolikhetEfter != null ? raw.sannolikhetEfter : raw.s);
    var k = Number(raw.konsekvensEfter != null ? raw.konsekvensEfter : raw.k);
    if (!isFinite(s) || !isFinite(k) || s < 1 || k < 1) return null;
    var assessed = RiskSkala ? RiskSkala.assessRisk(s, k) : { product: s * k, level: '' };
    return {
      sannolikhetEfter: assessed.sannolikhet || s,
      konsekvensEfter: assessed.konsekvens || k,
      product: assessed.product,
      level: assessed.level || ''
    };
  }

  function validateForutsattningRow(row) {
    var uppfylld = normalizeUppfylld(row && (row.uppfylld || row.forutsattningUppfylld));
    var motivering = trimStr(row && (row.motivering || row.forutsattningMotivering));
    if ((uppfylld === UPPFYLLD.DELVIS || uppfylld === UPPFYLLD.NEJ) && !motivering) {
      return { ok: false, error: MOTIVERING_ERROR };
    }
    return { ok: true, uppfylld: uppfylld, motivering: motivering };
  }

  function validateKundState(state, tjanster) {
    var map = parseKundState(state);
    var keys = Object.keys(map);
    for (var s = 0; s < keys.length; s++) {
      var entry = tjanstEntry(map, keys[s]);
      var rowKeys = Object.keys(entry.forutsattningar || {});
      for (var r = 0; r < rowKeys.length; r++) {
        var checkState = validateForutsattningRow(entry.forutsattningar[rowKeys[r]]);
        if (!checkState.ok) {
          return { ok: false, error: checkState.error, tjanstId: keys[s] };
        }
      }
    }
    var list = Array.isArray(tjanster) ? tjanster : [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i] || {};
      var id = trimStr(t.id || t.recId);
      var atgarder = kundberoendeAtgarder(t.atgarder || (t.fields && t.fields['Tjänstespecifika åtgärder']));
      var entry = tjanstEntry(map, id);
      for (var j = 0; j < atgarder.length; j++) {
        var check = validateForutsattningRow(readUppfylld(entry, atgardKey(atgarder[j])));
        if (!check.ok) {
          return {
            ok: false,
            error: check.error,
            tjanstId: id,
            atgard: atgardTitel(atgarder[j])
          };
        }
      }
    }
    return { ok: true };
  }

  function assessTjanst(tjanst, kundState) {
    var id = trimStr((tjanst && (tjanst.id || tjanst.recId)) || '');
    var atgarder = kundberoendeAtgarder(
      (tjanst && tjanst.atgarder) || (tjanst && tjanst.fields && tjanst.fields['Tjänstespecifika åtgärder'])
    );
    var entry = tjanstEntry(kundState, id);
    var rows = atgarder.map(function (a) {
      var key = atgardKey(a);
      var row = readUppfylld(entry, key);
      return {
        key: key,
        titel: atgardTitel(a) || 'Åtgärd',
        beskrivning: trimStr(a.beskrivning || a.description),
        uppfylld: row.uppfylld,
        motivering: row.motivering
      };
    });
    var hasNej = rows.some(function (r) { return r.uppfylld === UPPFYLLD.NEJ; });
    var hasDelvis = rows.some(function (r) { return r.uppfylld === UPPFYLLD.DELVIS; });
    var hasEjBedomd = rows.some(function (r) { return r.uppfylld === UPPFYLLD.EJ_BEDOMD; });
    var override = parseOverride(entry.override);
    var status = 'ok';
    if (hasNej) status = 'nej';
    else if (hasDelvis) status = 'delvis';
    else if (hasEjBedomd && rows.length) status = 'ej_bedomd';
    return {
      tjanstId: id,
      hasKundberoende: rows.length > 0,
      rows: rows,
      status: status,
      override: override,
      needsOverride: status === 'nej' && !override,
      usesInherent: status === 'nej' && !override,
      warning: status === 'nej' ? NEJ_WARNING : (status === 'delvis' ? DELVIS_WARNING : ''),
      hint: status === 'ej_bedomd' ? EJ_BEDOMD_HINT : ''
    };
  }

  function scoredFromTjanst(tjanst) {
    var t = tjanst || {};
    if (RiskSkala && t.fields && RiskSkala.readTjanstRisk) {
      return RiskSkala.readTjanstRisk(t.fields);
    }
    var inherent = RiskSkala ? RiskSkala.assessRisk(t.sannolikhet, t.konsekvens) : {};
    var residual = RiskSkala ? RiskSkala.assessRisk(t.sannolikhetEfter, t.konsekvensEfter) : {};
    return {
      sannolikhet: inherent.sannolikhet != null ? inherent.sannolikhet : t.sannolikhet,
      konsekvens: inherent.konsekvens != null ? inherent.konsekvens : t.konsekvens,
      product: inherent.product != null ? inherent.product : t.riskProduct,
      level: inherent.level || t.riskbedomning || t.level || '',
      sannolikhetEfter: residual.sannolikhet != null ? residual.sannolikhet : t.sannolikhetEfter,
      konsekvensEfter: residual.konsekvens != null ? residual.konsekvens : t.konsekvensEfter,
      residualProduct: residual.product != null ? residual.product : t.residualProduct,
      residualLevel: residual.level || t.residualrisk || t.residualLevel || ''
    };
  }

  function applyToResidualItem(tjanst, kundState) {
    var t = tjanst || {};
    var scored = scoredFromTjanst(t);
    var assess = assessTjanst(t, kundState);
    var product = scored.residualProduct;
    var level = scored.residualLevel;
    var source = 'mall';
    if (assess.hasKundberoende && assess.status === 'nej') {
      if (assess.override && assess.override.product != null) {
        product = assess.override.product;
        level = assess.override.level;
        source = 'override';
      } else if (scored.product != null) {
        product = scored.product;
        level = scored.level;
        source = 'inneboende';
      }
    } else if (assess.hasKundberoende && assess.status === 'delvis' && assess.override && assess.override.product != null) {
      product = assess.override.product;
      level = assess.override.level;
      source = 'override';
    }
    return {
      kind: 'tjänst',
      id: trimStr(t.id || t.recId),
      namn: trimStr(t.namn || (t.fields && t.fields['Task Name']) || ''),
      residualProduct: product,
      residualLevel: level,
      residualSource: source,
      mallResidualProduct: scored.residualProduct,
      mallResidualLevel: scored.residualLevel,
      inherentProduct: scored.product,
      inherentLevel: scored.level,
      sannolikhet: scored.sannolikhet,
      konsekvens: scored.konsekvens,
      sannolikhetEfter: source === 'override' && assess.override
        ? assess.override.sannolikhetEfter
        : (source === 'inneboende' ? scored.sannolikhet : scored.sannolikhetEfter),
      konsekvensEfter: source === 'override' && assess.override
        ? assess.override.konsekvensEfter
        : (source === 'inneboende' ? scored.konsekvens : scored.konsekvensEfter),
      forutsattning: assess,
      atgarder: Array.isArray(t.atgarder) ? t.atgarder : parseAtgarder(t.fields && t.fields['Tjänstespecifika åtgärder'])
    };
  }

  function buildGranskningslista(tjanster) {
    return (Array.isArray(tjanster) ? tjanster : []).map(function (t) {
      var atgarder = parseAtgarder(t.atgarder || (t.fields && t.fields['Tjänstespecifika åtgärder']));
      var namn = trimStr(t.namn || (t.fields && t.fields['Task Name']) || '');
      return {
        id: trimStr(t.id || t.recId),
        namn: namn,
        atgarder: atgarder.map(function (a) {
          var typ = normalizeAtgardTyp(a.atgardTyp);
          var forslag = typ ? { typ: typ, reason: '' } : suggestAtgardTyp(a);
          return {
            key: atgardKey(a),
            titel: atgardTitel(a),
            beskrivning: trimStr(a.beskrivning || a.description),
            atgardTyp: typ,
            klassificerad: !!typ,
            forslagTyp: forslag.typ,
            forslagReason: forslag.reason
          };
        })
      };
    }).filter(function (t) { return t.atgarder.length; });
  }

  function isTrueHorses(namn) {
    return /true\s*horses/i.test(trimStr(namn));
  }

  function kundFlags(fields) {
    var raw = fields && fields['Riskhöjande faktorer övrigt'];
    var list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    return list.map(trimStr).filter(function (v) { return v && v !== '---' && !/^inga$/i.test(v); });
  }

  function buildMigreringsrapport(opts) {
    var kunder = (opts && opts.kunder) || [];
    var tjansterById = (opts && opts.tjansterById) || {};
    var rows = [];
    kunder.forEach(function (rec) {
      var f = (rec && rec.fields) || rec || {};
      var namn = trimStr(f.Namn || f['Företagsnamn'] || rec.namn);
      var ids = Array.isArray(f['Kundens utvalda tjänster']) ? f['Kundens utvalda tjänster'] : [];
      var state = readKundState(f);
      var hits = [];
      ids.forEach(function (id) {
        var tjanst = tjansterById[trimStr(id)];
        if (!tjanst) return;
        var item = typeof tjanst === 'object' && tjanst.fields
          ? tjanst
          : { id: trimStr(id), namn: tjanst.namn, atgarder: tjanst.atgarder, fields: tjanst.fields || tjanst };
        if (!item.id) item.id = trimStr(id);
        var assess = assessTjanst(item, state);
        if (!assess.hasKundberoende) return;
        var obedomda = assess.rows.filter(function (r) { return r.uppfylld === UPPFYLLD.EJ_BEDOMD; });
        if (!obedomda.length) return;
        hits.push({
          tjanstId: assess.tjanstId,
          namn: trimStr(item.namn || (item.fields && item.fields['Task Name'])),
          obedomda: obedomda.map(function (r) { return r.titel; })
        });
      });
      if (!hits.length) return;
      var flaggor = kundFlags(f);
      rows.push({
        id: rec.id || '',
        namn: namn,
        orgnr: trimStr(f.Orgnr || f.Organisationsnummer),
        flaggor: flaggor,
        prioritet: isTrueHorses(namn) ? 0 : (flaggor.length ? 1 : 2),
        tjanster: hits
      });
    });
    rows.sort(function (a, b) {
      if (a.prioritet !== b.prioritet) return a.prioritet - b.prioritet;
      return String(a.namn).localeCompare(String(b.namn), 'sv');
    });
    return {
      antal: rows.length,
      prioriterade: rows.filter(function (r) { return r.prioritet <= 1; }),
      ovriga: rows.filter(function (r) { return r.prioritet > 1; }),
      kunder: rows
    };
  }

  function triState(raw) {
    var u = normalizeUppfylld(raw);
    if (u === UPPFYLLD.JA) return 'uppfylld';
    if (u === UPPFYLLD.NEJ) return 'ej_uppfylld';
    return 'ej_bedomd';
  }

  function fromTriState(state) {
    if (state === 'uppfylld') return UPPFYLLD.JA;
    if (state === 'ej_uppfylld') return UPPFYLLD.NEJ;
    return UPPFYLLD.EJ_BEDOMD;
  }

  function isEjUppfylld(raw) {
    return normalizeUppfylld(raw) === UPPFYLLD.NEJ;
  }

  function readLagsUt(atgard) {
    return !!(atgard && (atgard.lagsUtSomUppdragsatgard === true || atgard.lagsUtSomUppdragsatgard === 'true' || atgard.lagsUtSomUppdragsatgard === 1));
  }

  function listKundForutsattningar(tjanster, kundState) {
    return (Array.isArray(tjanster) ? tjanster : []).map(function (t) {
      var assess = assessTjanst(t, kundState);
      var item = applyToResidualItem(t, kundState);
      var atgarder = kundberoendeAtgarder(t.atgarder || (t.fields && t.fields['Tjänstespecifika åtgärder']));
      return {
        tjanstId: trimStr(t.id || t.recId || assess.tjanstId),
        namn: trimStr(t.namn || (t.fields && t.fields['Task Name']) || item.namn),
        assess: assess,
        item: item,
        rows: assess.rows.map(function (row) {
          var src = atgarder.find(function (a) { return atgardKey(a) === row.key; }) || {};
          return Object.assign({}, row, {
            lagsUtSomUppdragsatgard: readLagsUt(src),
            triState: triState(row.uppfylld)
          });
        })
      };
    }).filter(function (g) { return g.assess.hasKundberoende; });
  }

  function suggestKompletterandeAtgard(row) {
    var titel = trimStr(row && (row.titel || row.namn)) || 'förutsättningen';
    var folded = fold(titel + ' ' + trimStr(row && row.beskrivning));
    var text;
    if (/lager/.test(folded)) {
      text = 'Byrån genomför manuell lagerinventering kvartalsvis tills kunden infört eget system. Dokumentera inventeringen i ClientFlow.';
    } else if (/underlag|i tid/.test(folded)) {
      text = 'Byrån följer upp saknade underlag vid varje körning och dokumenterar påminnelser i ClientFlow tills kunden levererar löpande och i tid.';
    } else {
      text = 'Byrån kompenserar för att «' + titel + '» inte är uppfylld: gör en manuell kontroll i samband med nästa uppdragskörning och dokumentera resultatet i ClientFlow.';
    }
    return {
      key: (row && row.key) || atgardKey({ titel: titel }),
      text: text,
      reason: 'Kundberoende förutsättning ej uppfylld: ' + titel,
      titel: titel
    };
  }

  function parseAtgardLines(raw) {
    return trimStr(raw)
      .split(/\r?\n/)
      .map(function (s) { return s.replace(/^\s*[-•]\s*/, '').trim(); })
      .filter(Boolean);
  }

  function buildForeslagnaAtgarder(tjanster, kundState, existingText) {
    var existing = {};
    parseAtgardLines(existingText).forEach(function (line) {
      existing[fold(line)] = true;
    });
    var out = [];
    listKundForutsattningar(tjanster, kundState).forEach(function (g) {
      g.rows.forEach(function (row) {
        if (!isEjUppfylld(row.uppfylld)) return;
        var forslag = suggestKompletterandeAtgard(row);
        if (existing[fold(forslag.text)]) return;
        out.push(Object.assign({}, forslag, {
          tjanstId: g.tjanstId,
          tjanstNamn: g.namn,
          approved: false
        }));
      });
    });
    return out;
  }

  function applyApprovedAtgarder(existingText, approved) {
    var lines = parseAtgardLines(existingText);
    var seen = {};
    lines.forEach(function (l) { seen[fold(l)] = true; });
    (Array.isArray(approved) ? approved : []).forEach(function (item) {
      var text = trimStr(item && item.text ? item.text : item);
      if (!text || seen[fold(text)]) return;
      seen[fold(text)] = true;
      lines.push(text.charAt(0) === '-' ? text : '- ' + text);
    });
    return lines.join('\n');
  }

  function foreslaUppdragsTyp(tjanstNamn) {
    var f = fold(tjanstNamn);
    if (/lone|lon /.test(f) || f === 'lon') return 'Löneuppdrag';
    if (/moms/.test(f)) return 'Momsredovisning';
    return 'Bokslut';
  }

  function buildUppdragsatgardText(row) {
    var titel = trimStr(row && row.titel) || 'kundens förutsättning';
    if (/lager/.test(fold(titel))) return 'Kontrollera lagerunderlag manuellt';
    return 'Kontrollera manuellt: ' + titel;
  }

  function pendingUppdragsatgarder(tjanster, kundState) {
    var out = [];
    listKundForutsattningar(tjanster, kundState).forEach(function (g) {
      g.rows.forEach(function (row) {
        if (!row.lagsUtSomUppdragsatgard || !isEjUppfylld(row.uppfylld)) return;
        out.push({
          key: row.key,
          text: buildUppdragsatgardText(row),
          typ: foreslaUppdragsTyp(g.namn),
          tjanstId: g.tjanstId,
          tjanstNamn: g.namn,
          titel: row.titel
        });
      });
    });
    return out;
  }

  function buildForutsattningPromptBlock(tjanster, kundState) {
    var lines = [];
    listKundForutsattningar(tjanster, kundState).forEach(function (g) {
      g.rows.forEach(function (row) {
        if (!isEjUppfylld(row.uppfylld)) return;
        lines.push('- ' + g.namn + ' / ' + row.titel + ': EJ UPPFYLLD' + (row.motivering ? ' — ' + row.motivering : ''));
      });
    });
    if (!lines.length) return '';
    return 'KUNDBEROENDE FÖRUTSÄTTNINGAR SOM INTE ÄR UPPFYLLDA (påverkar residualen — mallens sänkta residual används inte):\n' +
      lines.join('\n') +
      '\n- Nämn i motiveringen att standardåtgärden inte fungerar för kunden.' +
      '\n- Lägg INTE kompletterande åtgärder för dessa i fältet atgarder — de granskas separat av användaren.';
  }

  function mergeRiskAtgarderValda(existingRaw, added) {
    var have = [];
    var seen = {};
    function push(text) {
      var t = trimStr(text);
      var k = fold(t);
      if (!t || seen[k]) return;
      seen[k] = true;
      have.push(t);
    }
    if (Array.isArray(existingRaw)) existingRaw.forEach(push);
    else if (typeof existingRaw === 'string' && existingRaw.trim()) {
      try {
        var parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) parsed.forEach(function (x) {
          push(typeof x === 'string' ? x : (x && (x.text || x.name || x.label)));
        });
        else String(existingRaw).split(/\r?\n/).forEach(push);
      } catch (_) {
        String(existingRaw).split(/\r?\n/).forEach(push);
      }
    }
    (Array.isArray(added) ? added : []).forEach(push);
    return have;
  }

  var api = {
    FIELD: FIELD,
    TYP: TYP,
    UPPFYLLD: UPPFYLLD,
    NEJ_WARNING: NEJ_WARNING,
    DELVIS_WARNING: DELVIS_WARNING,
    MOTIVERING_ERROR: MOTIVERING_ERROR,
    parseAtgarder: parseAtgarder,
    atgardKey: atgardKey,
    atgardTitel: atgardTitel,
    normalizeAtgardTyp: normalizeAtgardTyp,
    normalizeUppfylld: normalizeUppfylld,
    isKundberoende: isKundberoende,
    kundberoendeAtgarder: kundberoendeAtgarder,
    suggestAtgardTyp: suggestAtgardTyp,
    typLabel: typLabel,
    parseKundState: parseKundState,
    readKundState: readKundState,
    serializeKundState: serializeKundState,
    tjanstEntry: tjanstEntry,
    readUppfylld: readUppfylld,
    parseOverride: parseOverride,
    validateForutsattningRow: validateForutsattningRow,
    validateKundState: validateKundState,
    assessTjanst: assessTjanst,
    scoredFromTjanst: scoredFromTjanst,
    applyToResidualItem: applyToResidualItem,
    buildGranskningslista: buildGranskningslista,
    buildMigreringsrapport: buildMigreringsrapport,
    isTrueHorses: isTrueHorses,
    kundFlags: kundFlags,
    triState: triState,
    fromTriState: fromTriState,
    isEjUppfylld: isEjUppfylld,
    readLagsUt: readLagsUt,
    listKundForutsattningar: listKundForutsattningar,
    suggestKompletterandeAtgard: suggestKompletterandeAtgard,
    buildForeslagnaAtgarder: buildForeslagnaAtgarder,
    applyApprovedAtgarder: applyApprovedAtgarder,
    foreslaUppdragsTyp: foreslaUppdragsTyp,
    buildUppdragsatgardText: buildUppdragsatgardText,
    pendingUppdragsatgarder: pendingUppdragsatgarder,
    mergeRiskAtgarderValda: mergeRiskAtgarderValda,
    buildForutsattningPromptBlock: buildForutsattningPromptBlock
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.TjanstForutsattning = api;
})(typeof window !== 'undefined' ? window : globalThis);
