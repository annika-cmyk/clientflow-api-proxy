// Byrå Användare Management System – hämtar/sparar mot API (Airtable)
function getBaseUrl() {
  return (window.apiConfig && window.apiConfig.baseUrl) ? window.apiConfig.baseUrl : (window.apiConfig && window.apiConfig.getBaseUrl ? window.apiConfig.getBaseUrl() : '') || '';
}
function getAuthOpts(method, body) {
  const opts = (window.AuthManager && typeof window.AuthManager.getAuthFetchOptions === 'function' && window.AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  if (method) opts.method = method;
  if (body !== undefined) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  return opts;
}

class ByraAnvandareManager {
  constructor() {
    this.users = [];
    this.logs = [];
    this.utbildningar = [];
    this.filteredUsers = [];
    this.filteredLogs = [];
    this.byraInfo = null;
    this.byraId = '';
    this.byraTjanster = [];
    this.prislista = { tjanster: {}, fritext: [] };
    this.currentTab = 'byra';
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadByraInfo();
    this.loadUsers();
    this.loadLogs();
    this.loadUtbildningar();
    this.loadAmlGenomforda();
    this.initializeTabs();
  }

  setupEventListeners() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab(btn.getAttribute('data-tab'));
      });
    });

    const byraSpara = document.getElementById('byra-spara');
    if (byraSpara) byraSpara.addEventListener('click', () => this.saveByraInfo());

    const priserSpara = document.getElementById('byra-priser-spara');
    if (priserSpara) priserSpara.addEventListener('click', () => this.savePrislista());
    const laggTillFritext = document.getElementById('byra-priser-lagg-till-fritext');
    if (laggTillFritext) laggTillFritext.addEventListener('click', () => this.addFritextRow());

    const userFilter = document.getElementById('user-filter');
    if (userFilter) userFilter.addEventListener('change', () => this.applyUserFilters());
    const roleFilter = document.getElementById('role-filter');
    if (roleFilter) roleFilter.addEventListener('change', () => this.applyUserFilters());
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) statusFilter.addEventListener('change', () => this.applyUserFilters());

    const logUserFilter = document.getElementById('log-user-filter');
    if (logUserFilter) logUserFilter.addEventListener('change', () => this.applyLogFilters());
    const logActivityFilter = document.getElementById('log-activity-filter');
    if (logActivityFilter) logActivityFilter.addEventListener('change', () => this.applyLogFilters());
    const logDateFrom = document.getElementById('log-date-from');
    if (logDateFrom) logDateFrom.addEventListener('change', () => this.applyLogFilters());
    const logDateTo = document.getElementById('log-date-to');
    if (logDateTo) logDateTo.addEventListener('change', () => this.applyLogFilters());

    const clearUserFiltersBtn = document.getElementById('clear-user-filters');
    if (clearUserFiltersBtn) clearUserFiltersBtn.addEventListener('click', () => this.clearUserFilters());
    const clearLogFiltersBtn = document.getElementById('clear-log-filters');
    if (clearLogFiltersBtn) clearLogFiltersBtn.addEventListener('click', () => this.clearLogFilters());

    const anvandareSkapaBtn = document.getElementById('anvandare-skapa-btn');
    if (anvandareSkapaBtn) anvandareSkapaBtn.addEventListener('click', () => this.openUserModal());
    const anvandareModalClose = document.getElementById('anvandare-modal-close');
    if (anvandareModalClose) anvandareModalClose.addEventListener('click', () => this.closeUserModal());
    const anvandareModalAvbryt = document.getElementById('anvandare-modal-avbryt');
    if (anvandareModalAvbryt) anvandareModalAvbryt.addEventListener('click', () => this.closeUserModal());
    const anvandareForm = document.getElementById('anvandare-form');
    if (anvandareForm) anvandareForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveUser(); });

    const utbildningForm = document.getElementById('utbildning-form');
    if (utbildningForm) utbildningForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveUtbildning(); });
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(tabName);
    if (tab) tab.style.display = 'block';
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    this.currentTab = tabName;
  }

  initializeTabs() {
    document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    const defaultTab = document.getElementById('byra');
    if (defaultTab) defaultTab.style.display = 'block';
    const defaultBtn = document.querySelector('[data-tab="byra"]');
    if (defaultBtn) defaultBtn.classList.add('active');
  }

  async loadByraInfo() {
    const statusEl = document.getElementById('byra-spara-status');
    try {
      const res = await fetch(getBaseUrl() + '/api/byra/info', getAuthOpts());
      if (!res.ok) throw new Error(res.statusText || 'Kunde inte hämta byråinfo');
      const data = await res.json();
      if (!data.success || !data.fields) return;
      this.byraInfo = data;
      this.byraId = (data.byraId || '').toString();
      const f = data.fields;
      const bransch = document.getElementById('byra-bransch');
      if (bransch) {
        bransch.value = f.bransch || '';
        if (!f.bransch && bransch.options.length) {
          const opt = Array.from(bransch.options).find(o => o.text === f.bransch || o.value === f.bransch);
          if (opt) bransch.value = opt.value;
        }
      }
      const antalAnstallda = document.getElementById('byra-antal-anstallda');
      if (antalAnstallda) antalAnstallda.value = f.antalAnstallda ?? '';
      const omsattning = document.getElementById('byra-omsattning');
      if (omsattning) omsattning.value = f.omsattning ?? '';
      const antalKundforetag = document.getElementById('byra-antal-kundforetag');
      if (antalKundforetag) antalKundforetag.value = f.antalKundforetag ?? '';
      const defUpps = document.getElementById('byra-default-uppsagningstid');
      if (defUpps) defUpps.value = f.defaultUppsagningstid ?? '';
      const defFaktura = document.getElementById('byra-default-fakturaperiod');
      if (defFaktura) defFaktura.value = f.defaultFakturaperiod ?? '';
      const defBet = document.getElementById('byra-default-betalningsvillkor');
      if (defBet) defBet.value = f.defaultBetalningsvillkor ?? '';
      const loggaUrl = (function () {
        const v = f.logga;
        if (!v) return '';
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && v.url) return String(v.url);
        return String(v);
      })();
      const logga = document.getElementById('byra-logga');
      if (logga) logga.value = loggaUrl;
      const preview = document.getElementById('byra-logga-preview');
      if (preview) {
        if (loggaUrl) {
          preview.innerHTML = '<img src="' + loggaUrl.replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '" alt="Logga" style="max-width:120px;max-height:60px;object-fit:contain;">';
        } else {
          preview.innerHTML = '<span class="logga-placeholder"><i class="fas fa-building"></i> Logga</span>';
        }
      }

      // Prislista (JSON)
      this.prislista = this.parsePrislista(
        f.tjanstepriserJson,
        f.fritexttjansterJson
      );
      await this.loadByraTjanster();
      this.renderPrislista();
    } catch (err) {
      console.error('loadByraInfo:', err);
      if (statusEl) statusEl.textContent = 'Kunde inte ladda byråinfo.';
    }
  }

  parsePrislista(tjanstepriserJson, fritextJson) {
    const prislista = { tjanster: {}, fritext: [] };
    try {
      const obj = tjanstepriserJson ? JSON.parse(tjanstepriserJson) : null;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) prislista.tjanster = obj;
    } catch (_) {}
    try {
      const arr = fritextJson ? JSON.parse(fritextJson) : null;
      if (Array.isArray(arr)) prislista.fritext = arr;
    } catch (_) {}
    // Normalisera format
    for (const [k, v] of Object.entries(prislista.tjanster || {})) {
      if (v && typeof v === 'object') continue;
      // om någon råkat spara number/string direkt
      const n = Number(v);
      prislista.tjanster[k] = { pris: Number.isFinite(n) ? n : null, enhet: 'h' };
    }
    prislista.fritext = (prislista.fritext || []).map(x => ({
      namn: (x?.namn || '').toString(),
      pris: x?.pris != null && x.pris !== '' ? Number(x.pris) : null,
      enhet: (x?.enhet || 'h').toString()
    })).filter(x => x.namn.trim() !== '');
    // Normalisera legacy-enheter
    for (const v of Object.values(prislista.tjanster || {})) {
      if (!v || typeof v !== 'object') continue;
      const e = (v.enhet || '').toString().trim().toLowerCase();
      if (!e || e === 'timme' || e === 'hour' || e === 'hr') v.enhet = 'h';
      else if (e === 'styck' || e === 'st.' || e === 'pcs' || e === 'piece') v.enhet = 'st';
    }
    prislista.fritext = prislista.fritext.map(it => {
      const e = (it.enhet || '').toString().trim().toLowerCase();
      if (!e || e === 'timme' || e === 'hour' || e === 'hr') return { ...it, enhet: 'h' };
      if (e === 'styck' || e === 'st.' || e === 'pcs' || e === 'piece') return { ...it, enhet: 'st' };
      return it;
    });
    return prislista;
  }

  async loadByraTjanster() {
    const statusEl = document.getElementById('byra-priser-status');
    if (!this.byraId) return;
    try {
      if (statusEl) statusEl.textContent = '';
      const res = await fetch(getBaseUrl() + '/api/byra-tjanster?byraId=' + encodeURIComponent(this.byraId), getAuthOpts());
      const data = res.ok ? await res.json() : {};
      this.byraTjanster = (data.tjanster || []).slice();
      // Dedup: samma namn kan förekomma flera gånger i risk-tabellen
      const seen = new Set();
      this.byraTjanster = this.byraTjanster.filter(t => {
        const n = (t?.namn || '').trim();
        if (!n) return false;
        const key = n.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => (a.namn || '').localeCompare(b.namn || '', 'sv'));
    } catch (e) {
      console.warn('loadByraTjanster:', e);
      if (statusEl) statusEl.textContent = 'Kunde inte ladda byråns tjänster (prislista).';
      this.byraTjanster = [];
    }
  }

  renderPrislista() {
    const wrap = document.getElementById('byra-priser-list');
    if (!wrap) return;

    const rows = [];
    const priceFor = (namn) => {
      const v = this.prislista?.tjanster?.[namn];
      if (!v || typeof v !== 'object') return { pris: '', enhet: 'h' };
      return {
        pris: v.pris != null && v.pris !== '' ? String(v.pris) : '',
        enhet: v.enhet || 'h'
      };
    };

    // Byråns “systemtjänster”
    if (this.byraTjanster.length) {
      for (const t of this.byraTjanster) {
        const namn = (t.namn || '').trim();
        const pv = priceFor(namn);
        rows.push(`
          <div class="byra-prislista-row" data-kind="tjanst" data-namn="${escapeHtml(namn)}">
            <div><input class="form-input" value="${escapeHtml(namn)}" readonly></div>
            <div><input class="form-input" type="number" inputmode="decimal" placeholder="0" data-field="pris" value="${escapeHtml(pv.pris)}"></div>
            <div>
              <select class="form-select" data-field="enhet">
                ${this._sel(['h','st'], pv.enhet)}
              </select>
            </div>
            <div></div>
          </div>
        `);
      }
    }

    // Fritext-rader
    const fritext = this.prislista?.fritext || [];
    for (let i = 0; i < fritext.length; i++) {
      const item = fritext[i];
      rows.push(`
        <div class="byra-prislista-row" data-kind="fritext" data-idx="${i}">
          <div><input class="form-input" placeholder="Tjänst" data-field="namn" value="${escapeHtml(item.namn || '')}"></div>
          <div><input class="form-input" type="number" inputmode="decimal" placeholder="0" data-field="pris" value="${item.pris != null && item.pris !== '' ? escapeHtml(String(item.pris)) : ''}"></div>
          <div>
            <select class="form-select" data-field="enhet">
              ${this._sel(['h','st'], item.enhet || 'h')}
            </select>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button type="button" class="byra-prislista-remove" title="Ta bort" data-action="remove">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `);
    }

    wrap.innerHTML = rows.length ? rows.join('') : '<p style="margin:0;color:#64748b;">Inga tjänster hittades.</p>';

    wrap.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const row = btn.closest('.byra-prislista-row');
        const idx = row ? parseInt(row.getAttribute('data-idx'), 10) : NaN;
        if (!Number.isFinite(idx)) return;
        this.prislista.fritext.splice(idx, 1);
        this.renderPrislista();
      });
    });
  }

  _sel(options, selected) {
    return options.map(o => `<option value="${escapeHtml(o)}" ${o === selected ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
  }

  addFritextRow() {
    this.prislista.fritext = this.prislista.fritext || [];
    this.prislista.fritext.push({ namn: '', pris: null, enhet: 'h' });
    this.renderPrislista();
  }

  collectPrislistaFromDom() {
    const wrap = document.getElementById('byra-priser-list');
    const prislista = { tjanster: {}, fritext: [] };
    if (!wrap) return prislista;

    wrap.querySelectorAll('.byra-prislista-row').forEach(row => {
      const kind = row.getAttribute('data-kind');
      if (kind === 'tjanst') {
        const namn = row.getAttribute('data-namn') || '';
        const prisRaw = row.querySelector('[data-field="pris"]')?.value ?? '';
        const enhet = row.querySelector('[data-field="enhet"]')?.value ?? 'månad';
        const pris = prisRaw !== '' ? Number(prisRaw) : null;
        prislista.tjanster[namn] = { pris: Number.isFinite(pris) ? pris : null, enhet };
      } else if (kind === 'fritext') {
        const namn = row.querySelector('[data-field="namn"]')?.value ?? '';
        const prisRaw = row.querySelector('[data-field="pris"]')?.value ?? '';
        const enhet = row.querySelector('[data-field="enhet"]')?.value ?? 'st';
        const pris = prisRaw !== '' ? Number(prisRaw) : null;
        if (namn.trim()) {
          prislista.fritext.push({ namn: namn.trim(), pris: Number.isFinite(pris) ? pris : null, enhet });
        }
      }
    });

    return prislista;
  }

  async savePrislista() {
    const statusEl = document.getElementById('byra-priser-status');
    const btn = document.getElementById('byra-priser-spara');
    if (statusEl) statusEl.textContent = 'Sparar prislista...';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; }
    try {
      const prislista = this.collectPrislistaFromDom();
      const body = {
        tjanstepriserJson: JSON.stringify(prislista.tjanster || {}),
        fritexttjansterJson: JSON.stringify(prislista.fritext || [])
      };
      const res = await fetch(getBaseUrl() + '/api/byra/info', getAuthOpts('PUT', body));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText || `HTTP ${res.status}`);
      this.prislista = prislista;
      if (statusEl) statusEl.textContent = 'Prislista sparad.';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    } catch (e) {
      console.error('savePrislista:', e);
      if (statusEl) statusEl.textContent = 'Fel: ' + (e.message || 'Kunde inte spara prislista.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Spara prislista'; }
    }
  }

  async saveByraInfo() {
    const statusEl = document.getElementById('byra-spara-status');
    if (statusEl) statusEl.textContent = 'Sparar...';
    try {
      const body = {
        antalAnstallda: document.getElementById('byra-antal-anstallda')?.value ?? '',
        omsattning: document.getElementById('byra-omsattning')?.value ?? '',
        antalKundforetag: document.getElementById('byra-antal-kundforetag')?.value ?? '',
        logga: document.getElementById('byra-logga')?.value ?? '',
        bransch: document.getElementById('byra-bransch')?.value ?? '',
        defaultUppsagningstid: document.getElementById('byra-default-uppsagningstid')?.value ?? '',
        defaultFakturaperiod: document.getElementById('byra-default-fakturaperiod')?.value ?? '',
        defaultBetalningsvillkor: document.getElementById('byra-default-betalningsvillkor')?.value ?? ''
      };
      const res = await fetch(getBaseUrl() + '/api/byra/info', getAuthOpts('PUT', body));
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      if (statusEl) statusEl.textContent = 'Sparat.';
      const preview = document.getElementById('byra-logga-preview');
      const loggaUrl = body.logga;
      if (preview && loggaUrl) {
        preview.innerHTML = '<img src="' + String(loggaUrl).replace(/"/g, '&quot;') + '" alt="Logga" style="max-width:120px;max-height:60px;object-fit:contain;">';
      }
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    } catch (err) {
      console.error('saveByraInfo:', err);
      if (statusEl) statusEl.textContent = 'Fel: ' + (err.message || 'Kunde inte spara.');
    }
  }

  async loadUsers() {
    const list = document.querySelector('.users-list');
    if (list) list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Laddar användare...</p></div>';
    try {
      const res = await fetch(getBaseUrl() + '/api/byra/anvandare', getAuthOpts());
      if (!res.ok) throw new Error(res.statusText || 'Kunde inte hämta användare');
      const data = await res.json();
      this.users = (data.users || []).map(u => ({
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        role: u.role || 'Användare',
        status: 'Aktiv',
        lastLogin: '—',
        byra: u.byra || ''
      }));
      this.filteredUsers = [...this.users];
      this.renderUsers();
      this.populateUserFilters();
    } catch (err) {
      console.error('loadUsers:', err);
      if (list) list.innerHTML = '<div class="no-results"><i class="fas fa-exclamation-triangle"></i><p>Kunde inte ladda användare.</p></div>';
    }
  }

  openUserModal(user) {
    const modal = document.getElementById('anvandare-modal');
    const title = document.getElementById('anvandare-modal-title');
    const idEl = document.getElementById('anvandare-id');
    const emailEl = document.getElementById('anvandare-email');
    const namnEl = document.getElementById('anvandare-namn');
    const rollEl = document.getElementById('anvandare-roll');
    const passwordWrap = document.getElementById('anvandare-password-wrap');
    const passwordEl = document.getElementById('anvandare-password');
    if (!modal) return;
    if (user) {
      title.textContent = 'Redigera användare';
      idEl.value = user.id;
      emailEl.value = user.email || '';
      emailEl.readOnly = true;
      namnEl.value = user.name || '';
      rollEl.value = user.role || 'Användare';
      passwordEl.value = '';
      if (passwordWrap) passwordWrap.style.display = 'block';
    } else {
      title.textContent = 'Lägg till användare';
      idEl.value = '';
      emailEl.value = '';
      emailEl.readOnly = false;
      namnEl.value = '';
      rollEl.value = 'Användare';
      passwordEl.value = '';
      if (passwordWrap) passwordWrap.style.display = 'block';
    }
    modal.style.display = 'flex';
  }

  closeUserModal() {
    const modal = document.getElementById('anvandare-modal');
    if (modal) modal.style.display = 'none';
  }

  async saveUser() {
    const id = document.getElementById('anvandare-id')?.value?.trim();
    const email = document.getElementById('anvandare-email')?.value?.trim();
    const name = document.getElementById('anvandare-namn')?.value?.trim();
    const role = document.getElementById('anvandare-roll')?.value?.trim();
    const password = document.getElementById('anvandare-password')?.value;
    if (!email) return;
    try {
      if (id) {
        const body = { email, name, role };
        if (password) body.password = password;
        const res = await fetch(getBaseUrl() + '/api/byra/anvandare/' + encodeURIComponent(id), getAuthOpts('PUT', body));
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || res.statusText);
        }
      } else {
        const body = { email, name, role };
        if (password) body.password = password;
        const res = await fetch(getBaseUrl() + '/api/byra/anvandare', getAuthOpts('POST', body));
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || res.statusText);
        }
      }
      this.closeUserModal();
      this.loadUsers();
    } catch (err) {
      alert('Kunde inte spara användare: ' + (err.message || ''));
    }
  }

  async loadUtbildningar() {
    const list = document.getElementById('utbildningar-list');
    if (list) list.innerHTML = '<p>Laddar...</p>';
    try {
      const res = await fetch(getBaseUrl() + '/api/byra/utbildningar', getAuthOpts());
      if (!res.ok) throw new Error(res.statusText || 'Kunde inte hämta utbildningar');
      const data = await res.json();
      this.utbildningar = data.utbildningar || [];
      this.renderUtbildningar();
    } catch (err) {
      console.error('loadUtbildningar:', err);
      if (list) list.innerHTML = '<p>Kunde inte ladda utbildningar. Kontrollera att Airtable-tabellen "Utbildningar" finns.</p>';
    }
  }

  renderUtbildningar() {
    const list = document.getElementById('utbildningar-list');
    if (!list) return;
    if (!this.utbildningar.length) {
      list.innerHTML = '<p>Inga utbildningar registrerade än.</p>';
      return;
    }
    list.innerHTML = this.utbildningar.map(u => {
      const datum = u.datum ? new Date(u.datum).toLocaleDateString('sv-SE') : '—';
      return `<div class="utbildning-item"><strong>${escapeHtml(u.namn)}</strong> — ${datum} ${u.typ ? ' • ' + escapeHtml(u.typ) : ''} ${u.beskrivning ? '<br><small>' + escapeHtml(u.beskrivning) + '</small>' : ''}</div>`;
    }).join('');
  }

  async saveUtbildning() {
    const statusEl = document.getElementById('utbildning-form-status');
    const namn = document.getElementById('utbildning-namn')?.value?.trim();
    if (!namn) return;
    if (statusEl) statusEl.textContent = 'Sparar...';
    try {
      const body = {
        namn,
        datum: document.getElementById('utbildning-datum')?.value || undefined,
        typ: document.getElementById('utbildning-typ')?.value || undefined,
        plats: document.getElementById('utbildning-plats')?.value || undefined,
        beskrivning: document.getElementById('utbildning-beskrivning')?.value || undefined
      };
      const res = await fetch(getBaseUrl() + '/api/byra/utbildningar', getAuthOpts('POST', body));
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      document.getElementById('utbildning-namn').value = '';
      document.getElementById('utbildning-datum').value = '';
      document.getElementById('utbildning-typ').value = '';
      document.getElementById('utbildning-plats').value = '';
      document.getElementById('utbildning-beskrivning').value = '';
      if (statusEl) statusEl.textContent = 'Sparat.';
      this.loadUtbildningar();
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    } catch (err) {
      console.error('saveUtbildning:', err);
      if (statusEl) statusEl.textContent = 'Fel: ' + (err.message || '');
    }
  }

  async loadAmlGenomforda() {
    const list = document.getElementById('aml-genomforda-list');
    if (!list) return;
    try {
      const res = await fetch(getBaseUrl() + '/api/utbildning/genomforda', getAuthOpts());
      if (!res.ok) throw new Error(res.statusText || 'Kunde inte hämta');
      const data = await res.json();
      const items = data.genomforda || [];
      if (!items.length) {
        list.innerHTML = '<p>Ingen har genomfört AML Grundkurs än.</p>';
        return;
      }
      list.innerHTML = items.map(g => {
        const datum = g.genomförd ? new Date(g.genomförd).toLocaleDateString('sv-SE') : '—';
        const namn = (g.användarNamn || g.användarId || '—');
        return '<div class="utbildning-item"><strong>' + escapeHtml(namn) + '</strong> — ' + escapeHtml(g.kurs || 'AML Grundkurs') + ' — ' + datum + '</div>';
      }).join('');
    } catch (err) {
      console.error('loadAmlGenomforda:', err);
      list.innerHTML = '<p>Kunde inte ladda listan. Kontrollera att tabellen "Utbildningsslutförande" finns i Airtable.</p>';
    }
  }

  populateUserFilters() {
    const userFilter = document.getElementById('user-filter');
    if (userFilter) {
      userFilter.innerHTML = '<option value="">Alla användare</option>';
      [...new Set(this.users.map(u => u.name))].forEach(name => {
        userFilter.innerHTML += '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
      });
    }
    const roleFilter = document.getElementById('role-filter');
    if (roleFilter) {
      roleFilter.innerHTML = '<option value="">Alla roller</option>';
      [...new Set(this.users.map(u => u.role))].forEach(role => {
        roleFilter.innerHTML += '<option value="' + escapeHtml(role) + '">' + escapeHtml(role) + '</option>';
      });
    }
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) {
      statusFilter.innerHTML = '<option value="">Alla statusar</option><option value="Aktiv">Aktiv</option>';
    }
  }

  populateLogFilters() {
    const logUserFilter = document.getElementById('log-user-filter');
    if (logUserFilter) {
      const names = [...new Set(this.logs.map(l => l.user))];
      logUserFilter.innerHTML = '<option value="">Alla användare</option>';
      names.forEach(n => { logUserFilter.innerHTML += '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>'; });
    }
    const logActivityFilter = document.getElementById('log-activity-filter');
    if (logActivityFilter) {
      const acts = [...new Set(this.logs.map(l => l.action))];
      logActivityFilter.innerHTML = '<option value="">Alla aktiviteter</option>';
      acts.forEach(a => { logActivityFilter.innerHTML += '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>'; });
    }
  }

  applyUserFilters() {
    const userFilter = document.getElementById('user-filter')?.value || '';
    const roleFilter = document.getElementById('role-filter')?.value || '';
    const statusFilter = document.getElementById('status-filter')?.value || '';
    this.filteredUsers = this.users.filter(user => {
      if (userFilter && user.name !== userFilter) return false;
      if (roleFilter && user.role !== roleFilter) return false;
      if (statusFilter && user.status !== statusFilter) return false;
      return true;
    });
    this.renderUsers();
  }

  applyLogFilters() {
    const userFilter = document.getElementById('log-user-filter')?.value || '';
    const activityFilter = document.getElementById('log-activity-filter')?.value || '';
    const dateFrom = document.getElementById('log-date-from')?.value || '';
    const dateTo = document.getElementById('log-date-to')?.value || '';
    this.filteredLogs = this.logs.filter(log => {
      if (userFilter && log.user !== userFilter) return false;
      if (activityFilter && log.action !== activityFilter) return false;
      if (dateFrom || dateTo) {
        const logDate = new Date(log.time);
        if (dateFrom && logDate < new Date(dateFrom)) return false;
        if (dateTo && logDate > new Date(dateTo + 'T23:59:59')) return false;
      }
      return true;
    });
    this.renderLogs();
  }

  clearUserFilters() {
    const userFilter = document.getElementById('user-filter');
    const roleFilter = document.getElementById('role-filter');
    const statusFilter = document.getElementById('status-filter');
    if (userFilter) userFilter.value = '';
    if (roleFilter) roleFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    this.filteredUsers = [...this.users];
    this.renderUsers();
  }

  clearLogFilters() {
    const logUserFilter = document.getElementById('log-user-filter');
    const logActivityFilter = document.getElementById('log-activity-filter');
    const logDateFrom = document.getElementById('log-date-from');
    const logDateTo = document.getElementById('log-date-to');
    if (logUserFilter) logUserFilter.value = '';
    if (logActivityFilter) logActivityFilter.value = '';
    if (logDateFrom) logDateFrom.value = '';
    if (logDateTo) logDateTo.value = '';
    this.filteredLogs = [...this.logs];
    this.renderLogs();
  }

  renderUsers() {
    const usersList = document.querySelector('.users-list');
    if (!usersList) return;
    if (this.users.length === 0) {
      usersList.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Laddar användare...</p></div>';
      return;
    }
    if (this.filteredUsers.length === 0) {
      usersList.innerHTML = '<div class="no-results"><i class="fas fa-search"></i><p>Inga användare med valda filter.</p></div>';
      return;
    }
    const self = this;
    usersList.innerHTML = this.filteredUsers.map(user => `
      <div class="user-item">
        <div class="user-avatar"><i class="fas fa-user"></i></div>
        <div class="user-details">
          <h4>${escapeHtml(user.name)}</h4>
          <p>${escapeHtml(user.email)}</p>
          <span class="user-role">${escapeHtml(user.role)}</span>
        </div>
        <div class="user-status">
          <span class="status aktiv">${escapeHtml(user.status)}</span>
          <span class="last-login">${escapeHtml(user.lastLogin)}</span>
        </div>
        <div class="user-actions">
          <button type="button" class="btn-secondary anvandare-redigera" data-id="${escapeHtml(user.id)}">Redigera</button>
        </div>
      </div>
    `).join('');
    usersList.querySelectorAll('.anvandare-redigera').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        const user = self.users.find(u => u.id === id);
        if (user) self.openUserModal(user);
      });
    });
  }

  async loadLogs() {
    try {
      this.logs = [];
      this.filteredLogs = [];
      this.renderLogs();
      this.populateLogFilters();
    } catch (err) {
      console.error('loadLogs:', err);
    }
  }

  renderLogs() {
    const logsList = document.querySelector('.logs-list');
    if (!logsList) return;
    if (this.logs.length === 0) {
      logsList.innerHTML = '<div class="no-results"><i class="fas fa-clipboard-list"></i><p>Inga aktivitetsloggar tillgängliga.</p></div>';
      return;
    }
    if (this.filteredLogs.length === 0) {
      logsList.innerHTML = '<div class="no-results"><p>Inga loggar med valda filter.</p></div>';
      return;
    }
    logsList.innerHTML = this.filteredLogs.map(log => `
      <div class="log-item">
        <div class="log-time">${escapeHtml(log.time)}</div>
        <div class="log-user">${escapeHtml(log.user)}</div>
        <div class="log-action">${escapeHtml(log.action)}</div>
        <div class="log-details">${escapeHtml(log.details)}</div>
      </div>
    `).join('');
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  const t = document.createElement('textarea');
  t.textContent = s;
  return t.innerHTML;
}

document.addEventListener('DOMContentLoaded', function() {
  new ByraAnvandareManager();
});
