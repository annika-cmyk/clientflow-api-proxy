/**
 * Mejl hanteringsstatus (hanterat / att hantera) – localStorage per användare + messageId.
 */
(function (global) {
  const HANDLED = 'handled';
  const TODO = 'todo';
  const NONE = '';

  function normalizeStatus(value) {
    const v = String(value || '')
      .trim()
      .toLowerCase();
    if (v === HANDLED || v === 'hanterat') return HANDLED;
    if (v === TODO || v === 'att-hantera' || v === 'att_hantera' || v === 'att hantera') {
      return TODO;
    }
    return NONE;
  }

  function toggleStatus(current, next) {
    const cur = normalizeStatus(current);
    const n = normalizeStatus(next);
    if (!n) return NONE;
    return cur === n ? NONE : n;
  }

  function listItemClass(status) {
    const s = normalizeStatus(status);
    if (s === HANDLED) return 'is-handled';
    if (s === TODO) return 'is-todo';
    return '';
  }

  function storageBucketKey(userKey) {
    const key = String(userKey || 'anon')
      .trim()
      .toLowerCase();
    return 'cf-mejl-handle-status:' + (key || 'anon');
  }

  function resolveUserKey() {
    try {
      const u =
        (global.AuthManager &&
          AuthManager.getCurrentUser &&
          AuthManager.getCurrentUser()) ||
        global.__clientFlowUser ||
        null;
      if (u && (u.email || u.id || u.name)) {
        return String(u.email || u.id || u.name);
      }
    } catch (_) {}
    return 'anon';
  }

  function readMap() {
    try {
      const raw = global.localStorage && localStorage.getItem(storageBucketKey(resolveUserKey()));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeMap(map) {
    try {
      if (!global.localStorage) return;
      localStorage.setItem(storageBucketKey(resolveUserKey()), JSON.stringify(map || {}));
    } catch (_) {}
  }

  function get(messageId) {
    const id = String(messageId || '').trim();
    if (!id) return NONE;
    const map = readMap();
    return normalizeStatus(map[id]);
  }

  function set(messageId, status) {
    const id = String(messageId || '').trim();
    if (!id) return NONE;
    const next = normalizeStatus(status);
    const map = readMap();
    if (!next) delete map[id];
    else map[id] = next;
    writeMap(map);
    return next;
  }

  function toggle(messageId, nextStatus) {
    const id = String(messageId || '').trim();
    if (!id) return NONE;
    const next = toggleStatus(get(id), nextStatus);
    return set(id, next);
  }

  function toolbarHtml(status) {
    const s = normalizeStatus(status);
    const handledActive = s === HANDLED ? ' is-active is-handled-active' : '';
    const todoActive = s === TODO ? ' is-active is-todo-active' : '';
    return (
      '<div class="mejl-handle-status-bar" role="group" aria-label="Hanteringsstatus">' +
      '<button type="button" class="btn btn-secondary btn-sm mejl-handle-status-btn' +
      handledActive +
      '" id="mejl-handled-btn" data-handle-status="handled" aria-pressed="' +
      (s === HANDLED ? 'true' : 'false') +
      '">' +
      '<i class="fas fa-check"></i> Hanterat</button>' +
      '<button type="button" class="btn btn-secondary btn-sm mejl-handle-status-btn' +
      todoActive +
      '" id="mejl-todo-btn" data-handle-status="todo" aria-pressed="' +
      (s === TODO ? 'true' : 'false') +
      '">' +
      '<i class="fas fa-exclamation-circle"></i> Att hantera</button>' +
      '</div>'
    );
  }

  function bindDetailButtons(opts) {
    const id = opts && opts.id;
    const onChange = opts && opts.onChange;
    const bar = document.querySelector('.mejl-handle-status-bar');
    if (!bar || !id) return;
    bar.querySelectorAll('[data-handle-status]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = btn.getAttribute('data-handle-status');
        const status = toggle(id, next);
        if (typeof onChange === 'function') onChange(status);
      });
    });
  }

  function createApi() {
    return {
      HANDLED,
      TODO,
      NONE,
      get,
      set,
      toggle,
      listItemClass,
      toolbarHtml,
      bindDetailButtons,
      normalizeStatus
    };
  }

  global.MejlHandleStatus = {
    createApi,
    HANDLED,
    TODO,
    NONE,
    normalizeStatus,
    toggleStatus,
    listItemClass,
    storageBucketKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
