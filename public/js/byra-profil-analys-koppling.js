/**
 * Koppling byråprofil-enkät (byråquiz) ↔ analyssidor.
 * Delas mellan Node-tester, enkäten och Övriga riskfaktorer / Vilka är våra kunder.
 *
 * Analysförslag på målsidorna filtreras av quiz-svar (Ja → visas, Nej → döljs)
 * via ByraProfilRiskForslag / KundriskerProfilAnalysForslag.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ByraProfilAnalysKoppling = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TJANSTER_TARGET = {
    fokus: '',
    pageHref: 'riskbedomning-byra.html',
    ctaLabel: 'Öppna Byråns tjänster',
    shortLabel: 'Byråns tjänster',
    pageTitle: 'Byråns tjänster',
    hint:
      'Svar om tjänsternas karaktär och tjänster med förhöjd risk används som underlag på Byråns tjänster.'
  };

  var VERKSAMHET_TARGET = {
    fokus: 'verksamhet',
    pageHref: 'ovriga-riskfaktorer.html',
    ctaLabel: 'Bedöm verksamhetsspecifika risker',
    shortLabel: 'Verksamhetsspecifika riskfaktorer',
    pageTitle: 'Övriga riskfaktorer',
    hint:
      'Svaren här används som underlag för verksamhetsspecifika riskfaktorer under Övriga riskfaktorer.'
  };

  /**
   * Äldre sektion-id:n som slagits ihop i enkäten.
   * beroende + outsourcing → intern; hogrisktjanster → tjanster.
   */
  var SECTION_ALIASES = {
    beroende: 'intern',
    outsourcing: 'intern',
    hogrisktjanster: 'tjanster'
  };

  /**
   * Quiz-sektion → analyssida.
   * fokus används som ?fokus= på Övriga / AR (scroll till riskgrupp eller block).
   *
   * Mapping:
   * 1 intern (+beroende +outsourcing) → Övriga verksamhetsspecifika
   * 2 kundstock → Vilka är våra kunder
   * 3 distribution → Övriga distributionskanaler
   * 4 tjanster (+hogrisktjanster) → Byråns tjänster
   * 5 geografi → Övriga geografisk risk (byråns marknad)
   * 6 historik → Allmän riskbedömning byrå (ny sektion)
   * 9 kundintro → Vilka är våra kunder
   */
  var TARGETS = {
    intern: Object.assign({ sectionId: 'intern' }, VERKSAMHET_TARGET),
    kundstock: {
      sectionId: 'kundstock',
      fokus: '',
      pageHref: 'kundrisker-mm.html',
      ctaLabel: 'Se på Vilka är våra kunder',
      shortLabel: 'Vilka är våra kunder',
      pageTitle: 'Vilka är våra kunder',
      hint:
        'Svaren syns under Från byråprofilen på Vilka är våra kunder och driver analysförslag där.'
    },
    distribution: {
      sectionId: 'distribution',
      fokus: 'distribution',
      pageHref: 'ovriga-riskfaktorer.html',
      ctaLabel: 'Bedöm distributionskanaler',
      shortLabel: 'Distributionskanaler',
      pageTitle: 'Övriga riskfaktorer',
      hint:
        'Svaren här används som underlag för sektionen Distributionskanaler under Övriga riskfaktorer.'
    },
    tjanster: Object.assign({ sectionId: 'tjanster' }, TJANSTER_TARGET),
    hogrisktjanster: Object.assign(
      { sectionId: 'hogrisktjanster' },
      TJANSTER_TARGET,
      {
        hint:
          'Bolagsbildning, nominee, säte/postadress och känsliga fullmakter ingår nu i steget Byråns tjänster.'
      }
    ),
    geografi: {
      sectionId: 'geografi',
      fokus: 'geografi',
      pageHref: 'ovriga-riskfaktorer.html',
      ctaLabel: 'Bedöm geografisk risk',
      shortLabel: 'Geografisk risk',
      pageTitle: 'Övriga riskfaktorer',
      hint:
        'Byråns geografiska marknad bedöms under Övriga riskfaktorer. Kunder i utsatta områden och övrig kundgeo hör hemma under Vilka är våra kunder.'
    },
    historik: {
      sectionId: 'historik',
      fokus: 'historik',
      pageHref: 'allman-riskbedomning-byra.html',
      ctaLabel: 'Se historik i allmän riskbedömning',
      shortLabel: 'Historik och track record',
      pageTitle: 'Allmän riskbedömning byrå',
      hint:
        'Avvikelserapporter, tillsynsanmärkningar och near misses syns som underlag under Historik och track record i allmän riskbedömning — där kan ni också skriva och generera analys.'
    },
    beroende: Object.assign(
      { sectionId: 'beroende' },
      VERKSAMHET_TARGET,
      {
        hint:
          'Ekonomiska beroenden ingår nu i Byråns interna profil och ger verksamhetsspecifika förslag under Övriga riskfaktorer.'
      }
    ),
    kundintro: {
      sectionId: 'kundintro',
      fokus: '',
      pageHref: 'kundrisker-mm.html',
      ctaLabel: 'Se på Vilka är våra kunder',
      shortLabel: 'Vilka är våra kunder',
      pageTitle: 'Vilka är våra kunder',
      hint:
        'Svar om kundens ursprung syns under Från byråprofilen på Vilka är våra kunder.'
    },
    outsourcing: Object.assign(
      { sectionId: 'outsourcing' },
      VERKSAMHET_TARGET,
      {
        hint:
          'Outsourcing ingår nu i Byråns interna profil och ger verksamhetsspecifika förslag under Övriga riskfaktorer.'
      }
    )
  };

  /** Profilfält → enkätsektion (för chip-länkar på Övriga). Canonical efter merge. */
  var FIELD_ENKATE_SECTION = {
    antalAnstallda: 'intern',
    lopandeUtbildning: 'intern',
    personalomsattning: 'intern',
    storaKundberoenden: 'intern',
    outsourcingUnderleverantorer: 'intern',
    leveranssatt: 'distribution',
    bankIdKrav: 'distribution',
    geografiskMarknad: 'geografi',
    betalningsuppdrag: 'tjanster',
    bolagsbildningAtKund: 'tjanster',
    styrelseEllerNomineeRoller: 'tjanster',
    satePostadress: 'tjanster',
    fullmaktBolagsverket: 'tjanster',
    nearMisses: 'historik',
    lanstyrelsenAnmarkningar: 'historik'
  };

  function trimStr(value) {
    return value == null ? '' : String(value).trim();
  }

  function canonicalSectionId(sectionId) {
    var id = trimStr(sectionId).toLowerCase();
    return SECTION_ALIASES[id] || id;
  }

  function targetForSection(sectionId) {
    var id = trimStr(sectionId).toLowerCase();
    if (TARGETS[id]) return TARGETS[id];
    var canon = canonicalSectionId(id);
    return TARGETS[canon] || null;
  }

  function analysisHref(sectionId) {
    var t = targetForSection(sectionId);
    if (!t) return '';
    if (t.fokus) {
      return t.pageHref + '?fokus=' + encodeURIComponent(t.fokus);
    }
    return t.pageHref;
  }

  function enkateHref(sectionId) {
    var id = canonicalSectionId(sectionId);
    if (!id) return 'byra-profil-enkate.html';
    return 'byra-profil-enkate.html?section=' + encodeURIComponent(id);
  }

  function enkateSectionForFokus(fokus) {
    var key = trimStr(fokus).toLowerCase();
    if (key === 'verksamhet') return 'intern';
    if (key === 'distribution') return 'distribution';
    if (key === 'geografi') return 'geografi';
    if (key === 'historik') return 'historik';
    return '';
  }

  function enkateHrefForFokus(fokus) {
    var section = enkateSectionForFokus(fokus);
    return section ? enkateHref(section) : 'byra-profil-enkate.html';
  }

  function enkateSectionForFieldKey(fieldKey) {
    return FIELD_ENKATE_SECTION[trimStr(fieldKey)] || '';
  }

  function fokusFromUrlSearch(search) {
    try {
      var q = new URLSearchParams(typeof search === 'string' ? search : String(search || ''));
      return trimStr(q.get('fokus')).toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function isKnownFokus(fokus) {
    var key = trimStr(fokus).toLowerCase();
    return key === 'verksamhet' || key === 'distribution' || key === 'geografi' || key === 'historik';
  }

  return {
    TARGETS: TARGETS,
    SECTION_ALIASES: SECTION_ALIASES,
    FIELD_ENKATE_SECTION: FIELD_ENKATE_SECTION,
    canonicalSectionId: canonicalSectionId,
    targetForSection: targetForSection,
    analysisHref: analysisHref,
    enkateHref: enkateHref,
    enkateSectionForFokus: enkateSectionForFokus,
    enkateHrefForFokus: enkateHrefForFokus,
    enkateSectionForFieldKey: enkateSectionForFieldKey,
    fokusFromUrlSearch: fokusFromUrlSearch,
    isKnownFokus: isKnownFokus
  };
});
