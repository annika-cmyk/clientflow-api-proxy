class CustomerManager {
    constructor() {
        this.baseUrl = window.apiConfig ? window.apiConfig.baseUrl : 'http://localhost:3001';
        this.customers = [];
        this.filteredCustomers = [];
        this.avtalStatusMap = {};
        this.lastQuery = '';
        // Lead och Pågående kund visas som standard, Avslutad döljs tills filtret väljs
        this.activeStatuses = new Set(['Lead', 'Pågående kund']);
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

        window.addEventListener('clientflow:authReady', () => this.loadCustomers());
    }

    applyFilters() {
        const q = (this.lastQuery || '').toLowerCase();
        this.filteredCustomers = this.customers.filter(c => {
            if (!this.activeStatuses.has(c.kundstatus)) return false;
            if (!q) return true;
            const name = (c.namn || '').toLowerCase();
            const org = (c.organisationsnummer || '').toLowerCase();
            const kontakt = (c.kontaktpersoner || '').toLowerCase();
            return name.includes(q) || org.includes(q) || kontakt.includes(q);
        });
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

                return {
                    id: r.id,
                    namn: f.Namn || f['Företagsnamn'] || 'Namn saknas',
                    organisationsnummer: f.Orgnr || f.Organisationsnummer || '',
                    bolagsform: f.Bolagsform || '',
                    kontaktpersoner,
                    kundstatus: this.normalizeStatus(f.Kundstatus),
                    complianceKlar
                };
            }).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));

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
                    <button class="btn btn-primary btn-sm" id="kundlista-bolagsverket-btn" type="button">
                        Sök hos Bolagsverket
                    </button>
                </div>`;
            const btn = document.getElementById('kundlista-bolagsverket-btn');
            if (btn) btn.addEventListener('click', () => this.openBolagsverketModal(this.lastQuery));
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
        // Ta bort ev. befintlig modal
        const existing = document.getElementById('bolagsverket-modal');
        if (existing) {
            existing.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'bolagsverket-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="max-width:1600px; width:98vw; max-height:90vh;">
                <div class="modal-header">
                    <h2>Företagssök hos Bolagsverket</h2>
                    <button class="modal-close" type="button" onclick="document.getElementById('bolagsverket-modal').remove()">
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

                    <section id="company-info" class="company-info-section" style="display: none;">
                        <div class="company-card">
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

        // Koppla händelser till den injicerade sökformen via ClientFlowApp
        if (window.clientFlowApp && typeof window.clientFlowApp.bindEvents === 'function') {
            window.clientFlowApp.bindEvents();
        }

        // Fokusera fältet för org-nummer
        const orgInput = document.getElementById('org-number');
        if (orgInput) {
            const raw = (prefillOrgnr || '').toString().trim();
            const normalized = raw.replace(/\s+/g, '');
            if (normalized) {
                orgInput.value = normalized;
            }
            orgInput.focus();
            try { orgInput.setSelectionRange(orgInput.value.length, orgInput.value.length); } catch (_) {}
        }
    }
}

let customerManager;
document.addEventListener('DOMContentLoaded', () => {
    customerManager = new CustomerManager();
});
