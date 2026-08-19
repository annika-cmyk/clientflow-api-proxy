/**
 * AMLA-nyheter – full sida och dashboard-kort.
 */
(function () {
  var LANG_KEY = 'amla-news-lang';
  var SUM_KEY = 'amla-news-summaries';

  var COPY = {
    sv: {
      summaries: 'Visa sammanfattningar',
      loading: 'Laddar nyheter från AMLA…',
      empty: 'Inga nyheter som rör redovisningsbyråer just nu.',
      error: 'Kunde inte hämta nyheterna. Försök igen senare.',
      open: 'Öppna artikel',
      source: 'Källa: AMLA (EU)',
      all: 'Visa alla nyheter',
      heading: 'AML-nyheter'
    },
    en: {
      summaries: 'Show summaries',
      loading: 'Loading news from AMLA…',
      empty: 'No news relevant to accounting firms right now.',
      error: 'Could not load the news. Try again later.',
      open: 'Open article',
      source: 'Source: AMLA (EU)',
      all: 'View all news',
      heading: 'AML news'
    }
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
    return localStorage.getItem(SUM_KEY) === '1';
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
  }

  function renderItems(listEl, items, lang, limit) {
    var copy = COPY[lang] || COPY.sv;
    var rows = limit ? items.slice(0, limit) : items;
    if (!rows.length) {
      listEl.innerHTML = '<p class="amla-news-empty">' + escapeHtml(copy.empty) + '</p>';
      return;
    }
    listEl.innerHTML = rows.map(function (item) {
      return (
        '<article class="amla-news-item">' +
          '<time class="amla-news-date" datetime="' + escapeHtml(item.publishedAt || '') + '">' +
            escapeHtml(formatDate(item.publishedAt, lang)) +
          '</time>' +
          '<h3 class="amla-news-title">' +
            '<a href="' + escapeHtml(item.link) + '" target="_blank" rel="noopener noreferrer">' +
              escapeHtml(item.title) +
            '</a>' +
          '</h3>' +
          '<p class="amla-news-summary">' + escapeHtml(item.summary || item.summaryEn || '') + '</p>' +
          '<a class="amla-news-open" href="' + escapeHtml(item.link) + '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(copy.open) + ' <i class="fas fa-external-link-alt"></i>' +
          '</a>' +
        '</article>'
      );
    }).join('');
  }

  async function fetchNews(lang) {
    var res = await fetch(getBaseUrl() + '/api/amla-news?lang=' + encodeURIComponent(lang), getAuthOpts());
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'fetch failed');
    return data;
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
      var data = await fetchNews(lang);
      if (status) {
        status.textContent = copy.source + (data.shown != null ? ' · ' + data.shown + (lang === 'en' ? ' articles' : ' artiklar') : '');
      }
      if (list) renderItems(list, data.items || [], lang, opts.limit || 0);
    } catch (err) {
      console.error('AMLA-nyheter:', err);
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
  }

  function initPage() {
    var root = document.getElementById('amla-news-page');
    if (!root) return;
    bindControls(root, {});
    var start = function () { loadInto(root, {}); };
    if (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) start();
    window.addEventListener('clientflow:authReady', start);
  }

  function initDashboard() {
    var root = document.getElementById('dashboard-amla-news');
    if (!root) return;
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
