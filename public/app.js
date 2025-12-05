// ClientFlow - Fristående lösning som hämtar från Bolagsverket och sparar till Airtable
class ClientFlowApp {
    constructor() {
        this.baseUrl = window.apiConfig ? window.apiConfig.baseUrl : 'https://clientflow-api-proxy-1.onrender.com';
        this.userId = null; // Sätts dynamiskt baserat på inloggad användare
        this.bureauId = null; // Sätts dynamiskt baserat på inloggad användare
        this.navigation = null;
        this.init();
    }

    init() {
        // Initialize navigation first
        this.initNavigation();
        
        // Then initialize other components
        this.bindEvents();
        this.checkSystemStatus();
        
        // Apply role-based UI restrictions
        this.applyRoleBasedUI();
    }

    initNavigation() {
        // Wait for NavigationManager to be available
        if (window.NavigationManager) {
            this.navigation = new NavigationManager();
        } else {
            // Fallback if NavigationManager isn't loaded
            setTimeout(() => this.initNavigation(), 100);
        }
    }

    bindEvents() {
        const searchForm = document.getElementById('search-form');
        const clearSearchBtn = document.getElementById('clear-search');
        const saveToAirtableBtn = document.getElementById('save-to-airtable');
        const exportDataBtn = document.getElementById('export-data');
        const checkStatusBtn = document.getElementById('check-status');
        const orgNumberInput = document.getElementById('org-number');

        if (searchForm) {
            searchForm.addEventListener('submit', (e) => this.handleSearchSubmit(e));
        }

        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => this.clearSearch());
        }

        if (saveToAirtableBtn) {
            saveToAirtableBtn.addEventListener('click', () => this.goToKYC());
        }

        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', () => this.exportCompanyData());
        }

        if (checkStatusBtn) {
            checkStatusBtn.addEventListener('click', () => this.checkSystemStatus());
        }

        // Add real-time validation for organization number
        if (orgNumberInput) {
            orgNumberInput.addEventListener('input', (e) => this.validateOrgNumber(e.target));
            orgNumberInput.addEventListener('blur', (e) => this.validateOrgNumber(e.target));
        }
    }

    async applyRoleBasedUI() {
        try {
            // Check if user is logged in
            const token = localStorage.getItem('authToken');
            if (!token) {
                console.log('No auth token found - hiding system status for non-logged in users');
                this.hideSystemStatus();
                return;
            }

            // Get user data from localStorage or fetch from server
            let userData = localStorage.getItem('userData');
            if (userData) {
                userData = JSON.parse(userData);
            } else {
                // Fetch user data from server
                const response = await fetch(`${this.baseUrl}/api/auth/me`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    userData = data.user;
                    // Store in localStorage for future use
                    localStorage.setItem('userData', JSON.stringify(userData));
                } else {
                    console.log('Could not fetch user data - hiding system status');
                    this.hideSystemStatus();
                    return;
                }
            }

            console.log('User role:', userData.role);

            // Sätt användar-ID och byrå-ID baserat på inloggad användare
            // Använd rätt fältnamn från Airtable - både direkta fält och fields-strukturen
            this.userId = userData.id || userData.fields?.UserID || userData.fields?.userID || userData.fields?.user_id || userData.fields?.['Användar-ID'] || userData.fields?.id || null;
            this.bureauId = userData.byraId || userData.fields?.byraId || userData.fields?.byra_id || userData.fields?.['Byrå ID'] || null;
            
            console.log('🔍 Satt användar-ID och byrå-ID:', {
                userId: this.userId,
                bureauId: this.bureauId,
                userData: userData,
                availableFields: Object.keys(userData),
                userDataFields: userData.fields ? Object.keys(userData.fields) : 'No fields',
                userDataId: userData.id,
                userDataFieldsId: userData.fields?.id,
                userDataFieldsUserID: userData.fields?.UserID,
                userDataFieldsUserIDLower: userData.fields?.userID
            });

            // Only show system status for ClientFlowAdmin users
            if (userData.role !== 'ClientFlowAdmin') {
                console.log('User is not ClientFlowAdmin - hiding system status');
                this.hideSystemStatus();
            } else {
                console.log('User is ClientFlowAdmin - showing system status');
                this.showSystemStatus();
            }

        } catch (error) {
            console.error('Error applying role-based UI:', error);
            // Hide system status on error to be safe
            this.hideSystemStatus();
        }
    }

    hideSystemStatus() {
        const statusSection = document.querySelector('.status-section');
        if (statusSection) {
            statusSection.style.display = 'none';
        }
    }

    showSystemStatus() {
        const statusSection = document.querySelector('.status-section');
        if (statusSection) {
            statusSection.style.display = 'block';
        }
    }

    validateOrgNumber(input) {
        const value = input.value.trim();
        
        // Accept multiple formats: 8-12 digits, with or without dashes
        // Examples: 5164050253, 5560000002, 198101012386, 193403223328
        const isValid = /^[0-9-]{8,12}$/.test(value) && 
                       /^[0-9]+(-[0-9]+)*$/.test(value) && 
                       value.replace(/-/g, '').length >= 8 && 
                       value.replace(/-/g, '').length <= 12;
        
        // Remove existing validation classes
        input.classList.remove('valid', 'invalid');
        
        if (value === '') {
            input.classList.remove('valid', 'invalid');
            return;
        }
        
        if (isValid) {
            input.classList.add('valid');
            input.classList.remove('invalid');
        } else {
            input.classList.add('invalid');
            input.classList.remove('valid');
        }
    }

    async checkSystemStatus() {
        // Check server status
        this.updateStatus('server-status', 'Kontrollerar...', 'checking');
        
        try {
            console.log('🔍 Testing connection to:', `${this.baseUrl}/health`);
            const response = await fetch(`${this.baseUrl}/health`);
            console.log('📡 Health check response:', response.status, response.ok);
            
            if (response.ok) {
                this.updateStatus('server-status', 'Connected', 'connected');
            } else {
                this.updateStatus('server-status', 'Error', 'error');
            }
        } catch (error) {
            this.updateStatus('server-status', 'Disconnected', 'error');
        }

        // Check Airtable status
        this.updateStatus('airtable-status', 'Kontrollerar...', 'checking');
        try {
            const response = await fetch(`${this.baseUrl}/api/test-airtable-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.updateStatus('airtable-status', 'Connected', 'connected');
                } else {
                    this.updateStatus('airtable-status', 'Error', 'error');
                }
            } else {
                this.updateStatus('airtable-status', 'Disconnected', 'error');
            }
        } catch (error) {
            this.updateStatus('airtable-status', 'Disconnected', 'error');
        }

        // Check Bolagsverket status
        this.updateStatus('bolagsverket-status', 'Kontrollerar...', 'checking');
        try {
            const response = await fetch(`${this.baseUrl}/api/bolagsverket/isalive`);
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.updateStatus('bolagsverket-status', 'Connected', 'connected');
                } else {
                    this.updateStatus('bolagsverket-status', 'Error', 'error');
                }
            } else {
                this.updateStatus('bolagsverket-status', 'Disconnected', 'error');
            }
        } catch (error) {
            this.updateStatus('bolagsverket-status', 'Disconnected', 'error');
        }
    }

    updateStatus(elementId, text, status) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
            element.className = `status-${status}`;
        }
    }

    async handleSearchSubmit(e) {
        e.preventDefault();
        
        const orgNumber = document.getElementById('org-number').value.trim();
        if (!orgNumber) {
            this.showMessage('Ange ett organisationsnummer', 'error');
            return;
        }

        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Hämtar data...';
        submitBtn.disabled = true;

        try {
            // Clean organization number (remove dashes)
            const cleanOrgNumber = orgNumber.replace(/-/g, '');
            
            // Fetch company data from Bolagsverket
            const companyData = await this.fetchCompanyData(cleanOrgNumber);
            
            if (companyData) {
                this.displayCompanyInfo(companyData);
                this.addToRecentSearches(orgNumber, companyData);
                this.showMessage('Företagsdata hämtad framgångsrikt!', 'success');
            } else {
                this.showMessage('Kunde inte hitta företag med det organisationsnumret', 'error');
            }
        } catch (error) {
            console.error('Error fetching company data:', error);
            this.showMessage('Ett fel uppstod vid hämtning av företagsdata', 'error');
        } finally {
            // Reset button state
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    async fetchCompanyData(orgNumber) {
        console.log('🔍 Fetching company data for orgNumber:', orgNumber);
        
        try {
            // Store the orgNumber for use in transformBolagsverketData
            this.lastSearchedOrgNumber = orgNumber;
            console.log('💾 Stored lastSearchedOrgNumber:', this.lastSearchedOrgNumber);
            
            // Show loading state
            this.showLoadingError();
            
            // Use POST endpoint for Bolagsverket as the server expects
            console.log('🔍 Making API request to:', `${this.baseUrl}/api/bolagsverket/organisationer`);
            console.log('📤 Request body:', JSON.stringify({
                organisationsnummer: orgNumber
            }));
            
            const response = await fetch(`${this.baseUrl}/api/bolagsverket/organisationer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    organisationsnummer: orgNumber
                })
            });
            
            console.log('📡 API Response status:', response.status);
            console.log('📡 API Response ok:', response.ok);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ API Error:', errorData);
                
                // Hide loading and show error
                this.hideLoadingError();
                
                let errorMessage = 'Ett fel uppstod vid hämtning av företagsdata.';
                let technicalDetails = null;
                
                if (response.status === 404) {
                    errorMessage = `Inget företag hittades med organisationsnummer ${orgNumber}. Kontrollera att numret är korrekt.`;
                } else if (response.status === 400) {
                    errorMessage = 'Ogiltigt organisationsnummer. Kontrollera formatet.';
                    technicalDetails = errorData;
                } else if (response.status >= 500) {
                    errorMessage = 'Serverfel. Försök igen senare.';
                    technicalDetails = errorData;
                } else {
                    technicalDetails = errorData;
                }
                
                this.showError(errorMessage, technicalDetails);
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('📊 API Response result:', result);
            
            if (result.success && result.data) {
                console.log('✅ Using real Bolagsverket data');
                // Hide loading and return transformed data
                this.hideLoadingError();
                return this.transformBolagsverketData(result.data);
            } else {
                console.log('❌ Invalid response format from Bolagsverket');
                this.hideLoadingError();
                this.showError('Ogiltigt svar från Bolagsverket', result);
                throw new Error('Invalid response format from Bolagsverket');
            }
        } catch (error) {
            console.error('❌ Error fetching from Bolagsverket:', error);
            
            // Hide loading if not already hidden
            this.hideLoadingError();
            
            // Show error if not already shown
            if (!document.getElementById('error-message').style.display || 
                document.getElementById('error-message').style.display === 'none') {
                this.showError('Ett fel uppstod vid hämtning av företagsdata.', {
                    message: error.message,
                    stack: error.stack
                });
            }
            
            throw new Error(`Kunde inte hämta data från Bolagsverket: ${error.message}`);
        }
    }

    transformBolagsverketData(bolagsverketData) {
        console.log('🔄 Transforming Bolagsverket data...');
        console.log('📊 Raw Bolagsverket data:', bolagsverketData);
        
        // Handle both single organization and multiple organizations
        const organisations = Array.isArray(bolagsverketData) ? bolagsverketData : [bolagsverketData];
        console.log('🏢 Processing organisations:', organisations.length);
        
        // Use the original orgNumber that was searched for
        const orgNumber = this.lastSearchedOrgNumber || 'Saknas';
        console.log('🔢 Original orgNumber searched:', this.lastSearchedOrgNumber);
        
        // Collect all organization names from all organisations
        let allNames = [];
        let primaryName = 'Namn saknas';
        let primaryOrg = null;
        
        organisations.forEach((org, index) => {
            console.log(`📋 Processing organisation ${index + 1}:`, {
                namnskyddslopnummer: org.namnskyddslopnummer,
                organisationsnamn: org.organisationsnamn
            });
            
            const orgNames = org.organisationsnamn?.organisationsnamnLista?.map(n => n.namn).filter(Boolean) || [];
            allNames = allNames.concat(orgNames);
            
            // Use the first organisation as primary
            if (index === 0) {
                primaryName = orgNames[0] || 'Namn saknas';
                primaryOrg = org;
            }
        });
        
        console.log('🏷️ All names found:', allNames);
        console.log('⭐ Primary name selected:', primaryName);
        
        // Get address information from primary organisation
        const address = primaryOrg?.postadressOrganisation?.postadress || {};
        const fullAddress = [
            address.utdelningsadress,
            address.postnummer,
            address.postort
        ].filter(Boolean).join(', ');
        
        const transformedData = {
            organisationsnummer: orgNumber,
            namn: primaryName,
            allaNamn: allNames,
            form: primaryOrg?.organisationsform?.klartext || primaryOrg?.juridiskForm?.klartext || 'Saknas',
            status: (() => {
                // Om verksamOrganisation är 'JA', är företaget aktivt
                if (primaryOrg?.verksamOrganisation?.kod === 'JA') {
                    return 'Aktiv';
                }
                // Om avregistreradOrganisation har ett fel-objekt, betyder det att den inte är avregistrerad
                if (primaryOrg?.avregistreradOrganisation?.fel) {
                    return 'Aktiv';
                }
                // Om avregistreringsorsak har ett fel-objekt, betyder det att den inte är avregistrerad
                if (primaryOrg?.avregistreringsorsak?.fel) {
                    return 'Aktiv';
                }
                // Annars är den avregistrerad
                return 'Avregistrerad';
            })(),
            registreringsdatum: (() => {
                // Try different possible field structures for registration date
                if (primaryOrg?.organisationsdatum?.registreringsdatum) {
                    return primaryOrg.organisationsdatum.registreringsdatum;
                }
                if (primaryOrg?.registreringsdatum) {
                    return primaryOrg.registreringsdatum;
                }
                if (primaryOrg?.datum?.registrering) {
                    return primaryOrg.datum.registrering;
                }
                if (primaryOrg?.registrering) {
                    return primaryOrg.registrering;
                }
                if (primaryOrg?.bildad) {
                    return primaryOrg.bildad;
                }
                if (primaryOrg?.startdatum) {
                    return primaryOrg.startdatum;
                }
                return 'Saknas';
            })(),
            registreringsland: primaryOrg?.registreringsland?.klartext || 'Sverige',
            adress: {
                gatuadress: address.utdelningsadress || 'Saknas',
                postnummer: address.postnummer || 'Saknas',
                postort: address.postort || 'Saknas',
                fullAddress: fullAddress || 'Saknas'
            },
            verksamhet: (() => {
                // Try different possible field structures for verksamhetsbeskrivning
                if (primaryOrg?.verksamhetsbeskrivning?.beskrivning) {
                    return primaryOrg.verksamhetsbeskrivning.beskrivning;
                }
                if (typeof primaryOrg?.verksamhetsbeskrivning === 'string') {
                    return primaryOrg.verksamhetsbeskrivning;
                }
                if (primaryOrg?.beskrivning) {
                    return primaryOrg.beskrivning;
                }
                if (primaryOrg?.verksamhet) {
                    return primaryOrg.verksamhet;
                }
                if (primaryOrg?.affarsidé) {
                    return primaryOrg.affarsidé;
                }
                return 'Saknas';
            })(),
            sniKoder: (() => {
                // Try different possible field structures for SNI codes
                if (primaryOrg?.naringsgrenOrganisation?.sni) {
                    return primaryOrg.naringsgrenOrganisation.sni;
                }
                if (primaryOrg?.sniKoder) {
                    return primaryOrg.sniKoder;
                }
                if (primaryOrg?.sni) {
                    return primaryOrg.sni;
                }
                if (primaryOrg?.naringsgren) {
                    return primaryOrg.naringsgren;
                }
                return [];
            })(),
            aktivtForetag: !primaryOrg?.avregistreradOrganisation,
            // Add more fields as they become available
            antal_anstallda: 'Okänt',
            omsattning: 'Okänt',
            // Lägg till debug-information
            debug: {
                rawData: primaryOrg,
                hasOrganisationsform: !!primaryOrg?.organisationsform,
                hasJuridiskForm: !!primaryOrg?.juridiskForm,
                hasOrganisationsdatum: !!primaryOrg?.organisationsdatum,
                hasRegistreringsland: !!primaryOrg?.registreringsland,
                hasVerksamhetsbeskrivning: !!primaryOrg?.verksamhetsbeskrivning
            }
        };
        
        console.log('✅ Transformed data:', transformedData);
        console.log('🔍 Debug information:', transformedData.debug);
        
        console.log('🔍 Raw data structure check:');
        console.log('  - primaryOrg.verksamhetsbeskrivning:', primaryOrg?.verksamhetsbeskrivning);
        console.log('  - primaryOrg.organisationsdatum:', primaryOrg?.organisationsdatum);
        console.log('  - primaryOrg.organisationsform:', primaryOrg?.organisationsform);
        console.log('  - primaryOrg.juridiskForm:', primaryOrg?.juridiskForm);
        console.log('  - primaryOrg.naringsgrenOrganisation:', primaryOrg?.naringsgrenOrganisation);
        console.log('🔍 All available fields in primaryOrg:', Object.keys(primaryOrg || {}));
        
        // Check for alternative field names for verksamhetsbeskrivning
        const possibleVerksamhetFields = [
            'verksamhetsbeskrivning',
            'beskrivning',
            'verksamhet',
            'affarsidé',
            'affarsidePrimary',
            'huvudsakligVerksamhet'
        ];
        
        console.log('🔍 Checking for verksamhet fields:');
        possibleVerksamhetFields.forEach(field => {
            if (primaryOrg?.[field]) {
                console.log(`  - Found ${field}:`, primaryOrg[field]);
            }
        });
        
        // Check for alternative field names for registration date
        const possibleDateFields = [
            'organisationsdatum',
            'registreringsdatum',
            'datum',
            'bildad',
            'startdatum'
        ];
        
        console.log('🔍 Checking for date fields:');
        possibleDateFields.forEach(field => {
            if (primaryOrg?.[field]) {
                console.log(`  - Found ${field}:`, primaryOrg[field]);
            }
        });
        
        return transformedData;
    }

    displayCompanyInfo(companyData) {
        console.log('🎨 Displaying company info with data:', companyData);
        console.log('🔍 Key fields check:');
        console.log('  - verksamhet:', companyData.verksamhet);
        console.log('  - registreringsdatum:', companyData.registreringsdatum);
        console.log('  - status:', companyData.status);
        console.log('  - form:', companyData.form);
        console.log('  - adress:', companyData.adress);
        console.log('  - sniKoder:', companyData.sniKoder);
        console.log('🔍 All available fields:', Object.keys(companyData));
        console.log('🔍 Full companyData object:', companyData);
        
        // Store company data for later use
        this.currentCompanyData = companyData;
        console.log('💾 Stored currentCompanyData:', this.currentCompanyData);
        
        // Hide any error messages when showing company info
        this.hideError();
        
        const companyInfoSection = document.getElementById('company-info');
        const companyDetails = document.getElementById('company-details');
        const companyHeader = document.querySelector('.company-header h2');
        
        if (!companyInfoSection || !companyDetails) {
            console.error('❌ Company info elements not found');
            return;
        }

        // Helper function to replace N/A with Saknas
        const formatValue = (value) => {
            if (!value || value === 'N/A' || value === 'null' || value === 'undefined' || value === '') {
                return '<span class="missing-data">Saknas</span>';
            }
            return value;
        };

        // Update the main card header with company name
        if (companyHeader) {
            companyHeader.textContent = formatValue(companyData.namn);
        }

        // Create HTML for tabbed company information
        const html = `
            <div class="company-info-clean">
                <!-- Company Header -->
                <div class="company-header-section">
                    <div class="company-header-left">
                        <i class="fas fa-eye company-icon"></i>
                        <div class="company-title">
                            <h3 class="company-name">${formatValue(companyData.namn)}</h3>
                            <div class="company-meta">
                                <span class="org-number">${formatValue(companyData.organisationsnummer)}</span>
                                <span class="company-form-tag">${formatValue(companyData.form)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Tab Navigation -->
                <div class="company-tabs">
                    <button class="tab-button active" data-tab="foretagsuppgifter">
                        <i class="fas fa-building"></i>
                        Företagsuppgifter
                    </button>
                    <button class="tab-button" data-tab="roller">
                        <i class="fas fa-users-cog"></i>
                        Roller
                    </button>
                    <button class="tab-button" data-tab="riskbedomning">
                        <i class="fas fa-shield-alt"></i>
                        Riskbedömning
                    </button>
                    <button class="tab-button" data-tab="kundens-tjanster">
                        <i class="fas fa-cogs"></i>
                        Kundens tjänster
                    </button>
                </div>
                
                <!-- Tab Content -->
                <div class="tab-content">
                    <!-- Tab 1: Company Information -->
                    <div class="tab-pane active" id="foretagsuppgifter">
                        <!-- Contact Information Section -->
                        <div class="contact-info-section">
                            <div class="contact-grid">
                                <div class="contact-item">
                                    <label>Status</label>
                                    <span class="status-badge ${companyData.status === 'Aktiv' ? 'active' : 'inactive'}">${formatValue(companyData.status)}</span>
                                </div>
                                <div class="contact-item">
                                    <label>Registreringsdatum</label>
                                    <span>${formatValue(companyData.registreringsdatum)}</span>
                                </div>
                                <div class="contact-item">
                                    <label>Registreringsland</label>
                                    <span>${formatValue(companyData.registreringsland)}</span>
                                </div>
                                <div class="contact-item">
                                    <label>Organisationsform</label>
                                    <span>${formatValue(companyData.form)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Company Names Section (if multiple names exist) -->
                        ${companyData.allaNamn && companyData.allaNamn.length > 1 ? `
                        <div class="detailed-info-section">
                            <div class="section-header">
                                <i class="fas fa-tags"></i>
                                <h4>Företagsnamn</h4>
                            </div>
                            <div class="company-names-list">
                                ${companyData.allaNamn.map((namn, index) => `
                                    <div class="company-name-item ${index === 0 ? 'primary' : ''}">
                                        <span class="name-number">${index + 1}</span>
                                        <span class="name-text">${namn}</span>
                                        ${index === 0 ? '<span class="primary-badge">Huvudnamn</span>' : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}

                        <!-- Address Information Section -->
                        <div class="detailed-info-section">
                            <div class="section-header">
                                <i class="fas fa-map-marker-alt"></i>
                                <h4>Adressinformation</h4>
                            </div>
                            <div class="address-details">
                                <div class="address-item">
                                    <label>Gatuadress</label>
                                    <span>${formatValue(companyData.adress?.gatuadress)}</span>
                                </div>
                                <div class="address-item">
                                    <label>Postnummer</label>
                                    <span>${formatValue(companyData.adress?.postnummer)}</span>
                                </div>
                                <div class="address-item">
                                    <label>Postort</label>
                                    <span>${formatValue(companyData.adress?.postort)}</span>
                                </div>
                                <div class="address-item full-address">
                                    <label>Fullständig adress</label>
                                    <span>${formatValue(companyData.adress?.fullAddress)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Business Information Section -->
                        <div class="detailed-info-section">
                            <div class="section-header">
                                <i class="fas fa-briefcase"></i>
                                <h4>Verksamhetsinformation</h4>
                            </div>
                            <div class="business-details">
                                <div class="business-item">
                                    <label>Verksamhetsbeskrivning</label>
                                    <span>${formatValue(companyData.verksamhet)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- SNI Codes Section -->
                        <div class="detailed-info-section">
                            <div class="section-header">
                                <i class="fas fa-tags"></i>
                                <h4>SNI-koder</h4>
                            </div>
                            <div class="sni-codes-container">
                                ${companyData.sniKoder && companyData.sniKoder.length > 0 ? 
                                    companyData.sniKoder
                                        .filter(sni => sni.klartext && sni.klartext.trim() !== '')
                                        .map(sni => `
                                            <div class="sni-code-item">
                                                <span class="sni-code-badge">${formatValue(sni.kod)}</span>
                                                <span class="sni-description">${formatValue(sni.klartext)}</span>
                                            </div>
                                        `).join('')
                                    : '<div class="no-data">Inga SNI-koder tillgängliga</div>'
                                }
                            </div>
                        </div>

                        <!-- Additional Information Section -->
                        <div class="detailed-info-section">
                            <div class="section-header">
                                <i class="fas fa-info-circle"></i>
                                <h4>Övrig information</h4>
                            </div>
                            <div class="additional-details">
                                <div class="additional-item">
                                    <label>Antal anställda</label>
                                    <span>${formatValue(companyData.antal_anstallda)}</span>
                                </div>
                                <div class="additional-item">
                                    <label>Omsättning</label>
                                    <span>${formatValue(companyData.omsattning)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Tab 2: Roller -->
                    <div class="tab-pane" id="roller">
                        <div class="roles-section">
                            <h4><i class="fas fa-users-cog"></i> Roller och ansvar</h4>
                            <div class="role-info">
                                <p><strong>VD/Ansvarig:</strong> ${formatValue(companyData.namn)}</p>
                                <p><strong>Ekonomiansvarig:</strong> ${companyData.form === 'Aktiebolag' ? 'Krävs enligt lag' : 'Rekommenderas'}</p>
                                <p><strong>Riskansvarig:</strong> Under utveckling</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Tab 3: Riskbedömning -->
                    <div class="tab-pane" id="riskbedomning">
                        <div class="tab-placeholder">
                            <div class="placeholder-icon">
                                <i class="fas fa-shield-alt"></i>
                            </div>
                            <h4>Riskbedömning</h4>
                            <p>Här kommer riskbedömningsdata att visas när den är tillgänglig.</p>
                            <small>Funktionalitet under utveckling</small>
                        </div>
                    </div>
                    
                    <!-- Tab 3: Kundens tjänster -->
                    <div class="tab-pane" id="kundens-tjanster">
                        <div class="tab-placeholder">
                            <div class="placeholder-icon">
                                <i class="fas fa-cogs"></i>
                            </div>
                            <h4>Kundens tjänster</h4>
                            <p>Här kommer information om kundens tjänster att visas när den är tillgänglig.</p>
                            <small>Funktionalitet under utveckling</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        console.log('📝 Generated HTML:', html);
        console.log('🔍 HTML length:', html.length);
        companyDetails.innerHTML = html;
        companyInfoSection.style.display = 'block';
        
        // Debug: Check if elements are actually in the DOM
        setTimeout(() => {
            const verksamhetElement = document.querySelector('.business-item span');
            const registreringsdatumElement = document.querySelector('.overview-item:nth-child(2) span');
            console.log('🔍 DOM check:');
            console.log('  - verksamhet element:', verksamhetElement);
            console.log('  - registreringsdatum element:', registreringsdatumElement);
            if (verksamhetElement) console.log('  - verksamhet text:', verksamhetElement.textContent);
            if (registreringsdatumElement) console.log('  - registreringsdatum text:', registreringsdatumElement.textContent);
        }, 100);
        
        // Initialize tab functionality
        this.initTabs();
        
        // Scroll to company info
        companyInfoSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    initTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanes = document.querySelectorAll('.tab-pane');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all buttons and panes
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanes.forEach(pane => pane.classList.remove('active'));
                
                // Add active class to clicked button and corresponding pane
                button.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }
    
    hideCompanyInfo() {
        const companyInfoSection = document.getElementById('company-info');
        companyInfoSection.style.display = 'none';
        // Also hide any error messages
        this.hideError();
    }

    async goToKYC() {
        console.log('🚀 Navigating to KYC page...');
        
        const companyDetails = document.getElementById('company-details');
        console.log('🔍 Company details element:', companyDetails);
        console.log('🔍 Company details innerHTML length:', companyDetails?.innerHTML?.length || 0);
        
        if (!companyDetails || !companyDetails.innerHTML.trim()) {
            console.error('❌ No company details found');
            this.showMessage('Ingen företagsdata att gå vidare med', 'error');
            return;
        }
        
        // Get the current company data
        const companyData = this.currentCompanyData;
        console.log('🔍 Current company data:', companyData);
        console.log('🔍 Company data exists:', !!companyData);
        
        if (!companyData) {
            console.error('❌ No current company data available');
            this.showMessage('Ingen företagsdata tillgänglig', 'error');
            return;
        }
        
        try {
            console.log('💾 Storing company data in localStorage for KYC page...');
            
            // Store company data in localStorage for KYC page
            localStorage.setItem('kycCompanyData', JSON.stringify(companyData));
            console.log('✅ Company data stored in localStorage:', companyData);
            
            // Try to save to Airtable in background (non-blocking)
            console.log('🔍 Attempting to save to Airtable in background...');
            this.saveToAirtable().then(success => {
                if (success) {
                    console.log('✅ Successfully saved to Airtable in background');
                } else {
                    console.warn('⚠️ Failed to save to Airtable, but continuing to KYC');
                }
            }).catch(error => {
                console.warn('⚠️ Error saving to Airtable, but continuing to KYC:', error);
            });
            
            // Navigate to KYC page immediately
            console.log('🌐 Navigating to KYC page...');
            window.location.href = 'kyc.html';
            
        } catch (error) {
            console.error('❌ Error in goToKYC:', error);
            this.showMessage('Ett fel uppstod vid navigering till KYC-sidan', 'error');
        }
    }

    async saveToAirtable() {
        const companyDetails = document.getElementById('company-details');
        if (!companyDetails.innerHTML.trim()) {
            this.showMessage('Ingen företagsdata att spara', 'error');
            return false;
        }

        const saveBtn = document.getElementById('save-to-airtable');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...';
        saveBtn.disabled = true;

        try {
            // Get company data from the displayed information
            const companyData = this.extractCompanyDataFromDisplay();
            
            // Add user and bureau IDs with correct field names
            companyData.anvandareId = this.userId;
            companyData.byraId = this.bureauId;
            companyData.timestamp = new Date().toISOString();
            
            // Kontrollera att vi har rätt data
            if (!this.userId || !this.bureauId) {
                console.warn('⚠️ Varning: Saknar användar-ID eller byrå-ID:', {
                    userId: this.userId,
                    bureauId: this.bureauId
                });
            }

            // Debug: Log what we're sending
            console.log('🔍 Final data being sent to Airtable:', {
                companyData: companyData,
                userId: this.userId,
                bureauId: this.bureauId,
                hasUserId: !!this.userId,
                hasBureauId: !!this.bureauId,
                userIdType: typeof this.userId,
                bureauIdType: typeof this.bureauId
            });

            // Först testa debug-endpointen för att se vad som skickas
            console.log('🔍 Testing debug endpoint first...');
            const debugResponse = await fetch(`${this.baseUrl}/api/debug/save-to-airtable`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(companyData)
            });
            
            if (debugResponse.ok) {
                const debugData = await debugResponse.json();
                console.log('🔍 Debug endpoint response:', debugData);
            } else {
                console.warn('⚠️ Debug endpoint failed:', debugResponse.status);
            }
            
            // Sedan skicka till riktiga endpointen
            console.log('🔍 Sending to real Airtable endpoint...');
            let response;
            
            try {
                response = await fetch(`${this.baseUrl}/api/bolagsverket/save-to-airtable`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(companyData)
                });
            } catch (error) {
                console.warn('⚠️ Bolagsverket endpoint failed, trying simple endpoint:', error);
                
                // Fallback till enkel endpoint
                response = await fetch(`${this.baseUrl}/api/simple/save-to-airtable`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(companyData)
                });
            }

            // Debug: Log response details
            console.log('🔍 Response status:', response.status);
            console.log('🔍 Response headers:', response.headers);
            
            if (response.ok) {
                const responseData = await response.json();
                console.log('✅ Success response:', responseData);
                this.showMessage('Företagsdata sparad till Airtable!', 'success');
                return true;
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                console.error('❌ Error response:', errorData);
                throw new Error(`Failed to save to Airtable: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error saving to Airtable:', error);
            this.showMessage('Kunde inte spara till Airtable', 'error');
            return false;
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    extractCompanyDataFromDisplay() {
        // Use stored company data if available, otherwise extract from DOM
        if (this.currentCompanyData) {
            console.log('🔍 Using stored currentCompanyData:', this.currentCompanyData);
            return this.currentCompanyData;
        }
        
        // Fallback: Extract data from the displayed company information
        const companyName = document.querySelector('.company-basic h3')?.textContent || '';
        const orgNumber = document.querySelector('.org-number')?.textContent || '';
        const status = document.querySelector('.company-status')?.textContent.trim() || '';
        
        // Debug: Log what we found in DOM
        console.log('🔍 DOM elements found:', {
            companyName,
            companyNameElement: document.querySelector('.company-basic h3'),
            orgNumber,
            orgNumberElement: document.querySelector('.org-number'),
            status,
            statusElement: document.querySelector('.company-status')
        });
        
        // Debug: Log current userId and bureauId
        console.log('🔍 Current user data:', {
            userId: this.userId,
            bureauId: this.bureauId
        });
        
        const extractedData = {
            namn: companyName,
            organisationsnummer: orgNumber,
            status: status,
            // Add other fields as needed
        };
        
        console.log('🔍 Extracted data:', extractedData);
        return extractedData;
    }

    exportCompanyData() {
        const companyDetails = document.getElementById('company-details');
        if (!companyDetails.innerHTML.trim()) {
            this.showMessage('Ingen företagsdata att exportera', 'error');
            return;
        }

        // Create a simple export (you can enhance this)
        const exportData = {
            exportDate: new Date().toISOString(),
            companyInfo: this.extractCompanyDataFromDisplay()
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `company-data-${Date.now()}.json`;
        link.click();
        
        this.showMessage('Data exporterad!', 'success');
    }

    clearSearch() {
        document.getElementById('org-number').value = '';
        document.getElementById('company-info').style.display = 'none';
        document.getElementById('company-details').innerHTML = '';
    }

    addToRecentSearches(orgNumber, companyData) {
        const recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
        
        // Add new search to the beginning
        const newSearch = {
            orgNumber,
            companyName: companyData.namn || 'Okänt företag',
            timestamp: new Date().toISOString()
        };
        
        // Remove duplicates and keep only last 5 searches
        const filteredSearches = recentSearches.filter(search => search.orgNumber !== orgNumber);
        filteredSearches.unshift(newSearch);
        
        if (filteredSearches.length > 5) {
            filteredSearches.splice(5);
        }
        
        localStorage.setItem('recentSearches', JSON.stringify(filteredSearches));
    }



    showMessage(message, type = 'info') {
        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        // Add to page
        document.body.appendChild(messageEl);

        // Show message
        setTimeout(() => messageEl.classList.add('show'), 100);

        // Remove after 5 seconds
        setTimeout(() => {
            messageEl.classList.remove('show');
            setTimeout(() => messageEl.remove(), 300);
        }, 5000);
    }

    // Error handling methods
    showError(message, technicalDetails = null) {
        console.error('❌ Showing error to user:', message);
        
        // Hide company info and show error
        this.hideCompanyInfo();
        this.hideError();
        
        const errorSection = document.getElementById('error-message');
        const errorText = document.getElementById('error-text');
        const errorTechnical = document.getElementById('error-technical');
        const errorDetails = document.getElementById('error-details');
        
        // Set error message
        errorText.textContent = message;
        
        // Set technical details if provided
        if (technicalDetails) {
            errorTechnical.textContent = typeof technicalDetails === 'string' 
                ? technicalDetails 
                : JSON.stringify(technicalDetails, null, 2);
            errorDetails.style.display = 'block';
        } else {
            errorDetails.style.display = 'none';
        }
        
        // Show error section
        errorSection.style.display = 'block';
        
        // Scroll to error
        errorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    hideError() {
        const errorSection = document.getElementById('error-message');
        errorSection.style.display = 'none';
    }
    
    showLoadingError() {
        const errorSection = document.getElementById('error-message');
        const errorCard = errorSection.querySelector('.error-card');
        errorCard.classList.add('loading');
        
        const errorText = document.getElementById('error-text');
        errorText.textContent = 'Hämtar företagsdata...';
        
        errorSection.style.display = 'block';
    }
    
    hideLoadingError() {
        const errorSection = document.getElementById('error-message');
        const errorCard = errorSection.querySelector('.error-card');
        errorCard.classList.remove('loading');
        errorSection.style.display = 'none';
    }

    // Test navigation function for debugging
    testNavigation(pageName) {
        console.log('🧪 Test navigation to:', pageName);
        if (this.navigation) {
            this.navigation.navigateToPage(pageName);
        } else {
            console.error('❌ Navigation not initialized');
            // Fallback navigation
            window.location.href = `./${pageName}.html`;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.clientFlowApp = new ClientFlowApp();
});

// Make testNavigation globally available
window.testNavigation = function(pageName) {
    if (window.clientFlowApp) {
        window.clientFlowApp.testNavigation(pageName);
    } else {
        console.error('❌ ClientFlowApp not initialized');
        // Direct fallback navigation
        window.location.href = `./${pageName}.html`;
    }
};



