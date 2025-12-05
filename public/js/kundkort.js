// Customer Card Management System
console.log('🔍 SCRIPT LOADED - Current URL:', window.location.href);
console.log('🔍 SCRIPT LOADED - URL search:', window.location.search);

class CustomerCardManager {
    constructor() {
        console.log('🔍 CONSTRUCTOR - Creating CustomerCardManager');
        console.log('🔍 CONSTRUCTOR - Current URL:', window.location.href);
        console.log('🔍 CONSTRUCTOR - URL search:', window.location.search);
        
        this.customerId = null;
        this.customerData = null;
        this.userData = null;
        this.userByraIds = [];
        
        this.init();
    }

    async init() {
        await this.loadAirtableConfig();
        await this.loadUserData();
        this.setupEventListeners();
        this.setupTabNavigation();
        
        // Ensure first tab is visible on load
        this.ensureFirstTabVisible();
        
        // Debug: Check URL immediately
        console.log('🔍 INIT - Current URL:', window.location.href);
        console.log('🔍 INIT - URL search:', window.location.search);
        
        // Wait a bit for URL to be fully available
        setTimeout(() => {
            console.log('🔍 TIMEOUT - Current URL:', window.location.href);
            console.log('🔍 TIMEOUT - URL search:', window.location.search);
            this.loadCustomerData();
        }, 100);
    }

    ensureFirstTabVisible() {
        // Find the first active tab pane and ensure it's visible
        const firstActivePane = document.querySelector('.customer-details-section .tab-pane.active');
        if (firstActivePane) {
            firstActivePane.style.display = 'block';
            firstActivePane.style.visibility = 'visible';
            firstActivePane.style.opacity = '1';
            firstActivePane.style.position = 'relative';
            console.log('✅ First tab pane made visible:', firstActivePane.id);
        } else {
            // If no active pane, make the first one active
            const firstPane = document.querySelector('.customer-details-section .tab-pane');
            if (firstPane) {
                firstPane.classList.add('active');
                firstPane.style.display = 'block';
                firstPane.style.visibility = 'visible';
                firstPane.style.opacity = '1';
                firstPane.style.position = 'relative';
                console.log('✅ First tab pane activated:', firstPane.id);
            }
        }
        
        // Also ensure tab-content container is visible
        const tabContent = document.querySelector('.customer-details-section .tab-content');
        if (tabContent) {
            tabContent.style.display = 'block';
            tabContent.style.visibility = 'visible';
            tabContent.style.opacity = '1';
            console.log('✅ Tab content container made visible');
        }
    }

    forceTabVisibility() {
        // Force all tab panes in customer-details-section to have correct visibility
        const tabPanes = document.querySelectorAll('.customer-details-section .tab-pane');
        tabPanes.forEach(pane => {
            if (pane.classList.contains('active')) {
                pane.style.display = 'block';
                pane.style.visibility = 'visible';
                pane.style.opacity = '1';
                pane.style.position = 'relative';
            } else {
                pane.style.display = 'none';
                pane.style.visibility = 'hidden';
                pane.style.opacity = '0';
            }
        });
        console.log('✅ Tab visibility forced for', tabPanes.length, 'panes');
    }

