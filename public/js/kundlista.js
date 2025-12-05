class CustomerManager {
    constructor() {
        this.baseUrl = window.apiConfig ? window.apiConfig.baseUrl : 'https://clientflow-api-proxy-1.onrender.com';
        this.customers = [];
        this.filteredCustomers = [];
        this.currentFilters = {
            byra: '',
            user: '',
            search: ''
        };
        this.init();
    }

    init() {
        // Kontrollera om användaren är inloggad innan vi laddar kunder
        this.checkAuthAndLoad();
        this.bindEvents();
    }
    
    checkAuthAndLoad() {
        const authToken = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');
        
        if (authToken && userData) {
            console.log('✅ User authenticated, loading customers...');
            this.loadCustomers();
        } else {
            console.log('❌ User not authenticated, waiting for login...');
            // Visa meddelande om att användaren måste logga in
            const customerList = document.getElementById('customer-list');
            if (customerList) {
                customerList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-lock"></i>
                        <h3>Inloggning krävs</h3>
                        <p>Du måste logga in för att se kundlistan.</p>
                        <button class="btn btn-primary" onclick="window.location.href='index.html'">
                            <i class="fas fa-sign-in-alt"></i>
                            Gå till inloggning
                        </button>
                    </div>
                `;
            }
        }
    }

    bindEvents() {
        // Filter events - automatic filtering like on risk assessment page
        document.getElementById('byra-filter').addEventListener('change', (e) => {
            this.currentFilters.byra = e.target.value;
            this.applyFilters();
        });

        document.getElementById('user-filter').addEventListener('change', (e) => {
            this.currentFilters.user = e.target.value;
            this.applyFilters();
        });

        document.getElementById('search-filter').addEventListener('input', (e) => {
            this.currentFilters.search = e.target.value;
            this.applyFilters();
        });

        // Clear filters button
        document.getElementById('clear-filters').addEventListener('click', () => {
            this.clearFilters();
        });

        // Form submissions
        document.getElementById('add-customer-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addCustomer();
        });

        document.getElementById('edit-customer-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateCustomer();
        });
        
        // Ladda byrå-alternativ när kunder laddas
        this.loadByraOptions();
        
        // Lyssna på när användardata uppdateras (efter inloggning)
        window.addEventListener('storage', (e) => {
            if (e.key === 'authToken' || e.key === 'userData') {
                console.log('🔄 Auth data updated, checking authentication...');
                this.checkAuthAndLoad();
            }
        });
        
        // Kontrollera om användaren redan är inloggad
        if (localStorage.getItem('authToken') && localStorage.getItem('userData')) {
            console.log('🔄 User already authenticated, loading customers...');
            this.loadCustomers();
        }
    }
    
    loadByraOptions() {
        // Hämta unika byrå-ID från kunddata
        const uniqueByra = [...new Set(this.customers.map(c => c.byraId).filter(Boolean))];
        const byraFilter = document.getElementById('byra-filter');
        
        // Behåll "Alla byråer" alternativet
        byraFilter.innerHTML = '<option value="">Alla byråer</option>';
        
        // Lägg till unika byrå-ID
        uniqueByra.forEach(byraId => {
            const option = document.createElement('option');
            option.value = byraId;
            option.textContent = `Byrå ${byraId}`;
            byraFilter.appendChild(option);
        });
    }

    loadUserOptions() {
        // Hämta unika användar-ID från kunddata
        const uniqueUsers = [...new Set(this.customers.map(c => c.anvandareId).filter(Boolean))];
        const userFilter = document.getElementById('user-filter');
        
        // Behåll "Alla användare" alternativet
        userFilter.innerHTML = '<option value="">Alla användare</option>';
        
        // Lägg till unika användar-ID med användarnamn om tillgängligt
        uniqueUsers.forEach(userId => {
            const option = document.createElement('option');
            option.value = userId;
            
            // Försök hitta användarnamn från localStorage eller visa ID
            let userName = `Användare ${userId}`;
            try {
                const userData = JSON.parse(localStorage.getItem('userData'));
                if (userData && userData.id === userId) {
                    userName = userData.name || userData.fields?.FullName || userName;
                }
            } catch (e) {
                console.log('Could not parse user data for display name');
            }
            
            option.textContent = userName;
            userFilter.appendChild(option);
        });
    }

    async loadCustomers() {
        try {
            console.log('🔍 Loading customers from:', `${this.baseUrl}/api/kunddata`);
            
            // Hämta autentiseringstoken från localStorage
            const authToken = localStorage.getItem('authToken');
            if (!authToken) {
                console.error('❌ No auth token found');
                this.showError('Du måste logga in för att se kunder');
                return;
            }
            
            // Använd POST istället för GET för att matcha API:et
            const response = await fetch(`${this.baseUrl}/api/kunddata`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({}) // Tom body för att hämta alla poster
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('📊 Raw customer data:', data);
                
                if (data.success && data.data) {
                    // Konvertera Airtable-format till kundformat
                    this.customers = data.data.map(record => {
                        if (!record.id) {
                            console.warn('⚠️ Customer record missing ID:', record);
                        }
                        return {
                            id: record.id,
                            recordId: record.id, // Alias for compatibility
                            namn: record.fields.Namn || record.fields['Företagsnamn'] || 'Namn saknas',
                            organisationsnummer: record.fields.Orgnr || record.fields.Organisationsnummer || record.fields['Org.nr'] || 'N/A',
                            byraId: record.fields['Byrå ID'] || record.fields.Byrå || 'N/A',
                            anvandareId: record.fields['Användare'] || record.fields.UserID || 'N/A',
                            status: record.fields.Status || 'aktiv',
                            notes: record.fields.Anteckningar || record.fields.Notes || 'Inga anteckningar',
                            timestamp: record.createdTime || new Date().toISOString(),
                            // Nya fält för utökad kundinformation
                            kycUtford: record.fields['KYC utförd'] || record.fields['KYC utförd datum'] || 'N/A',
                            verksamhetsbeskrivning: record.fields.Verksamhetsbeskrivning || 'N/A',
                            adress: record.fields.Adress || 'N/A',
                            telefon: record.fields.Telefon || 'N/A',
                            email: record.fields['E-post'] || record.fields.Email || 'N/A'
                        };
                    });
                } else {
                    console.log('⚠️ No customers in response data');
                    this.customers = [];
                }
                
                console.log('👥 Processed customers:', this.customers);
                
                // Om inga kunder laddades, använd testdata
                if (this.customers.length === 0) {
                    console.log('⚠️ No customers loaded, using test data');
                    this.customers = [
                        {
                            id: 'test1',
                            namn: 'Test Kund 1',
                            organisationsnummer: '123456-7890',
                            byraId: '49',
                            anvandareId: 'test123',
                            status: 'aktiv',
                            notes: 'Detta är en testkund',
                            timestamp: new Date().toISOString(),
                            kycUtford: '2024-01-15',
                            verksamhetsbeskrivning: 'Testverksamhet inom IT-konsultation',
                            adress: 'Testgatan 123, 12345 Teststad',
                            telefon: '08-123 45 67',
                            email: 'info@testkund1.se'
                        },
                        {
                            id: 'test2',
                            namn: 'Test Kund 2',
                            organisationsnummer: '987654-3210',
                            byraId: '49',
                            anvandareId: 'test456',
                            status: 'inaktiv',
                            notes: 'En till testkund',
                            timestamp: new Date().toISOString(),
                            kycUtford: '2024-02-20',
                            verksamhetsbeskrivning: 'Testverksamhet inom redovisning',
                            adress: 'Testvägen 456, 54321 Testort',
                            telefon: '08-987 65 43',
                            email: 'info@testkund2.se'
                        }
                    ];
                }
                
                this.filteredCustomers = [...this.customers];
                this.renderCustomerList();
                this.updateStats();
                
                // Ladda byrå- och användaralternativ efter att kunderna laddats
                this.loadByraOptions();
                this.loadUserOptions();
            } else {
                console.error('Failed to load customers:', response.status);
                const errorData = await response.json().catch(() => ({}));
                console.error('Error details:', errorData);
                
                let errorMessage = 'Kunde inte ladda kunder';
                
                switch (response.status) {
                    case 401:
                        errorMessage = 'Du måste logga in för att se kunder';
                        // Visa inloggningsmeddelande
                        const customerList = document.getElementById('customer-list');
                        if (customerList) {
                            customerList.innerHTML = `
                                <div class="empty-state">
                                    <i class="fas fa-lock"></i>
                                    <h3>Inloggning krävs</h3>
                                    <p>Du måste logga in för att se kundlistan.</p>
                                    <button class="btn btn-primary" onclick="window.location.href='index.html'">
                                        <i class="fas fa-sign-in-alt"></i>
                                        Gå till inloggning
                                    </button>
                                </div>
                            `;
                        }
                        break;
                    case 403:
                        errorMessage = 'Du har inte behörighet att se kunder';
                        break;
                    case 500:
                        errorMessage = 'Serverfel - försök igen senare';
                        break;
                    default:
                        errorMessage = `${errorData.message || response.statusText}`;
                }
                
                this.showError(errorMessage);
            }
        } catch (error) {
            console.error('Error loading customers:', error);
            this.showError('Fel vid laddning av kunder');
            
            // Fallback to test data if API fails
            this.customers = [
                {
                    id: 'test1',
                    namn: 'Test Kund 1',
                    organisationsnummer: '123456-7890',
                    byraId: '49',
                    anvandareId: 'test123',
                    status: 'aktiv',
                    notes: 'Detta är en testkund',
                    timestamp: new Date().toISOString(),
                    kycUtford: '2024-01-15',
                    verksamhetsbeskrivning: 'Testverksamhet inom IT-konsultation',
                    adress: 'Testgatan 123, 12345 Teststad',
                    telefon: '08-123 45 67',
                    email: 'info@testkund1.se'
                },
                {
                    id: 'test2',
                    namn: 'Test Kund 2',
                    organisationsnummer: '987654-3210',
                    byraId: '49',
                    anvandareId: 'test456',
                    status: 'inaktiv',
                    notes: 'En till testkund',
                    timestamp: new Date().toISOString(),
                    kycUtford: '2024-02-20',
                    verksamhetsbeskrivning: 'Testverksamhet inom redovisning',
                    adress: 'Testvägen 456, 54321 Testort',
                    telefon: '08-987 65 43',
                    email: 'info@testkund2.se'
                }
            ];
            this.filteredCustomers = [...this.customers];
            this.renderCustomerList();
            this.updateStats();
            
            // Ladda byrå- och användaralternativ
            this.loadByraOptions();
            this.loadUserOptions();
        }
    }



    applyFilters() {
        this.filteredCustomers = this.customers.filter(customer => {
            let matches = true;

            // Byrå filter
            if (this.currentFilters.byra && customer.byraId !== this.currentFilters.byra) {
                matches = false;
            }

            // Användar filter
            if (this.currentFilters.user && customer.anvandareId !== this.currentFilters.user) {
                matches = false;
            }

            // Search filter (text input for namn/organisationsnummer)
            if (this.currentFilters.search) {
                const searchTerm = this.currentFilters.search.toLowerCase();
                const customerName = (customer.namn || '').toLowerCase();
                const customerOrgNr = (customer.organisationsnummer || '').toLowerCase();
                
                if (!customerName.includes(searchTerm) && !customerOrgNr.includes(searchTerm)) {
                    matches = false;
                }
            }

            return matches;
        });

        this.renderCustomerList();
        this.updateStats();
    }

    clearFilters() {
        this.currentFilters = {
            byra: '',
            user: '',
            search: ''
        };

        // Reset form elements
        document.getElementById('byra-filter').value = '';
        document.getElementById('user-filter').value = '';
        document.getElementById('search-filter').value = '';

        this.filteredCustomers = [...this.customers];
        this.renderCustomerList();
        this.updateStats();
    }

    renderCustomerList() {
        const customerList = document.getElementById('customer-list');
        console.log('🎯 Rendering customer list with', this.filteredCustomers.length, 'customers');
        
        if (this.filteredCustomers.length === 0) {
            console.log('📭 No customers to display, showing empty state');
            customerList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <h3>Inga kunder hittades</h3>
                    <p>Prova att justera dina filter eller lägg till en ny kund.</p>
                    <button class="btn btn-primary" onclick="customerManager.openAddModal()">
                        <i class="fas fa-plus"></i>
                        Lägg till kund
                    </button>
                </div>
            `;
            return;
        }

        const customerItems = this.filteredCustomers.map(customer => this.createCustomerCard(customer)).join('');
        console.log('🔄 Generated HTML for', this.filteredCustomers.length, 'customers');
        
        customerList.innerHTML = `
            <div class="risk-items">
                ${customerItems}
            </div>
        `;

        console.log('✅ Customer list rendered, setting up event listeners');
        // Add event listeners to buttons
        this.setupCustomerItemEventListeners();
    }

    createCustomerCard(customer) {
        console.log('🎨 Creating card for customer:', customer);
        const timestamp = customer.timestamp ? new Date(customer.timestamp).toLocaleDateString('sv-SE') : 'N/A';
        const isActive = customer.status === 'aktiv' || customer.status === 'checked';
        const statusClass = isActive ? 'checked' : 'unchecked';
        console.log('🏷️ Status class:', statusClass, 'for customer:', customer.namn);
        
        return `
            <div class="risk-item ${statusClass}" data-customer-id="${customer.id || customer.recordId}">
                <div class="risk-item-header" onclick="toggleCustomerItem(this)">
                    <div class="risk-item-title">
                        <div class="risk-status-indicator ${statusClass}">
                            ${isActive ? '✓' : '○'}
                        </div>
                        <div class="risk-item-info">
                            <h4 class="risk-task-name">${customer.namn || 'Namn saknas'}</h4>
                            <div class="risk-meta-info">
                                <span class="risk-level-badge">${customer.organisationsnummer || 'Org.nr saknas'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="risk-item-actions">
                        <button class="expand-toggle" onclick="event.stopPropagation(); toggleCustomerItem(this.closest('.risk-item-header'))">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                </div>
                
                <div class="risk-item-content">
                    <div class="risk-content-section">
                        <h5><i class="fas fa-calendar-check"></i> KYC Information</h5>
                        <p class="risk-content-text">
                            Utförd datum: ${customer.kycUtford || 'N/A'}
                        </p>
                    </div>
                    
                    <div class="risk-content-section">
                        <h5><i class="fas fa-briefcase"></i> Verksamhet</h5>
                        <p class="risk-content-text">
                            ${customer.verksamhetsbeskrivning || 'N/A'}
                        </p>
                    </div>
                    
                    <div class="risk-content-section">
                        <h5><i class="fas fa-map-marker-alt"></i> Kontaktinformation</h5>
                        <p class="risk-content-text">
                            Adress: ${customer.adress || 'N/A'}<br>
                            Telefon: ${customer.telefon || 'N/A'}<br>
                            E-post: ${customer.email || 'N/A'}
                        </p>
                    </div>
                </div>
                
                <div class="risk-item-footer">
                    <button class="btn btn-secondary btn-sm view-customer" data-customer-id="${customer.id || customer.recordId || ''}" ${!(customer.id || customer.recordId) ? 'disabled title="Kund-ID saknas"' : ''}>
                        <i class="fas fa-eye"></i>
                        Visa detaljer
                    </button>
                    <button class="btn btn-primary btn-sm edit-customer" data-customer-id="${customer.id || customer.recordId}">
                        <i class="fas fa-edit"></i>
                        Redigera
                    </button>
                    <button class="btn btn-danger btn-sm delete-customer" data-customer-id="${customer.id || customer.recordId}">
                        <i class="fas fa-trash"></i>
                        Ta bort
                    </button>
                </div>
                </div>
            </div>
        `;
    }

    updateStats() {
        const activeCount = document.getElementById('active-count');

        // Count unique byråer
        const uniqueByra = new Set(this.filteredCustomers.map(c => c.byraId).filter(Boolean));
        
        // Count active customers (assuming all are active for now)
        activeCount.textContent = this.filteredCustomers.length;
    }

    openAddModal() {
        document.getElementById('add-customer-modal').style.display = 'block';
        document.getElementById('add-customer-form').reset();
    }

    async addCustomer() {
        const formData = new FormData(document.getElementById('add-customer-form'));
        
        // Använd rätt fältnamn för Airtable
        const customerData = {
            fields: {
                Organisationsnummer: formData.get('org-number'),
                Namn: formData.get('company-name'),
                'Byrå ID': formData.get('byra-id'),
                Användare: formData.get('user-id'),
                Anteckningar: formData.get('notes'),
                Status: 'aktiv',
                Skapad: new Date().toISOString()
            }
        };

        try {
            // För att lägga till en ny kund behöver vi skapa en ny endpoint eller använda Airtable direkt
            // Just nu ska vi bara visa ett meddelande
            this.showSuccess('Funktionalitet för att lägga till kunder kommer snart!');
            this.closeModal('add-customer-modal');
            
            // TODO: Implementera faktisk sparande till Airtable
            // const response = await fetch(`${this.baseUrl}/api/kunddata/create`, {
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json'
            //     },
            //     body: JSON.stringify(customerData)
            // });
            
        } catch (error) {
            console.error('Error adding customer:', error);
            this.showError('Fel vid tillägg av kund');
        }
    }

    async editCustomer(customerId) {
        const customer = this.customers.find(c => c.id === customerId || c.recordId === customerId);
        if (!customer) return;

        // Populate edit form
        document.getElementById('edit-record-id').value = customerId;
        document.getElementById('edit-org-number').value = customer.organisationsnummer || '';
        document.getElementById('edit-company-name').value = customer.namn || '';
        document.getElementById('edit-byra-id').value = customer.byraId || '';
        document.getElementById('edit-user-id').value = customer.anvandareId || '';
        document.getElementById('edit-notes').value = customer.notes || '';

        document.getElementById('edit-customer-modal').style.display = 'block';
    }

    viewCustomer(customerId) {
        // Debug logging
        console.log('🔍 Viewing customer with ID:', customerId);
        console.log('🔍 Customer ID type:', typeof customerId);
        console.log('🔍 Customer ID value:', customerId);
        
        // Validate customer ID
        if (!customerId || customerId === 'null' || customerId === 'undefined' || customerId === null || customerId === undefined) {
            console.error('❌ Invalid customer ID:', customerId);
            this.showError('Ogiltigt kund-ID. Kan inte visa kundkort.');
            return;
        }
        
        // Redirect to customer card page
        window.location.href = `kundkort.html?id=${encodeURIComponent(customerId)}`;
    }

    async updateCustomer() {
        const formData = new FormData(document.getElementById('edit-customer-form'));
        const customerId = formData.get('record-id');
        
        // Använd rätt fältnamn för Airtable
        const customerData = {
            fields: {
                Organisationsnummer: formData.get('org-number'),
                Namn: formData.get('company-name'),
                'Byrå ID': formData.get('byra-id'),
                Användare: formData.get('user-id'),
                Anteckningar: formData.get('notes'),
                Uppdaterad: new Date().toISOString()
            }
        };

        try {
            // För att uppdatera en kund behöver vi skapa en ny endpoint eller använda Airtable direkt
            // Just nu ska vi bara visa ett meddelande
            this.showSuccess('Funktionalitet för att uppdatera kunder kommer snart!');
            this.closeModal('edit-customer-modal');
            
            // TODO: Implementera faktisk uppdatering till Airtable
            // const response = await fetch(`${this.baseUrl}/api/kunddata/${customerId}`, {
            //     method: 'PUT',
            //     headers: {
            //         'Content-Type': 'application/json'
            //     },
            //     body: JSON.stringify(customerData)
            // });
            
        } catch (error) {
            console.error('Error updating customer:', error);
            this.showError('Fel vid uppdatering av kund');
        }
    }



    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    showSuccess(message) {
        // You can implement a toast notification system here
        alert(message);
    }

    toggleCustomerItem(headerElement) {
        const riskItem = headerElement.closest('.risk-item');
        const content = riskItem.querySelector('.risk-item-content');
        const expandToggle = headerElement.querySelector('.expand-toggle i');
        
        if (content.style.display === 'none' || !content.style.display) {
            content.style.display = 'block';
            expandToggle.className = 'fas fa-chevron-up';
        } else {
            content.style.display = 'none';
            expandToggle.className = 'fas fa-chevron-down';
        }
    }

    setupCustomerItemEventListeners() {
        // View customer button
        document.querySelectorAll('.view-customer:not([disabled])').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const customerId = button.getAttribute('data-customer-id');
                if (customerId) {
                    this.viewCustomer(customerId);
                } else {
                    this.showError('Kund-ID saknas för denna kund');
                }
            });
        });

        // Edit customer button
        document.querySelectorAll('.edit-customer').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const customerId = button.getAttribute('data-customer-id');
                this.editCustomer(customerId);
            });
        });

        // Delete customer button
        document.querySelectorAll('.delete-customer').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const customerId = button.getAttribute('data-customer-id');
                this.deleteCustomer(customerId);
            });
        });
    }

    showError(message) {
        // You can implement a toast notification system here
        alert('Fel: ' + message);
    }
}

// Global reference
let customerManager;

// Global functions for modal handling
function closeModal(modalId) {
    customerManager.closeModal(modalId);
}

// Global function for toggling customer items
function toggleCustomerItem(headerElement) {
    console.log('🔍 Toggle function called for:', headerElement);
    
    const riskItem = headerElement.closest('.risk-item');
    const content = riskItem.querySelector('.risk-item-content');
    const expandToggle = headerElement.querySelector('.expand-toggle i');
    
    console.log('🔍 Risk item:', riskItem);
    console.log('🔍 Content element:', content);
    console.log('🔍 Current expanded class:', riskItem.classList.contains('expanded'));
    
    if (riskItem.classList.contains('expanded')) {
        // Collapse
        riskItem.classList.remove('expanded');
        expandToggle.className = 'fas fa-chevron-down';
        console.log('✅ Content collapsed');
    } else {
        // Expand
        riskItem.classList.add('expanded');
        expandToggle.className = 'fas fa-chevron-up';
        console.log('✅ Content expanded');
    }
}

// Initialize customer manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    customerManager = new CustomerManager();
    customerManager.init();
});

// Make CustomerManager available globally for onclick handlers
window.CustomerManager = CustomerManager;
