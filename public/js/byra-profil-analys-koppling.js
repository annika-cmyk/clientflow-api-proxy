/**
 * Koppling byråprofil-enkät (byråquiz) ↔ analyssidor.
 * Delas mellan Node-tester, enkäten och Övriga riskfaktorer / Vilka är våra kunder.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ByraProfilAnalysKoppling = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Quiz-sektion → analyssida.
   * fokus används som ?fokus= på Övriga riskfaktorer (scroll till riskgrupp).
   */
  var TARGETS = {
    intern: {
      sectionId: 'intern',
      fokus: 'verksamhet',
      pageHref: 'ovriga-riskfaktorer.html',
      ctaLabel: 'Bedöm verksamhetsspecifika risker',
      shortLabel: 'Verksamhetsspecifika riskfaktorer',
      pageTitle: 'Övriga riskfaktorer',
      hint:
        'Svaren här används som underlag för verksamhetsspecifika riskfaktorer under Övriga riskfaktorer.'
    },
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
    geografi: {
      sectionId: 'geografi',
      fokus: '',
      pageHref: 'kundrisker-mm.html',
      ctaLabel: 'Se på Vilka är våra kunder',
      shortLabel: 'Vilka är våra kunder',
      pageTitle: 'Vilka är våra kunder',
      hint:
        'Geografisvar syns under Från byråprofilen på Vilka är våra kunder.'
    },
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
    distribution: {
      sectionId: 'distribution',
      fokus: 'distribution',
      pageHref: 'ovriga-riskfaktorer.html',
      ctaLabel: 'Bedöm distributionskanaler',
      shortLabel: 'Distributionskanaler',
      pageTitle: 'Övriga riskfaktorer',
      hint:
        'Svaren här används som underlag för sektionen Distributionskanaler under Övriga riskfaktorer.'
    }
  };

  /** Profilfält → enkätsektion (för chip-länkar på Övriga). */
  var FIELD_ENKATE_SECTION = {
    antalAnstallda: 'intern',
    lopandeUtbildning: 'intern',
    personalomsattning: 'intern',
    leveranssatt: 'distribution',
    bankIdKrav: 'distribution',
    geografiskMarknad: 'geografi',
    outsourcingUnderleverantorer: 'outsourcing',
    betalningsuppdrag: 'hogrisktjanster'
  };

  function trimStr(value) {
    return value == null ? '' : String(value).trim();
  }

  function targetForSection(sectionId) {
    var id = trimStr(sectionId).toLowerCase();
    return TARGETS[id] || null;
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
    var id = trimStr(sectionId).toLowerCase();
    if (!id) return 'byra-profil-enkate.html';
    return 'byra-profil-enkate.html?section=' + encodeURIComponent(id);
  }

  function enkateSectionForFokus(fokus) {
    var key = trimStr(fokus).toLowerCase();
    if (key === 'verksamhet') return 'intern';
    if (key === 'distribution') return 'distribution';
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
    return key === 'verksamhet' || key === 'distribution';
  }

  return {
    TARGETS: TARGETS,
    FIELD_ENKATE_SECTION: FIELD_ENKATE_SECTION,
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
