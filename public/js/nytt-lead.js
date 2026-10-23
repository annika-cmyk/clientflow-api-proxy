/**
 * Nytt lead — delad popup för att skapa/söka företag från sidomenyn och kundlistan.
 * Vid ny kund: kundkort.html?id=…&setup=1 (öppnar kundresa/analyskorts-popup).
 * Vid befintlig kund: meddelande + öppna kundkort endast om användaren har behörighet.
 */
(function (global) {
  'use strict';

  function baseUrl() {
    return global.apiConfig && global.apiConfig.baseUrl
      ? global.apiConfig.baseUrl
      : 'https://clientflow-api-proxy-1.onrender.com';
  }

  function authOpts() {
    return (global.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
  }

  function currentUser() {
    return global.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser();
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeOrgnr(raw) {
    return String(raw || '').replace(/[^\d]/g, '');
  }

  function kundkortUrl(id, { setup } = {}) {
    const qs = new URLSearchParams({ id: String(id) });
    if (setup) qs.set('setup', '1');
    return `kundkort.html?${qs.toString()}`;
  }

  function closeModal() {
    const existing = document.getElementById('kundlista-add-modal');
    if (existing) existing.remove();
  }

  function showError(message) {
    const el = document.getElementById('kundlista-add-error');
    if (!el) return;
    el.textContent = message || 'Något gick fel.';
    el.classList.add('is-visible');
  }

  function clearError() {
    document.getElementById('kundlista-add-error')?.classList.remove('is-visible');
  }

  async function lookupByOrgnr(orgnr) {
    const digits = normalizeOrgnr(orgnr);
    if (!digits || digits.length < 10) return null;
    const res = await fetch(
      `${baseUrl()}/api/kunddata/by-orgnr?orgnr=${encodeURIComponent(digits)}`,
      { method: 'GET', ...authOpts() }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Kunde inte söka (HTTP ${res.status})`);
    }
    return data;
  }

  function handleExistingCustomer(lookup, { namn } = {}) {
    const label = (lookup && lookup.existingNamn) || namn || 'Företaget';
    if (lookup && lookup.exists && lookup.hasAccess && lookup.existingId) {
      showError(`"${label}" finns redan hos er byrå. Öppnar befintligt kundkort…`);
      setTimeout(() => {
        global.location.href = kundkortUrl(lookup.existingId);
      }, 900);
      return true;
    }
    if (lookup && lookup.exists) {
      showError(
        `"${label}" finns redan upplagd som kund hos er byrå, men du saknar behörighet till kundkortet. Be en ledare ge dig åtkomst.`
      );
      return true;
    }
    return false;
  }

  function handleDuplicateResponse(data) {
    const existingId = data.existingId || data.airtableRecordId || data.recordId;
    const hasAccess = data.hasAccess !== false && !!existingId;
    // Om servern inte skickar hasAccess (äldre svar) antar vi behörighet när id finns —
    // men föredrar explicit hasAccess === false.
    if (data.hasAccess === false) {
      showError(
        data.message ||
          'Företaget finns redan hos er byrå, men du saknar behörighet till kundkortet. Be en ledare ge dig åtkomst.'
      );
      return true;
    }
    if (existingId && hasAccess) {
      showError(data.message || 'Företaget finns redan hos er byrå. Öppnar befintligt kundkort…');
      setTimeout(() => {
        global.location.href = kundkortUrl(existingId);
      }, 900);
      return true;
    }
    showError(data.message || 'Företaget finns redan hos er byrå.');
    return true;
  }

  function ensureClientFlowApp() {
    return new Promise((resolve) => {
      if (global.clientFlowApp) {
        resolve(global.clientFlowApp);
        return;
      }
      const existing = document.querySelector('script[src*="app.js"]');
      if (existing) {
        const wait = () => {
          if (global.clientFlowApp) resolve(global.clientFlowApp);
          else setTimeout(wait, 50);
        };
        wait();
        return;
      }
      const script = document.createElement('script');
      script.src = 'app.js?v=2.14';
      script.onload = () => {
        const wait = () => {
          if (global.clientFlowApp) resolve(global.clientFlowApp);
          else setTimeout(wait, 50);
        };
        wait();
      };
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    });
  }

  function openBolagsverketModal(prefillOrgnr = '', { autoSearch = false } = {}) {
    const existing = document.getElementById('bolagsverket-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'bolagsverket-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:1600px; width:98vw; max-height:90vh;">
        <div class="modal-header">
          <h2>Företagssök hos Bolagsverket</h2>
          <button class="modal-close" type="button" aria-label="Stäng">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <section class="kundlista-foretagssok-section">
            <p class="dashboard-card-desc">
              Hämta företagsdata från Bolagsverket via organisationsnummer och spara som kund.
            </p>
            <form id="search-form" class="dashboard-search-form">
              <div class="dashboard-search-row">
                <input
                  type="text"
                  id="org-number"
                  name="org-number"
                  placeholder="t.ex. 556722-3705"
                  pattern="[0-9\\-]{8,12}"
                  required
                >
                <button type="submit" class="btn btn-primary btn-sm">
                  <i class="fas fa-search"></i> Hämta
                </button>
                <button type="button" id="clear-search" class="btn btn-secondary btn-sm">
                  <i class="fas fa-times"></i> Rensa
                </button>
              </div>
              <small>Format: 10 siffror, bindestreck tillåtna</small>
            </form>
          </section>

          <section id="error-message" class="error-section" style="display: none;">
            <div class="error-card">
              <div class="error-header">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Fel uppstod</h3>
              </div>
              <div class="error-content">
                <p id="error-text">Ett fel uppstod vid hämtning av företagsdata.</p>
                <div class="error-details" id="error-details" style="display: none;">
                  <h4>Teknisk information:</h4>
                  <pre id="error-technical"></pre>
                </div>
              </div>
              <div class="error-actions">
                <button id="show-error-details" class="btn btn-ghost btn-sm" type="button">
                  <i class="fas fa-info-circle"></i>
                  Visa teknisk information
                </button>
                <button id="hide-error-details" class="btn btn-ghost btn-sm" type="button" style="display: none;">
                  <i class="fas fa-eye-slash"></i>
                  Dölj teknisk information
                </button>
              </div>
            </div>
          </section>

          <section id="company-info" class="company-info-section company-info-section--flat" style="display: none;">
            <div class="company-result">
              <div class="company-header">
                <h2 id="company-name-header"></h2>
                <div class="company-actions">
                  <button id="save-to-datasource" class="btn btn-primary" type="button">
                    <i class="fas fa-arrow-right"></i>
                    Spara företag
                  </button>
                </div>
              </div>
              <div id="company-details" class="company-details"></div>
            </div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    ensureClientFlowApp().then((app) => {
      if (app && typeof app.bindEvents === 'function') app.bindEvents();
      const orgInput = document.getElementById('org-number');
      if (orgInput) {
        const raw = String(prefillOrgnr || '').trim().replace(/\s+/g, '');
        if (raw) orgInput.value = raw;
        orgInput.focus();
        try {
          orgInput.setSelectionRange(orgInput.value.length, orgInput.value.length);
        } catch (_) { /* ignore */ }
        if (autoSearch && raw && document.getElementById('search-form')) {
          setTimeout(() => {
            document.getElementById('search-form')?.requestSubmit?.();
          }, 120);
        }
      }
    });
  }

  function pickOrgName(org) {
    const lista = org?.organisationsnamn?.organisationsnamnLista;
    if (Array.isArray(lista) && lista.length) {
      const namn = lista.map((n) => n && n.namn).filter(Boolean);
      if (namn.length) return namn[0];
    }
    if (typeof org?.namn === 'string' && org.namn.trim()) return org.namn.trim();
    return 'Namn saknas';
  }

  function pickOrgForm(org) {
    const of = org?.organisationsform || org?.juridiskForm;
    if (!of) return '';
    if (typeof of === 'string') return of;
    return of.klartext || of.beskrivning || of.text || of.name || of.kod || '';
  }

  function pickOrgStatus(org) {
    if (org?.verksamOrganisation?.kod === 'JA') return 'Aktiv';
    if (org?.avregistreradOrganisation?.fel) return 'Aktiv';
    if (org?.avregistreringsorsak?.fel) return 'Aktiv';
    if (org?.avregistreradOrganisation || org?.avregistreringsorsak) return 'Avregistrerad';
    return '';
  }

  function summarizeBolagsverket(data, orgnrDigits) {
    const raw = data && data.data != null ? data.data : data;
    const organisations = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const primary = organisations[0] || {};
    return {
      organisationsnummer: orgnrDigits,
      namn: pickOrgName(primary),
      form: pickOrgForm(primary) || '—',
      status: pickOrgStatus(primary) || '—'
    };
  }

  function showSearchStep() {
    const searchPanel = document.getElementById('kundlista-add-search-panel');
    const resultPanel = document.getElementById('kundlista-add-result-panel');
    const footerSearch = document.getElementById('kundlista-add-footer-search');
    const footerResult = document.getElementById('kundlista-add-footer-result');
    if (searchPanel) searchPanel.hidden = false;
    if (resultPanel) resultPanel.hidden = true;
    if (footerSearch) footerSearch.hidden = false;
    if (footerResult) footerResult.hidden = true;
    clearError();
    document.getElementById('kundlista-add-sok-orgnr')?.focus();
  }

  function showResultStep(summary) {
    const searchPanel = document.getElementById('kundlista-add-search-panel');
    const resultPanel = document.getElementById('kundlista-add-result-panel');
    const footerSearch = document.getElementById('kundlista-add-footer-search');
    const footerResult = document.getElementById('kundlista-add-footer-result');
    const title = document.getElementById('kundlista-add-title');
    if (title) title.textContent = 'Nytt lead';
    if (searchPanel) searchPanel.hidden = true;
    if (resultPanel) {
      resultPanel.hidden = false;
      resultPanel.dataset.orgnr = summary.organisationsnummer || '';
      const setTxt = (sel, val) => {
        const el = resultPanel.querySelector(sel);
        if (el) el.textContent = val || '—';
      };
      setTxt('[data-nl-namn]', summary.namn);
      setTxt('[data-nl-orgnr]', summary.organisationsnummer);
      setTxt('[data-nl-form]', summary.form);
      setTxt('[data-nl-status]', summary.status);
    }
    if (footerSearch) footerSearch.hidden = true;
    if (footerResult) footerResult.hidden = false;
    clearError();
    document.getElementById('kundlista-add-continue')?.focus();
  }

  async function continueFromBolagsverketResult() {
    clearError();
    const resultPanel = document.getElementById('kundlista-add-result-panel');
    const orgnr = normalizeOrgnr(resultPanel?.dataset?.orgnr || '');
    if (!orgnr) {
      showError('Organisationsnummer saknas. Sök igen.');
      return;
    }

    const user = currentUser();
    if (!user) {
      showError('Du måste vara inloggad för att fortsätta.');
      return;
    }
    const byraId = (user.byraId || user.fields?.byraId || user.fields?.['Byrå ID'] || '')
      .toString()
      .replace(/,/g, '')
      .trim();
    const anvandareId = user.id || user.fields?.id || null;
    if (!byraId) {
      showError('Kunde inte avgöra vilken byrå du tillhör. Logga in igen och försök på nytt.');
      return;
    }

    const btn = document.getElementById('kundlista-add-continue');
    const original = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar…';
    }

    try {
      // Dubbelkolla dubblett precis innan spar
      const lookup = await lookupByOrgnr(orgnr);
      if (handleExistingCustomer(lookup)) return;

      const res = await fetch(`${baseUrl()}/api/bolagsverket/save-to-airtable`, {
        method: 'POST',
        ...authOpts(),
        body: JSON.stringify({
          organisationsnummer: orgnr,
          orgnr,
          byraId,
          anvandareId,
          userId: anvandareId
        })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        const recordId = data.airtableRecordId || data.recordId || data.id;
        closeModal();
        if (recordId) {
          global.location.href = kundkortUrl(recordId, { setup: true });
          return;
        }
        showError('Företaget sparades men kund-id saknas. Öppna kundlistan och sök upp det.');
        return;
      }

      if (res.status === 409 || data.duplicate || data.error === 'duplicate') {
        handleDuplicateResponse(data);
        return;
      }

      showError(data.message || data.error || `Kunde inte spara företaget (HTTP ${res.status}).`);
    } catch (err) {
      console.error('Nytt lead fortsätt:', err);
      showError(err.message || 'Kunde inte spara företaget. Kontrollera anslutningen.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  }

  async function searchBolagsverketFromAddModal() {
    clearError();
    const input = document.getElementById('kundlista-add-sok-orgnr');
    const orgnr = (input?.value || '').trim();
    const digits = normalizeOrgnr(orgnr);
    if (!digits || digits.length < 10 || digits.length > 12) {
      showError('Ange ett giltigt organisationsnummer (10–12 siffror) för att söka.');
      input?.focus();
      return;
    }

    const btn = document.getElementById('kundlista-add-sok-btn');
    const original = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Söker…';
    }

    try {
      if (!currentUser()) {
        showError('Du måste vara inloggad för att söka.');
        return;
      }
      const lookup = await lookupByOrgnr(digits);
      if (handleExistingCustomer(lookup)) return;

      // Hämta Bolagsverket i samma popup — bryt inte flödet med separat modal
      const res = await fetch(`${baseUrl()}/api/bolagsverket/organisationer`, {
        method: 'POST',
        ...authOpts(),
        body: JSON.stringify({ organisationsnummer: digits })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        const msg = data.message || data.error
          || (res.status === 404
            ? `Inget företag hittades med organisationsnummer ${digits}.`
            : `Kunde inte hämta från Bolagsverket (HTTP ${res.status}).`);
        throw new Error(msg);
      }

      const summary = summarizeBolagsverket(data, digits);
      showResultStep(summary);
    } catch (err) {
      console.error('Nytt lead Bolagsverket-sök:', err);
      showError(err.message || 'Kunde inte söka mot Bolagsverket.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  }

  async function createCompanyWithoutOrg() {
    const nameInput = document.getElementById('kundlista-add-namn');
    const orgInput = document.getElementById('kundlista-add-orgnr');
    const submitBtn = document.getElementById('kundlista-add-submit');
    const namn = (nameInput?.value || '').trim();
    const orgnrRaw = (orgInput?.value || '').trim();

    if (!namn) {
      showError('Ange ett företagsnamn.');
      nameInput?.focus();
      return;
    }

    let orgnr = '';
    if (orgnrRaw) {
      const digits = normalizeOrgnr(orgnrRaw);
      if (digits.length < 10 || digits.length > 12) {
        showError('Ogiltigt organisationsnummer. Ange 10–12 siffror, eller lämna fältet tomt.');
        orgInput?.focus();
        return;
      }
      orgnr = digits;
    }

    const user = currentUser();
    if (!user) {
      showError('Du måste vara inloggad för att skapa ett företag.');
      return;
    }

    const byraId = (user.byraId || user.fields?.byraId || user.fields?.['Byrå ID'] || '')
      .toString()
      .replace(/,/g, '')
      .trim();
    const anvandareId = user.id || user.fields?.id || null;
    if (!byraId) {
      showError('Kunde inte avgöra vilken byrå du tillhör. Logga in igen och försök på nytt.');
      return;
    }

    const originalText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Skapar...';
    }
    clearError();

    try {
      if (orgnr) {
        const lookup = await lookupByOrgnr(orgnr);
        if (handleExistingCustomer(lookup, { namn })) return;
      }

      const fields = {
        Namn: namn,
        'Byrå ID': byraId,
        Kundstatus: 'Lead'
      };
      if (anvandareId) fields['Användare'] = String(anvandareId);
      if (orgnr) fields.Orgnr = orgnr;

      const res = await fetch(`${baseUrl()}/api/kunddata/create`, {
        method: 'POST',
        ...authOpts(),
        body: JSON.stringify({ fields })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.success || data.id)) {
        const recordId = data.id || data.record?.id;
        closeModal();
        if (recordId) {
          global.location.href = kundkortUrl(recordId, { setup: true });
          return;
        }
        if (global.customerManager && typeof global.customerManager.loadCustomers === 'function') {
          await global.customerManager.loadCustomers();
        }
        return;
      }

      if (res.status === 409 || data.error === 'duplicate') {
        handleDuplicateResponse(data);
        return;
      }

      showError(data.message || data.error || `Kunde inte skapa företaget (HTTP ${res.status}).`);
    } catch (err) {
      console.error('Fel vid skapande av företag:', err);
      showError('Kunde inte skapa företaget. Kontrollera anslutningen.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  }

  function open(prefillName = '') {
    closeModal();

    const modal = document.createElement('div');
    modal.id = 'kundlista-add-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box kundlista-add-modal" role="dialog" aria-modal="true" aria-labelledby="kundlista-add-title">
        <div class="modal-header">
          <h3 id="kundlista-add-title">Nytt lead</h3>
          <button class="modal-close" type="button" aria-label="Stäng">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div id="kundlista-add-error" class="kundlista-add-error" role="alert"></div>

          <div id="kundlista-add-search-panel">
            <div class="kundlista-add-sok">
              <label for="kundlista-add-sok-orgnr">Sök organisationsnummer hos Bolagsverket</label>
              <div class="kundlista-add-sok-row">
                <input type="text" id="kundlista-add-sok-orgnr" name="sok-orgnr" inputmode="numeric"
                  placeholder="t.ex. 556722-3705" autocomplete="off">
                <button type="button" class="btn btn-primary btn-sm" id="kundlista-add-sok-btn">
                  <i class="fas fa-search"></i> Sök
                </button>
              </div>
              <small class="form-hint">Om företaget redan finns hos er byrå öppnas befintligt kundkort (om du har behörighet).</small>
            </div>

            <div class="kundlista-add-divider" role="separator">
              <span>eller skapa manuellt</span>
            </div>

            <form id="kundlista-add-form" novalidate>
              <div class="form-group">
                <label for="kundlista-add-namn">Företagsnamn</label>
                <input type="text" id="kundlista-add-namn" name="namn" required autocomplete="organization" placeholder="t.ex. Exempel AB">
              </div>
              <div class="form-group">
                <label for="kundlista-add-orgnr">Organisationsnummer <span style="font-weight:400;color:var(--ink-3);">(valfritt)</span></label>
                <input type="text" id="kundlista-add-orgnr" name="orgnr" inputmode="numeric" placeholder="t.ex. 556722-3705" autocomplete="off">
                <small class="form-hint">Lämna tomt om företaget ännu inte fått sitt org.nr.</small>
              </div>
            </form>
          </div>

          <div id="kundlista-add-result-panel" class="kundlista-add-result" hidden>
            <p class="kundlista-add-result-kicker">Hittat hos Bolagsverket</p>
            <h4 class="kundlista-add-result-namn" data-nl-namn>—</h4>
            <dl class="kundlista-add-result-meta">
              <div><dt>Org.nr</dt><dd data-nl-orgnr>—</dd></div>
              <div><dt>Bolagsform</dt><dd data-nl-form>—</dd></div>
              <div><dt>Status</dt><dd data-nl-status>—</dd></div>
            </dl>
            <p class="form-hint" style="margin:0.75rem 0 0;">
              Nästa steg öppnar kundkortet med uppläggningsresan (företag &amp; personer → beskrivning → redovisning → skicka KYC).
            </p>
          </div>
        </div>
        <div class="modal-footer" id="kundlista-add-footer-search">
          <button type="button" class="btn btn-ghost btn-sm" id="kundlista-add-cancel">Avbryt</button>
          <button type="submit" form="kundlista-add-form" class="btn btn-primary btn-sm" id="kundlista-add-submit">
            <i class="fas fa-plus"></i> Skapa företag
          </button>
        </div>
        <div class="modal-footer" id="kundlista-add-footer-result" hidden>
          <button type="button" class="btn btn-ghost btn-sm" id="kundlista-add-back">Tillbaka</button>
          <button type="button" class="btn btn-primary btn-sm" id="kundlista-add-continue">
            <i class="fas fa-arrow-right"></i> Fortsätt till kunduppläggning
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => closeModal();
    modal.querySelector('.modal-close')?.addEventListener('click', close);
    modal.querySelector('#kundlista-add-cancel')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    modal.querySelector('#kundlista-add-sok-btn')?.addEventListener('click', () => {
      searchBolagsverketFromAddModal();
    });
    modal.querySelector('#kundlista-add-sok-orgnr')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchBolagsverketFromAddModal();
      }
    });
    modal.querySelector('#kundlista-add-back')?.addEventListener('click', () => showSearchStep());
    modal.querySelector('#kundlista-add-continue')?.addEventListener('click', () => {
      continueFromBolagsverketResult();
    });

    const form = document.getElementById('kundlista-add-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      createCompanyWithoutOrg();
    });

    const nameInput = document.getElementById('kundlista-add-namn');
    const sokInput = document.getElementById('kundlista-add-sok-orgnr');
    const raw = String(prefillName || '').trim();
    if (raw && /^\d[\d\s-]{5,}$/.test(raw)) {
      if (sokInput) {
        sokInput.value = raw;
        sokInput.focus();
      }
    } else if (nameInput) {
      if (raw) nameInput.value = raw;
      nameInput.focus();
    } else {
      sokInput?.focus();
    }
  }

  function bindSidebar(root) {
    const btn = (root || document).querySelector('#sidebar-nytt-lead-btn');
    if (!btn || btn.dataset.nyttLeadBound === '1') return;
    btn.dataset.nyttLeadBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!currentUser()) {
        alert('Du måste logga in för att skapa ett nytt lead.');
        return;
      }
      open();
    });
  }

  global.NyttLead = {
    open,
    close: closeModal,
    openBolagsverketModal,
    bindSidebar,
    createCompanyWithoutOrg,
    continueFromBolagsverketResult,
    searchBolagsverketFromAddModal,
    kundkortUrl
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.NyttLead;
  }
})(typeof window !== 'undefined' ? window : global);
