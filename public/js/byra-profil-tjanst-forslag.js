/**
 * Föreslagna tjänstekort utifrån byråprofil (högrisktjänster / betalningsuppdrag).
 * Delas mellan Node-tester och Byråns tjänster-sidan.
 *
 * Analysförslag filtreras av quiz-svar: Ja (eller Delvis) → visas, Nej/tomt → döljs.
 * Samma negativa filter som ByraProfilRiskForslag på Övriga riskfaktorer.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ByraProfilTjanstForslag = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SUMMARY_KEYS = [
    { key: 'betalningsuppdrag', label: 'Betalningsuppdrag' },
    { key: 'bolagsbildningAtKund', label: 'Bolagsbildning' },
    { key: 'styrelseEllerNomineeRoller', label: 'Styrelse/nominee' },
    { key: 'satePostadress', label: 'Säte/postadress' },
    { key: 'fullmaktBolagsverket', label: 'Bolagsverket-fullmakt' },
    { key: 'ombudSkatteprocesser', label: 'Ombud skatteprocess' },
    { key: 'generalfullmaktMyndighet', label: 'Generalfullmakt' }
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

  function isYes(value) {
    return fold(value) === 'ja';
  }

  function isYesOrPartial(value) {
    var t = fold(value);
    return t === 'ja' || t === 'delvis';
  }

  function isAnswered(value) {
    if (value == null) return false;
    if (Array.isArray(value)) return value.some(function (v) { return trimStr(v); });
    return trimStr(value) !== '';
  }

  function displayValue(value) {
    if (!isAnswered(value)) return '';
    if (Array.isArray(value)) return value.map(trimStr).filter(Boolean).join(', ');
    return trimStr(value);
  }

  function buildProfilSummary(profil) {
    var p = profil || {};
    return SUMMARY_KEYS.map(function (row) {
      var raw = p[row.key];
      return {
        key: row.key,
        label: row.label,
        value: displayValue(raw),
        answered: isAnswered(raw)
      };
    });
  }

  function suggestTjansterFromProfil(profil) {
    var p = profil || {};
    var out = [];
    var seen = Object.create(null);

    function add(row) {
      if (!row || !row.id || seen[row.id]) return;
      seen[row.id] = true;
      out.push(row);
    }

    if (isYes(p.betalningsuppdrag)) {
      add({
        id: 'tjanst-betalningsuppdrag',
        mallId: 'betalningsuppdrag',
        namn: 'Betalningsuppdrag och betalningshantering',
        triggerLabel: 'Betalningsuppdrag: Ja',
        beskrivning:
          'Behörighet att genomföra betalningar åt kunder är en tjänst med förhöjd risk — byrån kan bli kanal för otillåtna flöden om uppdraget missbrukas.',
        why: 'Byråprofil: betalningsuppdrag = Ja'
      });
    }

    if (isYesOrPartial(p.bolagsbildningAtKund)) {
      add({
        id: 'tjanst-bolagsbildning',
        mallId: '',
        namn: 'Bolagsbildning åt kund',
        triggerLabel: 'Bolagsbildning: ' + trimStr(p.bolagsbildningAtKund),
        beskrivning:
          'Att bilda bolag åt kunder är en tjänst med förhöjd risk — kan användas för målvaktsupplägg, snabb omsättning av skalbolag och dolda ägarförhållanden.',
        why: 'Byråprofil: bolagsbildning = ' + trimStr(p.bolagsbildningAtKund)
      });
    }

    if (isYesOrPartial(p.styrelseEllerNomineeRoller)) {
      add({
        id: 'tjanst-nominee-styrelse',
        mallId: '',
        namn: 'Styrelseuppdrag eller nominee-liknande roller',
        triggerLabel: 'Styrelse/nominee: ' + trimStr(p.styrelseEllerNomineeRoller),
        beskrivning:
          'När byrån tar styrelse- eller nominee-liknande roller för kunds räkning ökar risken för att byrån används som skylt eller för att dölja verklig kontroll.',
        why: 'Byråprofil: styrelse/nominee = ' + trimStr(p.styrelseEllerNomineeRoller)
      });
    }

    if (isYesOrPartial(p.satePostadress)) {
      add({
        id: 'tjanst-sate-postadress',
        mallId: '',
        namn: 'Säte / postadress åt kunder',
        triggerLabel: 'Säte/postadress: ' + trimStr(p.satePostadress),
        beskrivning:
          'Att tillhandahålla säte eller postadress åt kunder är en klassisk högrisktjänst kopplad till brevlådeföretag och svag faktisk verksamhet.',
        why: 'Byråprofil: säte/postadress = ' + trimStr(p.satePostadress)
      });
    }

    if (isYesOrPartial(p.fullmaktBolagsverket)) {
      add({
        id: 'tjanst-fullmakt-bolagsverket',
        mallId: '',
        namn: 'Fullmakt hos Bolagsverket',
        triggerLabel: 'Bolagsverket-fullmakt: ' + trimStr(p.fullmaktBolagsverket),
        beskrivning:
          'Fullmakt att ändra styrelse, firmatecknare eller adress hos Bolagsverket är känsligare än vanligt ombud och kan missbrukas vid bolagskapning.',
        why: 'Byråprofil: Bolagsverket-fullmakt = ' + trimStr(p.fullmaktBolagsverket)
      });
    }

    if (isYesOrPartial(p.ombudSkatteprocesser)) {
      add({
        id: 'tjanst-ombud-skatteprocesser',
        mallId: '',
        namn: 'Ombud i skatteprocesser / tvister',
        triggerLabel: 'Ombud skatteprocess: ' + trimStr(p.ombudSkatteprocesser),
        beskrivning:
          'Att företräda kunder i utredning, revision eller överklagande hos Skatteverket är en mer känslig tjänst än löpande deklaration och kräver tydlig riskbedömning.',
        why: 'Byråprofil: ombud skatteprocess = ' + trimStr(p.ombudSkatteprocesser)
      });
    }

    if (isYesOrPartial(p.generalfullmaktMyndighet)) {
      add({
        id: 'tjanst-generalfullmakt',
        mallId: '',
        namn: 'Generalfullmakt / obegränsad myndighetsfullmakt',
        triggerLabel: 'Generalfullmakt: ' + trimStr(p.generalfullmaktMyndighet),
        beskrivning:
          'Generalfullmakt eller obegränsad myndighetsfullmakt ger bred behörighet som ökar risken för missbruk jämfört med avgränsad fullmakt för ett ärendeslag.',
        why: 'Byråprofil: generalfullmakt = ' + trimStr(p.generalfullmaktMyndighet)
      });
    }

    return out;
  }

  function existingTjanstNameSet(catalogCards, risks, nameMatchFn) {
    var set = Object.create(null);
    var mallIds = Object.create(null);
    var originals = [];
    var match = typeof nameMatchFn === 'function' ? nameMatchFn : null;

    function addName(name) {
      var raw = trimStr(name);
      var n = fold(raw);
      if (!n) return;
      set[n] = true;
      originals.push(raw);
    }

    (catalogCards || []).forEach(function (card) {
      var template = (card && card.template) || {};
      var entry = (card && card.entry) || {};
      if (template.id) mallIds[String(template.id)] = true;
      addName(template.name || entry.namn || '');
    });

    (risks || []).forEach(function (risk) {
      var fields = (risk && risk.fields) || risk || {};
      addName(fields['Task Name'] || fields.namn || '');
    });

    return { names: set, originals: originals, mallIds: mallIds, nameMatch: match };
  }

  function suggestionAlreadyPresent(suggestion, existing) {
    if (!suggestion || !existing) return false;
    if (suggestion.mallId && existing.mallIds[String(suggestion.mallId)]) return true;
    var wanted = fold(suggestion.namn);
    if (wanted && existing.names[wanted]) return true;
    if (existing.nameMatch && suggestion.namn) {
      var list = existing.originals || [];
      for (var i = 0; i < list.length; i++) {
        if (existing.nameMatch(suggestion.namn, list[i])) return true;
      }
    }
    return false;
  }

  function filterOpenSuggestions(suggestions, catalogCards, risks, dismissedIds, nameMatchFn) {
    var existing = existingTjanstNameSet(catalogCards, risks, nameMatchFn);
    var dismissed = Object.create(null);
    (dismissedIds || []).forEach(function (id) {
      if (id) dismissed[String(id)] = true;
    });
    return (suggestions || []).filter(function (s) {
      if (!s || !s.id) return false;
      if (dismissed[s.id]) return false;
      if (suggestionAlreadyPresent(s, existing)) return false;
      return true;
    });
  }

  return {
    isYes: isYes,
    isYesOrPartial: isYesOrPartial,
    SUMMARY_KEYS: SUMMARY_KEYS,
    buildProfilSummary: buildProfilSummary,
    suggestTjansterFromProfil: suggestTjansterFromProfil,
    filterOpenSuggestions: filterOpenSuggestions,
    existingTjanstNameSet: existingTjanstNameSet,
    suggestionAlreadyPresent: suggestionAlreadyPresent,
    fold: fold
  };
});
