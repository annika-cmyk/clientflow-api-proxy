/**
 * AML-nyheter – gemensamt flöde för redovisningsbyråer (källa + sammanfattning).
 */
(function () {
  var LANG_KEY = 'amla-news-lang';
  var SUM_KEY = 'amla-news-summaries';

  var COPY = {
    sv: {
      summaries: 'Visa sammanfattningar',
      loading: 'Laddar AML-nyheter…',
      empty: 'Inga aktuella nyheter just nu.',
      error: 'Kunde inte hämta nyheterna. Försök igen senare.',
      open: 'Öppna källa',
      source: 'Nyheter för redovisningsbyråer',
      all: 'Visa alla nyheter',
      heading: 'AML-nyheter',
      category: 'Kategori',
      severity: 'Allvar',
      search: 'Sök',
      searchPh: 'Sök titel, sammanfattning eller källa',
      allCats: 'Alla kategorier',
      allSev: 'Alla nivåer',
      fallback: 'Visar AMLA-flödet tills bevakningen är ifylld.',
      aiPending: 'AI skriver sammanfattningar…'
    },
    en: {
      summaries: 'Show summaries',
      loading: 'Loading AML news…',
      empty: 'No current news right now.',
      error: 'Could not load the news. Try again later.',
      open: 'Open source',
      source: 'News for accounting firms',
      all: 'View all news',
      heading: 'AML news',
      category: 'Category',
      severity: 'Severity',
      search: 'Search',
      searchPh: 'Search title, summary or source',
      allCats: 'All categories',
      allSev: 'All severities',
      fallback: 'Showing the AMLA feed until monitoring has items.',
      aiPending: 'AI is writing summaries…'
    }
  };

  var DEFAULT_FILTERS = {
    categories: ['kundkannedom', 'hogriskstater', 'rapporteringsrutiner', 'lagandring', 'branschspecifik', 'ovrigt'],
    severities: ['informativ', 'kraver_atgard'],
    categoryLabels: {
      kundkannedom: 'Kundkännedom',
      hogriskstater: 'Högriskstater',
      rapporteringsrutiner: 'Rapporteringsrutiner',
      lagandring: 'Lagändring',
      branschspecifik: 'Branschspecifik',
      ovrigt: 'Övrigt'
    },
    severityLabels: { informativ: 'Informativ', kraver_atgard: 'Kräver åtgärd' },
    sourceLabels: {
      amla: 'AMLA',
      eurlex: 'EUR-Lex',
      fatf: 'FATF',
      lansstyrelsen: 'Länsstyrelsen',
      finanspolisen: 'Finanspolisen',
      samordningsfunktionen: 'Samordningsfunktionen',
      revisorsinspektionen: 'Revisorsinspektionen',
      srf: 'SRF Konsulterna',
      skatteverket: 'Skatteverket',
      ekobrottsmyndigheten: 'Ekobrottsmyndigheten'
    },
    tierLabels: { low: 'Låg', medium: 'Medium', high: 'Hög' }
  };

  function getAuthOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
  }

  function getBaseUrl() {
    return (window.apiConfig && window.apiConfig.baseUrl) || '';
  }

  function getLang() {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'sv';
  }

  function showSummaries() {
    return localStorage.getItem(SUM_KEY) !== '0';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso, lang) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'sv-SE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return String(iso).slice(0, 10);
    }
  }

  function readFilters(root) {
    var cat = root.querySelector('[data-aml-filter="category"]');
    var sev = root.querySelector('[data-aml-filter="severity"]');
    var q = root.querySelector('[data-aml-filter="q"]');
    return {
      category: cat ? cat.value : '',
      severity: sev ? sev.value : '',
      q: q ? q.value.trim() : ''
    };
  }

  function fillFilterOptions(root, filters, lang) {
    var copy = COPY[lang] || COPY.sv;
    var cat = root.querySelector('[data-aml-filter="category"]');
    var sev = root.querySelector('[data-aml-filter="severity"]');
    if (cat && !cat.getAttribute('data-filled')) {
      cat.innerHTML = '<option value="">' + escapeHtml(copy.allCats) + '</option>' +
        (filters.categories || []).map(function (id) {
          return '<option value="' + escapeHtml(id) + '">' + escapeHtml((filters.categoryLabels || {})[id] || id) + '</option>';
        }).join('');
      cat.setAttribute('data-filled', '1');
    }
    if (sev && !sev.getAttribute('data-filled')) {
      sev.innerHTML = '<option value="">' + escapeHtml(copy.allSev) + '</option>' +
        (filters.severities || []).map(function (id) {
          return '<option value="' + escapeHtml(id) + '">' + escapeHtml((filters.severityLabels || {})[id] || id) + '</option>';
        }).join('');
      sev.setAttribute('data-filled', '1');
    }
  }

  function applyChrome(root, lang) {
    if (!root) return;
    var copy = COPY[lang] || COPY.sv;
    root.querySelectorAll('[data-amla-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-amla-i18n');
      if (copy[key]) el.textContent = copy[key];
    });
    root.querySelectorAll('[data-amla-lang]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-amla-lang') === lang);
    });
    var sum = root.querySelector('#amla-show-summaries, .amla-show-summaries');
    if (sum) sum.checked = showSummaries();
    root.classList.toggle('amla-news--summaries', showSummaries());
    var q = root.querySelector('[data-aml-filter="q"]');
    if (q) q.setAttribute('placeholder', copy.searchPh);
  }

  function renderItems(listEl, items, lang, filters, limit) {
    var copy = COPY[lang] || COPY.sv;
    var rows = limit ? items.slice(0, limit) : items;
    if (!rows.length) {
      listEl.innerHTML = '<p class="amla-news-empty">' + escapeHtml(copy.empty) + '</p>';
      return;
    }
    listEl.innerHTML = rows.map(function (item) {
      var sourceLabel = (filters.sourceLabels || {})[item.source] || item.source || '';
      var catLabel = (filters.categoryLabels || {})[item.category] || item.category || '';
      var sevLabel = (filters.severityLabels || {})[item.severity] || item.severity || '';
      var link = item.sourceUrl || item.link || '';
      return (
        '<article class="amla-news-item">' +
          '<div class="amla-news-meta">' +
            '<time class="amla-news-date" datetime="' + escapeHtml(item.publishedAt || '') + '">' +
              escapeHtml(formatDate(item.publishedAt, lang)) +
            '</time>' +
            (sourceLabel ? '<span class="amla-news-source">' + escapeHtml(sourceLabel) + '</span>' : '') +
          '</div>' +
          '<div class="amla-news-badges">' +
            (catLabel ? '<span class="amla-badge">' + escapeHtml(catLabel) + '</span>' : '') +
            (sevLabel ? '<span class="amla-badge amla-badge-sev-' + escapeHtml(item.severity || '') + '">' + escapeHtml(sevLabel) + '</span>' : '') +
          '</div>' +
          '<h3 class="amla-news-title">' +
            '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">' +
              escapeHtml(item.title) +
            '</a>' +
          '</h3>' +
          '<p class="amla-news-summary">' + escapeHtml(item.summary || item.summaryEn || '') + '</p>' +
          (item.summaryKind === 'ai' ? '<p class="amla-news-summary-kind">Sammanfattning för redovisningsbyråer</p>' : '') +
          '<a class="amla-news-open" href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(copy.open) + ' <i class="fas fa-external-link-alt"></i>' +
          '</a>' +
        '</article>'
      );
    }).join('');
  }

  function mapLegacyItems(data) {
    return (data.items || []).map(function (item) {
      return {
        id: item.id || item.link,
        title: item.title,
        sourceUrl: item.link,
        publishedAt: item.publishedAt,
        summary: item.summary || item.summaryEn || '',
        source: 'amla',
        category: '',
        severity: ''
      };
    });
  }

  async function fetchNews(lang, filters) {
    var qs = new URLSearchParams();
    if (filters.category) qs.set('category', filters.category);
    if (filters.severity) qs.set('severity', filters.severity);
    if (filters.q) qs.set('q', filters.q);
    var res = await fetch(getBaseUrl() + '/api/aml-news?' + qs.toString(), getAuthOpts());
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.success) {
      return { mode: 'matched', data: data };
    }
    var legacy = await fetch(getBaseUrl() + '/api/amla-news?lang=' + encodeURIComponent(lang), getAuthOpts());
    var legacyData = await legacy.json().catch(function () { return {}; });
    if (!legacy.ok) throw new Error(data.error || legacyData.error || 'fetch failed');
    return {
      mode: 'legacy',
      data: {
        items: mapLegacyItems(legacyData),
        shown: legacyData.shown,
        filters: DEFAULT_FILTERS
      }
    };
  }

  async function loadInto(root, opts) {
    opts = opts || {};
    var lang = getLang();
    var status = root.querySelector('.amla-news-status, #amla-news-status');
    var list = root.querySelector('.amla-news-list, #amla-news-list');
    var copy = COPY[lang] || COPY.sv;
    applyChrome(root, lang);
    if (status) status.textContent = copy.loading;
    try {
      var query = opts.limit ? { category: '', severity: '', q: '' } : readFilters(root);
      var result = await fetchNews(lang, query);
      var filters = Object.assign({}, DEFAULT_FILTERS, result.data.filters || {});
      if (!opts.limit) fillFilterOptions(root, filters, lang);
      if (status) {
        var count = result.data.shown != null ? result.data.shown : (result.data.items || []).length;
        status.textContent = (result.mode === 'legacy' ? copy.fallback : copy.source) +
          ' · ' + count + (lang === 'en' ? ' articles' : ' artiklar');
        var waitingAi = (result.data.items || []).some(function (item) { return !item.classifiedAt; });
        if (waitingAi && result.mode !== 'legacy') status.textContent += ' · ' + copy.aiPending;
      }
      if (list) renderItems(list, result.data.items || [], lang, filters, opts.limit || 0);
      if (!opts.limit && result.mode !== 'legacy' && !root.getAttribute('data-aml-ai-retry')) {
        var pending = (result.data.items || []).some(function (item) { return !item.classifiedAt; });
        if (pending) {
          root.setAttribute('data-aml-ai-retry', '1');
          setTimeout(function () { loadInto(root, opts); }, 16000);
        }
      }
    } catch (err) {
      console.error('AML-nyheter:', err);
      if (status) status.textContent = copy.error;
      if (list) list.innerHTML = '';
    }
  }

  function bindControls(root, opts) {
    root.querySelectorAll('[data-amla-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        localStorage.setItem(LANG_KEY, btn.getAttribute('data-amla-lang') === 'en' ? 'en' : 'sv');
        loadInto(root, opts);
      });
    });
    var sum = root.querySelector('#amla-show-summaries, .amla-show-summaries');
    if (sum) {
      sum.checked = showSummaries();
      sum.addEventListener('change', function () {
        localStorage.setItem(SUM_KEY, sum.checked ? '1' : '0');
        root.classList.toggle('amla-news--summaries', sum.checked);
      });
    }
    var searchTimer = null;
    root.querySelectorAll('[data-aml-filter]').forEach(function (el) {
      var isSearch = el.getAttribute('data-aml-filter') === 'q';
      el.addEventListener(isSearch ? 'input' : 'change', function () {
        if (!isSearch) {
          loadInto(root, opts);
          return;
        }
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { loadInto(root, opts); }, 300);
      });
    });
  }

  function initPage() {
    var root = document.getElementById('amla-news-page');
    if (!root) return;
    if (!localStorage.getItem(SUM_KEY)) localStorage.setItem(SUM_KEY, '1');
    bindControls(root, {});
    var start = function () { loadInto(root, {}); };
    if (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) start();
    window.addEventListener('clientflow:authReady', start);
  }

  function initDashboard() {
    var root = document.getElementById('dashboard-amla-news');
    if (!root) return;
    if (!localStorage.getItem(SUM_KEY)) localStorage.setItem(SUM_KEY, '1');
    bindControls(root, { limit: 3 });
    var start = function () { loadInto(root, { limit: 3 }); };
    if (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) start();
    window.addEventListener('clientflow:authReady', start);
  }

  function init() {
    initPage();
    initDashboard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
