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

  function setStatus(msg, isError, scrollTo) {
    if (!ui.status) return;
    ui.status.textContent = msg || '';
    ui.status.className = 'byra-enkate-status' + (isError ? ' is-error' : msg ? ' is-ok' : '');
    if (scrollTo && msg && ui.status.scrollIntoView) {
      ui.status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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
    if (field && (field.type === 'branscher' || field.key === 'kundernasBranscher')) {
      return isBolagsformerAnswered(v);
    }
    if (field && (field.type === 'hogrisk-branscher' || field.key === 'branscherKundstock')) {
      return isHogriskAnswered(v);
    }
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
    return companionsFor(field)[0] || null;
  }

  function companionsFor(field) {
    return (schema.fields || []).filter(function (f) {
      return f.requiredWhen && f.requiredWhen.key === field.key;
    });
  }

  function goToFirstUnanswered() {
    for (var i = 0; i < schema.sections.length; i++) {
      if (unansweredInSection(schema.sections[i]).length) {
        stepIdx = i;
        renderStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
    }
    return false;
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
    var missing = allUnanswered();
    if (ui.back) {
      ui.back.hidden = stepIdx === 0;
      ui.back.disabled = stepIdx === 0;
    }
    if (ui.next) ui.next.hidden = last;
    if (ui.skip) ui.skip.hidden = last;
    if (ui.finish) {
      ui.finish.hidden = !last;
      // Keep clickable so incomplete state can show feedback (disabled buttons swallow clicks).
      ui.finish.disabled = false;
      ui.finish.setAttribute('aria-disabled', missing.length > 0 ? 'true' : 'false');
      ui.finish.classList.toggle('is-incomplete', missing.length > 0);
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
        companionsFor(field).forEach(function (companion) {
          if (!valueIncludesChoice(value, (companion.requiredWhen || {}).equals)) {
            values[companion.key] = '';
          }
        });
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
    var companions = companionsFor(field);
    wrap.querySelectorAll('.byra-enkate-annat').forEach(function (el) {
      var key = el.getAttribute('data-companion-key');
      var still = companions.some(function (c) {
        return c.key === key && valueIncludesChoice(values[field.key], (c.requiredWhen || {}).equals);
      });
      if (!still) el.remove();
    });
    companions.forEach(function (companion) {
      var needed = valueIncludesChoice(values[field.key], (companion.requiredWhen || {}).equals);
      if (!needed) return;
      if (wrap.querySelector('.byra-enkate-annat[data-companion-key="' + companion.key + '"]')) return;
      var box = document.createElement('div');
      box.className = 'byra-enkate-annat';
      box.setAttribute('data-companion-key', companion.key);
      var lab = document.createElement('label');
      lab.className = 'byra-enkate-annat-label';
      lab.setAttribute('for', 'enkate-' + companion.key);
      lab.textContent = companion.question || companion.label;
      box.appendChild(lab);
      box.appendChild(renderInput(companion, values[companion.key]));
      wrap.appendChild(box);
    });
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

  function renderBranschPicker(field, opts) {
    opts = opts || {};
    var allowNone = !!opts.allowNone;
    var noneLabel = opts.noneLabel || HOGRISK_NONE;
    var catalog = Array.isArray(opts.catalog) ? opts.catalog.slice() : [];
    var wrap = document.createElement('div');
    wrap.className = 'byra-enkate-bransch-picker' + (allowNone ? ' byra-enkate-bransch-picker--hogrisk' : '');

    var noneCb = null;
    if (allowNone) {
      var noneLabelEl = document.createElement('label');
      noneLabelEl.className = 'byra-enkate-check byra-enkate-check--none';
      noneCb = document.createElement('input');
      noneCb.type = 'checkbox';
      noneCb.checked = String(values[field.key] || '').trim() === noneLabel;
      noneLabelEl.appendChild(noneCb);
      var noneSpan = document.createElement('span');
      noneSpan.textContent = noneLabel;
      noneLabelEl.appendChild(noneSpan);
      wrap.appendChild(noneLabelEl);
    }

    var selectedWrap = document.createElement('div');
    selectedWrap.className = 'byra-enkate-bransch-selected';
    wrap.appendChild(selectedWrap);

    var addRow = document.createElement('div');
    addRow.className = 'byra-enkate-bransch-add';
    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'form-input byra-enkate-input';
    search.placeholder = opts.searchPlaceholder || 'Sök och lägg till bransch…';
    search.setAttribute('autocomplete', 'off');
    addRow.appendChild(search);
    var suggestions = document.createElement('div');
    suggestions.className = 'byra-enkate-bransch-suggestions';
    suggestions.hidden = true;
    addRow.appendChild(suggestions);
    wrap.appendChild(addRow);

    var customRow = document.createElement('div');
    customRow.className = 'byra-enkate-bransch-custom';
    var customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.className = 'form-input byra-enkate-input';
    customInput.placeholder = 'Eller skriv egen bransch och tryck Enter';
    customRow.appendChild(customInput);
    wrap.appendChild(customRow);

    var hint = document.createElement('p');
    hint.className = 'byra-enkate-hint';
    wrap.appendChild(hint);

    function currentRows() {
      if (allowNone && String(values[field.key] || '').trim() === noneLabel) return [];
      return parseBolagsformer(values[field.key]);
    }

    function selectedNames() {
      return currentRows().map(function (r) { return String(r.form || '').trim(); }).filter(Boolean);
    }

    function writeRows(rows) {
      if (allowNone && noneCb && noneCb.checked) {
        values[field.key] = noneLabel;
      } else {
        values[field.key] = formatBolagsformer(rows);
      }
      skipped[field.key] = false;
      updateProgress();
      updateNav();
    }

    function setNone(on) {
      if (!allowNone || !noneCb) return;
      noneCb.checked = !!on;
      if (on) {
        values[field.key] = noneLabel;
        selectedWrap.innerHTML = '';
        addRow.hidden = true;
        customRow.hidden = true;
        suggestions.hidden = true;
        hint.textContent = noneLabel + '.';
      } else {
        if (String(values[field.key] || '').trim() === noneLabel) values[field.key] = '';
        addRow.hidden = false;
        customRow.hidden = false;
        paintSelected();
        syncHint();
      }
      skipped[field.key] = false;
      updateProgress();
      updateNav();
    }

    function syncHint() {
      if (allowNone && noneCb && noneCb.checked) {
        hint.textContent = noneLabel + '.';
        return;
      }
      var rows = currentRows();
      hint.textContent = rows.length
        ? (rows.length + ' valda: ' + formatBolagsformer(rows))
        : (opts.emptyHint || 'Sök och lägg till branscher. Antalet får vara ungefärligt.');
    }

    function paintSelected() {
      selectedWrap.innerHTML = '';
      var rows = currentRows();
      if (!rows.length) {
        selectedWrap.innerHTML = '<p class="byra-enkate-bransch-empty">Inga branscher tillagda ännu.</p>';
        syncHint();
        return;
      }
      rows.forEach(function (r) {
        var chip = document.createElement('div');
        chip.className = 'byra-enkate-bransch-chip';
        var name = document.createElement('span');
        name.className = 'byra-enkate-bransch-chip-name';
        name.textContent = r.form;
        chip.appendChild(name);
        var num = document.createElement('input');
        num.type = 'number';
        num.className = 'form-input byra-enkate-bransch-chip-count';
        num.min = '0';
        num.step = '1';
        num.placeholder = 'Antal';
        num.value = r.count || '';
        num.setAttribute('aria-label', 'Antal för ' + r.form);
        num.addEventListener('input', function () {
          var next = currentRows().map(function (row) {
            if (String(row.form).toLowerCase() === String(r.form).toLowerCase()) {
              return { form: row.form, count: num.value };
            }
            return row;
          });
          writeRows(next);
          syncHint();
        });
        chip.appendChild(num);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'byra-enkate-bransch-chip-remove';
        remove.setAttribute('aria-label', 'Ta bort ' + r.form);
        remove.innerHTML = '&times;';
        remove.addEventListener('click', function () {
          writeRows(currentRows().filter(function (row) {
            return String(row.form).toLowerCase() !== String(r.form).toLowerCase();
          }));
          paintSelected();
          paintSuggestions(search.value);
        });
        chip.appendChild(remove);
        selectedWrap.appendChild(chip);
      });
      syncHint();
    }

    function addLabel(label) {
      var name = String(label || '').trim();
      if (!name) return;
      if (allowNone && noneCb && noneCb.checked) setNone(false);
      var rows = currentRows();
      var key = name.toLowerCase();
      var exists = rows.some(function (r) { return String(r.form).toLowerCase() === key; });
      if (!exists) rows.push({ form: name, count: '' });
      writeRows(rows);
      paintSelected();
      search.value = '';
      suggestions.hidden = true;
      var countInput = selectedWrap.querySelector('.byra-enkate-bransch-chip:last-child .byra-enkate-bransch-chip-count');
      if (countInput) countInput.focus();
    }

    function paintSuggestions(filter) {
      suggestions.innerHTML = '';
      if (allowNone && noneCb && noneCb.checked) {
        suggestions.hidden = true;
        return;
      }
      var q = String(filter || '').trim().toLowerCase();
      var taken = {};
      selectedNames().forEach(function (n) { taken[n.toLowerCase()] = true; });
      var items = catalog.filter(function (label) {
        if (taken[String(label).toLowerCase()]) return false;
        return !q || String(label).toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
      if (!items.length) {
        suggestions.hidden = true;
        return;
      }
      items.forEach(function (label) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'byra-enkate-bransch-suggestion';
        btn.textContent = label;
        btn.addEventListener('click', function () { addLabel(label); });
        suggestions.appendChild(btn);
      });
      suggestions.hidden = false;
    }

    if (noneCb) {
      noneCb.addEventListener('change', function () { setNone(noneCb.checked); });
    }
    search.addEventListener('input', function () { paintSuggestions(search.value); });
    search.addEventListener('focus', function () { paintSuggestions(search.value); });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var first = suggestions.querySelector('.byra-enkate-bransch-suggestion');
        if (first) first.click();
        else if (search.value.trim()) addLabel(search.value.trim());
      }
    });
    customInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addLabel(customInput.value);
        customInput.value = '';
      }
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) suggestions.hidden = true;
    });

    if (allowNone && noneCb && noneCb.checked) setNone(true);
    else {
      paintSelected();
      paintSuggestions('');
    }
    return wrap;
  }

  function renderHogrisk(field) {
    return renderBranschPicker(field, {
      allowNone: true,
      noneLabel: HOGRISK_NONE,
      catalog: hogriskLabels,
      searchPlaceholder: 'Sök högriskbransch…',
      emptyHint: 'Sök och lägg till högriskbranscher, eller markera Inga högriskbranscher.'
    });
  }

  function renderKundBranscher(field) {
    var catalog = Array.isArray(schema && schema.commonKundBranscher) && schema.commonKundBranscher.length
      ? schema.commonKundBranscher.slice()
      : [
        'Bygg och anläggning', 'Detaljhandel', 'Partihandel', 'Restaurang och café',
        'Hotell och boende', 'Transport och logistik', 'IT och konsultverksamhet',
        'Vård och omsorg', 'Fastighet', 'Tillverkning och industri', 'Jordbruk och skogsbruk',
        'Utbildning', 'Kultur, media och underhållning', 'Finans och försäkring',
        'Energi och miljö', 'Städ och facility', 'Bemanning', 'Ideell verksamhet',
        'Offentlig sektor', 'Övrigt'
      ];
    return renderBranschPicker(field, {
      allowNone: false,
      catalog: catalog,
      searchPlaceholder: 'Sök bransch…',
      emptyHint: 'Lägg till de branscher ni har kunder i. Antalet får vara ungefärligt.'
    });
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
    if (field.key === 'branscherKundstock' || field.type === 'hogrisk-branscher') {
      control = renderHogrisk(field);
    } else if (field.key === 'kundernasBranscher' || field.type === 'branscher') {
      control = renderKundBranscher(field);
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
        setStatus('Besvara alla frågor innan du klarmarkerar (' + missing.length + ' kvar).', true, true);
        goToFirstUnanswered();
        return;
      }
      ui.finish.disabled = true;
      setStatus('Sparar och klarmarkerar…');
      saveProfil()
        .then(function () { return markKomIgangComplete(); })
        .then(function () {
          setStatus('Klart! Byråprofilen är sparad och steget är ikryssat.', false, true);
          setTimeout(function () { window.location.href = 'index.html#kom-igang'; }, 700);
        })
        .catch(function (e) {
          setStatus(e.message || 'Kunde inte klarmarkera', true, true);
          ui.finish.disabled = false;
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
        f.type = 'hogrisk-branscher';
        if (!f.question) {
          f.question = 'Vilka högriskbranscher finns bland era kunder?';
        }
        if (!f.hint || f.hint.indexOf('T.ex.') === 0 || f.hint.indexOf('Bocka') === 0) {
          f.hint = 'Sök och lägg till högriskbranscher, ange ungefärligt antal. Välj Inga högriskbranscher om det inte finns några.';
        }
      }
      if (f.key === 'kundernasBranscher') {
        f.type = 'branscher';
        if (!f.question) f.question = 'Vilka branscher har ni era kunder i?';
        if (!f.hint) {
          f.hint = 'Lägg till de branscher som är vanligast i kundstocken och ange ungefär hur många kunder per bransch.';
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
    var requestedSection = '';
    try {
      requestedSection = String(new URLSearchParams(window.location.search).get('section') || '').trim().toLowerCase();
    } catch (_) {
      requestedSection = '';
    }
    if (requestedSection) {
      for (var ri = 0; ri < schema.sections.length; ri++) {
        if (String((schema.sections[ri] && schema.sections[ri].id) || '').toLowerCase() === requestedSection) {
          stepIdx = ri;
          break;
        }
      }
    } else {
      for (var i = 0; i < schema.sections.length; i++) {
        if (unansweredInSection(schema.sections[i]).length) {
          stepIdx = i;
          break;
        }
        if (i === schema.sections.length - 1) stepIdx = i;
      }
    }
    setStatus('');
    renderStep();
  }).catch(function (e) {
    setStatus(e.message || 'Kunde inte starta enkäten', true);
  });
})();
