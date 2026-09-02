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
    this.canManage = false;
    this.viewerRole = '';
    this.customers = [];
    this.selectedUserIds = new Set();
    this.selectedCustomerIds = new Set();
    this.behorighetLoaded = false;
    this.byraInfo = null;
    this.byraId = '';
    this.byraTjanster = [];
    this.prislista = { tjanster: {}, fritext: [] };
    this.uppdragsbrevBilagor = [];
    this.currentTab = 'byra';
    this.hogriskBranschLabels = [];
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.initHogriskBranschMultiSelect()
      .catch((err) => console.warn('Högriskbranscher:', err))
      .finally(() => this.loadByraInfo());
    this.loadUppdragsbrevBilagor();
    this.loadUsers();
    this.loadLogs();
    this.loadUtbildningar();
    this.loadAmlGenomforda();
    this.initializeTabs();
  }

  hogriskBranschOptions() {
    const fromApi = Array.isArray(this.hogriskBranschLabels) ? this.hogriskBranschLabels : [];
    if (fromApi.length) return fromApi;
    const HS = window.HogriskSni;
    const defaults = HS && Array.isArray(HS.DEFAULT_PATTERNS)
      ? HS.DEFAULT_PATTERNS.map((p) => String(p.label || '').trim()).filter(Boolean)
      : [];
    return defaults;
  }

  parseBranschTokens(raw) {
    const text = String(raw || '').trim();
    if (!text || text === 'Inga högriskbranscher') return [];
    const HS = window.HogriskSni;
    const tokens = HS && typeof HS.listLabels === 'function'
      ? HS.listLabels(raw)
      : text.split(/[,;\n]/).map((v) => v.trim()).filter((v) => v && v !== '---');
    return tokens.map((token) => {
      const counted = String(token).trim().match(/^(.+?):\s*\d+\s*$/);
      return counted ? counted[1].trim() : String(token).trim();
    }).filter(Boolean);
  }

  parseBranschCounts(raw) {
    const text = String(raw || '').trim();
    if (!text || text === 'Inga högriskbranscher') return [];
    return text.split(/[,;|]/).map((part) => {
      const counted = String(part).trim().match(/^(.+?):\s*(\d+)\s*$/);
      if (counted) return { form: counted[1].trim(), count: counted[2] };
      const form = String(part).trim();
      return form ? { form, count: '' } : null;
    }).filter(Boolean);
  }

  formatBranschCounts(rows) {
    return (rows || [])
      .map((r) => {
        const form = String(r?.form || '').trim();
        if (!form) return '';
        const count = String(r?.count || '').trim();
        return count ? `${form}: ${count}` : form;
      })
      .filter(Boolean)
      .join(', ');
  }

  foldBranschKey(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  matchSavedBranscherToOptions(raw, options) {
    const tokens = this.parseBranschTokens(raw);
    if (!tokens.length) return [];
    const opts = Array.isArray(options) ? options : [];
    const selected = [];
    const used = new Set();
    tokens.forEach((token) => {
      const key = this.foldBranschKey(token);
      if (!key) return;
      const hit = opts.find((opt) => {
        const ok = this.foldBranschKey(opt);
        return ok === key || ok.includes(key) || key.includes(ok);
      });
      if (hit && !used.has(hit)) {
        used.add(hit);
        selected.push(hit);
      }
    });
    return selected;
  }

  syncHogriskBranschSelection() {
    const list = document.getElementById('byra-branscher-kundstock-list');
    const hidden = document.getElementById('byra-branscher-kundstock');
    const noneCb = document.getElementById('byra-hogrisk-none');
    if (!list || !hidden) return;
    if (noneCb && noneCb.checked) {
      hidden.value = 'Inga högriskbranscher';
      return;
    }
    const kept = new Map(
      this.parseBranschCounts(hidden.value).map((r) => [this.foldBranschKey(r.form), r])
    );
    list.querySelectorAll('.byra-hogrisk-row').forEach((row) => {
      const cb = row.querySelector('input[type="checkbox"]');
      const num = row.querySelector('input[type="number"]');
      if (!cb) return;
      if (num) {
        num.disabled = !cb.checked;
        row.classList.toggle('is-disabled', !cb.checked);
        if (!cb.checked) num.value = '';
      }
      const key = this.foldBranschKey(cb.value);
      if (!cb.checked) {
        kept.delete(key);
        return;
      }
      kept.set(key, { form: cb.value, count: num ? num.value : '' });
    });
    hidden.value = this.formatBranschCounts(Array.from(kept.values()));
  }

  renderHogriskBranschOptions(selectedValues) {
    const list = document.getElementById('byra-branscher-kundstock-list');
    const noneCb = document.getElementById('byra-hogrisk-none');
    const search = document.getElementById('byra-hogrisk-search');
    const head = document.getElementById('byra-hogrisk-head');
    if (!list) return;
    const hidden = document.getElementById('byra-branscher-kundstock');
    const raw = hidden && hidden.value
      ? hidden.value
      : (typeof selectedValues === 'string' ? selectedValues : '');
    const noneSelected = String(raw).trim() === 'Inga högriskbranscher';
    if (noneCb) noneCb.checked = noneSelected;
    if (search) search.hidden = noneSelected;
    if (head) head.hidden = noneSelected;
    if (noneSelected) {
      list.innerHTML = '<p class="form-hint">Avmarkera "Inga högriskbranscher" för att välja branscher.</p>';
      this.syncHogriskBranschSelection();
      return;
    }
    const options = this.hogriskBranschOptions();
    const counts = new Map(
      this.parseBranschCounts(raw).map((r) => [this.foldBranschKey(r.form), r.count])
    );
    const selected = new Set(
      (Array.isArray(selectedValues) ? selectedValues : this.parseBranschTokens(selectedValues || raw))
        .map((v) => this.foldBranschKey(v))
        .filter(Boolean)
    );
    const q = String(search && search.value || '').trim().toLowerCase();
    const items = options.filter((label) => !q || String(label).toLowerCase().includes(q));
    if (!options.length) {
      list.innerHTML = '<p class="form-hint">Inga högriskbranscher tillgängliga.</p>';
      this.syncHogriskBranschSelection();
      return;
    }
    if (!items.length) {
      list.innerHTML = '<p class="form-hint">Inga träffar.</p>';
      return;
    }
    list.innerHTML = items.map((label, idx) => {
      const id = 'byra-hogrisk-bransch-' + idx;
      const key = this.foldBranschKey(label);
      const checked = selected.has(key);
      const count = checked ? (counts.get(key) || '') : '';
      const safeLabel = String(label)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
      return `<div class="byra-hogrisk-row${checked ? '' : ' is-disabled'}">
        <label for="${id}"><input type="checkbox" id="${id}" value="${safeLabel}"${checked ? ' checked' : ''}><span>${safeLabel}</span></label>
        <input type="number" class="form-input" min="0" step="1" placeholder="Antal" value="${count}"${checked ? '' : ' disabled'}>
      </div>`;
    }).join('');
    list.querySelectorAll('input').forEach((el) => {
      el.addEventListener('change', () => this.syncHogriskBranschSelection());
      el.addEventListener('input', () => this.syncHogriskBranschSelection());
    });
    this.syncHogriskBranschSelection();
  }

  async initHogriskBranschMultiSelect() {
    const noneCb = document.getElementById('byra-hogrisk-none');
    const search = document.getElementById('byra-hogrisk-search');
    if (noneCb && !noneCb.dataset.bound) {
      noneCb.dataset.bound = '1';
      noneCb.addEventListener('change', () => {
        const hidden = document.getElementById('byra-branscher-kundstock');
        if (hidden) hidden.value = noneCb.checked ? 'Inga högriskbranscher' : '';
        this.renderHogriskBranschOptions(hidden ? hidden.value : '');
      });
    }
    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      search.addEventListener('input', () => {
        const hidden = document.getElementById('byra-branscher-kundstock');
        this.renderHogriskBranschOptions(hidden ? hidden.value : '');
      });
    }
    const pendingValue = document.getElementById('byra-branscher-kundstock')?.value || '';
    this.renderHogriskBranschOptions(pendingValue);
    try {
      const res = await fetch(getBaseUrl() + '/api/hogrisk-sni', getAuthOpts());
      if (res.ok) {
        const data = await res.json();
        const patterns = Array.isArray(data.patterns) ? data.patterns : [];
        const labels = [];
        const seen = new Set();
        patterns.forEach((p) => {
          const label = String(p && p.label || '').trim();
          const key = this.foldBranschKey(label);
          if (!label || !key || seen.has(key)) return;
          seen.add(key);
          labels.push(label);
        });
        if (labels.length) this.hogriskBranschLabels = labels;
      }
    } catch (err) {
      console.warn('Kunde inte hämta högriskbranscher:', err);
    }
    const current = document.getElementById('byra-branscher-kundstock')?.value || pendingValue;
    const selected = this.matchSavedBranscherToOptions(current, this.hogriskBranschOptions());
    this.renderHogriskBranschOptions(selected.length ? selected : current);
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

    const uppdragsbrevSpara = document.getElementById('byra-uppdragsbrev-spara');
    if (uppdragsbrevSpara) uppdragsbrevSpara.addEventListener('click', () => this.saveUppdragsbrev());

    const priserSpara = document.getElementById('byra-priser-spara');
    if (priserSpara) priserSpara.addEventListener('click', () => this.savePrislista());
    const laggTillFritext = document.getElementById('byra-priser-lagg-till-fritext');
    if (laggTillFritext) laggTillFritext.addEventListener('click', () => this.addFritextRow());

    const addBilagaBtn = document.getElementById('byra-uppdragsbrev-add-bilaga');
    if (addBilagaBtn) {
      addBilagaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openAddBilagaModal();
      });
    }

    // Klickbar logga – ladda upp bild direkt till Airtable
    const logoPreview = document.getElementById('byra-logga-preview');
    const logoFile = document.getElementById('byra-logga-file');
    const openPicker = (e) => {
      if (e) e.preventDefault();
      if (logoFile) logoFile.click();
    };
    if (logoPreview) {
      logoPreview.addEventListener('click', openPicker);
      logoPreview.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openPicker(e);
      });
    }
    if (logoFile) {
      logoFile.addEventListener('change', async () => {
        const file = logoFile.files?.[0];
        // reset så man kan välja samma fil igen
        logoFile.value = '';
        if (!file) return;
        await this.uploadByraLogga(file);
      });
    }

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

    const behUserSearch = document.getElementById('behorighet-user-search');
    if (behUserSearch) behUserSearch.addEventListener('input', () => this.renderBehorighetUsers());
    const behCustomerSearch = document.getElementById('behorighet-customer-search');
    if (behCustomerSearch) behCustomerSearch.addEventListener('input', () => this.renderBehorighetCustomers());
    const behUserAll = document.getElementById('behorighet-user-all');
    if (behUserAll) behUserAll.addEventListener('change', () => this.toggleVisibleBehorighetUsers(behUserAll.checked));
    const behCustomerAll = document.getElementById('behorighet-customer-all');
    if (behCustomerAll) behCustomerAll.addEventListener('change', () => this.toggleVisibleBehorighetCustomers(behCustomerAll.checked));
    const behSpara = document.getElementById('behorighet-spara-btn');
    if (behSpara) behSpara.addEventListener('click', () => this.saveBulkBehorighet());
    this._bindItSystemAnnatToggles();
    this._bindConditionalProfilFields();
    this._renderBolagsformerEditor('');
  }

  _bindConditionalProfilFields() {
    const applies = [];
    document.querySelectorAll('[data-show-when]').forEach((el) => {
      const spec = String(el.getAttribute('data-show-when') || '');
      const sep = spec.lastIndexOf('=');
      if (sep < 1) return;
      const src = document.getElementById(spec.slice(0, sep));
      const expected = spec.slice(sep + 1);
      if (!src) return;
      const apply = () => {
        const show = String(src.value || '') === expected;
        el.hidden = !show;
        if (!show) {
          const input = el.querySelector('textarea, input, select');
          if (input && /^inga$/i.test(String(input.value || '').trim())) input.value = '';
        }
      };
      applies.push(apply);
      if (!src.dataset.showWhenBound) {
        src.dataset.showWhenBound = '1';
        src.addEventListener('change', () => this._applyConditionalProfilFields());
      }
    });
    this._conditionalProfilApplies = applies;
    this._applyConditionalProfilFields();
  }

  _applyConditionalProfilFields() {
    (this._conditionalProfilApplies || []).forEach((fn) => fn());
  }

  _bolagsformerChoices() {
    return [
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
  }

  _matchBolagsform(name) {
    const cleaned = String(name || '').trim().replace(/^(en|ett)\s+/i, '').trim();
    if (!cleaned) return '';
    const aliases = {
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
    const key = cleaned.toLowerCase();
    if (aliases[key]) return aliases[key];
    const exact = this._bolagsformerChoices().find((c) => c.toLowerCase() === key);
    return exact || cleaned;
  }

  _parseBolagsformer(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];
    const parts = text.split(/[,;|]/).flatMap((part) => {
      const chunk = String(part || '').trim();
      if (!chunk) return [];
      if (/:\s*\d+\s*$/.test(chunk)) return [chunk];
      return chunk.split(/\s+och\s+/i).map((s) => s.trim()).filter(Boolean);
    });
    const seen = new Map();
    parts.forEach((part) => {
      const counted = String(part).trim().match(/^(.+?):\s*(\d+)\s*$/);
      const form = this._matchBolagsform(counted ? counted[1] : part);
      if (!form) return;
      const count = counted ? counted[2] : '';
      const key = form.toLowerCase();
      const prev = seen.get(key);
      if (!prev) seen.set(key, { form, count });
      else if (!prev.count && count) prev.count = count;
    });
    return Array.from(seen.values());
  }

  _formatBolagsformer(rows) {
    return (rows || [])
      .map((r) => {
        const form = String(r?.form || '').trim();
        if (!form) return '';
        const count = String(r?.count || '').trim();
        return count ? `${form}: ${count}` : form;
      })
      .filter(Boolean)
      .join(', ');
  }

  _syncBolagsformerFromUi() {
    const list = document.getElementById('byra-bolagsformer-list');
    const hidden = document.getElementById('byra-bolagsformer');
    if (!list || !hidden) return;
    const rows = [];
    list.querySelectorAll('.byra-bolagsformer-row').forEach((row) => {
      const num = row.querySelector('input[type="number"]');
      if (row.classList.contains('is-custom')) {
        const nameEl = row.querySelector('input[type="text"]');
        const form = nameEl ? String(nameEl.value || '').trim() : '';
        const count = num ? String(num.value || '').trim() : '';
        if (form) rows.push({ form, count });
        return;
      }
      const cb = row.querySelector('input[type="checkbox"]');
      if (!cb) return;
      if (num) {
        num.disabled = !cb.checked;
        row.classList.toggle('is-disabled', !cb.checked);
        if (!cb.checked) num.value = '';
      }
      if (!cb.checked) return;
      rows.push({ form: cb.value, count: num ? num.value : '' });
    });
    hidden.value = this._formatBolagsformer(rows);
  }

  _bindBolagsformerRow(row) {
    row.querySelectorAll('input').forEach((el) => {
      el.addEventListener('change', () => this._syncBolagsformerFromUi());
      el.addEventListener('input', () => this._syncBolagsformerFromUi());
    });
    const removeBtn = row.querySelector('.byra-bolagsformer-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
        this._syncBolagsformerFromUi();
      });
    }
  }

  _addCustomBolagsformRow(form = '', count = '') {
    const list = document.getElementById('byra-bolagsformer-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'byra-bolagsformer-row is-custom';
    row.innerHTML = `<input type="text" class="form-input" placeholder="Annan bolagsform" value="${String(form).replace(/"/g, '&quot;')}">
      <input type="number" class="form-input" min="0" step="1" placeholder="Antal" value="${String(count).replace(/"/g, '&quot;')}">
      <button type="button" class="byra-bolagsformer-remove" aria-label="Ta bort form">×</button>`;
    list.appendChild(row);
    this._bindBolagsformerRow(row);
  }

  _renderBolagsformerEditor(raw) {
    const list = document.getElementById('byra-bolagsformer-list');
    const hidden = document.getElementById('byra-bolagsformer');
    const addBtn = document.getElementById('byra-bolagsformer-add');
    if (!list) return;
    const parsed = this._parseBolagsformer(raw);
    const selected = new Map(parsed.map((r) => [String(r.form).toLowerCase(), r.count]));
    const known = this._bolagsformerChoices();
    const knownSet = new Set(known.map((f) => f.toLowerCase()));
    list.innerHTML = known.map((form, idx) => {
      const id = `byra-bolagsformer-${idx}`;
      const count = selected.get(form.toLowerCase()) || '';
      const checked = selected.has(form.toLowerCase());
      return `<div class="byra-bolagsformer-row${checked ? '' : ' is-disabled'}">
        <label for="${id}"><input type="checkbox" id="${id}" value="${form.replace(/"/g, '&quot;')}" ${checked ? 'checked' : ''}><span>${form}</span></label>
        <input type="number" class="form-input" min="0" step="1" placeholder="Antal" value="${count}" ${checked ? '' : 'disabled'}>
      </div>`;
    }).join('');
    list.querySelectorAll('.byra-bolagsformer-row').forEach((row) => this._bindBolagsformerRow(row));
    parsed.filter((r) => r.form && !knownSet.has(String(r.form).toLowerCase())).forEach((r) => {
      this._addCustomBolagsformRow(r.form, r.count);
    });
    if (addBtn && !addBtn.dataset.bound) {
      addBtn.dataset.bound = '1';
      addBtn.addEventListener('click', () => {
        this._addCustomBolagsformRow('', '');
        const last = list.querySelector('.byra-bolagsformer-row.is-custom:last-child input[type="text"]');
        if (last) last.focus();
      });
    }
    this._syncBolagsformerFromUi();
    if (hidden && parsed.length && !list.querySelector('input[type="checkbox"]:checked') && !list.querySelector('.is-custom')) {
      hidden.value = String(raw || '');
    }
  }

  _parseItSystemValues(raw) {
    return String(raw || '')
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  _syncItSystemGroup(group) {
    if (!group) return;
    const hiddenId = group.getAttribute('data-it-hidden');
    const annatId = group.getAttribute('data-annat-target');
    const hidden = hiddenId ? document.getElementById(hiddenId) : null;
    const annat = annatId ? document.getElementById(annatId) : null;
    const selected = Array.from(group.querySelectorAll('input[type="checkbox"]:checked'))
      .map((el) => String(el.value || '').trim())
      .filter(Boolean);
    if (hidden) hidden.value = selected.join(', ');
    const showAnnat = selected.includes('Annat');
    if (annat) {
      annat.hidden = !showAnnat;
      if (!showAnnat) annat.value = '';
    }
  }

  _setItSystemValues(hiddenId, raw) {
    const hidden = document.getElementById(hiddenId);
    const group = document.querySelector('.byra-it-system-checks[data-it-hidden="' + hiddenId + '"]');
    const values = this._parseItSystemValues(raw);
    if (hidden) hidden.value = values.join(', ');
    if (!group) return;
    const selected = new Set(values.map((v) => v.toLowerCase()));
    group.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.checked = selected.has(String(box.value || '').toLowerCase());
    });
    this._syncItSystemGroup(group);
  }

  _syncItSystemAnnatFields() {
    document.querySelectorAll('.byra-it-system-checks').forEach((group) => this._syncItSystemGroup(group));
  }

  _bindItSystemAnnatToggles() {
    document.querySelectorAll('.byra-it-system-checks').forEach((group) => {
      group.querySelectorAll('input[type="checkbox"]').forEach((box) => {
        box.addEventListener('change', () => {
          this._syncItSystemGroup(group);
          const annatId = group.getAttribute('data-annat-target');
          const annat = annatId ? document.getElementById(annatId) : null;
          if (annat && !annat.hidden && box.value === 'Annat' && box.checked) annat.focus();
        });
      });
      this._syncItSystemGroup(group);
    });
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(tabName);
    if (tab) tab.style.display = 'block';
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    this.currentTab = tabName;
    if (tabName === 'behorigheter') this.ensureBehorighetData();
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
      const antalKunder = document.getElementById('byra-antal-kunder');
      if (antalKunder) antalKunder.value = f.antalKunder ?? '';
      this._renderBolagsformerEditor(f.vanligasteBolagsformer ?? '');
      const branscherKundstock = document.getElementById('byra-branscher-kundstock');
      if (branscherKundstock) {
        const raw = String(f.branscherKundstock ?? '').trim();
        branscherKundstock.value = raw;
        const selected = raw === 'Inga högriskbranscher'
          ? []
          : this.matchSavedBranscherToOptions(raw, this.hogriskBranschOptions());
        this.renderHogriskBranschOptions(selected.length ? selected : raw);
      }
      const setVal = (id, value) => {
        const node = document.getElementById(id);
        if (node) node.value = value ?? '';
      };
      setVal('byra-antal-kontor', f.antalKontor);
      this._setItSystemValues('byra-bokforingssystem', f.bokforingssystem);
      setVal('byra-bokforingssystem-annat', f.bokforingssystemAnnat);
      this._setItSystemValues('byra-bokslutssystem', f.bokslutssystem);
      setVal('byra-bokslutssystem-annat', f.bokslutssystemAnnat);
      this._setItSystemValues('byra-kundhanteringssystem', f.kundhanteringssystem);
      setVal('byra-kundhanteringssystem-annat', f.kundhanteringssystemAnnat);
      this._syncItSystemAnnatFields();
      setVal('byra-auktoriserade-konsulter', f.auktoriseradeKonsulter);
      setVal('byra-lopande-utbildning', f.lopandeUtbildning);
      setVal('byra-personalomsattning', f.personalomsattning);
      setVal('byra-andel-hogrisk', f.andelHogriskbransch);
      setVal('byra-andel-kontant', f.andelKontantintensiva);
      setVal('byra-betalningsmonster', f.betalningsmonster);
      setVal('byra-komplexa-agarstrukturer', f.komplexaAgarstrukturer);
      setVal('byra-utlandska-agare', f.utlandskaAgare);
      setVal('byra-pep-kunder', f.pepKunder);
      setVal('byra-leveranssatt', f.leveranssatt);
      setVal('byra-bankid-krav', f.bankIdKrav);
      setVal('byra-kund-gor-lopande', f.kundGorLopande);
      setVal('byra-betalningsuppdrag', f.betalningsuppdrag);
      setVal('byra-bokforingsmetod', f.bokforingsmetod);
      setVal('byra-andel-utland', f.andelInternationellHandel);
      setVal('byra-geografi', f.geografiskMarknad);
      setVal('byra-sanktionslander', f.sanktionslander);
      setVal('byra-kunder-utsatta-omraden', f.kunderIUtsattaOmraden);
      setVal('byra-finanspolisen-antal', f.finanspolisenAvvikelserAntal);
      setVal('byra-finanspolisen-typ', f.finanspolisenAvvikelserTyp);
      setVal('byra-lanstyrelsen-anmarkningar', f.lanstyrelsenAnmarkningar);
      setVal('byra-lanstyrelsen-detalj', f.lanstyrelsenAnmarkningarDetalj);
      setVal('byra-near-misses', f.nearMisses);
      setVal('byra-near-misses-detalj', f.nearMissesDetalj);
      setVal('byra-stora-kundberoenden', f.storaKundberoenden);
      setVal('byra-stora-kundberoenden-andel', f.storaKundberoendenAndel);
      setVal('byra-bolagsbildning', f.bolagsbildningAtKund);
      setVal('byra-styrelse-nominee', f.styrelseEllerNomineeRoller);
      setVal('byra-sate-postadress', f.satePostadress);
      setVal('byra-fullmakt-bolagsverket', f.fullmaktBolagsverket);
      setVal('byra-ombud-skatteprocesser', f.ombudSkatteprocesser);
      setVal('byra-generalfullmakt', f.generalfullmaktMyndighet);
      setVal('byra-kund-introduktion', f.kundIntroduktion);
      setVal('byra-andel-nystartade', f.andelNystartadeBolag);
      setVal('byra-outsourcing', f.outsourcingUnderleverantorer);
      setVal('byra-outsourcing-detalj', f.outsourcingUnderleverantorerDetalj);
      this._applyConditionalProfilFields();
      const komplettEl = document.getElementById('byra-profil-komplett');
      if (komplettEl) {
        const done = !!f.profilKomplett;
        komplettEl.textContent = done ? 'Profil komplett' : 'Ej komplett';
        komplettEl.classList.toggle('is-complete', done);
      }
      const defUpps = document.getElementById('byra-default-uppsagningstid');
      if (defUpps) defUpps.value = f.defaultUppsagningstid ?? '';
      const defFaktura = document.getElementById('byra-default-fakturaperiod');
      if (defFaktura) defFaktura.value = f.defaultFakturaperiod ?? '';
      const defBet = document.getElementById('byra-default-betalningsvillkor');
      if (defBet) defBet.value = f.defaultBetalningsvillkor ?? '';
      const infoText = document.getElementById('byra-uppdragsbrev-informationstext');
      if (infoText) infoText.value = f.uppdragsbrevInformationstext ?? '';
      const loggaUrl = (function () {
        const v = f.logga;
        if (!v) return '';
        if (typeof v === 'string') return v;
        if (Array.isArray(v) && v.length && v[0] && v[0].url) return String(v[0].url);
        if (v && typeof v === 'object' && v.url) return String(v.url);
        return String(v);
      })();
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
      if (v && typeof v === 'object') {
        // se till att visible finns (default true)
        if (v.visible === undefined) v.visible = true;
        continue;
      }
      // om någon råkat spara number/string direkt
      const n = Number(v);
      prislista.tjanster[k] = { pris: Number.isFinite(n) ? n : null, enhet: 'h', visible: true };
    }
    prislista.fritext = (prislista.fritext || []).map(x => ({
      namn: (x?.namn || '').toString(),
      pris: x?.pris != null && x.pris !== '' ? Number(x.pris) : null,
      enhet: (x?.enhet || 'h').toString(),
      visible: x?.visible === undefined ? true : !!x.visible
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
        enhet: v.enhet || 'h',
        visible: v.visible !== false
      };
    };

    // Byråns “systemtjänster”
    if (this.byraTjanster.length) {
      for (const t of this.byraTjanster) {
        const namn = (t.namn || '').trim();
        const pv = priceFor(namn);
        const eyeIcon = pv.visible ? 'fa-eye' : 'fa-eye-slash';
        const eyeTitle = pv.visible ? 'Visas i prislistan i uppdragsavtalet' : 'Dold i prislistan i uppdragsavtalet';
        const eyeCls = pv.visible ? 'byra-prislista-eye' : 'byra-prislista-eye is-hidden';
        rows.push(`
          <div class="byra-prislista-row" data-kind="tjanst" data-namn="${escapeHtml(namn)}" data-visible="${pv.visible ? '1' : '0'}">
            <div><input class="form-input" value="${escapeHtml(namn)}" readonly></div>
            <div><input class="form-input" type="number" inputmode="decimal" placeholder="0" data-field="pris" value="${escapeHtml(pv.pris)}"></div>
            <div>
              <select class="form-select" data-field="enhet">
                ${this._sel(['h','st'], pv.enhet)}
              </select>
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <button type="button" class="${eyeCls}" title="${eyeTitle}" data-action="toggle-visible">
                <i class="fas ${eyeIcon}"></i>
              </button>
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
      const visible = item?.visible !== false;
      const eyeIcon = visible ? 'fa-eye' : 'fa-eye-slash';
      const eyeTitle = visible ? 'Visas i prislistan i uppdragsavtalet' : 'Dold i prislistan i uppdragsavtalet';
      const eyeCls = visible ? 'byra-prislista-eye' : 'byra-prislista-eye is-hidden';
      rows.push(`
        <div class="byra-prislista-row" data-kind="fritext" data-idx="${i}" data-visible="${visible ? '1' : '0'}">
          <div><input class="form-input" placeholder="Tjänst" data-field="namn" value="${escapeHtml(item.namn || '')}"></div>
          <div><input class="form-input" type="number" inputmode="decimal" placeholder="0" data-field="pris" value="${item.pris != null && item.pris !== '' ? escapeHtml(String(item.pris)) : ''}"></div>
          <div>
            <select class="form-select" data-field="enhet">
              ${this._sel(['h','st'], item.enhet || 'h')}
            </select>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button type="button" class="${eyeCls}" title="${eyeTitle}" data-action="toggle-visible">
              <i class="fas ${eyeIcon}"></i>
            </button>
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

    wrap.querySelectorAll('[data-action="toggle-visible"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const row = btn.closest('.byra-prislista-row');
        if (!row) return;
        const cur = row.getAttribute('data-visible') !== '0';
        const next = !cur;
        row.setAttribute('data-visible', next ? '1' : '0');
        const icon = btn.querySelector('i');
        if (icon) {
          icon.classList.toggle('fa-eye', next);
          icon.classList.toggle('fa-eye-slash', !next);
        }
        btn.classList.toggle('is-hidden', !next);
        btn.title = next ? 'Visas i prislistan i uppdragsavtalet' : 'Dold i prislistan i uppdragsavtalet';
      });
    });

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
      const visible = row.getAttribute('data-visible') !== '0';
      if (kind === 'tjanst') {
        const namn = row.getAttribute('data-namn') || '';
        const prisRaw = row.querySelector('[data-field="pris"]')?.value ?? '';
        const enhet = row.querySelector('[data-field="enhet"]')?.value ?? 'månad';
        const pris = prisRaw !== '' ? Number(prisRaw) : null;
        prislista.tjanster[namn] = { pris: Number.isFinite(pris) ? pris : null, enhet, visible };
      } else if (kind === 'fritext') {
        const namn = row.querySelector('[data-field="namn"]')?.value ?? '';
        const prisRaw = row.querySelector('[data-field="pris"]')?.value ?? '';
        const enhet = row.querySelector('[data-field="enhet"]')?.value ?? 'st';
        const pris = prisRaw !== '' ? Number(prisRaw) : null;
        if (namn.trim()) {
          prislista.fritext.push({ namn: namn.trim(), pris: Number.isFinite(pris) ? pris : null, enhet, visible });
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

  validateByraProfilFields() {
    const antalKunderRaw = (document.getElementById('byra-antal-kunder')?.value ?? '').toString().trim();
    if (antalKunderRaw !== '') {
      const n = Number(antalKunderRaw);
      if (!Number.isFinite(n) || n < 0) return 'Antal kunder måste vara 0 eller högre.';
    }
    const checkPercent = (id, label) => {
      const raw = (document.getElementById(id)?.value ?? '').toString().trim();
      if (raw === '') return '';
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) return `${label} måste vara mellan 0 och 100.`;
      return '';
    };
    return checkPercent('byra-andel-utland', 'Andel internationell handel')
      || checkPercent('byra-andel-kontant', 'Andel kontantintensiva kunder')
      || checkPercent('byra-andel-hogrisk', 'Andel kunder i högriskbransch')
      || checkPercent('byra-stora-kundberoenden-andel', 'Andel omsättning från de största kunderna')
      || checkPercent('byra-andel-nystartade', 'Andel nystartade bolag')
      || '';
  }

  async saveByraInfo() {
    const statusEl = document.getElementById('byra-spara-status');
    if (statusEl) statusEl.textContent = 'Sparar...';
    const validationError = this.validateByraProfilFields();
    if (validationError) {
      if (statusEl) statusEl.textContent = validationError;
      return;
    }
    try {
      this._syncBolagsformerFromUi();
      this._syncItSystemAnnatFields();
      this.syncHogriskBranschSelection();
      const body = {
        antalAnstallda: document.getElementById('byra-antal-anstallda')?.value ?? '',
        omsattning: document.getElementById('byra-omsattning')?.value ?? '',
        antalKundforetag: document.getElementById('byra-antal-kundforetag')?.value ?? '',
        bransch: document.getElementById('byra-bransch')?.value ?? '',
        antalKontor: document.getElementById('byra-antal-kontor')?.value ?? '',
        bokforingssystem: document.getElementById('byra-bokforingssystem')?.value ?? '',
        bokforingssystemAnnat: document.getElementById('byra-bokforingssystem-annat')?.value ?? '',
        bokslutssystem: document.getElementById('byra-bokslutssystem')?.value ?? '',
        bokslutssystemAnnat: document.getElementById('byra-bokslutssystem-annat')?.value ?? '',
        kundhanteringssystem: document.getElementById('byra-kundhanteringssystem')?.value ?? '',
        kundhanteringssystemAnnat: document.getElementById('byra-kundhanteringssystem-annat')?.value ?? '',
        auktoriseradeKonsulter: document.getElementById('byra-auktoriserade-konsulter')?.value ?? '',
        lopandeUtbildning: document.getElementById('byra-lopande-utbildning')?.value ?? '',
        personalomsattning: document.getElementById('byra-personalomsattning')?.value ?? '',
        antalKunder: document.getElementById('byra-antal-kunder')?.value ?? '',
        vanligasteBolagsformer: document.getElementById('byra-bolagsformer')?.value ?? '',
        branscherKundstock: document.getElementById('byra-branscher-kundstock')?.value ?? '',
        andelHogriskbransch: document.getElementById('byra-andel-hogrisk')?.value ?? '',
        andelKontantintensiva: document.getElementById('byra-andel-kontant')?.value ?? '',
        betalningsmonster: document.getElementById('byra-betalningsmonster')?.value ?? '',
        komplexaAgarstrukturer: document.getElementById('byra-komplexa-agarstrukturer')?.value ?? '',
        utlandskaAgare: document.getElementById('byra-utlandska-agare')?.value ?? '',
        pepKunder: document.getElementById('byra-pep-kunder')?.value ?? '',
        leveranssatt: document.getElementById('byra-leveranssatt')?.value ?? '',
        bankIdKrav: document.getElementById('byra-bankid-krav')?.value ?? '',
        kundGorLopande: document.getElementById('byra-kund-gor-lopande')?.value ?? '',
        betalningsuppdrag: document.getElementById('byra-betalningsuppdrag')?.value ?? '',
        bokforingsmetod: document.getElementById('byra-bokforingsmetod')?.value ?? '',
        andelInternationellHandel: document.getElementById('byra-andel-utland')?.value ?? '',
        geografiskMarknad: document.getElementById('byra-geografi')?.value ?? '',
        sanktionslander: document.getElementById('byra-sanktionslander')?.value ?? '',
        kunderIUtsattaOmraden: document.getElementById('byra-kunder-utsatta-omraden')?.value ?? '',
        finanspolisenAvvikelserAntal: document.getElementById('byra-finanspolisen-antal')?.value ?? '',
        finanspolisenAvvikelserTyp: document.getElementById('byra-finanspolisen-typ')?.value ?? '',
        lanstyrelsenAnmarkningar: document.getElementById('byra-lanstyrelsen-anmarkningar')?.value ?? '',
        lanstyrelsenAnmarkningarDetalj: document.getElementById('byra-lanstyrelsen-detalj')?.value ?? '',
        nearMisses: document.getElementById('byra-near-misses')?.value ?? '',
        nearMissesDetalj: document.getElementById('byra-near-misses-detalj')?.value ?? '',
        storaKundberoenden: document.getElementById('byra-stora-kundberoenden')?.value ?? '',
        storaKundberoendenAndel: document.getElementById('byra-stora-kundberoenden-andel')?.value ?? '',
        bolagsbildningAtKund: document.getElementById('byra-bolagsbildning')?.value ?? '',
        styrelseEllerNomineeRoller: document.getElementById('byra-styrelse-nominee')?.value ?? '',
        satePostadress: document.getElementById('byra-sate-postadress')?.value ?? '',
        fullmaktBolagsverket: document.getElementById('byra-fullmakt-bolagsverket')?.value ?? '',
        ombudSkatteprocesser: document.getElementById('byra-ombud-skatteprocesser')?.value ?? '',
        generalfullmaktMyndighet: document.getElementById('byra-generalfullmakt')?.value ?? '',
        kundIntroduktion: document.getElementById('byra-kund-introduktion')?.value ?? '',
        andelNystartadeBolag: document.getElementById('byra-andel-nystartade')?.value ?? '',
        outsourcingUnderleverantorer: document.getElementById('byra-outsourcing')?.value ?? '',
        outsourcingUnderleverantorerDetalj: document.getElementById('byra-outsourcing-detalj')?.value ?? ''
      };
      const res = await fetch(getBaseUrl() + '/api/byra/info', getAuthOpts('PUT', body));
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      if (statusEl) statusEl.textContent = j.warning ? ('Sparat med varning: ' + j.warning) : 'Sparat.';
      const komplettEl = document.getElementById('byra-profil-komplett');
      if (komplettEl && j.fields) {
        const done = !!j.fields.profilKomplett;
        komplettEl.textContent = done ? 'Profil komplett' : 'Ej komplett';
        komplettEl.classList.toggle('is-complete', done);
      } else {
        await this.loadByraInfo();
      }
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    } catch (err) {
      console.error('saveByraInfo:', err);
      if (statusEl) statusEl.textContent = 'Fel: ' + (err.message || 'Kunde inte spara.');
    }
  }

  async uploadByraLogga(file) {
    const statusEl = document.getElementById('byra-spara-status');
    const preview = document.getElementById('byra-logga-preview');
    try {
      if (!file) return;
      const isImg = (file.type || '').startsWith('image/');
      if (!isImg) throw new Error('Filen måste vara en bild.');

      if (statusEl) statusEl.textContent = 'Laddar upp logga...';
      if (preview) preview.style.opacity = '0.6';

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Kunde inte läsa fil.'));
        reader.onload = () => {
          const res = String(reader.result || '');
          const comma = res.indexOf(',');
          resolve(comma >= 0 ? res.slice(comma + 1) : res);
        };
        reader.readAsDataURL(file);
      });

      const body = {
        filename: file.name || 'logga.png',
        contentType: file.type || 'image/png',
        fileBase64: base64
      };
      const res = await fetch(getBaseUrl() + '/api/byra/logo', getAuthOpts('POST', body));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);

      // Ladda om byråinfo så preview uppdateras med Airtable-url
      await this.loadByraInfo();
      if (statusEl) statusEl.textContent = 'Logga uppladdad.';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
    } catch (e) {
      console.error('uploadByraLogga:', e);
      if (statusEl) statusEl.textContent = 'Fel: ' + (e.message || 'Kunde inte ladda upp logga.');
    } finally {
      if (preview) preview.style.opacity = '';
    }
  }

  async saveUppdragsbrev() {
    const statusEl = document.getElementById('byra-uppdragsbrev-status');
    const btn = document.getElementById('byra-uppdragsbrev-spara');
    if (statusEl) statusEl.textContent = 'Sparar...';
    if (btn) btn.disabled = true;
    try {
      const body = {};
      const upps = (document.getElementById('byra-default-uppsagningstid')?.value ?? '').toString().trim();
      const fakt = (document.getElementById('byra-default-fakturaperiod')?.value ?? '').toString().trim();
      const bet = (document.getElementById('byra-default-betalningsvillkor')?.value ?? '').toString().trim();
      const infoText = (document.getElementById('byra-uppdragsbrev-informationstext')?.value ?? '');

      if (upps !== '') body.defaultUppsagningstid = upps;
      if (fakt !== '') body.defaultFakturaperiod = fakt;
      if (bet !== '') body.defaultBetalningsvillkor = bet;
      body.uppdragsbrevInformationstext = infoText;
      const res = await fetch(getBaseUrl() + '/api/byra/info', getAuthOpts('PUT', body));
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText || `HTTP ${res.status}`);
      if (statusEl) statusEl.textContent = 'Sparat.';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    } catch (err) {
      console.error('saveUppdragsbrev:', err);
      if (statusEl) statusEl.textContent = 'Fel: ' + (err.message || 'Kunde inte spara.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async loadUppdragsbrevBilagor() {
    const list = document.getElementById('byra-uppdragsbrev-bilagor-list');
    if (!list) return;
    try {
      list.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Laddar bilagor...</div>';
      const res = await fetch(getBaseUrl() + '/api/byra/uppdragsbrev/bilagor', getAuthOpts());
      const data = res.ok ? await res.json() : {};
      if (!res.ok) throw new Error(data.error || res.statusText);
      this.uppdragsbrevBilagor = Array.isArray(data.bilagor) ? data.bilagor : [];
      this.renderUppdragsbrevBilagor();
    } catch (e) {
      console.error('loadUppdragsbrevBilagor:', e);
      list.innerHTML = '<div class="no-results"><i class="fas fa-exclamation-triangle"></i><p>Kunde inte ladda bilagor.</p></div>';
    }
  }

  renderUppdragsbrevBilagor() {
    const list = document.getElementById('byra-uppdragsbrev-bilagor-list');
    if (!list) return;
    const bilagor = Array.isArray(this.uppdragsbrevBilagor) ? this.uppdragsbrevBilagor : [];
    const max = 6;
    const limitEl = document.getElementById('byra-uppdragsbrev-bilagor-limit');
    const addBtn = document.getElementById('byra-uppdragsbrev-add-bilaga');
    if (limitEl) limitEl.textContent = `${bilagor.length}/${max} bilagor`;
    if (addBtn) addBtn.disabled = bilagor.length >= max;
    if (!bilagor.length) {
      list.innerHTML = '<p style="margin:0;color:#64748b;">Inga bilagor uppladdade.</p>';
      return;
    }
    list.innerHTML = bilagor.map((b) => {
      const label = (b.label || '').toString().trim();
      const name = label || (b.filename || b.name || 'Bilaga');
      const url = b.url || '';
      const id = b.id || '';
      const removeBtn = `<button type="button" class="byra-bilaga-remove" title="Ta bort" aria-label="Ta bort" data-action="remove-bilaga" data-id="${escapeHtml(id)}"><i class="fa-solid fa-trash-can"></i></button>`;
      const title = url
        ? `<a class="byra-bilaga-title byra-bilaga-title-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`
        : `<div class="byra-bilaga-title">${escapeHtml(name)}</div>`;
      return `
        <div class="byra-bilaga-item">
          <div class="byra-bilaga-left">
            <div class="byra-bilaga-ic"><i class="fas fa-paperclip"></i></div>
            <div class="byra-bilaga-meta">
              ${title}
            </div>
          </div>
          <div class="byra-bilaga-actions">
            ${removeBtn}
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-action="remove-bilaga"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        if (!id) return;
        await this.deleteUppdragsbrevBilaga(id);
      });
    });
  }

  openAddBilagaModal() {
    const existing = document.getElementById('byra-uppdragsbrev-bilaga-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'byra-uppdragsbrev-bilaga-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:720px;width:96vw;">
        <div class="modal-header">
          <h2>Lägg till bilaga</h2>
          <button class="modal-close" type="button" data-action="close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <p class="dashboard-card-desc" style="margin-top:0;">
            Ladda upp en PDF och ge den ett eget namn (t.ex. “Allmänna villkor”). Max 6 bilagor.
          </p>
          <div class="form-grid">
            <div class="form-group full-width">
              <label>Namn *</label>
              <input type="text" id="byra-bilaga-namn" class="form-input" placeholder="T.ex. Allmänna villkor">
            </div>
            <div class="form-group full-width">
              <label>PDF *</label>
              <input type="file" id="byra-bilaga-fil" class="form-input" accept="application/pdf,.pdf">
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" data-action="close">Avbryt</button>
            <button type="button" class="btn-primary" id="byra-bilaga-spara">
              <i class="fas fa-upload"></i> Ladda upp
            </button>
            <span class="byra-spara-status" id="byra-bilaga-status"></span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelectorAll('[data-action="close"]').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); close(); }));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    const nameEl = modal.querySelector('#byra-bilaga-namn');
    const fileEl = modal.querySelector('#byra-bilaga-fil');
    const saveBtn = modal.querySelector('#byra-bilaga-spara');
    const statusEl = modal.querySelector('#byra-bilaga-status');
    if (nameEl) nameEl.focus();

    const submit = async () => {
      const label = (nameEl?.value || '').toString().trim();
      const file = fileEl?.files?.[0];
      if (!label) { if (statusEl) statusEl.textContent = 'Ange namn.'; return; }
      if (!file) { if (statusEl) statusEl.textContent = 'Välj en PDF.'; return; }
      const isPdf = (file.type === 'application/pdf') || (file.name || '').toLowerCase().endsWith('.pdf');
      if (!isPdf) { if (statusEl) statusEl.textContent = 'Filen måste vara en PDF.'; return; }

      if (saveBtn) saveBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Laddar upp...';
      try {
        await this.uploadUppdragsbrevBilaga({ file, label });
        close();
      } catch (e) {
        if (statusEl) statusEl.textContent = 'Fel: ' + (e.message || 'Kunde inte ladda upp.');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };

    if (saveBtn) saveBtn.addEventListener('click', (e) => { e.preventDefault(); submit(); });
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && (e.target === nameEl || e.target === fileEl)) {
        e.preventDefault();
        submit();
      }
    });
  }

  async uploadUppdragsbrevBilaga({ file, label }) {
    const statusEl = document.getElementById('byra-uppdragsbrev-bilagor-status');
    if (statusEl) statusEl.textContent = 'Laddar upp...';
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Kunde inte läsa filen'));
        reader.onload = () => {
          const result = reader.result || '';
          const str = String(result);
          const commaIdx = str.indexOf(',');
          resolve(commaIdx >= 0 ? str.slice(commaIdx + 1) : str);
        };
        reader.readAsDataURL(file);
      });
      const body = {
        originalFilename: file.name,
        label,
        contentType: file.type || 'application/octet-stream',
        base64
      };
      const res = await fetch(getBaseUrl() + '/api/byra/uppdragsbrev/bilagor', getAuthOpts('POST', body));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      // Backend returnerar uppdaterad lista
      this.uppdragsbrevBilagor = Array.isArray(data.bilagor) ? data.bilagor : this.uppdragsbrevBilagor;
      this.renderUppdragsbrevBilagor();
      if (statusEl) statusEl.textContent = 'Uppladdat.';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
    } catch (e) {
      console.error('uploadUppdragsbrevBilaga:', e);
      if (statusEl) statusEl.textContent = 'Fel: ' + (e.message || 'Kunde inte ladda upp.');
      throw e;
    }
  }

  async deleteUppdragsbrevBilaga(attachmentId) {
    const statusEl = document.getElementById('byra-uppdragsbrev-bilagor-status');
    if (statusEl) statusEl.textContent = 'Tar bort...';
    try {
      const res = await fetch(getBaseUrl() + '/api/byra/uppdragsbrev/bilagor/' + encodeURIComponent(attachmentId), getAuthOpts('DELETE'));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      this.uppdragsbrevBilagor = Array.isArray(data.bilagor) ? data.bilagor : [];
      this.renderUppdragsbrevBilagor();
      if (statusEl) statusEl.textContent = 'Borttagen.';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    } catch (e) {
      console.error('deleteUppdragsbrevBilaga:', e);
      if (statusEl) statusEl.textContent = 'Fel: ' + (e.message || 'Kunde inte ta bort.');
    }
  }

  displayRole(role) {
    const r = String(role || '').trim();
    if (!r || r === 'Användare' || r === 'anvandare' || r === 'user') return 'Anställd';
    return r;
  }

  updateManageUi() {
    const btn = document.getElementById('anvandare-skapa-btn');
    if (btn) btn.hidden = !this.canManage;
  }

  updateUserCount() {
    const el = document.getElementById('anvandare-antal');
    if (!el) return;
    const total = this.users.length;
    const shown = this.filteredUsers.length;
    if (!total) {
      el.textContent = 'Inga användare hittades på byrån.';
      return;
    }
    if (shown !== total) {
      el.textContent = shown + ' av ' + total + ' personer på byrån';
      return;
    }
    el.textContent = total === 1 ? '1 person på byrån' : total + ' personer på byrån';
  }

  async loadUsers() {
    const list = document.querySelector('.users-list');
    if (list) list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Laddar användare...</p></div>';
    try {
      const res = await fetch(getBaseUrl() + '/api/byra/anvandare', getAuthOpts());
      if (!res.ok) throw new Error(res.statusText || 'Kunde inte hämta användare');
      const data = await res.json();
      this.canManage = !!data.canManage;
      this.viewerRole = data.viewerRole || '';
      this.users = (data.users || []).map(u => ({
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        role: this.displayRole(u.role),
        status: 'Aktiv',
        lastLogin: '—',
        byra: u.byra || ''
      }));
      this.filteredUsers = [...this.users];
      this.updateManageUi();
      this.renderUsers();
      this.populateUserFilters();
      this.populateUtbildningAnstalldList();
      if (this.currentTab === 'behorigheter') this.ensureBehorighetData();
    } catch (err) {
      console.error('loadUsers:', err);
      this.updateUserCount();
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
      rollEl.value = user.role === 'Användare' ? 'Anställd' : (user.role || 'Anställd');
      passwordEl.value = '';
      if (passwordWrap) passwordWrap.style.display = 'block';
    } else {
      title.textContent = 'Lägg till användare';
      idEl.value = '';
      emailEl.value = '';
      emailEl.readOnly = false;
      namnEl.value = '';
      rollEl.value = 'Anställd';
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
      const anstalld = u.anstalld ? `<strong>${escapeHtml(u.anstalld)}</strong> — ` : '';
      const intyg = u.kursintygUrl
        ? ` • <a href="${escapeHtml(u.kursintygUrl)}" target="_blank" rel="noopener">Kursintyg</a>`
        : '';
      return `<div class="utbildning-item">${anstalld}<strong>${escapeHtml(u.namn)}</strong> — ${datum}${u.typ ? ' • ' + escapeHtml(u.typ) : ''}${intyg}${u.beskrivning ? '<br><small>' + escapeHtml(u.beskrivning) + '</small>' : ''}</div>`;
    }).join('');
  }

  populateUtbildningAnstalldList() {
    const datalist = document.getElementById('utbildning-anstalld-list');
    if (!datalist) return;
    const names = (this.users || [])
      .map((u) => (u.name || u.email || '').trim())
      .filter(Boolean);
    datalist.innerHTML = [...new Set(names)].map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
  }

  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('Kunde inte läsa filen'));
      reader.readAsDataURL(file);
    });
  }

  async saveUtbildning() {
    const statusEl = document.getElementById('utbildning-form-status');
    const namn = document.getElementById('utbildning-namn')?.value?.trim();
    const anstalld = document.getElementById('utbildning-anstalld')?.value?.trim();
    if (!namn || !anstalld) return;
    if (statusEl) statusEl.textContent = 'Sparar...';
    try {
      const body = {
        namn,
        anstalld,
        datum: document.getElementById('utbildning-datum')?.value || undefined,
        typ: document.getElementById('utbildning-typ')?.value || undefined,
        beskrivning: document.getElementById('utbildning-beskrivning')?.value || undefined
      };
      const fileInput = document.getElementById('utbildning-intyg');
      const file = fileInput?.files?.[0];
      if (file) {
        body.base64 = await this.readFileAsBase64(file);
        body.originalFilename = file.name;
        body.contentType = file.type || 'application/octet-stream';
      }
      const res = await fetch(getBaseUrl() + '/api/byra/utbildningar', getAuthOpts('POST', body));
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      document.getElementById('utbildning-namn').value = '';
      document.getElementById('utbildning-anstalld').value = '';
      document.getElementById('utbildning-datum').value = '';
      document.getElementById('utbildning-typ').value = '';
      document.getElementById('utbildning-beskrivning').value = '';
      if (fileInput) fileInput.value = '';
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
      [...new Set(this.users.map(u => u.name))].sort((a, b) => String(a).localeCompare(String(b), 'sv')).forEach(name => {
        userFilter.innerHTML += '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
      });
    }
    const roleFilter = document.getElementById('role-filter');
    if (roleFilter) {
      const roleRank = (role) => {
        if (role === 'Ledare') return 0;
        if (role === 'Anställd') return 1;
        return 2;
      };
      const roles = [...new Set(this.users.map(u => this.displayRole(u.role)))].sort((a, b) => {
        const d = roleRank(a) - roleRank(b);
        return d !== 0 ? d : String(a).localeCompare(String(b), 'sv');
      });
      roleFilter.innerHTML = '<option value="">Alla roller</option>';
      roles.forEach(role => {
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
    this.updateUserCount();
    if (this.users.length === 0) {
      usersList.innerHTML = '<div class="no-results"><i class="fas fa-users"></i><p>Inga användare hittades på byrån.</p></div>';
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
          <span class="user-role">${escapeHtml(this.displayRole(user.role))}</span>
        </div>
        <div class="user-status">
          <span class="status aktiv">${escapeHtml(user.status)}</span>
          <span class="last-login">${escapeHtml(user.lastLogin)}</span>
        </div>
        <div class="user-actions">
          ${this.canManage ? `<button type="button" class="btn-secondary anvandare-foretag" data-id="${escapeHtml(user.id)}">Företag</button>` : ''}
          ${this.canManage ? `<button type="button" class="btn-secondary anvandare-redigera" data-id="${escapeHtml(user.id)}">Redigera</button>` : ''}
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
    usersList.querySelectorAll('.anvandare-foretag').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        self.openBulkBehorighetForUser(id);
      });
    });
  }

  parseCustomerAnvandareIds(value) {
    if (value == null || value === '') return [];
    if (Array.isArray(value)) return value.flatMap((v) => this.parseCustomerAnvandareIds(v));
    return String(value).split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  }

  customerMatchesSearch(customer, q) {
    if (!q) return true;
    const hay = `${customer.namn} ${customer.orgnr}`.toLowerCase();
    return hay.includes(q);
  }

  userMatchesSearch(user, q) {
    if (!q) return true;
    const hay = `${user.name} ${user.email} ${user.role}`.toLowerCase();
    return hay.includes(q);
  }

  visibleBehorighetUsers() {
    const q = (document.getElementById('behorighet-user-search')?.value || '').trim().toLowerCase();
    return this.users.filter((u) => this.userMatchesSearch(u, q));
  }

  visibleBehorighetCustomers() {
    const q = (document.getElementById('behorighet-customer-search')?.value || '').trim().toLowerCase();
    return this.customers.filter((c) => this.customerMatchesSearch(c, q));
  }

  updateBehorighetCounts() {
    const userEl = document.getElementById('behorighet-user-count');
    const custEl = document.getElementById('behorighet-customer-count');
    if (userEl) userEl.textContent = this.selectedUserIds.size + ' valda';
    if (custEl) custEl.textContent = this.selectedCustomerIds.size + ' valda';
  }

  customerAlreadyHasSelectedUsers(customer) {
    if (!this.selectedUserIds.size) return false;
    const have = new Set(customer.anvandareIds || []);
    for (const id of this.selectedUserIds) {
      if (!have.has(id)) return false;
    }
    return true;
  }

  renderBehorighetUsers() {
    const list = document.getElementById('behorighet-user-list');
    if (!list) return;
    const rows = this.visibleBehorighetUsers();
    if (!this.users.length) {
      list.innerHTML = '<p class="dashboard-card-desc">Inga användare att visa.</p>';
      this.updateBehorighetCounts();
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<p class="dashboard-card-desc">Inga användare matchar sökningen.</p>';
      this.updateBehorighetCounts();
      return;
    }
    list.innerHTML = rows.map((user) => `
      <label class="behorighet-pick-row">
        <input type="checkbox" class="behorighet-user-cb" value="${escapeHtml(user.id)}" ${this.selectedUserIds.has(user.id) ? 'checked' : ''}>
        <span class="behorighet-pick-meta">
          <strong>${escapeHtml(user.name)}</strong>
          <small>${escapeHtml(user.email)} · ${escapeHtml(this.displayRole(user.role))}</small>
        </span>
      </label>
    `).join('');
    list.querySelectorAll('.behorighet-user-cb').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) this.selectedUserIds.add(cb.value);
        else this.selectedUserIds.delete(cb.value);
        this.updateBehorighetCounts();
        this.renderBehorighetCustomers();
      });
    });
    const all = document.getElementById('behorighet-user-all');
    if (all) all.checked = rows.length > 0 && rows.every((u) => this.selectedUserIds.has(u.id));
    this.updateBehorighetCounts();
  }

  renderBehorighetCustomers() {
    const list = document.getElementById('behorighet-customer-list');
    if (!list) return;
    const rows = this.visibleBehorighetCustomers();
    if (!this.customers.length) {
      list.innerHTML = '<p class="dashboard-card-desc">Inga företag att visa.</p>';
      this.updateBehorighetCounts();
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<p class="dashboard-card-desc">Inga företag matchar sökningen.</p>';
      this.updateBehorighetCounts();
      return;
    }
    list.innerHTML = rows.map((c) => {
      const already = this.customerAlreadyHasSelectedUsers(c);
      return `
      <label class="behorighet-pick-row">
        <input type="checkbox" class="behorighet-customer-cb" value="${escapeHtml(c.id)}" ${this.selectedCustomerIds.has(c.id) ? 'checked' : ''}>
        <span class="behorighet-pick-meta">
          <strong>${escapeHtml(c.namn)}</strong>
          <small>${escapeHtml(c.orgnr || 'Orgnr saknas')}${already ? ' · <span class="har-redan">har redan</span>' : ''}</small>
        </span>
      </label>`;
    }).join('');
    list.querySelectorAll('.behorighet-customer-cb').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) this.selectedCustomerIds.add(cb.value);
        else this.selectedCustomerIds.delete(cb.value);
        this.updateBehorighetCounts();
      });
    });
    const all = document.getElementById('behorighet-customer-all');
    if (all) all.checked = rows.length > 0 && rows.every((c) => this.selectedCustomerIds.has(c.id));
    this.updateBehorighetCounts();
  }

  toggleVisibleBehorighetUsers(checked) {
    this.visibleBehorighetUsers().forEach((u) => {
      if (checked) this.selectedUserIds.add(u.id);
      else this.selectedUserIds.delete(u.id);
    });
    this.renderBehorighetUsers();
    this.renderBehorighetCustomers();
  }

  toggleVisibleBehorighetCustomers(checked) {
    this.visibleBehorighetCustomers().forEach((c) => {
      if (checked) this.selectedCustomerIds.add(c.id);
      else this.selectedCustomerIds.delete(c.id);
    });
    this.renderBehorighetCustomers();
  }

  setBehorighetStatus(text) {
    const el = document.getElementById('behorighet-status');
    if (el) el.textContent = text || '';
  }

  async ensureBehorighetData() {
    const gate = document.getElementById('behorighet-gate');
    const bulk = document.getElementById('behorighet-bulk');
    if (!this.canManage) {
      if (gate) gate.hidden = false;
      if (bulk) bulk.hidden = true;
      return;
    }
    if (gate) gate.hidden = true;
    if (bulk) bulk.hidden = false;
    this.renderBehorighetUsers();
    if (this.behorighetLoaded) {
      this.renderBehorighetCustomers();
      return;
    }
    const list = document.getElementById('behorighet-customer-list');
    if (list) list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Laddar företag...</p></div>';
    try {
      const res = await fetch(getBaseUrl() + '/api/kunddata', getAuthOpts());
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || res.statusText);
      this.customers = (data.records || []).map((r) => {
        const f = r.fields || {};
        return {
          id: r.id,
          namn: f.Namn || f['Företagsnamn'] || f.Email || r.id,
          orgnr: f.Orgnr || f.Organisationsnummer || '',
          anvandareIds: this.parseCustomerAnvandareIds(f['Användare'])
        };
      }).sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));
      this.behorighetLoaded = true;
      this.renderBehorighetCustomers();
    } catch (err) {
      console.error('ensureBehorighetData:', err);
      if (list) list.innerHTML = '<div class="no-results"><i class="fas fa-exclamation-triangle"></i><p>Kunde inte ladda företag.</p></div>';
    }
  }

  openBulkBehorighetForUser(userId) {
    this.selectedUserIds = new Set(userId ? [userId] : []);
    this.switchTab('behorigheter');
  }

  async saveBulkBehorighet() {
    const statusEl = document.getElementById('behorighet-status');
    const btn = document.getElementById('behorighet-spara-btn');
    const userIds = [...this.selectedUserIds];
    const customerIds = [...this.selectedCustomerIds];
    if (!userIds.length) {
      this.setBehorighetStatus('Välj minst en användare.');
      return;
    }
    if (!customerIds.length) {
      this.setBehorighetStatus('Välj minst ett företag.');
      return;
    }
    if (btn) btn.disabled = true;
    this.setBehorighetStatus('Sparar behörigheter...');
    try {
      const res = await fetch(getBaseUrl() + '/api/byra/kundbehorigheter/bulk', getAuthOpts('POST', {
        userIds,
        customerIds,
        mode: 'merge'
      }));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const parts = [];
      parts.push(data.updated === 1 ? '1 företag uppdaterat' : `${data.updated || 0} företag uppdaterade`);
      if (data.unchanged) parts.push(`${data.unchanged} hade redan behörigheten`);
      if (data.denied) parts.push(`${data.denied} hoppades över`);
      if (data.errors?.length) parts.push(`${data.errors.length} fel`);
      this.setBehorighetStatus(parts.join('. ') + '.');
      this.behorighetLoaded = false;
      await this.ensureBehorighetData();
      if (statusEl) setTimeout(() => { if (statusEl.textContent === parts.join('. ') + '.') statusEl.textContent = ''; }, 6000);
    } catch (err) {
      console.error('saveBulkBehorighet:', err);
      this.setBehorighetStatus('Fel: ' + (err.message || 'Kunde inte spara.'));
    } finally {
      if (btn) btn.disabled = false;
    }
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
