/**
 * Avvikelser-sida – lista, rapportera och visa detaljer
 */
(function () {
  if (!document.getElementById('avvikelser-lista')) return;

  const baseUrl = (window.apiConfig && window.apiConfig.baseUrl) || 'http://localhost:3001';

  function getAuthOpts() { return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } }; }

  let kunder = [];

  async function loadKunder() {
    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) return [];
    try {
      const res = await fetch(`${baseUrl}/api/kunddata`, {
        method: 'POST',
        ...getAuthOpts(),
        body: JSON.stringify({})
      });
      const data = await res.json();
      const records = (data.success && data.data) ? data.data : [];
      return records.map(r => ({
        id: r.id,
        namn: (r.fields && (r.fields.Namn || r.fields.Företagsnamn)) || 'Namn saknas',
        orgnr: (r.fields && (r.fields.Orgnr || r.fields.Organisationsnummer)) || '',
        byraId: (r.fields && r.fields['Byrå ID']) || ''
      })).sort((a, b) => (a.namn || '').localeCompare(b.namn || '', 'sv'));
    } catch (e) {
      console.error('Kunde inte hämta kunder:', e);
      return [];
    }
  }

  async function loadAvvikelser() {
    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) return { avvikelser: [] };
    try {
      const res = await fetch(`${baseUrl}/api/avvikelser?byraOnly=1`, getAuthOpts());
      const data = await res.json();
      return data.success ? data : { avvikelser: [] };
    } catch (e) {
      console.error('Kunde inte hämta avvikelser:', e);
      return { avvikelser: [] };
    }
  }

  function getStatusColor(status) {
    return { 'Öppen': '#ef4444', 'Under utredning': '#f59e0b', 'Rapporterad till FM': '#8b5cf6', 'Rapporterad till Finanspolisen (FM)': '#8b5cf6', 'Avslutad': '#10b981' }[status] || '#ef4444';
  }

  function createAvvikelseCard(a) {
    const fields = a.fields || {};
    const statusColor = getStatusColor(fields['Status']);
    const typ = fields['Typ av avvikelse'] || 'Avvikelse';
    const datum = fields['Date'] || '-';
    const foretag = fields['Företagsnamn'] || '';
    const status = fields['Status'] || 'Öppen';

    return `
      <div class="note-card avvikelse-list-item avvikelse-row" data-id="${a.id}" style="border-left: 4px solid ${statusColor}; cursor:pointer;">
        <span class="avvikelse-kund"><i class="fas fa-building"></i> ${foretag}</span>
        <span class="avvikelse-typ"><i class="fas fa-exclamation-circle" style="color:${statusColor};"></i> ${typ}</span>
        <span class="avvikelse-datum"><i class="fas fa-calendar"></i> ${datum}</span>
        <span class="avvikelse-status" style="background:${statusColor}20; color:${statusColor}; border:1px solid ${statusColor}40; padding:3px 10px; border-radius:12px; font-size:0.8rem; font-weight:600;">${status}</span>
      </div>`;
  }

  function renderList(avvikelser) {
    const list = document.getElementById('avvikelser-lista');
    if (!list) return;

    if (!avvikelser || avvikelser.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>Inga avvikelser registrerade.</p>
          <p style="font-size:0.9rem; color:#94a3b8;">Klicka på &quot;Rapportera en avvikelse här&quot; för att registrera en ny avvikelse.</p>
        </div>`;
      return;
    }

    list.innerHTML = avvikelser.map(a => createAvvikelseCard(a)).join('');

    list.querySelectorAll('.avvikelse-list-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const a = avvikelser.find(x => x.id === id);
        if (a) showDetailModal(a);
      });
    });
  }

  function showDetailModal(avvikelse) {
    const fields = avvikelse.fields || {};
    const statusColor = getStatusColor(fields['Status']);
    const beskrivning = fields['Förklararing'] || '';
    const datum = fields['Date'] || '-';
    const rapporteratDatum = fields['Date 2'] || '';

    const html = `
      <div id="avvikelse-detail-modal" class="modal-overlay">
        <div class="modal-content modal-large">
          <div class="modal-header">
            <h3><i class="fas fa-exclamation-circle" style="color:${statusColor};"></i> ${fields['Typ av avvikelse'] || 'Avvikelse'}</h3>
            <button type="button" class="modal-close" data-close-detail>
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Datum</label>
              <p>${datum}</p>
            </div>
            <div class="form-group">
              <label>Företag</label>
              <p>${fields['Företagsnamn'] || '-'}</p>
            </div>
            <div class="form-group">
              <label>Status</label>
              <span style="background:${statusColor}20; color:${statusColor}; border:1px solid ${statusColor}40; padding:4px 12px; border-radius:12px; font-weight:600;">
                ${fields['Status'] || 'Öppen'}
              </span>
            </div>
            ${beskrivning ? `
            <div class="form-group">
              <label>Beskrivning / Förklaring</label>
              <div style="white-space:pre-wrap; background:#f8fafc; padding:1rem; border-radius:8px;">${beskrivning.replace(/\n/g, '\n')}</div>
            </div>` : ''}
            ${rapporteratDatum ? `
            <div class="form-group">
              <label>Rapporterad till Finanspolisen</label>
              <p>${rapporteratDatum}</p>
            </div>` : ''}
            <div class="form-actions" style="margin-top:1.5rem;">
              <button type="button" class="btn btn-secondary" data-close-detail>Stäng</button>
            </div>
          </div>
        </div>
      </div>`;

    const existing = document.getElementById('avvikelse-detail-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', html);

    document.querySelectorAll('[data-close-detail]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('avvikelse-detail-modal')?.remove();
      });
    });

    document.getElementById('avvikelse-detail-modal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) e.target.remove();
    });
  }

  function showAddModal() {
    const modalHTML = `
      <div id="add-avvikelse-modal" class="modal-overlay">
        <div class="modal-content modal-large">
          <div class="modal-header">
            <h3><i class="fas fa-exclamation-circle"></i> Registrera avvikelse enligt PTL</h3>
            <button type="button" class="modal-close" data-close-add>
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <form id="add-avvikelse-form">
              <div class="form-group">
                <label for="avvikelse-kund">Kund *</label>
                <select id="avvikelse-kund" name="kundId" required>
                  <option value="">Välj kund...</option>
                  <option value="" id="avvikelse-kund-loading">Laddar kunder...</option>
                </select>
              </div>
              <div class="form-group">
                <label for="avvikelse-typ">Typ av avvikelse *</label>
                <select id="avvikelse-typ" name="typ" required>
                  <option value="">Välj typ...</option>
                  <option value="Misstänkt penningtvätt">Misstänkt penningtvätt</option>
                  <option value="Misstänkt finansiering av terrorism">Misstänkt finansiering av terrorism</option>
                  <option value="Ovanlig transaktion">Ovanlig transaktion</option>
                  <option value="Bristande kundkännedom">Bristande kundkännedom</option>
                  <option value="Avvikande beteende">Avvikande beteende</option>
                  <option value="Annan avvikelse">Annan avvikelse</option>
                </select>
              </div>
              <div class="form-group">
                <label for="avvikelse-datum">Datum *</label>
                <input type="date" id="avvikelse-datum" name="datum" required value="${new Date().toISOString().split('T')[0]}">
              </div>
              <div class="form-group">
                <label for="avvikelse-beskrivning">Beskrivning / Förklaring *</label>
                <textarea id="avvikelse-beskrivning" name="beskrivning" rows="6" placeholder="Beskriv avvikelsen i detalj, vad som observerats och varför det bedöms som avvikande..." required></textarea>
              </div>
              <div class="form-group">
                <label for="avvikelse-status">Status *</label>
                <select id="avvikelse-status" name="status" required>
                  <option value="Öppen">Öppen</option>
                  <option value="Under utredning">Under utredning</option>
                  <option value="Rapporterad till FM">Rapporterad till Finanspolisen (FM)</option>
                  <option value="Avslutad">Avslutad</option>
                </select>
              </div>
              <div class="form-group">
                <label for="avvikelse-fm-datum">Datum för rapportering till FM (om aktuellt)</label>
                <input type="date" id="avvikelse-fm-datum" name="rapporteratDatum">
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" data-close-add>Avbryt</button>
                <button type="submit" class="btn btn-primary">
                  <i class="fas fa-save"></i> Spara avvikelse
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>`;

    const existingModal = document.getElementById('add-avvikelse-modal');
    if (existingModal) existingModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const sel = document.getElementById('avvikelse-kund');
    const loadingOpt = document.getElementById('avvikelse-kund-loading');
    loadKunder().then(customers => {
      kunder = customers;
      if (loadingOpt) loadingOpt.remove();
      sel.innerHTML = '<option value="">Välj kund...</option>' + kunder.map(k =>
        `<option value="${k.id}" data-orgnr="${(k.orgnr || '').replace(/"/g, '&quot;')}" data-namn="${(k.namn || '').replace(/"/g, '&quot;')}" data-byra="${k.byraId || ''}">${(k.namn || 'Namn saknas')} ${k.orgnr ? '(' + k.orgnr + ')' : ''}</option>`
      ).join('');
    }).catch(() => {
      if (loadingOpt) loadingOpt.textContent = 'Kunde inte ladda kunder';
    });

    document.querySelectorAll('[data-close-add]').forEach(btn => {
      btn.addEventListener('click', () => document.getElementById('add-avvikelse-modal')?.remove());
    });

    document.getElementById('add-avvikelse-modal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) e.target.closest('.modal-overlay')?.remove();
    });

    document.getElementById('add-avvikelse-form').addEventListener('submit', (e) => {
      e.preventDefault();
      saveAvvikelse(e.target);
    });
  }

  async function saveAvvikelse(form) {
    const kundId = form.querySelector('#avvikelse-kund').value;
    if (!kundId) { alert('Välj en kund.'); return; }
    const kund = kunder.find(k => k.id === kundId);
    if (!kund) { alert('Ogiltig kund.'); return; }

    const avvikelseData = {
      typ: form.querySelector('[name="typ"]').value,
      datum: form.querySelector('[name="datum"]').value,
      beskrivning: form.querySelector('[name="beskrivning"]').value,
      status: form.querySelector('[name="status"]').value,
      rapporteratDatum: form.querySelector('[name="rapporteratDatum"]').value || '',
      byraId: kund.byraId,
      orgnr: kund.orgnr,
      foretagsnamn: kund.namn
    };

    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) { alert('Du måste vara inloggad för att spara avvikelser.'); return; }

    try {
      const res = await fetch(`${baseUrl}/api/avvikelser`, {
        method: 'POST',
        ...getAuthOpts(),
        body: JSON.stringify(avvikelseData)
      });
      if (res.ok) {
        document.getElementById('add-avvikelse-modal')?.remove();
        init();
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err.message || res.statusText;
        const detail = err.airtableError?.error?.message || err.airtableError?.message || '';
        alert(`Kunde inte spara avvikelse: ${msg}${detail ? '\n\nAirtable: ' + detail : ''}`);
      }
    } catch (err) {
      console.error('Fel vid sparande:', err);
      alert(`Fel vid sparande av avvikelse: ${err.message}`);
    }
  }

  async function init() {
    const loading = document.getElementById('loading');
    const noAuth = document.getElementById('no-auth');
    const content = document.getElementById('content');

    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
      if (loading) loading.style.display = 'none';
      if (noAuth) noAuth.style.display = 'block';
      return;
    }

    if (noAuth) noAuth.style.display = 'none';
    if (loading) loading.style.display = 'block';
    if (content) content.style.display = 'none';

    const data = await loadAvvikelser();
    const avvikelser = data.avvikelser || [];

    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';

    renderList(avvikelser);
  }

  document.getElementById('btn-rapportera-avvikelse')?.addEventListener('click', showAddModal);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
