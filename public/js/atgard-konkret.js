/**
 * Åtgärder i tjänst / övriga riskfaktorer måste beskriva vad byrån gör,
 * eller en konkret plan — inte en vag avsikt ("Inför striktare krav…").
 */
(function (global) {
  var SAVE_ERROR = 'Åtgärden är för vag. Skriv vad byrån faktiskt gör (eller en tydlig plan med när, vem och var), till exempel: «Underlag för alla transaktioner dokumenteras i bokslutsprogrammet.» Inte «Inför striktare krav…».';
  var HINT = 'Skriv vad ni gör i dag, eller en plan med när, vem och var. Inte en avsikt som «inför», «öka» eller «bör stärka».';
  var EXAMPLE = 'Underlag för alla transaktioner dokumenteras i bokslutsprogrammet.';
  var MIN_BESKRIVNING = 24;

  var AI_RULES = `ÅTGÄRDER — införda eller tydligt planerade, aldrig vaga avsikter:
- Varje åtgärd ska beskriva vad byrån FAKTISKT gör, eller en konkret plan (när, vem, var).
- Skriv i presens om åtgärden är på plats: "dokumenteras", "granskas", "stäms av", "sparas i".
- Ange var eller hur det görs (system, rutin, ansvarig), t.ex. "i bokslutsprogrammet", "i Fortnox", "av klientansvarig".
- Om åtgärden inte är införd ännu: skriv plan med datum och ansvarig, t.ex. "Från 1 oktober 2026 dokumenteras ROT-underlag i Fortnox. Ansvarig: klientansvarig."
- FÖRBJUDET: avsikter och rekommendationer utan införande. Exempel som INTE får användas: "Inför striktare krav…", "Öka dokumentationskrav", "Byrån bör stärka…", "Se över rutinerna", "Förbättra dokumentationen", "åtgärden ska införas".
- Bra exempel: "Underlag för alla transaktioner dokumenteras i bokslutsprogrammet."`;

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function parseAtgardList(raw) {
    if (Array.isArray(raw)) return raw.filter(function (x) { return x && (typeof x === 'object' || typeof x === 'string'); });
    if (raw == null || raw === '') return [];
    if (typeof raw === 'string') {
      var t = raw.trim();
      if (!t) return [];
      try {
        var parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed.filter(function (x) { return x != null; });
        if (parsed && typeof parsed === 'object') return [parsed];
      } catch (_) { /* löptext */ }
      return [{ beskrivning: t }];
    }
    if (typeof raw === 'object') return [raw];
    return [];
  }

  function itemText(item) {
    if (item == null) return '';
    if (typeof item === 'string') return trimStr(item);
    return [item.titel, item.title, item.namn, item.beskrivning, item.description, item.åtgärd, item.atgard]
      .map(trimStr)
      .filter(Boolean)
      .join(' ');
  }

  function itemBeskrivning(item) {
    if (item == null) return '';
    if (typeof item === 'string') return trimStr(item);
    return trimStr(item.beskrivning || item.description || item.åtgärd || item.atgard || '');
  }

  function normalize(text) {
    return trimStr(text).toLowerCase().replace(/\s+/g, ' ');
  }

  var VAGUE_RE = /\b(inför|införa|införs|öka|ökar|stärk|stärka|förbättra|se över|överväg|överväga|rekommendera|rekommenderas|bör|borde|skulle kunna|ska införas|kommer att införas|behöver införas|behöver stärkas|behöver förbättras)\b/i;
  var IMPLEMENTED_WORD_RE = /\b(införd|införda|på plats|ingår i rutin|ingår i rutinen|har implementerat|har infört|vi har)\b/i;
  var CONCRETE_VERB_RE = /\b(dokumenteras|dokumenterar|dokumentera|granskas|granskar|granska|kontrolleras|kontrollerar|kontrollera|stäms av|stämmer av|avstäms|sparas|sparar|arkiveras|arkiverar|signeras|signerar|loggas|registreras|följs upp|följer upp|utförs|utför|används|använder|förvaras|bokförs|bokför|attesteras|verifieras|matchas|görs|gör|körs|tas fram|lämnas in|informerar|informera|innehåller|övervakar|övervaka|implementerat|implementerar|automatiserar|automatisera)\b/i;
  var PLACE_RE = /\b(i|via|med)\s+\S{3,}|\b(fortnox|visma|bokslutsprogram|bokföringsprogram|bokföringsprogrammet|sie|klientmapp|klientpärm|sharepoint|bankid|kyc-flik|checklista|mall|rutin|uppdrag|körning|minibok|programvara)\b/i;
  var WHO_RE = /\b(klientansvarig|redovisningskonsult|medarbetare|ansvarig|byrån|vi|vår|våra|oss)\b/i;
  var PLAN_RE = /\b(planerad|planerat|planeras|tidplan|beslutad|ska vara på plats|införs den|införs från|från den|fr\.o\.m|f\.o\.m|senast)\b/i;
  var DATE_RE = /\b(20\d{2}|q[1-4]\s*20\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|januari|februari|mars|april|juni|juli|augusti|september|oktober|november|december)\b/i;

  function vagueTrigger(text) {
    var m = normalize(text).match(VAGUE_RE);
    return m ? m[1] : '';
  }

  function isVagueIntent(text) {
    var n = normalize(text);
    if (!vagueTrigger(n)) return false;
    if (/\bför att\s+(förbättra|öka|stärka|automatisera)\b/.test(n) && IMPLEMENTED_WORD_RE.test(n)) {
      return false;
    }
    if (IMPLEMENTED_WORD_RE.test(n) && !/\b(inför|införa|införs)\b/.test(n.replace(/\b(införd|införda)\b/g, ''))) {
      return VAGUE_RE.test(n.replace(/\b(införd|införda|på plats|har implementerat|har infört|vi har)\b/g, ''));
    }
    return true;
  }

  function rejectMessage(titel, reason, trigger) {
    var head = titel ? '«' + titel + '»: ' : '';
    if (reason === 'kort') {
      return head + 'Åtgärden är för kort. Skriv vad ni faktiskt gör, eller en plan med när, vem och var.';
    }
    if (trigger) {
      return head + 'Ordet «' + trigger + '» läses som en avsikt (inför/öka/förbättra/bör), inte som något ni redan gör. Skriv vad som faktiskt görs, till exempel: «Avstämningar görs automatiskt i Minibok.»';
    }
    return head + SAVE_ERROR;
  }

  function isConcretePractice(text) {
    var n = normalize(text);
    if (!CONCRETE_VERB_RE.test(n)) return false;
    return PLACE_RE.test(n) || WHO_RE.test(n);
  }

  function isClearPlan(text) {
    var n = normalize(text);
    if (!PLAN_RE.test(n)) return false;
    if (!(DATE_RE.test(n) || WHO_RE.test(n))) return false;
    return CONCRETE_VERB_RE.test(n) || PLACE_RE.test(n);
  }

  function assessAtgard(item) {
    var titel = typeof item === 'object' && item
      ? trimStr(item.titel || item.title || item.namn)
      : '';
    var beskrivning = itemBeskrivning(item);
    var text = itemText(item);
    if (!text) return { ok: true, empty: true };

    if (beskrivning.length < MIN_BESKRIVNING && text.length < MIN_BESKRIVNING + 8) {
      return { ok: false, reason: 'kort', error: rejectMessage(titel, 'kort', ''), titel: titel };
    }

    var concrete = isConcretePractice(text);
    var planned = isClearPlan(text);
    var vague = isVagueIntent(text);
    var trigger = vagueTrigger(text);

    if (vague && !concrete && !planned) {
      return {
        ok: false,
        reason: 'vag-avsikt',
        trigger: trigger,
        error: rejectMessage(titel, 'vag-avsikt', trigger),
        titel: titel
      };
    }
    if (concrete && !vague) return { ok: true, kind: 'inford' };
    if (planned) return { ok: true, kind: 'planerad' };
    // Vanlig löptext om vad som görs (aktiv form, infinitiv, "vi informerar…")
    // ska kunna sparas. Bara rena avsikter som «inför/öka/bör» stoppas.
    return { ok: true, kind: concrete ? 'inford' : 'praktik' };
  }

  function validateAtgarder(list, opts) {
    var o = opts || {};
    if (o.asDraft === true) return { ok: true, draft: true };
    var items = parseAtgardList(list);
    for (var i = 0; i < items.length; i++) {
      var check = assessAtgard(items[i]);
      if (check.empty) continue;
      if (!check.ok) {
        return {
          ok: false,
          error: check.error || SAVE_ERROR,
          index: i,
          titel: check.titel || '',
          reason: check.reason,
          trigger: check.trigger || ''
        };
      }
    }
    return { ok: true };
  }

  function validateAtgardText(text, opts) {
    var o = opts || {};
    if (o.asDraft === true) return { ok: true, draft: true };
    var t = trimStr(text);
    if (!t && o.required) return { ok: false, error: SAVE_ERROR };
    if (!t) return { ok: true, empty: true };
    return assessAtgard({ beskrivning: t });
  }

  var api = {
    SAVE_ERROR: SAVE_ERROR,
    HINT: HINT,
    EXAMPLE: EXAMPLE,
    MIN_BESKRIVNING: MIN_BESKRIVNING,
    AI_RULES: AI_RULES,
    parseAtgardList: parseAtgardList,
    itemText: itemText,
    isVagueIntent: isVagueIntent,
    isConcretePractice: isConcretePractice,
    isClearPlan: isClearPlan,
    assessAtgard: assessAtgard,
    validateAtgarder: validateAtgarder,
    validateAtgardText: validateAtgardText
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.AtgardKonkret = api;
})(typeof window !== 'undefined' ? window : globalThis);
