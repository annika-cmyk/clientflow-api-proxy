class CustomerManager {
    constructor() {
        this.baseUrl = window.apiConfig ? window.apiConfig.baseUrl : 'http://localhost:3001';
        this.customers = [];
        this.filteredCustomers = [];
        this.avtalStatusMap = {};
        this.lastQuery = '';
        // Lead och Pågående kund visas som standard, Avslutad döljs tills filtret väljs
        this.activeStatuses = new Set(['Lead', 'Pågående kund']);
        this.viewerRole = '';
        this.riskaptitOnly = false;
        this.init();
    }

    // Normalisera Kundstatus från Airtable till ett av de tre kända värdena.
    // Saknat värde behandlas som "Pågående kund" så befintliga kunder syns som standard.
    normalizeStatus(raw) {
        const v = (raw == null ? '' : String(raw)).trim().toLowerCase();
        if (v === 'lead') return 'Lead';
        if (v === 'avslutad' || v === 'avslutat') return 'Avslutad';
        return 'Pågående kund';
    }

    statusSlug(status) {
        if (status === 'Lead') return 'lead';
        if (status === 'Avslutad') return 'avslutad';
        return 'pagaende';
    }

    init() {
        const isLoggedIn = window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser();
        if (isLoggedIn) {
            this.loadCustomers();
        } else {
            document.getElementById('customer-list').innerHTML = `
                <div class="kundlista-empty">
                    <i class="fas fa-lock"></i>
                    <p>Du måste logga in för att se kundlistan.</p>
                </div>`;
        }

        document.getElementById('search-filter').addEventListener('input', (e) => {
            this.lastQuery = (e.target.value || '').toString();
            this.applyFilters();
        });

        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('click', (e) => {
                const pill = e.target.closest('.status-pill');
                if (!pill) return;
                const status = pill.dataset.status;
                if (this.activeStatuses.has(status)) {
                    this.activeStatuses.delete(status);
                    pill.classList.remove('is-active');
                } else {
                    this.activeStatuses.add(status);
                    pill.classList.add('is-active');
                }
                this.applyFilters();
            });
        }

        const addBtn = document.getElementById('kundlista-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.openAddCompanyModal());
        }

        // Auto-öppna Nytt lead om man kommer från t.ex. ?nyttLead=1
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('nyttLead') === '1' || params.get('nytt-lead') === '1') {
                params.delete('nyttLead');
                params.delete('nytt-lead');
                const qs = params.toString();
                const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
                window.history.replaceState({}, '', next);
                setTimeout(() => this.openAddCompanyModal(), 200);
            }
        } catch (_) { /* ignore */ }

        const riskaptitBtn = document.getElementById('riskaptit-filter-btn');
        if (riskaptitBtn) {
            riskaptitBtn.addEventListener('click', () => {
                this.riskaptitOnly = !this.riskaptitOnly;
                riskaptitBtn.classList.toggle('is-active', this.riskaptitOnly);
                riskaptitBtn.setAttribute('aria-pressed', this.riskaptitOnly ? 'true' : 'false');
                this.applyFilters();
            });
        }

        window.addEventListener('clientflow:authReady', () => this.loadCustomers());
    }

    closeAddCompanyModal() {
        if (window.NyttLead && typeof window.NyttLead.close === 'function') {
            window.NyttLead.close();
            return;
        }
        const existing = document.getElementById('kundlista-add-modal');
        if (existing) existing.remove();
    }

    openAddCompanyModal(prefillName = '') {
        const prefill = (prefillName || this.lastQuery || '').toString();
        if (window.NyttLead && typeof window.NyttLead.open === 'function') {
            window.NyttLead.open(prefill);
            return;
        }
        // Fallback om nytt-lead.js inte hunnit laddas
        this._ensureNyttLead(() => this.openAddCompanyModal(prefill));
    }

    _ensureNyttLead(cb) {
        if (window.NyttLead) {
            cb();
            return;
        }
        if (!document.querySelector('script[src*="nytt-lead.js"]')) {
            const script = document.createElement('script');
            script.src = 'js/nytt-lead.js?v=1.0';
            script.async = false;
            script.onload = () => cb();
            document.body.appendChild(script);
            return;
        }
        const wait = () => {
            if (window.NyttLead) cb();
            else setTimeout(wait, 40);
        };
        wait();
    }

    showAddCompanyError(message) {
        const el = document.getElementById('kundlista-add-error');
        if (!el) return;
        el.textContent = message || 'Något gick fel.';
        el.classList.add('is-visible');
    }

    async createCompanyWithoutOrg() {
        if (window.NyttLead && typeof window.NyttLead.createCompanyWithoutOrg === 'function') {
            return window.NyttLead.createCompanyWithoutOrg();
        }
        this.showAddCompanyError('Kunde inte ladda formuläret. Ladda om sidan och försök igen.');
    }

    updateAccessHint() {
        const el = document.getElementById('kundlista-access-hint');
        if (!el) return;
        const role = String(this.viewerRole || '').trim().toLowerCase();
        if (role === 'ledare' || role === 'clientflowadmin' || role === 'admin') {
            el.textContent = 'Du är ledare och ser alla företag på byrån. En anställd ser bara de företag hen har behörighet till.';
            return;
        }
        if (role === 'anställd' || role === 'anstalld' || role === 'användare' || role === 'anvandare' || role === 'user') {
            el.textContent = 'Du ser bara företag du har behörighet till.';
            return;
        }
        el.textContent = '';
    }

    applyFilters() {
        const q = (this.lastQuery || '').toLowerCase();
        this.filteredCustomers = this.customers.filter(c => {
            if (!this.activeStatuses.has(c.kundstatus)) return false;
            if (this.riskaptitOnly && !c.riskaptitNeedsAction) return false;
            if (!q) return true;
            const name = (c.namn || '').toLowerCase();
            const org = (c.organisationsnummer || '').toLowerCase();
            const kontakt = (c.kontaktpersoner || '').toLowerCase();
            return name.includes(q) || org.includes(q) || kontakt.includes(q);
        });
        const countEl = document.getElementById('riskaptit-count');
        if (countEl) {
            countEl.textContent = String(this.customers.filter((c) => c.riskaptitNeedsAction && this.activeStatuses.has(c.kundstatus)).length);
        }
        this.render();
    }

    async loadCustomers() {
        const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
        if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) return;

        try {
            const [kundRes, avtalRes] = await Promise.all([
                fetch(`${this.baseUrl}/api/kunddata`, {
                    method: 'POST',
                    ...opts,
                    body: JSON.stringify({})
                }),
                fetch(`${this.baseUrl}/api/uppdragsavtal/status-map`, {
                    method: 'GET',
                    ...opts
                }).catch(() => null)
            ]);

            if (!kundRes.ok) throw new Error(`HTTP ${kundRes.status}`);

            const data = await kundRes.json();
            const records = (data.success && data.data) ? data.data : [];
            this.viewerRole = data.userRole || '';
            this.updateAccessHint();

            this.avtalStatusMap = {};
            if (avtalRes?.ok) {
                const avtalData = await avtalRes.json().catch(() => ({}));
                this.avtalStatusMap = avtalData.map || {};
            }

            const compliance = window.KundCompliance;
            this.customers = records.map(r => {
                const f = r.fields || {};

                // Försök plocka ut namn på kontaktpersoner/befattningshavare som en sökbar sträng
                let kontaktpersoner = '';
                const rawKontakt = f['Kontaktpersoner'] || f['Befattningshavare'] || '';
                if (rawKontakt && String(rawKontakt).trim().startsWith('[')) {
                    try {
                        const arr = JSON.parse(rawKontakt);
                        if (Array.isArray(arr)) {
                            kontaktpersoner = arr
                                .map(p => (p.namn || p.name || '').toString().trim())
                                .filter(Boolean)
                                .join(' ');
                        }
                    } catch (_) {
                        // lämna tomt om vi inte kan parsa
                    }
                } else if (rawKontakt) {
                    kontaktpersoner = String(rawKontakt);
                }

                const avtalStatus = this.avtalStatusMap[r.id] || '';
                const complianceKlar = compliance
                    ? compliance.isKundlistaComplianceKlar(f, avtalStatus)
                    : false;
                const riskaptit = (window.Riskaptit && Riskaptit.evaluateCustomer)
                    ? Riskaptit.evaluateCustomer(f)
                    : { needsAction: false, showBanner: false };

                return {
                    id: r.id,
                    namn: f.Namn || f['Företagsnamn'] || 'Namn saknas',
                    organisationsnummer: f.Orgnr || f.Organisationsnummer || '',
                    bolagsform: f.Bolagsform || '',
                    kontaktpersoner,
                    kundstatus: this.normalizeStatus(f.Kundstatus),
                    complianceKlar,
                    riskaptitNeedsAction: !!(riskaptit.needsAction || riskaptit.showBanner),
                    riskaptitStatus: riskaptit.status || ''
                };
            }).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));

            const riskaptitCount = this.customers.filter((c) => c.riskaptitNeedsAction && this.activeStatuses.has(c.kundstatus)).length;
            const countEl = document.getElementById('riskaptit-count');
            if (countEl) countEl.textContent = String(riskaptitCount);

            this.applyFilters();

        } catch (error) {
            console.error('Fel vid laddning av kunder:', error);
            document.getElementById('customer-list').innerHTML = `
                <div class="kundlista-empty">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Kunde inte ladda kunder. Kontrollera anslutningen.</p>
                </div>`;
        }
    }

    render() {
        const list = document.getElementById('customer-list');
        document.getElementById('total-count').textContent = this.filteredCustomers.length;

        if (this.filteredCustomers.length === 0) {
            list.innerHTML = `
                <div class="kundlista-empty">
                    <i class="fas fa-search"></i>
                    <p>Inga kunder matchade sökningen.</p>
                    <div class="kundlista-empty-actions">
                        <button class="btn btn-primary btn-sm" id="kundlista-bolagsverket-btn" type="button">
                            Sök hos Bolagsverket
                        </button>
                        <button class="btn btn-secondary btn-sm" id="kundlista-empty-add-btn" type="button">
                            Lägg till utan org.nr
                        </button>
                    </div>
                </div>`;
            const btn = document.getElementById('kundlista-bolagsverket-btn');
            if (btn) btn.addEventListener('click', () => this.openBolagsverketModal(this.lastQuery));
            const addBtn = document.getElementById('kundlista-empty-add-btn');
            if (addBtn) addBtn.addEventListener('click', () => this.openAddCompanyModal(this.lastQuery));
            return;
        }

        const iconHtml = (c) => {
            if (window.KundCompliance?.kundlistaStatusIconHtml) {
                return window.KundCompliance.kundlistaStatusIconHtml(!!c.complianceKlar);
            }
            return '<span class="kundlista-row-icon kundlista-row-icon--warn" title="Status okänd">' +
                '<i class="fas fa-exclamation-circle" aria-hidden="true"></i></span>';
        };

        list.innerHTML = `
            <div class="kundlista-table">
                ${this.filteredCustomers.map(c => `
                    <div class="kundlista-row" onclick="window.location.href='kundkort.html?id=${c.id}'">
                        <div class="kundlista-row-name">
                            ${iconHtml(c)}
                            <span class="kundlista-row-namn">${c.namn}</span>
                        </div>
                        <div class="kundlista-row-meta">
                            ${c.organisationsnummer ? `<span class="kundlista-orgnr">${c.organisationsnummer}</span>` : ''}
                            ${c.bolagsform ? `<span class="kundlista-bolagsform">${c.bolagsform}</span>` : ''}
                            <span class="kundlista-status kundlista-status--${this.statusSlug(c.kundstatus)}">${c.kundstatus}</span>
                        </div>
                        <div class="kundlista-row-arrow"><i class="fas fa-chevron-right"></i></div>
                    </div>
                `).join('')}
            </div>`;
    }

    viewCustomer(id) {
        window.location.href = `kundkort.html?id=${encodeURIComponent(id)}`;
    }

    openBolagsverketModal(prefillOrgnr = '') {
        if (window.NyttLead && typeof window.NyttLead.openBolagsverketModal === 'function') {
            window.NyttLead.openBolagsverketModal(prefillOrgnr, { autoSearch: !!String(prefillOrgnr || '').trim() });
            return;
        }
        this._ensureNyttLead(() => this.openBolagsverketModal(prefillOrgnr));
    }
}

let customerManager;
document.addEventListener('DOMContentLoaded', () => {
    customerManager = new CustomerManager();
});
