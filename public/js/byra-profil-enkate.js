/**
 * Steg-för-steg-enkät för byråns verksamhetsprofil (Kom igång steg 1).
 */
(function () {
  'use strict';

  var HOGRISK_NONE = 'Inga högriskbranscher';

  function baseUrl() {
    if (window.apiConfig && window.apiConfig.baseUrl) return window.apiConfig.baseUrl;
    if (window.apiConfig && typeof window.apiConfig.getBaseUrl === 'function') {
      return window.apiConfig.getBaseUrl();
    }
    return '';
  }

  function authOpts(method, body) {
    var opts =
      (window.AuthManager &&
        typeof window.AuthManager.getAuthFetchOptions === 'function' &&
        window.AuthManager.getAuthFetchOptions()) ||
      { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (method) opts.method = method;
    if (body !== undefined) {
      opts.headers = Object.assign({}, opts.headers || {}, { 'Content-Type': 'application/json' });
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return opts;
  }

  var ui = {
    progress: document.getElementById('byra-enkate-progress'),
    stepLabel: document.getElementById('byra-enkate-step-label'),
    sectionTitle: document.getElementById('byra-enkate-section-title'),
    sectionSub: document.getElementById('byra-enkate-section-sub'),
    remaining: document.getElementById('byra-enkate-remaining'),
    fields: document.getElementById('byra-enkate-fields'),
    back: document.getElementById('byra-enkate-back'),
    skip: document.getElementById('byra-enkate-skip'),
    next: document.getElementById('byra-enkate-next'),
    finish: document.getElementById('byra-enkate-finish'),
    status: document.getElementById('byra-enkate-status')
  };

  var schema = { sections: [], fields: [] };
  var values = {};
  var stepIdx = 0;
  var hogriskLabels = [];
  var skipped = {};

  function setStatus(msg, isError) {
    if (!ui.status) return;
    ui.status.textContent = msg || '';
    ui.status.className = 'byra-enkate-status' + (isError ? ' is-error' : msg ? ' is-ok' : '');
  }

  function isAnswered(v) {
    if (v == null) return false;
    if (typeof v === 'number') return Number.isFinite(v);
    return String(v).trim() !== '';
  }

  function fieldByKey(key) {
    return (schema.fields || []).find(function (f) { return f.key === key; });
  }

  function allUnanswered() {
    return (schema.fields || [])
      .filter(function (f) { return !isAnswered(values[f.key]); })
      .map(function (f) { return f.key; });
  }

  function keysForSection(sec) {
    if (Array.isArray(sec.fieldKeys) && sec.fieldKeys.length) return sec.fieldKeys.slice();
    return (schema.fields || [])
      .filter(function (f) { return f.section === sec.id; })
      .map(function (f) { return f.key; });
  }

  function unansweredInSection(sec) {
    return keysForSection(sec).filter(function (k) { return !isAnswered(values[k]); });
  }

  function answeredCount() {
    return (schema.fields || []).filter(function (f) { return isAnswered(values[f.key]); }).length;
  }

  function updateProgress() {
    var total = (schema.fields || []).length || 1;
    var n = answeredCount();
    var pct = Math.round((n / total) * 100);
    if (ui.progress) {
      ui.progress.innerHTML =
        '<div class="byra-enkate-progress-track"><div class="byra-enkate-progress-fill" style="width:' +
        pct + '%"></div></div><p class="byra-enkate-progress-text">' + n + ' av ' + total + ' besvarade</p>';
    }
    if (ui.remaining) {
      var left = total - n;
      ui.remaining.textContent = left === 0 ? 'Komplett' : left + ' kvar';
      ui.remaining.classList.toggle('is-complete', left === 0);
    }
  }

  function updateNav() {
    var last = stepIdx >= schema.sections.length - 1;
    if (ui.back) {
      ui.back.hidden = stepIdx === 0;
      ui.back.disabled = stepIdx === 0;
    }
    if (ui.next) ui.next.hidden = last;
    if (ui.skip) ui.skip.hidden = last;
    if (ui.finish) {
      ui.finish.hidden = !last;
      var missing = allUnanswered();
      ui.finish.disabled = missing.length > 0;
      ui.finish.title = missing.length > 0
        ? 'Besvara alla frågor innan du klarmarkerar (' + missing.length + ' kvar)'
        : 'Markera byråprofilen som klar i Kom igång';
    }
  }

  function selectedBranscher() {
    var raw = values.branscherKundstock;
    if (!raw) return [];
    return String(raw).split(/[,;|]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function renderSelect(field, current) {
    var wrap = document.createElement('div');
    wrap.className = 'byra-enkate-choices';
    (field.choices || []).forEach(function (choice) {
      var label = typeof choice === 'string' ? choice : choice.label;
      var value = typeof choice === 'string' ? choice : choice.value;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'byra-enkate-choice' + (String(current) === String(value) ? ' is-selected' : '');
      btn.textContent = label;
      btn.addEventListener('click', function () {
        values[field.key] = value;
        skipped[field.key] = false;
        wrap.querySelectorAll('.byra-enkate-choice').forEach(function (b) { b.classList.remove('is-selected'); });
        btn.classList.add('is-selected');
        updateProgress();
        updateNav();
        setStatus('');
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function renderInput(field, current) {
    var isArea = field.type === 'multiline';
    var input = document.createElement(isArea ? 'textarea' : 'input');
    if (!isArea) {
      input.type = (field.type === 'number' || field.type === 'percent') ? 'number' : 'text';
      if (field.type === 'number' || field.type === 'percent') {
        input.min = '0';
        input.step = '1';
        if (field.type === 'percent') input.max = '100';
      }
    } else {
      input.rows = 3;
    }
    input.className = 'form-input byra-enkate-input';
    input.id = 'enkate-' + field.key;
    input.value = current == null ? '' : String(current);
    if (field.hint) input.placeholder = field.hint;
    input.addEventListener('input', function () {
      var raw = input.value.trim();
      if (field.type === 'number' || field.type === 'percent') {
        values[field.key] = raw === '' ? '' : Number(raw);
      } else {
        values[field.key] = raw;
      }
      skipped[field.key] = false;
      updateProgress();
      updateNav();
    });
    if (field.type === 'percent') {
      var wrap = document.createElement('div');
      wrap.className = 'input-with-suffix byra-enkate-suffix-wrap';
      wrap.appendChild(input);
      var suf = document.createElement('span');
      suf.className = 'input-suffix';
      suf.textContent = '%';
      wrap.appendChild(suf);
      return wrap;
    }
    return input;
  }

  function renderHogrisk(field) {
    var wrap = document.createElement('div');
    wrap.className = 'byra-enkate-hogrisk';

    var noneLabel = document.createElement('label');
    noneLabel.className = 'byra-enkate-check byra-enkate-check--none';
    var noneCb = document.createElement('input');
    noneCb.type = 'checkbox';
    noneCb.checked = String(values[field.key] || '').trim() === HOGRISK_NONE;
    noneLabel.appendChild(noneCb);
    var noneSpan = document.createElement('span');
    noneSpan.textContent = HOGRISK_NONE;
    noneLabel.appendChild(noneSpan);
    wrap.appendChild(noneLabel);

    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'form-input byra-enkate-input';
    search.placeholder = 'Sök bransch…';
    wrap.appendChild(search);

    var list = document.createElement('div');
    list.className = 'byra-enkate-hogrisk-list';
    wrap.appendChild(list);

    var summary = document.createElement('p');
    summary.className = 'byra-enkate-hint';
    wrap.appendChild(summary);

    function syncSummary() {
      if (noneCb.checked) {
        values[field.key] = HOGRISK_NONE;
        summary.textContent = HOGRISK_NONE + '.';
      } else {
        var sel = selectedBranscher().filter(function (s) { return s !== HOGRISK_NONE; });
        values[field.key] = sel.join(', ');
        summary.textContent = sel.length === 0
          ? 'Välj branscher eller markera att ni saknar högriskbranscher.'
          : sel.length + ' valda: ' + sel.join(', ');
      }
      skipped[field.key] = false;
      updateProgress();
      updateNav();
    }

    function paint(filter) {
      list.innerHTML = '';
      if (noneCb.checked) {
        list.innerHTML = '<p class="byra-enkate-hint">Avmarkera "' + HOGRISK_NONE + '" för att välja branscher.</p>';
        return;
      }
      var q = (filter || '').toLowerCase();
      var items = hogriskLabels.filter(function (label) {
        return !q || String(label).toLowerCase().indexOf(q) >= 0;
      });
      if (!items.length) {
        list.innerHTML = '<p class="byra-enkate-hint">Inga träffar.</p>';
        return;
      }
      items.forEach(function (label) {
        var row = document.createElement('label');
        row.className = 'byra-enkate-check';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedBranscher().indexOf(label) >= 0;
        cb.addEventListener('change', function () {
          var cur = selectedBranscher().filter(function (s) { return s !== HOGRISK_NONE; });
          var idx = cur.indexOf(label);
          if (cb.checked && idx < 0) cur.push(label);
          if (!cb.checked && idx >= 0) cur.splice(idx, 1);
          values.branscherKundstock = cur.join(', ');
          syncSummary();
        });
        var span = document.createElement('span');
        span.textContent = label;
        row.appendChild(cb);
        row.appendChild(span);
        list.appendChild(row);
      });
    }

    noneCb.addEventListener('change', function () {
      if (noneCb.checked) values[field.key] = HOGRISK_NONE;
      else if (String(values[field.key] || '').trim() === HOGRISK_NONE) values[field.key] = '';
      paint(search.value);
      syncSummary();
    });
    search.addEventListener('input', function () { paint(search.value); });
    paint('');
    syncSummary();
    return wrap;
  }

  function renderField(field) {
    var card = document.createElement('article');
    card.className = 'byra-enkate-q' + (skipped[field.key] && !isAnswered(values[field.key]) ? ' is-skipped' : '');
    card.dataset.key = field.key;

    var title = document.createElement('h3');
    title.className = 'byra-enkate-q-title';
    title.textContent = field.question || field.label;
    card.appendChild(title);

    if (field.hint) {
      var help = document.createElement('p');
      help.className = 'byra-enkate-q-help';
      help.textContent = field.hint;
      card.appendChild(help);
    }

    var control;
    if (field.key === 'branscherKundstock' || field.type === 'multiselect') {
      control = renderHogrisk(field);
    } else if (field.type === 'select') {
      control = renderSelect(field, values[field.key]);
    } else {
      control = renderInput(field, values[field.key]);
    }
    card.appendChild(control);

    if (skipped[field.key] && !isAnswered(values[field.key])) {
      var note = document.createElement('p');
      note.className = 'byra-enkate-skipped-note';
      note.textContent = 'Överhoppad — du kan svara nu eller senare under Byråinformation.';
      card.appendChild(note);
    }
    return card;
  }

  function renderStep() {
    var sec = schema.sections[stepIdx];
    if (!sec || !ui.fields) return;
    if (ui.stepLabel) ui.stepLabel.textContent = 'Steg ' + (stepIdx + 1) + ' av ' + schema.sections.length;
    if (ui.sectionTitle) ui.sectionTitle.textContent = sec.title || '';
    if (ui.sectionSub) ui.sectionSub.textContent = sec.subtitle || '';
    ui.fields.innerHTML = '';
    var list = document.createElement('div');
    list.className = 'byra-enkate-q-list';
    keysForSection(sec).forEach(function (key) {
      var field = fieldByKey(key);
      if (field) list.appendChild(renderField(field));
    });
    ui.fields.appendChild(list);
    updateProgress();
    updateNav();
  }

  function payload() {
    var out = {};
    (schema.fields || []).forEach(function (f) {
      if (values[f.key] === undefined) return;
      out[f.key] = values[f.key];
    });
    return out;
  }

  function saveProfil() {
    return fetch(baseUrl() + '/api/byra/info', authOpts('PUT', payload())).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Kunde inte spara byråprofilen');
        return data;
      });
    });
  }

  function markKomIgangComplete() {
    return fetch(baseUrl() + '/api/settings/kom-igang', authOpts()).then(function (res) {
      if (!res.ok) throw new Error('Kunde inte läsa Kom igång');
      return res.json();
    }).then(function (data) {
      var state = data.state && typeof data.state === 'object' ? Object.assign({}, data.state) : {};
      state['kom-igang-1-0'] = true;
      state.version = 2;
      return fetch(baseUrl() + '/api/settings/kom-igang', authOpts('PUT', { state: state })).then(function (put) {
        if (!put.ok) throw new Error('Kunde inte uppdatera Kom igång');
      });
    });
  }

  if (ui.back) {
    ui.back.addEventListener('click', function () {
      if (stepIdx <= 0) return;
      stepIdx -= 1;
      setStatus('');
      renderStep();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (ui.skip) {
    ui.skip.addEventListener('click', function () {
      unansweredInSection(schema.sections[stepIdx]).forEach(function (k) { skipped[k] = true; });
      if (stepIdx < schema.sections.length - 1) {
        stepIdx += 1;
        setStatus('Sektionen hoppades över — du kan komplettera senare.');
        renderStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  if (ui.next) {
    ui.next.addEventListener('click', function () {
      ui.next.disabled = true;
      saveProfil()
        .then(function () {
          if (stepIdx < schema.sections.length - 1) {
            stepIdx += 1;
            setStatus('Sparat.');
            renderStep();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        })
        .catch(function (e) { setStatus(e.message || 'Fel vid sparning', true); })
        .then(function () { ui.next.disabled = false; updateNav(); });
    });
  }

  if (ui.finish) {
    ui.finish.addEventListener('click', function () {
      var missing = allUnanswered();
      if (missing.length) {
        setStatus('Besvara alla frågor innan du klarmarkerar (' + missing.length + ' kvar).', true);
        return;
      }
      ui.finish.disabled = true;
      saveProfil()
        .then(function () { return markKomIgangComplete(); })
        .then(function () {
          setStatus('Klart! Byråprofilen är sparad och steget är ikryssat.');
          setTimeout(function () { window.location.href = 'index.html#kom-igang'; }, 700);
        })
        .catch(function (e) {
          setStatus(e.message || 'Kunde inte klarmarkera', true);
          updateNav();
        });
    });
  }

  setStatus('Laddar…');
  Promise.all([
    fetch(baseUrl() + '/api/byra/profil-schema', authOpts()),
    fetch(baseUrl() + '/api/byra/info', authOpts()),
    fetch(baseUrl() + '/api/hogrisk-sni', authOpts())
  ]).then(function (results) {
    var schemaRes = results[0];
    var profilRes = results[1];
    var hogRes = results[2];
    if (schemaRes.status === 401 || profilRes.status === 401) {
      window.location.href = 'login.html';
      return null;
    }
    if (!schemaRes.ok) throw new Error('Kunde inte hämta frågeschema');
    if (!profilRes.ok) throw new Error('Kunde inte hämta byråprofil');
    return Promise.all([
      schemaRes.json(),
      profilRes.json(),
      hogRes.ok ? hogRes.json() : Promise.resolve({})
    ]);
  }).then(function (data) {
    if (!data) return;
    schema = data[0] || {};
    if (!Array.isArray(schema.sections)) schema.sections = [];
    if (!Array.isArray(schema.fields)) schema.fields = [];
    var profil = data[1] || {};
    values = Object.assign({}, profil.fields || profil || {});
    var patterns = data[2] && Array.isArray(data[2].patterns) ? data[2].patterns : [];
    var seen = {};
    hogriskLabels = [];
    patterns.forEach(function (p) {
      var label = String((p && p.label) || '').trim();
      var key = label.toLowerCase();
      if (!label || seen[key]) return;
      seen[key] = true;
      hogriskLabels.push(label);
    });
    stepIdx = 0;
    for (var i = 0; i < schema.sections.length; i++) {
      if (unansweredInSection(schema.sections[i]).length) {
        stepIdx = i;
        break;
      }
      if (i === schema.sections.length - 1) stepIdx = i;
    }
    setStatus('');
    renderStep();
  }).catch(function (e) {
    setStatus(e.message || 'Kunde inte starta enkäten', true);
  });
})();
