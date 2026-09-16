/**
 * Read-only sammanfattning av byråprofil-enkätens kundrelaterade svar
 * på sidan Vilka är våra kunder — med knappar som föreslår analyser
 * och checklist-status (analyserad / avstådd / ej gjord än).
 */
(function () {
  'use strict';

  var SECTION_IDS = ['kundstock', 'geografi', 'kundintro'];
  var HOGRISK_NONE = 'Inga högriskbranscher';
  var SKIP_STORAGE_PREFIX = 'kundriskAnalysSkipped:';
  var state = {
    profil: null,
    schema: null,
    allGroups: [],
    groups: [],
    openGroupId: null,
    pendingPrefills: [],
    skippedIds: [],
    byraResaState: null,
    canEditResa: false,
    byraKey: '',
    summary: null,
    clientflowStat: null,
    editingKey: null,
    editDraft: null,
    editSaving: false,
    editError: ''
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

  function namedListChips(typ, rows, titelPrefix) {
    if (!rows || !rows.length) return '';
    return (
      '<div class="statistik-stat-chips">' +
      rows.map(function (r) {
        var namn = r.namn || r.form || '';
        var antal = r.antal != null ? r.antal : r.count;
        var label = antal != null && antal !== '' ? namn + ' · ' + antal : namn;
        return (
          '<button type="button" class="statistik-stat-chip" ' +
            'data-typ="' + escapeHtml(typ) + '" ' +
            'data-namn="' + escapeHtml(namn) + '" ' +
            'data-titel="' + escapeHtml((titelPrefix ? titelPrefix + namn : namn)) + '" ' +
            'title="Klicka för att se kunder">' +
            escapeHtml(label) +
          '</button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function staticValueChips(display) {
    var text = String(display || '').trim();
    if (!text) return '<p class="stat-list-empty">Inget svar.</p>';
    var parts = text.split(/\s*,\s*/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (parts.length <= 1) {
      return (
        '<div class="statistik-stat-chips">' +
          '<span class="statistik-stat-chip statistik-stat-chip--static">' + escapeHtml(text) + '</span>' +
        '</div>'
      );
    }
    return (
      '<div class="statistik-stat-chips">' +
      parts.map(function (p) {
        return '<span class="statistik-stat-chip statistik-stat-chip--static">' + escapeHtml(p) + '</span>';
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
            '<button type="button" class="statistik-stat-chip" data-typ="alla" data-titel="Alla kunder" title="Klicka för att se kunder">' +
              escapeHtml('Antal kunder · ' + stat.antalKunder) +
            '</button>' +
          '</div>',
        fromClientflow: true
      };
    }
    if (typ === 'bolagsform' && Array.isArray(stat.bolagsform) && stat.bolagsform.length) {
      return { html: namedListChips('bolagsform', stat.bolagsform), fromClientflow: true };
    }
    if (typ === 'kund-bransch' && Array.isArray(stat.kundBranschBuckets) && stat.kundBranschBuckets.length) {
      return { html: namedListChips('kund-bransch', stat.kundBranschBuckets), fromClientflow: true };
    }
    if (typ === 'hogriskbransch') {
      var hr = stat.högriskbransch || stat.hogriskbransch || [];
      if (hr.length) return { html: namedListChips('hogriskbransch', hr), fromClientflow: true };
    }
    if (typ === 'pep-sanktion' && typeof stat.antalPepEllerSanktion === 'number') {
      return {
        html:
          '<div class="statistik-stat-chips">' +
            '<button type="button" class="statistik-stat-chip" data-typ="pep-sanktion" ' +
              'data-titel="PEP eller anhörig till PEP" title="Klicka för att se kunder">' +
              escapeHtml('PEP eller anhörig till PEP · ' + stat.antalPepEllerSanktion) +
            '</button>' +
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
        return { html: namedListChips('riskniva', rows, 'Residualrisk: '), fromClientflow: true };
      }
    }
    return null;
  }

  function countedChipsHtml(item) {
    var live = clientflowChipsForItem(item);
    if (live) return live.html;

    var typ = drillTypForField(null, item);
    if (!typ || !state.profil) return staticValueChips(item.display);
    if (typ === 'pep-sanktion') {
      var pepRaw = state.profil[item.key];
      pepRaw = Array.isArray(pepRaw) ? pepRaw.join(', ') : String(pepRaw || '').trim();
      if (!/^ja/i.test(pepRaw)) return staticValueChips(item.display);
      return (
        '<div class="statistik-stat-chips">' +
          '<button type="button" class="statistik-stat-chip" ' +
            'data-typ="pep-sanktion" ' +
            'data-titel="PEP eller anhörig till PEP" ' +
            'title="Klicka för kundlista från Clientflow">' +
            escapeHtml(item.display) +
          '</button>' +
        '</div>'
      );
    }
    var raw = state.profil[item.key];
    raw = Array.isArray(raw) ? raw.join(', ') : String(raw || '').trim();
    if (!raw) return staticValueChips(item.display);
    if (typ === 'hogriskbransch' && raw === HOGRISK_NONE) return staticValueChips(HOGRISK_NONE);
    var rows = parseCounted(raw);
    if (!rows.length) return staticValueChips(item.display);
    return namedListChips(
      typ,
      rows.map(function (r) { return { namn: r.form, antal: r.count }; })
    );
  }

  function valueHtmlForItem(item) {
    if (drillTypForField(null, item) || item.key === 'antalKunder') {
      return countedChipsHtml(item);
    }
    return staticValueChips(item.display);
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

  function buildSummary(profil, schema) {
    var fieldsByKey = {};
    (schema.fields || []).forEach(function (f) {
      if (f && f.key) fieldsByKey[f.key] = f;
    });
    var groups = [];
    var answeredCount = 0;

    SECTION_IDS.forEach(function (sectionId) {
      var section = (schema.sections || []).find(function (s) { return s && s.id === sectionId; });
      if (!section) return;
      var keys = Array.isArray(section.fieldKeys) ? section.fieldKeys : [];
      var sectionFields = keys.map(function (k) { return fieldsByKey[k]; }).filter(Boolean);
      var merged = {};
      var items = [];

      sectionFields.forEach(function (field) {
        if (!field || merged[field.key]) return;
        if (field.requiredWhen) return;
        var antalField = companionAntal(field, sectionFields);
        if (antalField) merged[antalField.key] = true;
        if (!isAnswered(profil[field.key], field)) return;
        var display = formatDisplay(field, profil[field.key]);
        if (antalField && isAnswered(profil[antalField.key], antalField)) {
          display = display + ' · ca ' + String(profil[antalField.key]).trim();
        }
        items.push({
          key: field.key,
          label: field.label || field.key,
          display: display,
          antalKey: antalField ? antalField.key : null,
          fieldType: field.type || ''
        });
        answeredCount += 1;
      });

      if (items.length) {
        groups.push({ id: section.id, title: section.title || sectionId, items: items });
      }
    });

    return { hasAnswers: answeredCount > 0, answeredCount: answeredCount, groups: groups };
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

  function localSkipKey() {
    return SKIP_STORAGE_PREFIX + (state.byraKey || 'default');
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
    state.groups = Forslag.filterOpenGroups(state.allGroups, risks, state.skippedIds);
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
    return Forslag.resolveGroupChecklistStatus(analysGroup, risksList(), state.skippedIds);
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
    if (!openGroup || !statusRow || statusRow.status !== 'pending') return '';
    var optionalCls = openGroup.optional ? ' is-optional' : '';
    return (
      '<button type="button" class="btn btn-secondary btn-sm kundrisker-analys-btn' + optionalCls + '" ' +
        'data-analys-group="' + escapeHtml(openGroup.id) + '">' +
        escapeHtml(openGroup.buttonLabel) +
      '</button>'
    );
  }

  function skipActionsHtml(allGroup, statusRow) {
    if (!allGroup || !statusRow) return '';
    if (statusRow.status === 'pending') {
      return (
        '<button type="button" class="btn btn-ghost btn-sm kundrisker-analys-skip" ' +
          'data-analys-skip="' + escapeHtml(allGroup.id) + '" title="Markera som avstådd utan att skapa analys">' +
          'Avstå</button>'
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
    var c = Forslag.summarizeChecklistStatuses(state.allGroups, risksList(), state.skippedIds);
    if (!c.total) return '';
    return (
      '<p class="kundrisker-enkat-checklist" role="status">' +
        '<span class="kundrisker-enkat-checklist-item is-analyserad">' + c.analyserad + ' analyserade</span>' +
        '<span class="kundrisker-enkat-checklist-item is-avstadd">' + c.avstadd + ' avstådda</span>' +
        '<span class="kundrisker-enkat-checklist-item is-pending">' + c.pending + ' ej gjorda än</span>' +
      '</p>'
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


  function renderSummary(root, summary) {
    refreshGroups();
    var panelRendered = {};
    state.summary = summary;

    var groupsHtml = summary.groups.map(function (g) {
      var sections = g.items.map(function (item) {
        var allGroup = allGroupForItem(item);
        var openGroup = openGroupForItem(item);
        var statusRow = statusForGroup(allGroup);
        var btn = buttonForItem(item, openGroup, statusRow);
        var skipBtn = skipActionsHtml(allGroup, statusRow);
        var badge = statusBadgeHtml(statusRow);
        var panel = '';
        if (openGroup && state.openGroupId === openGroup.id && !panelRendered[openGroup.id]) {
          panelRendered[openGroup.id] = true;
          panel = panelHtml(openGroup);
        }
        var rowStatusCls = statusRow ? ' is-status-' + statusRow.status : '';
        var fromCf = itemUsesClientflow(item);
        var actions = '';
        if (badge || btn || skipBtn) {
          actions =
            '<div class="kundrisker-enkat-stat-actions">' +
              badge + btn + skipBtn +
            '</div>';
        }
        return (
          '<section class="statistik-section kundrisker-enkat-stat-section' +
            (allGroup ? ' has-analys' : '') + rowStatusCls + '" data-field-key="' + escapeHtml(item.key) + '"' +
            (allGroup ? ' data-analys-group-id="' + escapeHtml(allGroup.id) + '"' : '') + '>' +
            '<div class="kundrisker-enkat-stat-head">' +
              '<h3><i class="fas ' + escapeHtml(iconForKey(item.key)) + '"></i> ' +
                escapeHtml(item.label) + ' ' + sourceBadgeHtml(fromCf) +
              '</h3>' +
              actions +
            '</div>' +
            '<p class="statistik-section-desc">' + escapeHtml(descForItem(item, fromCf)) + '</p>' +
            '<div class="stat-list">' + valueAreaHtml(item) + '</div>' +
            panel +
          '</section>'
        );
      }).join('');
      return (
        '<div class="kundrisker-enkat-group">' +
          '<h4 class="kundrisker-enkat-group-title">' + escapeHtml(g.title) + '</h4>' +
          '<div class="statistik-sections kundrisker-enkat-stat-sections">' + sections + '</div>' +
        '</div>'
      );
    }).join('');

    root.innerHTML =
      '<div class="kundrisker-enkat kundrisker-enkat--stat">' +
        '<div class="kundrisker-enkat-head">' +
          '<h3>Vilka är våra kunder</h3>' +
          '<div class="kundrisker-enkat-head-links">' +
            '<a class="kundrisker-enkat-edit" href="statistik-riskbedomning.html">Öppna all statistik</a>' +
            '<a class="kundrisker-enkat-edit" href="byra-profil-enkate.html?section=kundstock">Ändra i enkäten</a>' +
          '</div>' +
        '</div>' +
        '<p class="kundrisker-enkat-lead">Alla uppgifter från byråprofil-enkäten om vilka byråns kunder är — i samma chip- och sektionsformat som Statistik för riskbedömning. Där live-data finns används Clientflow-siffror (klickbara). Övriga enkät-svar visas som etiketter — klicka <strong>Ändra</strong> för att uppdatera dem direkt här. Använd <strong>Analysera</strong> för analyskort, eller <strong>Avstå</strong> om ni medvetet hoppar över.</p>' +
        checklistSummaryHtml() +
        '<div class="kundrisker-enkat-groups">' + groupsHtml + '</div>' +
      '</div>';

    bindPanelEvents(root, summary);
    bindBranschChips(root);
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
    root.querySelectorAll('.statistik-stat-chip, .kundrisker-bransch-chip').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
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
    persistSkippedToByraResa();
    renderSummary(root, summary);
  }

  function persistSkippedToByraResa() {
    if (!state.byraResaState) return;
    var nextState = Object.assign({}, state.byraResaState, {
      kundriskAnalysSkipped: state.skippedIds.slice()
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
        var item = null;
        (summary.groups || []).forEach(function (g) {
          (g.items || []).forEach(function (it) {
            if (it.key === key) item = it;
          });
        });
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
        var fromServer = normalizeSkipped(
          data.state && data.state.kundriskAnalysSkipped
        );
        var fromLocal = readLocalSkipped();
        if (state.canEditResa) {
          state.skippedIds = fromServer;
          writeLocalSkipped(fromServer);
        } else {
          // Medarbetare kan inte PUT:a byråresa — lokal spegling per byrå.
          state.skippedIds = fromLocal.length ? fromLocal : fromServer;
        }
      })
      .catch(function () {
        state.skippedIds = readLocalSkipped();
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

  window.KundriskerEnkatSammanfattning = {
    buildSummary: buildSummary,
    mount: mount,
    refresh: refresh,
    drillTypForField: drillTypForField,
    getState: function () { return state; }
  };
})();
