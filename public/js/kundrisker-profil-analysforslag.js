/**
 * Föreslagna kundrisk-analyser utifrån byråprofil (Från byråprofilen).
 * Delas mellan Node-tester och kundrisker-sidan.
 *
 * Varje grupp har valbara delposter (checkboxes). Användaren kan alltid
 * välja gemensam analys (merge) eller en analys per vald post (split).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KundriskerProfilAnalysForslag = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TYP_KUND = 'Riskfaktorer kopplat till kund';
  var TYP_GEO_BYRA = 'Geografisk riskfaktorer - här finns byråns kunder';
  var TYP_GEO_MOTPART = 'Geografisk riskfaktorer - här finns kundens kunder & leverantörer';
  var HOGRISK_NONE = 'Inga högriskbranscher';
  var HIGH_RISK_INTRO = 'Walk-in via internet utan personlig relation';

  function trimStr(value) {
    return value == null ? '' : String(value).trim();
  }

  function fold(value) {
    return trimStr(value)
      .toLowerCase()
      .normalize('NFC')
      .replace(/\s+/g, ' ');
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

  function isYes(value) {
    return fold(value) === 'ja';
  }

  function parseCounted(raw) {
    var text = trimStr(raw);
    if (!text) return [];
    return text.split(/[,;\n|]+/).map(function (part) {
      var m = String(part || '').trim().match(/^(.+?)\s*[:·\-–]\s*(\d+)\s*$/);
      if (m) return { form: m[1].trim(), count: m[2] };
      var bare = String(part || '').trim();
      return bare ? { form: bare, count: '' } : null;
    }).filter(Boolean);
  }

  function displayCount(row) {
    return row && row.count ? row.form + ' · ' + row.count : (row && row.form) || '';
  }

  function slug(text) {
    return fold(text)
      .replace(/[^a-z0-9åäö]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'post';
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

  function itemAlreadyCovered(item, existing) {
    if (!item) return false;
    if (existing[fold(item.riskfaktor)]) return true;
    if (item.mergeName && existing[fold(item.mergeName)]) return true;
    return false;
  }

  function makeItem(opts) {
    return {
      id: opts.id,
      label: opts.label,
      detail: opts.detail || '',
      defaultChecked: opts.defaultChecked !== false,
      recommendedSeparate: !!opts.recommendedSeparate,
      typ: opts.typ || TYP_KUND,
      riskfaktor: opts.riskfaktor,
      beskrivning: opts.beskrivning || '',
      ptTf: opts.ptTf || 'Båda',
      mergeName: opts.mergeName || '',
      sourceKeys: opts.sourceKeys || []
    };
  }

  function bolagsformItems(profil) {
    var rows = parseCounted(profil.vanligasteBolagsformer);
    return rows.filter(function (r) { return r.form; }).map(function (r) {
      var label = displayCount(r);
      return makeItem({
        id: 'bolag-' + slug(r.form),
        label: label,
        detail: r.count ? 'ca ' + r.count + ' kunder' : '',
        typ: TYP_KUND,
        riskfaktor: 'Kunder med bolagsform ' + r.form,
        beskrivning:
          'Byråprofilen anger bolagsformen ' + r.form +
          (r.count ? ' (ca ' + r.count + ' kunder)' : '') +
          ' i kundstocken. Olika bolagsformer medför olika risker kring ägarstruktur, ansvar och identifiering av verklig huvudman.',
        ptTf: 'Båda',
        sourceKeys: ['vanligasteBolagsformer']
      });
    });
  }

  function hogriskBranschItems(profil) {
    var raw = trimStr(profil.branscherKundstock);
    if (!raw || raw === HOGRISK_NONE) return [];
    return parseCounted(raw).filter(function (r) { return r.form && r.form !== HOGRISK_NONE; }).map(function (r) {
      return makeItem({
        id: 'hogrisk-' + slug(r.form),
        label: displayCount(r),
        detail: 'Högriskbransch',
        defaultChecked: true,
        recommendedSeparate: true,
        typ: TYP_KUND,
        riskfaktor: 'Kunder i högriskbransch: ' + r.form,
        beskrivning:
          'Byråprofilen anger kunder i högriskbranschen ' + r.form +
          (r.count ? ' (ca ' + r.count + ')' : '') +
          '. Högriskbranscher bör normalt analyseras var för sig eftersom riskbild, typologier och kontroller skiljer sig.',
        ptTf: 'Båda',
        sourceKeys: ['branscherKundstock']
      });
    });
  }

  function ovrigaBranschItems(profil) {
    var hogriskNames = Object.create(null);
    hogriskBranschItems(profil).forEach(function (it) {
      var m = String(it.riskfaktor || '').replace(/^Kunder i högriskbransch:\s*/i, '');
      hogriskNames[fold(m)] = true;
    });
    return parseCounted(profil.kundernasBranscher)
      .filter(function (r) { return r.form && !hogriskNames[fold(r.form)]; })
      .map(function (r) {
        return makeItem({
          id: 'bransch-' + slug(r.form),
          label: displayCount(r),
          detail: 'Övrig bransch',
          defaultChecked: true,
          recommendedSeparate: false,
          typ: TYP_KUND,
          riskfaktor: 'Kunder i bransch: ' + r.form,
          beskrivning:
            'Byråprofilen anger kunder i branschen ' + r.form +
            (r.count ? ' (ca ' + r.count + ')' : '') +
            '. Icke-högriskbranscher kan ofta analyseras tillsammans, men ni kan dela upp vid behov.',
          ptTf: 'Båda',
          mergeName: 'Kundernas branschsammansättning (icke högrisk)',
          sourceKeys: ['kundernasBranscher']
        });
      });
  }

  function ownershipItems(profil) {
    var items = [];
    if (isYes(profil.komplexaAgarstrukturer)) {
      var n1 = trimStr(profil.komplexaAgarstrukturerAntal);
      items.push(makeItem({
        id: 'agar-komplex',
        label: 'Komplexa ägarstrukturer' + (n1 ? ' · ca ' + n1 : ''),
        detail: 'Ja',
        typ: TYP_KUND,
        riskfaktor: 'Kunder med komplexa ägarstrukturer',
        beskrivning:
          'Byråprofilen anger att det finns kunder med komplexa bolagskonstruktioner' +
          (n1 ? ' (ca ' + n1 + ')' : '') +
          '. Det försvårar identifiering av verklig huvudman och ökar risken för dolda ägarförhållanden.',
        ptTf: 'Båda',
        mergeName: 'Ägarstruktur, utländska ägare och PEP',
        sourceKeys: ['komplexaAgarstrukturer']
      }));
    }
    if (isYes(profil.utlandskaAgare)) {
      var n2 = trimStr(profil.utlandskaAgareAntal);
      items.push(makeItem({
        id: 'agar-utland',
        label: 'Utländska ägare' + (n2 ? ' · ca ' + n2 : ''),
        detail: 'Ja',
        typ: TYP_KUND,
        riskfaktor: 'Kunder med utländska ägare eller huvudmän',
        beskrivning:
          'Byråprofilen anger kunder med utländska ägare eller huvudmän' +
          (n2 ? ' (ca ' + n2 + ')' : '') +
          '. Det ökar risken kring identifiering, sanktionskontroller och gränsöverskridande ägarskap.',
        ptTf: 'Båda',
        mergeName: 'Ägarstruktur, utländska ägare och PEP',
        sourceKeys: ['utlandskaAgare']
      }));
    }
    if (isYes(profil.pepKunder)) {
      var n3 = trimStr(profil.pepKunderAntal);
      items.push(makeItem({
        id: 'agar-pep',
        label: 'PEP-kunder' + (n3 ? ' · ca ' + n3 : ''),
        detail: 'Ja',
        typ: TYP_KUND,
        riskfaktor: 'Politiskt utsatta personer (PEP) bland kunder',
        beskrivning:
          'Byråprofilen anger PEP bland kunder eller deras ägare' +
          (n3 ? ' (ca ' + n3 + ')' : '') +
          '. PEP kräver förstärkta åtgärder och särskild uppföljning.',
        ptTf: 'Båda',
        mergeName: 'Ägarstruktur, utländska ägare och PEP',
        sourceKeys: ['pepKunder']
      }));
    }
    return items;
  }

  /**
   * Bygger analysförslagsgrupper från byråprofil.
   * @returns {Array<{id, fieldKeys, buttonLabel, title, hint, defaultMode, allowMerge, allowSplit, recommended, optional, items}>}
   */
  function buildAnalysGroups(profil) {
    var p = profil || {};
    var groups = [];

    var bolagItems = bolagsformItems(p);
    if (bolagItems.length) {
      groups.push({
        id: 'bolagsformer',
        fieldKeys: ['vanligasteBolagsformer'],
        buttonLabel: 'Analysera bolagsformer',
        title: 'Bolagsformer i kundstocken',
        hint: 'Välj vilka bolagsformer som ska ingå. Ni kan slå ihop flera i en analys eller skapa en per form.',
        defaultMode: bolagItems.length > 1 ? 'merge' : 'split',
        allowMerge: true,
        allowSplit: true,
        recommended: true,
        optional: false,
        items: bolagItems
      });
    }

    var hogItems = hogriskBranschItems(p);
    if (hogItems.length) {
      groups.push({
        id: 'hogrisk-branscher',
        fieldKeys: ['branscherKundstock'],
        buttonLabel: 'Analysera högriskbranscher',
        title: 'Högriskbranscher',
        hint: 'Varje högriskbransch föreslås som egen analys. Ni kan bocka ur eller slå ihop om ni vill.',
        defaultMode: 'split',
        allowMerge: true,
        allowSplit: true,
        recommended: true,
        optional: false,
        items: hogItems
      });
    }

    var ovrigaBr = ovrigaBranschItems(p);
    if (ovrigaBr.length) {
      groups.push({
        id: 'ovriga-branscher',
        fieldKeys: ['kundernasBranscher'],
        buttonLabel: 'Analysera branscher',
        title: 'Övriga branscher',
        hint: 'Icke-högriskbranscher kan ofta analyseras tillsammans. Bocka för vilka som ska ingå.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: true,
        recommended: true,
        optional: false,
        items: ovrigaBr
      });
    }

    var andelHog = percentOrNull(p.andelHogriskbransch);
    if (andelHog != null && andelHog > 0 && !hogItems.length) {
      groups.push({
        id: 'andel-hogrisk',
        fieldKeys: ['andelHogriskbransch'],
        buttonLabel: 'Analysera andel högrisk',
        title: 'Andel kunder i högriskbransch',
        hint: 'Valfritt samlat analyskort när ni inte listat enskilda högriskbranscher.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: false,
        recommended: false,
        optional: true,
        items: [
          makeItem({
            id: 'andel-hogrisk-1',
            label: 'Andel högriskbransch · ' + andelHog + ' %',
            typ: TYP_KUND,
            riskfaktor: 'Andel kunder i högriskbransch',
            beskrivning:
              'Byråprofilen anger att ca ' + andelHog +
              ' % av kunderna verkar i högriskbranscher. Analysera vilken påverkan det har på kontroller och uppföljning.',
            ptTf: 'Båda',
            sourceKeys: ['andelHogriskbransch']
          })
        ]
      });
    }

    var kontant = percentOrNull(p.andelKontantintensiva);
    if (kontant != null && kontant > 0) {
      groups.push({
        id: 'kontant',
        fieldKeys: ['andelKontantintensiva'],
        buttonLabel: 'Analysera kontantintensiva',
        title: 'Kontantintensiva kunder',
        hint: 'Föreslås som en analys när andelen är större än noll.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: false,
        recommended: true,
        optional: false,
        items: [
          makeItem({
            id: 'kontant-1',
            label: 'Kontantintensiva · ' + kontant + ' %',
            typ: TYP_KUND,
            riskfaktor: 'Kontantintensiva kunder',
            beskrivning:
              'Byråprofilen anger att ca ' + kontant +
              ' % av kunderna är kontantintensiva (kontanter, kort eller Swish i stor skala). Det ökar risken för ospårbara flöden.',
            ptTf: 'PT',
            sourceKeys: ['andelKontantintensiva']
          })
        ]
      });
    }

    var betalning = trimStr(p.betalningsmonster);
    if (betalning) {
      groups.push({
        id: 'betalningsmonster',
        fieldKeys: ['betalningsmonster'],
        buttonLabel: 'Analysera betalningsmönster',
        title: 'Betalningsmönster',
        hint: 'Normalt en samlad analys. Dela upp manuellt om ni beskriver flera tydligt skilda högriskmönster.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: false,
        recommended: true,
        optional: false,
        items: [
          makeItem({
            id: 'betalning-1',
            label: 'Betalningsmönster',
            detail: betalning.length > 80 ? betalning.slice(0, 77) + '…' : betalning,
            typ: TYP_KUND,
            riskfaktor: 'Kundernas betalningsmönster',
            beskrivning:
              'Byråprofilen beskriver typiska betalningsmönster: ' + betalning +
              '. Bedöm vilka mönster som innebär förhöjd penningtvätts- eller TF-risk.',
            ptTf: 'Båda',
            sourceKeys: ['betalningsmonster']
          })
        ]
      });
    }

    var agar = ownershipItems(p);
    if (agar.length) {
      groups.push({
        id: 'agarskap-pep',
        fieldKeys: ['komplexaAgarstrukturer', 'utlandskaAgare', 'pepKunder'],
        buttonLabel: 'Analysera ägarskap & PEP',
        title: 'Ägarstruktur, utländska ägare och PEP',
        hint: 'Ni kan analysera temana tillsammans eller var för sig. Bocka för vad som ska ingå.',
        defaultMode: agar.length > 1 ? 'merge' : 'split',
        allowMerge: true,
        allowSplit: true,
        recommended: true,
        optional: false,
        items: agar
      });
    }

    var marknad = trimStr(p.geografiskMarknad);
    if (marknad) {
      groups.push({
        id: 'geo-marknad',
        fieldKeys: ['geografiskMarknad'],
        buttonLabel: 'Analysera geografisk marknad',
        title: 'Geografisk marknad',
        hint: 'Föreslås som en geografisk analys av kundernas hemvist/marknad.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: false,
        recommended: true,
        optional: false,
        items: [
          makeItem({
            id: 'geo-marknad-1',
            label: marknad,
            typ: TYP_GEO_BYRA,
            riskfaktor: 'Kundernas geografiska marknad / hemvist',
            beskrivning:
              'Byråprofilen anger geografisk marknad: ' + marknad +
              '. Bedöm hur placeringen påverkar identifiering, uppföljning och geografisk risk.',
            ptTf: 'Båda',
            sourceKeys: ['geografiskMarknad']
          })
        ]
      });
    }

    var intl = percentOrNull(p.andelInternationellHandel);
    if (intl != null && intl > 0) {
      groups.push({
        id: 'geo-intl',
        fieldKeys: ['andelInternationellHandel'],
        buttonLabel: 'Analysera internationell handel',
        title: 'Internationell handel',
        hint: 'Föreslås när andelen är större än noll.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: false,
        recommended: true,
        optional: false,
        items: [
          makeItem({
            id: 'geo-intl-1',
            label: 'Internationell handel · ' + intl + ' %',
            typ: TYP_GEO_MOTPART,
            riskfaktor: 'Kunder med internationell handel',
            beskrivning:
              'Byråprofilen anger att ca ' + intl +
              ' % av kunderna har affärsförbindelser med utlandet. Bedöm motpartsgeografi, betalningsflöden och kontroller.',
            ptTf: 'Båda',
            sourceKeys: ['andelInternationellHandel']
          })
        ]
      });
    }

    if (isYes(p.sanktionslander)) {
      groups.push({
        id: 'geo-sanktion',
        fieldKeys: ['sanktionslander'],
        buttonLabel: 'Analysera sanktionsländer',
        title: 'Sanktionsländer / högriskländer',
        hint: 'Stark rekommendation när svaret är Ja — egen analys.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: false,
        recommended: true,
        optional: false,
        items: [
          makeItem({
            id: 'geo-sanktion-1',
            label: 'Sanktionsländer / högriskländer',
            detail: 'Ja',
            typ: TYP_GEO_MOTPART,
            riskfaktor: 'Transaktioner med sanktions- eller högriskländer',
            beskrivning:
              'Byråprofilen anger att det förekommer transaktioner med länder utanför EU/EES, högrisktredjeländer eller skatteparadis. Detta bör ha en dedikerad geografisk analys.',
            ptTf: 'Båda',
            sourceKeys: ['sanktionslander']
          })
        ]
      });
    }

    if (isYes(p.kunderIUtsattaOmraden)) {
      var nUtsatt = trimStr(p.kunderIUtsattaOmradenAntal);
      groups.push({
        id: 'geo-utsatt',
        fieldKeys: ['kunderIUtsattaOmraden'],
        buttonLabel: 'Analysera utsatta områden',
        title: 'Kunder i utsatta områden',
        hint: 'Föreslås som egen geografisk analys när svaret är Ja.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: false,
        recommended: true,
        optional: false,
        items: [
          makeItem({
            id: 'geo-utsatt-1',
            label: 'Utsatta områden' + (nUtsatt ? ' · ca ' + nUtsatt : ''),
            detail: 'Ja',
            typ: TYP_GEO_BYRA,
            riskfaktor: 'Kunder i utsatta / särskilt utsatta områden',
            beskrivning:
              'Byråprofilen anger kunder vars verksamhet finns i utsatta områden enligt Polismyndighetens lista' +
              (nUtsatt ? ' (ca ' + nUtsatt + ')' : '') +
              '. Det påverkar geografisk risk och uppföljning.',
            ptTf: 'Båda',
            sourceKeys: ['kunderIUtsattaOmraden']
          })
        ]
      });
    }

    var intro = trimStr(p.kundIntroduktion);
    if (intro) {
      var highIntro = fold(intro) === fold(HIGH_RISK_INTRO);
      groups.push({
        id: 'kundintro',
        fieldKeys: ['kundIntroduktion'],
        buttonLabel: 'Analysera kundintroduktion',
        title: 'Hur nya kunder kommer in',
        hint: highIntro
          ? 'Walk-in utan personlig relation innebär förhöjd risk — föreslås som analys.'
          : 'Valfritt analyskort utifrån hur nya kunder kommer in.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: false,
        recommended: highIntro,
        optional: !highIntro,
        items: [
          makeItem({
            id: 'kundintro-1',
            label: intro,
            typ: TYP_KUND,
            riskfaktor: 'Kundintroduktion: ' + intro,
            beskrivning:
              'Byråprofilen anger att nya kunder främst kommer in via: ' + intro +
              '. Bedöm hur introduktionskanalen påverkar identifiering, due diligence och riskacceptans.',
            ptTf: 'Båda',
            sourceKeys: ['kundIntroduktion']
          })
        ]
      });
    }

    var nyst = percentOrNull(p.andelNystartadeBolag);
    if (nyst != null && nyst > 0) {
      groups.push({
        id: 'nystartade',
        fieldKeys: ['andelNystartadeBolag'],
        buttonLabel: 'Analysera nystartade bolag',
        title: 'Nystartade bolag',
        hint: 'Föreslås när andelen är större än noll.',
        defaultMode: 'merge',
        allowMerge: true,
        allowSplit: false,
        recommended: nyst >= 10,
        optional: nyst < 10,
        items: [
          makeItem({
            id: 'nystartade-1',
            label: 'Nystartade bolag · ' + nyst + ' %',
            typ: TYP_KUND,
            riskfaktor: 'Nystartade bolag i kundstocken',
            beskrivning:
              'Byråprofilen anger att ca ' + nyst +
              ' % av kunderna är nystartade bolag utan längre historik. Det ökar osäkerheten kring ursprung till medel och affärsmodell.',
            ptTf: 'Båda',
            sourceKeys: ['andelNystartadeBolag']
          })
        ]
      });
    }

    return groups;
  }

  function filterOpenGroups(groups, risks) {
    var existing = existingRiskNameSet(risks);
    return (groups || []).map(function (g) {
      var items = (g.items || []).filter(function (it) {
        return !itemAlreadyCovered(it, existing);
      });
      if (!items.length) return null;
      return Object.assign({}, g, { items: items });
    }).filter(Boolean);
  }

  function groupForField(groups, fieldKey) {
    return (groups || []).find(function (g) {
      return (g.fieldKeys || []).indexOf(fieldKey) >= 0;
    }) || null;
  }

  function buildMergedPrefill(items) {
    var list = (items || []).filter(Boolean);
    if (!list.length) return null;
    if (list.length === 1) {
      return {
        typ: list[0].typ,
        riskfaktor: list[0].riskfaktor,
        beskrivning: list[0].beskrivning,
        ptTf: list[0].ptTf || 'Båda'
      };
    }
    var typ = list[0].typ;
    var sameTyp = list.every(function (it) { return it.typ === typ; });
    if (!sameTyp) typ = TYP_KUND;
    var mergeName = list[0].mergeName || list.map(function (it) { return it.label; }).join('; ');
    var beskrivning = list.map(function (it) {
      return '• ' + it.riskfaktor + (it.beskrivning ? ' — ' + it.beskrivning : '');
    }).join('\n');
    var pt = list.some(function (it) { return it.ptTf === 'PT'; }) &&
      list.some(function (it) { return it.ptTf === 'TF'; })
      ? 'Båda'
      : (list[0].ptTf || 'Båda');
    if (list.every(function (it) { return it.ptTf === 'PT'; })) pt = 'PT';
    return {
      typ: typ,
      riskfaktor: mergeName,
      beskrivning: beskrivning,
      ptTf: pt
    };
  }

  function buildSplitPrefills(items) {
    return (items || []).filter(Boolean).map(function (it) {
      return {
        typ: it.typ,
        riskfaktor: it.riskfaktor,
        beskrivning: it.beskrivning,
        ptTf: it.ptTf || 'Båda'
      };
    });
  }

  /** Antal kunder är kontext — ingen egen analysknapp. */
  var SKIP_FIELD_KEYS = ['antalKunder'];

  function shouldShowButtonForField(fieldKey, groups) {
    if (SKIP_FIELD_KEYS.indexOf(fieldKey) >= 0) return false;
    return !!groupForField(groups, fieldKey);
  }

  return {
    TYP_KUND: TYP_KUND,
    TYP_GEO_BYRA: TYP_GEO_BYRA,
    TYP_GEO_MOTPART: TYP_GEO_MOTPART,
    HOGRISK_NONE: HOGRISK_NONE,
    SKIP_FIELD_KEYS: SKIP_FIELD_KEYS,
    parseCounted: parseCounted,
    buildAnalysGroups: buildAnalysGroups,
    filterOpenGroups: filterOpenGroups,
    groupForField: groupForField,
    buildMergedPrefill: buildMergedPrefill,
    buildSplitPrefills: buildSplitPrefills,
    shouldShowButtonForField: shouldShowButtonForField,
    existingRiskNameSet: existingRiskNameSet
  };
});