    async loadAirtableConfig() {
        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/airtable/config`);
            if (response.ok) {
                const config = await response.json();
                this.airtableApiKey = config.apiKey;
            } else {
                console.warn('Could not load Airtable config, using fallback');
                this.airtableApiKey = null;
            }
        } catch (error) {
            console.error('Error loading Airtable config:', error);
        }
    }

    async loadUserData() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                console.warn('No auth token found - user not logged in');
                return;
            }

            const response = await fetch(`${window.apiConfig.baseUrl}/api/auth/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.userData = data.user;
                
                // Extract byrå IDs from user data
                this.userByraIds = [];
                if (this.userData.byraId) {
                    this.userByraIds = [this.userData.byraId.toString()];
                } else if (this.userData.byraIds && Array.isArray(this.userData.byraIds)) {
                    this.userByraIds = this.userData.byraIds.map(id => id.toString());
                }
                
                console.log('User data loaded:', this.userData);
                console.log('User byrå IDs:', this.userByraIds);
            } else {
                console.warn('Could not load user data - HTTP', response.status);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    setupEventListeners() {
        // Get customer ID from URL parameters
        console.log('🔍 Setting up event listeners...');
        console.log('🔍 Window location:', window.location);
        console.log('🔍 Window location href:', window.location.href);
        console.log('🔍 Window location search:', window.location.search);
        
        const urlParams = new URLSearchParams(window.location.search);
        this.customerId = urlParams.get('id');
        
        // Debug logging
        console.log('🔍 Current URL:', window.location.href);
        console.log('🔍 URL search params:', window.location.search);
        console.log('🔍 Customer ID from URL:', this.customerId);
        console.log('🔍 All URL params:', Object.fromEntries(urlParams.entries()));
        console.log('🔍 URL params keys:', Array.from(urlParams.keys()));
        console.log('🔍 URL params values:', Array.from(urlParams.values()));
        
        // Validate customer ID - check for null, undefined, or string "null"/"undefined"
        if (!this.customerId || 
            this.customerId === 'null' || 
            this.customerId === 'undefined' || 
            this.customerId.trim() === '') {
            console.error('❌ No valid customer ID found in URL!');
            this.showError('Inget giltigt kund-ID angivet. Omdirigerar till kundlista...');
            // Redirect to customer list after 3 seconds
            setTimeout(() => {
                window.location.href = 'kundlista.html';
            }, 3000);
            return;
        }
        
        console.log('✅ Customer ID found:', this.customerId);
    }

    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanes = document.querySelectorAll('.tab-pane');

        // Ensure initial active tab is visible
        const initialActivePane = document.querySelector('.tab-pane.active');
        if (initialActivePane) {
            initialActivePane.style.display = 'block';
            initialActivePane.style.visibility = 'visible';
            initialActivePane.style.opacity = '1';
        }

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all buttons and panes
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanes.forEach(pane => {
                    pane.classList.remove('active');
                    pane.style.display = 'none';
                    pane.style.visibility = 'hidden';
                    pane.style.opacity = '0';
                });
                
                // Add active class to clicked button and corresponding pane
                button.classList.add('active');
                const targetPane = document.getElementById(targetTab);
                if (targetPane) {
                    targetPane.classList.add('active');
                    targetPane.style.display = 'block';
                    targetPane.style.visibility = 'visible';
                    targetPane.style.opacity = '1';
                }
                
                // Load content for the selected tab
                this.loadTabContent(targetTab);
            });
        });
    }

    async loadCustomerData() {
        // Try to get customer ID again if it's not set
        if (!this.customerId) {
            console.log('🔍 Customer ID not set, trying to get it from URL again...');
            const urlParams = new URLSearchParams(window.location.search);
            this.customerId = urlParams.get('id');
            console.log('🔍 Customer ID from retry:', this.customerId);
        }
        
        // Validate customer ID - check for null, undefined, or string "null"/"undefined"
        if (!this.customerId || 
            this.customerId === 'null' || 
            this.customerId === 'undefined' || 
            this.customerId.trim() === '') {
            console.error('❌ Still no valid customer ID found!');
            this.showError('Inget giltigt kund-ID angivet. Omdirigerar till kundlista...');
            // Redirect to customer list after 3 seconds
            setTimeout(() => {
                window.location.href = 'kundlista.html';
            }, 3000);
            return;
        }

        // Debug logging
        console.log('🔍 Loading customer data for ID:', this.customerId);
        console.log('🔍 API Config:', window.apiConfig);
        console.log('🔍 Base URL:', window.apiConfig?.baseUrl);

        // Fallback base URL if apiConfig is not available
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const apiUrl = `${baseUrl}/api/kunddata/${this.customerId}`;
        
        console.log('🔍 Full API URL:', apiUrl);

        try {
            // Get auth token from localStorage
            const token = localStorage.getItem('authToken');
            if (!token) {
                console.error('❌ No auth token found');
                this.showError('Du måste logga in för att se kundinformation');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 3000);
                return;
            }

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('📦 Response data:', data);
                
                // Handle response format from /api/kunddata/:id endpoint
                // Format: { success: true, id: ..., createdTime: ..., fields: ..., message: ..., ... }
                if (data.success && data.id && data.fields) {
                    // Correct format from our endpoint
                    this.customerData = {
                        id: data.id,
                        createdTime: data.createdTime,
                        fields: data.fields
                    };
                    console.log('✅ Customer data loaded:', this.customerData);
                } else if (data.id && data.fields) {
                    // Direct record format (fallback)
                    this.customerData = data;
                    console.log('✅ Customer data loaded (fallback):', this.customerData);
                } else {
                    console.error('❌ Unexpected response format:', data);
                    throw new Error('Oväntat svar från servern');
                }
                this.displayCustomerInfo();
                this.loadTabContent('foretagsinformation'); // Load first tab by default
                
                // Force visibility after data is loaded
                setTimeout(() => {
                    this.ensureFirstTabVisible();
                    this.forceTabVisibility();
                }, 200);
            } else {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 404) {
                    this.showError('Kunden hittades inte');
                } else if (response.status === 403) {
                    this.showError('Du har inte behörighet att se denna kund');
                } else {
                    throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
                }
            }
        } catch (error) {
            console.error('Error loading customer data:', error);
            this.showError(`Kunde inte ladda kundinformation: ${error.message}`);
        }
    }

    displayCustomerInfo() {
        if (!this.customerData) {
            console.warn('⚠️ No customer data to display');
            return;
        }

        const fields = this.customerData.fields || {};
        console.log('📋 Displaying customer info with fields:', fields);
        
        // Update customer header
        const nameElement = document.getElementById('customer-name');
        const orgNumberElement = document.getElementById('customer-org-number');
        
        if (nameElement) {
            nameElement.textContent = fields.Namn || 'Namn saknas';
        }
        
        if (orgNumberElement) {
            // Try multiple field name variations
            orgNumberElement.textContent = fields.Orgnr || 
                                          fields['Organisationsnummer'] || 
                                          fields['Org.nr'] || 
                                          'Org.nr saknas';
        }
        
        // Update customer type badge
        const typeBadge = document.getElementById('customer-type');
        if (typeBadge) {
            if (fields.Form) {
                typeBadge.textContent = fields.Form;
                typeBadge.style.display = 'inline-block';
            } else {
                typeBadge.style.display = 'none';
            }
        }
        
        console.log('✅ Customer info displayed');
    }

    async loadTabContent(tabName) {
        switch (tabName) {
            case 'foretagsinformation':
                this.loadCompanyInfo();
                break;
            case 'roller':
                this.loadRoles();
                break;
            case 'riskbedomning':
                this.loadRiskAssessment();
                break;
            case 'tjanster':
                this.loadServices();
                break;
            case 'anteckningar':
                this.loadNotes();
                break;
            case 'dokumentation':
                this.loadDocuments();
                break;
        }
    }

    loadCompanyInfo() {
        if (!this.customerData) {
            console.warn('⚠️ No customer data to display in company info');
            return;
        }

        const fields = this.customerData.fields || {};
        console.log('📋 Loading company info with fields:', fields);
        
        // Debug: Check if tab pane is visible
        const tabPane = document.getElementById('foretagsinformation');
        if (tabPane) {
            console.log('🔍 Tab pane visibility:', {
                display: window.getComputedStyle(tabPane).display,
                visibility: window.getComputedStyle(tabPane).visibility,
                opacity: window.getComputedStyle(tabPane).opacity,
                hasActive: tabPane.classList.contains('active'),
                innerHTML: tabPane.innerHTML.substring(0, 200)
            });
        }
        
        // Helper function to safely update element
        const updateElement = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value || '-';
                console.log(`✅ Updated ${id}:`, value || '-');
            } else {
                console.warn(`⚠️ Element not found: ${id}`);
            }
        };
        
        // Update company information fields - try multiple field name variations
        updateElement('customer-email', fields.Epost || fields.Email || fields['E-post']);
        updateElement('customer-address', fields.Address || fields.Adress || fields['Postadress']);
        updateElement('customer-phone', fields.Telefon || fields.Phone || fields['Telefonnr']);
        updateElement('customer-sni', fields['SNI kod'] || fields.SNIKod || fields.SNI);
        updateElement('customer-description', fields['Beskrivning av kunden'] || fields.Verksamhetsbeskrivning || fields.Beskrivning);
        updateElement('customer-turnover', fields.Omsattning || fields['Omsättning']);
        updateElement('customer-executives', fields.Befattningshavare);
        updateElement('customer-owner', fields.VerkligHuvudman || fields['Verklig huvudman']);
        updateElement('customer-signature', fields.Firmateckning || fields['Firmateckning']);
        
        // Additional fields
        updateElement('customer-active', fields['Aktivt företag'] || fields.Aktivt || '-');
        
        // Format agreement date
        const agreementDate = fields['Avtalet gäller ifrån'] || fields['Avtalsdatum'];
        if (agreementDate) {
            try {
                const date = new Date(agreementDate);
                updateElement('customer-agreement-date', date.toLocaleDateString('sv-SE'));
            } catch (e) {
                updateElement('customer-agreement-date', agreementDate);
            }
        } else {
            updateElement('customer-agreement-date', '-');
        }
        
        // Format "Uppdraget kan antas"
        const canAccept = fields['Uppdraget kan antas'];
        if (canAccept !== undefined && canAccept !== null) {
            updateElement('customer-can-accept', canAccept === true || canAccept === 'true' ? 'Ja' : 'Nej');
        } else {
            updateElement('customer-can-accept', '-');
        }
        
        // Format "Byrån har" as a list
        const byraHas = fields['Byrån har'] || fields['Byråns egenskaper'];
        const byraHasElement = document.getElementById('customer-byra-has');
        if (byraHasElement) {
            if (Array.isArray(byraHas) && byraHas.length > 0) {
                byraHasElement.innerHTML = '<ul class="byra-has-list">' + 
                    byraHas.map(item => `<li><i class="fas fa-check-circle"></i> ${item}</li>`).join('') + 
                    '</ul>';
            } else if (byraHas) {
                byraHasElement.textContent = byraHas;
            } else {
                byraHasElement.textContent = '-';
            }
        }
        
        // Format created date
        const created = fields.Skapad || this.customerData.createdTime;
        if (created) {
            try {
                const date = new Date(created);
                updateElement('customer-created', date.toLocaleDateString('sv-SE') + ' ' + date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
            } catch (e) {
                updateElement('customer-created', created);
            }
        } else {
            updateElement('customer-created', '-');
        }
        
        console.log('✅ Company info loaded');
    }

    async loadRoles() {
        const rolesList = document.getElementById('roles-list');
        
        if (!this.customerData || !this.customerData.fields) {
            console.warn('⚠️ No customer data available for roles');
            this.displayEmptyRoles();
            return;
        }

        try {
            // Try to load roles from API endpoint if it exists
            const response = await fetch(`${window.apiConfig.baseUrl}/api/kunddata/${this.customerId}/roller`);
            if (response.ok) {
                const data = await response.json();
                this.displayRoles(data.roles || []);
            } else {
                // No API endpoint or no roles found - show empty state
                this.displayEmptyRoles();
            }
        } catch (error) {
            console.log('ℹ️ Roles endpoint not available, showing empty state');
            this.displayEmptyRoles();
        }
    }

    displayEmptyRoles() {
        const rolesList = document.getElementById('roles-list');
        rolesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3>Inga roller hittades</h3>
                <p>Lägg till personer/ombud för att se roller här.</p>
                <button class="btn btn-primary" onclick="customerCardManager.addPerson()">
                    <i class="fas fa-plus"></i>
                    Lägg till person/ombud
                </button>
            </div>
        `;
    }

    displayRoles(roles) {
        const rolesList = document.getElementById('roles-list');
        
        if (roles.length === 0) {
            rolesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>Inga roller hittades</h3>
                    <p>Lägg till personer/ombud för att se roller här.</p>
                </div>
            `;
            return;
        }

        const rolesHTML = roles.map(role => this.createRoleCard(role)).join('');
        rolesList.innerHTML = rolesHTML;
    }

    displaySampleRoles() {
        const rolesList = document.getElementById('roles-list');
        
        // Show sample roles for demonstration
        rolesList.innerHTML = `
            <div class="role-card">
                <div class="role-header">
                    <div class="role-icon">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="role-info">
                        <h4>Förnamn Efternamn</h4>
                        <span class="role-title">Styrelseledamot</span>
                    </div>
                    <button class="btn btn-primary btn-sm">
                        <i class="fas fa-id-card"></i>
                        Skicka ID koll
                    </button>
                </div>
                <div class="role-details">
                    <div class="detail-item">
                        <label>Personnr:</label>
                        <span>1980-XX-XX-XXXX</span>
                    </div>
                    <div class="detail-item">
                        <label>Adress:</label>
                        <span>Byavägen 13, 341 99 STADEN</span>
                    </div>
                    <div class="detail-item">
                        <label>Övriga bolagsengagemang:</label>
                        <span>Saknas</span>
                    </div>
                    <div class="detail-item">
                        <label>Varningar på personnivå:</label>
                        <span>Saknas</span>
                    </div>
                </div>
            </div>
            
            <div class="role-card">
                <div class="role-header">
                    <div class="role-icon">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="role-info">
                        <h4>Fru Efternamn</h4>
                        <span class="role-title">Styrelsesuppleant</span>
                    </div>
                    <button class="btn btn-primary btn-sm">
                        <i class="fas fa-id-card"></i>
                        Skicka ID koll
                    </button>
                </div>
                <div class="role-details">
                    <div class="detail-item">
                        <label>Personnr:</label>
                        <span>1980-XX-XX-XXXX</span>
                    </div>
                    <div class="detail-item">
                        <label>Adress:</label>
                        <span>Byavägen 13, 341 99 STADEN</span>
                    </div>
                    <div class="detail-item">
                        <label>Övriga bolagsengagemang:</label>
                        <span>Saknas</span>
                    </div>
                    <div class="detail-item">
                        <label>Varningar på personnivå:</label>
                        <span>Saknas</span>
                    </div>
                </div>
            </div>
        `;
    }

    createRoleCard(role) {
        return `
            <div class="role-card">
                <div class="role-header">
                    <div class="role-icon">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="role-info">
                        <h4>${role.namn || 'Namn saknas'}</h4>
                        <span class="role-title">${role.roll || 'Roll saknas'}</span>
                    </div>
                    <button class="btn btn-primary btn-sm">
                        <i class="fas fa-id-card"></i>
                        Skicka ID koll
                    </button>
                </div>
                <div class="role-details">
                    <div class="detail-item">
                        <label>Personnr:</label>
                        <span>${role.personnummer || '-'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Adress:</label>
                        <span>${role.adress || '-'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Övriga bolagsengagemang:</label>
                        <span>${role.ovrigaEngagemang || 'Saknas'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Varningar på personnivå:</label>
                        <span>${role.varningar || 'Saknas'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    async loadRiskAssessment() {
        const content = document.getElementById('risk-assessment-content');
        
        try {
            // Load risk assessment data
            const response = await fetch(`${window.apiConfig.baseUrl}/api/risk-assessments?customerId=${this.customerId}`);
            if (response.ok) {
                const data = await response.json();
                this.displayRiskAssessment(data.records || []);
            } else {
                this.displayEmptyRiskAssessment();
            }
        } catch (error) {
            console.error('Error loading risk assessment:', error);
            this.displayEmptyRiskAssessment();
        }
    }

    displayRiskAssessment(risks) {
        const content = document.getElementById('risk-assessment-content');
        
        if (risks.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-shield-alt"></i>
                    <h3>Ingen riskbedömning hittad</h3>
                    <p>Det finns ingen riskbedömning för denna kund ännu.</p>
                    <button class="btn btn-primary" onclick="customerCardManager.performRiskAssessment()">
                        <i class="fas fa-plus"></i>
                        Skapa riskbedömning
                    </button>
                </div>
            `;
            return;
        }

        const risksHTML = risks.map(risk => this.createRiskCard(risk)).join('');
        content.innerHTML = risksHTML;
    }

    displayEmptyRiskAssessment() {
        const content = document.getElementById('risk-assessment-content');
        content.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shield-alt"></i>
                <h3>Ingen riskbedömning hittad</h3>
                <p>Det finns ingen riskbedömning för denna kund ännu.</p>
                <button class="btn btn-primary" onclick="customerCardManager.performRiskAssessment()">
                    <i class="fas fa-plus"></i>
                    Skapa riskbedömning
                </button>
            </div>
        `;
    }

    createRiskCard(risk) {
        const fields = risk.fields || {};
        const riskLevel = fields['Riskbedömning'] || 'Medel';
        const riskLevelClass = this.getRiskLevelClass(riskLevel);
        
        return `
            <div class="risk-card ${riskLevelClass}">
                <div class="risk-header">
                    <h4>${fields['Task Name'] || 'Namnlös risk'}</h4>
                    <span class="risk-level-badge ${riskLevelClass}">${riskLevel}</span>
                </div>
                <div class="risk-content">
                    <p><strong>Beskrivning:</strong> ${fields['Beskrivning av riskfaktor'] || 'Ingen beskrivning'}</p>
                    <p><strong>Åtgärd:</strong> ${fields['Åtgjärd'] || 'Ingen åtgärd'}</p>
                </div>
                <div class="risk-footer">
                    <button class="btn btn-secondary btn-sm">
                        <i class="fas fa-edit"></i>
                        Redigera
                    </button>
                    <button class="btn btn-success btn-sm">
                        <i class="fas fa-check"></i>
                        ${fields['Aktuell'] ? 'Avmarkera' : 'Klarmarkera'}
                    </button>
                </div>
            </div>
        `;
    }

    getRiskLevelClass(level) {
        switch (level) {
            case 'Hög':
            case 'Förhöjd':
                return 'risk-high';
            case 'Medel':
                return 'risk-medium';
            case 'Låg':
                return 'risk-low';
            default:
                return 'risk-medium';
        }
    }

    async loadServices() {
        const content = document.getElementById('services-content');
        
        if (!this.customerData || !this.customerData.fields) {
            console.warn('⚠️ No customer data available for services');
            this.displayEmptyServices();
            return;
        }

        const fields = this.customerData.fields;
        
        // Get services from customer data fields
        // Try different field name variations
        const services = fields['Kundens utvalda tjänster'] || 
                        fields['Utvalda tjänster'] || 
                        fields.Tjänster || 
                        [];
        
        const highRiskServices = fields['Utvalda Högrisktjänster'] || 
                                fields['Högrisktjänster'] || 
                                '';
        
        const byraHighRiskServices = fields['Lookup Byråns högrisktjänster'] || 
                                     fields['Byråns högrisktjänster'] || 
                                     [];

        console.log('📋 Services data:', { services, highRiskServices, byraHighRiskServices });

        if (!services || (Array.isArray(services) && services.length === 0)) {
            this.displayEmptyServices();
            return;
        }

        // Display services
        this.displayServices(services, highRiskServices, byraHighRiskServices);
    }

    displayServices(services, highRiskServices, byraHighRiskServices) {
        const content = document.getElementById('services-content');
        
        if (!services || (Array.isArray(services) && services.length === 0)) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-cogs"></i>
                    <h3>Inga tjänster hittades</h3>
                    <p>Det finns inga registrerade tjänster för denna kund ännu.</p>
                </div>
            `;
            return;
        }

        // Convert services array to list
        const servicesList = Array.isArray(services) ? services : [services];
        
        let html = '<div class="services-list">';
        
        // Regular services
        if (servicesList.length > 0) {
            html += '<div class="services-section">';
            html += '<h4><i class="fas fa-list"></i> Utvalda tjänster</h4>';
            html += '<ul class="services-ul">';
            servicesList.forEach(service => {
                const isHighRisk = byraHighRiskServices.includes(service);
                html += `<li class="service-item ${isHighRisk ? 'high-risk' : ''}">`;
                html += `<i class="fas ${isHighRisk ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>`;
                html += `<span>${service}</span>`;
                if (isHighRisk) {
                    html += '<span class="high-risk-badge">Högrisk</span>';
                }
                html += '</li>';
            });
            html += '</ul>';
            html += '</div>';
        }

        // High risk services info
        if (highRiskServices) {
            html += '<div class="services-section high-risk-section">';
            html += '<h4><i class="fas fa-exclamation-triangle"></i> Högrisktjänster</h4>';
            html += '<p class="high-risk-info">' + highRiskServices + '</p>';
            html += '</div>';
        }

        html += '</div>';
        content.innerHTML = html;
    }

    displayEmptyServices() {
        const content = document.getElementById('services-content');
        content.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cogs"></i>
                <h3>Inga tjänster hittades</h3>
                <p>Det finns inga registrerade tjänster för denna kund ännu.</p>
            </div>
        `;
    }

    createServiceCard(service) {
        const fields = service.fields || {};
        return `
            <div class="service-card">
                <div class="service-header">
                    <h4>${fields['Tjänstnamn'] || 'Namnlös tjänst'}</h4>
                    <span class="service-status ${fields['Status'] === 'Aktiv' ? 'active' : 'inactive'}">
                        ${fields['Status'] || 'Okänd'}
                    </span>
                </div>
                <div class="service-content">
                    <p><strong>Beskrivning:</strong> ${fields['Beskrivning'] || 'Ingen beskrivning'}</p>
                    <p><strong>Startdatum:</strong> ${fields['Startdatum'] || '-'}</p>
                    <p><strong>Slutdatum:</strong> ${fields['Slutdatum'] || '-'}</p>
                </div>
            </div>
        `;
    }

    async loadNotes() {
        const content = document.getElementById('notes-content');
        
        try {
            // Load notes data
            const response = await fetch(`${window.apiConfig.baseUrl}/api/notes?customerId=${this.customerId}`);
            if (response.ok) {
                const data = await response.json();
                this.displayNotes(data.notes || []);
            } else {
                this.displayEmptyNotes();
            }
        } catch (error) {
            console.error('Error loading notes:', error);
            this.displayEmptyNotes();
        }
    }

    displayNotes(notes) {
        const content = document.getElementById('notes-content');
        
        if (notes.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-sticky-note"></i>
                    <h3>Inga anteckningar hittades</h3>
                    <p>Lägg till anteckningar för att spåra viktig information om kunden.</p>
                </div>
            `;
            return;
        }

        const notesHTML = notes.map(note => this.createNoteCard(note)).join('');
        content.innerHTML = notesHTML;
    }

    displayEmptyNotes() {
        const content = document.getElementById('notes-content');
        content.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-sticky-note"></i>
                <h3>Inga anteckningar hittades</h3>
                <p>Lägg till anteckningar för att spåra viktig information om kunden.</p>
            </div>
        `;
    }

    createNoteCard(note) {
        const fields = note.fields || {};
        return `
            <div class="note-card">
                <div class="note-header">
                    <h4>${fields['Titel'] || 'Titel saknas'}</h4>
                    <span class="note-date">${fields['Datum'] || '-'}</span>
                </div>
                <div class="note-content">
                    <p>${fields['Innehåll'] || 'Inget innehåll'}</p>
                </div>
                <div class="note-footer">
                    <span class="note-author">Skapad av: ${fields['SkapadAv'] || 'Okänd'}</span>
                    <div class="note-actions">
                        <button class="btn btn-secondary btn-sm">
                            <i class="fas fa-edit"></i>
                            Redigera
                        </button>
                        <button class="btn btn-danger btn-sm">
                            <i class="fas fa-trash"></i>
                            Ta bort
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async loadDocuments() {
        const content = document.getElementById('documents-content');
        
        try {
            // Load documents data
            const response = await fetch(`${window.apiConfig.baseUrl}/api/documents?customerId=${this.customerId}`);
            if (response.ok) {
                const data = await response.json();
                this.displayDocuments(data.documents || []);
            } else {
                this.displayEmptyDocuments();
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            this.displayEmptyDocuments();
        }
    }

    displayDocuments(documents) {
        const content = document.getElementById('documents-content');
        
        if (documents.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <h3>Inga dokument hittades</h3>
                    <p>Ladda upp dokument för att spara viktiga filer relaterade till kunden.</p>
                </div>
            `;
            return;
        }

        const documentsHTML = documents.map(doc => this.createDocumentCard(doc)).join('');
        content.innerHTML = documentsHTML;
    }

    displayEmptyDocuments() {
        const content = document.getElementById('documents-content');
        content.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file-alt"></i>
                <h3>Inga dokument hittades</h3>
                <p>Ladda upp dokument för att spara viktiga filer relaterade till kunden.</p>
            </div>
        `;
    }

    createDocumentCard(doc) {
        const fields = doc.fields || {};
        return `
            <div class="document-card">
                <div class="document-header">
                    <div class="document-icon">
                        <i class="fas fa-file-${this.getFileIcon(fields['Filtyp'])}"></i>
                    </div>
                    <div class="document-info">
                        <h4>${fields['Namn'] || 'Namnlös fil'}</h4>
                        <span class="document-type">${fields['Filtyp'] || 'Okänd typ'}</span>
                    </div>
                    <span class="document-size">${fields['Storlek'] || '-'}</span>
                </div>
                <div class="document-content">
                    <p><strong>Beskrivning:</strong> ${fields['Beskrivning'] || 'Ingen beskrivning'}</p>
                    <p><strong>Uppladdad:</strong> ${fields['UppladdadDatum'] || '-'}</p>
                </div>
                <div class="document-footer">
                    <span class="document-author">Uppladdad av: ${fields['UppladdadAv'] || 'Okänd'}</span>
                    <div class="document-actions">
                        <button class="btn btn-primary btn-sm">
                            <i class="fas fa-download"></i>
                            Ladda ner
                        </button>
                        <button class="btn btn-danger btn-sm">
                            <i class="fas fa-trash"></i>
                            Ta bort
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    getFileIcon(fileType) {
        if (!fileType) return 'alt';
        
        const type = fileType.toLowerCase();
        if (type.includes('pdf')) return 'pdf';
        if (type.includes('word') || type.includes('doc')) return 'word';
        if (type.includes('excel') || type.includes('xls')) return 'excel';
        if (type.includes('image') || type.includes('jpg') || type.includes('png')) return 'image';
        return 'alt';
    }

    // Action methods
    sendToCustomer() {
        alert('Funktionalitet för att skicka till kund kommer snart!');
    }

    performRiskAssessment() {
        // Redirect to risk assessment page for this customer
        window.location.href = `/riskbedomning-byra.html?customerId=${this.customerId}`;
    }

    addPerson() {
        alert('Funktionalitet för att lägga till person kommer snart!');
    }

    addNote() {
        alert('Funktionalitet för att lägga till anteckning kommer snart!');
    }

    uploadDocument() {
        alert('Funktionalitet för att ladda upp dokument kommer snart!');
    }

    showError(message) {
        // Create and show error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
        `;
        
        // Insert at the top of the main content
        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(errorDiv, mainContent.firstChild);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 5000);
    }
}

// Global functions for external access
function closeModal(modalId) {
    if (window.customerCardManager) {
        customerCardManager.closeModal(modalId);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 DOM LOADED - Current URL:', window.location.href);
    console.log('🔍 DOM LOADED - URL search:', window.location.search);
    console.log('🔍 DOM LOADED - URL hash:', window.location.hash);
    
    window.customerCardManager = new CustomerCardManager();
});
