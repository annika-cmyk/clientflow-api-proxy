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

  var DEFAULT_BOLAGSFORMER = [
    'AB',
    'Enskild firma',
    'HB',
    'KB',
    'Ekonomisk förening',
    'Bostadsrättsförening (BRF)',
    'Ideell förening',
    'Stiftelse',
    'Filial/utländskt bolag',
    'Övrigt'
  ];
  var BOLAGSFORM_ALIASES = {
    ab: 'AB',
    aktiebolag: 'AB',
    'enskild firma': 'Enskild firma',
    enskild: 'Enskild firma',
    ef: 'Enskild firma',
    hb: 'HB',
    handelsbolag: 'HB',
    kb: 'KB',
    kommanditbolag: 'KB',
    'ekonomisk förening': 'Ekonomisk förening',
    brf: 'Bostadsrättsförening (BRF)',
    bostadsrättsförening: 'Bostadsrättsförening (BRF)',
    'bostadsrättsförening (brf)': 'Bostadsrättsförening (BRF)',
    'ideell förening': 'Ideell förening',
    'idiell förening': 'Ideell förening',
    ideell: 'Ideell förening',
    idiell: 'Ideell förening',
    stiftelse: 'Stiftelse',
    filial: 'Filial/utländskt bolag',
    'filial/utländskt bolag': 'Filial/utländskt bolag',
    'utländskt bolag': 'Filial/utländskt bolag',
    övrigt: 'Övrigt'
  };

  function matchBolagsform(name, choices) {
    var cleaned = String(name || '').trim().replace(/^(en|ett)\s+/i, '').trim();
    if (!cleaned) return '';
    var key = cleaned.toLowerCase();
    if (BOLAGSFORM_ALIASES[key]) return BOLAGSFORM_ALIASES[key];
    var list = choices && choices.length ? choices : DEFAULT_BOLAGSFORMER;
    var exact = list.find(function (c) { return String(c).toLowerCase() === key; });
    return exact || cleaned;
  }

  function parseBolagsformer(raw) {
    var text = String(raw || '').trim();
    if (!text) return [];
    var parts = text.split(/[,;|]/).reduce(function (acc, part) {
      var chunk = String(part || '').trim();
      if (!chunk) return acc;
      if (/:\s*\d+\s*$/.test(chunk)) acc.push(chunk);
      else chunk.split(/\s+och\s+/i).forEach(function (s) { if (s.trim()) acc.push(s.trim()); });
      return acc;
    }, []);
    var seen = {};
    var rows = [];
    parts.forEach(function (part) {
      var counted = String(part).trim().match(/^(.+?):\s*(\d+)\s*$/);
      var form = matchBolagsform(counted ? counted[1] : part);
      if (!form) return;
      var count = counted ? counted[2] : '';
      var key = form.toLowerCase();
      if (seen[key]) {
        if (!seen[key].count && count) seen[key].count = count;
        return;
      }
      var row = { form: form, count: count };
      seen[key] = row;
      rows.push(row);
    });
    return rows;
  }

  function formatBolagsformer(rows) {
    return (rows || []).map(function (r) {
      var form = String((r && r.form) || '').trim();
      if (!form) return '';
      var count = String((r && r.count) || '').trim();
      return count ? (form + ': ' + count) : form;
    }).filter(Boolean).join(', ');
  }

  function isBolagsformerAnswered(raw) {
    return parseBolagsformer(raw).some(function (r) {
      return r.form && String(r.count || '').trim() !== '';
    });
  }

  function isBolagsformerField(field) {
    return !!(field && (field.type === 'bolagsformer' || field.key === 'vanligasteBolagsformer'));
  }

  function isHogriskAnswered(raw) {
    var text = String(raw || '').trim();
    if (!text) return false;
    if (text === HOGRISK_NONE) return true;
    return parseBolagsformer(text).some(function (r) {
      return r.form && String(r.count || '').trim() !== '';
    });
  }

  function isAnswered(v, field) {
    if (isBolagsformerField(field)) return isBolagsformerAnswered(v);
    if (field && field.key === 'branscherKundstock') return isHogriskAnswered(v);
    if (v == null) return false;
    if (typeof v === 'number') return Number.isFinite(v);
    return String(v).trim() !== '';
  }

  function selectedValues(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.map(function (v) { return String(v || '').trim(); }).filter(Boolean);
    return String(raw).split(/[,;|]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function valueIncludesChoice(raw, choice) {
    var target = String(choice || '').trim().toLowerCase();
    if (!target) return false;
    return selectedValues(raw).some(function (v) { return v.toLowerCase() === target; });
  }

  function isFieldRequired(field) {
    if (!field) return false;
    if (field.requiredWhen && field.requiredWhen.key) {
      return valueIncludesChoice(values[field.requiredWhen.key], field.requiredWhen.equals);
    }
    return !field.optional;
  }

  function fieldByKey(key) {
    return (schema.fields || []).find(function (f) { return f.key === key; });
  }

  function companionFor(field) {
    return (schema.fields || []).find(function (f) {
      return f.requiredWhen && f.requiredWhen.key === field.key;
    });
  }

  function allUnanswered() {
    return (schema.fields || [])
      .filter(function (f) { return isFieldRequired(f) && !isAnswered(values[f.key], f); })
      .map(function (f) { return f.key; });
  }

  function keysForSection(sec) {
    if (Array.isArray(sec.fieldKeys) && sec.fieldKeys.length) return sec.fieldKeys.slice();
    return (schema.fields || [])
      .filter(function (f) { return f.section === sec.id; })
      .map(function (f) { return f.key; });
  }

  function unansweredInSection(sec) {
    return keysForSection(sec).filter(function (k) {
      var f = fieldByKey(k);
      return isFieldRequired(f) && !isAnswered(values[k], f);
    });
  }

  function answeredCount() {
    return (schema.fields || []).filter(function (f) {
      return isFieldRequired(f) && isAnswered(values[f.key], f);
    }).length;
  }

  function requiredCount() {
    return (schema.fields || []).filter(function (f) { return isFieldRequired(f); }).length;
  }

  function updateProgress() {
    var total = requiredCount() || 1;
    var n = answeredCount();
    var pct = Math.round((n / total) * 100);
    if (ui.progress) {
      ui.progress.innerHTML =
        '<div class="byra-enkate-progress-track"><div class="byra-enkate-progress-fill" style="width:' +
        pct + '%"></div></div><p class="byra-enkate-progress-text">' + n + ' av ' + total + ' besvarade</p>';
    }
    if (ui.remaining) {
      var left = Math.max(0, total - n);
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
    if (String(raw).trim() === HOGRISK_NONE) return [HOGRISK_NONE];
    return parseBolagsformer(raw).map(function (r) { return r.form; }).filter(Boolean);
  }

  function hogriskCountFor(label) {
    var hit = parseBolagsformer(values.branscherKundstock).find(function (r) {
      return String(r.form).toLowerCase() === String(label || '').toLowerCase();
    });
    return hit && hit.count ? hit.count : '';
  }

  function renderSelect(field, current) {
    var wrap = document.createElement('div');
    wrap.className = 'byra-enkate-select-block';

    var choices = document.createElement('div');
    choices.className = 'byra-enkate-choices';
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
        if (value !== 'Annat') {
          var companion = companionFor(field);
          if (companion) values[companion.key] = '';
        }
        choices.querySelectorAll('.byra-enkate-choice').forEach(function (b) { b.classList.remove('is-selected'); });
        btn.classList.add('is-selected');
        syncCompanionUi(field, wrap);
        updateProgress();
        updateNav();
        setStatus('');
      });
      choices.appendChild(btn);
    });
    wrap.appendChild(choices);
    syncCompanionUi(field, wrap);
    return wrap;
  }

  function syncCompanionUi(field, wrap) {
    var companion = companionFor(field);
    if (!companion) return;
    var existing = wrap.querySelector('.byra-enkate-annat');
    var needed = String(values[field.key] || '') === String(companion.requiredWhen.equals || '');
    if (!needed) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    var box = document.createElement('div');
    box.className = 'byra-enkate-annat';
    var lab = document.createElement('label');
    lab.className = 'byra-enkate-annat-label';
    lab.setAttribute('for', 'enkate-' + companion.key);
    lab.textContent = companion.question || companion.label;
    box.appendChild(lab);
    box.appendChild(renderInput(companion, values[companion.key]));
    wrap.appendChild(box);
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

    var head = document.createElement('div');
    head.className = 'byra-enkate-bolagsformer-head byra-enkate-hogrisk-head';
    head.innerHTML = '<span>Bransch</span><span>Uppskattat antal</span>';
    wrap.appendChild(head);

    var list = document.createElement('div');
    list.className = 'byra-enkate-hogrisk-list';
    wrap.appendChild(list);

    var summary = document.createElement('p');
    summary.className = 'byra-enkate-hint';
    wrap.appendChild(summary);

    function collectRows() {
      var kept = {};
      parseBolagsformer(values[field.key] === HOGRISK_NONE ? '' : values[field.key]).forEach(function (r) {
        if (r.form) kept[String(r.form).toLowerCase()] = { form: r.form, count: r.count || '' };
      });
      list.querySelectorAll('.byra-enkate-hogrisk-row').forEach(function (row) {
        var cb = row.querySelector('input[type="checkbox"]');
        var num = row.querySelector('input[type="number"]');
        if (!cb) return;
        if (num) {
          num.disabled = !cb.checked;
          row.classList.toggle('is-disabled', !cb.checked);
          if (!cb.checked) num.value = '';
        }
        var key = String(cb.value || '').toLowerCase();
        if (!cb.checked) {
          delete kept[key];
          return;
        }
        kept[key] = { form: cb.value, count: num ? num.value : '' };
      });
      return Object.keys(kept).map(function (k) { return kept[k]; });
    }

    function syncSummary() {
      if (noneCb.checked) {
        values[field.key] = HOGRISK_NONE;
        summary.textContent = HOGRISK_NONE + '.';
      } else {
        var rows = collectRows();
        values[field.key] = formatBolagsformer(rows);
        summary.textContent = rows.length === 0
          ? 'Välj branscher och ange ett uppskattat antal, eller markera att ni saknar högriskbranscher.'
          : rows.length + ' valda: ' + formatBolagsformer(rows);
      }
      skipped[field.key] = false;
      updateProgress();
      updateNav();
    }

    function paint(filter) {
      list.innerHTML = '';
      if (noneCb.checked) {
        head.hidden = true;
        list.innerHTML = '<p class="byra-enkate-hint">Avmarkera "' + HOGRISK_NONE + '" för att välja branscher.</p>';
        return;
      }
      head.hidden = false;
      var q = (filter || '').toLowerCase();
      var items = hogriskLabels.filter(function (label) {
        return !q || String(label).toLowerCase().indexOf(q) >= 0;
      });
      if (!items.length) {
        list.innerHTML = '<p class="byra-enkate-hint">Inga träffar.</p>';
        return;
      }
      var selected = {};
      selectedBranscher().forEach(function (label) {
        selected[String(label).toLowerCase()] = hogriskCountFor(label);
      });
      items.forEach(function (label, idx) {
        var id = 'enkate-hogrisk-' + idx;
        var checked = Object.prototype.hasOwnProperty.call(selected, String(label).toLowerCase());
        var count = checked ? (selected[String(label).toLowerCase()] || '') : '';
        var row = document.createElement('div');
        row.className = 'byra-enkate-hogrisk-row' + (checked ? '' : ' is-disabled');
        row.innerHTML = '<label for="' + id + '"><input type="checkbox" id="' + id + '" value="' + String(label).replace(/"/g, '&quot;') + '"' + (checked ? ' checked' : '') + '><span>' + label + '</span></label>' +
          '<input type="number" class="form-input" min="0" step="1" placeholder="Antal" value="' + count + '"' + (checked ? '' : ' disabled') + '>';
        list.appendChild(row);
      });
      list.querySelectorAll('input').forEach(function (el) {
        el.addEventListener('change', syncSummary);
        el.addEventListener('input', syncSummary);
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

  var IT_SYSTEM_KEYS = ['bokforingssystem', 'bokslutssystem', 'kundhanteringssystem'];

  function isItSystemKey(key) {
    return IT_SYSTEM_KEYS.indexOf(key) >= 0;
  }

  function itSystemFallbackChoices(key) {
    if (key === 'bokforingssystem') return ['Visma', 'Spiris', 'Fortnox', 'BOKIO', 'OQTO', 'BRIOX', 'Annat'];
    if (key === 'bokslutssystem') return ['Capego', 'Fortnox', 'Visma', 'Annat'];
    if (key === 'kundhanteringssystem') return ['ClientFlow', 'Accountec', 'Annat'];
    return [];
  }

  function renderItSystemSelect(field) {
    var col = document.createElement('div');
    col.className = 'byra-enkate-it-col';

    var lab = document.createElement('div');
    lab.className = 'byra-enkate-it-label';
    lab.textContent = field.label;
    col.appendChild(lab);

    var hint = document.createElement('p');
    hint.className = 'byra-enkate-it-multi-hint';
    hint.textContent = 'Flera val möjliga';
    col.appendChild(hint);

    var selected = selectedValues(values[field.key]);
    var selectedSet = {};
    selected.forEach(function (v) { selectedSet[v.toLowerCase()] = true; });

    var list = document.createElement('div');
    list.className = 'byra-enkate-it-checks';
    var opts = (field.choices && field.choices.length) ? field.choices : itSystemFallbackChoices(field.key);
    opts.forEach(function (choice, idx) {
      var label = typeof choice === 'string' ? choice : choice.label;
      var value = typeof choice === 'string' ? choice : choice.value;
      var id = 'enkate-' + field.key + '-' + idx;
      var row = document.createElement('label');
      row.className = 'byra-enkate-it-check';
      row.setAttribute('for', id);
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.value = value;
      cb.checked = !!selectedSet[String(value).toLowerCase()];
      cb.addEventListener('change', function () {
        var cur = selectedValues(values[field.key]);
        var i = cur.findIndex(function (v) { return v.toLowerCase() === String(value).toLowerCase(); });
        if (cb.checked && i < 0) cur.push(value);
        if (!cb.checked && i >= 0) cur.splice(i, 1);
        values[field.key] = cur.join(', ');
        skipped[field.key] = false;
        var companion = companionFor(field);
        if (companion && !valueIncludesChoice(values[field.key], 'Annat')) {
          values[companion.key] = '';
        }
        syncItCompanionUi(field, col);
        updateProgress();
        updateNav();
        setStatus('');
      });
      var span = document.createElement('span');
      span.textContent = label;
      row.appendChild(cb);
      row.appendChild(span);
      list.appendChild(row);
    });
    col.appendChild(list);
    syncItCompanionUi(field, col);
    return col;
  }

  function syncItCompanionUi(field, col) {
    var companion = companionFor(field);
    if (!companion) return;
    var existing = col.querySelector('.byra-enkate-it-annat');
    var needed = valueIncludesChoice(values[field.key], (companion.requiredWhen || {}).equals);
    if (!needed) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    var annatInput = document.createElement('input');
    annatInput.type = 'text';
    annatInput.className = 'form-input byra-enkate-it-annat';
    annatInput.id = 'enkate-' + companion.key;
    annatInput.placeholder = companion.hint || ('Ange ' + companion.label.toLowerCase());
    annatInput.value = values[companion.key] || '';
    annatInput.addEventListener('input', function () {
      values[companion.key] = annatInput.value.trim();
      skipped[companion.key] = false;
      updateProgress();
      updateNav();
    });
    col.appendChild(annatInput);
    annatInput.focus();
  }

  function renderItSystemGroup() {
    var card = document.createElement('article');
    card.className = 'byra-enkate-q byra-enkate-q--it';
    card.dataset.key = 'it-system';

    var title = document.createElement('h3');
    title.className = 'byra-enkate-q-title';
    title.textContent = 'Vilka IT-system används i det dagliga arbetet?';
    card.appendChild(title);

    var help = document.createElement('p');
    help.className = 'byra-enkate-q-help';
    help.textContent = 'Bocka ett eller flera system per område. Välj Annat om ni använder något som inte finns i listan.';
    card.appendChild(help);

    var grid = document.createElement('div');
    grid.className = 'byra-enkate-it-grid';
    IT_SYSTEM_KEYS.forEach(function (key) {
      var field = fieldByKey(key);
      if (field) grid.appendChild(renderItSystemSelect(field));
    });
    card.appendChild(grid);

    var anySkipped = IT_SYSTEM_KEYS.some(function (key) {
      return skipped[key] && !isAnswered(values[key]);
    });
    if (anySkipped) {
      var note = document.createElement('p');
      note.className = 'byra-enkate-skipped-note';
      note.textContent = 'Överhoppad — du kan svara nu eller senare under Byråinformation.';
      card.appendChild(note);
    }
    return card;
  }


  function renderBolagsformer(field) {
    var wrap = document.createElement('div');
    wrap.className = 'byra-enkate-bolagsformer';
    var head = document.createElement('div');
    head.className = 'byra-enkate-bolagsformer-head';
    head.innerHTML = '<span>Bolagsform</span><span>Uppskattat antal</span>';
    var list = document.createElement('div');
    list.className = 'byra-enkate-bolagsformer-list';
    var parsed = parseBolagsformer(values[field.key]);
    var selected = {};
    parsed.forEach(function (r) { selected[String(r.form).toLowerCase()] = r.count; });
    var opts = (field.choices && field.choices.length) ? field.choices : DEFAULT_BOLAGSFORMER;
    var knownSet = {};
    opts.forEach(function (form) { knownSet[String(form).toLowerCase()] = true; });
    var extra = parsed.filter(function (r) { return r.form && !knownSet[String(r.form).toLowerCase()]; });

    function sync() {
      var rows = [];
      list.querySelectorAll('.byra-enkate-bolagsformer-row').forEach(function (row) {
        var num = row.querySelector('input[type="number"]');
        if (row.classList.contains('is-custom')) {
          var nameEl = row.querySelector('input[type="text"]');
          var form = nameEl ? String(nameEl.value || '').trim() : '';
          var count = num ? String(num.value || '').trim() : '';
          if (form) rows.push({ form: form, count: count });
          return;
        }
        var cb = row.querySelector('input[type="checkbox"]');
        if (!cb) return;
        if (num) {
          num.disabled = !cb.checked;
          row.classList.toggle('is-disabled', !cb.checked);
          if (!cb.checked) num.value = '';
        }
        if (!cb.checked) return;
        rows.push({ form: cb.value, count: num ? num.value : '' });
      });
      values[field.key] = formatBolagsformer(rows);
      skipped[field.key] = false;
      updateProgress();
      updateNav();
      setStatus('');
    }

    function bindRow(row) {
      row.querySelectorAll('input').forEach(function (el) {
        el.addEventListener('change', sync);
        el.addEventListener('input', sync);
      });
      var removeBtn = row.querySelector('.byra-enkate-bolagsformer-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', function () {
          row.remove();
          sync();
        });
      }
    }

    function addCustomRow(form, count) {
      var row = document.createElement('div');
      row.className = 'byra-enkate-bolagsformer-row is-custom';
      row.innerHTML = '<input type="text" class="form-input" placeholder="Annan bolagsform" value="' + String(form || '').replace(/"/g, '&quot;') + '">' +
        '<input type="number" class="form-input" min="0" step="1" placeholder="Antal" value="' + String(count || '').replace(/"/g, '&quot;') + '">' +
        '<button type="button" class="byra-enkate-bolagsformer-remove" aria-label="Ta bort form">×</button>';
      list.appendChild(row);
      bindRow(row);
    }

    opts.forEach(function (form, idx) {
      var id = 'enkate-bolagsform-' + idx;
      var count = selected[String(form).toLowerCase()] || '';
      var checked = Object.prototype.hasOwnProperty.call(selected, String(form).toLowerCase());
      var row = document.createElement('div');
      row.className = 'byra-enkate-bolagsformer-row' + (checked ? '' : ' is-disabled');
      row.innerHTML = '<label for="' + id + '"><input type="checkbox" id="' + id + '" value="' + String(form).replace(/"/g, '&quot;') + '"' + (checked ? ' checked' : '') + '><span>' + form + '</span></label>' +
        '<input type="number" class="form-input" min="0" step="1" placeholder="Antal" value="' + count + '"' + (checked ? '' : ' disabled') + '>';
      list.appendChild(row);
      bindRow(row);
    });
    extra.forEach(function (r) { addCustomRow(r.form, r.count); });

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'byra-enkate-bolagsformer-add';
    addBtn.textContent = 'Lägg till annan form';
    addBtn.addEventListener('click', function () {
      addCustomRow('', '');
      var last = list.querySelector('.byra-enkate-bolagsformer-row.is-custom:last-child input[type="text"]');
      if (last) last.focus();
    });

    wrap.appendChild(head);
    wrap.appendChild(list);
    wrap.appendChild(addBtn);
    return wrap;
  }

  function renderField(field) {
    var card = document.createElement('article');
    card.className = 'byra-enkate-q' + (skipped[field.key] && !isAnswered(values[field.key], field) ? ' is-skipped' : '');
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
    if (field.key === 'branscherKundstock') {
      control = renderHogrisk(field);
    } else if (field.type === 'multiselect') {
      control = renderItSystemSelect(field);
    } else if (isBolagsformerField(field)) {
      control = renderBolagsformer(field);
    } else if (field.type === 'select') {
      control = renderSelect(field, values[field.key]);
    } else {
      control = renderInput(field, values[field.key]);
    }
    card.appendChild(control);

    if (skipped[field.key] && !isAnswered(values[field.key], field)) {
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
    var itGroupRendered = false;
    keysForSection(sec).forEach(function (key) {
      var field = fieldByKey(key);
      if (!field) return;
      if (field.requiredWhen) return; // visas som följdfråga under föräldern
      if (isItSystemKey(key)) {
        if (!itGroupRendered) {
          list.appendChild(renderItSystemGroup());
          itGroupRendered = true;
        }
        return;
      }
      list.appendChild(renderField(field));
    });
    ui.fields.appendChild(list);
    updateProgress();
    updateNav();
  }

  function payload() {
    var out = {};
    (schema.fields || []).forEach(function (f) {
      if (values[f.key] === undefined) return;
      var v = values[f.key];
      if (v == null) return;
      if (typeof v === 'string' && v.trim() === '') return;
      out[f.key] = typeof v === 'string' ? v.trim() : v;
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
    schema.fields.forEach(function (f) {
      if (!f) return;
      if (f.key === 'vanligasteBolagsformer') {
        f.type = 'bolagsformer';
        if (!f.choices || !f.choices.length) f.choices = DEFAULT_BOLAGSFORMER.slice();
        if (!f.question || f.question.indexOf('antal') < 0) {
          f.question = 'Vilka bolagsformer finns i kundstocken? Ange ett uppskattat antal per form.';
        }
        if (!f.hint) {
          f.hint = 'Bocka alla former som förekommer. Antalet får vara ungefärligt – det används för att förstå kundstockens sammansättning.';
        }
      }
      if (f.key === 'branscherKundstock') {
        if (!f.question || f.question.indexOf('antal') < 0) {
          f.question = 'Vilka högriskbranscher finns bland era kunder? Ange ett uppskattat antal per bransch.';
        }
        if (!f.hint || f.hint.indexOf('T.ex.') === 0) {
          f.hint = 'Bocka de branscher som förekommer och ange ungefär hur många kunder. Välj Inga högriskbranscher om det inte finns några.';
        }
      }
    });
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
