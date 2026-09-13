/**
 * Read-only sammanfattning av byråprofil-enkätens kundrelaterade svar
 * på sidan Vilka är våra kunder — med knappar som föreslår analyser.
 */
(function () {
  'use strict';

  var SECTION_IDS = ['kundstock', 'geografi', 'kundintro'];
  var HOGRISK_NONE = 'Inga högriskbranscher';
  var state = {
    profil: null,
    groups: [],
    openGroupId: null,
    pendingPrefills: []
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

  function refreshGroups() {
    var Forslag = API();
    if (!Forslag || !state.profil) {
      state.groups = [];
      return;
    }
    var risks = (window.riskManager && window.riskManager.risks) || [];
    state.groups = Forslag.filterOpenGroups(Forslag.buildAnalysGroups(state.profil), risks);
  }

  function groupForItem(item) {
    var Forslag = API();
    if (!Forslag) return null;
    return Forslag.groupForField(state.groups, item.key);
  }

  function buttonForItem(item, analysGroup, renderedGroupIds) {
    if (!analysGroup) return '';
    if (renderedGroupIds[analysGroup.id]) return '';
    renderedGroupIds[analysGroup.id] = true;
    var optionalCls = analysGroup.optional ? ' is-optional' : '';
    return (
      '<button type="button" class="btn btn-secondary btn-sm kundrisker-analys-btn' + optionalCls + '" ' +
        'data-analys-group="' + escapeHtml(analysGroup.id) + '">' +
        escapeHtml(analysGroup.buttonLabel) +
      '</button>'
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
    if (items.length === 1 && analysGroup.allowMerge !== false && analysGroup.allowSplit === false) {
      // single merge-only already has primary button
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
          '<h3>Från byråprofilen</h3>' +
        '</div>' +
        '<p class="kundrisker-enkat-lead">Här syns svaren ni redan gett om kundstocken i byråprofil-enkäten — som stöd när ni bedömer kundkategorier och geografi.</p>' +
        '<p class="kundrisker-enkat-empty">Ni har ännu inte fyllt i kundstocken i enkäten.</p>' +
        '<a class="btn btn-secondary kundrisker-enkat-cta" href="byra-profil-enkate.html?section=kundstock">Fyll i kundstocken</a>' +
      '</div>';
  }

  function renderSummary(root, summary) {
    refreshGroups();
    var renderedGroupIds = {};
    var panelRendered = {};

    var groupsHtml = summary.groups.map(function (g) {
      var rows = g.items.map(function (item) {
        var analysGroup = groupForItem(item);
        var btn = buttonForItem(item, analysGroup, renderedGroupIds);
        var panel = '';
        if (analysGroup && renderedGroupIds[analysGroup.id] && !panelRendered[analysGroup.id]) {
          panelRendered[analysGroup.id] = true;
          panel = panelHtml(analysGroup);
        }
        return (
          '<li class="kundrisker-enkat-row' + (analysGroup ? ' has-analys' : '') + '" data-field-key="' + escapeHtml(item.key) + '">' +
            '<div class="kundrisker-enkat-row-main">' +
              '<span class="kundrisker-enkat-q">' + escapeHtml(item.label) + '</span>' +
              '<span class="kundrisker-enkat-a">' + escapeHtml(item.display) + '</span>' +
              (btn ? '<span class="kundrisker-enkat-actions">' + btn + '</span>' : '') +
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
          '<h3>Från byråprofilen</h3>' +
          '<a class="kundrisker-enkat-edit" href="byra-profil-enkate.html?section=kundstock">Ändra i enkäten</a>' +
        '</div>' +
        '<p class="kundrisker-enkat-lead">Svar från byråprofil-enkäten om kundstock och geografi. Använd <strong>Analysera</strong> för att öppna förslag till analyskort — ni väljer själva vad som slås ihop eller delas upp.</p>' +
        '<div class="kundrisker-enkat-groups">' + groupsHtml + '</div>' +
      '</div>';

    bindPanelEvents(root, summary);
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
          if (modal && modal.style.display === 'none') advanceQueueSoon();
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

  function bindPanelEvents(root, summary) {
    root.querySelectorAll('[data-analys-group].kundrisker-analys-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-analys-group');
        state.openGroupId = state.openGroupId === id ? null : id;
        renderSummary(root, summary);
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

  function mount() {
    var root = document.getElementById('kundrisker-enkat-root');
    if (!root) return;

    root.innerHTML =
      '<div class="kundrisker-enkat is-loading">' +
        '<p class="kundrisker-enkat-lead">Hämtar svar från byråprofilen…</p>' +
      '</div>';

    Promise.all([
      fetch(baseUrl() + '/api/byra/profil-schema', authOpts()),
      fetch(baseUrl() + '/api/byra/info', authOpts())
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

        // När risklistan laddats om — uppdatera knappar (dölj redan skapade).
        var tries = 0;
        var timer = setInterval(function () {
          tries += 1;
          if ((window.riskManager && window.riskManager.risks && window.riskManager.risks.length) || tries > 40) {
            clearInterval(timer);
            if (summary.hasAnswers) renderSummary(root, summary);
          }
        }, 500);
      })
      .catch(function (err) {
        renderError(root, err && err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.KundriskerEnkatSammanfattning = {
    buildSummary: buildSummary,
    mount: mount,
    getState: function () { return state; }
  };
})();
