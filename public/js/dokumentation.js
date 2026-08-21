/**
 * Dokumentation-sida – visar slutlig riskbedömning och sparade Länsstyrelsen-PDF:er
 */
(function () {
  if (!document.getElementById('riskbedomning-view')) return;

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
    { key: '8. Värdering av sammantagen risk', label: '8. Värdering av sammantagen risk' },
    { key: 'Uppdaterad datum', label: 'Reviderad och godkänd' }
  ];

  function getField(fields, key) {
    let val = fields[key];
    if (val === undefined) val = fields[key.trim()];
    return formatAirtableValue(val);
  }

  function namedCounts(list) {
    return (Array.isArray(list) ? list : [])
      .filter(function (x) { return x && (x.namn || x.name); })
      .map(function (x) {
        return { namn: String(x.namn || x.name).trim(), antal: Number(x.antal) || 0 };
      })
      .filter(function (x) { return x.namn; });
  }

  function renderStatistikSection(data) {
    const d = data || {};
    const riskniva = d.riskniva || {};
    const stat = {
      antalKunder: Number(d.antalKunder) || 0,
      lag: Number(riskniva['Låg']) || 0,
      medel: Number(riskniva['Medel']) || 0,
      hog: Number(riskniva['Hög']) || 0,
      ovrigt: Number(riskniva['Övrigt']) || 0,
      pep: Number(d.antalPepEllerSanktion) || 0,
      tjanster: namedCounts(d.tjänster || d.tjanster),
      hogrisk: namedCounts(d.högriskbransch || d.hogriskbransch),
      riskKort: Array.isArray(d.riskfaktorerPerTyp) ? d.riskfaktorerPerTyp : []
    };
    function listHtml(rows, emptyText) {
      if (!rows.length) return '<p class="stat-list-empty">' + escapeHtml(emptyText) + '</p>';
      return '<div class="stat-list">' + rows.map(function (r) {
        return '<div class="stat-list-row"><span class="stat-list-namn">' + escapeHtml(r.namn) +
          '</span><span class="stat-list-antal">' + r.antal + ' kunder</span></div>';
      }).join('') + '</div>';
    }
    const cards = [
      { label: 'Antal kunder (byrån)', value: stat.antalKunder, icon: 'fa-users' },
      { label: 'Låg risk', value: stat.lag, icon: 'fa-shield-alt', klass: 'stat-number--low' },
      { label: 'Medel risk', value: stat.medel, icon: 'fa-balance-scale', klass: 'stat-number--medium' },
      { label: 'Hög risk', value: stat.hog, icon: 'fa-exclamation-triangle', klass: 'stat-number--high' },
      { label: 'Övrig risknivå', value: stat.ovrigt, icon: 'fa-question-circle' },
      { label: 'PEP eller på sanktionslistor', value: stat.pep, icon: 'fa-user-secret' }
    ].map(function (c) {
      return '<div class="stat-card"><div class="stat-icon"><i class="fas ' + c.icon + '"></i></div>' +
        '<div class="stat-content"><h3>' + escapeHtml(c.label) + '</h3>' +
        '<div class="stat-number' + (c.klass ? ' ' + c.klass : '') + '">' + c.value + '</div></div></div>';
    }).join('');
    const riskHtml = stat.riskKort.length
      ? '<div class="statistik-riskfaktorer-kort">' + stat.riskKort.map(function (kort) {
        const namn = String((kort && kort.typ) || 'Övriga');
        const antal = Number(kort && kort.antalKunder) || 0;
        return '<div class="statistik-riskfaktor-kort"><h4><i class="fas fa-exclamation-circle"></i> ' +
          escapeHtml(namn) + '</h4><div class="riskfaktor-kort-antal">' + antal +
          ' kunder har denna typ</div>' + listHtml(namedCounts(kort && kort.riskfaktorer), 'Inga specifika riskfaktorer registrerade.') + '</div>';
      }).join('') + '</div>'
      : '<p class="stat-list-empty">Inga kunder med riskfaktorer registrerade.</p>';
    return '<div class="dokumentation-field dokumentation-statistik"><strong>Statistik för riskbedömning</strong>' +
      '<div class="dokumentation-value"><p class="statistik-section-desc">Siffror baserade på byråns kunder.</p>' +
      '<div class="stats-cards-row">' + cards + '</div><div class="statistik-sections">' +
      '<section class="statistik-section"><h3><i class="fas fa-cogs"></i> Kunder per tjänst</h3>' +
      listHtml(stat.tjanster, 'Inga tjänster valda hos kunderna.') + '</section>' +
      '<section class="statistik-section"><h3><i class="fas fa-industry"></i> Högriskbransch</h3>' +
      listHtml(stat.hogrisk, 'Inga kunder med högriskbransch registrerad.') + '</section>' +
      '<section class="statistik-section" style="grid-column:1/-1;"><h3><i class="fas fa-exclamation-circle"></i> Riskfaktorer per typ</h3>' +
      riskHtml + '</section></div></div></div>';
  }

  async function fetchStatistik() {
    try {
      const res = await fetch(getBaseUrl() + '/api/statistik-riskbedomning', getAuthOpts());
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
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
      const [res, statData] = await Promise.all([
        fetch(getBaseUrl() + '/api/byra-rutiner', getAuthOpts()),
        fetchStatistik()
      ]);
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
        if (key === 'Uppdaterad datum') {
          html.push(statData
            ? renderStatistikSection(statData)
            : '<div class="dokumentation-field dokumentation-statistik"><strong>Statistik för riskbedömning</strong><div class="dokumentation-value"><p class="section-desc" style="color:#94a3b8;">Kunde inte ladda statistiken.</p></div></div>');
          html.push(`<div class="dokumentation-field"><strong>${label}</strong><div class="dokumentation-value">${val ? escapeHtml(String(val).substring(0, 10)) : '—'}</div></div>`);
          continue;
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
    if (String(window.location.hash || '').replace('#', '') === 'dolda') {
      showDokumentationTab('dolda');
    }
  }

  function exportTitle(item) {
    if (item && item.title) return item.title;
    if (item && item.type === 'policy') return 'Byråpolicy (rutiner)';
    if (item && item.type === 'riskbedomning') return 'Allmän riskbedömning';
    return 'Allmän riskbedömning och byråpolicy';
  }

  function exportStamp(item) {
    if (item && item.stamp) return item.stamp;
    if (item && item.exportedAt) return formatExportTimestamp(item.exportedAt);
    if (item && item.date) return formatDate(item.date);
    return '';
  }

  function renderPdfListWith(list) {
    const container = getEl('lansstyrelsen-pdf-list');
    if (!container) return;
    if (list.length === 0) {
      container.innerHTML = '<p class="section-desc" style="color:#94a3b8;">Inga riskbedömningar eller policydokument sparade ännu. Klicka på <strong>Exportera PDF</strong> ovan för att skapa dagens version med datumstämpel.</p>';
      return;
    }
    container.innerHTML = '<ul class="document-list">' + list.map((item, i) => {
      const title = exportTitle(item);
      const stamp = exportStamp(item);
      const canDownload = !!(item && (item.attachmentId || item.id));
      return `
      <li class="document-list-item">
        <i class="fas fa-file-pdf document-list-icon"></i>
        <span class="document-list-info">
          <strong class="document-list-name">${escapeHtml(title)}</strong>
          <span class="document-list-meta">Skapad ${escapeHtml(stamp || '—')}</span>
        </span>
        <button type="button" class="btn btn-secondary btn-sm document-download-btn" data-pdf-index="${i}" ${canDownload ? '' : 'disabled'}>
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
    const id = item && (item.attachmentId || item.id);
    if (!item || !id) {
      alert('Dokumentet saknar en sparad fil och kan inte laddas ner.');
      return;
    }
    try {
      const res = await fetch(getBaseUrl() + '/api/byra/dokument-export/' + encodeURIComponent(id), getAuthOpts());
      if (!res.ok) {
        const err = await res.json().catch(function () { return {}; });
        throw new Error(err.error || 'Kunde inte ladda ner dokumentet');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.filename || (exportTitle(item) + '.pdf');
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Kunde inte ladda ner dokumentet');
    }
  };

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
      const dateDisplay = new Date().toLocaleDateString('sv-SE');
      const apiFilename = parseFilenameFromResponse(res);
      const downloadName = apiFilename || buildExportDisplayFilename(dateDisplay);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);

      await renderPdfList();
      if (res.headers.get('X-Dokumentation-Saved') === '0') {
        console.warn('Dokumentexporten laddades ner men historiken kunde inte sparas.');
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

  function formatDoldDatum(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
      return String(iso).slice(0, 10);
    }
  }

  async function loadDoldaKunder() {
    const list = getEl('dolda-kunder-list');
    if (!list) return;
    list.innerHTML = '<p class="section-desc">Laddar dolda kunder…</p>';
    try {
      const res = await fetch(getBaseUrl() + '/api/kunddata/dolda', getAuthOpts());
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Kunde inte hämta dolda kunder');
      const items = data.items || [];
      if (!items.length) {
        list.innerHTML = '<p class="section-desc" style="color:#94a3b8;">Inga dolda kunder. När du raderar en kund från kundkortet hamnar länken här.</p>';
        return;
      }
      list.innerHTML = '<ul class="dolda-kunder-ul">' + items.map(function (item) {
        const meta = [item.orgnr, item.doldAv ? ('dold av ' + item.doldAv) : '', formatDoldDatum(item.doldDatum)]
          .filter(Boolean)
          .join(' · ');
        return '<li class="dolda-kunder-item">' +
          '<div class="dolda-kunder-info">' +
            '<strong>' + escapeHtml(item.namn) + '</strong>' +
            (meta ? '<span class="dolda-kunder-meta">' + escapeHtml(meta) + '</span>' : '') +
          '</div>' +
          '<a class="btn btn-secondary btn-sm" href="' + escapeHtml(item.kundkortUrl) + '">' +
            '<i class="fas fa-id-card"></i> Öppna kundkort' +
          '</a>' +
        '</li>';
      }).join('') + '</ul>';
    } catch (err) {
      list.innerHTML = '<p class="section-desc" style="color:#94a3b8;">' + escapeHtml(err.message || 'Kunde inte ladda dolda kunder.') + '</p>';
    }
  }

  function showDokumentationTab(tab) {
    const which = tab === 'dolda' ? 'dolda' : 'byra';
    document.querySelectorAll('[data-dok-tab]').forEach(function (btn) {
      const on = btn.getAttribute('data-dok-tab') === which;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const byra = getEl('dok-pane-byra');
    const dolda = getEl('dok-pane-dolda');
    if (byra) byra.hidden = which !== 'byra';
    if (dolda) dolda.hidden = which !== 'dolda';
    const exportWrap = getEl('dokumentation-export-wrap');
    if (exportWrap && exportWrap.style.display !== 'none') {
      exportWrap.style.visibility = which === 'byra' ? 'visible' : 'hidden';
    }
    if (which === 'dolda') loadDoldaKunder();
    if (which === 'dolda' && window.location.hash !== '#dolda') {
      history.replaceState(null, '', '#dolda');
    }
    if (which === 'byra' && window.location.hash === '#dolda') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function initDokumentationTabs() {
    document.querySelectorAll('[data-dok-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showDokumentationTab(btn.getAttribute('data-dok-tab'));
      });
    });
    if (String(window.location.hash || '').replace('#', '') === 'dolda') {
      showDokumentationTab('dolda');
    }
  }

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
  initDokumentationTabs();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenReady);
  else whenReady();
})();
