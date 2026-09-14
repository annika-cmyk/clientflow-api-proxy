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
    allGroups: [],
    groups: [],
    openGroupId: null,
    pendingPrefills: [],
    skippedIds: [],
    byraResaState: null,
    canEditResa: false,
    byraKey: '',
    summary: null
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
    if (field && (field.type === 'bolagsformer' || field.type === 'branscher' || field.key === 'kundernasBranscher')) {
      return parseCounted(raw).some(function (r) { return r.form && String(r.count || '') !== ''; });
    }
    return true;
  }

  function drillTypForField(field, item) {
    var key = (item && item.key) || (field && field.key) || '';
    if (key === 'kundernasBranscher' || (field && field.type === 'branscher')) return 'kund-bransch';
    if (key === 'branscherKundstock' || (field && field.type === 'hogrisk-branscher')) return 'hogriskbransch';
    if (key === 'vanligasteBolagsformer' || (field && field.type === 'bolagsformer')) return 'bolagsform';
    if (key === 'pepKunder') return 'pep-sanktion';
    return '';
  }

  function countedChipsHtml(item) {
    var typ = drillTypForField(null, item);
    if (!typ || !state.profil) return escapeHtml(item.display);
    if (typ === 'pep-sanktion') {
      var pepRaw = state.profil[item.key];
      pepRaw = Array.isArray(pepRaw) ? pepRaw.join(', ') : String(pepRaw || '').trim();
      if (!/^ja/i.test(pepRaw)) return escapeHtml(item.display);
      return (
        '<button type="button" class="kundrisker-bransch-chip" ' +
          'data-typ="pep-sanktion" ' +
          'data-titel="PEP eller anhörig till PEP" ' +
          'title="Klicka för kundlista från Clientflow">' +
          escapeHtml(item.display) +
        '</button>'
      );
    }
    var raw = state.profil[item.key];
    raw = Array.isArray(raw) ? raw.join(', ') : String(raw || '').trim();
    if (!raw) return escapeHtml(item.display);
    if (typ === 'hogriskbransch' && raw === HOGRISK_NONE) return escapeHtml(HOGRISK_NONE);
    var rows = parseCounted(raw);
    if (!rows.length) return escapeHtml(item.display);
    return (
      '<span class="kundrisker-enkat-chips">' +
      rows.map(function (r) {
        var label = r.count ? r.form + ' · ' + r.count : r.form;
        return (
          '<button type="button" class="kundrisker-bransch-chip" ' +
            'data-typ="' + escapeHtml(typ) + '" ' +
            'data-namn="' + escapeHtml(r.form) + '" ' +
            'data-titel="' + escapeHtml(r.form) + '" ' +
            'title="Klicka för kundlista från Clientflow">' +
            escapeHtml(label) +
          '</button>'
        );
      }).join('') +
      '</span>'
    );
  }

  function formatDisplay(field, value) {
    if (!isAnswered(value, field)) return '';
    if (field && (field.key === 'branscherKundstock' || field.type === 'hogrisk-branscher')) {
      var raw = Array.isArray(value) ? value.join(', ') : String(value).trim();
      if (raw === HOGRISK_NONE) return HOGRISK_NONE;
      return formatCounted(raw) || raw;
    }
    if (field && (field.type === 'bolagsformer' || field.type === 'branscher' || field.key === 'kundernasBranscher')) {
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
        items.push({ key: field.key, label: field.label || field.key, display: display });
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

  function refreshGroups() {
    var Forslag = API();
    if (!Forslag || !state.profil) {
      state.allGroups = [];
      state.groups = [];
      return;
    }
    var risks = risksList();
    state.allGroups = Forslag.buildAnalysGroups(state.profil);
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
          '<h3>Från byråprofilen <span class="statistik-source-badge statistik-source-badge--byraprofil" title="Svar ni fyllt i byråprofil-enkäten">Byråprofil</span></h3>' +
        '</div>' +
        '<p class="kundrisker-enkat-lead">Här syns svaren ni redan gett om kundstocken i byråprofil-enkäten — som stöd när ni bedömer kundkategorier och geografi.</p>' +
        '<p class="kundrisker-enkat-empty">Ni har ännu inte fyllt i kundstocken i enkäten.</p>' +
        '<a class="btn btn-secondary kundrisker-enkat-cta" href="byra-profil-enkate.html?section=kundstock">Fyll i kundstocken</a>' +
      '</div>';
  }

  function renderSummary(root, summary) {
    refreshGroups();
    var panelRendered = {};
    state.summary = summary;

    var groupsHtml = summary.groups.map(function (g) {
      var rows = g.items.map(function (item) {
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
        var actions = '';
        if (badge || btn || skipBtn) {
          actions =
            '<span class="kundrisker-enkat-actions">' +
              badge + btn + skipBtn +
            '</span>';
        }
        return (
          '<li class="kundrisker-enkat-row' + (allGroup ? ' has-analys' : '') + rowStatusCls + '" data-field-key="' + escapeHtml(item.key) + '"' +
            (allGroup ? ' data-analys-group-id="' + escapeHtml(allGroup.id) + '"' : '') + '>' +
            '<div class="kundrisker-enkat-row-main">' +
              '<span class="kundrisker-enkat-q">' + escapeHtml(item.label) + '</span>' +
              '<span class="kundrisker-enkat-a">' + (drillTypForField(null, item) ? countedChipsHtml(item) : escapeHtml(item.display)) + '</span>' +
              actions +
            '</div>' +
            panel +
          '</li>'
        );
      }).join('');
      return (
        '<div class="kundrisker-enkat-group">' +
          '<h4 class="kundrisker-enkat-group-title">' + escapeHtml(g.title) + '</h4>' +
          '<ul class="kundrisker-enkat-list">' + rows + '</ul>' +
        '</div>'
      );
    }).join('');

    root.innerHTML =
      '<div class="kundrisker-enkat">' +
        '<div class="kundrisker-enkat-head">' +
          '<h3>Från byråprofilen <span class="statistik-source-badge statistik-source-badge--byraprofil" title="Svar ni fyllt i byråprofil-enkäten">Byråprofil</span></h3>' +
          '<a class="kundrisker-enkat-edit" href="byra-profil-enkate.html?section=kundstock">Ändra i enkäten</a>' +
        '</div>' +
        '<p class="kundrisker-enkat-lead">Svar från byråprofil-enkäten om kundstock och geografi. Klicka på <strong>bransch</strong>, <strong>bolagsform</strong> eller <strong>PEP</strong> för kundlista från Clientflow. Använd <strong>Analysera</strong> för analyskort, eller <strong>Avstå</strong> om ni medvetet hoppar över.</p>' +
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
    root.querySelectorAll('.kundrisker-bransch-chip').forEach(function (btn) {
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
      loadSkippedFromByraResa()
    ])
      .then(function (results) {
        var schemaRes = results[0];
        var profilRes = results[1];
        if (schemaRes.status === 401 || profilRes.status === 401) return null;
        if (!schemaRes.ok || !profilRes.ok) throw new Error('Kunde inte hämta byråprofilen');
        return Promise.all([schemaRes.json(), profilRes.json()]);
      })
      .then(function (data) {
        if (!data) return;
        var schema = data[0] || {};
        var profilPayload = data[1] || {};
        var profil = profilPayload.fields || profilPayload || {};
        state.profil = profil;
        var summary = buildSummary(profil, schema);
        if (!summary.hasAnswers) renderEmpty(root);
        else renderSummary(root, summary);

        // När risklistan laddats om — uppdatera status/knappar.
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
