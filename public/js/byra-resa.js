/**
 * Byråns AML-profil – koordinator + källkatalog (metodnivå).
 * Källor: kompakt radlayout, ingen förvald status, notering bara vid Inte relevant.
 * Egna källor kan läggas till och tas bort.
 */
(function () {
  if (!document.getElementById('byra-resa-steps')) return;

  var state = { version: 1, steps: {}, kalla: {}, customKallor: [], nraChecklist: {} };
  var nraScenarios = [];
  var nraRequired = false;
  var catalog = [];
  var steps = [];
  var saveTimer = null;
  var canEdit = true;
  var attentionStepIds = [];
  var stepStatusById = {};

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

  function syncAddFormVisibility() {
    var wrap = document.getElementById('byra-resa-kalla-add');
    if (wrap) wrap.hidden = !canEdit;
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
      if (!state.kalla) state.kalla = {};
      if (!Array.isArray(state.customKallor)) state.customKallor = [];
      if (Array.isArray(data.catalog)) catalog = data.catalog;
      setStatus('Sparat');
      if (typeof data.nraChecklistRequired === 'boolean') nraRequired = data.nraChecklistRequired;
      if (Array.isArray(data.nraScenarios) && data.nraScenarios.length) nraScenarios = data.nraScenarios;
      ingestNraChecklist(data.nraChecklist);
      renderKalla();
      renderNraChecklist();
      renderSteps();
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

  function makeCustomId(label) {
    var base = String(label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'kalla';
    var id = 'custom-' + base;
    var taken = {};
    catalog.forEach(function (row) { taken[row.id] = true; });
    (state.customKallor || []).forEach(function (row) { taken[row.id] = true; });
    if (!taken[id]) return id;
    var n = 2;
    while (taken[id + '-' + n]) n += 1;
    return id + '-' + n;
  }

  function normalizeUrl(raw) {
    var url = String(raw || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  function addCustomKalla() {
    if (!canEdit) return;
    var labelEl = document.getElementById('byra-resa-kalla-new-label');
    var urlEl = document.getElementById('byra-resa-kalla-new-url');
    var label = (labelEl && labelEl.value || '').trim();
    if (!label) {
      setStatus('Ange ett namn på källan.', true);
      if (labelEl) labelEl.focus();
      return;
    }
    var url = normalizeUrl(urlEl && urlEl.value);
    var id = makeCustomId(label);
    if (!Array.isArray(state.customKallor)) state.customKallor = [];
    state.customKallor.push({ id: id, label: label, url: url, custom: true });
    if (!state.kalla[id]) state.kalla[id] = { status: 'unset', note: '' };
    catalog.push({
      id: id,
      label: label,
      url: url,
      custom: true,
      status: 'unset',
      note: ''
    });
    if (labelEl) labelEl.value = '';
    if (urlEl) urlEl.value = '';
    renderKalla();
    renderSteps();
    scheduleSave();
  }

  function removeCustomKalla(id) {
    if (!canEdit || !id) return;
    state.customKallor = (state.customKallor || []).filter(function (row) { return row.id !== id; });
    if (state.kalla) delete state.kalla[id];
    catalog = catalog.filter(function (row) { return row.id !== id; });
    renderKalla();
    renderSteps();
    scheduleSave();
  }


  function ingestNraChecklist(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    state.nraChecklist = state.nraChecklist || {};
    rows.forEach(function (row) {
      if (!row || !row.id) return;
      var prev = state.nraChecklist[row.id] || {};
      state.nraChecklist[row.id] = {
        id: row.id,
        kind: row.kind || prev.kind || 'yesno',
        title: row.title || prev.title || '',
        tag: row.tag != null ? row.tag : (prev.tag || ''),
        desc: row.desc || prev.desc || '',
        answer: row.answer || prev.answer || 'unset',
        why: row.why != null ? row.why : (prev.why || ''),
        derived: row.derived || prev.derived || null
      };
    });
  }

  function seedNraFromScenarios() {
    if (!nraScenarios.length) return;
    state.nraChecklist = state.nraChecklist || {};
    nraScenarios.forEach(function (scenario) {
      if (!scenario || !scenario.id) return;
      var prev = state.nraChecklist[scenario.id] || {};
      state.nraChecklist[scenario.id] = {
        id: scenario.id,
        kind: scenario.kind || prev.kind || 'yesno',
        title: scenario.title || prev.title || '',
        tag: scenario.tag != null ? scenario.tag : (prev.tag || ''),
        desc: scenario.desc || prev.desc || '',
        answer: prev.answer || (scenario.kind === 'derived' ? 'derived' : 'unset'),
        why: prev.why || '',
        derived: prev.derived || (scenario.kind === 'derived'
          ? {
              active: false,
              answer: 'nej',
              label: 'Nej — ingen aktiv tjänst av den typen i tjänstelistan.',
              serviceName: '',
              mallId: '',
              href: 'riskbedomning-byra.html'
            }
          : null)
      };
    });
  }

  function nraRows() {
    seedNraFromScenarios();
    var map = state.nraChecklist || {};
    if (nraScenarios.length) {
      return nraScenarios.map(function (scenario) {
        return Object.assign({}, scenario, map[scenario.id] || { id: scenario.id });
      });
    }
    return Object.keys(map).map(function (id) {
      return Object.assign({ id: id }, map[id]);
    });
  }

  function nraRowIsComplete(row) {
    if (!row) return false;
    var kind = row.kind || 'yesno';
    if (kind === 'derived') return true;
    if (kind === 'controls') return String(row.why || '').trim().length >= 12;
    if (!row.answer || row.answer === 'unset') return false;
    if (row.answer === 'nej' && String(row.why || '').trim().length < 3) return false;
    return row.answer === 'ja' || row.answer === 'nej';
  }

  function nraCompleteLocal() {
    if (!nraRequired) return true;
    var rows = nraRows();
    if (!rows.length) return false;
    return rows.every(nraRowIsComplete);
  }

  function step8ReadyLocal() {
    return kallaComplete() && nraCompleteLocal();
  }

  function updateNraProgress() {
    var section = document.getElementById('byra-resa-nra-section');
    var progress = document.getElementById('byra-resa-nra-progress');
    var hint = document.getElementById('byra-resa-nra-hint');
    if (!section) return;
    section.hidden = !nraRequired;
    if (!nraRequired) return;
    var rows = nraRows();
    var done = rows.filter(nraRowIsComplete).length;
    if (progress) progress.textContent = done + ' av ' + rows.length + ' scenarier klara';
    if (!hint) return;
    if (nraCompleteLocal()) {
      hint.textContent = 'NRA-checklistan är komplett (ja/nej, kontrollbeskrivningar och härledda fakta).';
      hint.className = 'byra-resa-nra-hint is-ok';
    } else {
      hint.textContent = 'Fyll ja/nej där det krävs, skriv kontrollbeskrivning för inneboende risker, och kontrollera den härledda tjänstefaktan.';
      hint.className = 'byra-resa-nra-hint is-warn';
    }
  }

  function nraChip(id, value, label, cur) {
    var checked = cur === value ? ' checked' : '';
    var disabled = canEdit ? '' : ' disabled';
    var on = cur === value ? ' is-on' : '';
    return (
      '<label class="byra-resa-nra-state' + on + '" data-value="' + value + '">' +
        '<input type="radio" name="nra-' + esc(id) + '" value="' + value + '" data-nra-id="' + esc(id) + '"' + checked + disabled + '>' +
        '<span>' + esc(label) + '</span>' +
      '</label>'
    );
  }

  function renderNraDerived(row) {
    var d = row.derived || {};
    var label = d.label || (d.active
      ? ('Härlett från aktiv tjänst: ' + (d.serviceName || ''))
      : 'Ingen aktiv tjänst av den typen i tjänstelistan.');
    var link = d.active && d.href
      ? '<a class="byra-resa-nra-derived-link" href="' + esc(d.href) + '">Öppna tjänsten</a>'
      : '<a class="byra-resa-nra-derived-link" href="riskbedomning-byra.html">Öppna tjänstelistan</a>';
    return (
      '<div class="byra-resa-nra-derived" role="status">' +
        '<span class="byra-resa-nra-derived-badge" data-active="' + (d.active ? 'ja' : 'nej') + '">' + (d.active ? 'Ja' : 'Nej') + '</span>' +
        '<span class="byra-resa-nra-derived-text">' + esc(label) + '</span>' +
        link +
      '</div>'
    );
  }

  function renderNraControls(row) {
    var disabled = canEdit ? '' : ' disabled';
    var ctrlId = 'nra-ctrl-' + esc(row.id);
    return (
      '<div class="byra-resa-nra-controls-wrap">' +
        '<textarea id="' + ctrlId + '" class="form-input byra-resa-nra-controls" data-nra-id="' + esc(row.id) + '" rows="4" aria-label="Kontrollbeskrivning för ' + esc(row.title || row.id) + '" placeholder="Beskriv kort vilka kontroller ni har…"' + disabled + '>' +
          esc(row.why || '') +
        '</textarea>' +
        '<p class="byra-resa-nra-controls-hint">Ingen ja/nej — skriv en kort kontrollbeskrivning.</p>' +
      '</div>'
    );
  }

  function renderNraYesNo(row) {
    var cur = row.answer || 'unset';
    var showWhy = cur === 'nej';
    return (
      '<div class="byra-resa-nra-answer-row">' +
        '<div class="byra-resa-nra-states" role="group" aria-label="' + esc(row.title || row.id) + '">' +
          nraChip(row.id, 'ja', 'Ja', cur) +
          nraChip(row.id, 'nej', 'Nej', cur) +
        '</div>' +
      '</div>' +
      (showWhy
        ? '<div class="byra-resa-nra-why-wrap">' +
            '<input type="text" class="form-input byra-resa-nra-why" data-nra-id="' + esc(row.id) + '" value="' + esc(row.why || '') + '" placeholder="Kort varför scenariot inte är relevant för er" ' + (canEdit ? '' : 'disabled') + '>' +
          '</div>'
        : '')
    );
  }

  function nraKindMeta(kind) {
    if (kind === 'derived') return { short: 'Härlett', full: 'Härlett från tjänstelistan' };
    if (kind === 'controls') return { short: 'Kontroller', full: 'Inneboende risk — beskriv kontroller' };
    return { short: 'Ja/nej', full: 'Ja/nej-bedömning' };
  }

  function renderNraChecklist() {
    var root = document.getElementById('byra-resa-nra-list');
    if (!root) return;
    updateNraProgress();
    if (!nraRequired) {
      root.innerHTML = '';
      return;
    }
    var rows = nraRows();
    root.innerHTML = rows.map(function (row) {
      var kind = row.kind || 'yesno';
      var tag = String(row.tag || '').trim();
      var body = kind === 'derived'
        ? renderNraDerived(row)
        : (kind === 'controls' ? renderNraControls(row) : renderNraYesNo(row));
      var meta = nraKindMeta(kind);
      return (
        '<article class="byra-resa-nra-row is-' + kind + (nraRowIsComplete(row) ? ' is-complete' : '') + '" data-nra-id="' + esc(row.id) + '" data-nra-kind="' + esc(kind) + '">' +
          '<div class="byra-resa-nra-row-head">' +
            '<div class="byra-resa-nra-title-block">' +
              '<p class="byra-resa-nra-title">' + esc(row.title || row.id) + '</p>' +
              (tag ? '<span class="byra-resa-nra-tag">' + esc(tag) + '</span>' : '') +
            '</div>' +
            '<span class="byra-resa-nra-kind" title="' + esc(meta.full) + '">' + esc(meta.short) + '</span>' +
          '</div>' +
          '<p class="byra-resa-nra-desc">' + esc(row.desc || '') + '</p>' +
          body +
        '</article>'
      );
    }).join('');

    root.querySelectorAll('input[type="radio"][data-nra-id]').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = input.getAttribute('data-nra-id');
        if (!state.nraChecklist) state.nraChecklist = {};
        if (!state.nraChecklist[id]) state.nraChecklist[id] = { id: id, kind: 'yesno', answer: 'unset', why: '' };
        state.nraChecklist[id].answer = input.value;
        if (input.value !== 'nej') state.nraChecklist[id].why = '';
        renderNraChecklist();
        renderSteps();
        save();
      });
    });
    root.querySelectorAll('.byra-resa-nra-why').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = input.getAttribute('data-nra-id');
        if (!state.nraChecklist) state.nraChecklist = {};
        if (!state.nraChecklist[id]) state.nraChecklist[id] = { id: id, kind: 'yesno', answer: 'nej', why: '' };
        state.nraChecklist[id].why = input.value;
        updateNraProgress();
        renderSteps();
        save();
      });
    });
    root.querySelectorAll('.byra-resa-nra-controls').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = input.getAttribute('data-nra-id');
        if (!state.nraChecklist) state.nraChecklist = {};
        if (!state.nraChecklist[id]) state.nraChecklist[id] = { id: id, kind: 'controls', answer: 'unset', why: '' };
        var text = String(input.value || '').trim();
        state.nraChecklist[id].why = text;
        state.nraChecklist[id].answer = text.length >= 12 ? 'beskriven' : 'unset';
        updateNraProgress();
        renderSteps();
        save();
      });
    });
  }

  function renderKalla() {
    var root = document.getElementById('byra-resa-kalla-list');
    if (!root) return;
    root.innerHTML = catalog.map(function (row) {
      var cur = rowStatus(row.id);
      var note = (state.kalla[row.id] && state.kalla[row.id].note) || '';
      var showNote = cur === 'inte_relevant';
      var isCustom = !!(row.custom || (row.id && String(row.id).indexOf('custom-') === 0));
      return (
        '<article class="byra-resa-kalla-row" data-kalla-id="' + esc(row.id) + '">' +
          '<div class="byra-resa-kalla-row-main">' +
            '<div class="byra-resa-kalla-name">' +
              '<span class="byra-resa-kalla-name-text">' + esc(row.label) +
                (isCustom ? ' <span class="byra-resa-kalla-badge">Egen</span>' : '') +
              '</span>' +
              (row.url
                ? '<a class="byra-resa-kalla-link-icon" href="' + esc(row.url) + '" target="_blank" rel="noopener noreferrer" title="Öppna källa" aria-label="Öppna källa"><i class="fas fa-external-link-alt"></i></a>'
                : '') +
            '</div>' +
            '<div class="byra-resa-kalla-row-right">' +
              '<div class="byra-resa-kalla-states" role="group" aria-label="Status för ' + esc(row.label) + '">' +
                chip(row.id, 'tagit_del', 'Tagit del', cur) +
                chip(row.id, 'anvander', 'Använder', cur) +
                chip(row.id, 'inte_relevant', 'Inte relevant', cur) +
              '</div>' +
              (isCustom && canEdit
                ? '<button type="button" class="byra-resa-kalla-remove" data-remove-kalla="' + esc(row.id) + '" title="Ta bort egen källa" aria-label="Ta bort egen källa">Ta bort</button>'
                : '') +
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
        if (id === 'nra-2024-2025') nraRequired = input.value === 'anvander';
        renderKalla();
        renderNraChecklist();
        renderSteps();
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
    root.querySelectorAll('[data-remove-kalla]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        removeCustomKalla(btn.getAttribute('data-remove-kalla'));
      });
    });
    updateKallaProgress();
  }


  function pageIdFromHref(href) {
    return String(href || '').replace(/\.html$/i, '').replace(/^\//, '');
  }

  function syncAttentionFromNav(detail) {
    var pages = (detail && detail.pages) || {};
    var map = {};
    steps.forEach(function (step) {
      map[pageIdFromHref(step.href)] = step.id;
    });
    var ids = [];
    Object.keys(pages).forEach(function (pageId) {
      var page = pages[pageId];
      if (page && page.status === 'attention') {
        var sid = page.stepId || map[pageId];
        if (sid) ids.push(Number(sid));
      }
    });
    attentionStepIds = ids;
  }

  function resolveStatusesLocal() {
    var attention = {};
    attentionStepIds.forEach(function (id) { attention[id] = true; });
    var nextAssigned = false;
    var out = {};
    steps.forEach(function (step) {
      var id = step.id;
      var done = !!(state.steps && state.steps[id]);
      var status;
      if (attention[id]) status = 'attention';
      else if (done) status = 'done';
      else if (!nextAssigned) { status = 'next'; nextAssigned = true; }
      else status = 'pending';
      var labels = {
        done: 'Klart',
        next: 'Nästa steg',
        attention: 'Kräver uppmärksamhet',
        pending: 'Ej påbörjat'
      };
      out[id] = { status: status, label: labels[status] };
    });
    stepStatusById = out;
    return out;
  }

  function statusMeta(status) {
    if (status === 'done') {
      return { cls: 'is-done', trail: 'fa-check', aria: 'Klart' };
    }
    if (status === 'next') {
      return { cls: 'is-next', trail: 'fa-dot-circle', aria: 'Nästa steg' };
    }
    if (status === 'attention') {
      return { cls: 'is-attention', trail: 'fa-exclamation-triangle', aria: 'Kräver uppmärksamhet' };
    }
    return { cls: 'is-pending', trail: 'fa-circle', aria: 'Ej påbörjat' };
  }

  function renderSteps() {
    var root = document.getElementById('byra-resa-steps');
    if (!root) return;
    var statuses = resolveStatusesLocal();
    root.innerHTML = steps.map(function (step) {
      var done = !!(state.steps && state.steps[step.id]);
      var gate = step.id === 8 && !step8ReadyLocal();
      var st = statuses[step.id] || { status: 'pending', label: 'Ej påbörjat' };
      var meta = statusMeta(st.status);
      var icon = step.icon || 'fa-circle';
      return (
        '<article class="byra-resa-step-card ' + meta.cls + (gate ? ' is-gated' : '') + '" data-step="' + step.id + '" data-status="' + st.status + '">' +
          '<div class="byra-resa-step-card-top">' +
            '<div class="byra-resa-step-card-heading">' +
              '<span class="byra-resa-step-icon" aria-hidden="true"><i class="fas ' + esc(icon) + '"></i></span>' +
              '<span class="byra-resa-step-status-label">' + step.id + ' · ' + esc(st.label) + '</span>' +
            '</div>' +
            '<span class="byra-resa-step-trail" aria-hidden="true"><i class="fas ' + meta.trail + '"></i></span>' +
          '</div>' +
          '<h3 class="byra-resa-step-title">' + esc(step.title) + '</h3>' +
          '<p class="byra-resa-step-desc">' + esc(step.desc) + '</p>' +
          '<a class="byra-resa-step-link" href="' + esc(step.href) + '">' + esc(step.linkLabel) + '</a>' +
          (gate ? '<p class="byra-resa-step-gate">' + (nraRequired && !nraCompleteLocal() ? 'Fyll i NRA-checklistan och källkatalogen innan slutgodkännande.' : 'Fyll i källkatalogen innan slutgodkännande.') + '</p>' : '') +
          '<label class="byra-resa-step-check">' +
            '<input type="checkbox" data-step-id="' + step.id + '"' + (done ? ' checked' : '') + (canEdit ? '' : ' disabled') + '>' +
            '<span>Steget klart</span>' +
          '</label>' +
        '</article>'
      );
    }).join('');

    root.querySelectorAll('input[data-step-id]').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = Number(input.getAttribute('data-step-id'));
        if (!state.steps) state.steps = {};
        if (id === 8 && input.checked && !step8ReadyLocal()) {
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

  function bindAddForm() {
    var btn = document.getElementById('byra-resa-kalla-add-btn');
    if (btn) btn.addEventListener('click', addCustomKalla);
    ['byra-resa-kalla-new-label', 'byra-resa-kalla-new-url'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addCustomKalla();
        }
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
      if (!Array.isArray(state.customKallor)) state.customKallor = [];
      catalog = data.catalog || [];
      steps = data.steps || [];
      canEdit = data.canEdit !== false;
      if (window.__clientflowNavStatus) syncAttentionFromNav(window.__clientflowNavStatus);
      syncAddFormVisibility();
      nraRequired = !!data.nraChecklistRequired || ((state.kalla['nra-2024-2025'] || {}).status === 'anvander');
      if (Array.isArray(data.nraScenarios) && data.nraScenarios.length) nraScenarios = data.nraScenarios;
      state.nraChecklist = {};
      ingestNraChecklist(data.nraChecklist);
      seedNraFromScenarios();
      renderKalla();
      renderNraChecklist();
      renderSteps();
      setStatus('');
    } catch (e) {
      setStatus(e.message || 'Kunde inte ladda resan', true);
    }
  }

  bindAddForm();
  window.addEventListener('clientflow:nav-status', function (ev) {
    syncAttentionFromNav(ev.detail || {});
    renderSteps();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
