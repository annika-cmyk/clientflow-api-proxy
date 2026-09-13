/**
 * Föreslagna övriga riskfaktorer utifrån byråprofil (fakta → bedömning).
 * Delas mellan Node-tester och övriga-riskfaktorer-sidan.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ByraProfilRiskForslag = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TYP_VERKSAMHET = 'Verksamhetsspecifika riskfaktorer';
  var TYP_DISTRIBUTION = 'Distrubutionskanaler';

  var SUMMARY_KEYS = [
    { key: 'antalAnstallda', label: 'Anställda' },
    { key: 'leveranssatt', label: 'Leveranssätt' },
    { key: 'bankIdKrav', label: 'BankID' },
    { key: 'geografiskMarknad', label: 'Byråns geografiska marknad' },
    { key: 'lopandeUtbildning', label: 'Löpande utbildning' },
    { key: 'personalomsattning', label: 'Personalomsättning' },
    { key: 'outsourcingUnderleverantorer', label: 'Outsourcing' },
    { key: 'betalningsuppdrag', label: 'Betalningsuppdrag' }
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

  var LEVERANS_ENDAST_DISTANS = [
    'distans',
    'vi träffar kunder endast på distans'
  ];
  var LEVERANS_BLANDAD = [
    'blandat',
    'vi träffar kunder både fysiskt ibland och digitalt regelbundet',
    'onboarding fysiskt, därefter främst distans',
    'blandad modell – varierar kraftigt mellan kunder',
    'blandad modell - varierar kraftigt mellan kunder'
  ];

  function isLeveransEndastDistans(value) {
    return LEVERANS_ENDAST_DISTANS.indexOf(fold(value)) !== -1;
  }

  function isLeveransBlandad(value) {
    return LEVERANS_BLANDAD.indexOf(fold(value)) !== -1;
  }

  function isLeveransMedDistans(value) {
    return isLeveransEndastDistans(value) || isLeveransBlandad(value);
  }

  function isAnswered(value) {
    if (value == null) return false;
    if (Array.isArray(value)) return value.some(function (v) { return trimStr(v); });
    return trimStr(value) !== '';
  }

  function numOrNull(value) {
    if (value == null || value === '') return null;
    var n = Number(String(value).replace(',', '.').replace(/\s+/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function percentOrNull(value) {
    var n = numOrNull(value);
    if (n == null) return null;
    if (n <= 1 && String(value).indexOf('%') === -1) n = n * 100;
    return n;
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

  function marknadSuggestsAbroad(marknad) {
    var t = fold(marknad);
    if (!t) return false;
    return /norge|danmark|finland|utland|europa|eu\b|ukrain|usa|kin[ae]|asia|afrika|mellanöstern|mellanostern|internation|gränsöverskrid|gransoverskrid/.test(t);
  }

  function suggestFromProfil(profil) {
    var p = profil || {};
    var out = [];
    var seen = Object.create(null);

    function add(row) {
      if (!row || !row.id || seen[row.id]) return;
      seen[row.id] = true;
      out.push(row);
    }

    var anstallda = numOrNull(p.antalAnstallda);
    if (anstallda != null && anstallda <= 1) {
      add({
        id: 'enmansbyra',
        typ: TYP_VERKSAMHET,
        riskfaktor: 'Enmansbyrå / begränsad fyraögonprincip',
        triggerLabel: '1 anställd',
        beskrivning:
          'När byrån i praktiken är en person saknas naturlig intern fyrögonkontroll. Fel, oegentligheter eller påtryckningar kan passera utan oberoende granskning.',
        ptTf: 'Båda',
        why: 'Byråprofil: antal anställda ≤ 1'
      });
    } else if (anstallda != null && anstallda <= 3) {
      add({
        id: 'liten-byra',
        typ: TYP_VERKSAMHET,
        riskfaktor: 'Liten organisation med begränsad intern kontrollkapacitet',
        triggerLabel: anstallda + ' anställda',
        beskrivning:
          'Få medarbetare innebär att samma person ofta både utför och granskar. Det ökar risken att avvikelser inte fångas i tid.',
        ptTf: 'Båda',
        why: 'Byråprofil: antal anställda ≤ 3'
      });
    }

    var leverans = trimStr(p.leveranssatt);
    if (isLeveransEndastDistans(leverans)) {
      add({
        id: 'distans-leverans',
        typ: TYP_DISTRIBUTION,
        riskfaktor: 'Distansrelation utan fysiskt möte',
        triggerLabel: 'Endast distans',
        beskrivning:
          'När kundrelation och onboarding sker helt på distans blir det svårare att verifiera identitet, avsikt och verklig huvudman jämfört med fysiskt möte.',
        ptTf: 'Båda',
        why: 'Byråprofil: leveranssätt endast distans'
      });
    } else if (isLeveransBlandad(leverans)) {
      add({
        id: 'blandad-leverans',
        typ: TYP_DISTRIBUTION,
        riskfaktor: 'Blandad distans- och fysisk kundkontakt',
        triggerLabel: 'Blandad / hybrid',
        beskrivning:
          'Blandade kanaler kräver konsekventa kontroller oavsett om kunden möts fysiskt eller digitalt — annars uppstår luckor i identifiering och uppföljning.',
        ptTf: 'Båda',
        why: 'Byråprofil: leveranssätt blandad/hybrid'
      });
    }

    var bankId = trimStr(p.bankIdKrav);
    if (
      isLeveransMedDistans(leverans) &&
      (bankId === 'Nej' || bankId === 'Ibland')
    ) {
      add({
        id: 'svag-bankid',
        typ: TYP_DISTRIBUTION,
        riskfaktor: 'Digital onboarding med svag identitetskontroll',
        triggerLabel: 'BankID: ' + bankId,
        beskrivning:
          'Distans-/digital onboarding utan konsekvent BankID-krav försvagar spårbar identitetskontroll och ökar risken för felaktig eller kapad identitet.',
        ptTf: 'Båda',
        why: 'Byråprofil: digital leverans + BankID ' + bankId
      });
    }

    if (trimStr(p.lopandeUtbildning) === 'Nej') {
      add({
        id: 'saknad-utbildning',
        typ: TYP_VERKSAMHET,
        riskfaktor: 'Bristande löpande AML-utbildning',
        triggerLabel: 'Utbildning: Nej',
        beskrivning:
          'Utan löpande AML-/PT-utbildning ökar risken att personal missar varningssignaler, nya typologier eller interna rutiner.',
        ptTf: 'Båda',
        why: 'Byråprofil: löpande utbildning = Nej'
      });
    }

    if (trimStr(p.personalomsattning) === 'Hög') {
      add({
        id: 'hog-personalomsattning',
        typ: TYP_VERKSAMHET,
        riskfaktor: 'Hög personalomsättning',
        triggerLabel: 'Personalomsättning: Hög',
        beskrivning:
          'Hög omsättning av personal försvagar institutionellt minne kring kundrisker, historik och varför vissa kontroller införts.',
        ptTf: 'Båda',
        why: 'Byråprofil: personalomsättning Hög'
      });
    }

    if (trimStr(p.outsourcingUnderleverantorer) === 'Ja') {
      add({
        id: 'outsourcing',
        typ: TYP_VERKSAMHET,
        riskfaktor: 'Outsourcing av delar av produktionen',
        triggerLabel: 'Outsourcing: Ja',
        beskrivning:
          'När delar av byråns egen leverans utförs av externa parter uppstår sårbarheter kring kontroll, tystnadsplikt, spårbarhet och eventuellt utlandskoppling.',
        ptTf: 'Båda',
        why: 'Byråprofil: outsourcing = Ja'
      });
    }

    if (trimStr(p.betalningsuppdrag) === 'Ja') {
      add({
        id: 'betalningsuppdrag',
        typ: TYP_VERKSAMHET,
        riskfaktor: 'Betalningsuppdrag åt kunder',
        triggerLabel: 'Betalningsuppdrag: Ja',
        beskrivning:
          'Behörighet att genomföra betalningar åt kunder är en förhöjd riskfaktor: byrån kan bli kanal för otillåtna flöden om uppdraget missbrukas.',
        ptTf: 'PT',
        why: 'Byråprofil: betalningsuppdrag = Ja'
      });
    }

    var marknad = trimStr(p.geografiskMarknad);
    var andelIntl = percentOrNull(p.andelInternationellHandel);
    if (marknadSuggestsAbroad(marknad) || (andelIntl != null && andelIntl >= 20)) {
      add({
        id: 'byra-marknad-geo',
        typ: TYP_VERKSAMHET,
        riskfaktor: 'Byråns geografiska marknad / gränsöverskridande exponering',
        triggerLabel: marknad ? 'Marknad ifylld' : 'Internationell andel',
        beskrivning:
          'Byråns egna marknad och eventuell gränsöverskridande verksamhet (skild från kundens hemvist) påverkar vilka geografiska risker som behöver vägas in i arbetssätt och kontroller.',
        ptTf: 'Båda',
        why: marknad
          ? 'Byråprofil: geografisk marknad'
          : 'Byråprofil: andel internationell handel ≥ 20 %'
      });
    }

    return out;
  }

  function existingRiskNameSet(risks) {
    var set = Object.create(null);
    (risks || []).forEach(function (risk) {
      var fields = (risk && risk.fields) || risk || {};
      var name = fold(fields.Riskfaktor || fields['Riskfaktor'] || fields.namn || '');
      if (name) set[name] = true;
    });
    return set;
  }

  function filterOpenSuggestions(suggestions, risks, dismissedIds) {
    var existing = existingRiskNameSet(risks);
    var dismissed = Object.create(null);
    (dismissedIds || []).forEach(function (id) {
      if (id) dismissed[String(id)] = true;
    });
    return (suggestions || []).filter(function (s) {
      if (!s || !s.id) return false;
      if (dismissed[s.id]) return false;
      if (existing[fold(s.riskfaktor)]) return false;
      return true;
    });
  }

  return {
    isLeveransEndastDistans: isLeveransEndastDistans,
    isLeveransBlandad: isLeveransBlandad,
    isLeveransMedDistans: isLeveransMedDistans,
    TYP_VERKSAMHET: TYP_VERKSAMHET,
    TYP_DISTRIBUTION: TYP_DISTRIBUTION,
    SUMMARY_KEYS: SUMMARY_KEYS,
    buildProfilSummary: buildProfilSummary,
    suggestFromProfil: suggestFromProfil,
    filterOpenSuggestions: filterOpenSuggestions,
    existingRiskNameSet: existingRiskNameSet,
    fold: fold
  };
});
