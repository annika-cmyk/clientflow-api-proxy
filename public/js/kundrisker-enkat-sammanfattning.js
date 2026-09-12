/**
 * Read-only sammanfattning av byråprofil-enkätens kundrelaterade svar
 * på sidan Vilka är våra kunder.
 */
(function () {
  'use strict';

  var SECTION_IDS = ['kundstock', 'geografi', 'kundintro'];
  var HOGRISK_NONE = 'Inga högriskbranscher';

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
    var groupsHtml = summary.groups.map(function (g) {
      var rows = g.items.map(function (item) {
        return (
          '<li>' +
            '<span class="kundrisker-enkat-q">' + escapeHtml(item.label) + '</span>' +
            '<span class="kundrisker-enkat-a">' + escapeHtml(item.display) + '</span>' +
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
        '<p class="kundrisker-enkat-lead">Svar från byråprofil-enkäten som rör kundstock och geografi — read-only här, redigera i enkäten.</p>' +
        '<div class="kundrisker-enkat-groups">' + groupsHtml + '</div>' +
      '</div>';
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
        var summary = buildSummary(profil, schema);
        if (!summary.hasAnswers) renderEmpty(root);
        else renderSummary(root, summary);
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
    mount: mount
  };
})();
