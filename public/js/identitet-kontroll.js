/**
 * Identitetskontroll per person under Roller.
 * Format: «Identitet kontrollerad [datum] via [metod]»
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

  function fromPerson(person) {
    var p = person || {};
    return {
      datum: formatDatum(p.identitetKontrolleradDatum || p.identitet_kontrollerad_datum || ''),
      metod: trimStr(p.identitetKontrolleradMetod || p.identitet_kontrollerad_metod || ''),
      metodLabel: methodLabel(p.identitetKontrolleradMetod || p.identitet_kontrollerad_metod || '')
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

  function applyToPerson(person, datum, metod) {
    var next = Object.assign({}, person || {});
    var d = formatDatum(datum);
    var m = trimStr(metod);
    if (d) next.identitetKontrolleradDatum = d;
    else delete next.identitetKontrolleradDatum;
    if (m) next.identitetKontrolleradMetod = m;
    else delete next.identitetKontrolleradMetod;
    return next;
  }

  var api = {
    METHODS: METHODS,
    methodLabel: methodLabel,
    formatDatum: formatDatum,
    fromPerson: fromPerson,
    formatLabel: formatLabel,
    applyToPerson: applyToPerson
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.IdentitetKontroll = api;
})(typeof window !== 'undefined' ? window : globalThis);
