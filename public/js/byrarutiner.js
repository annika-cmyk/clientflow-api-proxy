/**
 * Byrårutiner - Kort med visnings-/redigeringsläge
 */
(function () {
  if (!document.getElementById('fld-syfte-policy')) return;

  const FIELD_MAP = [
    { id: 'fld-syfte-policy', airtable: '1. Syfte och omfattning policy' },
    { id: 'fld-centralt-funktionsansvarig', airtable: '2. Centralt Funktionsansvarig ' },
    { id: 'fld-centralt-person', airtable: 'Centralt funktionsansvarig' },
    { id: 'fld-kundkannedom', airtable: '3. Kundkännedomsåtgärder ' },
    { id: 'fld-overvakning', airtable: '4. Övervakning och Rapportering ' },
    { id: 'fld-intern-kontroll', airtable: '5. Intern Kontroll ' },
    { id: 'fld-anstallda-utbildning', airtable: '6. Anställda och Utbildning' },
    { id: 'fld-arkiv', airtable: '7. Arkivering av dokumentation' },
    { id: 'fld-uppdatering-utvardering', airtable: '8. Uppdatering och Utvärdering ' },
    { id: 'fld-kommunikation', airtable: '9. Kommunikation' },
    { id: 'fld-registrering', airtable: '10. Registrering Byrån ' },
    { id: 'fld-policy-reviderat', airtable: 'Policydokumentet reviderat och godkänt' }
  ];

  function getEl(id) { return document.getElementById(id); }
  function getAuthOpts() { return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } }; }
  function getBaseUrl() { return (window.apiConfig && window.apiConfig.baseUrl) || ''; }

  function getFieldValue(fields, airtableKey) {
    var val = fields[airtableKey];
    if (val === undefined || val === null) val = fields[airtableKey.trim()];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) return '';
    if (Array.isArray(val)) return '';
    return val;
  }

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function markdownToHtml(text) {
    if (!text || typeof text !== 'string') return '';
    var t = escapeHtml(text);
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    var lines = t.split(/\r?\n/);
    var out = [];
    var inUl = false, inOl = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^-\s/.test(line)) {
        if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false; } out.push('<ul>'); inUl = true; }
        out.push('<li>' + line.replace(/^-\s/, '') + '</li>');
      } else if (/^\d+\.\s/.test(line)) {
        if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false; } out.push('<ol>'); inOl = true; }
        out.push('<li>' + line.replace(/^\d+\.\s/, '') + '</li>');
      } else {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        out.push(line ? '<p>' + line + '</p>' : '<br>');
      }
    }
    if (inUl) out.push('</ul>');
    if (inOl) out.push('</ol>');
    return out.length ? out.join('') : '—';
  }

  function getDisplayValue(el) {
    if (!el) return '';
    return String(el.value || '').trim() || '—';
  }

  function updateCardView(card) {
    var fid = card.getAttribute('data-field-id');
    if (!fid) return;
    var el = getEl(fid);
    var view = card.querySelector('.byra-card-value');
    if (view && el) {
      var raw = getDisplayValue(el);
      view.innerHTML = raw === '—' ? '—' : '<div class="byra-card-formatted">' + markdownToHtml(raw) + '</div>';
    }
  }

  function showView(card) {
    var view = card.querySelector('.byra-card-view');
    var edit = card.querySelector('.byra-card-edit');
    if (view) view.style.display = 'block';
    if (edit) edit.style.display = 'none';
  }

  function showEdit(card) {
    var view = card.querySelector('.byra-card-view');
    var edit = card.querySelector('.byra-card-edit');
    if (view) view.style.display = 'none';
    if (edit) edit.style.display = 'block';
  }

  function populateForm(fields, canEdit) {
    FIELD_MAP.forEach(function (m) {
      var el = getEl(m.id);
      if (!el) return;
      var val = getFieldValue(fields, m.airtable);
      if (m.type === 'number') el.value = val === '' || val == null ? '' : Number(val);
      else el.value = val == null ? '' : String(val);
    });
    document.querySelectorAll('.byra-card').forEach(updateCardView);
  }

  function initPreviews(canEdit) {
    document.querySelectorAll('.byrarutiner-rich-field').forEach(function (field) {
      var ta = field.querySelector('textarea');
      if (!ta) return;
      ta.style.display = 'block';
      if (canEdit && field.querySelector('.byrarutiner-format-toolbar')) field.querySelector('.byrarutiner-format-toolbar').style.display = 'flex';
      else if (!canEdit && field.querySelector('.byrarutiner-format-toolbar')) field.querySelector('.byrarutiner-format-toolbar').style.display = 'none';
    });
  }

  async function saveFields(fields, card, onDone) {
    var idEl = getEl('byra-rutiner-record-id'), recordId = idEl ? idEl.value.trim() : '';
    if (!recordId) { if (onDone) onDone('Ingen post.', true); return; }
    var status = card ? card.querySelector('.card-save-status') : null;
    if (status) status.textContent = 'Sparar...';
    var btn = card ? card.querySelector('.card-save-btn') : null;
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(getBaseUrl() + '/api/byra-rutiner/' + encodeURIComponent(recordId), {
        method: 'PATCH',
        ...getAuthOpts(),
        body: JSON.stringify({ fields })
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok) {
        if (status) { status.textContent = 'Sparad'; setTimeout(function () { status.textContent = ''; }, 2000); }
        document.querySelectorAll('.byra-card').forEach(updateCardView);
        if (card) showView(card);
      } else {
        var errMsg = (data && data.error) || (data && data.message) || 'Kunde inte spara';
        var detail = (data && data.airtableError && (data.airtableError.error && data.airtableError.error.message || data.airtableError.message)) || '';
        if (detail) errMsg += ' (' + detail + ')';
        if (status) status.textContent = typeof errMsg === 'string' ? errMsg : 'Kunde inte spara';
        console.error('Sparfel byrårutiner:', data);
        if (data.attemptedPayload) console.log('Skickad payload:', data.attemptedPayload);
      }
    } catch (err) {
      if (status) status.textContent = 'Fel vid sparande';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function wrapInCards(canEdit) {
    var grid = document.querySelector('.byrarutiner-section .form-grid');
    if (!grid) return;
    var groups = grid.querySelectorAll('.form-group');
    groups.forEach(function (formGroup) {
      var input = formGroup.querySelector('input, textarea');
      if (!input || !input.id) return;
      var fid = input.id;
      var m = FIELD_MAP.find(function (x) { return x.id === fid; });
      if (!m) return;
      if (formGroup.closest('.byra-card')) return;
      var card = document.createElement('div');
      card.className = 'byra-card';
      card.setAttribute('data-field-id', fid);
      var view = document.createElement('div');
      view.className = 'byra-card-view';
      var labelEl = document.createElement('div');
      labelEl.className = 'byra-card-label';
      var lbl = formGroup.querySelector('label');
      if (lbl) labelEl.textContent = lbl.textContent;
      var valDiv = document.createElement('div');
      valDiv.className = 'byra-card-value';
      var pencil = document.createElement('button');
      pencil.type = 'button';
      pencil.className = 'byra-card-edit-btn';
      pencil.title = 'Redigera';
      pencil.innerHTML = '<i class="fas fa-pencil-alt"></i>';
      view.appendChild(labelEl);
      view.appendChild(valDiv);
      view.appendChild(pencil);
      var editWrap = document.createElement('div');
      editWrap.className = 'byra-card-edit';
      formGroup.parentNode.insertBefore(card, formGroup);
      card.appendChild(view);
      editWrap.appendChild(formGroup);
      card.appendChild(editWrap);
      var wrap = document.createElement('div');
      wrap.className = 'card-save-wrap';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm card-save-btn';
      btn.innerHTML = '<i class="fas fa-save"></i> Spara';
      var status = document.createElement('span');
      status.className = 'card-save-status';
      wrap.appendChild(btn);
      wrap.appendChild(status);
      formGroup.appendChild(wrap);
      if (canEdit) {
        editWrap.style.display = 'none';
        pencil.addEventListener('click', function () {
          view.style.display = 'none';
          editWrap.style.display = 'block';
        });
        btn.addEventListener('click', function () {
          var el = getEl(m.id);
          if (!el) return;
          var val = String(el.value || '').trim();
          if (m.type === 'number') { var n = parseFloat(val); val = isNaN(n) ? '' : n; }
          var fields = {}; fields[m.airtable] = val;
          saveFields(fields, card);
        });
      } else {
        editWrap.style.display = 'none';
        pencil.style.display = 'none';
        wrap.querySelector('.card-save-btn').style.display = 'none';
      }
    });
  }

  function applyFormat(ta, format) {
    var start = ta.selectionStart, end = ta.selectionEnd, text = ta.value, selected = text.substring(start, end);
    var before = text.substring(0, start), after = text.substring(end), replacement = '';
    if (format === 'bold') replacement = selected ? '**' + selected + '**' : '**';
    else if (format === 'italic') replacement = selected ? '*' + selected + '*' : '*';
    else if (format === 'bullet' || format === 'numbered') {
      var lineStart = text.lastIndexOf('\n', start - 1) + 1;
      replacement = format === 'bullet' ? '- ' : '1. ';
      ta.value = text.substring(0, lineStart) + replacement + text.substring(lineStart);
      ta.selectionStart = ta.selectionEnd = lineStart + replacement.length;
      ta.focus();
      return;
    } else return;
    var newVal = before + replacement + after;
    ta.value = newVal;
    ta.selectionStart = ta.selectionEnd = start + replacement.length;
    ta.focus();
  }

  function initFormatToolbars() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.format-btn');
      if (!btn) return;
      e.preventDefault();
      var field = btn.closest('.byrarutiner-rich-field'), ta = field ? field.querySelector('textarea') : null;
      if (!ta || ta.readOnly) return;
      applyFormat(ta, btn.getAttribute('data-format'));
    });
  }

  async function load() {
    var loading = getEl('loading'), noData = getEl('no-data'), content = getEl('content');
    var canEdit = true;
    try {
      var meRes = await fetch(getBaseUrl() + '/api/auth/me', getAuthOpts());
      if (meRes.ok) {
        var meData = await meRes.json();
        canEdit = (meData.user && ['ClientFlowAdmin', 'Ledare'].includes(meData.user.role));
      }
    } catch (_) {}
    try {
      var res = await fetch(getBaseUrl() + '/api/byra-rutiner', getAuthOpts());
      var data = await res.json();
      if (loading) loading.style.display = 'none';
      if (!res.ok) {
        if (noData) { noData.style.display = 'block'; noData.querySelector('p').textContent = data.message || data.error || 'Kunde inte hämta.'; }
        return;
      }
      if (!data.record || !data.fields) {
        if (noData) noData.style.display = 'block';
        return;
      }
      var recordId = getEl('byra-rutiner-record-id');
      if (recordId) recordId.value = data.id || data.record.id || '';
      wrapInCards(canEdit);
      populateForm(data.fields, canEdit);
      initPreviews(canEdit);
      if (content) content.style.display = 'block';
      var headerActions = getEl('byrarutiner-header-actions');
      if (headerActions) headerActions.style.display = 'flex';
      if (!canEdit) FIELD_MAP.forEach(function (m) { var el = getEl(m.id); if (el) el.readOnly = true; });
    } catch (err) {
      console.error('Byrårutiner load error:', err);
      if (loading) loading.style.display = 'none';
      if (noData) { noData.style.display = 'block'; noData.querySelector('p').textContent = 'Ett fel uppstod vid hämtning.'; }
    }
  }

  function init() {
    load();
    initFormatToolbars();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
