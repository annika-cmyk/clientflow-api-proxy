/**
 * Clientflow-kundstatistik på Vilka är våra kunder —
 * samma chip-/sektionsutseende och borrning som Statistik för riskbedömning.
 */
(function () {
  'use strict';

  function baseUrl() {
    if (window.apiConfig && window.apiConfig.baseUrl) return window.apiConfig.baseUrl;
    if (window.apiConfig && typeof window.apiConfig.getBaseUrl === 'function') {
      return window.apiConfig.getBaseUrl();
    }
    return 'http://localhost:3001';
  }

  function authOpts() {
    return (
      (window.AuthManager &&
        typeof window.AuthManager.getAuthFetchOptions === 'function' &&
        window.AuthManager.getAuthFetchOptions()) ||
      { credentials: 'include', headers: { 'Content-Type': 'application/json' } }
    );
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  function chipHtml(opts) {
    var typ = opts.typ || '';
    var namn = opts.namn == null ? '' : String(opts.namn);
    var id = opts.id == null ? '' : String(opts.id);
    var titel = opts.titel || namn || 'Kunder';
    var label = opts.label == null ? namn : String(opts.label);
    var antal = opts.antal;
    var text = antal != null && antal !== '' ? label + ' · ' + antal : label;
    var idAttr = id ? ' data-id="' + escapeAttr(id) + '"' : '';
    var namnAttr = namn !== '' ? ' data-namn="' + escapeAttr(namn) + '"' : '';
    return (
      '<button type="button" class="statistik-stat-chip" data-typ="' + escapeAttr(typ) + '"' +
      namnAttr + idAttr +
      ' data-titel="' + escapeAttr(titel) + '" title="Klicka för att se kunder">' +
      escapeHtml(text) +
      '</button>'
    );
  }

  function chipsWrap(html) {
    return '<div class="statistik-stat-chips">' + html + '</div>';
  }

  function emptyMsg(text) {
    return '<p class="stat-list-empty">' + escapeHtml(text) + '</p>';
  }

  function sectionHtml(opts) {
    var list = opts.listHtml || emptyMsg(opts.empty || 'Ingen data.');
    return (
      '<section class="statistik-section">' +
        '<h3><i class="fas ' + escapeAttr(opts.icon || 'fa-chart-bar') + '"></i> ' +
          escapeHtml(opts.title) +
          ' <span class="statistik-source-badge" title="Aggregerat från aktiva kunder i Clientflow">Clientflow</span>' +
        '</h3>' +
        (opts.desc ? '<p class="statistik-section-desc">' + escapeHtml(opts.desc) + '</p>' : '') +
        '<div class="stat-list">' + list + '</div>' +
      '</section>'
    );
  }

  function render(root, data) {
    var n = data.antalKunder || 0;
    var bolag = data.bolagsform || [];
    var bransch = data.kundBranschBuckets || [];
    var hr = data.högriskbransch || data.hogriskbransch || [];
    var pep = typeof data.antalPepEllerSanktion === 'number' ? data.antalPepEllerSanktion : null;

    var antalChips = chipsWrap(
      chipHtml({ typ: 'alla', titel: 'Alla kunder', label: 'Antal kunder', antal: n })
    );

    var bolagHtml = bolag.length
      ? chipsWrap(
          bolag
            .map(function (b) {
              return chipHtml({
                typ: 'bolagsform',
                namn: b.namn,
                titel: b.namn,
                label: b.namn,
                antal: b.antal
              });
            })
            .join('')
        )
      : emptyMsg('Ingen bolagsform registrerad hos kunderna.');

    var branschHtml = bransch.length
      ? chipsWrap(
          bransch
            .map(function (b) {
              return chipHtml({
                typ: 'kund-bransch',
                namn: b.namn,
                titel: b.namn,
                label: b.namn,
                antal: b.antal
              });
            })
            .join('')
        )
      : emptyMsg('Ingen branschstatistik tillgänglig.');

    var hrHtml = hr.length
      ? chipsWrap(
          hr
            .map(function (h) {
              return chipHtml({
                typ: 'hogriskbransch',
                namn: h.namn,
                titel: h.namn,
                label: h.namn,
                antal: h.antal
              });
            })
            .join('')
        )
      : emptyMsg('Inga kunder med högriskbransch registrerad.');

    var pepHtml =
      pep == null
        ? emptyMsg('PEP-uppgift saknas.')
        : chipsWrap(
            chipHtml({
              typ: 'pep-sanktion',
              titel: 'PEP eller anhörig till PEP',
              label: 'PEP eller anhörig till PEP',
              antal: pep
            })
          );

    root.innerHTML =
      '<div class="kundrisker-clientflow-statistik">' +
        '<div class="kundrisker-clientflow-statistik-head">' +
          '<h3>Kundstock från Clientflow <span class="statistik-source-badge" title="Aggregerat från aktiva kunder i Clientflow">Clientflow</span></h3>' +
          '<a class="kundrisker-enkat-edit" href="statistik-riskbedomning.html">Öppna all statistik</a>' +
        '</div>' +
        '<p class="kundrisker-enkat-lead">Samma klickbara etiketter som under Statistik för riskbedömning. Klicka för underbranscher och kundlista.</p>' +
        '<div class="statistik-sections kundrisker-clientflow-sections">' +
          sectionHtml({
            icon: 'fa-users',
            title: 'Antal kunder',
            desc: 'Aktiva kunder på byrån. Klicka för kundlista.',
            listHtml: antalChips
          }) +
          sectionHtml({
            icon: 'fa-building',
            title: 'Bolagsformer',
            desc: 'Antal kunder per bolagsform. Klicka för kundlista.',
            listHtml: bolagHtml
          }) +
          sectionHtml({
            icon: 'fa-layer-group',
            title: 'Branscher',
            desc: 'Översiktsgrupper från kundernas SNI/bransch. Klicka för underbranscher och kundlista.',
            listHtml: branschHtml
          }) +
          sectionHtml({
            icon: 'fa-industry',
            title: 'Högriskbransch',
            desc: 'Antal kunder per högriskbransch. Klicka för underbranscher och kundlista.',
            listHtml: hrHtml
          }) +
          sectionHtml({
            icon: 'fa-user-secret',
            title: 'PEP eller anhörig till PEP',
            desc: 'Enligt KYC-formuläret (punkt 4). Klicka för kundlista.',
            listHtml: pepHtml
          }) +
        '</div>' +
      '</div>';

    if (window.StatistikKunderModal && typeof StatistikKunderModal.bindStatChips === 'function') {
      StatistikKunderModal.bindStatChips(root);
    } else if (window.StatistikKunderModal && typeof StatistikKunderModal.bindRowClicks === 'function') {
      StatistikKunderModal.bindRowClicks(root);
    }
  }

  function renderLoading(root) {
    root.innerHTML =
      '<div class="kundrisker-clientflow-statistik is-loading">' +
        '<p class="kundrisker-enkat-lead">Hämtar kundstatistik från Clientflow…</p>' +
      '</div>';
  }

  function renderError(root, msg) {
    root.innerHTML =
      '<div class="kundrisker-clientflow-statistik is-empty">' +
        '<div class="kundrisker-clientflow-statistik-head">' +
          '<h3>Kundstock från Clientflow</h3>' +
        '</div>' +
        '<p class="kundrisker-enkat-empty">' + escapeHtml(msg || 'Kunde inte hämta statistik just nu.') + '</p>' +
        '<a class="btn btn-secondary kundrisker-enkat-cta" href="statistik-riskbedomning.html">Öppna statistiksidan</a>' +
      '</div>';
  }

  function mount() {
    var root = document.getElementById('kundrisker-clientflow-statistik-root');
    if (!root) return;
    renderLoading(root);

    fetch(baseUrl() + '/api/statistik-riskbedomning', authOpts())
      .then(function (res) {
        if (res.status === 401) return null;
        if (!res.ok) throw new Error('Kunde inte hämta statistik');
        return res.json();
      })
      .then(function (data) {
        if (!data) {
          renderError(root, 'Du måste vara inloggad för att se statistik.');
          return;
        }
        render(root, data);
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

  window.KundriskerClientflowStatistik = { mount: mount, render: render };
})();
