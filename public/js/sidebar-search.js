class SidebarCustomerSearch {
    constructor(root) {
        this.root = root;
        this.input = root.querySelector('#sidebar-search-input');
        this.resultsEl = root.querySelector('#sidebar-search-results');
        this.baseUrl = window.apiConfig ? window.apiConfig.baseUrl : 'https://clientflow-api-proxy-1.onrender.com';
        this.customers = [];
        this.loading = false;
        this.loaded = false;
        this.maxResults = 10;
        this.init();
    }

    init() {
        if (!this.input || !this.resultsEl) return;

        this.input.addEventListener('input', () => this.onInput());
        this.input.addEventListener('focus', () => this.onFocus());
        this.input.addEventListener('keydown', (e) => this.onKeydown(e));

        document.addEventListener('click', (e) => {
            if (!this.root.contains(e.target)) this.closeResults();
        });

        window.addEventListener('clientflow:authReady', () => this.ensureCustomersLoaded());
        if (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) {
            this.ensureCustomersLoaded();
        }
    }

    async ensureCustomersLoaded() {
        if (this.loaded || this.loading) return;
        if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) return;

        this.loading = true;
        const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        };

        try {
            const res = await fetch(`${this.baseUrl}/api/kunddata`, {
                method: 'POST',
                ...opts,
                body: JSON.stringify({})
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            const records = (data.success && data.data) ? data.data : [];
            this.customers = records.map(r => this.mapCustomer(r)).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
            this.loaded = true;
        } catch (err) {
            console.error('Sidebar search: kunde inte ladda kunder', err);
        } finally {
            this.loading = false;
            if (this.input.value.trim()) this.renderResults();
        }
    }

    mapCustomer(record) {
        const f = record.fields || {};
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
            } catch (_) { /* ignore */ }
        } else if (rawKontakt) {
            kontaktpersoner = String(rawKontakt);
        }

        return {
            id: record.id,
            namn: f.Namn || f['Företagsnamn'] || 'Namn saknas',
            organisationsnummer: f.Orgnr || f.Organisationsnummer || '',
            kontaktpersoner
        };
    }

    onFocus() {
        this.ensureCustomersLoaded();
        if (this.input.value.trim()) this.renderResults();
    }

    onInput() {
        this.ensureCustomersLoaded();
        this.renderResults();
    }

    onKeydown(e) {
        if (e.key === 'Escape') {
            this.closeResults();
            this.input.blur();
            return;
        }

        const items = Array.from(this.resultsEl.querySelectorAll('[role="option"]'));
        if (!items.length) return;

        const active = this.resultsEl.querySelector('[role="option"].is-active');
        let index = active ? items.indexOf(active) : -1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            index = Math.min(index + 1, items.length - 1);
            this.setActiveItem(items, index);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            index = Math.max(index - 1, 0);
            this.setActiveItem(items, index);
        } else if (e.key === 'Enter' && active) {
            e.preventDefault();
            this.navigateToCustomer(active.dataset.id);
        }
    }

    setActiveItem(items, index) {
        items.forEach((item, i) => item.classList.toggle('is-active', i === index));
        if (items[index]) items[index].scrollIntoView({ block: 'nearest' });
    }

    filterCustomers(query) {
        const q = query.toLowerCase();
        return this.customers.filter(c => {
            const name = (c.namn || '').toLowerCase();
            const org = (c.organisationsnummer || '').toLowerCase();
            const kontakt = (c.kontaktpersoner || '').toLowerCase();
            return name.includes(q) || org.includes(q) || kontakt.includes(q);
        });
    }

    renderResults() {
        const query = (this.input.value || '').trim();
        if (!query) {
            this.closeResults();
            return;
        }

        if (this.loading) {
            this.openResults('<div class="sidebar-search-empty">Laddar kunder...</div>');
            return;
        }

        const matches = this.filterCustomers(query).slice(0, this.maxResults);
        if (!matches.length) {
            this.openResults('<div class="sidebar-search-empty">Inga kunder matchade sökningen.</div>');
            return;
        }

        const html = matches.map(c => {
            const org = c.organisationsnummer
                ? `<span class="sidebar-search-result-org">${this.escapeHtml(c.organisationsnummer)}</span>`
                : '';
            return `<button type="button" class="sidebar-search-result" role="option" data-id="${this.escapeHtml(c.id)}">
                <span class="sidebar-search-result-name">${this.escapeHtml(c.namn)}</span>
                ${org}
            </button>`;
        }).join('');

        this.openResults(html);
        this.resultsEl.querySelectorAll('.sidebar-search-result').forEach(btn => {
            btn.addEventListener('click', () => this.navigateToCustomer(btn.dataset.id));
        });
    }

    openResults(html) {
        this.resultsEl.innerHTML = html;
        this.resultsEl.hidden = false;
        this.input.setAttribute('aria-expanded', 'true');
    }

    closeResults() {
        this.resultsEl.innerHTML = '';
        this.resultsEl.hidden = true;
        this.input.setAttribute('aria-expanded', 'false');
    }

    navigateToCustomer(id) {
        if (!id) return;
        window.location.href = `kundkort.html?id=${encodeURIComponent(id)}`;
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

window.initSidebarCustomerSearch = function (sidebarElement) {
    const root = sidebarElement.querySelector('#sidebar-customer-search');
    if (!root || root.dataset.initialized === '1') return;
    root.dataset.initialized = '1';
    new SidebarCustomerSearch(root);
};
