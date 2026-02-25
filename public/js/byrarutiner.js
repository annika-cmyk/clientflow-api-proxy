/**
 * Byrårutiner - Redigerbara rutiner från Byråer-tabellen i Airtable
 * Varje fält mappas till Airtable-fältnamn (exakt som i Byråer-tabellen)
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
    { id: 'fld-syfte-policy', airtable: '1. Syfte och omfattning policy' },
    { id: 'fld-centralt-funktionsansvarig', airtable: '2. Centralt Funktionsansvarig ' },
    { id: 'fld-centralt-person', airtable: 'Centralt funktionsansvarig' },
    { id: 'fld-kundkannedom', airtable: '3. Kundkännedomsåtgärder ' },
    { id: 'fld-overvakning', airtable: '4. Övervakning och Rapportering ' },
    { id: 'fld-intern-kontroll', airtable: '5. Intern Kontroll' },
    { id: 'fld-anstallda-utbildning', airtable: '6. Anställda och Utbildning' },
    { id: 'fld-arkiv', airtable: '7. Arkivering av dokumentation' },
    { id: 'fld-uppdatering-utvardering', airtable: '8. Uppdatering och Utvärdering ' },
    { id: 'fld-kommunikation', airtable: '9. Kommunikation' },
    { id: 'fld-registrering', airtable: '10. Registrering Byrån ' },
    { id: 'fld-policy-reviderat', airtable: 'Policydokumentet reviderat och godkänt' }
  ];

  function getEl(id) {
    return document.getElementById(id);
  }

  function getToken() {
    return localStorage.getItem('authToken');
  }

  function getBaseUrl() {
    return (window.apiConfig && window.apiConfig.baseUrl) || '';
  }

  function setSaveStatus(msg, isError) {
    const el = getEl('save-status');
    if (el) {
      el.textContent = msg;
      el.className = 'save-status' + (isError ? ' error' : '');
    }
  }

  function getFieldValue(fields, airtableKey) {
    let val = fields[airtableKey];
    if (val === undefined || val === null) {
      val = fields[airtableKey.trim()];
    }
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) return '';
    if (Array.isArray(val)) return '';
    return val;
  }

  function populateForm(fields) {
    FIELD_MAP.forEach(function (m) {
      const el = getEl(m.id);
      if (!el) return;
      let val = getFieldValue(fields, m.airtable);
      if (m.type === 'number') {
        el.value = val === '' || val == null ? '' : Number(val);
      } else {
        el.value = val == null ? '' : String(val);
      }
    });
  }

  function collectFields() {
    const out = {};
    FIELD_MAP.forEach(function (m) {
      const el = getEl(m.id);
      if (!el) return;
      let val = el.value.trim();
      if (m.type === 'number') {
        const n = parseFloat(val);
        out[m.airtable] = isNaN(n) ? '' : n;
      } else {
        out[m.airtable] = val;
      }
    });
    return out;
  }

  async function load() {
    const loading = getEl('loading');
    const noData = getEl('no-data');
    const content = getEl('content');
    const btnSave = getEl('btn-save');

    if (!getToken()) {
      if (loading) loading.innerHTML = '<p class="statistik-section-desc" style="color:#94a3b8;">Logga in för att visa byråns rutiner.</p>';
      return;
    }

    var canEdit = true;
    try {
      var meRes = await fetch(getBaseUrl() + '/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + getToken() }
      });
      if (meRes.ok) {
        var meData = await meRes.json();
        canEdit = (meData.user && ['ClientFlowAdmin', 'Ledare'].includes(meData.user.role));
      }
    } catch (_) {}

    try {
      const res = await fetch(getBaseUrl() + '/api/byra-rutiner', {
        headers: { 'Authorization': 'Bearer ' + getToken() }
      });
      const data = await res.json();

      if (loading) loading.style.display = 'none';

      if (!res.ok) {
        if (noData) {
          noData.style.display = 'block';
          noData.querySelector('p').textContent = data.message || data.error || 'Kunde inte hämta byråns rutiner.';
        }
        return;
      }

      if (!data.record || !data.fields) {
        if (noData) noData.style.display = 'block';
        return;
      }

      const recordId = getEl('byra-rutiner-record-id');
      if (recordId) recordId.value = data.id || data.record.id || '';

      populateForm(data.fields);
      if (content) content.style.display = 'block';
      if (btnSave) btnSave.style.display = canEdit ? 'inline-flex' : 'none';
      if (!canEdit) {
        FIELD_MAP.forEach(function (m) {
          var el = getEl(m.id);
          if (el) el.readOnly = true;
        });
      }
    } catch (err) {
      console.error('Byrårutiner load error:', err);
      if (loading) loading.style.display = 'none';
      if (noData) {
        noData.style.display = 'block';
        noData.querySelector('p').textContent = 'Ett fel uppstod vid hämtning. Försök igen senare.';
      }
    }
  }

  async function save() {
    const idEl = getEl('byra-rutiner-record-id');
    const recordId = idEl ? idEl.value.trim() : '';
    const btnSave = getEl('btn-save');

    if (!recordId) {
      setSaveStatus('Ingen post att spara.', true);
      return;
    }

    if (btnSave) btnSave.disabled = true;
    setSaveStatus('Sparar...');

    try {
      const fields = collectFields();
      const res = await fetch(getBaseUrl() + '/api/byra-rutiner/' + encodeURIComponent(recordId), {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + getToken(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      });

      const data = await res.json();

      if (res.ok) {
        setSaveStatus('Ändringarna sparades.');
        setTimeout(function () { setSaveStatus(''); }, 3000);
      } else {
        setSaveStatus(data.error || data.message || 'Kunde inte spara.', true);
      }
    } catch (err) {
      console.error('Byrårutiner save error:', err);
      setSaveStatus('Ett fel uppstod vid sparande.', true);
    } finally {
      if (btnSave) btnSave.disabled = false;
    }
  }

  function applyFormat(ta, format) {
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var text = ta.value;
    var selected = text.substring(start, end);
    var before = text.substring(0, start);
    var after = text.substring(end);
    var replacement = '';

    if (format === 'bold') {
      replacement = selected ? '**' + selected + '**' : '**';
    } else if (format === 'italic') {
      replacement = selected ? '*' + selected + '*' : '*';
    } else if (format === 'bullet') {
      var lineStart = text.lastIndexOf('\n', start - 1) + 1;
      var insertPos = lineStart;
      replacement = '- ';
      ta.selectionStart = ta.selectionEnd = insertPos;
    } else if (format === 'numbered') {
      var lineStart2 = text.lastIndexOf('\n', start - 1) + 1;
      replacement = '1. ';
      ta.selectionStart = ta.selectionEnd = lineStart2;
    }

    if (format === 'bullet' || format === 'numbered') {
      var lineStart3 = text.lastIndexOf('\n', start - 1) + 1;
      var newVal = text.substring(0, lineStart3) + replacement + text.substring(lineStart3);
      ta.value = newVal;
      ta.selectionStart = ta.selectionEnd = lineStart3 + replacement.length;
      ta.focus();
      return;
    }

    var newVal2 = before + replacement + after;
    ta.value = newVal2;
    ta.selectionStart = ta.selectionEnd = start + replacement.length;
    ta.focus();
  }

  function initFormatToolbars() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.format-btn');
      if (!btn) return;
      e.preventDefault();
      var format = btn.getAttribute('data-format');
      var field = btn.closest('.byrarutiner-rich-field');
      if (!field) return;
      var ta = field.querySelector('textarea');
      if (!ta || ta.readOnly) return;
      applyFormat(ta, format);
    });
  }

  function init() {
    load();
    initFormatToolbars();

    const btnSave = getEl('btn-save');
    if (btnSave) {
      btnSave.addEventListener('click', save);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
