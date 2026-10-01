/**
 * Read-only sammanfattning av byråprofil-enkätens kundrelaterade svar
 * på sidan Vilka är våra kunder — med knappar som föreslår analyser
 * och checklist-status (analyserad / kopplad / avstådd / ej gjord än).
 */
(function () {
  'use strict';

  var SECTION_IDS = ['kundstock', 'geografi', 'kundintro'];
  var HOGRISK_NONE = 'Inga högriskbranscher';
  /** Myndighet bakom högriskbranschlistan (NRA / Högrisk SNI). */
  var HOGRISK_AUTHORITY = 'Samordningsfunktionen';
  var SKIP_STORAGE_PREFIX = 'kundriskAnalysSkipped:';
  var LINK_STORAGE_PREFIX = 'kundriskAnalysLinked:';
  /** Sammansatta statistik-kort (ordning + vilka enkätfält som ingår). */
  var COMPOSITE_CARDS = [
    {
      id: 'antal',
      title: 'Antal kunder',
      icon: 'fa-users',
      desc: 'Totalt antal pågående kunder.',
      keys: ['antalKunder'],
      /** Visas på verksamhetssidan (kontext till branschsammanfattning), inte på Vilka är våra kunder — där antal redan syns via Byråns tjänster. */
      pages: ['verksamhet']
    },
    {
      id: 'branscher',
      title: 'Kundernas branscher',
      icon: 'fa-layer-group',
      desc: '',
      keys: ['kundernasBranscher'],
      /** Fält som ingår i sammanfattningen men inte visas som egna chip-block. */
      absorbKeys: ['branscherKundstock', 'andelHogriskbransch'],
      blockLabels: {
        kundernasBranscher: 'Alla branscher'
      },
      pages: ['verksamhet']
    },
    {
      id: 'bolagsformer',
      title: 'Bolagsformer i kundstocken',
      icon: 'fa-building',
      desc: 'Fördelning av juridiska former bland kunderna.',
      keys: ['vanligasteBolagsformer'],
      pages: ['kundrisker']
    },
    {
      id: 'betalning',
      title: 'Betalningsmönster',
      icon: 'fa-credit-card',
      desc: 'Kontantintensiva kunder och typiska betalningssätt i kundstocken.',
      keys: ['andelKontantintensiva', 'betalningsmonster'],
      blockLabels: {
        andelKontantintensiva: 'Kontantintensiva kunder',
        betalningsmonster: 'Betalningsmönster'
      },
      pages: ['kundrisker']
    },
    {
      id: 'personkopplingar',
      title: 'Personkopplingar',
      icon: 'fa-user-secret',
      desc: 'Komplexa ägarstrukturer, utländska ägare samt kunder eller anhöriga som är PEP eller finns på sanktionslistor.',
      keys: ['komplexaAgarstrukturer', 'utlandskaAgare', 'pepKunder'],
      blockLabels: {
        komplexaAgarstrukturer: 'Komplexa ägarstrukturer',
        utlandskaAgare: 'Utländska ägare',
        pepKunder: 'PEP eller sanktionslistor'
      },
      pages: ['kundrisker']
    },
    {
      id: 'geografi',
      title: 'Kundernas geografi',
      icon: 'fa-map-marker-alt',
      desc: 'Internationell handel, sanktions-/högriskländer och kunder i utsatta områden.',
      keys: ['andelInternationellHandel', 'sanktionslander', 'kunderIUtsattaOmraden'],
      blockLabels: {
        andelInternationellHandel: 'Andel kunder med internationell handel',
        sanktionslander: 'Sanktionsländer / högriskländer',
        kunderIUtsattaOmraden: 'Kunder i utsatta områden'
      },
      pages: ['kundrisker']
    },
    {
      id: 'ursprung',
      title: 'Kundens ursprung och introduktion',
      icon: 'fa-handshake',
      desc: 'Hur nya kunder kommer in och andelen nystartade bolag i kundstocken.',
      keys: ['kundIntroduktion', 'andelNystartadeBolag'],
      blockLabels: {
        kundIntroduktion: 'Hur nya kunder kommer in',
        andelNystartadeBolag: 'Andel nystartade bolag'
      },
      pages: ['kundrisker']
    }
  ];

  function enkatPageId() {
    var fromBody = document.body && document.body.dataset && document.body.dataset.enkatPage;
    if (fromBody) return String(fromBody);
    var scope = document.body && document.body.dataset && document.body.dataset.riskPageScope;
    if (scope === 'verksamhet') return 'verksamhet';
    return 'kundrisker';
  }

  function cardsForCurrentPage() {
    var page = enkatPageId();
    return COMPOSITE_CARDS.filter(function (def) {
      var pages = def.pages || ['kundrisker'];
      return pages.indexOf(page) !== -1;
    });
  }
  var state = {
    profil: null,
    schema: null,
    allGroups: [],
    groups: [],
    openGroupId: null,
    linkGroupId: null,
    pendingPrefills: [],
    skippedIds: [],
    linkedMap: {},
    byraResaState: null,
    canEditResa: false,
    byraKey: '',
    summary: null,
    clientflowStat: null,
    editingKey: null,
    editDraft: null,
    editSaving: false,
    editError: '',
    /** Valda analysposter via checkbox på statistik-chips: { [itemId]: groupId } */
    chipSelection: Object.create(null)
  };

  function API() {
    return window.KundriskerProfilAnalysForslag || null;
  }

  function baseUrl() {
    if (window.apiConfig && window.apiConfig.baseUrl) return window.apiConfig.baseUrl;
    if (window.apiConfig && typeof window.apiConfig.getBaseUrl === 'function') {
      return window.apiConfig.getBaseUrl();
    }
    return '';
  }

  function authOpts() {
    return (
      (window.AuthManager &&
        typeof window.AuthManager.getAuthFetchOptions === 'function' &&
        window.AuthManager.getAuthFetchOptions()) ||
      { credentials: 'include', headers: { 'Content-Type': 'application/json' } }
    );
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseCounted(raw) {
    var Forslag = API();
    if (Forslag && Forslag.parseCounted) return Forslag.parseCounted(raw);
    var text = String(raw || '').trim();
    if (!text) return [];
    return text.split(/[,;\n]+/).map(function (part) {
      var m = String(part || '').trim().match(/^(.+?)\s*[:·\-–]\s*(\d+)\s*$/);
      if (m) return { form: m[1].trim(), count: m[2] };
      return { form: String(part || '').trim(), count: '' };
    }).filter(function (r) { return r.form; });
  }

  function formatCounted(value) {
    var rows = parseCounted(value);
    if (!rows.length) return String(value || '').trim();
    return rows.map(function (r) {
      return r.count ? r.form + ' · ' + r.count : r.form;
    }).join(', ');
  }

  function isAnswered(value, field) {
    if (value == null) return false;
    var raw = Array.isArray(value) ? value.join(', ') : String(value).trim();
    if (!raw) return false;
    if (field && (field.key === 'branscherKundstock' || field.type === 'hogrisk-branscher')) {
      if (raw === HOGRISK_NONE) return true;
      return parseCounted(raw).some(function (r) { return r.form && r.count !== ''; });
    }
    if (
      field &&
      (field.type === 'bolagsformer' ||
        field.type === 'branscher' ||
        field.type === 'risk-fordelning' ||
        field.key === 'kundernasBranscher' ||
        field.key === 'kundResidualriskFordelning')
    ) {
      return parseCounted(raw).some(function (r) { return r.form && String(r.count || '') !== ''; });
    }
    return true;
  }

  function drillTypForField(field, item) {
    var key = (item && item.key) || (field && field.key) || '';
    if (key === 'kundernasBranscher' || (field && field.type === 'branscher')) return 'kund-bransch';
    if (key === 'branscherKundstock' || (field && field.type === 'hogrisk-branscher')) return 'hogriskbransch';
    if (key === 'vanligasteBolagsformer' || (field && field.type === 'bolagsformer')) return 'bolagsform';
    if (key === 'kundResidualriskFordelning' || (field && field.type === 'risk-fordelning')) return 'riskniva';
    if (key === 'pepKunder') return 'pep-sanktion';
    return '';
  }

  function iconForKey(key) {
    var map = {
      antalKunder: 'fa-users',
      kundResidualriskFordelning: 'fa-shield-halved',
      vanligasteBolagsformer: 'fa-building',
      kundernasBranscher: 'fa-layer-group',
      branscherKundstock: 'fa-industry',
      andelHogriskbransch: 'fa-percent',
      andelKontantintensiva: 'fa-coins',
      betalningsmonster: 'fa-credit-card',
      komplexaAgarstrukturer: 'fa-sitemap',
      utlandskaAgare: 'fa-globe',
      pepKunder: 'fa-user-secret',
      geografiskMarknad: 'fa-map-marker-alt',
      andelInternationellHandel: 'fa-percent',
      sanktionslander: 'fa-ban',
      kunderIUtsattaOmraden: 'fa-map-marked-alt',
      kundIntroduktion: 'fa-handshake',
      andelNystartadeBolag: 'fa-seedling'
    };
    return map[key] || 'fa-chart-bar';
  }

  function descForItem(item, fromClientflow) {
    var typ = drillTypForField(null, item);
    if (fromClientflow) {
      if (typ === 'kund-bransch' || typ === 'hogriskbransch') {
        return 'Klicka för underbranscher och kundlista.';
      }
      if (typ) return 'Klicka för kundlista.';
    }
    if (typ === 'kund-bransch' || typ === 'hogriskbransch') {
      return 'Från byråprofilen. Klicka för underbranscher och kundlista från Clientflow.';
    }
    if (typ) return 'Från byråprofilen. Klicka för kundlista från Clientflow.';
    return 'Svar från byråprofil-enkäten.';
  }

  function foldChip(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .normalize('NFC')
      .replace(/\s+/g, ' ');
  }

  function formNameFromAnalysItem(item) {
    var rf = String((item && item.riskfaktor) || '').trim();
    // Branschnamn kan innehålla kommatecken ("Kultur, media och underhållning") —
    // ta hela resten efter prefixet, dela inte på komma.
    var bransch =
      rf.match(/^Kunder i högriskbransch:\s*(.+)$/i) ||
      rf.match(/^Kunder i bransch:\s*(.+)$/i);
    if (bransch) return String(bransch[1] || '').trim();

    var m = rf.match(/^Kunder med bolagsform(?:erna)?\s+(.+)$/i);
    if (m) {
      var forms = m[1].split(/\s*,\s*/).map(function (p) { return p.trim(); }).filter(Boolean);
      // Enbart exakt en bolagsform → chip-match; sammanslagna poster matchas via label.
      return forms.length === 1 ? forms[0] : '';
    }
    var label = String((item && item.label) || '');
    var parts = label.split(/\s*·\s*/);
    return (parts[0] || '').trim();
  }

  function openItemsForField(fieldKey) {
    var key = String(fieldKey || '');
    if (!key) return [];
    var out = [];
    (state.groups || []).forEach(function (g) {
      if (!g || (g.fieldKeys || []).indexOf(key) < 0) return;
      (g.items || []).forEach(function (it) {
        out.push({ group: g, item: it });
      });
    });
    return out;
  }

  function findOpenChipMatch(namn, fieldKey) {
    var wanted = foldChip(namn);
    if (!wanted && !fieldKey) return null;
    var candidates = fieldKey ? openItemsForField(fieldKey) : [];
    if (!candidates.length) {
      (state.groups || []).forEach(function (g) {
        (g.items || []).forEach(function (it) {
          candidates.push({ group: g, item: it });
        });
      });
    }
    if (!wanted && candidates.length === 1) return candidates[0];
    for (var i = 0; i < candidates.length; i++) {
      var row = candidates[i];
      var form = formNameFromAnalysItem(row.item);
      if (form && foldChip(form) === wanted) return row;
      if (foldChip(row.item.label).indexOf(wanted) === 0) return row;
    }
    return null;
  }

  function pruneChipSelection() {
    var valid = Object.create(null);
    (state.groups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if (it && it.id) valid[it.id] = g.id;
      });
    });
    var next = Object.create(null);
    Object.keys(state.chipSelection || {}).forEach(function (id) {
      if (valid[id]) next[id] = valid[id];
    });
    state.chipSelection = next;
  }

  function selectedChipCount() {
    return Object.keys(state.chipSelection || {}).length;
  }

  function chipCheckHtml(match) {
    if (!match || !match.item || !match.group) return '';
    var id = match.item.id;
    var checked = state.chipSelection[id] ? ' checked' : '';
    return (
      '<label class="statistik-stat-chip-check" title="Välj för analys">' +
        '<input type="checkbox" data-chip-analys-item="' + escapeHtml(id) + '" ' +
          'data-chip-analys-group="' + escapeHtml(match.group.id) + '"' + checked + '>' +
        '<span class="statistik-stat-chip-check-ui" aria-hidden="true"></span>' +
        '<span class="sr-only">Välj ' + escapeHtml(match.item.label || 'post') + ' för analys</span>' +
      '</label>'
    );
  }

  function selectableChipHtml(opts) {
    var match = opts.match || null;
    var selected = !!(match && state.chipSelection[match.item.id]);
    var check = match ? chipCheckHtml(match) : '';
    var hogrisk = !!opts.hogrisk;
    var cls =
      'statistik-stat-chip' +
      (opts.staticChip ? ' statistik-stat-chip--static' : '') +
      (match ? ' statistik-stat-chip--selectable' : '') +
      (selected ? ' is-chip-selected' : '') +
      (hogrisk ? ' statistik-stat-chip--hogrisk' : '');
    var badge = hogrisk
      ? '<span class="statistik-stat-chip-hogrisk-badge" title="Högriskbransch enligt ' +
          escapeHtml(HOGRISK_AUTHORITY) +
          '">Högrisk</span>'
      : '';
    var labelHtml = escapeHtml(opts.label || '') + badge;
    if (opts.button) {
      return (
        '<span class="' + cls + '">' +
          check +
          '<button type="button" class="statistik-stat-chip-hit" ' +
            'data-typ="' + escapeHtml(opts.typ || '') + '" ' +
            'data-namn="' + escapeHtml(opts.namn || '') + '" ' +
            'data-titel="' + escapeHtml(opts.titel || '') + '" ' +
            (hogrisk ? 'data-hogrisk="1" ' : '') +
            'title="' + escapeHtml(opts.title || 'Klicka för att se kunder') + '">' +
            labelHtml +
          '</button>' +
        '</span>'
      );
    }
    return (
      '<span class="' + cls + '">' +
        check +
        '<span class="statistik-stat-chip-hit">' + labelHtml + '</span>' +
      '</span>'
    );
  }

  function namedListChips(typ, rows, titelPrefix, fieldKey) {
    if (!rows || !rows.length) return '';
    return (
      '<div class="statistik-stat-chips">' +
      rows.map(function (r) {
        var namn = r.namn || r.form || '';
        var antal = r.antal != null ? r.antal : r.count;
        var label = antal != null && antal !== '' ? namn + ' · ' + antal : namn;
        var isHr = !!r.hogrisk || typ === 'hogriskbransch';
        var matchKey = isHr ? 'branscherKundstock' : (fieldKey || '');
        var match = findOpenChipMatch(namn, matchKey);
        if (!match && fieldKey && matchKey !== fieldKey) {
          match = findOpenChipMatch(namn, fieldKey);
        }
        return selectableChipHtml({
          button: true,
          typ: isHr ? 'hogriskbransch' : typ,
          namn: namn,
          titel: titelPrefix ? titelPrefix + namn : namn,
          label: label,
          title: isHr
            ? 'Högriskbransch — klicka för underbranscher och kundlista'
            : 'Klicka för att se kunder',
          match: match,
          hogrisk: isHr
        });
      }).join('') +
      '</div>'
    );
  }

  function mergeBranschRowsForDisplay(buckets, hogriskRows) {
    var map = Object.create(null);
    (buckets || []).forEach(function (r) {
      var namn = String((r && r.namn) || '').trim();
      if (!namn) return;
      map[namn] = {
        namn: namn,
        antal: Number(r.antal) || 0,
        hogrisk: !!r.hogrisk
      };
    });
    (hogriskRows || []).forEach(function (r) {
      var namn = String((r && r.namn) || '').trim();
      if (!namn) return;
      var prev = map[namn];
      var antal = Number(r.antal) || 0;
      if (prev) {
        prev.hogrisk = true;
        if (antal > prev.antal) prev.antal = antal;
      } else {
        map[namn] = { namn: namn, antal: antal, hogrisk: true };
      }
    });
    return Object.keys(map)
      .map(function (k) { return map[k]; })
      .sort(function (a, b) {
        return b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv');
      });
  }

  function staticValueChips(display, fieldKey) {
    var text = String(display || '').trim();
    if (!text) return '<p class="stat-list-empty">Inget svar.</p>';
    var parts = text.split(/\s*,\s*/).map(function (p) { return p.trim(); }).filter(Boolean);
    var openForField = fieldKey ? openItemsForField(fieldKey) : [];
    if (parts.length <= 1) {
      var singleMatch =
        findOpenChipMatch(parts[0] || text, fieldKey) ||
        (openForField.length === 1 ? openForField[0] : null);
      return (
        '<div class="statistik-stat-chips">' +
          selectableChipHtml({
            staticChip: true,
            label: text,
            match: singleMatch
          }) +
        '</div>'
      );
    }
    return (
      '<div class="statistik-stat-chips">' +
      parts.map(function (p) {
        return selectableChipHtml({
          staticChip: true,
          label: p,
          match: findOpenChipMatch(p, fieldKey)
        });
      }).join('') +
      '</div>'
    );
  }

  function clientflowChipsForItem(item) {
    var stat = state.clientflowStat;
    if (!stat) return null;
    var typ = drillTypForField(null, item);
    var key = item.key || '';

    if (key === 'antalKunder' && typeof stat.antalKunder === 'number') {
      return {
        html:
          '<div class="statistik-stat-chips">' +
            selectableChipHtml({
              button: true,
              typ: 'alla',
              titel: 'Alla kunder',
              label: 'Antal kunder · ' + stat.antalKunder,
              title: 'Klicka för att se kunder',
              match: null
            }) +
          '</div>',
        fromClientflow: true
      };
    }
    if (typ === 'bolagsform' && Array.isArray(stat.bolagsform) && stat.bolagsform.length) {
      return { html: namedListChips('bolagsform', stat.bolagsform, '', key), fromClientflow: true };
    }
    if (typ === 'kund-bransch' && Array.isArray(stat.kundBranschBuckets) && stat.kundBranschBuckets.length) {
      var hrRows = stat.högriskbransch || stat.hogriskbransch || [];
      var merged = mergeBranschRowsForDisplay(stat.kundBranschBuckets, hrRows);
      return { html: namedListChips('kund-bransch', merged, '', key), fromClientflow: true };
    }
    if (typ === 'hogriskbransch') {
      var hr = stat.högriskbransch || stat.hogriskbransch || [];
      if (hr.length) return { html: namedListChips('hogriskbransch', hr, '', key), fromClientflow: true };
    }
    if (typ === 'pep-sanktion' && typeof stat.antalPepEllerSanktion === 'number') {
      var pepMatch = findOpenChipMatch('PEP', key) ||
        (openItemsForField(key).length === 1 ? openItemsForField(key)[0] : null);
      return {
        html:
          '<div class="statistik-stat-chips">' +
            selectableChipHtml({
              button: true,
              typ: 'pep-sanktion',
              titel: 'PEP eller anhörig till PEP',
              label: 'PEP eller anhörig till PEP · ' + stat.antalPepEllerSanktion,
              title: 'Klicka för att se kunder',
              match: pepMatch
            }) +
          '</div>',
        fromClientflow: true
      };
    }
    if (typ === 'riskniva' && stat.riskniva && typeof stat.riskniva === 'object') {
      var levels = ['Låg', 'Normal', 'Förhöjd', 'Hög', 'Oacceptabel'];
      var rows = levels
        .map(function (namn) {
          var antal = Number(stat.riskniva[namn]);
          if (!Number.isFinite(antal) || antal <= 0) return null;
          return { namn: namn, antal: Math.round(antal) };
        })
        .filter(Boolean);
      if (rows.length) {
        return { html: namedListChips('riskniva', rows, 'Residualrisk: ', key), fromClientflow: true };
      }
    }
    return null;
  }

  function countedChipsHtml(item) {
    var live = clientflowChipsForItem(item);
    if (live) return live.html;
    var key = item.key || '';

    var typ = drillTypForField(null, item);
    if (!typ || !state.profil) return staticValueChips(item.display, key);
    if (typ === 'pep-sanktion') {
      var pepRaw = state.profil[item.key];
      pepRaw = Array.isArray(pepRaw) ? pepRaw.join(', ') : String(pepRaw || '').trim();
      if (!/^ja/i.test(pepRaw)) return staticValueChips(item.display, key);
      var pepMatch = findOpenChipMatch('PEP', key) ||
        (openItemsForField(key).length === 1 ? openItemsForField(key)[0] : null);
      return (
        '<div class="statistik-stat-chips">' +
          selectableChipHtml({
            button: true,
            typ: 'pep-sanktion',
            titel: 'PEP eller anhörig till PEP',
            label: item.display,
            title: 'Klicka för kundlista från Clientflow',
            match: pepMatch
          }) +
        '</div>'
      );
    }
    var raw = state.profil[item.key];
    raw = Array.isArray(raw) ? raw.join(', ') : String(raw || '').trim();
    if (!raw) return staticValueChips(item.display, key);
    if (typ === 'hogriskbransch' && raw === HOGRISK_NONE) return staticValueChips(HOGRISK_NONE, key);
    var rows = parseCounted(raw).map(function (r) {
      return { namn: r.form, antal: r.count };
    });
    if (!rows.length) return staticValueChips(item.display, key);

    if (typ === 'kund-bransch') {
      var hrRaw = state.profil.branscherKundstock;
      hrRaw = Array.isArray(hrRaw) ? hrRaw.join(', ') : String(hrRaw || '').trim();
      var hrRows = (!hrRaw || hrRaw === HOGRISK_NONE)
        ? []
        : parseCounted(hrRaw).map(function (r) {
            return { namn: r.form, antal: r.count, hogrisk: true };
          });
      rows = mergeBranschRowsForDisplay(rows, hrRows);
    }

    return namedListChips(typ, rows, '', key);
  }

  function valueHtmlForItem(item) {
    if (drillTypForField(null, item) || item.key === 'antalKunder') {
      return countedChipsHtml(item);
    }
    return staticValueChips(item.display, item.key);
  }

  function sourceBadgeHtml(fromClientflow) {
    if (fromClientflow) {
      return '<span class="statistik-source-badge" title="Aggregerat från pågående kunder i Clientflow">Clientflow</span>';
    }
    return '<span class="statistik-source-badge statistik-source-badge--byraprofil" title="Svar ni fyllt i byråprofil-enkäten">Byråprofil</span>';
  }

  function formatDisplay(field, value) {
    if (!isAnswered(value, field)) return '';
    if (field && (field.key === 'branscherKundstock' || field.type === 'hogrisk-branscher')) {
      var raw = Array.isArray(value) ? value.join(', ') : String(value).trim();
      if (raw === HOGRISK_NONE) return HOGRISK_NONE;
      return formatCounted(raw) || raw;
    }
    if (
      field &&
      (field.type === 'bolagsformer' ||
        field.type === 'branscher' ||
        field.type === 'risk-fordelning' ||
        field.key === 'kundernasBranscher' ||
        field.key === 'kundResidualriskFordelning')
    ) {
      return formatCounted(value) || String(value).trim();
    }
    if (field && field.type === 'percent') {
      var s = String(value).trim();
      return s.indexOf('%') >= 0 ? s : s + ' %';
    }
    if (Array.isArray(value)) return value.map(function (v) { return String(v || '').trim(); }).filter(Boolean).join(', ');
    return String(value).trim();
  }

  function companionAntal(field, fields) {
    if (!field) return null;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (
        f &&
        f.requiredWhen &&
        f.requiredWhen.key === field.key &&
        f.type === 'number' &&
        /antal/i.test(f.key)
      ) {
        return f;
      }
    }
    return null;
  }

  function allSchemaFields(schema) {
    var fieldsByKey = {};
    (schema.fields || []).forEach(function (f) {
      if (f && f.key) fieldsByKey[f.key] = f;
    });
    var ordered = [];
    var seen = Object.create(null);
    SECTION_IDS.forEach(function (sectionId) {
      var section = (schema.sections || []).find(function (s) { return s && s.id === sectionId; });
      if (!section) return;
      (Array.isArray(section.fieldKeys) ? section.fieldKeys : []).forEach(function (k) {
        if (!fieldsByKey[k] || seen[k]) return;
        seen[k] = true;
        ordered.push(fieldsByKey[k]);
      });
    });
    Object.keys(fieldsByKey).forEach(function (k) {
      if (seen[k]) return;
      ordered.push(fieldsByKey[k]);
    });
    return ordered;
  }

  function buildBlockFromField(field, profil, allFields, labelOverride) {
    if (!field || field.requiredWhen) return null;
    var antalField = companionAntal(field, allFields);
    if (!isAnswered(profil[field.key], field)) return null;
    var display = formatDisplay(field, profil[field.key]);
    if (antalField && isAnswered(profil[antalField.key], antalField)) {
      display = display + ' · ca ' + String(profil[antalField.key]).trim();
    }
    return {
      key: field.key,
      label: labelOverride || field.label || field.key,
      display: display,
      antalKey: antalField ? antalField.key : null,
      fieldType: field.type || ''
    };
  }

  function buildBranschSummaryDesc(profil, schemaHint) {
    var p = profil || {};
    var stat = state.clientflowStat;
    var antal = (stat && typeof stat.antalKunder === 'number')
      ? stat.antalKunder
      : Math.round(Number(p.antalKunder)) || 0;

    var branschRows = [];
    if (stat && Array.isArray(stat.kundBranschBuckets) && stat.kundBranschBuckets.length) {
      branschRows = mergeBranschRowsForDisplay(
        stat.kundBranschBuckets,
        stat.högriskbransch || stat.hogriskbransch || []
      );
    } else {
      branschRows = parseCounted(p.kundernasBranscher);
    }
    var nBranscher = branschRows.length;

    var andelFromProfil = null;
    var rawAndel = p.andelHogriskbransch;
    var nAndel = Number(String(rawAndel == null ? '' : rawAndel).replace(',', '.').replace(/[^\d.]/g, ''));
    if (Number.isFinite(nAndel)) {
      andelFromProfil = Math.round(nAndel <= 1 && String(rawAndel).indexOf('%') === -1 ? nAndel * 100 : nAndel);
    }

    var hogriskAntal = null;
    var andel = null;
    if (stat && typeof stat.antalKunderHogriskbransch === 'number') {
      hogriskAntal = Math.round(stat.antalKunderHogriskbransch);
      andel = antal > 0 ? Math.round((hogriskAntal / antal) * 100) : andelFromProfil;
    } else if (andelFromProfil != null) {
      andel = andelFromProfil;
      hogriskAntal = antal > 0 ? Math.round((andel / 100) * antal) : null;
      if (hogriskAntal == null) {
        var hrParsedPct = parseCounted(p.branscherKundstock).filter(function (r) {
          return r.form && r.form !== HOGRISK_NONE;
        });
        if (hrParsedPct.length) {
          hogriskAntal = hrParsedPct.reduce(function (sum, r) {
            var n = Number(r.count);
            return sum + (Number.isFinite(n) ? n : 0);
          }, 0);
        }
      }
    } else {
      var hrParsed = parseCounted(p.branscherKundstock).filter(function (r) {
        return r.form && r.form !== HOGRISK_NONE;
      });
      if (hrParsed.length) {
        hogriskAntal = hrParsed.reduce(function (sum, r) {
          var n = Number(r.count);
          return sum + (Number.isFinite(n) ? n : 0);
        }, 0);
        if (antal > 0) andel = Math.round((hogriskAntal / antal) * 100);
      }
    }

    if (!antal && !nBranscher) {
      return schemaHint ||
        'Alla branscher i kundstocken. Högriskbranscher markeras i listan.';
    }

    var parts = [];
    parts.push(
      'Byrån har ' +
        (antal || '—') +
        ' kunder inom ' +
        (nBranscher || '—') +
        ' olika huvudbranscher'
    );
    if (hogriskAntal != null && andel != null) {
      parts.push(
        'av dessa finns det ' +
          hogriskAntal +
          ' – dvs ' +
          andel +
          ' % – inom branscher som ' +
          HOGRISK_AUTHORITY +
          ' definierar som branscher med högre risk för penningtvätt eller finansiering av terrorism'
      );
    } else {
      parts.push(
        'högriskbranscher enligt ' +
          HOGRISK_AUTHORITY +
          ' markeras i listan'
      );
    }
    return parts.join(', ') + '.';
  }

  function buildSummary(profil, schema) {
    var allFields = allSchemaFields(schema || {});
    var fieldsByKey = {};
    allFields.forEach(function (f) {
      if (f && f.key) fieldsByKey[f.key] = f;
    });
    var usedKeys = Object.create(null);
    var cards = [];
    var answeredCount = 0;

    var pageCardDefs = cardsForCurrentPage();
    var pageCardKeySet = Object.create(null);
    COMPOSITE_CARDS.forEach(function (def) {
      (def.keys || []).forEach(function (k) { pageCardKeySet[k] = true; });
      (def.absorbKeys || []).forEach(function (k) { pageCardKeySet[k] = true; });
    });

    pageCardDefs.forEach(function (def) {
      var blocks = [];
      (def.keys || []).forEach(function (key) {
        usedKeys[key] = true;
        var antalCompanion = fieldsByKey[key] && companionAntal(fieldsByKey[key], allFields);
        if (antalCompanion) usedKeys[antalCompanion.key] = true;
        var block = buildBlockFromField(
          fieldsByKey[key],
          profil,
          allFields,
          (def.blockLabels && def.blockLabels[key]) || null
        );
        if (!block) return;
        blocks.push(block);
        answeredCount += 1;
      });
      (def.absorbKeys || []).forEach(function (key) {
        usedKeys[key] = true;
        var antalCompanion = fieldsByKey[key] && companionAntal(fieldsByKey[key], allFields);
        if (antalCompanion) usedKeys[antalCompanion.key] = true;
        if (isAnswered(profil[key], fieldsByKey[key])) answeredCount += 1;
      });
      if (!blocks.length) {
        // Kort utan synliga block men med absorberade svar (t.ex. bara högrisk) — hoppa över
        // om huvudnyckeln saknas.
        return;
      }
      var desc = def.desc || '';
      if (def.id === 'branscher') {
        desc = buildBranschSummaryDesc(profil, def.desc);
      }
      cards.push({
        id: def.id,
        title: def.title,
        icon: def.icon || 'fa-chart-bar',
        desc: desc,
        absorbKeys: (def.absorbKeys || []).slice(),
        blocks: blocks
      });
    });

    // Nycklar som hör till andra sidors kort ska inte bli "extra"-kort här.
    Object.keys(pageCardKeySet).forEach(function (key) {
      usedKeys[key] = true;
    });
    // Byråns geografiska marknad visas under Övriga / distribution — inte som kundkort.
    usedKeys.geografiskMarknad = true;

    // Övriga ifyllda fält (t.ex. residualrisk) som egna enkla kort.
    allFields.forEach(function (field) {
      if (!field || usedKeys[field.key] || field.requiredWhen) return;
      var block = buildBlockFromField(field, profil, allFields, null);
      if (!block) return;
      usedKeys[field.key] = true;
      answeredCount += 1;
      cards.push({
        id: 'extra-' + field.key,
        title: field.label || field.key,
        icon: iconForKey(field.key),
        desc: '',
        blocks: [block]
      });
    });

    return {
      hasAnswers: answeredCount > 0,
      answeredCount: answeredCount,
      groups: [{ id: 'sammansatt', title: '', items: cards }],
      cards: cards
    };
  }

  function uniqueAnalysGroupsForCard(card) {
    var seen = Object.create(null);
    var rows = [];
    function considerKey(key, block) {
      var g = allGroupForItem({ key: key });
      if (!g || seen[g.id]) return;
      seen[g.id] = true;
      rows.push({ group: g, block: block || { key: key } });
    }
    ((card && card.blocks) || []).forEach(function (block) {
      considerKey(block.key, block);
    });
    ((card && card.absorbKeys) || []).forEach(function (key) {
      considerKey(key, { key: key });
    });
    return rows;
  }

  function risksMatchingCard(card) {
    var Forslag = API();
    var risks = risksList();
    var seen = Object.create(null);
    var out = [];
    function addRisk(risk) {
      if (!risk || !risk.id || seen[risk.id]) return;
      seen[risk.id] = true;
      out.push(risk);
    }
    uniqueAnalysGroupsForCard(card).forEach(function (row) {
      var group = row.group;
      if (!group) return;
      (group.items || []).forEach(function (item) {
        if (Forslag && Forslag.itemAlreadyCovered && Forslag.itemAlreadyCovered(item, risks)) {
          risks.forEach(function (risk) {
            if (Forslag.itemAlreadyCovered(item, [risk])) addRisk(risk);
          });
        }
      });
      var links = Forslag && Forslag.linksForGroup
        ? Forslag.linksForGroup(state.linkedMap, group.id)
        : [];
      links.forEach(function (link) {
        var hit = risks.find(function (r) {
          if (link.id && String(r.id) === String(link.id)) return true;
          var namn = Forslag.riskNamn ? Forslag.riskNamn(r) : '';
          return link.namn && namn && namn.toLowerCase() === String(link.namn).toLowerCase();
        });
        if (hit) addRisk(hit);
      });
    });
    return out;
  }

  function nestedRiskChipHtml(risk) {
    var Forslag = API();
    var namn = Forslag && Forslag.riskNamn
      ? Forslag.riskNamn(risk)
      : String((risk.fields || {}).Riskfaktor || '').trim();
    var fields = risk.fields || {};
    var level = '';
    try {
      if (window.riskManager && typeof window.riskManager.scoredRisk === 'function') {
        var scored = window.riskManager.scoredRisk(fields);
        level = scored.residualLevel || scored.level || '';
      }
    } catch (_) { /* ignore */ }
    return (
      '<button type="button" class="kundrisker-enkat-nested-chip" data-nested-risk-id="' +
        escapeHtml(risk.id) + '" title="Öppna analys">' +
        '<span class="kundrisker-enkat-nested-chip-name">' + escapeHtml(namn || 'Riskfaktor') + '</span>' +
        (level ? '<span class="kundrisker-enkat-nested-chip-level">' + escapeHtml(level) + '</span>' : '') +
      '</button>'
    );
  }

  function nestedRisksHtml(card) {
    var risks = risksMatchingCard(card);
    if (!risks.length) return '';
    return (
      '<div class="kundrisker-enkat-nested-risks is-under-card">' +
        '<h4 class="kundrisker-enkat-nested-title">Analyserade riskfaktorer</h4>' +
        '<div class="kundrisker-enkat-nested-list">' +
          risks.map(nestedRiskChipHtml).join('') +
        '</div>' +
      '</div>'
    );
  }

  function collectNestedRiskIds(summary) {
    var ids = [];
    var seen = Object.create(null);
    ((summary && summary.cards) || []).forEach(function (card) {
      risksMatchingCard(card).forEach(function (risk) {
        var id = String(risk.id || '');
        if (!id || seen[id]) return;
        seen[id] = true;
        ids.push(id);
      });
    });
    return ids;
  }

  var _lastNestedRiskIds = [];

  function getNestedRiskIds() {
    return _lastNestedRiskIds.slice();
  }

  function aggregateCardStatus(card) {
    var Forslag = API();
    if (!Forslag || !Forslag.resolveGroupChecklistStatus) return null;
    var risks = risksList();
    var rows = [];
    uniqueAnalysGroupsForCard(card).forEach(function (row) {
      var g = row.group;
      if (!g) return;
      if (rows.some(function (r) { return r.groupId === g.id; })) return;
      var status = Forslag.resolveGroupChecklistStatus(g, risks, state.skippedIds, state.linkedMap);
      if (!status) return;
      rows.push({ groupId: g.id, status: status });
    });
    if (!rows.length) return null;
    var analyserad = rows.filter(function (r) { return r.status.status === 'analyserad'; });
    var kopplad = rows.filter(function (r) { return r.status.status === 'kopplad'; });
    var avstadd = rows.filter(function (r) { return r.status.status === 'avstadd'; });
    var pending = rows.filter(function (r) { return r.status.status === 'pending'; });
    var done = analyserad.length + kopplad.length;
    if (done === rows.length) {
      if (analyserad.length && !kopplad.length) {
        if (analyserad.length === 1) return analyserad[0].status;
        return { status: 'analyserad', label: 'Analyserad' };
      }
      if (kopplad.length && !analyserad.length) {
        if (kopplad.length === 1) return kopplad[0].status;
        return { status: 'kopplad', label: 'Kopplad' };
      }
      return { status: 'analyserad', label: 'Analyserad' };
    }
    if (done > 0) {
      return {
        status: 'analyserad',
        label: 'Delvis analyserad (' + done + '/' + rows.length + ')'
      };
    }
    if (avstadd.length === rows.length) {
      return { status: 'avstadd', label: 'Avstådd' };
    }
    if (pending.length) {
      return { status: 'pending', label: 'Ej gjord än' };
    }
    return rows[0].status;
  }

  function risksList() {
    return (window.riskManager && window.riskManager.risks) || [];
  }

  function normalizeSkipped(list) {
    var Forslag = API();
    if (Forslag && Forslag.normalizeSkippedGroupIds) {
      return Forslag.normalizeSkippedGroupIds(list);
    }
    return (Array.isArray(list) ? list : []).map(String).filter(Boolean);
  }

  function normalizeLinked(map) {
    var Forslag = API();
    if (Forslag && Forslag.normalizeLinkedMap) {
      return Forslag.normalizeLinkedMap(map);
    }
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  }

  function localSkipKey() {
    return SKIP_STORAGE_PREFIX + (state.byraKey || 'default');
  }

  function localLinkKey() {
    return LINK_STORAGE_PREFIX + (state.byraKey || 'default');
  }

  function readLocalSkipped() {
    try {
      var raw = localStorage.getItem(localSkipKey());
      return normalizeSkipped(raw ? JSON.parse(raw) : []);
    } catch (_) {
      return [];
    }
  }

  function writeLocalSkipped(ids) {
    try {
      localStorage.setItem(localSkipKey(), JSON.stringify(normalizeSkipped(ids)));
    } catch (_) { /* ignore */ }
  }

  function readLocalLinked() {
    try {
      var raw = localStorage.getItem(localLinkKey());
      return normalizeLinked(raw ? JSON.parse(raw) : {});
    } catch (_) {
      return {};
    }
  }

  function writeLocalLinked(map) {
    try {
      localStorage.setItem(localLinkKey(), JSON.stringify(normalizeLinked(map)));
    } catch (_) { /* ignore */ }
  }

  function riskOptionsForPicker() {
    var Forslag = API();
    var seen = Object.create(null);
    var out = [];
    risksList().forEach(function (risk) {
      var namn = Forslag && Forslag.riskNamn
        ? Forslag.riskNamn(risk)
        : String((risk && risk.fields && (risk.fields.Riskfaktor || risk.fields['Riskfaktor'])) || '').trim();
      if (!namn) return;
      var key = namn.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push({ id: String((risk && risk.id) || '').trim(), namn: namn });
    });
    out.sort(function (a, b) {
      return a.namn.localeCompare(b.namn, 'sv');
    });
    return out;
  }

  function formatNamedCounts(rows) {
    return (rows || []).map(function (r) {
      var namn = String((r && r.namn) || '').trim();
      var antal = Number(r && r.antal);
      if (!namn || !Number.isFinite(antal) || antal <= 0) return '';
      return namn + ': ' + Math.round(antal);
    }).filter(Boolean).join(', ');
  }

  /**
   * När live Clientflow-statistik finns (redan filtrerad till pågående kunder)
   * ska analysförslag och panelräkningar använda den — inte äldre enkät-siffror
   * som kan inkludera avslutade.
   */
  function profilWithLiveClientflow() {
    var p = Object.assign({}, state.profil || {});
    var stat = state.clientflowStat;
    if (!stat) return p;

    if (typeof stat.antalKunder === 'number') {
      p.antalKunder = stat.antalKunder;
    }
    if (stat.riskniva && typeof stat.riskniva === 'object') {
      var riskLevels = ['Låg', 'Normal', 'Förhöjd', 'Hög', 'Oacceptabel'];
      var riskRows = riskLevels
        .map(function (namn) {
          var antal = Number(stat.riskniva[namn]);
          if (!Number.isFinite(antal) || antal <= 0) return null;
          return { namn: namn, antal: Math.round(antal) };
        })
        .filter(Boolean);
      if (riskRows.length) {
        p.kundResidualriskFordelning = formatNamedCounts(riskRows);
      }
    }
    if (Array.isArray(stat.bolagsform) && stat.bolagsform.length) {
      p.vanligasteBolagsformer = formatNamedCounts(stat.bolagsform);
    }
    if (Array.isArray(stat.kundBranschBuckets) && stat.kundBranschBuckets.length) {
      p.kundernasBranscher = formatNamedCounts(stat.kundBranschBuckets);
    }
    var hr = stat.högriskbransch || stat.hogriskbransch;
    if (Array.isArray(hr)) {
      p.branscherKundstock = hr.length
        ? formatNamedCounts(hr)
        : HOGRISK_NONE;
    }
    if (typeof stat.antalPepEllerSanktion === 'number') {
      var pep = Number(stat.antalPepEllerSanktion) || 0;
      p.pepKunder = pep > 0 ? 'Ja' : 'Nej';
      if (pep > 0) p.pepKunderAntal = pep;
      else delete p.pepKunderAntal;
    }
    return p;
  }

  function refreshGroups() {
    var Forslag = API();
    if (!Forslag || !state.profil) {
      state.allGroups = [];
      state.groups = [];
      return;
    }
    var risks = risksList();
    state.allGroups = Forslag.buildAnalysGroups(profilWithLiveClientflow());
    state.groups = Forslag.filterOpenGroups(state.allGroups, risks, state.skippedIds, state.linkedMap);
  }

  function allGroupForItem(item) {
    var Forslag = API();
    if (!Forslag) return null;
    return Forslag.groupForField(state.allGroups, item.key);
  }

  function openGroupForItem(item) {
    var Forslag = API();
    if (!Forslag) return null;
    return Forslag.groupForField(state.groups, item.key);
  }

  function statusForGroup(analysGroup) {
    var Forslag = API();
    if (!Forslag || !analysGroup || !Forslag.resolveGroupChecklistStatus) return null;
    return Forslag.resolveGroupChecklistStatus(
      analysGroup,
      risksList(),
      state.skippedIds,
      state.linkedMap
    );
  }

  function statusBadgeHtml(statusRow) {
    if (!statusRow) return '';
    return (
      '<span class="kundrisker-analys-status is-' + escapeHtml(statusRow.status) + '" ' +
        'title="' + escapeHtml(statusRow.label) + '">' +
        '<span class="kundrisker-analys-status-icon" aria-hidden="true"></span>' +
        '<span class="kundrisker-analys-status-label">' + escapeHtml(statusRow.label) + '</span>' +
      '</span>'
    );
  }

  function buttonForItem(item, openGroup, statusRow) {
    // Visa Analysera så länge det finns kvarvarande poster (även vid delvis analyserad).
    if (!openGroup) return '';
    if (statusRow && (statusRow.status === 'avstadd' || statusRow.status === 'kopplad')) return '';
    var optionalCls = openGroup.optional ? ' is-optional' : '';
    var label = openGroup.buttonLabel;
    if (statusRow && /delvis/i.test(statusRow.label || '')) {
      label = label.replace(/^Analysera/, 'Fortsätt analysera') || label;
    }
    return (
      '<button type="button" class="btn btn-secondary btn-sm kundrisker-analys-btn' + optionalCls + '" ' +
        'data-analys-group="' + escapeHtml(openGroup.id) + '">' +
        escapeHtml(label) +
      '</button>'
    );
  }

  function skipActionsHtml(allGroup, statusRow) {
    if (!allGroup || !statusRow) return '';
    if (statusRow.status === 'pending') {
      return (
        '<button type="button" class="btn btn-ghost btn-sm kundrisker-analys-link" ' +
          'data-analys-link="' + escapeHtml(allGroup.id) + '" title="Koppla statistiken till en befintlig riskfaktor">' +
          'Koppla</button>' +
        '<button type="button" class="btn btn-ghost btn-sm kundrisker-analys-skip" ' +
          'data-analys-skip="' + escapeHtml(allGroup.id) + '" title="Markera som avstådd utan att skapa analys">' +
          'Avstå</button>'
      );
    }
    if (statusRow.status === 'kopplad') {
      return (
        '<button type="button" class="btn btn-ghost btn-sm kundrisker-analys-unlink" ' +
          'data-analys-unlink="' + escapeHtml(allGroup.id) + '" title="Ångra koppling — visa förslaget igen">' +
          'Ångra koppling</button>'
      );
    }
    if (statusRow.status === 'avstadd') {
      return (
        '<button type="button" class="btn btn-ghost btn-sm kundrisker-analys-unskip" ' +
          'data-analys-unskip="' + escapeHtml(allGroup.id) + '" title="Ångra avstå — visa förslaget igen">' +
          'Ångra avstå</button>'
      );
    }
    return '';
  }

  function checklistSummaryHtml() {
    var Forslag = API();
    if (!Forslag || !Forslag.summarizeChecklistStatuses || !state.allGroups.length) return '';
    var c = Forslag.summarizeChecklistStatuses(
      state.allGroups,
      risksList(),
      state.skippedIds,
      state.linkedMap
    );
    if (!c.total) return '';
    var koppladHtml = c.kopplad
      ? '<span class="kundrisker-enkat-checklist-item is-kopplad">' + c.kopplad + ' kopplade</span>'
      : '';
    return (
      '<p class="kundrisker-enkat-checklist" role="status">' +
        '<span class="kundrisker-enkat-checklist-item is-analyserad">' + c.analyserad + ' analyserade</span>' +
        koppladHtml +
        '<span class="kundrisker-enkat-checklist-item is-avstadd">' + c.avstadd + ' avstådda</span>' +
        '<span class="kundrisker-enkat-checklist-item is-pending">' + c.pending + ' ej gjorda än</span>' +
      '</p>'
    );
  }

  function linkPanelHtml(allGroup) {
    if (!allGroup || state.linkGroupId !== allGroup.id) return '';
    var options = riskOptionsForPicker();
    var optionsHtml = options.length
      ? options.map(function (opt) {
          return (
            '<label class="kundrisker-analys-check">' +
              '<input type="radio" name="kundrisker-link-' + escapeHtml(allGroup.id) + '" ' +
                'data-link-risk-id="' + escapeHtml(opt.id) + '" ' +
                'data-link-risk-namn="' + escapeHtml(opt.namn) + '">' +
              '<span class="kundrisker-analys-check-label"><strong>' +
                escapeHtml(opt.namn) +
              '</strong></span>' +
            '</label>'
          );
        }).join('')
      : '<p class="kundrisker-analys-panel-hint">Inga riskfaktorer finns ännu. Skapa en analys först, eller använd Analysera.</p>';
    return (
      '<div class="kundrisker-analys-panel kundrisker-link-panel" data-link-panel="' +
        escapeHtml(allGroup.id) + '">' +
        '<p class="kundrisker-analys-panel-hint">Välj en befintlig riskfaktor som redan täcker den här statistiken — utan att skapa en ny analys.</p>' +
        '<div class="kundrisker-analys-checks">' + optionsHtml + '</div>' +
        '<div class="kundrisker-analys-actions">' +
          (options.length
            ? '<button type="button" class="btn btn-primary btn-sm" data-link-confirm="' +
              escapeHtml(allGroup.id) + '">Koppla till vald</button>'
            : '') +
          '<button type="button" class="btn btn-ghost btn-sm" data-link-cancel="' +
            escapeHtml(allGroup.id) + '">Stäng</button>' +
        '</div>' +
      '</div>'
    );
  }

  function panelHtml(analysGroup) {
    if (!analysGroup) return '';
    var isOpen = state.openGroupId === analysGroup.id;
    if (!isOpen) return '';
    var items = analysGroup.items || [];
    var checks = items.map(function (it) {
      return (
        '<label class="kundrisker-analys-check">' +
          '<input type="checkbox" data-analys-item="' + escapeHtml(it.id) + '"' +
            (it.defaultChecked ? ' checked' : '') + '>' +
          '<span class="kundrisker-analys-check-label">' +
            '<strong>' + escapeHtml(it.label) + '</strong>' +
            (it.detail ? '<span class="kundrisker-analys-check-detail">' + escapeHtml(it.detail) + '</span>' : '') +
            (it.recommendedSeparate ? '<span class="kundrisker-analys-badge">egen analys</span>' : '') +
          '</span>' +
        '</label>'
      );
    }).join('');

    var actions = '';
    var mergeLabel = items.length === 1 ? 'Skapa analys' : 'Skapa gemensam analys';
    if (analysGroup.allowMerge !== false) {
      actions +=
        '<button type="button" class="btn btn-primary btn-sm" data-analys-action="merge" data-analys-group="' +
        escapeHtml(analysGroup.id) + '">' + mergeLabel + '</button>';
    }
    if (analysGroup.allowSplit !== false && items.length > 1) {
      actions +=
        '<button type="button" class="btn btn-secondary btn-sm" data-analys-action="split" data-analys-group="' +
        escapeHtml(analysGroup.id) + '">En analys per vald</button>';
    } else if (analysGroup.allowSplit !== false && items.length === 1 && analysGroup.allowMerge === false) {
      actions +=
        '<button type="button" class="btn btn-primary btn-sm" data-analys-action="split" data-analys-group="' +
        escapeHtml(analysGroup.id) + '">Skapa analys</button>';
    }

    return (
      '<div class="kundrisker-analys-panel" data-analys-panel="' + escapeHtml(analysGroup.id) + '">' +
        '<p class="kundrisker-analys-panel-hint">' + escapeHtml(analysGroup.hint || '') + '</p>' +
        '<div class="kundrisker-analys-checks">' + checks + '</div>' +
        '<div class="kundrisker-analys-actions">' + actions +
          '<button type="button" class="btn btn-ghost btn-sm" data-analys-action="close" data-analys-group="' +
          escapeHtml(analysGroup.id) + '">Stäng</button>' +
        '</div>' +
        '<p class="kundrisker-analys-queue" hidden></p>' +
      '</div>'
    );
  }

  function renderEmpty(root) {
    root.innerHTML =
      '<div class="kundrisker-enkat is-empty">' +
        '<div class="kundrisker-enkat-head">' +
          '<h3>Vilka är våra kunder <span class="statistik-source-badge statistik-source-badge--byraprofil" title="Svar ni fyllt i byråprofil-enkäten">Byråprofil</span></h3>' +
        '</div>' +
        '<p class="kundrisker-enkat-lead">Här samlas enkätens uppgifter om kundstock och geografi — i samma format som under Statistik för riskbedömning.</p>' +
        '<p class="kundrisker-enkat-empty">Ni har ännu inte fyllt i kundstocken i enkäten.</p>' +
        '<a class="btn btn-secondary kundrisker-enkat-cta" href="byra-profil-enkate.html?section=kundstock">Fyll i kundstocken</a>' +
      '</div>';
  }

  function itemUsesClientflow(item) {
    var live = clientflowChipsForItem(item);
    return !!(live && live.fromClientflow);
  }


  function fieldByKey(key) {
    var fields = (state.schema && state.schema.fields) || [];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i] && fields[i].key === key) return fields[i];
    }
    return null;
  }

  function canEditProfil() {
    var user =
      (window.AuthManager && typeof window.AuthManager.getCurrentUser === 'function' && window.AuthManager.getCurrentUser()) ||
      window.__clientFlowUser ||
      null;
    var role = user && user.role;
    return role === 'Ledare' || role === 'ClientFlowAdmin';
  }

  function isInlineEditableField(field) {
    if (!field) return false;
    var t = field.type || '';
    if (t === 'bolagsformer' || t === 'branscher' || t === 'hogrisk-branscher' || t === 'risk-fordelning') return false;
    return t === 'select' || t === 'number' || t === 'text' || t === 'percent' || t === 'multiselect';
  }

  function itemCanInlineEdit(item) {
    if (!item || !canEditProfil()) return false;
    if (itemUsesClientflow(item)) return false;
    return isInlineEditableField(fieldByKey(item.key));
  }

  function startEdit(item) {
    var field = fieldByKey(item.key);
    if (!field) return;
    var allFields = (state.schema && state.schema.fields) || [];
    var antalField = item.antalKey ? fieldByKey(item.antalKey) : companionAntal(field, allFields);
    var raw = state.profil ? state.profil[item.key] : '';
    var value = Array.isArray(raw) ? raw.slice() : raw == null ? '' : String(raw);
    var antal = '';
    if (antalField && state.profil && state.profil[antalField.key] != null && state.profil[antalField.key] !== '') {
      antal = String(state.profil[antalField.key]);
    }
    state.editingKey = item.key;
    state.editError = '';
    state.editSaving = false;
    state.editDraft = {
      key: item.key,
      antalKey: antalField ? antalField.key : null,
      type: field.type,
      value: value,
      antal: antal
    };
  }

  function cancelEdit() {
    state.editingKey = null;
    state.editDraft = null;
    state.editError = '';
    state.editSaving = false;
  }

  function editPanelHtml(item) {
    var field = fieldByKey(item.key);
    var draft = state.editDraft || {};
    if (!field || draft.key !== item.key) return '';
    var q = field.question || field.label || item.label;
    var body = '';
    if (field.type === 'select' || field.type === 'multiselect') {
      var choices = field.choices || [];
      var selected = draft.value;
      var selectedList = Array.isArray(selected)
        ? selected
        : String(selected || '')
            .split(/\s*,\s*/)
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
      body +=
        '<div class="byra-enkate-choices kundrisker-inline-choices" role="group" aria-label="' +
        escapeHtml(field.label || '') +
        '">';
      choices.forEach(function (choice) {
        var on =
          field.type === 'multiselect'
            ? selectedList.indexOf(choice) >= 0
            : String(selected || '') === String(choice);
        body +=
          '<button type="button" class="byra-enkate-choice' +
          (on ? ' is-selected' : '') +
          '" data-inline-choice="' +
          escapeHtml(choice) +
          '">' +
          escapeHtml(choice) +
          '</button>';
      });
      body += '</div>';
    } else if (field.type === 'number' || field.type === 'percent') {
      body +=
        '<label class="kundrisker-inline-number"><span>' +
        escapeHtml(field.label || 'Värde') +
        (field.type === 'percent' ? ' (%)' : '') +
        '</span><input type="number" min="0" step="1" data-inline-number value="' +
        escapeHtml(draft.value) +
        '"></label>';
    } else {
      body +=
        '<label class="kundrisker-inline-number"><span>' +
        escapeHtml(field.label || 'Svar') +
        '</span><input type="text" data-inline-text value="' +
        escapeHtml(Array.isArray(draft.value) ? draft.value.join(', ') : draft.value) +
        '"></label>';
    }

    var showAntal = draft.antalKey && (field.type !== 'select' || String(draft.value || '') === 'Ja');
    if (showAntal) {
      var antalField = fieldByKey(draft.antalKey);
      body +=
        '<label class="kundrisker-inline-number"><span>' +
        escapeHtml((antalField && (antalField.question || antalField.label)) || 'Ungefär hur många kunder?') +
        '</span><input type="number" min="0" step="1" data-inline-antal value="' +
        escapeHtml(draft.antal || '') +
        '"></label>';
    }

    var err = state.editError
      ? '<p class="kundrisker-inline-error" role="alert">' + escapeHtml(state.editError) + '</p>'
      : '';
    return (
      '<div class="kundrisker-inline-edit" data-inline-edit="' +
      escapeHtml(item.key) +
      '">' +
      '<p class="kundrisker-inline-question">' +
      escapeHtml(q) +
      '</p>' +
      body +
      err +
      '<div class="kundrisker-inline-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-inline-cancel>Avbryt</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-inline-save' +
      (state.editSaving ? ' disabled' : '') +
      '>' +
      (state.editSaving ? 'Sparar…' : 'Spara') +
      '</button>' +
      '</div></div>'
    );
  }

  function valueAreaHtml(item) {
    if (!itemCanInlineEdit(item)) return valueHtmlForItem(item);
    if (state.editingKey === item.key) return editPanelHtml(item);
    return (
      '<div class="kundrisker-inline-value">' +
      valueHtmlForItem(item) +
      '<button type="button" class="kundrisker-inline-edit-btn" data-inline-open="' +
      escapeHtml(item.key) +
      '" title="Redigera svar från byråprofilen">' +
      '<i class="fas fa-pen" aria-hidden="true"></i><span>Ändra</span></button></div>'
    );
  }

  function saveInlineEdit(root) {
    var draft = state.editDraft;
    if (!draft || !draft.key) return;
    var field = fieldByKey(draft.key);
    if (!field) return;
    var body = {};
    if (field.type === 'multiselect') {
      body[draft.key] = Array.isArray(draft.value) ? draft.value : [];
    } else if (field.type === 'number' || field.type === 'percent') {
      var n = String(draft.value || '').trim();
      if (n === '') body[draft.key] = null;
      else {
        body[draft.key] = Number(n);
        if (!isFinite(body[draft.key])) {
          state.editError = 'Ange ett giltigt tal.';
          renderSummary(root, state.summary);
          return;
        }
      }
    } else {
      body[draft.key] = draft.value == null ? '' : String(draft.value);
    }
    if (draft.antalKey) {
      if (String(body[draft.key] || '') === 'Ja') {
        var a = String(draft.antal || '').trim();
        if (a === '') {
          state.editError = 'Ange ungefärligt antal kunder.';
          renderSummary(root, state.summary);
          return;
        }
        body[draft.antalKey] = Number(a);
        if (!isFinite(body[draft.antalKey])) {
          state.editError = 'Ange ett giltigt antal.';
          renderSummary(root, state.summary);
          return;
        }
      } else {
        body[draft.antalKey] = null;
      }
    }
    state.editSaving = true;
    state.editError = '';
    renderSummary(root, state.summary);

    var opts = authOpts();
    opts.method = 'PUT';
    opts.headers = Object.assign({}, opts.headers || {}, { 'Content-Type': 'application/json' });
    opts.body = JSON.stringify(body);
    fetch(baseUrl() + '/api/byra/info', opts)
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
          return data;
        });
      })
      .then(function () {
        state.profil = Object.assign({}, state.profil || {}, body);
        Object.keys(body).forEach(function (k) {
          if (body[k] == null) delete state.profil[k];
        });
        cancelEdit();
        var summary = buildSummary(state.profil, state.schema || {});
        if (!summary.hasAnswers) renderEmpty(root);
        else renderSummary(root, summary);
      })
      .catch(function (err) {
        state.editSaving = false;
        state.editError = (err && err.message) || 'Kunde inte spara';
        if (/403|behörighet|Endast Ledare/i.test(state.editError)) {
          state.editError = 'Endast Ledare kan ändra byråprofilen.';
        }
        renderSummary(root, state.summary);
      });
  }


  function findBlockByKey(summary, key) {
    if (!key || !summary) return null;
    var found = null;
    function consider(block) {
      if (!found && block && block.key === key) found = block;
    }
    ((summary.cards) || []).forEach(function (card) {
      ((card && card.blocks) || []).forEach(consider);
    });
    if (found) return found;
    ((summary.groups) || []).forEach(function (g) {
      ((g && g.items) || []).forEach(function (it) {
        consider(it);
        ((it && it.blocks) || []).forEach(consider);
      });
    });
    return found;
  }

  function cardSourceBadgesHtml(card) {
    var hasCf = false;
    var hasBp = false;
    ((card && card.blocks) || []).forEach(function (block) {
      if (itemUsesClientflow(block)) hasCf = true;
      else hasBp = true;
    });
    var html = '';
    if (hasCf) html += sourceBadgeHtml(true);
    if (hasBp) html += sourceBadgeHtml(false);
    return html;
  }

  function actionsHtmlForGroup(allGroup, openGroup, statusRow) {
    if (!allGroup && !openGroup) return '';
    var btn = buttonForItem(null, openGroup, statusRow);
    var skipBtn = skipActionsHtml(allGroup, statusRow);
    return btn + skipBtn;
  }

  function renderCardBlock(block, opts) {
    opts = opts || {};
    var allGroup = opts.allGroup || null;
    var openGroup = opts.openGroup || null;
    var statusRow = opts.statusRow || null;
    var showBlockActions = !!opts.showBlockActions;
    var showBlockStatus = !!opts.showBlockStatus;
    var panel = opts.panel || '';
    var fromCf = itemUsesClientflow(block);
    var blockActions = '';
    if (showBlockActions || showBlockStatus) {
      var actionBits = '';
      if (showBlockStatus) actionBits += statusBadgeHtml(statusRow);
      if (showBlockActions) actionBits += actionsHtmlForGroup(allGroup, openGroup, statusRow);
      if (actionBits) {
        blockActions = '<div class="kundrisker-enkat-stat-actions">' + actionBits + '</div>';
      }
    }
    var multi = !!opts.multiBlock;
    return (
      '<div class="kundrisker-enkat-card-block' + (multi ? ' is-multi' : '') + '" data-field-key="' +
        escapeHtml(block.key) + '"' +
        (allGroup ? ' data-analys-group-id="' + escapeHtml(allGroup.id) + '"' : '') + '>' +
        (multi
          ? '<div class="kundrisker-enkat-card-block-head">' +
              '<h4 class="kundrisker-enkat-card-block-title">' + escapeHtml(block.label) + '</h4>' +
              blockActions +
            '</div>'
          : (blockActions
              ? '<div class="kundrisker-enkat-card-block-head is-actions-only">' + blockActions + '</div>'
              : '')) +
        '<div class="stat-list">' + valueAreaHtml(block) + '</div>' +
        panel +
      '</div>'
    );
  }

  function renderCompositeCard(card, panelRendered, linkPanelRendered) {
    var groupRows = uniqueAnalysGroupsForCard(card);
    var multiGroup = groupRows.length > 1;
    var multiBlock = ((card && card.blocks) || []).length > 1;
    var cardStatus = aggregateCardStatus(card);
    var headerActions = '';
    if (!multiGroup && groupRows.length === 1) {
      var only = groupRows[0];
      var onlyOpen = openGroupForItem(only.block);
      var onlyStatus = statusForGroup(only.group);
      var bits = statusBadgeHtml(cardStatus || onlyStatus) +
        actionsHtmlForGroup(only.group, onlyOpen, onlyStatus);
      if (bits) {
        headerActions = '<div class="kundrisker-enkat-stat-actions">' + bits + '</div>';
      }
    } else if (multiGroup) {
      var multiBits = statusBadgeHtml(cardStatus);
      groupRows.forEach(function (row) {
        var openG = openGroupForItem(row.block);
        var st = statusForGroup(row.group);
        multiBits += actionsHtmlForGroup(row.group, openG, st);
      });
      if (multiBits) {
        headerActions = '<div class="kundrisker-enkat-stat-actions">' + multiBits + '</div>';
      }
    } else if (cardStatus) {
      headerActions =
        '<div class="kundrisker-enkat-stat-actions">' + statusBadgeHtml(cardStatus) + '</div>';
    }

    var panels = '';
    groupRows.forEach(function (row) {
      var openGroup = openGroupForItem(row.block);
      var allGroup = row.group;
      if (openGroup && state.openGroupId === openGroup.id && !panelRendered[openGroup.id]) {
        panelRendered[openGroup.id] = true;
        panels += panelHtml(openGroup);
      }
      if (allGroup && state.linkGroupId === allGroup.id && !linkPanelRendered[allGroup.id]) {
        linkPanelRendered[allGroup.id] = true;
        panels += linkPanelHtml(allGroup);
      }
    });

    var blocksHtml = ((card && card.blocks) || []).map(function (block) {
      // Vid flera analysgrupper i samma kort (t.ex. branscher + högrisk) ligger
      // Analysera/Koppla/Avstå i kortets header — inte per block.
      return renderCardBlock(block, {
        allGroup: allGroupForItem(block),
        openGroup: openGroupForItem(block),
        statusRow: statusForGroup(allGroupForItem(block)),
        showBlockActions: multiBlock && !multiGroup,
        showBlockStatus: false,
        panel: '',
        multiBlock: multiBlock
      });
    }).join('');

    var rowStatusCls = cardStatus ? ' is-status-' + cardStatus.status : '';
    var hasAnalys = groupRows.length > 0;
    var liveDesc = card.id === 'branscher'
      ? buildBranschSummaryDesc(profilWithLiveClientflow(), card.desc)
      : (card.desc || '');
    return (
      '<section class="statistik-section kundrisker-enkat-stat-section kundrisker-enkat-card' +
        (hasAnalys ? ' has-analys' : '') + rowStatusCls + '" data-card-id="' + escapeHtml(card.id) + '">' +
        '<div class="kundrisker-enkat-stat-head">' +
          '<h3><i class="fas ' + escapeHtml(card.icon || 'fa-chart-bar') + '"></i> ' +
            escapeHtml(card.title) + ' ' + cardSourceBadgesHtml(card) +
          '</h3>' +
          headerActions +
        '</div>' +
        (liveDesc
          ? '<p class="statistik-section-desc">' + escapeHtml(liveDesc) + '</p>'
          : '') +
        '<div class="kundrisker-enkat-card-blocks">' + blocksHtml + '</div>' +
        nestedRisksHtml(card) +
        panels +
      '</section>'
    );
  }

  function chipAnalysBarHtml() {
    var n = selectedChipCount();
    if (!n) return '';
    var label = n === 1 ? '1 vald' : n + ' valda';
    return (
      '<div class="kundrisker-chip-analys-bar" role="region" aria-label="Skapa analys från valda chips">' +
        '<span class="kundrisker-chip-analys-bar-count">' + escapeHtml(label) + '</span>' +
        '<button type="button" class="btn btn-primary btn-sm" data-chip-analys-create>Skapa analys</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-chip-analys-clear>Rensa</button>' +
      '</div>'
    );
  }

  function prefillsFromChipSelection() {
    var Forslag = API();
    if (!Forslag) return [];
    var byGroup = Object.create(null);
    Object.keys(state.chipSelection || {}).forEach(function (itemId) {
      var groupId = state.chipSelection[itemId];
      if (!groupId) return;
      var group = (state.groups || []).find(function (g) { return g.id === groupId; });
      if (!group) return;
      var item = (group.items || []).find(function (it) { return it.id === itemId; });
      if (!item) return;
      if (!byGroup[groupId]) byGroup[groupId] = { group: group, items: [] };
      byGroup[groupId].items.push(item);
    });
    var prefills = [];
    Object.keys(byGroup).forEach(function (groupId) {
      var row = byGroup[groupId];
      var items = row.items;
      var group = row.group;
      if (!items.length) return;
      var preferSplit =
        group.defaultMode === 'split' ||
        items.some(function (it) { return it.recommendedSeparate; });
      if (items.length === 1) {
        if (preferSplit && Forslag.buildSplitPrefills) {
          prefills = prefills.concat(Forslag.buildSplitPrefills(items));
        } else {
          prefills.push(Forslag.buildMergedPrefill(items));
        }
        return;
      }
      if (preferSplit) {
        prefills = prefills.concat(Forslag.buildSplitPrefills(items));
      } else if (group.allowMerge !== false) {
        prefills.push(Forslag.buildMergedPrefill(items));
      } else {
        prefills = prefills.concat(Forslag.buildSplitPrefills(items));
      }
    });
    return prefills.filter(Boolean);
  }

  function renderSummary(root, summary) {
    refreshGroups();
    // Bygg om sammanfattning med live Clientflow-siffror så kortordning/desc stämmer.
    if (state.profil && state.schema) {
      summary = buildSummary(profilWithLiveClientflow(), state.schema);
    }
    pruneChipSelection();
    var panelRendered = {};
    var linkPanelRendered = {};
    state.summary = summary;
    var cards = summary.cards || [];
    if (!cards.length && summary.groups && summary.groups[0] && summary.groups[0].items) {
      cards = summary.groups[0].items;
    }
    _lastNestedRiskIds = collectNestedRiskIds({ cards: cards });

    var page = enkatPageId();
    var headTitle = page === 'verksamhet' ? 'Verksamhetsspecifika riskfaktorer' : 'Vilka är våra kunder';
    var lead = page === 'verksamhet'
      ? 'Branschstatistik från byråprofilen och Clientflow. Högriskbranscher markeras enligt Samordningsfunktionen. Bocka i chips eller använd Analysera, Koppla och Avstå. Analyserade riskfaktorer visas under respektive kort.'
      : 'Uppgifter från byråprofilen och Clientflow samlade i kort: bolagsformer, betalningsmönster, personkopplingar, geografi samt ursprung och introduktion. Branschstatistik ligger under Verksamhetsspecifika riskfaktorer. Där live-data finns används Clientflow-siffror (klickbara chips). Analyserade riskfaktorer visas under respektive kort.';

    var cardsHtml =
      '<div class="statistik-sections kundrisker-enkat-stat-sections kundrisker-enkat-cards">' +
      cards.map(function (card) {
        return renderCompositeCard(card, panelRendered, linkPanelRendered);
      }).join('') +
      '</div>';

    root.innerHTML =
      '<div class="kundrisker-enkat kundrisker-enkat--stat">' +
        '<div class="kundrisker-enkat-head">' +
          '<h3>' + escapeHtml(headTitle) + '</h3>' +
          '<div class="kundrisker-enkat-head-links">' +
            '<a class="kundrisker-enkat-edit" href="statistik-riskbedomning.html">Öppna all statistik</a>' +
            '<a class="kundrisker-enkat-edit" href="byra-profil-enkate.html?section=' +
              (page === 'verksamhet' ? 'kundstock' : 'kundstock') +
            '">Ändra i enkäten</a>' +
          '</div>' +
        '</div>' +
        '<p class="kundrisker-enkat-lead">' + lead + '</p>' +
        checklistSummaryHtml() +
        '<div class="kundrisker-enkat-groups">' + cardsHtml + '</div>' +
        chipAnalysBarHtml() +
      '</div>';

    bindPanelEvents(root, summary);
    bindChipSelection(root, summary);
    bindBranschChips(root);
    bindNestedRiskChips(root);
  }

  function bindNestedRiskChips(root) {
    root.querySelectorAll('[data-nested-risk-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-nested-risk-id');
        if (id && window.riskManager && typeof window.riskManager.openEditModal === 'function') {
          window.riskManager.openEditModal(id);
        }
      });
    });
  }

  function bindChipSelection(root, summary) {
    root.querySelectorAll('[data-chip-analys-item]').forEach(function (input) {
      input.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      input.addEventListener('change', function (e) {
        e.stopPropagation();
        var itemId = input.getAttribute('data-chip-analys-item');
        var groupId = input.getAttribute('data-chip-analys-group');
        if (!itemId || !groupId) return;
        if (input.checked) state.chipSelection[itemId] = groupId;
        else delete state.chipSelection[itemId];
        renderSummary(root, summary);
      });
    });
    root.querySelectorAll('.statistik-stat-chip-check').forEach(function (label) {
      label.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    });
    var createBtn = root.querySelector('[data-chip-analys-create]');
    if (createBtn) {
      createBtn.addEventListener('click', function () {
        var prefills = prefillsFromChipSelection();
        if (!prefills.length) {
          window.alert('Välj minst en post att analysera.');
          return;
        }
        state.chipSelection = Object.create(null);
        openPrefills(prefills);
      });
    }
    var clearBtn = root.querySelector('[data-chip-analys-clear]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        state.chipSelection = Object.create(null);
        renderSummary(root, summary);
      });
    }
  }

  function bindBranschChips(root) {
    var Modal = window.StatistikKunderModal;
    if (Modal && typeof Modal.bindStatChips === 'function') {
      Modal.bindStatChips(root);
      return;
    }
    if (Modal && typeof Modal.bindBranschTriggers === 'function') {
      Modal.bindBranschTriggers(root);
      return;
    }
    root.querySelectorAll(
      '.statistik-stat-chip-hit[data-typ], .statistik-stat-chip[data-typ], .kundrisker-bransch-chip'
    ).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('.statistik-stat-chip-check')) return;
        e.preventDefault();
        e.stopPropagation();
        if (!Modal) return;
        var typ = btn.getAttribute('data-typ');
        if (typ === 'pep-sanktion' && typeof Modal.fetchKunderForRow === 'function') {
          Modal.fetchKunderForRow('pep-sanktion', null, null, btn.getAttribute('data-titel') || 'PEP');
          return;
        }
        if (typ === 'bolagsform' && typeof Modal.fetchKunderForRow === 'function') {
          Modal.fetchKunderForRow('bolagsform', null, btn.getAttribute('data-namn'), btn.getAttribute('data-titel'));
          return;
        }
        if (typ === 'riskniva' && typeof Modal.fetchKunderForRow === 'function') {
          Modal.fetchKunderForRow('riskniva', null, btn.getAttribute('data-namn'), btn.getAttribute('data-titel'));
          return;
        }
        if (typeof Modal.openBransch === 'function') {
          Modal.openBransch(typ, btn.getAttribute('data-namn'), btn.getAttribute('data-titel'));
        }
      });
    });
  }

  function selectedItems(panel, analysGroup) {
    var checked = {};
    panel.querySelectorAll('[data-analys-item]').forEach(function (input) {
      if (input.checked) checked[input.getAttribute('data-analys-item')] = true;
    });
    return (analysGroup.items || []).filter(function (it) { return checked[it.id]; });
  }

  function openPrefills(prefills) {
    var list = (prefills || []).filter(Boolean);
    if (!list.length) return;
    var rm = window.riskManager;
    if (!rm || typeof rm.openAddModal !== 'function') {
      window.alert('Riskfaktorer laddas fortfarande. Försök igen om en stund.');
      return;
    }
    state.pendingPrefills = list.slice(1);
    rm.openAddModal(list[0]);
    updateQueueHints();
    ensureAddHook(rm);
  }

  function updateQueueHints() {
    var n = state.pendingPrefills.length;
    document.querySelectorAll('.kundrisker-analys-queue').forEach(function (el) {
      if (n > 0) {
        el.hidden = false;
        el.textContent = n + ' analys' + (n === 1 ? '' : 'er') + ' kvar — nästa öppnas när ni sparat (eller avbrutit) den aktuella.';
      } else {
        el.hidden = true;
        el.textContent = '';
      }
    });
  }

  function ensureAddHook(rm) {
    if (rm._kundriskerAnalysHooked) return;
    rm._kundriskerAnalysHooked = true;
    var origClose = rm.closeModal && rm.closeModal.bind(rm);
    if (origClose) {
      rm.closeModal = function (modalId) {
        origClose(modalId);
        if (modalId === 'add-risk-modal') {
          advanceQueueSoon();
          rerenderSoon();
        }
      };
    }
    var form = document.getElementById('add-risk-form');
    if (form && !form._kundriskerAnalysBound) {
      form._kundriskerAnalysBound = true;
      form.addEventListener('submit', function () {
        // Kö avanceras när modalen stängs efter lyckat sparande.
        setTimeout(function () {
          var modal = document.getElementById('add-risk-modal');
          if (modal && modal.style.display === 'none') {
            advanceQueueSoon();
            rerenderSoon();
          }
        }, 800);
      });
    }
  }

  function advanceQueueSoon() {
    if (!state.pendingPrefills.length) {
      updateQueueHints();
      return;
    }
    setTimeout(function () {
      if (!state.pendingPrefills.length) return;
      var next = state.pendingPrefills.shift();
      var rm = window.riskManager;
      if (rm && next) rm.openAddModal(next);
      updateQueueHints();
    }, 200);
  }

  function rerenderSoon() {
    setTimeout(function () {
      var root = document.getElementById('kundrisker-enkat-root');
      if (root && state.summary && state.summary.hasAnswers) {
        renderSummary(root, state.summary);
      }
    }, 300);
  }

  function setSkipped(ids, root, summary) {
    state.skippedIds = normalizeSkipped(ids);
    writeLocalSkipped(state.skippedIds);
    if (state.openGroupId && state.skippedIds.indexOf(state.openGroupId) >= 0) {
      state.openGroupId = null;
    }
    if (state.linkGroupId && state.skippedIds.indexOf(state.linkGroupId) >= 0) {
      state.linkGroupId = null;
    }
    persistChecklistToByraResa();
    renderSummary(root, summary);
  }

  function setLinked(map, root, summary) {
    state.linkedMap = normalizeLinked(map);
    writeLocalLinked(state.linkedMap);
    if (state.linkGroupId && state.linkedMap[state.linkGroupId]) {
      state.linkGroupId = null;
    }
    if (state.openGroupId && state.linkedMap[state.openGroupId]) {
      state.openGroupId = null;
    }
    persistChecklistToByraResa();
    renderSummary(root, summary);
  }

  function persistChecklistToByraResa() {
    if (!state.byraResaState) return;
    var nextState = Object.assign({}, state.byraResaState, {
      kundriskAnalysSkipped: state.skippedIds.slice(),
      kundriskAnalysLinked: normalizeLinked(state.linkedMap)
    });
    state.byraResaState = nextState;
    if (!state.canEditResa) return;
    var opts = authOpts();
    opts.method = 'PUT';
    opts.headers = Object.assign({}, opts.headers || {}, { 'Content-Type': 'application/json' });
    opts.body = JSON.stringify({ state: nextState });
    fetch(baseUrl() + '/api/byra-resa', opts).catch(function () { /* lokal spegling räcker */ });
  }

  function bindPanelEvents(root, summary) {
    root.querySelectorAll('[data-analys-group].kundrisker-analys-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-analys-group');
        state.linkGroupId = null;
        state.openGroupId = state.openGroupId === id ? null : id;
        renderSummary(root, summary);
      });
    });

    root.querySelectorAll('[data-analys-skip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-analys-skip');
        if (!id) return;
        var list = state.skippedIds.slice();
        if (list.indexOf(id) < 0) list.push(id);
        // Avstå ersätter eventuell koppling för samma grupp.
        if (state.linkedMap[id]) {
          var withoutLink = Object.assign({}, state.linkedMap);
          delete withoutLink[id];
          state.linkedMap = normalizeLinked(withoutLink);
          writeLocalLinked(state.linkedMap);
        }
        setSkipped(list, root, summary);
      });
    });

    root.querySelectorAll('[data-analys-unskip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-analys-unskip');
        if (!id) return;
        setSkipped(state.skippedIds.filter(function (x) { return x !== id; }), root, summary);
      });
    });

    root.querySelectorAll('[data-analys-link]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-analys-link');
        if (!id) return;
        state.openGroupId = null;
        state.linkGroupId = state.linkGroupId === id ? null : id;
        renderSummary(root, summary);
      });
    });

    root.querySelectorAll('[data-analys-unlink]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-analys-unlink');
        if (!id) return;
        var next = Object.assign({}, state.linkedMap);
        delete next[id];
        setLinked(next, root, summary);
      });
    });

    root.querySelectorAll('[data-link-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.linkGroupId = null;
        renderSummary(root, summary);
      });
    });

    root.querySelectorAll('[data-link-confirm]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-link-confirm');
        if (!id) return;
        var panel = root.querySelector('[data-link-panel="' + id + '"]');
        if (!panel) return;
        var picked = panel.querySelector('input[type="radio"]:checked');
        if (!picked) {
          window.alert('Välj en riskfaktor att koppla till.');
          return;
        }
        var riskId = picked.getAttribute('data-link-risk-id') || '';
        var riskNamn = picked.getAttribute('data-link-risk-namn') || '';
        if (!riskId && !riskNamn) {
          window.alert('Välj en riskfaktor att koppla till.');
          return;
        }
        var next = Object.assign({}, state.linkedMap);
        next[id] = [{ id: riskId, namn: riskNamn }];
        // Koppling ersätter avstå för samma grupp.
        var skipped = state.skippedIds.filter(function (x) { return x !== id; });
        if (skipped.length !== state.skippedIds.length) {
          state.skippedIds = normalizeSkipped(skipped);
          writeLocalSkipped(state.skippedIds);
        }
        setLinked(next, root, summary);
      });
    });

    root.querySelectorAll('[data-analys-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-analys-action');
        var id = btn.getAttribute('data-analys-group');
        var Forslag = API();
        var analysGroup = (state.groups || []).find(function (g) { return g.id === id; });
        if (action === 'close') {
          state.openGroupId = null;
          renderSummary(root, summary);
          return;
        }
        if (!Forslag || !analysGroup) return;
        var panel = root.querySelector('[data-analys-panel="' + id + '"]');
        if (!panel) return;
        var picked = selectedItems(panel, analysGroup);
        if (!picked.length) {
          window.alert('Välj minst en post att analysera.');
          return;
        }
        if (action === 'merge') {
          openPrefills([Forslag.buildMergedPrefill(picked)]);
        } else if (action === 'split') {
          openPrefills(Forslag.buildSplitPrefills(picked));
        }
      });
    });

    root.querySelectorAll('[data-inline-open]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var key = btn.getAttribute('data-inline-open');
        var item = findBlockByKey(summary, key);
        if (!item) return;
        startEdit(item);
        renderSummary(root, summary);
      });
    });

    root.querySelectorAll('[data-inline-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        cancelEdit();
        renderSummary(root, summary);
      });
    });

    root.querySelectorAll('[data-inline-choice]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!state.editDraft) return;
        var field = fieldByKey(state.editDraft.key);
        var choice = btn.getAttribute('data-inline-choice');
        if (!field) return;
        if (field.type === 'multiselect') {
          var list = Array.isArray(state.editDraft.value) ? state.editDraft.value.slice() : [];
          var idx = list.indexOf(choice);
          if (idx >= 0) list.splice(idx, 1);
          else list.push(choice);
          state.editDraft.value = list;
        } else {
          state.editDraft.value = choice;
          if (choice !== 'Ja') state.editDraft.antal = '';
        }
        renderSummary(root, summary);
      });
    });

    var antalInput = root.querySelector('[data-inline-antal]');
    if (antalInput) {
      antalInput.addEventListener('input', function () {
        if (state.editDraft) state.editDraft.antal = antalInput.value;
      });
    }
    var numInput = root.querySelector('[data-inline-number]');
    if (numInput) {
      numInput.addEventListener('input', function () {
        if (state.editDraft) state.editDraft.value = numInput.value;
      });
    }
    var textInput = root.querySelector('[data-inline-text]');
    if (textInput) {
      textInput.addEventListener('input', function () {
        if (state.editDraft) state.editDraft.value = textInput.value;
      });
    }

    root.querySelectorAll('[data-inline-save]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        saveInlineEdit(root);
      });
    });

  }

  function renderError(root, msg) {
    root.innerHTML =
      '<div class="kundrisker-enkat is-empty">' +
        '<div class="kundrisker-enkat-head"><h3>Från byråprofilen</h3></div>' +
        '<p class="kundrisker-enkat-empty">' + escapeHtml(msg || 'Kunde inte hämta enkät-svaren just nu.') + '</p>' +
        '<a class="btn btn-secondary kundrisker-enkat-cta" href="byra-profil-enkate.html?section=kundstock">Öppna enkäten</a>' +
      '</div>';
  }

  function loadSkippedFromByraResa() {
    return fetch(baseUrl() + '/api/byra-resa', authOpts())
      .then(function (res) {
        if (res.status === 401) return null;
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        state.canEditResa = data.canEdit !== false;
        state.byraResaState = data.state || null;
        state.byraKey = String(data.recordId || '').trim() || state.byraKey;
        var skippedServer = normalizeSkipped(
          data.state && data.state.kundriskAnalysSkipped
        );
        var skippedLocal = readLocalSkipped();
        var linkedServer = normalizeLinked(
          data.state && data.state.kundriskAnalysLinked
        );
        var linkedLocal = readLocalLinked();
        if (state.canEditResa) {
          state.skippedIds = skippedServer;
          state.linkedMap = linkedServer;
          writeLocalSkipped(skippedServer);
          writeLocalLinked(linkedServer);
        } else {
          // Medarbetare kan inte PUT:a byråresa — lokal spegling per byrå.
          state.skippedIds = skippedLocal.length ? skippedLocal : skippedServer;
          state.linkedMap = Object.keys(linkedLocal).length ? linkedLocal : linkedServer;
        }
      })
      .catch(function () {
        state.skippedIds = readLocalSkipped();
        state.linkedMap = readLocalLinked();
      });
  }

  function mount() {
    var root = document.getElementById('kundrisker-enkat-root');
    if (!root) return;

    root.innerHTML =
      '<div class="kundrisker-enkat is-loading">' +
        '<p class="kundrisker-enkat-lead">Hämtar svar från byråprofilen…</p>' +
      '</div>';

    Promise.all([
      fetch(baseUrl() + '/api/byra/profil-schema', authOpts()),
      fetch(baseUrl() + '/api/byra/info', authOpts()),
      fetch(baseUrl() + '/api/statistik-riskbedomning', authOpts()).catch(function () { return null; }),
      loadSkippedFromByraResa()
    ])
      .then(function (results) {
        var schemaRes = results[0];
        var profilRes = results[1];
        var statRes = results[2];
        if (schemaRes.status === 401 || profilRes.status === 401) return null;
        if (!schemaRes.ok || !profilRes.ok) throw new Error('Kunde inte hämta byråprofilen');
        var statPromise = Promise.resolve(null);
        if (statRes && statRes.ok) {
          statPromise = statRes.json().catch(function () { return null; });
        }
        return Promise.all([schemaRes.json(), profilRes.json(), statPromise]);
      })
      .then(function (data) {
        if (!data) return;
        var schema = data[0] || {};
        var profilPayload = data[1] || {};
        var profil = profilPayload.fields || profilPayload || {};
        state.schema = schema;
        state.profil = profil;
        state.clientflowStat = data[2] || null;
        cancelEdit();
        var summary = buildSummary(profil, schema);
        if (!summary.hasAnswers) renderEmpty(root);
        else renderSummary(root, summary);

        var tries = 0;
        var timer = setInterval(function () {
          tries += 1;
          if ((window.riskManager && window.riskManager.risks && window.riskManager.risks.length) || tries > 40) {
            clearInterval(timer);
            refresh();
          }
        }, 500);
      })
      .catch(function (err) {
        renderError(root, err && err.message);
      });
  }

  /** Anropas efter sparad riskanalys så Analysera-knappar/status uppdateras. */
  function refresh() {
    var root = document.getElementById('kundrisker-enkat-root');
    if (!root || !state.summary) return;
    if (!state.summary.hasAnswers) {
      renderEmpty(root);
      return;
    }
    renderSummary(root, state.summary);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  /**
   * Från riskfaktor-modal: koppla den aktuella analyserade faktorn till en statistikgrupp.
   */
  function openLinkFromRisk(riskId, riskNamn) {
    var root = document.getElementById('kundrisker-enkat-root');
    if (!root) {
      window.alert('Öppna en sida med statistik-kort (Vilka är våra kunder eller Verksamhetsspecifika) för att koppla.');
      return;
    }
    if (!state.summary || !state.summary.hasAnswers) {
      window.alert('Statistik-korten har inte laddats ännu.');
      return;
    }
    refreshGroups();
    var options = (state.allGroups || []).slice();
    if (!options.length) {
      window.alert('Inga statistikområden att koppla till just nu.');
      return;
    }
    var existing = root.querySelector('.kundrisker-risk-link-overlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.className = 'kundrisker-risk-link-overlay';
    overlay.innerHTML =
      '<div class="kundrisker-risk-link-dialog" role="dialog" aria-label="Koppla till statistik">' +
        '<h4>Koppla «' + escapeHtml(riskNamn || 'riskfaktor') + '» till statistik</h4>' +
        '<p class="kundrisker-analys-panel-hint">Välj vilket statistikområde som redan täcks av den här riskfaktorn.</p>' +
        '<div class="kundrisker-analys-checks">' +
          options.map(function (g) {
            return (
              '<label class="kundrisker-analys-check">' +
                '<input type="radio" name="risk-link-statistik" value="' + escapeHtml(g.id) + '">' +
                '<span class="kundrisker-analys-check-label"><strong>' +
                  escapeHtml(g.buttonLabel || g.id) +
                '</strong></span>' +
              '</label>'
            );
          }).join('') +
        '</div>' +
        '<div class="kundrisker-analys-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-risk-link-confirm>Koppla</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-risk-link-cancel>Avbryt</button>' +
        '</div>' +
      '</div>';
    root.appendChild(overlay);
    overlay.querySelector('[data-risk-link-cancel]').addEventListener('click', function () {
      overlay.remove();
    });
    overlay.querySelector('[data-risk-link-confirm]').addEventListener('click', function () {
      var selected = overlay.querySelector('input[name="risk-link-statistik"]:checked');
      if (!selected) {
        window.alert('Välj ett statistikområde.');
        return;
      }
      var groupId = selected.value;
      var next = Object.assign({}, state.linkedMap);
      next[groupId] = [{ id: String(riskId || ''), namn: String(riskNamn || '') }];
      overlay.remove();
      setLinked(next, root, state.summary);
    });
  }

  window.KundriskerEnkatSammanfattning = {
    buildSummary: buildSummary,
    buildBranschSummaryDesc: buildBranschSummaryDesc,
    HOGRISK_AUTHORITY: HOGRISK_AUTHORITY,
    mount: mount,
    refresh: refresh,
    drillTypForField: drillTypForField,
    getNestedRiskIds: getNestedRiskIds,
    openLinkFromRisk: openLinkFromRisk,
    getState: function () { return state; },
    /** Test-/debughjälpare för chip-val och flytande Skapa analys. */
    __test: {
      formNameFromAnalysItem: formNameFromAnalysItem,
      findOpenChipMatch: findOpenChipMatch,
      openItemsForField: openItemsForField,
      namedListChips: namedListChips,
      selectableChipHtml: selectableChipHtml,
      mergeBranschRowsForDisplay: mergeBranschRowsForDisplay,
      prefillsFromChipSelection: prefillsFromChipSelection,
      chipAnalysBarHtml: chipAnalysBarHtml,
      refreshGroups: refreshGroups,
      pruneChipSelection: pruneChipSelection,
      cardsForCurrentPage: cardsForCurrentPage,
      COMPOSITE_CARDS: COMPOSITE_CARDS
    }
  };
})();
