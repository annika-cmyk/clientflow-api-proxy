/**
 * Dokumentation-sida – visar slutlig riskbedömning och sparade Länsstyrelsen-PDF:er
 */
(function () {
  if (!document.getElementById('riskbedomning-view')) return;

  const MAX_SAVED_PDFS = 10;

  function getEl(id) { return document.getElementById(id); }
  function getAuthOpts() { return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } }; }
  function getBaseUrl() { return (window.apiConfig && window.apiConfig.baseUrl) || ''; }

  async function getSavedPdfsFromApi() {
    try {
      const res = await fetch(getBaseUrl() + '/api/settings/dokumentation-pdfs', getAuthOpts());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.list) ? data.list : [];
    } catch { return []; }
  }

  async function savePdfListToApi(list) {
    try {
      const res = await fetch(getBaseUrl() + '/api/settings/dokumentation-pdfs', {
        method: 'PUT',
        ...getAuthOpts(),
        body: JSON.stringify({ list })
      });
      return res.ok;
    } catch { return false; }
  }

  function escapeHtml(s) {
    if (s == null || typeof s !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  const REC_ID_RE = /^rec[a-zA-Z0-9]{14}$/;

  function isAirtableRecordId(s) {
    return REC_ID_RE.test(String(s || '').trim());
  }

  function parseAttachmentJson(text) {
    const t = String(text || '').trim();
    if (!t || (!t.startsWith('{') && !t.startsWith('['))) return null;
    try {
      const parsed = JSON.parse(t);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const names = list
        .filter(x => x && typeof x === 'object' && (x.filename || x.url || x.id))
        .map(x => x.filename || x.name || 'Bifogad fil');
      return names.length ? names.join(', ') : null;
    } catch (_) {
      return null;
    }
  }

  function formatAirtableValue(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'boolean') return val ? 'Ja' : 'Nej';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object' && !Array.isArray(val)) {
      if (val.text != null) return String(val.text).trim();
      if (val.filename) return String(val.filename).trim();
      if (val.url && val.filename) return String(val.filename).trim();
      return '';
    }
    if (Array.isArray(val)) {
      if (!val.length) return '';
      const first = val[0];
      if (first && typeof first === 'object' && (first.filename || first.url || (first.id && String(first.id).startsWith('att')))) {
        return val.map(a => a.filename || a.name || 'Bifogad fil').filter(Boolean).join(', ');
      }
      const parts = val
        .map(x => formatAirtableValue(x))
        .filter(x => x && !isAirtableRecordId(x));
      return parts.join(', ');
    }
    const s = String(val).trim();
    if (!s) return '';
    if (isAirtableRecordId(s)) return '';
    const fromJson = parseAttachmentJson(s);
    if (fromJson) return fromJson;
    return s;
  }

  function isNoiseLine(line) {
    const t = String(line || '').trim();
    if (!t) return false;
    if (isAirtableRecordId(t)) return true;
    if (t === 'true' || t === 'false' || t === 'null') return true;
    if ((t.startsWith('{') || t.startsWith('[')) && (t.includes('airtable') || t.includes('"url"') || t.includes('att'))) return true;
    return false;
  }

  function markdownToHtml(text) {
    if (!text || typeof text !== 'string') return '—';
    let t = escapeHtml(text);
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
    const lines = t.split(/\r?\n/);
    const out = [];
    let inUl = false, inOl = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isNoiseLine(line)) continue;
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

  function formatDate(isoOrYyyyMmDd) {
    if (!isoOrYyyyMmDd || typeof isoOrYyyyMmDd !== 'string') return '—';
    const m = String(isoOrYyyyMmDd).substring(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoOrYyyyMmDd;
    const months = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
    return m[3] + ' ' + (months[parseInt(m[2], 10) - 1] || m[2]) + ' ' + m[1];
  }

  function formatExportTimestamp(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
      return '';
    }
  }

  function buildExportDisplayFilename(dateDisplay) {
    return 'Byråns allmänna riskbedömning och rutiner ' + (dateDisplay || new Date().toLocaleDateString('sv-SE')) + '.pdf';
  }

  function parseFilenameFromResponse(res) {
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*?=(?:UTF-8'')?([^;\n]+)/i);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1].trim().replace(/^["']|["']$/g, ''));
    } catch (_) {
      return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const parts = String(reader.result || '').split(',');
        resolve(parts[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const RUTINER_LABELS = [
    { key: '1. Syfte och omfattning policy', label: '1. Syfte och omfattning policy' },
    { key: '2. Centralt Funktionsansvarig ', label: '2. Centralt Funktionsansvarig' },
    { key: '3. Kundkännedomsåtgärder ', label: '3. Kundkännedomsåtgärder' },
    { key: '4. Övervakning och Rapportering ', label: '4. Övervakning och Rapportering' },
    { key: '5. Intern Kontroll ', label: '5. Intern Kontroll' },
    { key: '6. Anställda och Utbildning', label: '6. Anställda och Utbildning' },
    { key: '7. Arkivering av dokumentation', label: '7. Arkivering av dokumentation' },
    { key: '8. Uppdatering och Utvärdering ', label: '8. Uppdatering och Utvärdering' },
    { key: '9. Kommunikation', label: '9. Kommunikation' },
    { key: '10. Registrering Byrån ', label: '10. Registrering Byrån' },
    { key: 'Centralt funktionsansvarig', label: 'Centralt funktionsansvarig' },
    { key: 'Policydokumentet reviderat och godkänt', label: 'Policydokumentet reviderat och godkänt' }
  ];

  const LABELS = [
    { key: '1. Syfte och Omfattning', label: '1. Syfte och Omfattning' },
    { key: '2. Beskrivning av Byråns verksamhet', label: '2. Beskrivning av Byråns verksamhet' },
    { key: 'Antal anställda', label: 'Antal anställda' },
    { key: 'Omsättning', label: 'Omsättning' },
    { key: 'Antal kundföretag', label: 'Antal kundföretag' },
    { key: '3. Metod för Riskbedömning ', label: '3. Metod för Riskbedömning' },
    { key: '4. Identifierade Risker och Sårbarheter', label: '4. Identifierade Risker och Sårbarheter' },
    { key: '5. Riskreducerande Åtgärder och Rutiner', label: '5. Riskreducerande Åtgärder och Rutiner' },
    { key: '6. Utvärdering och Uppdatering', label: '6. Utvärdering och Uppdatering' },
    { key: '7. Kommunikation.', label: '7. Kommunikation' },
    { key: '8. Värdering av sammantagen risk', label: '8. Värdering av sammantagen risk' }
  ];

  function getField(fields, key) {
    let val = fields[key];
    if (val === undefined) val = fields[key.trim()];
    return formatAirtableValue(val);
  }

  async function load() {
    const loading = getEl('loading');
    const content = getEl('content');
    const noData = getEl('no-data');

    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
      loading.style.display = 'none';
      noData.style.display = 'block';
      renderPdfList();
      return;
    }

    try {
      const res = await fetch(getBaseUrl() + '/api/byra-rutiner', getAuthOpts());
      if (!res.ok) throw new Error('Kunde inte hämta data');
      const data = await res.json();
      const fields = data.fields || data.record?.fields || (data.records && data.records[0] ? data.records[0].fields : null);
      if (!fields) {
        loading.style.display = 'none';
        content.style.display = 'block';
        getEl('riskbedomning-view').innerHTML = '<p class="section-desc" style="color:#94a3b8;">Ingen Byråer-post hittades.</p>';
        getEl('byrarutiner-view').innerHTML = '<p class="section-desc" style="color:#94a3b8;">Gå till Byrårutiner för att skapa rutinerna.</p>';
        renderPdfList();
        return;
      }
      const rutinerHtml = [];
      for (const { key, label } of RUTINER_LABELS) {
        const val = getField(fields, key);
        if (key === 'Policydokumentet reviderat och godkänt') {
          rutinerHtml.push(`<div class="dokumentation-field"><strong>${label}</strong><div class="dokumentation-value">${val ? escapeHtml(String(val)) : '—'}</div></div>`);
        } else {
          rutinerHtml.push(`<div class="dokumentation-field"><strong>${label}</strong><div class="dokumentation-value">${val ? markdownToHtml(val) : '—'}</div></div>`);
        }
      }
      getEl('byrarutiner-view').innerHTML = rutinerHtml.join('');

      const html = [];
      for (const { key, label } of LABELS) {
        const val = getField(fields, key);
        if (key === 'Antal anställda' || key === 'Omsättning' || key === 'Antal kundföretag') {
          continue; // visas tillsammans
        }
        html.push(`<div class="dokumentation-field"><strong>${label}</strong><div class="dokumentation-value">${val ? markdownToHtml(val) : '—'}</div></div>`);
      }
      getEl('riskbedomning-view').innerHTML = html.join('');
    } catch (err) {
      console.error('Dokumentation load:', err);
      getEl('riskbedomning-view').innerHTML = '<p class="section-desc" style="color:#94a3b8;">Kunde inte ladda riskbedömningen.</p>';
    }
    loading.style.display = 'none';
    content.style.display = 'block';
    const exportWrap = getEl('dokumentation-export-wrap');
    if (exportWrap) exportWrap.style.display = 'flex';
    renderPdfList();
  }

  async function getSavedPdfs() {
    return getSavedPdfsFromApi();
  }

  async function savePdfToList(entry) {
    const list = await getSavedPdfsFromApi();
    list.unshift(entry);
    const trimmed = list.slice(0, MAX_SAVED_PDFS);
    if (await savePdfListToApi(trimmed)) renderPdfListWith(trimmed);
  }

  function renderPdfListWith(list) {
    const container = getEl('lansstyrelsen-pdf-list');
    if (!container) return;
    if (list.length === 0) {
      container.innerHTML = '<p class="section-desc" style="color:#94a3b8;">Inga exporter sparade ännu. Klicka på <strong>Exportera PDF</strong> ovan för att ladda ner och spara en version med dagens datumstämpel.</p>';
      return;
    }
    container.innerHTML = '<ul class="document-list">' + list.map((item, i) => {
      const stamp = item.exportedAt
        ? formatExportTimestamp(item.exportedAt)
        : (item.date || '');
      const label = item.filename || buildExportDisplayFilename(item.date);
      return `
      <li class="document-list-item">
        <i class="fas fa-file-pdf"></i>
        <span><strong>${escapeHtml(label)}</strong><br><span class="section-desc" style="margin:0;">Exporterad: ${escapeHtml(stamp)}</span></span>
        <button type="button" class="btn btn-secondary btn-sm" data-pdf-index="${i}">
          <i class="fas fa-download"></i> Ladda ner
        </button>
      </li>`;
    }).join('') + '</ul>';
    container.querySelectorAll('[data-pdf-index]').forEach(btn => {
      const i = parseInt(btn.getAttribute('data-pdf-index'), 10);
      btn.addEventListener('click', () => window.dokumentationDownloadPdf(i, list));
    });
  }

  async function renderPdfList() {
    const list = await getSavedPdfsFromApi();
    renderPdfListWith(list);
  }

  window.dokumentationDownloadPdf = async function (index, listArg) {
    const list = listArg || await getSavedPdfsFromApi();
    const item = list[index];
    if (!item || !item.base64) return;
    const byteNumbers = atob(item.base64).split('').map(c => c.charCodeAt(0));
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.filename || 'Byrans-allmanna-riskbedomning-samt-rutiner.pdf';
    a.click();
    URL.revokeObjectURL(url);
  };

  window.getDokumentationSavePdf = function () { return savePdfToList; };

  async function exportDokumentationPdf() {
    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
      alert('Du måste logga in för att exportera.');
      return;
    }
    const btn = getEl('btn-export-dokumentation');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Genererar PDF...';
    }
    if (typeof window.showAiThinking === 'function') {
      window.showAiThinking('Genererar PDF med rutiner och riskbedömning...');
    }
    try {
      const res = await fetch(getBaseUrl() + '/api/byra/lansstyrelsen-pdf', {
        method: 'POST',
        ...getAuthOpts()
      });
      if (!res.ok) {
        const err = await res.json().catch(function () { return {}; });
        throw new Error(err.error || err.message || 'Kunde inte generera PDF');
      }
      const blob = await res.blob();
      const now = new Date();
      const dateDisplay = now.toLocaleDateString('sv-SE');
      const exportedAt = now.toISOString();
      const apiFilename = parseFilenameFromResponse(res);
      const displayFilename = buildExportDisplayFilename(dateDisplay);
      const downloadName = apiFilename || displayFilename;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);

      const base64 = await blobToBase64(blob);
      if (base64) {
        await savePdfToList({
          date: dateDisplay,
          exportedAt: exportedAt,
          filename: displayFilename,
          base64: base64
        });
      }
    } catch (err) {
      console.error('Dokumentation export:', err);
      alert('Kunde inte exportera: ' + (err.message || 'Okänt fel'));
    } finally {
      if (typeof window.hideAiThinking === 'function') window.hideAiThinking();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  }

  window.dokumentationExportPdf = exportDokumentationPdf;
  window.exportLansstyrelsenPdf = exportDokumentationPdf;

  function initExportButton() {
    const btn = getEl('btn-export-dokumentation');
    if (btn) btn.addEventListener('click', exportDokumentationPdf);
  }

  /** Kör load() när auth är klar – annars kan getCurrentUser() vara null eftersom checkAuthStatus() är asynkron. */
  let loadStarted = false;
  function runLoadWhenReady() {
    if (loadStarted) return;
    loadStarted = true;
    load();
  }
  function whenReady() {
    window.addEventListener('clientflow:authReady', runLoadWhenReady, { once: true });
    setTimeout(runLoadWhenReady, 1500);
  }
  initExportButton();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenReady);
  else whenReady();
})();
