class CustomerManager {
    constructor() {
        this.baseUrl = window.apiConfig ? window.apiConfig.baseUrl : 'http://localhost:3001';
        this.customers = [];
        this.filteredCustomers = [];
        this.init();
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
            const q = e.target.value.toLowerCase();
            this.filteredCustomers = this.customers.filter(c =>
                (c.namn || '').toLowerCase().includes(q) ||
                (c.organisationsnummer || '').toLowerCase().includes(q)
            );
            this.render();
        });

        window.addEventListener('clientflow:authReady', () => this.loadCustomers());
    }

    async loadCustomers() {
        const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
        if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) return;

        try {
            const response = await fetch(`${this.baseUrl}/api/kunddata`, {
                method: 'POST',
                ...opts,
                body: JSON.stringify({})
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const records = (data.success && data.data) ? data.data : [];

            this.customers = records.map(r => ({
                id: r.id,
                namn: r.fields.Namn || r.fields['Företagsnamn'] || 'Namn saknas',
                organisationsnummer: r.fields.Orgnr || r.fields.Organisationsnummer || '',
                bolagsform: r.fields.Bolagsform || '',
            })).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));

            this.filteredCustomers = [...this.customers];
            this.render();

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
                </div>`;
            return;
        }

        list.innerHTML = `
            <div class="kundlista-table">
                ${this.filteredCustomers.map(c => `
                    <div class="kundlista-row" onclick="window.location.href='kundkort.html?id=${c.id}'">
                        <div class="kundlista-row-name">
                            <span class="kundlista-row-icon"><i class="fas fa-building"></i></span>
                            <span class="kundlista-row-namn">${c.namn}</span>
                        </div>
                        <div class="kundlista-row-meta">
                            ${c.organisationsnummer ? `<span class="kundlista-orgnr">${c.organisationsnummer}</span>` : ''}
                            ${c.bolagsform ? `<span class="kundlista-bolagsform">${c.bolagsform}</span>` : ''}
                        </div>
                        <div class="kundlista-row-arrow"><i class="fas fa-chevron-right"></i></div>
                    </div>
                `).join('')}
            </div>`;
    }

    viewCustomer(id) {
        window.location.href = `kundkort.html?id=${encodeURIComponent(id)}`;
    }
}

let customerManager;
document.addEventListener('DOMContentLoaded', () => {
    customerManager = new CustomerManager();
});
