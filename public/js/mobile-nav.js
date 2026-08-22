/**
 * Mobilmeny: sidomenyn blir en drawer under 768px.
 * Desktop-läget (inkl. ihopfälld sidebar) lämnas orört.
 */
(function (global) {
  var MQ = '(max-width: 768px)';

  function mediaQueryList(matchMediaFn) {
    var mm = matchMediaFn || (typeof global.matchMedia === 'function' ? global.matchMedia.bind(global) : null);
    if (!mm) return { matches: false, addEventListener: null, addListener: null };
    return mm(MQ);
  }

  function isMobile(matchMediaFn) {
    return !!mediaQueryList(matchMediaFn).matches;
  }

  function applyCollapsedState(body, saved, mobile) {
    if (!body || !body.classList) return false;
    if (mobile) {
      body.classList.remove('sidebar-collapsed');
      return false;
    }
    if (saved === '1') {
      body.classList.add('sidebar-collapsed');
      return true;
    }
    body.classList.remove('sidebar-collapsed');
    return false;
  }

  function setOpen(sidebar, body, toggle, open) {
    var next = !!open;
    if (sidebar && sidebar.classList) sidebar.classList.toggle('open', next);
    if (body && body.classList) body.classList.toggle('mobile-nav-open', next);
    if (toggle) {
      toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
      toggle.setAttribute('aria-label', next ? 'Stäng meny' : 'Öppna meny');
      var icon = toggle.querySelector('i');
      if (icon && icon.classList) {
        icon.classList.toggle('fa-bars', !next);
        icon.classList.toggle('fa-times', next);
      }
    }
    var overlay = body && body.querySelector ? body.querySelector('#mobile-nav-overlay') : null;
    if (overlay) {
      if (next) overlay.removeAttribute('hidden');
      else overlay.setAttribute('hidden', '');
    }
    return next;
  }

  function onMqChange(mql, handler) {
    if (!mql || typeof handler !== 'function') return function () {};
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return function () { mql.removeEventListener('change', handler); };
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(handler);
      return function () { mql.removeListener(handler); };
    }
    return function () {};
  }

  function init(options) {
    var opts = options || {};
    var sidebar = opts.sidebar;
    var toggle = opts.toggle;
    var overlay = opts.overlay;
    var body = opts.body || (typeof document !== 'undefined' ? document.body : null);
    var matchMediaFn = opts.matchMedia;
    if (!sidebar || !body) return { open: function () {}, close: function () {}, destroy: function () {} };

    var saved = '0';
    try {
      if (opts.sessionStorage) saved = opts.sessionStorage.getItem('clientflow-sidebar-collapsed') || '0';
      else if (typeof sessionStorage !== 'undefined') saved = sessionStorage.getItem('clientflow-sidebar-collapsed') || '0';
    } catch (e) { saved = '0'; }

    applyCollapsedState(body, saved, isMobile(matchMediaFn));

    function close() { setOpen(sidebar, body, toggle, false); }
    function open() { setOpen(sidebar, body, toggle, true); }
    function toggleOpen() {
      var next = !(sidebar.classList && sidebar.classList.contains('open'));
      setOpen(sidebar, body, toggle, next);
    }

    if (toggle && !toggle.getAttribute('data-mobile-nav-bound')) {
      toggle.setAttribute('data-mobile-nav-bound', '1');
      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        toggleOpen();
      });
    }
    if (overlay && !overlay.getAttribute('data-mobile-nav-bound')) {
      overlay.setAttribute('data-mobile-nav-bound', '1');
      overlay.addEventListener('click', close);
    }
    sidebar.querySelectorAll('a[href]').forEach(function (link) {
      if (link.getAttribute('data-mobile-nav-bound')) return;
      link.setAttribute('data-mobile-nav-bound', '1');
      link.addEventListener('click', close);
    });

    function onKey(e) {
      if (e && e.key === 'Escape') close();
    }
    if (typeof document !== 'undefined' && !body.getAttribute('data-mobile-nav-esc')) {
      body.setAttribute('data-mobile-nav-esc', '1');
      document.addEventListener('keydown', onKey);
    }

    var mql = mediaQueryList(matchMediaFn);
    var unlisten = onMqChange(mql, function (ev) {
      var mobile = !!(ev && Object.prototype.hasOwnProperty.call(ev, 'matches') ? ev.matches : isMobile(matchMediaFn));
      applyCollapsedState(body, saved, mobile);
      if (!mobile) close();
    });

    return {
      open: open,
      close: close,
      destroy: unlisten
    };
  }

  var api = {
    MQ: MQ,
    isMobile: isMobile,
    applyCollapsedState: applyCollapsedState,
    setOpen: setOpen,
    onMqChange: onMqChange,
    init: init
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.ClientFlowMobileNav = api;
})(typeof window !== 'undefined' ? window : global);
