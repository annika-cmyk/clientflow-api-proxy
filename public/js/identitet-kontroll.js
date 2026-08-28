/**
 * Identitetskontroll och VH-registerkontroll per person under Roller.
 * - «Identitet kontrollerad [datum] via [metod]»
 * - «Huvudman kontrollerad mot Bolagsverket [datum]»
 */
(function (global) {
  var METHODS = [
    { id: 'bankid_clientflow', label: 'BankID via ClientFlow' },
    { id: 'bankid_utanfor', label: 'BankID utanför ClientFlow' },
    { id: 'fysiskt', label: 'Fysiskt möte (legitimation uppvisad)' },
    { id: 'vidimerad', label: 'Vidimerad kopia (pass/körkort) på distans' },
    { id: 'fore_clientflow', label: 'Kontrollerad före ClientFlow' },
    { id: 'annat', label: 'Annat' }
  ];

  function trimStr(value) {
    return value == null ? '' : String(value).trim();
  }

  function methodLabel(idOrLabel) {
    var raw = trimStr(idOrLabel);
    if (!raw) return '';
    for (var i = 0; i < METHODS.length; i += 1) {
      if (METHODS[i].id === raw || METHODS[i].label === raw) return METHODS[i].label;
    }
    return raw;
  }

  function formatDatum(raw) {
    var s = trimStr(raw);
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    try {
      var d = new Date(s);
      if (Number.isNaN(d.getTime())) return s;
      return d.toISOString().slice(0, 10);
    } catch (_) {
      return s;
    }
  }

  function hasHuvudmanRoll(personOrRoller) {
    var list = [];
    if (Array.isArray(personOrRoller)) list = personOrRoller;
    else if (personOrRoller && Array.isArray(personOrRoller.roller)) list = personOrRoller.roller;
    else if (personOrRoller && personOrRoller.roll) list = [personOrRoller.roll];
    return list.some(function (r) {
      return /verklig\s+huvudman/i.test(String(r || '').trim());
    });
  }

  function fromPerson(person) {
    var p = person || {};
    return {
      datum: formatDatum(p.identitetKontrolleradDatum || p.identitet_kontrollerad_datum || ''),
      metod: trimStr(p.identitetKontrolleradMetod || p.identitet_kontrollerad_metod || ''),
      metodLabel: methodLabel(p.identitetKontrolleradMetod || p.identitet_kontrollerad_metod || ''),
      huvudmanBolagsverketDatum: formatDatum(
        p.huvudmanKontrolleradBolagsverketDatum
        || p.huvudman_kontrollerad_bolagsverket_datum
        || ''
      )
    };
  }

  function formatLabel(person) {
    var hit = fromPerson(person);
    if (!hit.datum && !hit.metodLabel) return '';
    if (hit.datum && hit.metodLabel) {
      return 'Identitet kontrollerad ' + hit.datum + ' via ' + hit.metodLabel;
    }
    if (hit.datum) return 'Identitet kontrollerad ' + hit.datum;
    return 'Identitet kontrollerad via ' + hit.metodLabel;
  }

  function formatHuvudmanBolagsverketLabel(person) {
    var hit = fromPerson(person);
    if (!hit.huvudmanBolagsverketDatum) return '';
    return 'Huvudman kontrollerad mot Bolagsverket ' + hit.huvudmanBolagsverketDatum;
  }

  function applyToPerson(person, datum, metod, huvudmanBolagsverketDatum) {
    var next = Object.assign({}, person || {});
    var d = formatDatum(datum);
    var m = trimStr(metod);
    var hv = formatDatum(huvudmanBolagsverketDatum);
    if (d) next.identitetKontrolleradDatum = d;
    else delete next.identitetKontrolleradDatum;
    if (m) next.identitetKontrolleradMetod = m;
    else delete next.identitetKontrolleradMetod;
    if (hv) next.huvudmanKontrolleradBolagsverketDatum = hv;
    else delete next.huvudmanKontrolleradBolagsverketDatum;
    return next;
  }

  var api = {
    METHODS: METHODS,
    methodLabel: methodLabel,
    formatDatum: formatDatum,
    hasHuvudmanRoll: hasHuvudmanRoll,
    fromPerson: fromPerson,
    formatLabel: formatLabel,
    formatHuvudmanBolagsverketLabel: formatHuvudmanBolagsverketLabel,
    applyToPerson: applyToPerson
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.IdentitetKontroll = api;
})(typeof window !== 'undefined' ? window : globalThis);
