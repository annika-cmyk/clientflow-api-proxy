/**
 * Allmän riskbedömning byrå - Kort med visnings-/redigeringsläge
 */
(function () {
  if (!document.getElementById('fld-syfte-omfattning')) return;

  const FIELD_MAP = [
    { id: 'fld-syfte-omfattning', airtable: '1. Syfte och Omfattning' },
    { id: 'fld-beskrivning', airtable: '2. Beskrivning av Byråns verksamhet' },
    { id: 'fld-antal-anstallda', airtable: 'Antal anställda', type: 'number' },
    { id: 'fld-omsattning', airtable: 'Omsättning', type: 'number' },
    { id: 'fld-antal-kundforetag', airtable: 'Antal kundföretag', type: 'number' },
    { id: 'fld-metod-riskbedomning', airtable: '3. Metod för Riskbedömning ' },
    { id: 'fld-identifierade-risker', airtable: '4. Identifierade Risker och Sårbarheter' },
    { id: 'fld-vardering-risk', airtable: '5. Värdering av sammantagen risk' },
    { id: 'fld-riskreducerande', airtable: '6. Riskreducerande Åtgärder och Rutiner' },
    { id: 'fld-utvardering', airtable: '7. Utvärdering och Uppdatering' },
    { id: 'fld-kommunikation-risk', airtable: '8. Kommunikation.' },
    { id: 'fld-uppdaterad-datum', airtable: 'Uppdaterad datum', type: 'date' }
  ];

  const NUMERIC_IDS = ['fld-antal-anstallda', 'fld-omsattning', 'fld-antal-kundforetag'];

  function getEl(id) { return document.getElementById(id); }
  function getToken() { return localStorage.getItem('authToken'); }
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

  function getDisplayValue(el, m) {
    if (!el) return '';
    var v = el.value || '';
    if (m && m.type === 'number') return String(v);
    return String(v).trim() || '—';
  }

  function formatDateForDisplay(isoOrYyyyMmDd) {
    if (!isoOrYyyyMmDd || typeof isoOrYyyyMmDd !== 'string') return '';
    var m = String(isoOrYyyyMmDd).substring(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoOrYyyyMmDd;
    var months = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
    var mo = months[parseInt(m[2], 10) - 1] || m[2];
    return m[3] + ' ' + mo + ' ' + m[1];
  }

  function updateCardView(card) {
    var fid = card.getAttribute('data-field-id');
    if (fid) {
      var el = getEl(fid);
      var m = FIELD_MAP.find(function (x) { return x.id === fid; });
      var view = card.querySelector('.byra-card-value');
      if (view && el) {
        var raw = getDisplayValue(el, m);
        if (m && m.type === 'number') {
          view.textContent = raw;
        } else if (m && m.type === 'date') {
          view.textContent = raw === '—' ? '—' : formatDateForDisplay(raw);
        } else {
          view.innerHTML = raw === '—' ? '—' : '<div class="byra-card-formatted">' + markdownToHtml(raw) + '</div>';
        }
      }
    }
    if (card.classList.contains('byra-card--numeric-group')) {
      var a = getEl('fld-antal-anstallda'), b = getEl('fld-omsattning'), c = getEl('fld-antal-kundforetag');
      var view = card.querySelector('.byra-card-value');
      if (view) {
        var s = 'Antal anställda: ' + (a ? a.value : '0') + ' · Omsättning: ' + (b ? b.value : '0') + ' SEK · Antal kundföretag: ' + (c ? c.value : '0');
        view.textContent = s || '—';
      }
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
      else if (m.type === 'date') el.value = val ? String(val).substring(0, 10) : '';
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
        headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
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
        console.error('Sparfel riskbedömning:', data);
        if (data.attemptedPayload) console.log('Skickad payload:', data.attemptedPayload);
      }
    } catch (err) {
      if (status) status.textContent = 'Fel vid sparande';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function initCards(canEdit) {
    document.querySelectorAll('.byra-card').forEach(function (card) {
      var view = card.querySelector('.byra-card-view');
      var edit = card.querySelector('.byra-card-edit');
      if (!view || !edit) return;
      if (!view.querySelector('.byra-card-label')) {
        var labelText = '';
        if (card.classList.contains('byra-card--numeric-group')) {
          labelText = 'Byråns nyckeltal';
        } else {
          var formGroup = edit.querySelector('.form-group.full-width');
          var lbl = formGroup ? formGroup.querySelector('label') : null;
          if (lbl) labelText = lbl.textContent;
        }
        if (labelText) {
          var labelEl = document.createElement('div');
          labelEl.className = 'byra-card-label';
          labelEl.textContent = labelText;
          view.insertBefore(labelEl, view.querySelector('.byra-card-value'));
        }
      }
      edit.style.display = 'none';
      if (!canEdit) {
        card.querySelectorAll('.byra-card-edit-btn').forEach(function (b) { b.style.display = 'none'; });
        edit.style.display = 'block';
        view.style.display = 'none';
        return;
      }
      card.querySelectorAll('.byra-card-edit-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { showEdit(card); });
      });
    });
  }

  function initCardSaveButtons(canEdit) {
    if (!canEdit) return;
    document.querySelectorAll('.byra-card[data-field-id]').forEach(function (card) {
      var fid = card.getAttribute('data-field-id');
      var m = FIELD_MAP.find(function (x) { return x.id === fid; });
      if (!m) return;
      var formGroup = card.querySelector('.form-group');
      if (!formGroup || formGroup.querySelector('.card-save-btn')) return;
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
      btn.addEventListener('click', function () {
        var el = getEl(m.id);
        if (!el) return;
        var val = el.value;
        if (m.type === 'number') { var n = parseFloat(String(val).trim()); val = isNaN(n) ? '' : String(n); } else val = String(val || '').trim();
        var fields = {}; fields[m.airtable] = val;
        saveFields(fields, card);
      });
    });
    var revideradBtn = getEl('btn-markera-reviderad-risk');
    if (revideradBtn && canEdit) {
      revideradBtn.addEventListener('click', function () {
        var today = new Date();
        var y = today.getFullYear();
        var m = String(today.getMonth() + 1).padStart(2, '0');
        var d = String(today.getDate()).padStart(2, '0');
        var dateStr = y + '-' + m + '-' + d;
        var dateEl = getEl('fld-uppdaterad-datum');
        if (dateEl) dateEl.value = dateStr;
        var card = document.querySelector('.byra-card[data-field-id="fld-uppdaterad-datum"]');
        var fields = { 'Uppdaterad datum': dateStr };
        saveFields(fields, card, function () {});
      });
    }
    var numCard = document.querySelector('.byra-card--numeric-group');
    if (numCard) {
      var saveBtn = numCard.querySelector('#save-numeric-group');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          var a = getEl('fld-antal-anstallda'), b = getEl('fld-omsattning'), c = getEl('fld-antal-kundforetag');
          var fields = {};
          if (a) { var na = parseFloat(String(a.value).trim()); fields['Antal anställda'] = isNaN(na) ? '' : String(na); }
          if (b) { var nb = parseFloat(String(b.value).trim()); fields['Omsättning'] = isNaN(nb) ? '' : String(nb); }
          if (c) { var nc = parseFloat(String(c.value).trim()); fields['Antal kundföretag'] = isNaN(nc) ? '' : String(nc); }
          saveFields(fields, numCard);
        });
      }
    }
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
    if (format === 'bold' || format === 'italic') {
      ta.value = before + replacement + after;
      ta.selectionStart = ta.selectionEnd = start + replacement.length;
      ta.focus();
    }
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
    if (!getToken()) {
      if (loading) loading.innerHTML = '<p class="statistik-section-desc" style="color:#94a3b8;">Logga in för att visa byråns riskbedömning.</p>';
      return;
    }
    var canEdit = true;
    try {
      var meRes = await fetch(getBaseUrl() + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + getToken() } });
      if (meRes.ok) {
        var meData = await meRes.json();
        canEdit = (meData.user && ['ClientFlowAdmin', 'Ledare'].includes(meData.user.role));
      }
    } catch (_) {}
    try {
      var res = await fetch(getBaseUrl() + '/api/byra-rutiner', { headers: { 'Authorization': 'Bearer ' + getToken() } });
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
      populateForm(data.fields, canEdit);
      initPreviews(canEdit);
      initCards(canEdit);
      initCardSaveButtons(canEdit);
      if (content) content.style.display = 'block';
      var headerActions = getEl('allman-risk-header-actions');
      if (headerActions) headerActions.style.display = 'flex';
      if (!canEdit) FIELD_MAP.forEach(function (m) { var el = getEl(m.id); if (el) el.readOnly = true; });
    } catch (err) {
      console.error('Allmän riskbedömning load error:', err);
      if (loading) loading.style.display = 'none';
      if (noData) { noData.style.display = 'block'; noData.querySelector('p').textContent = 'Ett fel uppstod vid hämtning.'; }
    }
  }

  function initLansstyrelsenPdfButton() {
    var btn = getEl('btn-lansstyrelsen-pdf');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      var origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Genererar PDF...';
      try {
        var res = await fetch(getBaseUrl() + '/api/byra/lansstyrelsen-pdf', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        if (!res.ok) {
          var err = await res.json().catch(function () { return {}; });
          alert(err.error || err.message || 'Kunde inte generera PDF');
          return;
        }
        var blob = await res.blob();
        var cd = res.headers.get('Content-Disposition') || '';
        var m = cd.match(/filename\*?=['"]?(?:UTF-8'')?([^'";\n]+)/);
        var filename = m ? decodeURIComponent(m[1].trim()) : 'Lansstyrelsen-' + new Date().getFullYear() + '.pdf';
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        console.error('Länsstyrelsen PDF:', err);
        alert('Kunde inte generera PDF: ' + (err.message || 'Okänt fel'));
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  function init() {
    load();
    initFormatToolbars();
    initLansstyrelsenPdfButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
