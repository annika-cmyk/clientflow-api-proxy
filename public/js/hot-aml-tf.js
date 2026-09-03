/**
 * Hot i byråns tjänsterisk måste vara PT/TF-tillvägagångssätt,
 * inte generell drift-, HR- eller kvalitetsrisk.
 */
(function (global) {
  var SAVE_ERROR = 'Hotet måste beskriva hur tjänsten kan utnyttjas för penningtvätt eller finansiering av terrorism. Inte drift-, HR- eller kvalitetsrisk som «ekonomiska förluster» eller «anställdas förtroende».';
  var HINT = 'Beskriv hur tjänsten kan användas för att dölja, legitimera eller flytta medel (PT). TF bara när underlaget stöder det. Inte skatteböter, ekonomiska förluster eller förtroende.';
  var EXAMPLE = 'Felaktiga eller överdrivna ROT/RUT-underlag kan användas för att legitimera kostnader, betalningar eller skattereduktioner.';

  var AI_RULES = `HOT — bara penningtvätt (PT) och finansiering av terrorism (TF):
- Varje hot ska vara ett tillvägagångssätt: hur tjänsten kan utnyttjas för att dölja, legitimera, skikta eller flytta brottsvinster, eller för att finansiera terrorism.
- Typ PT, TF eller Båda. Beskrivningen ska stämma med typen.
- Analysera ur AML-perspektiv, inte som allmän kvalitets-, skatte- eller affärsrisk.
- FÖRBJUDET: drift-, HR-, kvalitets-, skatte- eller affärsrisk utan PT/TF-koppling. Exempel som INTE får användas: "Felaktiga löneutbetalningar kan leda till ekonomiska förluster och påverka anställdas förtroende." "ekonomiska förluster och rättsliga åtgärder från Skatteverket."
- FÖRBJUDET: bank- eller finansinstitutsperspektiv (transaktionsmonitorering, kontouttag, betalningsflöden, SWIFT, kreditgivning) — byrån är redovisningsbyrå, inte bank.
- Dåligt: rykte, förtroende, arbetsmiljö, effektivitet, kundnöjdhet, "ekonomiska förluster" som enda konsekvens, skattetillägg eller myndighetsböter som enda skada.
- Fokusera på: felaktiga eller falska underlag, osanna fakturor, att transaktioner ges legitimitet, felaktiga utbetalningar eller skattereduktioner, byrån som legitimerande mellanled.
- Typiska AML-hot för redovisningsbyråer (Länsstyrelsen): kontantbetalda fakturor, osanna fakturor, kapitaltillskott utan underlag, lån, utlandsbetalningar.
- Prioritera de mest sannolika PT-huvudhoten. TF får nämnas försiktigt, inte som spekulativt huvudhot utan konkreta riskfaktorer i underlaget (t.ex. utlandsbetalning, högriskland).
- Dåligt TF-huvudhot: "Falska ROT/RUT-tjänster kan deklareras för att flytta pengar till organisationer som finansierar terrorism."
- Bra PT-huvudhot: "Felaktiga eller överdrivna ROT/RUT-underlag kan användas för att legitimera kostnader, betalningar eller skattereduktioner."
- Bra: "Oriktiga eller överdrivna löneutbetalningar kan användas för att dölja eller legitimera brottsvinster."
- Bra: "Anläggningstillgångar kan användas för att dölja eller legitimera medel."`;

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

  function parseHotList(raw) {
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
    return [item.titel, item.title, item.namn, item.beskrivning, item.description]
      .map(trimStr)
      .filter(Boolean)
      .join(' ');
  }

  var AML_SIGNAL_RE = /\b(penningtvatt|tvatta|terror|finansiering av terror|brottsvinst|brottsmedel|vinning av brott|dolja|legitimera|skikt|fiktiv|oriktig|osanna|skattereduktion|felaktiga underlag|svarta|malvakt|bulvan|kontant|otillat|slussa|kanalisera|medel fran brott|flytta medel|dolda medel|brottslig)/;

  function hasAmlTfSignal(text) {
    return AML_SIGNAL_RE.test(fold(text));
  }

  function assessHot(item) {
    var text = itemText(item);
    if (!text) return { ok: true, empty: true };
    if (hasAmlTfSignal(text)) return { ok: true, empty: false };
    return { ok: false, empty: false, error: SAVE_ERROR, hint: HINT };
  }

  function filterHots(raw) {
    return parseHotList(raw).filter(function (item) {
      return assessHot(item).ok && !assessHot(item).empty;
    });
  }

  function validateHots(raw, opts) {
    var asDraft = !!(opts && opts.asDraft);
    if (asDraft) return { ok: true };
    var items = parseHotList(raw);
    for (var i = 0; i < items.length; i++) {
      var check = assessHot(items[i]);
      if (check.empty) continue;
      if (!check.ok) return check;
    }
    return { ok: true };
  }

  var api = {
    SAVE_ERROR: SAVE_ERROR,
    HINT: HINT,
    EXAMPLE: EXAMPLE,
    AI_RULES: AI_RULES,
    assessHot: assessHot,
    filterHots: filterHots,
    validateHots: validateHots,
    hasAmlTfSignal: hasAmlTfSignal,
    parseHotList: parseHotList
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.HotAmlTf = api;
})(typeof window !== 'undefined' ? window : globalThis);
