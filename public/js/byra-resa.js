/**
 * Byråns resa – koordinator + källkatalog (metodnivå).
 * Källor: kompakt radlayout, ingen förvald status, notering bara vid Inte relevant.
 */
(function () {
  if (!document.getElementById('byra-resa-steps')) return;

  var state = { version: 1, steps: {}, kalla: {} };
  var catalog = [];
  var steps = [];
  var saveTimer = null;
  var canEdit = true;

  function authOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
  }
  function baseUrl() {
    return (window.apiConfig && window.apiConfig.baseUrl) || '';
  }
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function setStatus(msg, isError) {
    var el = document.getElementById('byra-resa-save-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#b91c1c' : '';
  }

  function rowStatus(id) {
    return (state.kalla[id] && state.kalla[id].status) || 'unset';
  }

  function kallaReviewedCount() {
    var n = 0;
    catalog.forEach(function (row) {
      if (rowStatus(row.id) !== 'unset') n += 1;
    });
    return n;
  }

  function kallaComplete() {
    return catalog.length > 0 && kallaReviewedCount() === catalog.length;
  }

  function updateKallaProgress() {
    var el = document.getElementById('byra-resa-kalla-progress');
    if (el) {
      el.textContent = kallaReviewedCount() + ' av ' + catalog.length + ' källor granskade';
    }
    var hint = document.getElementById('byra-resa-kalla-hint');
    if (!hint) return;
    if (kallaComplete()) {
      hint.textContent = 'Källkatalogen är ifylld. AI-förslag på hot begränsas till källor ni markerat som Använder.';
      hint.className = 'byra-resa-kalla-hint is-ok';
    } else {
      hint.textContent = 'Gör ett aktivt val per källa. Ingen är förkryssad – det är meningen.';
      hint.className = 'byra-resa-kalla-hint';
    }
  }

  function scheduleSave() {
    if (!canEdit) return;
    clearTimeout(saveTimer);
    setStatus('Sparar…');
    saveTimer = setTimeout(save, 450);
  }

  async function save() {
    try {
      var opts = authOpts();
      opts.method = 'PUT';
      opts.headers = Object.assign({}, opts.headers || {}, { 'Content-Type': 'application/json' });
      opts.body = JSON.stringify({ state: state });
      var res = await fetch(baseUrl() + '/api/byra-resa', opts);
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      if (data.state) state = data.state;
      setStatus('Sparat');
      updateKallaProgress();
    } catch (e) {
      setStatus(e.message || 'Kunde inte spara', true);
    }
  }

  function chip(id, value, label, cur) {
    var checked = cur === value ? ' checked' : '';
    var disabled = canEdit ? '' : ' disabled';
    return (
      '<label class="byra-resa-kalla-state" data-value="' + value + '">' +
        '<input type="radio" name="kalla-' + esc(id) + '" value="' + value + '" data-kalla-id="' + esc(id) + '"' + checked + disabled + '>' +
        '<span>' + esc(label) + '</span>' +
      '</label>'
    );
  }

  function renderKalla() {
    var root = document.getElementById('byra-resa-kalla-list');
    if (!root) return;
    root.innerHTML = catalog.map(function (row) {
      var cur = rowStatus(row.id);
      var note = (state.kalla[row.id] && state.kalla[row.id].note) || '';
      var showNote = cur === 'inte_relevant';
      return (
        '<article class="byra-resa-kalla-row" data-kalla-id="' + esc(row.id) + '">' +
          '<div class="byra-resa-kalla-row-main">' +
            '<div class="byra-resa-kalla-name">' +
              '<span class="byra-resa-kalla-name-text">' + esc(row.label) + '</span>' +
              (row.url
                ? '<a class="byra-resa-kalla-link-icon" href="' + esc(row.url) + '" target="_blank" rel="noopener noreferrer" title="Öppna källa" aria-label="Öppna källa"><i class="fas fa-external-link-alt"></i></a>'
                : '') +
            '</div>' +
            '<div class="byra-resa-kalla-states" role="group" aria-label="Status för ' + esc(row.label) + '">' +
              chip(row.id, 'tagit_del', 'Tagit del', cur) +
              chip(row.id, 'anvander', 'Använder', cur) +
              chip(row.id, 'inte_relevant', 'Inte relevant', cur) +
            '</div>' +
          '</div>' +
          (showNote
            ? '<div class="byra-resa-kalla-note-wrap">' +
                '<input type="text" class="form-input byra-resa-kalla-note" data-kalla-id="' + esc(row.id) + '" value="' + esc(note) + '" placeholder="Kort motivering till varför den inte används" ' + (canEdit ? '' : 'disabled') + '>' +
              '</div>'
            : '') +
        '</article>'
      );
    }).join('');

    root.querySelectorAll('input[type="radio"]').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = input.getAttribute('data-kalla-id');
        if (!id) return;
        if (!state.kalla[id]) state.kalla[id] = { status: 'unset', note: '' };
        state.kalla[id].status = input.value;
        if (input.value !== 'inte_relevant') state.kalla[id].note = '';
        renderKalla();
        renderSteps();
        scheduleSave();
      });
    });
    root.querySelectorAll('.byra-resa-kalla-note').forEach(function (input) {
      input.addEventListener('input', function () {
        var id = input.getAttribute('data-kalla-id');
        if (!id) return;
        if (!state.kalla[id]) state.kalla[id] = { status: 'inte_relevant', note: '' };
        state.kalla[id].note = input.value;
        scheduleSave();
      });
    });
    updateKallaProgress();
  }

  function renderSteps() {
    var root = document.getElementById('byra-resa-steps');
    if (!root) return;
    root.innerHTML = steps.map(function (step) {
      var done = !!(state.steps && state.steps[step.id]);
      var gate = step.id === 8 && !kallaComplete();
      return (
        '<article class="byra-resa-step-card' + (done ? ' is-done' : '') + (gate ? ' is-gated' : '') + '" data-step="' + step.id + '">' +
          '<div class="byra-resa-step-num">' + step.id + '</div>' +
          '<div class="byra-resa-step-body">' +
            '<h3>' + esc(step.title) + '</h3>' +
            '<p>' + esc(step.desc) + '</p>' +
            '<a class="byra-resa-step-link" href="' + esc(step.href) + '">' + esc(step.linkLabel) + ' <i class="fas fa-chevron-right"></i></a>' +
            (gate ? '<p class="byra-resa-step-gate">Fyll i källkatalogen innan slutgodkännande.</p>' : '') +
            '<label class="byra-resa-step-check">' +
              '<input type="checkbox" data-step-id="' + step.id + '"' + (done ? ' checked' : '') + (canEdit ? '' : ' disabled') + '>' +
              '<span>Steget klart</span>' +
            '</label>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    root.querySelectorAll('input[data-step-id]').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = Number(input.getAttribute('data-step-id'));
        if (!state.steps) state.steps = {};
        if (id === 8 && input.checked && !kallaComplete()) {
          input.checked = false;
          setStatus('Fyll i alla källor innan ni markerar godkännande som klart.', true);
          return;
        }
        state.steps[id] = !!input.checked;
        renderSteps();
        scheduleSave();
      });
    });
  }

  async function load() {
    setStatus('Laddar…');
    try {
      var res = await fetch(baseUrl() + '/api/byra-resa', authOpts());
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      state = data.state || state;
      if (!state.kalla) state.kalla = {};
      catalog = data.catalog || [];
      steps = data.steps || [];
      canEdit = data.canEdit !== false;
      renderKalla();
      renderSteps();
      setStatus('');
    } catch (e) {
      setStatus(e.message || 'Kunde inte ladda resan', true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
