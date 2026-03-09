// Customer Card Management System
console.log('🔍 SCRIPT LOADED - Current URL:', window.location.href);
console.log('🔍 SCRIPT LOADED - URL search:', window.location.search);

function getAuthOptsKundkort() { return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } }; }
function isLoggedInKundkort() { return !!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()); }

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
        await this.loadDatasourceConfig();
        await this.loadUserData();
        this.setupEventListeners();
        this.setupTabNavigation();
        this.setupRollerEventDelegation();
        
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

    async loadDatasourceConfig() {
        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/datasource/config`);
            if (response.ok) {
                const config = await response.json();
                this.datasourceConfig = config;
                this.airtableApiKey = config.apiKey || (config.configured ? '***' : null);
            } else {
                console.warn('Could not load datasource config, using fallback');
                this.datasourceConfig = null;
                this.airtableApiKey = null;
            }
        } catch (error) {
            console.error('Error loading datasource config:', error);
        }
    }

    async loadUserData() {
        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/auth/me`, { method: 'GET', ...getAuthOptsKundkort() });
            if (!response.ok) {
                console.warn('User not logged in');
                return;
            }

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
            button.addEventListener('click', (e) => {
                e.preventDefault();
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

    switchToTab(targetTab) {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanes = document.querySelectorAll('.tab-pane');
        const button = document.querySelector(`.tab-button[data-tab="${targetTab}"]`);
        if (!button) return;
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => {
            pane.classList.remove('active');
            pane.style.display = 'none';
            pane.style.visibility = 'hidden';
            pane.style.opacity = '0';
        });
        button.classList.add('active');
        const targetPane = document.getElementById(targetTab);
        if (targetPane) {
            targetPane.classList.add('active');
            targetPane.style.display = 'block';
            targetPane.style.visibility = 'visible';
            targetPane.style.opacity = '1';
        }
    }

    setupRollerEventDelegation() {
        document.addEventListener('mousedown', (e) => {
            const pepBtn = e.target.closest('.btn-pep-screen');
            if (pepBtn) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const idx = parseInt(pepBtn.getAttribute('data-idx'), 10);
                if (!isNaN(idx) && idx >= 0) this.pepScreening(idx);
                return;
            }
        }, true);
        document.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.roller-edit-btn');
            if (editBtn) {
                e.preventDefault();
                e.stopPropagation();
                const idx = parseInt(editBtn.getAttribute('data-idx'), 10);
                if (!isNaN(idx) && idx >= 0) this.editRollePerson(idx);
                return;
            }
            const delBtn = e.target.closest('.roller-delete-btn');
            if (delBtn) {
                e.preventDefault();
                e.stopPropagation();
                const idx = parseInt(delBtn.getAttribute('data-idx'), 10);
                if (!isNaN(idx) && idx >= 0) this.deleteRollePerson(idx);
            }
        }, true);
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
            if (!isLoggedInKundkort()) {
                console.error('❌ Not logged in');
                this.showError('Du måste logga in för att se kundinformation');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 3000);
                return;
            }

            const response = await fetch(apiUrl, {
                method: 'GET',
                ...getAuthOptsKundkort()
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
                const urlParams = new URLSearchParams(window.location.search);
                const noteId = urlParams.get('note');
                const hash = (window.location.hash || '').replace('#', '');
                const shouldOpenAnteckningar = noteId || hash === 'anteckningar';
                const shouldOpenAvvikelser = hash === 'avvikelser';
                const initialTab = shouldOpenAnteckningar ? 'anteckningar' : (shouldOpenAvvikelser ? 'avvikelser' : 'foretagsinformation');
                this.switchToTab(initialTab);
                this.loadTabContent(initialTab);
                
                // Force visibility after data is loaded
                setTimeout(() => {
                    this.ensureFirstTabVisible();
                    this.forceTabVisibility();
                }, 200);
            } else {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 404) {
                    const isOldAirtableId = this.customerId && /^rec[A-Za-z0-9]+$/.test(String(this.customerId));
                    if (isOldAirtableId) {
                        this.showError('Kunden hittades inte. Denna länk använder ett gammalt ID – öppna kunden från Kundlista istället.', { link: { href: 'kundlista.html', text: 'Öppna Kundlista' } });
                    } else {
                        this.showError('Kunden hittades inte');
                    }
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
                // Fliken Roller är borttagen — roller visas på Företagsinformation
                break;
            case 'uppdragsavtal':
                this.loadUppdragsavtal();
                break;
            case 'ovrigkyc':
                this.loadOvrigKYC();
                break;
            case 'anteckningar':
                this.loadNotes();
                break;
            case 'avvikelser':
                this.loadAvvikelser();
                break;
            case 'dokumentation':
                this.loadDocuments();
                break;
        }
    }

    loadCompanyInfo() {
        const container = document.getElementById('foretagsinformation-content');
        if (!container) return;

        if (!this.customerData) {
            container.innerHTML = '<p class="lead-empty">Ingen företagsinformation tillgänglig.</p>';
            return;
        }

        const fields = this.customerData.fields || {};
        console.log('📋 Loading company info with fields:', fields);

        const fmt = (val) => {
            if (!val || val === 'N/A' || val === 'null' || val === 'undefined' || val === '') {
                return '<span class="missing-data">Saknas</span>';
            }
            return val;
        };

        // Namn och orgnr
        const namn = fields.Namn || fields.namn || '';
        const orgnr = fields.Orgnr || fields.orgnr || '';
        const status = fields['aktiv/inaktiv'] || '';
        const regdatum = fields.regdatum || '';
        const regland = fields.registreringsland || '';
        const bolagsform = fields.Bolagsform || '';
        const adress = fields.Address || fields.Adress || '';
        const verksamhet = fields.Verksamhetsbeskrivning || fields['Beskrivning av kunden'] || '';
        const sniRaw = fields['SNI kod'] || fields['SNI-koder'] || '';
        const befattning = fields.Befattningshavare || '';

        // SNI-koder — sparade som "62010 Dataprogrammering\n62020 Konsultverksamhet"
        let sniHTML = '<span class="lead-empty">Saknas</span>';
        if (sniRaw) {
            const rows = sniRaw.split('\n').map(r => r.trim()).filter(Boolean);
            if (rows.length > 0) {
                sniHTML = rows.map(row => {
                    const spaceIdx = row.indexOf(' ');
                    if (spaceIdx > 0) {
                        const kod = row.substring(0, spaceIdx);
                        const label = row.substring(spaceIdx + 1);
                        return `<span class="sni-code-badge">${kod}</span><span class="sni-code-label">${label}</span>`;
                    }
                    return `<span class="sni-code-badge">${row}</span>`;
                }).join('');
            }
        }

        // Befattningshavare — kan vara JSON-array eller gammal textsträng
        const kontaktPersonerRaw = fields['Kontaktpersoner'] || fields['Befattningshavare'] || '';
        let kontaktPersoner = [];
        try {
            if (kontaktPersonerRaw && kontaktPersonerRaw.trim().startsWith('[')) {
                kontaktPersoner = (JSON.parse(kontaktPersonerRaw) || []).map(p => {
                    const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
                    return { ...p, roller, roll: undefined };
                });
            } else if (kontaktPersonerRaw) {
                // Bakåtkompatibilitet: "Anna Svensson (VD)\nKalle Karlsson (Styrelseledamot)"
                kontaktPersoner = kontaktPersonerRaw.split('\n').map(r => r.trim()).filter(Boolean).map(r => {
                    const match = r.match(/^(.+?)\s*\((.+)\)$/);
                    const roll = match ? match[2].trim() : '';
                    return { namn: match ? match[1].trim() : r, roller: roll ? [roll] : [], epost: '', personnr: '' };
                });
            }
        } catch(e) { kontaktPersoner = []; }

        // Om enskild firma: skapa automatiskt kontaktperson med företagets namn som Ägare EF och Verklig huvudman
        const arEnskildFirma = bolagsform === 'Enskild firma';
        const harAgareEF = kontaktPersoner.some(p => (p.roller || []).includes('Ägare EF') || p.roll === 'Ägare EF');
        if (arEnskildFirma && !harAgareEF && namn) {
            const agare = {
                namn: namn.trim(),
                roller: ['Ägare EF', 'Verklig huvudman'],
                epost: fields['e-post'] || fields['Email'] || fields['E-post'] || '',
                personnr: orgnr || ''
            };
            kontaktPersoner = [agare, ...kontaktPersoner];
            this._kontaktPersoner = kontaktPersoner;
            this._saveKontaktPersoner({ 'Verklig huvudman': namn.trim() }); // Spara kontaktperson + Verklig huvudman
        }

        // Om fysisk person (ej EF) och ingen Ägare EF finns — skapa en automatiskt
        const arFysiskPerson = bolagsform === 'Fysiska personer';
        if (arFysiskPerson && !harAgareEF && namn) {
            const agare = {
                namn: namn.trim(),
                roller: ['Ägare EF'],
                epost: fields['e-post'] || fields['Email'] || fields['E-post'] || '',
                personnr: orgnr || ''
            };
            kontaktPersoner = [agare, ...kontaktPersoner];
        }

        this._kontaktPersoner = kontaktPersoner;

        const rollerHTML = this._renderRollerView(kontaktPersoner);

        // Redigerbara kunduppgifter
        const email = fields['e-post'] || fields['Email'] || fields['E-post'] || '';
        const telefon = fields['Telefonnr'] || fields['telefon'] || '';
        const kundBeskrivning = fields['Beskrivning av kunden'] || '';

        // Redovisningsuppgifter
        const redovisningsmetod = fields['Redovisningsmetod'] || '';
        const redovisningsperiod = fields['Redovisningsperiod'] || '';
        const rakenskapsår = fields['Räkenskapsår'] || '';
        const bokforingsprogramRaw = fields['Bokforingsprogram'] || fields['Bokföringsprogram'] || '';
        const bokforingsprogram = bokforingsprogramRaw === 'Spirius' ? 'Spiris' : bokforingsprogramRaw;
        const bank = fields['Bank'] || '';

        const mis = '<span class="missing-data">Ej angiven</span>';

        container.innerHTML = `

            <!-- KORT 1: Uppgifter från Bolagsverket -->
            <div class="collapsible-card" id="bolagsverket-card" >
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('bolagsverket-card')">
                    <div class="collapsible-title"><i class="fas fa-building"></i><span>Uppgifter från Bolagsverket</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body">
                    <div class="lead-fields">
                        <div class="lead-field"><label>Företagsnamn</label><span>${fmt(namn)}</span></div>
                        <div class="lead-field"><label>Organisationsnummer</label><span>${fmt(orgnr)}</span></div>
                        <div class="lead-field"><label>Registreringsdatum</label><span>${fmt(regdatum)}</span></div>
                        <div class="lead-field"><label>Registreringsland</label><span>${fmt(regland)}</span></div>
                        <div class="lead-field"><label>Organisationsform</label><span>${fmt(bolagsform)}</span></div>
                        <div class="lead-field lead-field--full"><label>Adress</label><span>${fmt(adress)}</span></div>
                        <div class="lead-field lead-field--full"><label>Verksamhetsbeskrivning</label><span>${fmt(verksamhet)}</span></div>
                    </div>
                    <div class="lead-section" style="margin-top:1rem;">
                        <label>SNI-koder</label>
                        <div class="lead-sni">${sniHTML}</div>
                    </div>
                </div>
            </div>

            <!-- KORT 2: Kontaktuppgifter -->
            <div class="collapsible-card is-collapsed" id="kunduppgifter-card">
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('kunduppgifter-card')">
                    <div class="collapsible-title"><i class="fas fa-address-card"></i><span>Kontaktuppgifter</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body" id="kunduppgifter-collapsible-body">
                    <div id="kunduppgifter-view" class="kunduppgifter-view">
                        <div class="kunduppgifter-row">
                            <span class="kunduppgifter-label"><i class="fas fa-envelope"></i> E-post</span>
                            <span class="kunduppgifter-value" id="ku-email-view">${email || mis}</span>
                        </div>
                        <div class="kunduppgifter-row">
                            <span class="kunduppgifter-label"><i class="fas fa-phone"></i> Telefonnummer</span>
                            <span class="kunduppgifter-value" id="ku-telefon-view">${telefon || mis}</span>
                        </div>
                    </div>
                    <div id="kunduppgifter-edit" class="kunduppgifter-edit" style="display:none;">
                        <div class="kunduppgifter-form-row">
                            <label for="ku-email-input"><i class="fas fa-envelope"></i> E-post</label>
                            <input type="email" id="ku-email-input" class="kunduppgifter-input" value="${email}" placeholder="exempel@foretag.se">
                        </div>
                        <div class="kunduppgifter-form-row">
                            <label for="ku-telefon-input"><i class="fas fa-phone"></i> Telefonnummer</label>
                            <input type="text" id="ku-telefon-input" class="kunduppgifter-input" value="${telefon}" placeholder="08-123 456 78">
                        </div>
                        <div class="kunduppgifter-actions">
                            <button class="btn btn-primary btn-sm" onclick="customerCardManager.saveKunduppgifter()"><i class="fas fa-save"></i> Spara</button>
                            <button class="btn btn-ghost btn-sm" onclick="customerCardManager.toggleKunduppgifterEdit()">Avbryt</button>
                        </div>
                    </div>
                    <button class="card-edit-fab" id="kunduppgifter-edit-btn" title="Redigera" onclick="event.stopPropagation(); customerCardManager.toggleKunduppgifterEdit()">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
            </div>

            <!-- KORT 3: Beskrivning av kunden -->
            <div class="collapsible-card is-collapsed" id="beskrivning-card">
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('beskrivning-card')">
                    <div class="collapsible-title"><i class="fas fa-align-left"></i><span>Beskrivning av kunden</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body" style="position:relative;">
                    <div id="beskrivning-view">
                        <div id="ku-beskrivning-view" class="kunduppgifter-beskrivning-view">${kundBeskrivning || mis}</div>
                    </div>
                    <div id="beskrivning-edit" style="display:none;">
                        <div class="richtext-toolbar">
                            <button type="button" title="Fet" onclick="document.execCommand('bold')"><b>B</b></button>
                            <button type="button" title="Punktlista" onclick="document.execCommand('insertUnorderedList')"><i class="fas fa-list-ul"></i></button>
                        </div>
                        <div id="ku-beskrivning-input" class="kunduppgifter-richtext" contenteditable="true"
                             data-placeholder="Beskriv kundens verksamhet, bakgrund eller övrigt...">${kundBeskrivning}</div>
                        <div class="kunduppgifter-actions">
                            <button class="btn btn-primary btn-sm" onclick="customerCardManager.saveBeskrivning()"><i class="fas fa-save"></i> Spara</button>
                            <button class="btn btn-ghost btn-sm" onclick="customerCardManager.toggleBeskrivningEdit()">Avbryt</button>
                        </div>
                    </div>
                    <button class="card-edit-fab" id="beskrivning-edit-btn" title="Redigera" onclick="event.stopPropagation(); customerCardManager.toggleBeskrivningEdit()">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
            </div>

            <!-- KORT 4: Redovisningsuppgifter -->
            <div class="collapsible-card is-collapsed" id="redovisning-card">
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('redovisning-card')">
                    <div class="collapsible-title"><i class="fas fa-calculator"></i><span>Redovisningsuppgifter</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body" style="position:relative;">
                    <div id="redovisning-view" class="kunduppgifter-view kunduppgifter-view--aligned">
                        <div class="kunduppgifter-row">
                            <span class="kunduppgifter-label"><i class="fas fa-file-invoice"></i> Redovisningsmetod</span>
                            <span class="kunduppgifter-value" id="redov-metod-view">${redovisningsmetod || mis}</span>
                        </div>
                        <div class="kunduppgifter-row">
                            <span class="kunduppgifter-label"><i class="fas fa-calendar-alt"></i> Redovisningsperiod (moms)</span>
                            <span class="kunduppgifter-value" id="redov-period-view">${redovisningsperiod || mis}</span>
                        </div>
                        <div class="kunduppgifter-row">
                            <span class="kunduppgifter-label"><i class="fas fa-calendar-check"></i> Räkenskapsår</span>
                            <span class="kunduppgifter-value" id="redov-rakenskapsår-view">${rakenskapsår || mis}</span>
                        </div>
                        <div class="kunduppgifter-row">
                            <span class="kunduppgifter-label"><i class="fas fa-laptop"></i> Bokföringsprogram</span>
                            <span class="kunduppgifter-value" id="redov-bokforing-view">${bokforingsprogram || mis}</span>
                        </div>
                        <div class="kunduppgifter-row">
                            <span class="kunduppgifter-label"><i class="fas fa-university"></i> Bank</span>
                            <span class="kunduppgifter-value" id="redov-bank-view">${bank || mis}</span>
                        </div>
                    </div>
                    <div id="redovisning-edit" style="display:none;">
                        <div class="collapsible-edit-grid">
                            <div class="kunduppgifter-form-row">
                                <label>Redovisningsmetod</label>
                                <select id="redov-metod-input" class="kunduppgifter-input">
                                    <option value="">Välj...</option>
                                    <option value="Bokslutsmetoden" ${redovisningsmetod === 'Bokslutsmetoden' ? 'selected' : ''}>Bokslutsmetoden</option>
                                    <option value="Fakturametoden" ${redovisningsmetod === 'Fakturametoden' ? 'selected' : ''}>Fakturametoden</option>
                                </select>
                            </div>
                            <div class="kunduppgifter-form-row">
                                <label>Redovisningsperiod (moms)</label>
                                <select id="redov-period-input" class="kunduppgifter-input">
                                    <option value="">Välj...</option>
                                    <option value="Ej registrerad för moms" ${redovisningsperiod === 'Ej registrerad för moms' ? 'selected' : ''}>Ej registrerad för moms</option>
                                    <option value="Månad" ${redovisningsperiod === 'Månad' ? 'selected' : ''}>Månad</option>
                                    <option value="Kvartal" ${redovisningsperiod === 'Kvartal' ? 'selected' : ''}>Kvartal</option>
                                    <option value="Årsvis i samband med deklarationen" ${redovisningsperiod === 'Årsvis i samband med deklarationen' ? 'selected' : ''}>Årsvis i samband med deklarationen</option>
                                    <option value="Årsvis, 26/2" ${redovisningsperiod === 'Årsvis, 26/2' ? 'selected' : ''}>Årsvis, 26/2</option>
                                </select>
                            </div>
                            <div class="kunduppgifter-form-row">
                                <label>Räkenskapsår</label>
                                <input type="text" id="redov-rakenskapsår-input" class="kunduppgifter-input"
                                    value="${rakenskapsår}" placeholder="t.ex. 0101-1231 eller 0501-0430">
                            </div>
                            <div class="kunduppgifter-form-row">
                                <label>Bokföringsprogram</label>
                                <select id="redov-bokforing-input" class="kunduppgifter-input">
                                    <option value="">Välj...</option>
                                    <option value="Fortnox" ${bokforingsprogram === 'Fortnox' ? 'selected' : ''}>Fortnox</option>
                                    <option value="Visma Spcs" ${bokforingsprogram === 'Visma Spcs' ? 'selected' : ''}>Visma Spcs</option>
                                    <option value="Visma eEkonomi" ${bokforingsprogram === 'Visma eEkonomi' ? 'selected' : ''}>Visma eEkonomi</option>
                                    <option value="Bokio" ${bokforingsprogram === 'Bokio' ? 'selected' : ''}>Bokio</option>
                                    <option value="SpeedLedger" ${bokforingsprogram === 'SpeedLedger' ? 'selected' : ''}>SpeedLedger</option>
                                    <option value="Kassabok" ${bokforingsprogram === 'Kassabok' ? 'selected' : ''}>Kassabok</option>
                                    <option value="Spiris" ${bokforingsprogram === 'Spiris' ? 'selected' : ''}>Spiris</option>
                                    <option value="PE Accounting" ${bokforingsprogram === 'PE Accounting' ? 'selected' : ''}>PE Accounting</option>
                                    <option value="Hogia" ${bokforingsprogram === 'Hogia' ? 'selected' : ''}>Hogia</option>
                                    <option value="Björn Lundén" ${bokforingsprogram === 'Björn Lundén' ? 'selected' : ''}>Björn Lundén</option>
                                    <option value="Annat" ${bokforingsprogram === 'Annat' ? 'selected' : ''}>Annat</option>
                                </select>
                            </div>
                            <div class="kunduppgifter-form-row">
                                <label>Bank</label>
                                <select id="redov-bank-input" class="kunduppgifter-input">
                                    <option value="">Välj...</option>
                                    <option value="Swedbank" ${bank === 'Swedbank' ? 'selected' : ''}>Swedbank</option>
                                    <option value="Handelsbanken" ${bank === 'Handelsbanken' ? 'selected' : ''}>Handelsbanken</option>
                                    <option value="SEB" ${bank === 'SEB' ? 'selected' : ''}>SEB</option>
                                    <option value="Nordea" ${bank === 'Nordea' ? 'selected' : ''}>Nordea</option>
                                    <option value="Danske Bank" ${bank === 'Danske Bank' ? 'selected' : ''}>Danske Bank</option>
                                    <option value="ICA Banken" ${bank === 'ICA Banken' ? 'selected' : ''}>ICA Banken</option>
                                    <option value="Länsförsäkringar Bank" ${bank === 'Länsförsäkringar Bank' ? 'selected' : ''}>Länsförsäkringar Bank</option>
                                    <option value="Sparbanken" ${bank === 'Sparbanken' ? 'selected' : ''}>Sparbanken</option>
                                    <option value="Marginalen Bank" ${bank === 'Marginalen Bank' ? 'selected' : ''}>Marginalen Bank</option>
                                    <option value="Annan" ${bank === 'Annan' ? 'selected' : ''}>Annan</option>
                                </select>
                            </div>
                        </div>
                        <div class="kunduppgifter-actions">
                            <button class="btn btn-primary btn-sm" onclick="customerCardManager.saveRedovisning()"><i class="fas fa-save"></i> Spara</button>
                            <button class="btn btn-ghost btn-sm" onclick="customerCardManager.toggleRedovisningEdit()">Avbryt</button>
                        </div>
                    </div>
                    <button class="card-edit-fab" id="redovisning-edit-btn" title="Redigera" onclick="event.stopPropagation(); customerCardManager.toggleRedovisningEdit()">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
            </div>

            <!-- KORT 5: Roller -->
            <div class="collapsible-card is-collapsed" id="roller-card">
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('roller-card')">
                    <div class="collapsible-title"><i class="fas fa-users"></i><span>Roller</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body">
                    <div id="roles-list" class="roles-list">${rollerHTML}</div>
                    <div style="margin-top:0.75rem;">
                        <button type="button" class="btn btn-ghost btn-sm" onclick="customerCardManager.addRollePerson()"><i class="fas fa-plus"></i> Lägg till</button>
                    </div>
                </div>
            </div>
        `;

        console.log('✅ Company info loaded with lead-card layout');
    }

    toggleKunduppgifterEdit() {
        this._ensureCardOpen('kunduppgifter-card');
        const view = document.getElementById('kunduppgifter-view');
        const edit = document.getElementById('kunduppgifter-edit');
        const btn = document.getElementById('kunduppgifter-edit-btn');
        if (!view || !edit) return;
        const isEditing = edit.style.display !== 'none';
        if (isEditing) {
            edit.style.display = 'none';
            view.style.display = '';
            if (btn) btn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        } else {
            view.style.display = 'none';
            edit.style.display = '';
            if (btn) btn.innerHTML = '<i class="fas fa-times"></i>';
        }
    }

    async saveKunduppgifter() {
        const customerId = this.customerId;
        if (!customerId) {
            this.showNotification('Kund-ID saknas', 'error');
            return;
        }

        const email = document.getElementById('ku-email-input')?.value.trim() || '';
        const telefon = document.getElementById('ku-telefon-input')?.value.trim() || '';
        const beskrivning = ''; // Beskrivning sparas nu separat via saveBeskrivning

        const saveBtn = document.querySelector('#kunduppgifter-edit .btn-primary');
        const originalText = saveBtn?.innerHTML;
        if (saveBtn) { saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; saveBtn.disabled = true; }

        try {
            if (!isLoggedInKundkort()) {
                throw new Error('Inte inloggad');
            }
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

            const fields = {};
            if (email) fields['e-post'] = email;
            if (telefon) fields['Telefonnr'] = telefon;

            const response = await fetch(`${baseUrl}/api/kunddata/${customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            const missing = '<span class="missing-data">Ej angiven</span>';
            const emailEl = document.getElementById('ku-email-view');
            const telefonEl = document.getElementById('ku-telefon-view');
            if (emailEl) emailEl.innerHTML = email || missing;
            if (telefonEl) telefonEl.innerHTML = telefon || missing;

            if (this.customerData?.fields) {
                this.customerData.fields['e-post'] = email;
                this.customerData.fields['Telefonnr'] = telefon;
            }

            this.toggleKunduppgifterEdit();
            this.showNotification('Kontaktuppgifter sparade!', 'success');

        } catch (error) {
            console.error('❌ Fel vid sparande av kunduppgifter:', error);
            this.showNotification(`Kunde inte spara: ${error.message}`, 'error');
        } finally {
            if (saveBtn) { saveBtn.innerHTML = originalText; saveBtn.disabled = false; }
        }
    }

    toggleCard(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        card.classList.toggle('is-collapsed');
    }

    _ensureCardOpen(cardId) {
        const card = document.getElementById(cardId);
        if (card) card.classList.remove('is-collapsed');
    }

    toggleBeskrivningEdit() {
        this._ensureCardOpen('beskrivning-card');
        const view = document.getElementById('beskrivning-view');
        const edit = document.getElementById('beskrivning-edit');
        const btn = document.getElementById('beskrivning-edit-btn');
        if (!view || !edit) return;
        const isEditing = edit.style.display !== 'none';
        if (isEditing) {
            edit.style.display = 'none';
            view.style.display = '';
            if (btn) btn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        } else {
            view.style.display = 'none';
            edit.style.display = '';
            if (btn) btn.innerHTML = '<i class="fas fa-times"></i>';
        }
    }

    async saveBeskrivning() {
        const customerId = this.customerId;
        if (!customerId) { this.showNotification('Kund-ID saknas', 'error'); return; }

        const beskrivningEl = document.getElementById('ku-beskrivning-input');
        const beskrivning = beskrivningEl?.innerHTML.trim() || '';

        const saveBtn = document.querySelector('#beskrivning-edit .btn-primary');
        const orig = saveBtn?.innerHTML;
        if (saveBtn) { saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; saveBtn.disabled = true; }

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const response = await fetch(`${baseUrl}/api/kunddata/${customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields: { 'Beskrivning av kunden': beskrivning } })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }
            const viewEl = document.getElementById('ku-beskrivning-view');
            if (viewEl) viewEl.innerHTML = beskrivning || '<span class="missing-data">Ej angiven</span>';
            if (this.customerData?.fields) this.customerData.fields['Beskrivning av kunden'] = beskrivning;
            this.toggleBeskrivningEdit();
            this.showNotification('Beskrivning sparad!', 'success');
        } catch (error) {
            this.showNotification(`Kunde inte spara: ${error.message}`, 'error');
        } finally {
            if (saveBtn) { saveBtn.innerHTML = orig; saveBtn.disabled = false; }
        }
    }

    toggleRedovisningEdit() {
        this._ensureCardOpen('redovisning-card');
        const view = document.getElementById('redovisning-view');
        const edit = document.getElementById('redovisning-edit');
        const btn = document.getElementById('redovisning-edit-btn');
        if (!view || !edit) return;
        const isEditing = edit.style.display !== 'none';
        if (isEditing) {
            edit.style.display = 'none';
            view.style.display = '';
            if (btn) btn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        } else {
            view.style.display = 'none';
            edit.style.display = '';
            if (btn) btn.innerHTML = '<i class="fas fa-times"></i>';
        }
    }

    async saveRedovisning() {
        const customerId = this.customerId;
        if (!customerId) { this.showNotification('Kund-ID saknas', 'error'); return; }

        const metod = document.getElementById('redov-metod-input')?.value || '';
        const period = document.getElementById('redov-period-input')?.value || '';
        const rakenskapsår = document.getElementById('redov-rakenskapsår-input')?.value.trim() || '';
        const bokforing = document.getElementById('redov-bokforing-input')?.value || '';
        const bank = document.getElementById('redov-bank-input')?.value || '';

        const saveBtn = document.querySelector('#redovisning-edit .btn-primary');
        const orig = saveBtn?.innerHTML;
        if (saveBtn) { saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; saveBtn.disabled = true; }

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const fields = {};
            if (metod) fields['Redovisningsmetod'] = metod;
            if (period) fields['Redovisningsperiod'] = period;
            if (rakenskapsår) fields['Räkenskapsår'] = rakenskapsår;
            // Skicka "Spirius" till Airtable (befintligt val) så att inte nytt alternativ skapas – visning är "Spiris"
            if (bokforing) fields['Bokforingsprogram'] = bokforing === 'Spiris' ? 'Spirius' : bokforing;
            if (bank) fields['Bank'] = bank;

            const response = await fetch(`${baseUrl}/api/kunddata/${customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }
            const mis = '<span class="missing-data">Ej angiven</span>';
            const metodEl = document.getElementById('redov-metod-view');
            const periodEl = document.getElementById('redov-period-view');
            const rakEl = document.getElementById('redov-rakenskapsår-view');
            const bokEl = document.getElementById('redov-bokforing-view');
            const bankEl = document.getElementById('redov-bank-view');
            if (metodEl) metodEl.innerHTML = metod || mis;
            if (periodEl) periodEl.innerHTML = period || mis;
            if (rakEl) rakEl.innerHTML = rakenskapsår || mis;
            if (bokEl) bokEl.innerHTML = bokforing || mis;
            if (bankEl) bankEl.innerHTML = bank || mis;

            if (this.customerData?.fields) {
                this.customerData.fields['Redovisningsmetod'] = metod;
                this.customerData.fields['Redovisningsperiod'] = period;
                this.customerData.fields['Räkenskapsår'] = rakenskapsår;
                this.customerData.fields['Bokforingsprogram'] = bokforing;
                this.customerData.fields['Bank'] = bank;
            }
            this.toggleRedovisningEdit();
            this.showNotification('Redovisningsuppgifter sparade!', 'success');
        } catch (error) {
            this.showNotification(`Kunde inte spara: ${error.message}`, 'error');
        } finally {
            if (saveBtn) { saveBtn.innerHTML = orig; saveBtn.disabled = false; }
        }
    }

    async loadRoles() {
        if (!this.customerData || !this.customerData.fields) {
            this.displayEmptyRoles();
            return;
        }

        const fields = this.customerData.fields;
        // Befattningshavare är sparat som "Anna Svensson (VD)\nKalle Karlsson (Styrelseledamot)"
        const befattning = fields['Befattningshavare'] || '';

        if (!befattning.trim()) {
            this.displayEmptyRoles();
            return;
        }

        const roller = befattning.split('\n')
            .map(r => r.trim())
            .filter(Boolean)
            .map(r => {
                const match = r.match(/^(.+?)\s*\((.+)\)$/);
                return match
                    ? { namn: match[1].trim(), roll: match[2].trim() }
                    : { namn: r, roll: '' };
            });

        this.displayRoles(roller);
    }

    showNotification(message, type = 'success') {
        // Ta bort eventuell befintlig notis
        const existing = document.getElementById('kundkort-notification');
        if (existing) existing.remove();

        const colors = { success: '#10b981', error: '#ef4444', info: '#6366f1' };
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };

        const el = document.createElement('div');
        el.id = 'kundkort-notification';
        el.style.cssText = `
            position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999;
            background: ${colors[type] || colors.info};
            color: #fff; padding: 0.85rem 1.2rem;
            border-radius: 10px; font-size: 0.9rem; font-weight: 500;
            display: flex; align-items: center; gap: 0.5rem;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            animation: slideInRight 0.2s ease;
        `;
        el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    _rollerAlternativ() {
        return ['Styrelseledamot', 'Revisor', 'VD', 'Suppleant', 'Firmatecknare', 'Ägare EF', 'Ombud', 'Verklig huvudman', 'Befattningshavare'];
    }

    _renderRollerView(personer) {
        if (!personer || personer.length === 0) {
            return `<span class="lead-empty">Inga kontaktpersoner registrerade. Klicka på <strong>Lägg till</strong> för att lägga till.</span>`;
        }
        return `<div class="roller-person-list">
            ${personer.map((p, idx) => {
                const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
                const rollText = roller.length ? roller.join(', ') : '';
                const pepDatum = p.pepSoktDatum ? new Date(p.pepSoktDatum).toLocaleDateString('sv-SE') : '';
                return `
                <div class="roller-person-item" data-idx="${idx}">
                    <div class="roller-person-info">
                        <div class="roller-person-name-row">
                            <span class="roller-person-name"><i class="fas fa-user"></i> ${this._esc(p.namn || 'Namnlös')}</span>
                            ${pepDatum ? `<span class="roller-person-pep-datum" title="Senaste PEP-sökning"><i class="fas fa-search-dollar"></i> ${pepDatum}</span>` : ''}
                        </div>
                        ${rollText ? `<div class="roller-person-meta"><span class="roller-person-roll">${this._esc(rollText)}</span></div>` : ''}
                    </div>
                    <div class="roller-person-details">
                        ${p.epost ? `<span class="roller-detail-chip"><i class="fas fa-envelope"></i> ${this._esc(p.epost)}</span>` : '<span class="roller-detail-chip roller-detail-missing"><i class="fas fa-envelope"></i> E-post saknas</span>'}
                        ${p.personnr ? `<span class="roller-detail-chip"><i class="fas fa-id-card"></i> ${this._esc(p.personnr)}</span>` : '<span class="roller-detail-chip roller-detail-missing"><i class="fas fa-id-card"></i> Personnr saknas</span>'}
                    </div>
                    <div class="roller-person-actions">
                        <a href="javascript:void(0)" role="button" class="btn-icon-note btn-pep-screen" title="PEP & Sanktionsscreening" data-idx="${idx}" id="pep-btn-${idx}" onclick="event.preventDefault();event.stopPropagation();customerCardManager.pepScreening(${idx});return false;">
                            <i class="fas fa-search-dollar"></i>
                        </a>
                        <button type="button" class="btn-icon-note roller-edit-btn" title="Redigera" data-idx="${idx}"><i class="fas fa-edit"></i></button>
                        <button type="button" class="btn-icon-note btn-icon-delete roller-delete-btn" title="Ta bort" data-idx="${idx}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    }

    _esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    _kycStatusIcon(fältnamn, värde, iconClass) {
        const done = värde === true;
        const safeField = fältnamn.replace(/'/g, "\\'");
        const title = done ? 'Klarmarkerad' : 'Ej genomgången';
        return `<i class="fas ${iconClass} kyc-status-icon" id="kyc-icon-${safeField.replace(/\s+/g,'-')}"
            style="color:var(--accent,#667eea);transition:color 0.2s;"
            title="${title}">
        </i>`;
    }

    async _saveKycStatus(fältnamn, värde, ikonEl) {
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const response = await fetch(`${baseUrl}/api/kunddata/${this.customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields: { [fältnamn]: värde } })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            if (this.customerData?.fields) this.customerData.fields[fältnamn] = värde;
            this._updateUppdragAntasLock();
            const el = ikonEl || document.getElementById('kyc-icon-' + String(fältnamn).replace(/\s+/g, '-'));
            if (el) {
                el.style.color = 'var(--accent, #667eea)';
                el.title = värde ? 'Klarmarkerad' : 'Ej genomgången';
            }
        } catch (error) {
            console.error('❌ Fel vid sparande av KYC-status:', error);
            this.showNotification('Kunde inte spara: ' + error.message, 'error');
        }
    }

    _updateUppdragAntasLock() {
        // Inget krav på klarmarkering längre – checkboxen är alltid tillgänglig
    }

    async saveUppdragKanAntas(checked) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const fields = checked
            ? { 'Uppdraget kan antas': true, 'Avtalet gäller ifrån': today }
            : { 'Uppdraget kan antas': false };

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const response = await fetch(`${baseUrl}/api/kunddata/${this.customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            if (this.customerData?.fields) {
                this.customerData.fields['Uppdraget kan antas'] = checked;
                this.customerData.fields['Avtalet gäller ifrån'] = checked ? today : null;
            }

            // Visa datum bredvid checkboxen
            const datumEl = document.querySelector('.uppdrag-antas-datum');
            if (checked) {
                const fmtDate = new Date(today).toLocaleDateString('sv-SE');
                if (datumEl) {
                    datumEl.innerHTML = `<i class="fas fa-calendar-check"></i> ${fmtDate}`;
                } else {
                    const row = document.querySelector('.uppdrag-antas-row');
                    if (row) {
                        const span = document.createElement('span');
                        span.className = 'uppdrag-antas-datum';
                        span.innerHTML = `<i class="fas fa-calendar-check"></i> ${fmtDate}`;
                        row.appendChild(span);
                    }
                }
            } else if (datumEl) {
                datumEl.remove();
            }

            this.showNotification(checked ? 'Uppdraget markerat som godkänt ✅' : 'Godkännande borttaget', checked ? 'success' : 'info');
        } catch (error) {
            console.error('❌ Fel vid sparande av uppdragsstatus:', error);
            this.showNotification('Kunde inte spara: ' + error.message, 'error');
        }
    }

    _refreshRollerList() {
        const el = document.getElementById('roles-list');
        if (el) el.innerHTML = this._renderRollerView(this._kontaktPersoner || []);
    }

    addRollePerson() {
        this._ensureCardOpen('roller-card');
        this._showRollePersonModal(null, null);
    }

    editRollePerson(idx) {
        const p = (this._kontaktPersoner || [])[idx];
        this._showRollePersonModal(p, idx);
    }

    deleteRollePerson(idx) {
        if (!confirm('Ta bort kontaktpersonen?')) return;
        this._kontaktPersoner = (this._kontaktPersoner || []).filter((_, i) => i !== idx);
        this._saveKontaktPersoner();
        this._refreshRollerList();
    }

    _showRollePersonModal(person, idx) {
        const isNew = (idx === null || idx === undefined);
        const existing = document.getElementById('rolle-person-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'rolle-person-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="max-width:460px;">
                <div class="modal-header">
                    <h3>${isNew ? 'Lägg till kontaktperson' : 'Redigera kontaktperson'}</h3>
                    <button class="modal-close" onclick="document.getElementById('rolle-person-modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Namn</label>
                        <input type="text" id="rp-namn" class="form-control" value="${this._esc(person?.namn || '')}" placeholder="Förnamn Efternamn">
                    </div>
                    <div class="form-group form-group-roller">
                        <label>Roller / befattningar</label>
                        <div class="roller-checkboxes" id="rp-roller-wrap">
                            ${this._rollerAlternativ().map(r => {
                                const roller = Array.isArray(person?.roller) ? person.roller : (person?.roll ? [person.roll] : []);
                                const checked = roller.includes(r) ? 'checked' : '';
                                return `<label class="roller-checkbox-label"><input type="checkbox" class="rp-roll-cb" value="${this._esc(r)}" ${checked}> ${this._esc(r)}</label>`;
                            }).join('')}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>E-postadress</label>
                        <input type="email" id="rp-epost" class="form-control" value="${this._esc(person?.epost || '')}" placeholder="namn@foretag.se">
                    </div>
                    <div class="form-group">
                        <label>Personnummer <span style="color:#94a3b8;font-size:0.82em">(för BankID-signering)</span></label>
                        <input type="text" id="rp-personnr" class="form-control" value="${this._esc(person?.personnr || '')}" placeholder="YYYYMMDD-XXXX">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rolle-person-modal').remove()">Avbryt</button>
                    <button class="btn btn-primary btn-sm" onclick="customerCardManager._saveRollePersonModal(${isNew ? 'null' : idx})"><i class="fas fa-save"></i> Spara</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('rp-namn').focus();
    }

    _saveRollePersonModal(idx) {
        const namn = document.getElementById('rp-namn').value.trim();
        const roller = [...document.querySelectorAll('.rp-roll-cb:checked')].map(cb => cb.value.trim()).filter(Boolean);
        const epost = document.getElementById('rp-epost').value.trim();
        const personnr = document.getElementById('rp-personnr').value.trim();
        if (!namn) { alert('Namn är obligatoriskt.'); return; }

        const existing = (idx != null && idx !== undefined) ? (this._kontaktPersoner || [])[idx] : null;
        const person = { namn, roller, epost, personnr };
        if (existing?.pepSoktDatum) person.pepSoktDatum = existing.pepSoktDatum;
        if (!this._kontaktPersoner) this._kontaktPersoner = [];

        if (idx === null || idx === undefined) {
            this._kontaktPersoner.push(person);
        } else {
            this._kontaktPersoner[idx] = person;
        }
        this._saveKontaktPersoner();
        this._refreshRollerList();
        document.getElementById('rolle-person-modal')?.remove();
    }

    async _saveKontaktPersoner(extraFields = {}) {
        const custId = this.customerId || this.currentCustomerId;
        if (!custId) return;
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const fields = { Kontaktpersoner: JSON.stringify(this._kontaktPersoner), ...extraFields };
        try {
            const resp = await fetch(`${baseUrl}/api/kunddata/${custId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields })
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                console.error('Fel vid sparande av kontaktpersoner:', err);
                this.showNotification('Kunde inte spara kontaktpersoner', 'error');
            } else {
                if (this.customerData) {
                    this.customerData.fields['Kontaktpersoner'] = JSON.stringify(this._kontaktPersoner);
                    for (const [k, v] of Object.entries(extraFields)) this.customerData.fields[k] = v;
                }
                if (!extraFields['Verklig huvudman']) this.showNotification('Kontaktpersoner sparade', 'success');
            }
        } catch(e) {
            console.error(e);
            this.showNotification('Kunde inte spara kontaktpersoner', 'error');
        }
    }

    displayEmptyRoles() {
        const rolesList = document.getElementById('roles-list');
        if (rolesList) rolesList.innerHTML = this._renderRollerView([]);
    }

    displayRoles(roles) {
        const rolesList = document.getElementById('roles-list');
        if (!rolesList) return;
        rolesList.innerHTML = this._renderRollerView(roles);
    }

    async loadOvrigKYC() {
        const container = document.getElementById('ovrigkyc-content');
        if (!container) return;

        // Hämta dynamiska alternativ för riskfaktorfälten om ej cachade
        if (!this._riskhojAlternativ || !this._risksankAlternativ) {
            try {
                const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
                const [resHoj, resSank] = await Promise.all([
                    fetch(`${baseUrl}/api/falt-alternativ?falt=${encodeURIComponent('Riskhöjande faktorer övrigt')}`, { ...getAuthOptsKundkort() }),
                    fetch(`${baseUrl}/api/falt-alternativ?falt=${encodeURIComponent('Risksänkande faktorer')}`, { ...getAuthOptsKundkort() })
                ]);
                const dataHoj = resHoj.ok ? await resHoj.json() : {};
                const dataSank = resSank.ok ? await resSank.json() : {};
                this._riskhojAlternativ = (dataHoj.choices || []).filter(c => c && c !== '---');
                this._risksankAlternativ = (dataSank.choices || []).filter(c => c && c !== '---');
            } catch (e) {
                console.warn('⚠️ Kunde inte hämta riskfaktor-alternativ:', e.message);
                this._riskhojAlternativ = this._riskhojAlternativ || [];
                this._risksankAlternativ = this._risksankAlternativ || [];
            }
        }

        this.renderOvrigKYCBase();
        this.loadServices(); // fyller #ovrigkyc-tjanster
        await this.loadKundRisker();
    }

    // Mappning: typnamn (Airtable) -> container-id-suffix och rubrik
    _riskTypMap() {
        return [
            { typ: 'Geografiska riskfaktorer',           id: 'geografiska',  icon: 'fa-globe-europe' },
            { typ: 'Riskfaktorer kopplat till kund',     id: 'kund',         icon: 'fa-user-shield' },
            { typ: 'Distrubutionskanaler',               id: 'distribution', icon: 'fa-network-wired' },
            { typ: 'Verksamhetsspecifika riskfaktorer',  id: 'verksamhet',   icon: 'fa-building' },
        ];
    }

    _kycFieldForRiskerTyp(typId) {
        const map = { geografiska: 'KYC genomgången - Geografiska riskfaktorer', kund: 'KYC genomgången - Riskfaktorer kund', distribution: 'KYC genomgången - Distributionskanaler', verksamhet: 'KYC genomgången - Verksamhetsspecifika riskfaktorer' };
        return map[typId] || null;
    }

    async loadKundRisker() {
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

        try {
            const byraId = this.userData?.byraId || this.userByraIds?.[0] || '';
            const [byraRes, kundRes] = await Promise.all([
                fetch(`${baseUrl}/api/risker-kunden?byraId=${byraId}`, { ...getAuthOptsKundkort() }),
                fetch(`${baseUrl}/api/kunddata/${this.customerId}/risker`, { ...getAuthOptsKundkort() })
            ]);

            const byraData = byraRes.ok ? await byraRes.json() : { records: [] };
            const kundData = kundRes.ok ? await kundRes.json() : { records: [], linkedIds: [] };

            const allaRisker = byraData.records || [];
            const linkedIds = new Set(kundData.linkedIds || []);

            this._allaRisker = allaRisker;
            this._linkedRiskIds = linkedIds;

            this._riskTypMap().forEach(({ typ, id }) => {
                const container = document.getElementById(`ovrigkyc-risker-${id}`);
                if (!container) return;
                const riskerForTyp = allaRisker.filter(r => r.fields['Typ av riskfaktor'] === typ);
                this._renderRiskerForTyp(container, riskerForTyp, linkedIds, id);
            });

        } catch (error) {
            console.error('❌ Fel vid hämtning av risker:', error);
            this._riskTypMap().forEach(({ id }) => {
                const c = document.getElementById(`ovrigkyc-risker-${id}`);
                if (c) c.innerHTML = '<p class="lead-empty">Kunde inte ladda risker.</p>';
            });
        }
    }

    _renderRiskerForTyp(container, risker, linkedIds, typId) {
        const riskBadge = (nivå) => {
            if (!nivå) return '';
            const map = { 'Hög': 'risk-pill--high', 'Förhöjd': 'risk-pill--high', 'Medel': 'risk-pill--medium', 'Låg': 'risk-pill--low', 'Normal': 'risk-pill--low' };
            return `<span class="risk-pill ${map[nivå] || 'risk-pill--medium'}">${nivå}</span>`;
        };
        const fmtList = (v) => Array.isArray(v) ? v : (v ? [v] : []);
        const HOGRISK_ALTERNATIV = ['Växlingskontor','Bilhandel','Skrot- och metallhandel','Smycken/antikviteter','Bemanning','Bygg','Städning','Restaurang','Bolagsbildning','Redovisning etc.','Spelbolag','Fastighetsmäklare','Trustförvaltning','Oberoende jurister'];
        // Undvik dubbel "högriskbransch" – den hanteras ovan med branschval, visa den inte under Övriga
        const isHogriskBranschRisk = (r) => (r.fields['Riskfaktor'] || '').toLowerCase().includes('högriskbransch');
        const riskerForList = typId === 'kund' ? risker.filter(r => !isHogriskBranschRisk(r)) : risker;

        const valda = riskerForList.filter(r => linkedIds.has(r.id));
        const viewId = `risker-view-${typId}`;
        const editId = `risker-edit-${typId}`;
        const btnId  = `risker-edit-btn-${typId}`;

        // Högriskbransch – bara för kund-kortet
        const valdaHogrisk = typId === 'kund'
            ? fmtList(this.customerData?.fields?.['Kunden verkar i en högriskbransch']).filter(v => v && v !== '---')
            : [];

        const hogriskUid = 'hogrisk-sub-body';
        const hogriskViewHtml = (typId === 'kund' && valdaHogrisk.length > 0) ? `
            <div class="tjanst-collapsible-item" onclick="customerCardManager.toggleTjanstDetails('${hogriskUid}')">
                <div class="tjanst-collapsible-header">
                    <span class="risker-vald-namn"><i class="fas fa-industry" style="color:#ef4444;margin-right:0.4rem;font-size:0.85em;"></i>Kunden verkar i en högriskbransch</span>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span class="risk-pill risk-pill--high">${valdaHogrisk.length} valda</span>
                        <i class="fas fa-chevron-down tjanst-chevron" id="chevron-${hogriskUid}"></i>
                    </div>
                </div>
                <div class="tjanst-collapsible-body" id="${hogriskUid}" style="display:none;">
                    <div class="riskf-chips" style="margin-top:0.25rem;">${valdaHogrisk.map(v => `<span class="kyc-chip riskf-chip">${v}</span>`).join('')}</div>
                </div>
            </div>` : '';

        const hogriskEditHtml = typId === 'kund' ? `
            <div class="risker-checkgrupp" style="margin-bottom:1.25rem;border:1px solid #fee2e2;border-radius:8px;padding:0.75rem 0.85rem;background:#fff5f5;">
                <div class="risker-checkgrupp-titel" style="color:#dc2626;margin-bottom:0.6rem;">
                    <i class="fas fa-industry" style="margin-right:0.35rem;"></i>Kunden verkar i en högriskbransch
                </div>
                ${HOGRISK_ALTERNATIV.map(alt => `
                    <label class="risker-check-item">
                        <input type="checkbox" name="hogrisk-kund" value="${alt}" ${valdaHogrisk.includes(alt) ? 'checked' : ''}>
                        <span class="tjanst-check-box" style="margin-top:3px;flex-shrink:0;"></span>
                        <span class="risker-check-label"><span class="risker-check-namn">${alt}</span></span>
                    </label>`).join('')}
            </div>
            <div class="risker-checkgrupp-titel" style="margin-bottom:0.5rem;">Övriga riskfaktorer kopplat till kund</div>` : '';

        const ingaRiskLabels = { verksamhet: 'Inga verksamhetsspecifika riskfaktorer' };
        const riskListViewHtml = valda.length === 0
            ? (typId === 'kund' ? '' : (ingaRiskLabels[typId]
                ? `<div class="riskf-chips"><span class="kyc-chip riskf-chip">${ingaRiskLabels[typId]}</span></div>`
                : '<p class="lead-empty">Inga risker valda. Klicka Redigera för att välja.</p>'))
            : valda.map((r, i) => {
                const uid = `risk-details-${typId}-${i}`;
                const hasDetails = r.fields['Beskrivning'] || r.fields['Åtgjärd'];
                return `
                <div class="tjanst-collapsible-item" onclick="${hasDetails ? `customerCardManager.toggleTjanstDetails('${uid}')` : ''}">
                    <div class="tjanst-collapsible-header">
                        <span class="risker-vald-namn">${r.fields['Riskfaktor'] || ''}</span>
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            ${r.fields['Riskbedömning'] ? riskBadge(r.fields['Riskbedömning']) : ''}
                            ${hasDetails ? `<i class="fas fa-chevron-down tjanst-chevron" id="chevron-${uid}"></i>` : ''}
                        </div>
                    </div>
                    ${hasDetails ? `
                    <div class="tjanst-collapsible-body" id="${uid}" style="display:none;">
                        ${r.fields['Beskrivning'] ? `
                            <div class="risker-vald-section-label">Beskrivning av riskfaktorn</div>
                            <div class="risker-vald-desc">${r.fields['Beskrivning']}</div>` : ''}
                        ${r.fields['Åtgjärd'] ? `
                            <div class="risker-vald-section-label">Åtgärder</div>
                            <div class="risker-vald-desc">${r.fields['Åtgjärd']}</div>` : ''}
                    </div>` : ''}
                </div>`;
            }).join('');

        const emptyMsg = (typId === 'kund' && valda.length === 0 && valdaHogrisk.length === 0)
            ? '<p class="lead-empty">Inga risker valda. Klicka Redigera för att välja.</p>' : '';

        container.innerHTML = `
            <div class="risker-selector">
                <div id="${viewId}">
                    ${hogriskViewHtml}
                    ${riskListViewHtml}
                    ${emptyMsg}
                </div>
                <div id="${editId}" style="display:none;">
                    <p class="tjanster-edit-hint">Markera de risker som gäller för kunden.</p>
                    ${hogriskEditHtml}
                    ${riskerForList.map(r => `
                        <label class="risker-check-item">
                            <input type="checkbox" name="risk-${typId}" value="${r.id}" ${linkedIds.has(r.id) ? 'checked' : ''}
                                onchange="customerCardManager.updateRiskerCount('${typId}')">
                            <span class="tjanst-check-box" style="margin-top:3px;flex-shrink:0;"></span>
                            <span class="risker-check-label">
                                <span class="risker-check-top">
                                    <span class="risker-check-namn">${r.fields['Riskfaktor'] || ''}</span>
                                    ${riskBadge(r.fields['Riskbedömning'] || '')}
                                </span>
                                ${r.fields['Beskrivning'] ? `<span class="risker-check-desc">${r.fields['Beskrivning']}</span>` : ''}
                            </span>
                        </label>`).join('')}
                    <div class="tjanster-edit-actions">
                        <button class="btn btn-primary btn-sm" onclick="customerCardManager.saveRisker('${typId}')">
                            <i class="fas fa-save"></i> Spara
                        </button>
                        <button class="btn btn-ghost btn-sm" onclick="customerCardManager.toggleRiskerEdit('${typId}')">Avbryt</button>
                    </div>
                </div>
            </div>`;

        // Lägg pennan direkt i collapsible-body så den positioneras rätt
        const body = container.closest('.collapsible-body');
        if (body) {
            let fab = body.querySelector(`#${btnId}`);
            if (!fab) {
                fab = document.createElement('button');
                fab.className = 'card-edit-fab';
                fab.id = btnId;
                fab.title = 'Redigera';
                fab.setAttribute('onclick', `event.stopPropagation(); customerCardManager.toggleRiskerEdit('${typId}')`);
                fab.innerHTML = '<i class="fas fa-pencil-alt"></i>';
                body.appendChild(fab);
            }
        }
    }

    toggleRiskerEdit(typId) {
        const view = document.getElementById(`risker-view-${typId}`);
        const edit = document.getElementById(`risker-edit-${typId}`);
        const btn  = document.getElementById(`risker-edit-btn-${typId}`);
        if (!view || !edit) return;
        const isEditing = edit.style.display !== 'none';
        edit.style.display = isEditing ? 'none' : '';
        view.style.display = isEditing ? '' : 'none';
        if (btn) {
            btn.innerHTML = isEditing ? '<i class="fas fa-pencil-alt"></i>' : '<i class="fas fa-times"></i>';
            btn.classList.toggle('is-active', !isEditing);
        }
        if (isEditing) {
            const kycField = this._kycFieldForRiskerTyp(typId);
            if (kycField) this._saveKycStatus(kycField, true);
        }
        if (!isEditing) {
            const card = btn?.closest('.collapsible-card');
            if (card && !card.classList.contains('open')) card.classList.add('open');
        }
    }

    updateRiskerCount(typId) {
        const checked = document.querySelectorAll(`#risker-edit-${typId} input[name="risk-${typId}"]:checked`);
        const el = document.getElementById(`risker-count-${typId}`);
        if (el) el.textContent = `${checked.length} valda`;
    }

    async saveRisker(typId) {
        // Samla ihop valda från ALLA kort, ersätt det aktuella kortets val
        const allChecked = new Set(this._linkedRiskIds || []);

        // Ta bort alla risker av denna typ ur setet
        const riskerForTyp = (this._allaRisker || []).filter(r => {
            const typMap = this._riskTypMap();
            const match = typMap.find(t => t.id === typId);
            return match && r.fields['Typ av riskfaktor'] === match.typ;
        });
        riskerForTyp.forEach(r => allChecked.delete(r.id));

        // Lägg till de nya valen för detta kort
        const nyaChecked = [...document.querySelectorAll(`#risker-edit-${typId} input[name="risk-${typId}"]:checked`)]
            .map(cb => cb.value);
        nyaChecked.forEach(id => allChecked.add(id));

        const totalChecked = [...allChecked];

        const saveBtn = document.querySelector(`#risker-edit-${typId} .btn-primary`);
        const origText = saveBtn?.innerHTML;
        if (saveBtn) { saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; saveBtn.disabled = true; }

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

            const fieldsToSave = { 'risker kopplat till tjänster': totalChecked };

            // Spara högriskbranscher om det är kund-kortet
            let nyaHogrisk = null;
            if (typId === 'kund') {
                nyaHogrisk = [...document.querySelectorAll(`#risker-edit-${typId} input[name="hogrisk-kund"]:checked`)]
                    .map(cb => cb.value);
                fieldsToSave['Kunden verkar i en högriskbransch'] = nyaHogrisk;
            }

            const response = await fetch(`${baseUrl}/api/kunddata/${this.customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields: fieldsToSave })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            this._linkedRiskIds = allChecked;
            if (typId === 'kund' && nyaHogrisk !== null && this.customerData?.fields) {
                this.customerData.fields['Kunden verkar i en högriskbransch'] = nyaHogrisk;
            }

            // Rita om detta kortets visningsläge
            const container = document.getElementById(`ovrigkyc-risker-${typId}`);
            if (container && this._allaRisker) {
                const match = this._riskTypMap().find(t => t.id === typId);
                const risker = this._allaRisker.filter(r => r.fields['Typ av riskfaktor'] === match?.typ);
                this._renderRiskerForTyp(container, risker, allChecked, typId);
            }
            const kycField = this._kycFieldForRiskerTyp(typId);
            if (kycField) this._saveKycStatus(kycField, true);

            this.showNotification('Risker sparade!', 'success');

        } catch (error) {
            console.error('❌ Fel vid sparande av risker:', error);
            this.showNotification(`Kunde inte spara: ${error.message}`, 'error');
            if (saveBtn) { saveBtn.innerHTML = origText; saveBtn.disabled = false; }
        }
    }

    renderOvrigKYCBase() {
        const container = document.getElementById('ovrigkyc-content');
        if (!container) return;

        if (!this.customerData?.fields) {
            container.innerHTML = '<p class="lead-empty">Ingen KYC-information tillgänglig.</p>';
            return;
        }

        const f = this.customerData.fields;

        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('sv-SE') : null;
        const fmtList = (v) => Array.isArray(v) ? v : (v ? [v] : []);
        const fmt = (v) => (v !== undefined && v !== null && v !== '') ? v : null;

        const chips = (items) => fmtList(items).map(i =>
            `<span class="kyc-chip">${i}</span>`).join('');

        const row = (label, content, icon = '') => content ? `
            <div class="kyc-row">
                <span class="kyc-row-label">${icon ? `<i class="fas ${icon}"></i> ` : ''}${label}</span>
                <span class="kyc-row-value">${content}</span>
            </div>` : '';

        const chipsRow = (label, items, icon = '') => fmtList(items).length ? `
            <div class="kyc-row kyc-row--chips">
                <span class="kyc-row-label">${icon ? `<i class="fas ${icon}"></i> ` : ''}${label}</span>
                <div class="kyc-chips-wrap">${chips(items)}</div>
            </div>` : '';

        const section = (title, icon, body) => body.trim() ? `
            <div class="kyc-section">
                <div class="kyc-section-title"><i class="fas ${icon}"></i> ${title}</div>
                ${body}
            </div>` : '';

        const uppdragCheck = f['Uppdraget kan antas'];
        const avtalsDatum = f['Avtalet gäller ifrån'] ? fmtDate(f['Avtalet gäller ifrån']) : null;

        container.innerHTML = `
            <div class="kyc-layout">

                ${section('Affärsförbindelsen', 'fa-handshake', `
                    ${chipsRow('Syfte med affärsförbindelsen', f['Syfte med affärsförbindelsen'], 'fa-bullseye')}
                    ${chipsRow('Tidshorisont', f['Tidshorisont affärsförbindelsen'], 'fa-clock')}
                    ${chipsRow('Betalningar', f['Betalningar'], 'fa-credit-card')}
                    ${row('Har företaget transaktioner med andra länder?', fmt(f['Har företaget transaktioner med andra länder?']), 'fa-globe')}
                    ${chipsRow('Ursprung kapital', f['Vilket ursprung har företagets kapital?'], 'fa-coins')}
                `)}

                <!-- Kunden & verksamheten + Tjänster – fylls i av loadServices() -->
                <div class="kyc-section collapsible-card collapsible-card--kyc" id="tjanster-kort">
                    <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('open')">
                        <div class="collapsible-title">${this._kycStatusIcon('KYC genomgången - Tjänster', f['KYC genomgången - Tjänster'], 'fa-cogs')} Tjänster</div>
                        <i class="fas fa-chevron-down collapsible-chevron"></i>
                    </div>
                    <div class="collapsible-body">
                        <div id="ovrigkyc-tjanster">
                            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Laddar tjänster...</p></div>
                        </div>
                    </div>
                </div>

                ${section('Kunden & verksamheten', 'fa-building', `
                    ${row('Omsättning', fmt(f['Omsättning']), 'fa-chart-line')}
                    ${row('Frekvens', fmtList(f['Frekvens']).join(', ') || null, 'fa-sync')}
                    ${row('Omfattning (h)', fmt(f['omfattning i h']), 'fa-hourglass-half')}
                    ${row('Verklig huvudman', fmt(f['Verklig huvudman']), 'fa-user-shield')}
                    ${row('Ombud', fmt(f['Ombud']), 'fa-user-tie')}
                    ${chipsRow('Skatterättslig hemvist', f['Skatterättslig hemvist'], 'fa-flag')}
                    ${f['Affärsmodell'] ? `<div class="kyc-richtext-row"><span class="kyc-row-label"><i class="fas fa-project-diagram"></i> Affärsmodell</span><div class="kyc-richtext">${f['Affärsmodell']}</div></div>` : ''}
                    ${f['Ytterligare beskrivning av kunden och verksamheten'] ? `
                    <div class="kyc-richtext-row">
                        <span class="kyc-row-label"><i class="fas fa-align-left"></i> Ytterligare beskrivning</span>
                        <div class="kyc-richtext">${f['Ytterligare beskrivning av kunden och verksamheten']}</div>
                    </div>` : ''}
                `)}


                <!-- Riskfaktorkort per typ – fylls i av loadKundRisker() -->
                <div class="kyc-section collapsible-card collapsible-card--kyc" id="risker-kort-geografiska">
                    <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('open')">
                        <div class="collapsible-title">${this._kycStatusIcon('KYC genomgången - Geografiska riskfaktorer', f['KYC genomgången - Geografiska riskfaktorer'], 'fa-globe-europe')} Geografiska riskfaktorer</div>
                        <i class="fas fa-chevron-down collapsible-chevron"></i>
                    </div>
                    <div class="collapsible-body">
                        <div id="ovrigkyc-risker-geografiska">
                            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Laddar...</p></div>
                        </div>
                    </div>
                </div>

                <div class="kyc-section collapsible-card collapsible-card--kyc" id="risker-kort-kund">
                    <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('open')">
                        <div class="collapsible-title">${this._kycStatusIcon('KYC genomgången - Riskfaktorer kund', f['KYC genomgången - Riskfaktorer kund'], 'fa-user-shield')} Riskfaktorer kopplat till kund</div>
                        <i class="fas fa-chevron-down collapsible-chevron"></i>
                    </div>
                    <div class="collapsible-body">
                        <div id="ovrigkyc-risker-kund">
                            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Laddar...</p></div>
                        </div>
                    </div>
                </div>

                <div class="kyc-section collapsible-card collapsible-card--kyc" id="risker-kort-distribution">
                    <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('open')">
                        <div class="collapsible-title">${this._kycStatusIcon('KYC genomgången - Distributionskanaler', f['KYC genomgången - Distributionskanaler'], 'fa-network-wired')} Distributionskanaler</div>
                        <i class="fas fa-chevron-down collapsible-chevron"></i>
                    </div>
                    <div class="collapsible-body">
                        <div id="ovrigkyc-risker-distribution">
                            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Laddar...</p></div>
                        </div>
                    </div>
                </div>

                <div class="kyc-section collapsible-card collapsible-card--kyc" id="risker-kort-verksamhet">
                    <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('open')">
                        <div class="collapsible-title">${this._kycStatusIcon('KYC genomgången - Verksamhetsspecifika riskfaktorer', f['KYC genomgången - Verksamhetsspecifika riskfaktorer'], 'fa-building')} Verksamhetsspecifika riskfaktorer</div>
                        <i class="fas fa-chevron-down collapsible-chevron"></i>
                    </div>
                    <div class="collapsible-body">
                        <div id="ovrigkyc-risker-verksamhet">
                            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Laddar...</p></div>
                        </div>
                    </div>
                </div>

                <!-- Redigerbara riskfaktorkort -->

                ${this.renderRiskfaktorCard('riskhojande-ovrigt', 'Riskhöjande faktorer övrigt', 'fa-arrow-trend-up',
                    f['Riskhöjande faktorer övrigt'],
                    this._riskhojAlternativ?.length ? this._riskhojAlternativ : ['Inga','Kontanthantering','Kopplingar till andra länder, särskilt länder utanför EU','Svårt att få svar på frågor','Komplicerad struktur','Mkt ändringar i styrelse, adress eller firmateckning','Svårt att få kontakt med ägare/styrelse/huvudmän','Otydlig affärsmodell','Transaktioner utan tydligt syfte','Historik av brott eller ekonomisk misskötsel','Svårt att bekräfta identitet','Bristfälliga bokföringsrutiner','Företaget har många kunder på distans','Företaget har många kortvariga affärsrelationer'],
                    'multi', 'high', 'KYC genomgången - Riskhöjande faktorer övrigt', f['KYC genomgången - Riskhöjande faktorer övrigt'])}

                ${this.renderRiskfaktorCard('risksankande', 'Risksänkande faktorer', 'fa-arrow-trend-down',
                    f['Risksänkande faktorer'],
                    this._risksankAlternativ?.length ? this._risksankAlternativ : ['Inga','Inga kopplingar till utlandet','Enkel struktur, lätt att få överblick på transaktionerna','Små transaktioner'],
                    'multi', '', 'KYC genomgången - Risksänkande faktorer', f['KYC genomgången - Risksänkande faktorer'])}

                ${this.renderRiskfaktorCard('kommentar-risk', 'Kommentar till riskfaktorerna ovan', 'fa-comment-alt',
                    f['Kommentar till riskfaktorerna ovan'],
                    [],
                    'text', '', 'KYC genomgången - Kommentar riskfaktorer', f['KYC genomgången - Kommentar riskfaktorer'])}

                <!-- Byråns riskbedömning av kunden -->
                ${this.renderRiskbedomningAiCard(f)}

                <!-- Byrån har – näst sist -->
                ${this.renderByranHarCard(f['Byrån har'])}

                <!-- Uppdrag & avtal – allra sist -->
                <div class="kyc-section collapsible-card collapsible-card--kyc" id="uppdrag-avtal-kort">
                    <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('open')">
                        <div class="collapsible-title"><i class="fas fa-file-contract"></i> Uppdrag & avtal</div>
                        <i class="fas fa-chevron-down collapsible-chevron"></i>
                    </div>
                    <div class="collapsible-body">
                        ${row('Uppdrag', fmt(f['Uppdrag']), 'fa-briefcase')}
                        ${row('Uppdrag 2', fmt(f['Uppdrag 2']), 'fa-briefcase')}
                        ${chipsRow('Momsuppdrag', f['Momsuppdrag'], 'fa-receipt')}
                        ${f['Uppdragstext'] ? `<div class="kyc-richtext-row"><span class="kyc-row-label"><i class="fas fa-align-left"></i> Uppdragstext</span><div class="kyc-richtext">${f['Uppdragstext']}</div></div>` : ''}

                        <div class="uppdrag-antas-section">
                            <div class="uppdrag-antas-row">
                                <label class="uppdrag-antas-label">
                                    <input type="checkbox" id="uppdrag-kan-antas-cb"
                                        ${uppdragCheck ? 'checked' : ''}
                                        onchange="customerCardManager.saveUppdragKanAntas(this.checked)">
                                    <span class="uppdrag-antas-check-box"></span>
                                    <span class="uppdrag-antas-text">Uppdraget kan antas</span>
                                </label>
                                ${uppdragCheck && avtalsDatum ? `<span class="uppdrag-antas-datum"><i class="fas fa-calendar-check"></i> ${avtalsDatum}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Dokumentera riskbedömning – knapp längst ner -->
                <div class="kyc-section" style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e2e8f0;">
                    <button type="button" class="btn btn-primary" id="btn-dokumentera-riskbedomning" onclick="customerCardManager.dokumenteraRiskbedomning()">
                        <i class="fas fa-file-pdf"></i> Dokumentera riskbedömning
                    </button>
                    <p class="kyc-hint" style="margin-top:0.5rem;font-size:0.85rem;color:#64748b;">Skapar en PDF med nuvarande riskbedömning, sparar på fliken Dokumentation. Görs årligen per kund.</p>
                </div>

            </div>
        `;
    }

    renderRiskfaktorCard(id, titel, icon, värde, alternativ, typ, chipVariant = '', kycFält = null, kycVärde = null) {
        const fmtList = (v) => Array.isArray(v) ? v : (v ? [v] : []);
        const valda = fmtList(värde).filter(v => v && v !== '---');
        const filtAlt = alternativ.filter(a => a !== '---');

        const chipClass = chipVariant === 'high' ? 'kyc-chip riskf-chip riskf-chip--high' : 'kyc-chip riskf-chip';
        const isIngaVal = (id, v) => id && v.length === 1 && String(v[0]).trim().toLowerCase() === 'inga';
        const ingaLabels = { 'riskhojande-ovrigt': 'Inga övriga riskhöjande faktorer', 'risksankande': 'Inga risksänkande faktorer' };
        const ingaHtml = ingaLabels[id] && isIngaVal(id, valda)
            ? `<div class="riskf-chips"><span class="kyc-chip riskf-chip">${ingaLabels[id]}</span></div>`
            : null;

        const viewContent = typ === 'text'
            ? (värde ? `<div class="kyc-richtext">${värde}</div>` : '<span class="missing-data">Ej angiven</span>')
            : (ingaHtml
                ? ingaHtml
                : valda.length
                    ? `<div class="riskf-chips">${valda.map(v => `<span class="${chipClass}">${v}</span>`).join('')}</div>`
                    : '<span class="missing-data">Inga valda</span>');

        const editContent = typ === 'text'
            ? `<textarea id="riskf-input-${id}" class="kunduppgifter-input" rows="3">${värde || ''}</textarea>`
            : `<div class="riskf-checkgrid">
                ${filtAlt.map(alt => `
                    <label class="riskf-check-item">
                        <input type="checkbox" name="riskf-${id}" value="${alt}" ${valda.includes(alt) ? 'checked' : ''}
                            onchange="customerCardManager.updateRiskfaktorChips('${id}')">
                        <span class="tjanst-check-box"></span>
                        <span class="tjanst-check-label">${alt}</span>
                    </label>`).join('')}
               </div>`;

        return `
            <div class="kyc-section collapsible-card collapsible-card--kyc" id="riskf-card-${id}"${kycFält ? ` data-kyc-field="${String(kycFält).replace(/"/g, '&quot;')}"` : ''}>
                <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('open')">
                    <div class="collapsible-title">
                        ${kycFält ? this._kycStatusIcon(kycFält, kycVärde, icon) : `<i class="fas ${icon}"></i>`}
                        ${titel}
                    </div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body" style="position:relative;">
                    <div id="riskf-view-${id}" data-chip-variant="${chipVariant}">${viewContent}</div>
                    <div id="riskf-edit-${id}" style="display:none;">
                        ${editContent}
                        <div class="kunduppgifter-actions" style="margin-top:0.75rem;">
                            <button class="btn btn-primary btn-sm"
                                onclick="customerCardManager.saveRiskfaktor('${id}', '${titel}', '${typ}')">
                                <i class="fas fa-save"></i> Spara
                            </button>
                            <button class="btn btn-ghost btn-sm"
                                onclick="customerCardManager.toggleRiskfaktorEdit('${id}')">Avbryt</button>
                        </div>
                    </div>
                    <button class="card-edit-fab" id="riskf-btn-${id}" title="Redigera"
                        onclick="event.stopPropagation(); customerCardManager.toggleRiskfaktorEdit('${id}')">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
            </div>`;
    }

    renderRiskbedomningAiCard(f) {
        const riskniva = f['Riskniva'] || '';
        const riskbedomning = f['Byrans riskbedomning'] || '';
        const atgarder = f['Atgarder riskbedomning'] || '';

        const nivaBadge = (n) => {
            if (!n) return '';
            const map = { 'Lag': 'risk-pill--low', 'Medel': 'risk-pill--medium', 'Hog': 'risk-pill--high' };
            const label = { 'Lag': 'Låg risk', 'Medel': 'Medel risk', 'Hog': 'Hög risk' };
            return `<span class="risk-pill ${map[n] || 'risk-pill--medium'}">${label[n] || n}</span>`;
        };

        return `
            <div class="kyc-section collapsible-card collapsible-card--kyc" id="ai-riskbedomning-kort">
                <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('open')">
                    <div class="collapsible-title">
                        <i class="fas fa-robot" style="color:#6366f1;margin-right:0.4rem;"></i>
                        Byråns riskbedömning av kunden
                        ${riskniva ? nivaBadge(riskniva) : ''}
                    </div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body" id="ai-riskbedomning-body">
                    <!-- Visningsläge -->
                    <div id="ai-rb-view">
                        <div class="ai-rb-riskniva-row">
                            <span class="risker-vald-section-label" style="margin-top:0;">Sammanlagd risknivå</span>
                            <div id="ai-rb-niva-display" style="margin-top:0.4rem;">
                                ${riskniva ? nivaBadge(riskniva) : '<span class="missing-data">Ej bedömd</span>'}
                            </div>
                        </div>
                        ${riskbedomning ? `
                        <div class="risker-vald-section-label">Byråns riskbedömning</div>
                        <div class="risker-vald-desc" id="ai-rb-text-display" style="white-space:pre-wrap;">${riskbedomning}</div>` : ''}
                        ${atgarder ? `
                        <div class="risker-vald-section-label">Åtgärder</div>
                        <div class="risker-vald-desc" id="ai-rb-atg-display" style="white-space:pre-wrap;">${atgarder}</div>` : ''}
                        ${!riskbedomning && !atgarder ? '<p class="lead-empty">Ingen bedömning gjord ännu. Klicka redigera eller låt AI analysera.</p>' : ''}
                    </div>

                    <!-- Redigeringsläge -->
                    <div id="ai-rb-edit" style="display:none;">
                        <div class="kunduppgifter-form-row" style="margin-bottom:0.75rem;">
                            <label style="font-weight:600;font-size:0.82rem;color:#475569;margin-bottom:0.3rem;display:block;">Sammanlagd risknivå</label>
                            <div class="ai-rb-niva-btns">
                                <button class="ai-rb-niva-btn ${riskniva === 'Lag' ? 'is-active is-lag' : ''}" onclick="customerCardManager.setRiskniva('Lag')">
                                    <i class="fas fa-circle"></i> Låg
                                </button>
                                <button class="ai-rb-niva-btn ${riskniva === 'Medel' ? 'is-active is-medel' : ''}" onclick="customerCardManager.setRiskniva('Medel')">
                                    <i class="fas fa-circle"></i> Medel
                                </button>
                                <button class="ai-rb-niva-btn ${riskniva === 'Hog' ? 'is-active is-hog' : ''}" onclick="customerCardManager.setRiskniva('Hog')">
                                    <i class="fas fa-circle"></i> Hög
                                </button>
                            </div>
                        </div>
                        <div class="kunduppgifter-form-row" style="margin-bottom:0.75rem;">
                            <label style="font-weight:600;font-size:0.82rem;color:#475569;margin-bottom:0.3rem;display:block;">Byråns riskbedömning</label>
                            <textarea id="ai-rb-text-input" class="kunduppgifter-input" rows="5" placeholder="Skriv byråns samlade riskbedömning av kunden...">${riskbedomning}</textarea>
                        </div>
                        <div class="kunduppgifter-form-row" style="margin-bottom:0.75rem;">
                            <label style="font-weight:600;font-size:0.82rem;color:#475569;margin-bottom:0.3rem;display:block;">Åtgärder</label>
                            <textarea id="ai-rb-atg-input" class="kunduppgifter-input" rows="5" placeholder="Beskriv vilka åtgärder byrån vidtar...">${atgarder}</textarea>
                        </div>

                        <!-- AI-knapp -->
                        <div class="ai-rb-ai-row">
                            <button class="btn-ai-suggest" id="ai-rb-btn" onclick="customerCardManager.getAiRiskbedomning()">
                                <i class="fas fa-robot"></i> Generera AI-förslag
                            </button>
                            <span class="ai-rb-ai-hint">AI analyserar all KYC-data och föreslår risknivå, bedömning och åtgärder</span>
                        </div>

                        <div class="kunduppgifter-actions" style="margin-top:1rem;">
                            <button class="btn btn-primary btn-sm" onclick="customerCardManager.saveRiskbedomning()">
                                <i class="fas fa-save"></i> Spara
                            </button>
                            <button class="btn btn-ghost btn-sm" onclick="customerCardManager.toggleRiskbedomningEdit()">Avbryt</button>
                        </div>
                    </div>

                    <button class="card-edit-fab" id="ai-rb-edit-btn" title="Redigera"
                        onclick="event.stopPropagation(); customerCardManager.toggleRiskbedomningEdit()">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
            </div>`;
    }

    toggleRiskbedomningEdit() {
        const view = document.getElementById('ai-rb-view');
        const edit = document.getElementById('ai-rb-edit');
        const btn  = document.getElementById('ai-rb-edit-btn');
        if (!view || !edit) return;
        const isEditing = edit.style.display !== 'none';
        edit.style.display = isEditing ? 'none' : '';
        view.style.display = isEditing ? '' : 'none';
        if (btn) {
            btn.innerHTML = isEditing ? '<i class="fas fa-pencil-alt"></i>' : '<i class="fas fa-times"></i>';
            btn.classList.toggle('is-active', !isEditing);
        }
        if (!isEditing) {
            const card = document.getElementById('ai-riskbedomning-kort');
            if (card && !card.classList.contains('open')) card.classList.add('open');
        }
    }

    setRiskniva(nivå) {
        document.querySelectorAll('.ai-rb-niva-btn').forEach(b => {
            b.classList.remove('is-active', 'is-lag', 'is-medel', 'is-hog');
        });
        const map = { 'Lag': 'is-lag', 'Medel': 'is-medel', 'Hog': 'is-hog' };
        const btn = [...document.querySelectorAll('.ai-rb-niva-btn')]
            .find(b => b.textContent.trim().startsWith(nivå === 'Lag' ? 'Låg' : nivå === 'Hog' ? 'Hög' : 'Medel'));
        if (btn) btn.classList.add('is-active', map[nivå]);
        // Spara valt värde som data-attribut
        document.getElementById('ai-rb-edit').dataset.riskniva = nivå;
    }

    async saveRiskbedomning() {
        const editEl = document.getElementById('ai-rb-edit');
        const riskniva = editEl?.dataset.riskniva || '';
        const riskbedomning = document.getElementById('ai-rb-text-input')?.value || '';
        const atgarder = document.getElementById('ai-rb-atg-input')?.value || '';

        const fields = {
            'Riskniva': riskniva || null,
            'Byrans riskbedomning': riskbedomning,
            'Atgarder riskbedomning': atgarder
        };
        // Rensa tomma null-fält
        Object.keys(fields).forEach(k => { if (fields[k] === null) delete fields[k]; });

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/kunddata/${this.customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // Uppdatera customerData
            if (this.customerData?.fields) {
                if (riskniva) this.customerData.fields['Riskniva'] = riskniva;
                this.customerData.fields['Byrans riskbedomning'] = riskbedomning;
                this.customerData.fields['Atgarder riskbedomning'] = atgarder;
            }

            // Uppdatera visningsvyn direkt
            this._updateRiskbedomningView(riskniva, riskbedomning, atgarder);
            this.toggleRiskbedomningEdit();
            this.showNotification('Riskbedömning sparad!', 'success');
        } catch (err) {
            console.error('❌ Fel vid sparande av riskbedömning:', err);
            this.showNotification('Kunde inte spara: ' + err.message, 'error');
        }
    }

    _updateRiskbedomningView(riskniva, riskbedomning, atgarder) {
        const nivaBadge = (n) => {
            if (!n) return '<span class="missing-data">Ej bedömd</span>';
            const map = { 'Lag': 'risk-pill--low', 'Medel': 'risk-pill--medium', 'Hog': 'risk-pill--high' };
            const label = { 'Lag': 'Låg risk', 'Medel': 'Medel risk', 'Hog': 'Hög risk' };
            return `<span class="risk-pill ${map[n] || 'risk-pill--medium'}">${label[n] || n}</span>`;
        };

        const nivaDisplay = document.getElementById('ai-rb-niva-display');
        if (nivaDisplay) nivaDisplay.innerHTML = nivaBadge(riskniva);

        const view = document.getElementById('ai-rb-view');
        if (view) {
            view.innerHTML = `
                <div class="ai-rb-riskniva-row">
                    <span class="risker-vald-section-label" style="margin-top:0;">Sammanlagd risknivå</span>
                    <div style="margin-top:0.4rem;">${nivaBadge(riskniva)}</div>
                </div>
                ${riskbedomning ? `<div class="risker-vald-section-label">Byråns riskbedömning</div>
                <div class="risker-vald-desc" style="white-space:pre-wrap;">${riskbedomning}</div>` : ''}
                ${atgarder ? `<div class="risker-vald-section-label">Åtgärder</div>
                <div class="risker-vald-desc" style="white-space:pre-wrap;">${atgarder}</div>` : ''}
                ${!riskbedomning && !atgarder ? '<p class="lead-empty">Ingen bedömning gjord ännu.</p>' : ''}`;
        }

        // Uppdatera badge i kortrubriken
        const title = document.querySelector('#ai-riskbedomning-kort .collapsible-title');
        if (title) {
            const existingPill = title.querySelector('.risk-pill');
            if (existingPill) existingPill.remove();
            if (riskniva) title.insertAdjacentHTML('beforeend', nivaBadge(riskniva));
        }
    }

    async getAiRiskbedomning() {
        const btn = document.getElementById('ai-rb-btn');
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI tänker...'; btn.disabled = true; }
        if (typeof window.showAiThinking === 'function') window.showAiThinking();

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/ai-riskbedomning/${this.customerId}`, {
                method: 'POST',
                ...getAuthOptsKundkort()
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            const data = await res.json();

            // Fyll i fälten
            const textInput = document.getElementById('ai-rb-text-input');
            const atgInput = document.getElementById('ai-rb-atg-input');
            if (textInput) textInput.value = data.riskbedomning || '';
            if (atgInput) atgInput.value = data.atgarder || '';
            if (data.riskniva) this.setRiskniva(data.riskniva);

            this.showNotification('AI-analys klar! Granska och spara.', 'success');
        } catch (err) {
            console.error('❌ AI-riskbedömning fel:', err);
            this.showNotification('AI-analys misslyckades: ' + err.message, 'error');
        } finally {
            if (typeof window.hideAiThinking === 'function') window.hideAiThinking();
            if (btn) { btn.innerHTML = '<i class="fas fa-robot"></i> Generera AI-förslag'; btn.disabled = false; }
        }
    }

    renderByranHarCard(värde) {
        const alternativ = ['Kapacitet att ta emot kunden', 'Kundkännedom har uppnåtts', 'Kunden bedöms som seriös', 'Kunskap nog att hjälpa kunden'];
        const fmtList = (v) => Array.isArray(v) ? v : (v ? [v] : []);
        const valda = fmtList(värde).filter(v => v);
        const chips = alternativ.map(alt => {
            const isActive = valda.includes(alt);
            return `<button class="byran-har-chip ${isActive ? 'is-active' : ''}"
                onclick="customerCardManager.toggleByranHar('${alt.replace(/'/g, "\\'")}')">${alt}</button>`;
        }).join('');
        return `
            <div class="kyc-section">
                <div class="kyc-section-title-row">
                    <div class="kyc-section-title"><i class="fas fa-building"></i> Byrån har</div>
                </div>
                <div id="byran-har-chips" class="byran-har-chip-row">${chips}</div>
            </div>`;
    }

    async toggleByranHar(alt) {
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

        // Hämta nuvarande värden från DOM
        const container = document.getElementById('byran-har-chips');
        if (!container) return;
        const aktiva = [...container.querySelectorAll('.byran-har-chip.is-active')].map(b => b.textContent.trim());

        // Toggla
        const idx = aktiva.indexOf(alt);
        if (idx >= 0) aktiva.splice(idx, 1);
        else aktiva.push(alt);

        // Uppdatera UI direkt
        container.querySelectorAll('.byran-har-chip').forEach(b => {
            b.classList.toggle('is-active', aktiva.includes(b.textContent.trim()));
        });

        // Spara till Airtable
        try {
            await fetch(`${baseUrl}/api/kunddata/${this.customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields: { 'Byrån har': aktiva } })
            });
            if (this.customerData?.fields) this.customerData.fields['Byrån har'] = aktiva;
        } catch (e) {
            console.error('❌ Kunde inte spara Byrån har:', e);
        }
    }

    toggleRiskfaktorEdit(id) {
        const view = document.getElementById(`riskf-view-${id}`);
        const edit = document.getElementById(`riskf-edit-${id}`);
        const btn = document.getElementById(`riskf-btn-${id}`);
        if (!view || !edit) return;
        const isEditing = edit.style.display !== 'none';
        if (isEditing) {
            edit.style.display = 'none';
            view.style.display = '';
            btn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
            btn.classList.remove('is-active');
            const card = document.getElementById(`riskf-card-${id}`);
            const kycField = card?.dataset?.kycField;
            if (kycField) this._saveKycStatus(kycField, true);
        } else {
            view.style.display = 'none';
            edit.style.display = '';
            btn.innerHTML = '<i class="fas fa-times"></i>';
            btn.classList.add('is-active');
            const card = btn?.closest('.collapsible-card');
            if (card && !card.classList.contains('open')) card.classList.add('open');
        }
    }

    updateRiskfaktorChips(id) {
        // Visuell feedback kan läggas till här vid behov
    }

    async saveRiskfaktor(id, fältnamn, typ) {
        const customerId = this.customerId;
        if (!customerId) { this.showNotification('Kund-ID saknas', 'error'); return; }

        let värde;
        if (typ === 'text') {
            värde = document.getElementById(`riskf-input-${id}`)?.value.trim() || '';
        } else {
            värde = [...document.querySelectorAll(`#riskf-edit-${id} input[name="riskf-${id}"]:checked`)]
                .map(cb => cb.value);
        }

        const saveBtn = document.querySelector(`#riskf-edit-${id} .btn-primary`);
        const origText = saveBtn?.innerHTML;
        if (saveBtn) { saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; saveBtn.disabled = true; }

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const response = await fetch(`${baseUrl}/api/kunddata/${customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields: { [fältnamn]: värde } })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            // Uppdatera customerData lokalt
            if (this.customerData?.fields) this.customerData.fields[fältnamn] = värde;

            // Uppdatera view-innehållet direkt
            const viewEl = document.getElementById(`riskf-view-${id}`);
            if (viewEl) {
                if (typ === 'text') {
                    viewEl.innerHTML = värde ? `<div class="kyc-richtext">${värde}</div>` : '<span class="missing-data">Ej angiven</span>';
                } else {
                    const list = Array.isArray(värde) ? värde : [];
                    const ingaLabels = { 'riskhojande-ovrigt': 'Inga övriga riskhöjande faktorer', 'risksankande': 'Inga risksänkande faktorer' };
                    const isIngaVal = list.length === 1 && String(list[0]).trim().toLowerCase() === 'inga';
                    const ingaLabel = ingaLabels[id];
                    if (ingaLabel && isIngaVal) {
                        viewEl.innerHTML = `<div class="riskf-chips"><span class="kyc-chip riskf-chip">${ingaLabel}</span></div>`;
                    } else {
                        const variant = viewEl.dataset.chipVariant || '';
                        const cls = variant === 'high' ? 'kyc-chip riskf-chip riskf-chip--high' : 'kyc-chip riskf-chip';
                        viewEl.innerHTML = list.length
                            ? `<div class="riskf-chips">${list.map(v => `<span class="${cls}">${v}</span>`).join('')}</div>`
                            : '<span class="missing-data">Inga valda</span>';
                    }
                }
            }

            this.toggleRiskfaktorEdit(id);
            this.showNotification('Sparat!', 'success');

        } catch (error) {
            console.error('❌ Fel:', error);
            this.showNotification(`Kunde inte spara: ${error.message}`, 'error');
        } finally {
            if (saveBtn) { saveBtn.innerHTML = origText; saveBtn.disabled = false; }
        }
    }

    async loadRiskAssessment() {
        const content = document.getElementById('risk-assessment-content');
        if (!content) return;

        if (!this.customerData || !this.customerData.fields) {
            this.displayEmptyRiskAssessment();
            return;
        }

        const f = this.customerData.fields;
        const sammanlagd = f['sammanlagd risk'] || '';

        if (!sammanlagd) {
            this.displayEmptyRiskAssessment();
            return;
        }

        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('sv-SE') : '—';
        const fmtList = (v) => Array.isArray(v) ? v : (v ? [v] : []);

        const riskClass = this.getRiskLevelClass(sammanlagd);

        const riskHöjandeBlock = (label, items) => {
            const list = fmtList(items);
            if (!list.length) return '';
            return `
                <div class="rb-factor-group">
                    <span class="rb-factor-label rb-factor-label--neg"><i class="fas fa-arrow-up"></i> ${label}</span>
                    <div class="rb-chips">
                        ${list.map(i => `<span class="rb-chip rb-chip--neg">${i}</span>`).join('')}
                    </div>
                </div>`;
        };

        const riskSänkandeBlock = (label, items) => {
            const list = fmtList(items);
            if (!list.length) return '';
            return `
                <div class="rb-factor-group">
                    <span class="rb-factor-label rb-factor-label--pos"><i class="fas fa-arrow-down"></i> ${label}</span>
                    <div class="rb-chips">
                        ${list.map(i => `<span class="rb-chip rb-chip--pos">${i}</span>`).join('')}
                    </div>
                </div>`;
        };

        const pepList = fmtList(f['PEP']);

        content.innerHTML = `
            <div class="collapsible-card" id="riskbedomning-card">
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('riskbedomning-card')">
                    <div class="collapsible-title"><i class="fas fa-shield-alt"></i><span>Riskbedömning</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body">
            <div class="rb-layout">

                <!-- Sammanlagd risk – stor badge -->
                <div class="rb-summary">
                    <div class="rb-summary-left">
                        <span class="rb-label">Sammanlagd risk</span>
                        <span class="rb-risk-badge rb-risk-badge--${riskClass}">${sammanlagd}</span>
                    </div>
                    <div class="rb-summary-meta">
                        ${f['Riskbedömning utförd datum'] ? `<span><i class="fas fa-calendar-alt"></i> Utförd: ${fmtDate(f['Riskbedömning utförd datum'])}</span>` : ''}
                        ${f['Kundens riskbedömning godkänd'] ? `<span><i class="fas fa-check-circle"></i> Godkänd: ${fmtDate(f['Kundens riskbedömning godkänd'])}</span>` : ''}
                    </div>
                </div>

                <!-- Motivering -->
                ${f['Motivering'] ? `
                <div class="rb-section">
                    <div class="rb-section-title"><i class="fas fa-align-left"></i> Motivering</div>
                    <p class="rb-text">${f['Motivering']}</p>
                </div>` : ''}

                <!-- Riskfaktorer -->
                <div class="rb-section">
                    <div class="rb-section-title"><i class="fas fa-balance-scale"></i> Riskfaktorer</div>
                    <div class="rb-factors">
                        ${riskHöjandeBlock('Högriskbransch', f['Kunden verkar i en högriskbransch'])}
                        ${riskHöjandeBlock('Riskhöjande – tjänster', f['Riskhöjande faktorer tjänster'])}
                        ${riskHöjandeBlock('Riskhöjande – övrigt', f['Riskhöjande faktorer övrigt'])}
                        ${riskSänkandeBlock('Risksänkande faktorer', f['Risksänkande faktorer'])}
                    </div>
                    ${f['Kommentar till riskfaktorerna ovan'] ? `<p class="rb-comment"><i class="fas fa-comment-alt"></i> ${f['Kommentar till riskfaktorerna ovan']}</p>` : ''}
                </div>

                <!-- Risksänkande åtgärder -->
                ${f['Risksänkande åtgjärder'] ? `
                <div class="rb-section">
                    <div class="rb-section-title"><i class="fas fa-shield-alt"></i> Risksänkande åtgärder</div>
                    <p class="rb-text">${f['Risksänkande åtgjärder']}</p>
                </div>` : ''}

                <!-- PEP & sanktioner -->
                <div class="rb-section">
                    <div class="rb-section-title"><i class="fas fa-search"></i> PEP & sanktioner</div>
                    <div class="rb-pep-row">
                        <div class="rb-pep-item">
                            <span class="rb-label">PEP-status</span>
                            <span class="rb-pep-badge ${pepList.includes('Inte PEP') ? 'rb-pep-badge--ok' : pepList.length ? 'rb-pep-badge--warn' : 'rb-pep-badge--unknown'}">
                                ${pepList.length ? pepList.join(', ') : '—'}
                            </span>
                        </div>
                        <div class="rb-pep-item">
                            <span class="rb-label">Antal träffar</span>
                            <span class="rb-value">${f['Antal träffar PEP och sanktionslistor'] ?? '—'}</span>
                        </div>
                        ${f['Rapport PEP'] ? `
                        <div class="rb-pep-item">
                            <span class="rb-label">Rapport</span>
                            <a href="${f['Rapport PEP']}" target="_blank" class="rb-link"><i class="fas fa-external-link-alt"></i> Öppna rapport</a>
                        </div>` : ''}
                    </div>
                </div>

            </div>
                </div>
            </div>
        `;
    }

    displayEmptyRiskAssessment() {
        const content = document.getElementById('risk-assessment-content');
        if (!content) return;
        content.innerHTML = `
            <div class="collapsible-card" id="riskbedomning-card">
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('riskbedomning-card')">
                    <div class="collapsible-title"><i class="fas fa-shield-alt"></i><span>Riskbedömning</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body">
                    <div class="empty-state">
                        <i class="fas fa-shield-alt"></i>
                        <p>Det finns ännu ingen riskbedömning registrerad för denna kund.</p>
                    </div>
                </div>
            </div>
        `;
    }

    getRiskLevelClass(level) {
        if (!level) return 'medium';
        const l = level.toLowerCase();
        if (l === 'hög' || l === 'förhöjd' || l === 'high') return 'high';
        if (l === 'låg' || l === 'low' || l === 'normal') return 'low';
        return 'medium';
    }

    // Alla tillgängliga tjänster från Airtable-fältets choices
    getAllTjanster() {
        return [
            'Löpande bokföring',
            'Lönehantering',
            'Kundreskontra',
            'Leverantörsreskontra',
            'Avstämning',
            'AVSTÄMNING',
            'ÅRSREDOVISNING',
            'Årsredovisning',
            'Deklaration',
            'Moms',
            'Rådgivning',
            'ROT/RUT',
            'ROT/RUT-hantering',
            'Inlämning periodisk sammanställning',
            'Utföra betalningsuppdrag',
            'Hantering av anlägningsregister och avskrivningar',
            'Upprätta kontrollbalansräkning'
        ];
    }

    async loadServices() {
        if (!this.customerData || !this.customerData.fields) {
            this.displayEmptyServices();
            return;
        }

        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const byraId = this.userByraIds?.[0] || this.userData?.byraId || '';
        const byraHighRisk = this.customerData.fields['Lookup Byråns högrisktjänster'] || [];

        // Hämta byråns alla tillgängliga tjänster {id, namn}, cacha per byrå
        if (!this._byransTjanster && byraId) {
            try {
                const res = await fetch(`${baseUrl}/api/byra-tjanster?byraId=${encodeURIComponent(byraId)}`, {
                    ...getAuthOptsKundkort()
                });
                const data = res.ok ? await res.json() : {};
                // data.tjanster är nu [{id, namn}] — se /api/byra-tjanster
                this._byransTjanster = data.tjanster?.length ? data.tjanster : [];
            } catch (e) {
                console.warn('⚠️ Kunde inte hämta tjänster:', e.message);
                this._byransTjanster = [];
            }
        }

        // Hämta kundens aktiva tjänster (länkade record ID:n → namn)
        try {
            const res = await fetch(`${baseUrl}/api/kunddata/${this.customerId}/tjanster`, {
                ...getAuthOptsKundkort()
            });
            const data = res.ok ? await res.json() : {};
            // Spara aktiva som array av record ID:n
            this._aktivaTjansterIds = new Set((data.tjanster || []).map(t => t.id));
            // Uppdatera customerData för andra delar av koden
            if (this.customerData?.fields) {
                this.customerData.fields['Kundens utvalda tjänster'] = data.linkedIds || [];
            }
        } catch (e) {
            console.warn('⚠️ Kunde inte hämta kundens tjänster:', e.message);
            this._aktivaTjansterIds = new Set();
        }

        if (document.getElementById('services-content')) {
            this.renderTjanster(this._aktivaTjansterIds, byraHighRisk, 'services-content');
        }
        if (document.getElementById('ovrigkyc-tjanster')) {
            this.renderTjanster(this._aktivaTjansterIds, byraHighRisk, 'ovrigkyc-tjanster');
        }
    }

    renderTjanster(aktivaIds, byraHighRisk, targetId = 'services-content') {
        const content = document.getElementById(targetId);
        if (!content) return;

        const p = targetId;
        const alla = this._byransTjanster || [];
        const aktSet = aktivaIds instanceof Set ? aktivaIds : new Set();

        if (alla.length === 0) {
            content.innerHTML = '<p class="lead-empty">Inga tjänster registrerade för din byrå.</p>';
            return;
        }

        const riskBadge = (nivå) => {
            if (!nivå) return '';
            const map = { 'Hög': 'risk-pill--high', 'Förhöjd': 'risk-pill--high', 'Medel': 'risk-pill--medium', 'Låg': 'risk-pill--low', 'Normal': 'risk-pill--low' };
            return `<span class="risk-pill ${map[nivå] || 'risk-pill--medium'}">${nivå}</span>`;
        };

        // Gruppera per TJÄNSTTYP
        const grupper = {};
        alla.forEach(t => {
            const typ = t.typ || 'Övrigt';
            if (!grupper[typ]) grupper[typ] = [];
            grupper[typ].push(t);
        });

        const aktiva = alla.filter(t => aktSet.has(t.id));

        // Visningsläge — klickbara grå kort, info fälls ut
        const viewContent = aktiva.length === 0
            ? '<p class="lead-empty">Inga tjänster kopplade till kunden. Klicka Redigera för att välja.</p>'
            : aktiva.map((t, i) => {
                const uid = `tjanst-details-${p}-${i}`;
                const hasDetails = t.beskrivning || t.atgard;
                return `
                <div class="tjanst-collapsible-item" onclick="${hasDetails ? `customerCardManager.toggleTjanstDetails('${uid}')` : ''}">
                    <div class="tjanst-collapsible-header">
                        <span class="risker-vald-namn">${this._esc(t.namn)}</span>
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            ${t.riskbedomning ? riskBadge(t.riskbedomning) : ''}
                            ${hasDetails ? `<i class="fas fa-chevron-down tjanst-chevron" id="chevron-${uid}"></i>` : ''}
                        </div>
                    </div>
                    ${hasDetails ? `
                    <div class="tjanst-collapsible-body" id="${uid}" style="display:none;">
                        ${t.beskrivning ? `
                            <div class="risker-vald-section-label">Beskrivning av riskfaktorn</div>
                            <div class="risker-vald-desc">${this._esc(t.beskrivning)}</div>` : ''}
                        ${t.atgard ? `
                            <div class="risker-vald-section-label">Åtgärder</div>
                            <div class="risker-vald-desc">${this._esc(t.atgard)}</div>` : ''}
                    </div>` : ''}
                </div>`;
            }).join('');

        // Redigeringsläge — grupperade checkboxar med riskbadge och beskrivning
        const editContent = Object.entries(grupper).map(([typ, tjanster]) => `
            <div class="risker-checkgrupp">
                ${tjanster.map(t => `
                    <label class="risker-check-item">
                        <input type="checkbox" name="tjanst-${p}" value="${t.id}" ${aktSet.has(t.id) ? 'checked' : ''}
                            onchange="customerCardManager.updateTjansterCount('${p}')">
                        <span class="tjanst-check-box" style="margin-top:3px;flex-shrink:0;"></span>
                        <span class="risker-check-label">
                            <span class="risker-check-top">
                                <span class="risker-check-namn">${this._esc(t.namn)}</span>
                                ${riskBadge(t.riskbedomning)}
                            </span>
                        </span>
                    </label>
                `).join('')}
            </div>
        `).join('');

        content.innerHTML = `
            <div class="risker-selector">
                <div id="tjanster-view-${p}">${viewContent}</div>
                <div id="tjanster-edit-${p}" style="display:none;">
                    <p class="tjanster-edit-hint">Markera de tjänster som ska vara aktiva för kunden.</p>
                    ${editContent}
                    <div class="tjanster-edit-actions">
                        <button class="btn btn-primary btn-sm" onclick="customerCardManager.saveTjanster('${p}')">
                            <i class="fas fa-save"></i> Spara
                        </button>
                        <button class="btn btn-ghost btn-sm" onclick="customerCardManager.toggleTjansterEdit('${p}')">Avbryt</button>
                    </div>
                </div>
            </div>`;

        // Lägg pennan direkt i collapsible-body
        const tjanstBody = content.closest('.collapsible-body');
        if (tjanstBody) {
            let fab = tjanstBody.querySelector(`#tjanster-edit-btn-${p}`);
            if (!fab) {
                fab = document.createElement('button');
                fab.className = 'card-edit-fab';
                fab.id = `tjanster-edit-btn-${p}`;
                fab.title = 'Redigera';
                fab.setAttribute('onclick', `event.stopPropagation(); customerCardManager.toggleTjansterEdit('${p}')`);
                fab.innerHTML = '<i class="fas fa-pencil-alt"></i>';
                tjanstBody.appendChild(fab);
            }
        }
    }

    toggleTjanstDetails(uid) {
        const body = document.getElementById(uid);
        const chevron = document.getElementById(`chevron-${uid}`);
        if (!body) return;
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
    }

    toggleTjansterEdit(p = 'services-content') {
        const view = document.getElementById(`tjanster-view-${p}`);
        const edit = document.getElementById(`tjanster-edit-${p}`);
        const btn = document.getElementById(`tjanster-edit-btn-${p}`);
        if (!view || !edit) return;
        const isEditing = edit.style.display !== 'none';
        if (isEditing) {
            edit.style.display = 'none';
            view.style.display = '';
            btn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
            btn.classList.remove('is-active');
            this._saveKycStatus('KYC genomgången - Tjänster', true);
        } else {
            view.style.display = 'none';
            edit.style.display = '';
            btn.innerHTML = '<i class="fas fa-times"></i>';
            btn.classList.add('is-active');
            const card = btn?.closest('.collapsible-card');
            if (card && !card.classList.contains('open')) card.classList.add('open');
        }
    }

    updateTjansterCount(p = 'services-content') {
        const checked = document.querySelectorAll(`#tjanster-edit-${p} input[name="tjanst-${p}"]:checked`);
        const countEl = document.getElementById(`tjanster-count-${p}`);
        if (countEl) countEl.textContent = `${checked.length} aktiva`;
    }

    async saveTjanster(p = 'services-content') {
        const customerId = this.customerId;
        if (!customerId) {
            this.showNotification('Kund-ID saknas', 'error');
            return;
        }

        // Incheckade värden är nu record ID:n
        const checkedIds = [...document.querySelectorAll(`#tjanster-edit-${p} input[name="tjanst-${p}"]:checked`)]
            .map(cb => cb.value);

        const saveBtn = document.querySelector(`#tjanster-edit-${p} .btn-primary`);
        const originalText = saveBtn?.innerHTML;
        if (saveBtn) { saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; saveBtn.disabled = true; }

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const response = await fetch(`${baseUrl}/api/kunddata/${customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({
                    fields: { 'Kundens utvalda tjänster': checkedIds }
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            // Uppdatera lokal cache
            this._aktivaTjansterIds = new Set(checkedIds);
            if (this.customerData?.fields) {
                this.customerData.fields['Kundens utvalda tjänster'] = checkedIds;
            }

            const byraHighRisk = this.customerData?.fields?.['Lookup Byråns högrisktjänster'] || [];
            ['services-content', 'ovrigkyc-tjanster'].forEach(tid => {
                if (document.getElementById(tid)) this.renderTjanster(this._aktivaTjansterIds, byraHighRisk, tid);
            });
            this._saveKycStatus('KYC genomgången - Tjänster', true);
            this.showNotification(`Tjänster sparade — ${checkedIds.length} aktiva`, 'success');

        } catch (error) {
            console.error('❌ Fel vid sparande av tjänster:', error);
            this.showNotification(`Kunde inte spara: ${error.message}`, 'error');
            if (saveBtn) { saveBtn.innerHTML = originalText; saveBtn.disabled = false; }
        }
    }

    displayEmptyServices() {
        const content = document.getElementById('services-content');
        if (!content) return;
        content.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cogs"></i>
                <h3>Inga tjänster</h3>
                <p>Klicka på Redigera för att välja tjänster för kunden.</p>
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

    async loadUppdragsavtal() {
        const container = document.getElementById('uppdragsavtal-content');
        if (!container) return;

        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

        try {
            // Hämta avtal och byråinfo parallellt
            const [avtalRes, byraRes] = await Promise.all([
                fetch(`${baseUrl}/api/uppdragsavtal?customerId=${this.customerId}`, {
                    ...getAuthOptsKundkort()
                }),
                fetch(`${baseUrl}/api/byra-info`, {
                    ...getAuthOptsKundkort()
                })
            ]);

            const avtalData = avtalRes.ok ? await avtalRes.json() : { avtal: null };
            const byraData  = byraRes.ok  ? await byraRes.json()  : {};

            this.renderUppdragsavtal(avtalData.avtal, byraData);
        } catch (e) {
            console.error('❌ loadUppdragsavtal:', e);
            this.renderUppdragsavtal(null, {});
        }
    }

    renderUppdragsavtal(avtal, byraData = {}) {
        const container = document.getElementById('uppdragsavtal-content');
        if (!container) return;

        const rawF = avtal?.fields || {};
        // Normalisera fältnamn — stöd både gamla (å/ä/ö) och nya ASCII-namn
        const f = {
            'Uppdragsansvarig':    rawF['Uppdragsansvarig'] || '',
            'Avtalsdatum':         rawF['Avtalsdatum'] || '',
            'Avtalet gäller ifrån': rawF['Avtalet galler fran'] || rawF['Avtalet gäller ifrån'] || '',
            'Uppsägningstid':      rawF['Uppsagningstid'] ?? rawF['Uppsägningstid'] ?? '',
            'Övrigt uppdrag':      rawF['Ovrigt uppdrag'] || rawF['Övrigt uppdrag'] || '',
            'Ersättningsmodell':   rawF['Ersattningsmodell'] || rawF['Ersättningsmodell'] || '',
            'Arvode':              rawF['Arvode'] || '',
            'Arvodesperiod':       rawF['Arvodesperiod'] || 'månad',
            'Arvodekommentar':     rawF['Arvodekommentar'] || '',
            'Fakturaperiod':       rawF['Fakturaperiod'] || '',
            'Betalningsvillkor':   rawF['Betalningsvillkor'] ?? '',
            'Kunden godkänner allmänna villkor':            rawF['Kunden godkanner allm villkor'] || rawF['Kunden godkänner allmänna villkor'] || false,
            'Kunden godkänner personuppgiftsbiträdesavtal': rawF['Kunden godkanner puba'] || rawF['Kunden godkänner personuppgiftsbiträdesavtal'] || false,
            'Status':              rawF['Avtalsstatus'] || rawF['Status'] || '',
            'Signeringsdatum':     rawF['Signeringsdatum'] || '',
            'Utskickningsdatum':   rawF['Utskickningsdatum'] || rawF['fldCfjnBetFm03KES'] || '',
            'Signerat av kund':    rawF['Signerat av kund'] || rawF['Signerat av byra'] || '',
            'Signerat av byrå':    rawF['Signerat av byra'] || rawF['Signerat av byrå'] || '',
        };
        const isNew = !avtal;

        const today = new Date().toISOString().split('T')[0];
        const fmtDate = (d) => d ? d.split('T')[0] : '';
        const chk = (val) => val ? 'checked' : '';
        const sel = (opts, cur) => opts.map(v => `<option value="${v}" ${cur === v ? 'selected' : ''}>${v}</option>`).join('');

        // Byrådata — allt hämtat från Airtable via /api/byra-info
        const byraNamn     = byraData.byraNamn     || '';
        const byraOrgnr    = byraData.byraOrgnr    || this.userData?.orgnr || '';
        const konsulter    = byraData.konsulter     || [];
        const inloggadNamn = byraData.inloggadNamn  || this.userData?.name || '';

        // byransTjanster används bara för högrisk-kontroll — hämta namn ur {id, namn}-objekt
        const byransTjanster = this._byransTjanster?.length
            ? this._byransTjanster.map(t => t.namn)
            : this.getAllTjanster();
        const byraHighRisk = byraData.highRiskTjanster || this.customerData?.fields?.['Lookup Byråns högrisktjänster'] || [];

        const aktivaIds = new Set(this.customerData?.fields?.['Kundens utvalda tjänster'] || []);
        // Hämta tjänstnamnen från _byransTjanster via ID-matchning
        const aktiva = (this._byransTjanster || [])
            .filter(t => aktivaIds.has(t.id))
            .map(t => t.namn);
        const kundNamn = this.customerData?.fields?.['Namn'] || '';
        const orgnr    = this.customerData?.fields?.['Orgnr'] || '';

        // Förvalt ansvarig: sparat värde i avtalet, annars inloggad användares namn
        const ansvarig = f['Uppdragsansvarig'] || inloggadNamn;

        // Tjänster visas direkt från kundens valda tjänster (sätts på fliken Övrig KYC)
        const tjansterDisplay = aktiva.length
            ? aktiva.map(t => {
                const isHR = byraHighRisk.some(h => h.trim().toLowerCase() === t.toLowerCase());
                return `<div class="uppdrag-tjanst-row">
                    <i class="fas fa-check-circle" style="color:#10b981;"></i>
                    <span>${t}${isHR ? ' <span class="tjanst-highrisk-badge">Högrisk</span>' : ''}</span>
                </div>`;
            }).join('')
            : '<p class="uppdrag-hint" style="color:#94a3b8;"><i class="fas fa-info-circle"></i> Inga tjänster valda. Välj tjänster på fliken <strong>Övrig KYC</strong>.</p>';

        container.innerHTML = `
            <div class="uppdrag-wrap">

                <!-- STATUS-BANNER -->
                ${isNew ? `
                <div class="uppdrag-banner uppdrag-banner--ny">
                    <i class="fas fa-info-circle"></i>
                    Inget uppdragsavtal finns ännu. Fyll i och spara som utkast.
                </div>` : f['Status'] === 'Signerat' ? `
                <div class="uppdrag-banner uppdrag-banner--ok">
                    <i class="fas fa-check-circle"></i>
                    Signerat och klart ${fmtDate(f['Signeringsdatum']) ? fmtDate(f['Signeringsdatum']) + ' —' : ''} gäller fr.o.m. ${fmtDate(f['Avtalet gäller ifrån']) || '–'}.
                </div>` : (f['Status'] === 'Skickat till kund' && avtal?.fields?.['InleedDokumentId']) ? `
                <div class="uppdrag-banner uppdrag-banner--vantar">
                    <i class="fas fa-clock"></i>
                    Utskickat och väntar signering ${fmtDate(f['Utskickningsdatum']) ? '— ' + fmtDate(f['Utskickningsdatum']) : ''}. Avtalet skickades till konsult och kund för BankID-signering.
                </div>` : `
                <div class="uppdrag-banner uppdrag-banner--utkast">
                    <i class="fas fa-pencil-alt"></i>
                    Utkast — ej signerat ännu.
                </div>`}

                <!-- AVTALSHUVUD -->
                <div class="uppdrag-doc-header">
                    <div class="uppdrag-doc-titel">UPPDRAGSAVTAL</div>
                    <div class="uppdrag-doc-välkommen">
                        Varmt välkommen som kund hos oss på ${byraNamn}. Vi ser fram emot ett långt och givande samarbete.
                    </div>
                </div>

                <form id="uppdragsavtal-form" onsubmit="return false;">

                    <!-- PARTER -->
                    <div class="uppdrag-section uppdrag-section--card">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-handshake"></i> Avtalsparter</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                        <div class="uppdrag-parter-grid">
                            <div class="uppdrag-part">
                                <div class="uppdrag-part-label">Uppdragstagare</div>
                                <div class="uppdrag-part-value">${byraNamn}</div>
                                ${byraOrgnr ? `<div class="uppdrag-part-sub">${byraOrgnr}</div>` : ''}
                            </div>
                            <div class="uppdrag-part">
                                <div class="uppdrag-part-label">Uppdragsgivare</div>
                                <div class="uppdrag-part-value">${kundNamn}</div>
                                <div class="uppdrag-part-sub">${orgnr}</div>
                            </div>
                        </div>
                        <div class="uppdrag-grid" style="margin-top:1rem;">
                            <div class="uppdrag-field">
                                <label>Ansvarig hos byrån</label>
                                ${konsulter.length ? `
                                <select id="ua-ansvarig" class="uppdrag-input">
                                    ${konsulter.map(k => `<option value="${k.namn}" ${k.namn === ansvarig ? 'selected' : ''}>${k.namn}</option>`).join('')}
                                </select>` : `
                                <input type="text" id="ua-ansvarig" class="uppdrag-input" value="${ansvarig}" placeholder="Namn på ansvarig">`}
                            </div>
                            <div class="uppdrag-field">
                                <label>Avtalsdatum</label>
                                <input type="date" id="ua-avtalsdatum" class="uppdrag-input" value="${fmtDate(f['Avtalsdatum']) || today}">
                            </div>
                            <div class="uppdrag-field">
                                <label>Avtalet gäller fr.o.m.</label>
                                <input type="date" id="ua-galler-fran" class="uppdrag-input" value="${fmtDate(f['Avtalet gäller ifrån'])}">
                            </div>
                            <div class="uppdrag-field">
                                <label>Uppsägningstid (månader)</label>
                                <input type="number" id="ua-uppsagningstid" class="uppdrag-input" value="${f['Uppsägningstid'] ?? 3}" min="0" placeholder="3">
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- ARBETET OMFATTAR -->
                    <div class="uppdrag-section uppdrag-section--card is-collapsed">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-list-check"></i> Arbetet omfattar följande tjänster</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                        <p class="uppdrag-hint">Byrån åtar sig att utföra de tjänster som angetts nedan. Uppdragsavtalet kan fortlöpande utökas eller ändras till sin omfattning.</p>
                        <div class="uppdrag-tjanster-list">
                            ${tjansterDisplay}
                        </div>
                        <div class="uppdrag-field uppdrag-field--full" style="margin-top:1rem;">
                            <label>Övrigt (specificera vid behov)</label>
                            <textarea id="ua-tjanster-ovrigt" class="uppdrag-input uppdrag-textarea" rows="2"
                                placeholder="Eventuell specificering av uppdraget...">${f['Övrigt uppdrag'] || ''}</textarea>
                        </div>
                        </div>
                    </div>

                    <!-- ERSÄTTNING -->
                    <div class="uppdrag-section uppdrag-section--card is-collapsed">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-coins"></i> Ersättning</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                        <div class="uppdrag-checks" style="margin-bottom:1rem;">
                            <label class="uppdrag-check">
                                <input type="radio" name="ua-ersattningsmodell" id="ua-lopande" value="Löpande räkning"
                                    ${(f['Ersättningsmodell'] || 'Fast pris') === 'Löpande räkning' ? 'checked' : ''}
                                    onchange="document.getElementById('ua-fastpris-fields').style.display='none'">
                                <span>På löpande räkning enligt vid varje tidpunkt gällande prislista</span>
                            </label>
                            <label class="uppdrag-check">
                                <input type="radio" name="ua-ersattningsmodell" id="ua-fastpris" value="Fast pris"
                                    ${(f['Ersättningsmodell'] || 'Fast pris') !== 'Löpande räkning' ? 'checked' : ''}
                                    onchange="document.getElementById('ua-fastpris-fields').style.display=''">
                                <span>Fast pris</span>
                            </label>
                        </div>
                        <div id="ua-fastpris-fields" style="${(f['Ersättningsmodell'] || 'Fast pris') === 'Löpande räkning' ? 'display:none;' : ''}">
                            <div class="uppdrag-grid">
                                <div class="uppdrag-field">
                                    <label>Pris (kr exkl. moms)</label>
                                    <input type="number" id="ua-arvode" class="uppdrag-input" value="${f['Arvode'] || ''}" placeholder="0">
                                </div>
                                <div class="uppdrag-field">
                                    <label>Per</label>
                                    <select id="ua-arvode-period" class="uppdrag-input">
                                        <option value="månad" ${(f['Arvodesperiod'] || 'månad') === 'månad' ? 'selected' : ''}>Månad</option>
                                        <option value="kvartal" ${f['Arvodesperiod'] === 'kvartal' ? 'selected' : ''}>Kvartal</option>
                                        <option value="år" ${f['Arvodesperiod'] === 'år' ? 'selected' : ''}>År</option>
                                    </select>
                                </div>
                            </div>
                            <p class="uppdrag-hint" style="margin-top:0.75rem;">Vid fast pris har byrån därutöver rätt till ersättning för kostnader och utlägg som ansöknings- och registreringsavgifter, utlägg för resor, kost, logi, porto, bud, etc. Tilläggsarbeten och övertidsarbete på grund av försenad eller ofullständig materialleverans från kunden, ej avtalade extraarbeten till följd av lagändringar eller liknande är aldrig inräknade i det fasta priset utan ska ersättas separat.</p>
                        </div>
                        <div class="uppdrag-field uppdrag-field--full" style="margin-top:0.75rem;">
                            <label>Kommentar till arvodet</label>
                            <textarea id="ua-arvode-kommentar" class="uppdrag-input uppdrag-textarea" rows="2"
                                placeholder="T.ex. fast pris enl. tidigare avtal, extra arbete debiteras separat...">${f['Arvodekommentar'] || ''}</textarea>
                        </div>
                        </div>
                    </div>

                    <!-- BETALNINGSVILLKOR -->
                    <div class="uppdrag-section uppdrag-section--card is-collapsed">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-file-invoice"></i> Betalningsvillkor</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                        <p class="uppdrag-hint">Betalning görs mot faktura. Vid för sen betalning utgår dröjsmålsränta enligt räntelagen.</p>
                        <div class="uppdrag-grid">
                            <div class="uppdrag-field">
                                <label>Fakturaperiod</label>
                                <select id="ua-fakturaperiod" class="uppdrag-input">
                                    <option value="">Välj...</option>
                                    ${sel(['Månadsvis','Kvartalsvis','Halvårsvis','Årsvis','Löpande'], f['Fakturaperiod'])}
                                </select>
                            </div>
                            <div class="uppdrag-field">
                                <label>Betalningsvillkor (dagar)</label>
                                <input type="number" id="ua-betvillkor" class="uppdrag-input" value="${f['Betalningsvillkor'] ?? 10}" placeholder="10">
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- BILAGA 2: ALLMÄNNA VILLKOR -->
                    <div class="uppdrag-section">
                        <div class="uppdrag-section-title"><i class="fas fa-file-alt"></i> Bilaga 1 – Allmänna villkor</div>
                        <div class="uppdrag-bilaga-toggle" onclick="this.classList.toggle('is-open'); this.nextElementSibling.classList.toggle('open')">
                            <i class="fas fa-chevron-right uppdrag-bilaga-chevron"></i>
                            Visa fullständiga allmänna villkor
                        </div>
                        <div class="uppdrag-bilaga-text">
                            <p>Dessa allmänna villkor gäller för uppdrag avseende redovisnings-, rådgivnings- och andra granskningstjänster som inte utgör lagstadgad revision eller lagstadgade tilläggsuppdrag ("Uppdraget") som Byrån åtar sig att utföra för Uppdragsgivarens räkning.</p>
                            <p>Dessa allmänna villkor utgör tillsammans med uppdragsavtalet ("Uppdragsavtalet"), eller annan skriftlig överenskommelse, hela avtalet mellan Byrån och Uppdragsgivaren. Vid eventuella motstridigheter ska Uppdragsavtalet ha företräde.</p>
                            <h5>Byråns ansvar</h5>
                            <ul>
                                <li>Byrån ska utföra Uppdraget med sådan skicklighet och omsorg som följer av tillämpliga lagar, förordningar och föreskrifter samt god yrkessed i branschen.</li>
                                <li>Byrån ansvarar inte för slutsatser, rekommendationer och rapporter baserade på felaktig eller bristfällig information från Uppdragsgivaren eller tredje man som Uppdragsgivaren anvisat.</li>
                                <li>Byrån förpliktas att ta ansvar för skador som orsakats till följd av Byråns brott mot överenskommet avtal eller om fel i den levererade tjänsten har begåtts.</li>
                                <li>Byrån ska meddela Uppdragsgivaren avseende betydande fel eller uppgifter som upptäcks i räkenskapsmaterialet.</li>
                                <li>Byrån kan inte göras skadeståndsskyldig för skador orsakade av att Uppdragsgivaren lämnat ofullständiga eller felaktiga uppgifter eller anvisningar.</li>
                            </ul>
                            <h5>Uppdragsgivarens ansvar</h5>
                            <ul>
                                <li>Uppdragsgivaren ansvarar för att de upplysningar och anvisningar som lämnas till Byrån är korrekta och inte strider mot gällande lagar.</li>
                                <li>Uppdragsgivaren förpliktas att företagets skatter och avgifter redovisas och betalas och att aktuella tillstånd för verksamheten är aktuella.</li>
                                <li>Uppdragsgivaren förpliktas till att räkenskapsmaterial samlas in och bevaras.</li>
                                <li>Uppdragsgivaren ska på begäran av Byrån utan dröjsmål tillhandahålla sådan komplett och korrekt information som behövs för Uppdragets genomförande. Om Uppdragsgivaren dröjer med att tillhandahålla information kan detta orsaka förseningar och ökade kostnader. Byrån ansvarar inte för sådana förseningar och ökade kostnader.</li>
                            </ul>
                            <h5>Materialleveranser</h5>
                            <p>Material ska levereras till Byrån i så god tid att Byrån kan utföra sina tjänster på normal arbetstid och inom gällande tidsfrister. Om parterna inte avtalat annat ska Uppdragsgivaren lämna material enligt följande:</p>
                            <ul>
                                <li>Underlag för den löpande bokföringen lämnas senast tio dagar efter utgången av den period redovisningen gäller.</li>
                                <li>Underlag för löneadministration och löneberäkning lämnas minst sju dagar före attest- och löneutbetalningsdag.</li>
                                <li>Bokslutsmaterial lämnas senast 30 dagar efter räkenskapsperiodens slut.</li>
                                <li>Deklarations- och beskattningsmaterial lämnas senast 30 dagar efter beskattningsårets slut.</li>
                            </ul>
                            <h5>Sekretess och elektronisk kommunikation</h5>
                            <p>Respektive Part förbinder sig att inte lämna konfidentiell information om Uppdraget till utomstående, inte heller information om den andra Partens verksamhet, utan den andra Partens skriftliga samtycke – med undantag för vad som följer av lag, professionell skyldighet eller myndighetsbeslut. Denna sekretesskyldighet fortsätter att gälla även efter att avtalet har upphört. Parterna accepterar elektronisk kommunikation dem emellan och de risker denna medför.</p>
                            <h5>Uppsägning</h5>
                            <p>Uppdragsavtalet börjar gälla från den dag som anges i Uppdragsavtalet. En Part får, om inget annat avtalats, genom skriftligt meddelande säga upp Uppdragsavtal som gäller tillsvidare med tre (3) månaders uppsägningstid.</p>
                            <h5>Uppsägning – arvode</h5>
                            <p>Vid uppsägning av Uppdragsavtalet ska Uppdragsgivaren betala Byrån arvode, utlägg och kostnader enligt Uppdragsavtalet fram till upphörandetidpunkten. Om uppsägningen inte grundar sig på ett väsentligt avtalsbrott från Byråns sida ska Uppdragsgivaren även ersätta Byrån för andra rimliga kostnader som uppstått i samband med Uppdraget.</p>
                            <h5>Byråns rätt att omedelbart häva avtalet</h5>
                            <ul>
                                <li>Uppdragsgivaren är mer än sju dagar försenad med sina betalningar.</li>
                                <li>Uppdragsgivaren levererar inte material eller orsakar på annat sätt att uppdraget inte kan utföras såsom avtalats.</li>
                                <li>Uppdragsgivaren bryter mot ingånget avtal, lagar eller regler och underlåter att korrigera det påtalade felet inom sju dagar efter meddelande från Byrån.</li>
                                <li>Uppdragsgivaren bemöter Byråns personal på ett oetiskt eller kränkande sätt.</li>
                                <li>Uppdragsgivaren kan inte betala sina skulder, har konkursförvaltare, företagsrekonstruktör eller likvidator utsedd.</li>
                            </ul>
                            <h5>Uppdragsgivarens rätt att omedelbart häva avtalet</h5>
                            <p>Om Byrån bryter mot avtalet och underlåter att vidta åtgärder för att korrigera avtalsbrottet inom rimlig tid har Uppdragsgivaren rätt att med omedelbar verkan säga upp avtalet.</p>
                            <h5>Force majeure</h5>
                            <p>Yttre händelser utanför parternas kontroll (t.ex. myndighetsåtgärder, krig, mobilisering, arbetsmarknadskonflikt, naturkatastrof) och som inte endast är av tillfällig natur och som förhindrar uppdragets genomförande berättigar vardera parten att helt inställa uppdraget utan rätt till skadestånd. Avtalspart ska genast meddela den andra parten när force majeure uppkommer och när den upphör.</p>
                            <h5>Tvist</h5>
                            <p>Tvist mellan parterna ska i första hand lösas genom förhandling och i andra hand av allmän domstol på den ort där Byrån har sitt säte.</p>
                            <h5>Överlåtelse</h5>
                            <p>Parts rättigheter och skyldigheter enligt detta avtal kan överlåtas endast om den andra parten ger sitt samtycke till överlåtelsen.</p>
                            <h5>Prioritetsordning</h5>
                            <ol><li>Uppdragsavtal</li><li>Bilagor till uppdragsavtal</li><li>Dessa allmänna villkor</li></ol>
                        </div>
                    </div>

                    <!-- BILAGA 3: PERSONUPPGIFTSBITRÄDESAVTAL -->
                    <div class="uppdrag-section">
                        <div class="uppdrag-section-title"><i class="fas fa-shield-alt"></i> Bilaga 2 – Personuppgiftsbiträdesavtal (GDPR)</div>
                        <div class="uppdrag-bilaga-toggle" onclick="this.classList.toggle('is-open'); this.nextElementSibling.classList.toggle('open')">
                            <i class="fas fa-chevron-right uppdrag-bilaga-chevron"></i>
                            Visa fullständigt personuppgiftsbiträdesavtal
                        </div>
                        <div class="uppdrag-bilaga-text">
                            <h5>1 Bakgrund</h5>
                            <p>Parterna har i samband med detta Avtal ingått Tjänsteavtal avseende redovisningstjänster ("Tjänsteavtalet"). Inom åtagandena som följer av Tjänsteavtalet kan Byrån komma att behandla personuppgifter samt annan information för Uppdragsgivarens räkning. Med anledning härav ingår Parterna detta Avtal för att reglera förutsättningarna för behandling av – och tillgång till – Personuppgifter tillhöriga Uppdragsgivaren. Avtalet gäller så länge Byrån behandlar Personuppgifter för Uppdragsgivarens räkning.</p>
                            <h5>2 Definitioner</h5>
                            <p><strong>"Behandling"</strong> – en åtgärd eller kombination av åtgärder beträffande Personuppgifter, såsom insamling, registrering, lagring, bearbetning, utlämning eller radering.</p>
                            <p><strong>"Dataskyddsförordningen"</strong> – Europaparlamentets och Rådets Förordning (EU) 2016/679 (GDPR).</p>
                            <p><strong>"Personuppgifter"</strong> – varje upplysning som avser en identifierad eller identifierbar fysisk person.</p>
                            <p><strong>"Personuppgiftsansvarig"</strong> – den som bestämmer ändamålen och medlen för Behandlingen av Personuppgifter.</p>
                            <p><strong>"Personuppgiftsbiträde"</strong> – den som Behandlar Personuppgifter för den Personuppgiftsansvariges räkning.</p>
                            <p><strong>"Personuppgiftsincident"</strong> – en säkerhetsincident som leder till oavsiktlig eller olaglig förstöring, förlust, ändring eller obehörigt röjande av Personuppgifter.</p>
                            <h5>4 Allmänt om personuppgiftsbehandlingen</h5>
                            <p>Uppdragsgivaren är Personuppgiftsansvarig för de Personuppgifter som Behandlas inom ramen för Uppdraget. Byrån är att betrakta som Personuppgiftsbiträde åt Uppdragsgivaren. Byrån har gett tillräckliga garantier om att genomföra lämpliga tekniska och organisatoriska åtgärder för att Behandlingen uppfyller kraven i Dataskyddsförordningen och att den Registrerades rättigheter skyddas.</p>
                            <h5>6 Personal</h5>
                            <p>Byråns anställda och andra personer som utför arbete under dess överinseende och som får del av Personuppgifter tillhöriga Uppdragsgivaren, får endast Behandla dessa på instruktion från Uppdragsgivaren. Byrån ska tillse att dessa personer åtagit sig att iaktta konfidentialitet.</p>
                            <h5>7 Säkerhet</h5>
                            <p>Byrån ska vidta alla åtgärder avseende säkerhet som krävs enligt artikel 32 i Dataskyddsförordningen. Vid bedömningen av lämplig säkerhetsnivå ska särskild hänsyn tas till de risker som Behandling medför, i synnerhet från oavsiktlig eller olaglig förstöring, förlust eller obehörigt röjande.</p>
                            <h5>8 Personuppgiftsincident</h5>
                            <p>Byrån ska, med beaktande av typen av Behandling och den information Byrån har att tillgå, bistå Uppdragsgivaren med att tillse att skyldigheterna i samband med eventuell Personuppgiftsincident kan fullgöras på sätt som följer av artikel 33–34 i Dataskyddsförordningen.</p>
                            <h5>10 Underbiträde</h5>
                            <p>Genom att teckna avtal med Byrån ska Uppdragsgivaren anses ha lämnat ett generellt skriftligt godkännande att anlita underbiträde. Byrån ska digitalt informera Uppdragsgivaren om ett nytt underbiträde ska anlitas och ge Uppdragsgivaren möjlighet att göra invändningar. Byrån ska tillse att nytt underbiträde ingår ett skriftligt personuppgiftsbiträdesavtal innan arbetet påbörjas. Om underbiträdet inte fullgör sina skyldigheter ska Byrån vara ansvarig gentemot Uppdragsgivaren.</p>
                            <h5>11 Överföring till tredje land</h5>
                            <p>Byrån får förflytta, förvara, överföra eller på annat sätt Behandla Personuppgifter utanför EU/EES om sådan överföring uppfyller de krav som följer av Dataskyddsförordningen.</p>
                            <h5>12 Rätt till insyn</h5>
                            <p>Byrån ska ge Uppdragsgivaren tillgång till all information som krävs för att visa att skyldigheterna enligt artikel 28 i Dataskyddsförordningen har fullgjorts. Byrån ska alltid ha rätt till skäligt varsel inför en granskning och Uppdragsgivaren ska ersätta Byrån för kostnader i samband med sådan granskning.</p>
                            <h5>13 Register över behandlingen</h5>
                            <p>Byrån ska föra ett elektroniskt register över alla kategorier av Behandling som utförts för Uppdragsgivarens räkning, innehållande bl.a. ändamålen med Behandlingen, kategorier av Registrerade och Personuppgifter, kategorier av mottagare och tidsfristerna för radering.</p>
                            <h5>14 Ansvar</h5>
                            <p>De ansvarsbegränsningar som framgår av Tjänsteavtalet gäller också i detta Avtal. Om dessa ansvarsbegränsningar inte skulle visa sig gälla begränsas ansvar till etthundratusen (100 000) kronor.</p>
                            <h5>15 Avtalets upphörande</h5>
                            <p>När Byrån upphör med Behandling av Personuppgifter för Uppdragsgivaren räkning ska Byrån återlämna alla Personuppgifter till Uppdragsgivaren – eller, om Uppdragsgivaren så skriftligen meddelar, förstöra och radera dem. Efter att Avtalet upphör äger Byrån inte rätt att spara Personuppgifter tillhöriga Uppdragsgivaren.</p>
                            <h5>17 Tillämplig lag och tvister</h5>
                            <p>Svensk lag ska tillämpas på Avtalet. Tvister som uppstår i anledning av Avtalet ska slutligt avgöras genom skiljedomsförfarande administrerat av Stockholms Handelskammares Skiljedomsinstitut (SCC). Skiljeförfarandets säte ska vara Stockholm och språket ska vara svenska. Skiljeförfarande som påkallats med hänvisning till denna skiljeklausul omfattas av sekretess. Part har rätt att vid svensk domstol anhängiggöra tvist om tvisteföremålets storlek understiger 100 000 kr.</p>
                        </div>
                    </div>

                    <!-- SIGNERING -->
                    <div class="uppdrag-section uppdrag-section--card">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-signature"></i> Signering & status</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                        <div class="uppdrag-grid">
                            <div class="uppdrag-field">
                                <label>Status</label>
                                <select id="ua-status" class="uppdrag-input">
                                    ${sel(['Utkast','Skickat till kund','Signerat','Avslutat'], f['Status'] || 'Utkast')}
                                </select>
                            </div>
                            <div class="uppdrag-field">
                                <label>Signeringsdatum</label>
                                <input type="date" id="ua-signdatum" class="uppdrag-input" value="${fmtDate(f['Signeringsdatum'])}">
                            </div>
                            <div class="uppdrag-field">
                                <label>Signerat av (kund)</label>
                                <input type="text" id="ua-sign-kund" class="uppdrag-input" value="${f['Signerat av kund'] || ''}" placeholder="Namn">
                            </div>
                            <div class="uppdrag-field">
                                <label>Signerat av (byrå)</label>
                                <input type="text" id="ua-sign-byra" class="uppdrag-input" value="${f['Signerat av byrå'] || ''}" placeholder="Namn">
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- ÅTGÄRDER -->
                    <div class="uppdrag-actions">
                        ${avtal && (f['Status'] === 'Skickat till kund' || f['Status'] === 'Signerat') ? `
                        <div class="uppdrag-signering-status">
                            ${f['Status'] === 'Signerat' 
                                ? `<i class="fas fa-check-circle" style="color:#10b981;"></i> Signerat och klart ${fmtDate(f['Signeringsdatum']) ? '— ' + fmtDate(f['Signeringsdatum']) : ''}`
                                : `<i class="fas fa-clock" style="color:#f59e0b;"></i> Utskickat och väntar signering ${fmtDate(f['Utskickningsdatum']) ? '— ' + fmtDate(f['Utskickningsdatum']) : ''}`
                            }
                        </div>` : ''}
                        <button type="button" class="btn btn-primary" onclick="customerCardManager.saveUppdragsavtal(${avtal ? `'${avtal.id}'` : 'null'})">
                            <i class="fas fa-save"></i> Spara utkast
                        </button>
                        ${avtal ? `
                        <button type="button" class="btn btn-secondary" onclick="customerCardManager.downloadUppdragsavtalPdf('${avtal.id}')">
                            <i class="fas fa-file-pdf"></i> Ladda ner PDF
                        </button>
                        <button type="button" class="btn btn-inleed" onclick="customerCardManager.skickaInleed('${avtal.id}')">
                            <i class="fas fa-pen-nib"></i> Skicka för signering (InLeed)
                        </button>
                        ${(avtal.fields?.['InleedDokumentId'] && (avtal.fields['Avtalsstatus'] || avtal.fields['Status']) === 'Skickat till kund') ? `
                        <button type="button" class="btn btn-secondary" onclick="customerCardManager.hamtaSigneratUppdragsavtal('${avtal.id}')" title="Hämta färdigsignerat dokument från Inleed och spara till Dokumentation">
                            <i class="fas fa-download"></i> Hämta signerat dokument
                        </button>` : ''}` : `<span class="uppdrag-hint" style="margin:0;">Spara utkastet först för att kunna generera PDF.</span>`}
                    </div>

                </form>
            </div>
        `;
    }

    async saveUppdragsavtal(avtalId) {
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

        const val = (id) => document.getElementById(id)?.value || '';
        const chk = (id) => document.getElementById(id)?.checked || false;

        // Valda tjänster — hämta namn via ID-matchning mot _byransTjanster
        const aktivaIds = new Set(this.customerData?.fields?.['Kundens utvalda tjänster'] || []);
        const valdaTjanster = (this._byransTjanster || [])
            .filter(t => aktivaIds.has(t.id))
            .map(t => t.namn);

        // Ersättningsmodell (radio)
        const ersattningsmodell = document.querySelector('#uppdragsavtal-form input[name="ua-ersattningsmodell"]:checked')?.value || 'Fast pris';

        const fields = {
            'KundID':                               this.customerId,
            'Byra ID':                              this.customerData?.fields?.['Byrå ID'] || '',
            'Kundnamn':                             this.customerData?.fields?.['Namn'] || '',
            'Orgnr':                                this.customerData?.fields?.['Orgnr'] || '',
            'Uppdragsansvarig':                     val('ua-ansvarig'),
            'Avtalsdatum':                          val('ua-avtalsdatum') || null,
            'Avtalet galler fran':                  val('ua-galler-fran') || null,
            'Uppsagningstid':                       parseInt(val('ua-uppsagningstid')) || null,
            'Valda tjanster':                       valdaTjanster.join(', '),
            'Ovrigt uppdrag':                       val('ua-tjanster-ovrigt'),
            'Ersattningsmodell':                    ersattningsmodell,
            'Arvode':                               parseFloat(val('ua-arvode')) || null,
            'Arvodesperiod':                        val('ua-arvode-period') || 'manad',
            'Arvodekommentar':                      val('ua-arvode-kommentar'),
            'Fakturaperiod':                        val('ua-fakturaperiod'),
            'Betalningsvillkor':                    parseInt(val('ua-betvillkor')) || null,
            'Kunden godkanner allm villkor':        chk('ua-godkanner-villkor'),
            'Kunden godkanner puba':                chk('ua-godkanner-puba'),
            'Avtalsstatus':                          val('ua-status'),
            'Signeringsdatum':                      val('ua-signdatum') || null,
            'Signerat av kund':                     val('ua-sign-kund'),
            'Signerat av byra':                     val('ua-sign-byra'),
        };

        // Ta bort tomma / null-värden
        Object.keys(fields).forEach(k => {
            if (fields[k] === null || fields[k] === '' || fields[k] !== fields[k]) delete fields[k];
        });

        const saveBtn = document.querySelector('#uppdragsavtal-form .btn-primary');
        if (saveBtn) { saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; saveBtn.disabled = true; }

        try {
            const method = avtalId ? 'PATCH' : 'POST';
            const url = avtalId
                ? `${baseUrl}/api/uppdragsavtal/${avtalId}`
                : `${baseUrl}/api/uppdragsavtal`;

            const response = await fetch(url, {
                method,
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            // Ladda om med det sparade avtalet
            this.renderUppdragsavtal(data.avtal);
            this.showNotification('Uppdragsavtal sparat!', 'success');

        } catch (error) {
            console.error('❌ Fel vid sparande av uppdragsavtal:', error);
            this.showNotification(`Kunde inte spara: ${error.message}`, 'error');
            if (saveBtn) { saveBtn.innerHTML = '<i class="fas fa-save"></i> Spara utkast'; saveBtn.disabled = false; }
        }
    }

    async hamtaSigneratUppdragsavtal(avtalId) {
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const btn = document.querySelector('[onclick*="hamtaSigneratUppdragsavtal"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Hämtar...'; }
        try {
            const resp = await fetch(`${baseUrl}/api/uppdragsavtal/${avtalId}/hamta-signerat`, {
                method: 'POST',
                ...getAuthOptsKundkort()
            });
            const data = await resp.json();
            if (resp.ok && data.savedToDocs) {
                this.showNotification(data.message || 'Signerat dokument sparad på Dokumentation.', 'success');
                this.loadUppdragsavtal();
                this.loadDocuments();
            } else {
                this.showNotification(data.error || data.message || 'Kunde inte hämta signerat dokument.', 'error');
            }
        } catch (e) {
            this.showNotification('Fel: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> Hämta signerat dokument'; }
        }
    }

    async downloadUppdragsavtalPdf(avtalId) {
        const btn = document.querySelector('.btn-inleed')?.previousElementSibling;
        const origText = btn?.innerHTML;
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Genererar...'; btn.disabled = true; }

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const response = await fetch(`${baseUrl}/api/uppdragsavtal/${avtalId}/pdf`, {
                method: 'POST',
                ...getAuthOptsKundkort()
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            // Ladda ner PDF i webbläsaren
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
            a.download = match ? decodeURIComponent(match[1].replace(/"/g, '')) : 'Uppdragsavtal.pdf';
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showNotification('PDF nedladdad!', 'success');
        } catch (error) {
            this.showNotification(`Kunde inte generera PDF: ${error.message}`, 'error');
        } finally {
            if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        }
    }

    async skickaInleed(avtalId) {
        const kontaktPersoner = this._kontaktPersoner || [];
        const valjbara = kontaktPersoner.filter(p => p.epost);
        const existing = document.getElementById('inleed-modal');
        if (existing) existing.remove();

        const personOptions = valjbara.length > 0
            ? valjbara.map((p, idx) => `
                <label class="inleed-person-option">
                    <input type="checkbox" name="signerare-choice" value="${idx}">
                    <div class="inleed-person-info">
                        <span class="inleed-person-name">${this._esc(p.namn)}</span>
                        ${(p.roller?.length || p.roll) ? `<span class="inleed-person-roll">${this._esc((p.roller || (p.roll ? [p.roll] : [])).join(', '))}</span>` : ''}
                        <span class="inleed-person-contact"><i class="fas fa-envelope"></i> ${this._esc(p.epost)}</span>
                        ${p.personnr ? `<span class="inleed-person-contact"><i class="fas fa-id-card"></i> ${this._esc(p.personnr)}</span>` : ''}
                    </div>
                </label>`).join('')
            : '';

        const modal = document.createElement('div');
        modal.id = 'inleed-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="max-width:520px;">
                <div class="modal-header">
                    <h3><i class="fas fa-pen-nib" style="color:var(--accent)"></i> Skicka för BankID-signering</h3>
                    <button class="modal-close" onclick="document.getElementById('inleed-modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    ${valjbara.length > 0 ? `
                        <p style="color:#475569;margin-bottom:1rem;font-size:0.9rem;">
                            Välj vilka kontaktpersoner som ska signera uppdragsavtalet via BankID.
                            De får ett e-postmeddelande med signeringslänk.
                        </p>
                        <div class="inleed-person-list">${personOptions}</div>
                    ` : `
                        <p style="color:#475569;margin-bottom:1rem;font-size:0.9rem;">
                            Inga kontaktpersoner med e-post är registrerade på Roller-kortet. Lägg till kontaktpersoner med e-postadress först.
                        </p>
                    `}
                    <div id="inleed-status-msg" style="display:none;margin-top:1rem;padding:0.75rem;border-radius:8px;font-size:0.9rem;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('inleed-modal').remove()">Avbryt</button>
                    <button id="inleed-send-btn" class="btn btn-primary btn-sm" onclick="customerCardManager._genomforSignering('${avtalId}')" ${valjbara.length === 0 ? 'disabled' : ''}>
                        <i class="fas fa-paper-plane"></i> Skicka för signering
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        this._valjbaraSignerare = valjbara;
        if (valjbara.length > 0) {
            const checkboxes = modal.querySelectorAll('input[name="signerare-choice"]');
            checkboxes.forEach((cb, i) => { cb.value = i; });
            if (checkboxes[0]) checkboxes[0].checked = true;
        }
    }

    async _genomforSignering(avtalId) {
        const valjbara = this._valjbaraSignerare || [];
        const checked = Array.from(document.querySelectorAll('input[name="signerare-choice"]:checked')) || [];
        const signerare = checked
            .map(cb => valjbara[parseInt(cb.value, 10)])
            .filter(p => p && p.epost)
            .map(p => ({ namn: p.namn || '', epost: p.epost || '', personnr: p.personnr || '', telefon: p.telefon || '' }));

        if (signerare.length === 0) {
            this._showInleedStatus('Välj minst en kontaktperson att skicka till.', 'error');
            return;
        }

        const btn = document.getElementById('inleed-send-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Skickar...'; }

        this._showInleedStatus('Genererar PDF och skickar till Inleed...', 'info');

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const resp = await fetch(`${baseUrl}/api/uppdragsavtal/${avtalId}/skicka-for-signering`, {
                method: 'POST',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ signerare })
            });
            const data = await resp.json();
            if (!resp.ok) {
                this._showInleedStatus(`Fel: ${data.error || 'Okänt fel'}`, 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Försök igen'; }
                return;
            }
            this._showInleedStatus(`✅ ${data.message}`, 'success');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-check"></i> Skickat!'; }
            setTimeout(() => document.getElementById('inleed-modal')?.remove(), 2500);
            const epostLista = signerare.map(s => s.epost).join(', ');
            this.showNotification(`Avtalet skickat till ${epostLista} för BankID-signering`, 'success');
            this.loadUppdragsavtal();
        } catch (e) {
            this._showInleedStatus(`Fel: ${e.message}`, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Försök igen'; }
        }
    }

    _showInleedStatus(msg, type) {
        const el = document.getElementById('inleed-status-msg');
        if (!el) return;
        const colors = { success: '#dcfce7', error: '#fee2e2', info: '#eff6ff' };
        const textColors = { success: '#166534', error: '#991b1b', info: '#1e40af' };
        el.style.display = 'block';
        el.style.background = colors[type] || colors.info;
        el.style.color = textColors[type] || textColors.info;
        el.textContent = msg;
    }

    async loadNotes() {
        const content = document.getElementById('notes-content');
        
        try {
            if (!isLoggedInKundkort()) {
                console.error('❌ Not logged in');
                this.displayEmptyNotes();
                return;
            }

            const response = await fetch(`${window.apiConfig.baseUrl}/api/notes?customerId=${this.customerId}`, {
                method: 'GET',
                ...getAuthOptsKundkort()
            });
            
            console.log('🔍 Notes response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Notes loaded successfully:', data);
                this.displayNotes(data.notes || []);
            } else if (response.status === 401 || response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ Authentication failed:', response.status, errorData);
                this.displayEmptyNotes();
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ Error loading notes:', response.status, response.statusText, errorData);
                this.displayEmptyNotes();
            }
        } catch (error) {
            console.error('❌ Error loading notes:', error);
            this.displayEmptyNotes();
        }
    }

    displayNotes(notes) {
        const content = document.getElementById('notes-content');
        this._notes = notes;

        const bodyHTML = notes.length === 0
            ? `<div class="empty-state"><i class="fas fa-sticky-note"></i><p>Inga anteckningar ännu.</p></div>`
            : notes.map(note => this.createNoteCard(note)).join('');

        content.innerHTML = `
            <div class="collapsible-card" id="anteckningar-card">
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('anteckningar-card')">
                    <div class="collapsible-title"><i class="fas fa-sticky-note"></i><span>Anteckningar</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body">
                    ${bodyHTML}
                    <div style="margin-top:0.75rem;">
                        <button class="btn btn-ghost btn-sm" onclick="customerCardManager.addNote()">
                            <i class="fas fa-plus"></i> Lägg till anteckning
                        </button>
                    </div>
                </div>
            </div>`;

        const urlParams = new URLSearchParams(window.location.search);
        const noteId = urlParams.get('note');
        if (noteId) {
            requestAnimationFrame(() => {
                const details = document.getElementById(`note-details-${noteId}`);
                const card = document.getElementById(`note-${noteId}`);
                if (details && card && details.style.display === 'none') {
                    this.toggleNote(noteId);
                }
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        }
    }

    displayEmptyNotes() {
        const content = document.getElementById('notes-content');
        content.innerHTML = `
            <div class="collapsible-card" id="anteckningar-card">
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('anteckningar-card')">
                    <div class="collapsible-title"><i class="fas fa-sticky-note"></i><span>Anteckningar</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body">
                    <div class="empty-state"><i class="fas fa-sticky-note"></i><p>Inga anteckningar ännu.</p></div>
                    <div style="margin-top:0.75rem;">
                        <button class="btn btn-ghost btn-sm" onclick="customerCardManager.addNote()">
                            <i class="fas fa-plus"></i> Lägg till anteckning
                        </button>
                    </div>
                </div>
            </div>`;
    }

    createNoteCard(note) {
        const fields = note.fields || {};
        const noteId = note.id;

        const typAvAnteckning = fields['Typ av anteckning'];
        const typAvAnteckningText = Array.isArray(typAvAnteckning) && typAvAnteckning.length > 0
            ? typAvAnteckning.join(', ')
            : 'Anteckning';

        const date = fields['Datum'] || '-';
        const content = fields['Notes'] || '';
        const person = fields['Person'] || '';
        const attachments = fields['Attachments'] || [];
        const todoList = this.createTodoList(fields, noteId);
        const attachmentsHTML = this.createAttachmentsHTML(attachments);

        const hasDetails = content || person || todoList || attachments.length > 0;

        return `
            <div class="note-card" id="note-${noteId}">
                <div class="note-summary" onclick="customerCardManager.toggleNote('${noteId}')">
                    <div class="note-summary-left">
                        <i class="fas fa-chevron-right note-chevron"></i>
                        <span class="note-type-label">${typAvAnteckningText}</span>
                        <span class="note-date"><i class="fas fa-calendar-alt"></i> ${date}</span>
                    </div>
                    <div class="note-summary-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon-note" title="Redigera" onclick="customerCardManager.editNote('${noteId}')">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button class="btn-icon-note btn-icon-note--danger" title="Ta bort" onclick="customerCardManager.deleteNote('${noteId}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                ${hasDetails ? `
                <div class="note-details" id="note-details-${noteId}" style="display:none;">
                    ${person ? `<p class="note-person"><i class="fas fa-user"></i> ${person}</p>` : ''}
                    ${content ? `<div class="note-content"><p>${content.replace(/\n/g, '<br>')}</p></div>` : ''}
                    ${todoList}
                    ${attachmentsHTML}
                </div>` : ''}
            </div>
        `;
    }

    toggleNote(noteId) {
        const details = document.getElementById(`note-details-${noteId}`);
        const card = document.getElementById(`note-${noteId}`);
        if (!details) return;
        const isOpen = details.style.display !== 'none';
        details.style.display = isOpen ? 'none' : 'block';
        card.querySelector('.note-chevron')?.classList.toggle('note-chevron--open', !isOpen);
    }

    createTodoList(fields, noteId) {
        const todos = [];
        for (let i = 1; i <= 8; i++) {
            const todo = fields[`ToDo${i}`];
            const status = fields[`Status${i}`];
            
            if (todo && todo.trim() !== '' && todo.trim() !== '\n') {
                todos.push({ todo, status, index: i });
            }
        }
        
        if (todos.length === 0) {
            return '';
        }
        
        const statusOpts = [
            { v: '', l: 'Välj...' },
            { v: 'Att göra', l: 'Att göra' },
            { v: 'Pågående', l: 'Pågående' },
            { v: 'Akut', l: 'Akut' },
            { v: 'Klart', l: 'Klart' }
        ];
        
        const todoItems = todos.map(item => {
            const statusIcon = this.getStatusIcon(item.status);
            const statusClass = this.getStatusClass(item.status);
            const opts = statusOpts.map(o => `<option value="${o.v}" ${item.status === o.v ? 'selected' : ''}>${o.l}</option>`).join('');
            return `
                <div class="todo-item todo-item-editable" data-note-id="${noteId}" data-index="${item.index}">
                    <span class="todo-status ${statusClass}">${statusIcon}</span>
                    <span class="todo-text">${this._esc(item.todo).replace(/\n/g, '<br>')}</span>
                    <select class="todo-status-select-inline" onchange="customerCardManager.updateTaskStatus('${noteId}', ${item.index}, this.value)" title="Ändra status">
                        ${opts}
                    </select>
                </div>
            `;
        }).join('');
        
        return `
            <div class="note-todo-inline">
                <div class="todo-list">
                    ${todoItems}
                </div>
            </div>
        `;
    }

    getStatusIcon(status) {
        if (!status) return '<i class="fas fa-circle" style="color: #94a3b8;"></i>';

        const statusLower = status.toLowerCase();
        if (statusLower === 'klart' || statusLower === 'klar') {
            return '<i class="fas fa-check-circle" style="color: #10b981;"></i>';
        } else if (statusLower === 'akut') {
            return '<i class="fas fa-exclamation-circle" style="color: #dc2626;"></i>';
        } else if (statusLower === 'pågående') {
            return '<i class="fas fa-clock" style="color: #f59e0b;"></i>';
        } else if (statusLower === 'att göra') {
            return '<i class="fas fa-circle" style="color: #64748b;"></i>';
        }
        return '<i class="fas fa-circle" style="color: #94a3b8;"></i>';
    }

    getStatusClass(status) {
        if (!status) return 'status-unknown';

        const statusLower = status.toLowerCase();
        if (statusLower === 'klart' || statusLower === 'klar') {
            return 'status-done';
        } else if (statusLower === 'akut') {
            return 'status-akut';
        } else if (statusLower === 'pågående') {
            return 'status-in-progress';
        } else if (statusLower === 'att göra') {
            return 'status-todo';
        }
        return 'status-unknown';
    }

    createAttachmentsHTML(attachments) {
        if (!attachments || attachments.length === 0) {
            return '';
        }
        
        const attachmentItems = attachments.map(attachment => {
            const filename = attachment.filename || 'Bilaga';
            const url = attachment.url || '#';
            const size = attachment.size ? `(${(attachment.size / 1024).toFixed(1)} KB)` : '';
            const thumbnail = attachment.thumbnails?.small?.url || attachment.thumbnails?.large?.url;
            
            return `
                <div class="attachment-item">
                    ${thumbnail ? `<img src="${thumbnail}" alt="${filename}" class="attachment-thumbnail">` : ''}
                    <div class="attachment-info">
                        <a href="${url}" target="_blank" class="attachment-link">
                            <i class="fas fa-file"></i> ${filename}
                        </a>
                        <span class="attachment-size">${size}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        return `
            <div class="note-attachments">
                <h5><i class="fas fa-paperclip"></i> Bilagor (${attachments.length})</h5>
                <div class="attachments-list">
                    ${attachmentItems}
                </div>
            </div>
        `;
    }

    async loadAvvikelser() {
        const content = document.getElementById('avvikelser-content');

        try {
            if (!isLoggedInKundkort()) {
                this.displayEmptyAvvikelser();
                return;
            }

            const response = await fetch(`${window.apiConfig.baseUrl}/api/avvikelser?customerId=${this.customerId}`, {
                method: 'GET',
                ...getAuthOptsKundkort()
            });

            if (response.ok) {
                const data = await response.json();
                this.displayAvvikelser(data.avvikelser || []);
            } else {
                this.displayEmptyAvvikelser();
            }
        } catch (error) {
            console.log('ℹ️ Avvikelser endpoint not available, showing empty state');
            this.displayEmptyAvvikelser();
        }
    }

    displayAvvikelser(avvikelser) {
        const content = document.getElementById('avvikelser-content');

        const bodyHTML = avvikelser.length === 0
            ? `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Inga avvikelser registrerade.</p></div>`
            : avvikelser.map(a => this.createAvvikelseCard(a)).join('');

        content.innerHTML = `
            <div class="collapsible-card" id="avvikelser-card">
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('avvikelser-card')">
                    <div class="collapsible-title"><i class="fas fa-exclamation-circle"></i><span>Avvikelser enligt PTL</span></div>
                    <i class="fas fa-chevron-down collapsible-chevron"></i>
                </div>
                <div class="collapsible-body">
                    ${bodyHTML}
                    <div style="margin-top:0.75rem;">
                        <button class="btn btn-ghost btn-sm" onclick="customerCardManager.addAvvikelse()">
                            <i class="fas fa-plus"></i> Registrera avvikelse
                        </button>
                    </div>
                </div>
            </div>`;
    }

    displayEmptyAvvikelser() {
        this.displayAvvikelser([]);
    }

    createAvvikelseCard(avvikelse) {
        const fields = avvikelse.fields || {};
        const statusColor = {
            'Öppen': '#ef4444',
            'Under utredning': '#f59e0b',
            'Rapporterad till FM': '#8b5cf6',
            'Rapporterad till Finanspolisen (FM)': '#8b5cf6',
            'Avslutad': '#10b981'
        }[fields['Status']] || '#ef4444';

        const beskrivning = fields['Förklararing'] || '';
        const datum = fields['Date'] || '-';
        const rapporteratDatum = fields['Date 2'] || '';
        const foretag = fields['Företagsnamn'] || '';
        const status = fields['Status'] || 'Öppen';

        return `
            <div class="avvikelse-card" style="--avvikelse-color: ${statusColor};">
                <div class="avvikelse-card-header">
                    <div class="avvikelse-card-title">
                        <span class="avvikelse-card-icon"><i class="fas fa-exclamation-circle"></i></span>
                        <h4>${fields['Typ av avvikelse'] || 'Avvikelse'}</h4>
                    </div>
                    <span class="avvikelse-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${status}</span>
                </div>
                <div class="avvikelse-card-meta">
                    <span class="avvikelse-datum"><i class="fas fa-calendar-alt"></i> ${datum}</span>
                    ${foretag ? `<span class="avvikelse-foretag"><i class="fas fa-building"></i> ${this._esc(foretag)}</span>` : ''}
                </div>
                ${beskrivning ? `
                <div class="avvikelse-beskrivning">
                    <h5 class="avvikelse-section-label"><i class="fas fa-align-left"></i> Beskrivning / Förklaring</h5>
                    <div class="avvikelse-beskrivning-text">${beskrivning.replace(/\n/g, '<br>')}</div>
                </div>` : ''}
                ${rapporteratDatum ? `
                <div class="avvikelse-fm-sektion">
                    <h5 class="avvikelse-section-label"><i class="fas fa-university"></i> Rapporterad till Finanspolisen</h5>
                    <p>${rapporteratDatum}</p>
                </div>` : ''}
                <div class="avvikelse-card-footer">
                    <button type="button" class="btn btn-avvikelse-edit" onclick="customerCardManager.editAvvikelse('${avvikelse.id}')">
                        <i class="fas fa-pencil-alt"></i> Redigera
                    </button>
                </div>
            </div>
        `;
    }

    addAvvikelse() {
        this.showAddAvvikelseModal();
    }

    showAddAvvikelseModal() {
        const byraId = this.customerData?.fields?.['Byrå ID'] || '';
        const orgnr = this.customerData?.fields?.['Orgnr'] || '';
        const companyName = this.customerData?.fields?.['Namn'] || '';

        const modalHTML = `
            <div id="add-avvikelse-modal" class="modal-overlay">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3><i class="fas fa-exclamation-circle"></i> Registrera avvikelse enligt PTL</h3>
                        <button class="modal-close" onclick="customerCardManager.closeAvvikelseModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="add-avvikelse-form">
                            <div class="form-group">
                                <label for="avvikelse-typ">Typ av avvikelse *</label>
                                <select id="avvikelse-typ" name="typ" required>
                                    <option value="">Välj typ...</option>
                                    <option value="Misstänkt penningtvätt">Misstänkt penningtvätt</option>
                                    <option value="Misstänkt finansiering av terrorism">Misstänkt finansiering av terrorism</option>
                                    <option value="Ovanlig transaktion">Ovanlig transaktion</option>
                                    <option value="Bristande kundkännedom">Bristande kundkännedom</option>
                                    <option value="Avvikande beteende">Avvikande beteende</option>
                                    <option value="Annan avvikelse">Annan avvikelse</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="avvikelse-datum">Datum *</label>
                                <input type="date" id="avvikelse-datum" name="datum" required value="${new Date().toISOString().split('T')[0]}">
                            </div>

                            <div class="form-group">
                                <label for="avvikelse-foretag">Företag</label>
                                <input type="text" id="avvikelse-foretag" value="${companyName}" readonly>
                            </div>

                            <div class="form-group">
                                <label for="avvikelse-beskrivning">Beskrivning / Förklaring *</label>
                                <textarea id="avvikelse-beskrivning" name="beskrivning" rows="6" placeholder="Beskriv avvikelsen i detalj, vad som observerats och varför det bedöms som avvikande..." required></textarea>
                            </div>

                            <div class="form-group">
                                <label for="avvikelse-status">Status *</label>
                                <select id="avvikelse-status" name="status" required>
                                    <option value="Öppen">Öppen</option>
                                    <option value="Under utredning">Under utredning</option>
                                    <option value="Rapporterad till FM">Rapporterad till Finanspolisen (FM)</option>
                                    <option value="Avslutad">Avslutad</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="avvikelse-fm-datum">Datum för rapportering till FM (om aktuellt)</label>
                                <input type="date" id="avvikelse-fm-datum" name="rapporteratDatum">
                            </div>

                            <input type="hidden" name="byraId" value="${byraId}">
                            <input type="hidden" name="orgnr" value="${orgnr}">
                            <input type="hidden" name="foretagsnamn" value="${companyName}">

                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" onclick="customerCardManager.closeAvvikelseModal()">
                                    Avbryt
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-save"></i> Spara avvikelse
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('add-avvikelse-modal');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('add-avvikelse-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAvvikelse(e.target);
        });
    }

    closeAvvikelseModal() {
        const modal = document.getElementById('add-avvikelse-modal');
        if (modal) modal.remove();
    }

    async saveAvvikelse(form) {
        try {
            const formData = new FormData(form);
            const avvikelseData = {
                typ: formData.get('typ'),
                datum: formData.get('datum'),
                beskrivning: formData.get('beskrivning'),
                status: formData.get('status'),
                rapporteratDatum: formData.get('rapporteratDatum') || '',
                byraId: formData.get('byraId'),
                orgnr: formData.get('orgnr'),
                foretagsnamn: formData.get('foretagsnamn')
            };

            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            if (!isLoggedInKundkort()) {
                alert('Du måste vara inloggad för att spara avvikelser');
                return;
            }

            const response = await fetch(`${baseUrl}/api/avvikelser`, {
                method: 'POST',
                ...getAuthOptsKundkort(),
                body: JSON.stringify(avvikelseData)
            });

            if (response.ok) {
                this.closeAvvikelseModal();
                this.loadAvvikelser();
            } else {
                const errorData = await response.json().catch(() => ({}));
                const msg = errorData.message || response.statusText;
                const detail = errorData.airtableError?.error?.message || errorData.airtableError?.message || '';
                alert(`Kunde inte spara avvikelse: ${msg}${detail ? '\n\nDatakälla: ' + detail : ''}`);
            }
        } catch (error) {
            console.error('❌ Error saving avvikelse:', error);
            alert(`Fel vid sparande av avvikelse: ${error.message}`);
        }
    }

    editAvvikelse(avvikelseId) {
        alert('Redigering av avvikelse kommer snart!');
    }

    async loadDocuments() {
        const content = document.getElementById('documents-content');
        
        try {
            if (!isLoggedInKundkort()) {
                console.warn('No auth token found');
                this.displayEmptyDocuments();
                return;
            }

            const response = await fetch(`${window.apiConfig.baseUrl}/api/documents?customerId=${this.customerId}`, {
                method: 'GET',
                ...getAuthOptsKundkort()
            });
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

        const bodyHTML = documents.length === 0
            ? `<div class="empty-state"><i class="fas fa-file-alt"></i><p>Inga dokument uppladdade ännu.</p></div>`
            : `<ul class="document-list">${documents.map(doc => this.createDocumentListItem(doc)).join('')}</ul>`;

        content.innerHTML = `
            <div class="documentation-content">
                ${bodyHTML}
                <div class="document-list-actions">
                    <button class="btn btn-ghost btn-sm" onclick="customerCardManager.uploadDocument()">
                        <i class="fas fa-upload"></i> Ladda upp dokument
                    </button>
                </div>
            </div>`;
    }

    displayEmptyDocuments() {
        this.displayDocuments([]);
    }

    createDocumentListItem(doc) {
        const fields = doc.fields || {};
        const namn = fields['Namn'] || doc.filename || 'Namnlös fil';
        const url = doc.url || '';
        const datum = fields['UppladdadDatum'] || namn.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '-';
        const beskrivning = fields['Beskrivning'] || '';
        const downloadBtn = url
            ? `<a href="${url}" target="_blank" rel="noopener" class="btn btn-primary btn-sm document-download-btn" download="${(doc.filename || namn).replace(/"/g, '')}"><i class="fas fa-download"></i> Ladda ner</a>`
            : `<button class="btn btn-primary btn-sm" disabled><i class="fas fa-download"></i> Ladda ner</button>`;
        const deleteBtn = (doc.sourceField != null && doc.sourceIndex != null)
            ? `<button type="button" class="btn btn-ghost btn-sm document-delete-btn" data-source-field="${(doc.sourceField || '').replace(/"/g, '&quot;')}" data-source-index="${doc.sourceIndex}" data-doc-name="${(namn || '').replace(/"/g, '&quot;')}" title="Ta bort dokument" onclick="customerCardManager.deleteDocumentFromBtn(this)"><i class="fas fa-trash-alt"></i></button>`
            : '';
        return `
            <li class="document-list-item">
                <i class="fas fa-file-pdf document-list-icon"></i>
                <div class="document-list-info">
                    <span class="document-list-name">${namn}</span>
                    <span class="document-list-meta">${beskrivning ? beskrivning + ' · ' : ''}${datum}</span>
                </div>
                <div class="document-list-buttons">
                    ${downloadBtn}
                    ${deleteBtn}
                </div>
            </li>
        `;
    }

    deleteDocumentFromBtn(btn) {
        const field = btn.getAttribute('data-source-field');
        const idx = btn.getAttribute('data-source-index');
        const name = btn.getAttribute('data-doc-name') || 'dokumentet';
        if (field != null && idx != null) this.deleteDocument(field, parseInt(idx, 10), name);
    }

    async deleteDocument(sourceField, sourceIndex, docName) {
        const msg = `Är du säker på att du vill ta bort "${docName}"?\n\nÅtgärden går inte att ångra.`;
        if (!confirm(msg)) return;

        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        try {
            const res = await fetch(`${baseUrl}/api/documents`, {
                method: 'DELETE',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ customerId: this.customerId, sourceField, sourceIndex })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            this.showNotification('Dokument borttaget.', 'success');
            this.loadDocuments();
        } catch (err) {
            console.error('❌ Ta bort dokument:', err);
            this.showNotification('Kunde inte ta bort: ' + (err.message || 'Okänt fel'), 'error');
        }
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
        // Visa modal för att lägga till anteckning
        this.showAddNoteModal();
    }

    showAddNoteModal() {
        // Hämta kunddata för att få Byrå ID och Orgnr
        const byraId = this.customerData?.fields?.['Byrå ID'] || this.customerData?.fields?.['ByråID'] || '';
        const orgnr = this.customerData?.fields?.['Orgnr'] || this.customerData?.fields?.['Organisationsnummer'] || '';
        const companyName = this.customerData?.fields?.['Namn'] || this.customerData?.fields?.['Företagsnamn'] || '';
        
        const modalHTML = `
            <div id="add-note-modal" class="modal-overlay">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3><i class="fas fa-plus-circle"></i> Lägg till anteckning</h3>
                        <button class="modal-close" onclick="customerCardManager.closeAddNoteModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="add-note-form">
                            <div class="form-group">
                                <label for="note-type">Typ av anteckning *</label>
                                <select id="note-type" name="typAvAnteckning" required>
                                    <option value="">Välj typ...</option>
                                    <option value="Nykundsmöte">Nykundsmöte</option>
                                    <option value="Övrig anteckning">Övrig anteckning</option>
                                    <option value="Bokslutsgenomgång">Bokslutsgenomgång</option>
                                    <option value="Arbetsanteckningar">Arbetsanteckningar</option>
                                    <option value="Emailkonversation">Emailkonversation</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="note-date">Datum *</label>
                                <input type="date" id="note-date" name="datum" required value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            
                            <div class="form-group">
                                <label for="note-company">Företagsnamn</label>
                                <input type="text" id="note-company" name="foretagsnamn" value="${companyName}" readonly>
                            </div>
                            
                            <div class="form-group">
                                <label for="note-person">Person</label>
                                <input type="text" id="note-person" name="person" placeholder="Namn på person">
                            </div>
                            
                            <div class="form-group">
                                <label for="note-content">Anteckning *</label>
                                <textarea id="note-content" name="notes" rows="10" placeholder="Skriv din anteckning här..." required></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label><i class="fas fa-tasks"></i> Att göra-lista</label>
                                <div id="todo-items" class="todo-items-container">
                                    ${this.createTodoInputFields(3)}
                                </div>
                                <button type="button" class="btn btn-secondary btn-sm" onclick="customerCardManager.addTodoItem()">
                                    <i class="fas fa-plus"></i> Lägg till fler uppgifter
                                </button>
                            </div>
                            
                            <input type="hidden" name="byraId" value="${byraId}">
                            <input type="hidden" name="orgnr" value="${orgnr}">
                            
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" onclick="customerCardManager.closeAddNoteModal()">
                                    Avbryt
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-save"></i> Spara anteckning
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        
        // Ta bort befintlig modal om den finns
        const existingModal = document.getElementById('add-note-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Lägg till modal till body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Lägg till event listener för formulär
        document.getElementById('add-note-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNote(e.target);
        });
    }

    createTodoInputFields(count = 3) {
        let html = '';
        for (let i = 1; i <= count; i++) {
            html += `
                <div class="todo-input-item" data-index="${i}">
                    <div class="todo-item-header">
                        <span class="todo-item-number">Uppgift ${i}</span>
                        ${i > 1 ? `<button type="button" class="btn btn-sm btn-danger btn-remove-todo" onclick="customerCardManager.removeTodoItem(${i})" title="Ta bort uppgift">
                            <i class="fas fa-times"></i>
                        </button>` : ''}
                    </div>
                    <div class="todo-input-row">
                        <div class="todo-text-field">
                            <textarea name="todo${i}" placeholder="Beskriv vad som ska göras..." class="todo-input-textarea" rows="2"></textarea>
                        </div>
                        <div class="todo-status-field">
                            <select name="status${i}" class="todo-status-select">
                                <option value="">Välj status...</option>
                                <option value="Att göra">Att göra</option>
                                <option value="Pågående">Pågående</option>
                                <option value="Akut">Akut</option>
                                <option value="Klart">Klart</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
        }
        return html;
    }

    addTodoItem() {
        const todoItems = document.getElementById('todo-items');
        const currentCount = todoItems.children.length;
        const newIndex = currentCount + 1;
        
        if (newIndex > 8) {
            alert('Max 8 uppgifter tillåtna');
            return;
        }
        
        const newItem = document.createElement('div');
        newItem.className = 'todo-input-item';
        newItem.setAttribute('data-index', newIndex);
        newItem.innerHTML = `
            <div class="todo-item-header">
                <span class="todo-item-number">Uppgift ${newIndex}</span>
                <button type="button" class="btn btn-sm btn-danger btn-remove-todo" onclick="customerCardManager.removeTodoItem(${newIndex})" title="Ta bort uppgift">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="todo-input-row">
                <div class="todo-text-field">
                    <textarea name="todo${newIndex}" placeholder="Beskriv vad som ska göras..." class="todo-input-textarea" rows="2"></textarea>
                </div>
                <div class="todo-status-field">
                    <select name="status${newIndex}" class="todo-status-select">
                        <option value="">Välj status...</option>
                        <option value="Att göra">Att göra</option>
                        <option value="Pågående">Pågående</option>
                        <option value="Akut">Akut</option>
                        <option value="Klart">Klart</option>
                    </select>
                </div>
            </div>
        `;
        todoItems.appendChild(newItem);
    }

    removeTodoItem(index) {
        const item = document.querySelector(`.todo-input-item[data-index="${index}"]`);
        if (item) {
            item.remove();
        }
    }

    closeAddNoteModal() {
        const modal = document.getElementById('add-note-modal');
        if (modal) {
            modal.remove();
        }
    }

    async saveNote(form) {
        try {
            const formData = new FormData(form);
            const noteData = {
                typAvAnteckning: [formData.get('typAvAnteckning')],
                datum: formData.get('datum'),
                foretagsnamn: formData.get('foretagsnamn') || '',
                person: formData.get('person') || '',
                notes: formData.get('notes'),
                byraId: formData.get('byraId'),
                orgnr: formData.get('orgnr')
            };
            
            // Lägg till ToDo-uppgifter
            for (let i = 1; i <= 8; i++) {
                const todo = formData.get(`todo${i}`);
                const status = formData.get(`status${i}`);
                if (todo && todo.trim() !== '') {
                    noteData[`ToDo${i}`] = todo.trim();
                    if (status) {
                        noteData[`Status${i}`] = status;
                    }
                }
            }
            
            console.log('📤 Sending note data:', noteData);
            
            if (!isLoggedInKundkort()) {
                alert('Du måste vara inloggad för att spara anteckningar');
                return;
            }
            
            const response = await fetch(`${window.apiConfig.baseUrl}/api/notes`, {
                method: 'POST',
                ...getAuthOptsKundkort(),
                body: JSON.stringify(noteData)
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Anteckning sparad:', data);
                this.closeAddNoteModal();
                // Ladda om anteckningar
                this.loadNotes();
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ Error response:', errorData);
                
                // Visa mer detaljerad information om datakälla-felet
                let errorMessage = errorData.message || errorData.error || response.statusText;
                if (errorData.airtableError) {
                    console.error('❌ Datakälla Error Details:', errorData.airtableError);
                    if (errorData.airtableError.error) {
                        errorMessage += `\n\nDatakälla: ${errorData.airtableError.error.message || JSON.stringify(errorData.airtableError.error)}`;
                    }
                }
                
                alert(`Kunde inte spara anteckning: ${errorMessage}`);
            }
        } catch (error) {
            console.error('❌ Error saving note:', error);
            
            // Bättre felhantering med diagnostik
            let errorMessage = error.message;
            
            // Kontrollera om det är ett nätverksfel
            if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
                const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
                errorMessage = `❌ Kan inte ansluta till servern!\n\nServern körs inte på ${baseUrl}\n\n🔧 Lösning:\n1. Öppna en NY terminal i VS Code\n2. Kör: npm run dev\n3. Vänta tills du ser: "🚀 API Proxy Service running on port 3001"\n4. Försök spara anteckningen igen`;
                
                console.error('🔍 API Config:', window.apiConfig);
                console.error('🔍 Base URL:', baseUrl);
                console.error('🔍 Full URL skulle vara:', `${baseUrl}/api/notes`);
            }
            
            alert(errorMessage);
        }
    }

    editNote(noteId) {
        const note = (this._notes || []).find(n => n.id === noteId);
        if (!note) return;
        this.showEditNoteModal(note);
    }

    showEditNoteModal(note) {
        const fields = note.fields || {};
        const byraId = this.customerData?.fields?.['Byrå ID'] || '';
        const orgnr = this.customerData?.fields?.['Orgnr'] || '';
        const companyName = this.customerData?.fields?.['Namn'] || '';

        const typOptions = ['Nykundsmöte', 'Övrig anteckning', 'Bokslutsgenomgång', 'Arbetsanteckningar', 'Emailkonversation'];
        const currentTyp = Array.isArray(fields['Typ av anteckning']) ? fields['Typ av anteckning'][0] : '';
        const typOptionsHTML = typOptions.map(t =>
            `<option value="${t}" ${currentTyp === t ? 'selected' : ''}>${t}</option>`
        ).join('');

        // Bygg todo-fält förifyllda
        let todoHTML = '';
        for (let i = 1; i <= 8; i++) {
            const todo = fields[`ToDo${i}`] || '';
            const status = fields[`Status${i}`] || '';
            if (i <= 3 || todo) {
                todoHTML += `
                <div class="todo-input-item" data-index="${i}">
                    <div class="todo-item-header">
                        <span class="todo-item-number">Uppgift ${i}</span>
                        ${i > 1 ? `<button type="button" class="btn btn-sm btn-danger btn-remove-todo" onclick="customerCardManager.removeTodoItem(${i})" title="Ta bort uppgift"><i class="fas fa-times"></i></button>` : ''}
                    </div>
                    <div class="todo-input-row">
                        <div class="todo-text-field">
                            <textarea name="todo${i}" class="todo-input-textarea" rows="2">${todo}</textarea>
                        </div>
                        <div class="todo-status-field">
                            <select name="status${i}" class="todo-status-select">
                                <option value="">Välj status...</option>
                                <option value="Att göra" ${status === 'Att göra' ? 'selected' : ''}>Att göra</option>
                                <option value="Pågående" ${status === 'Pågående' ? 'selected' : ''}>Pågående</option>
                                <option value="Akut" ${status === 'Akut' ? 'selected' : ''}>Akut</option>
                                <option value="Klart" ${status === 'Klart' ? 'selected' : ''}>Klart</option>
                            </select>
                        </div>
                    </div>
                </div>`;
            }
        }

        const modalHTML = `
            <div id="add-note-modal" class="modal-overlay">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3><i class="fas fa-edit"></i> Redigera anteckning</h3>
                        <button class="modal-close" onclick="customerCardManager.closeAddNoteModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="add-note-form">
                            <div class="form-group">
                                <label>Typ av anteckning *</label>
                                <select name="typAvAnteckning" required>
                                    <option value="">Välj typ...</option>
                                    ${typOptionsHTML}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Datum *</label>
                                <input type="date" name="datum" required value="${fields['Datum'] || ''}">
                            </div>
                            <div class="form-group">
                                <label>Företagsnamn</label>
                                <input type="text" name="foretagsnamn" value="${fields['Företagsnamn'] || companyName}" readonly>
                            </div>
                            <div class="form-group">
                                <label>Person</label>
                                <input type="text" name="person" value="${fields['Person'] || ''}" placeholder="Namn på person">
                            </div>
                            <div class="form-group">
                                <label>Anteckning *</label>
                                <textarea name="notes" rows="10" required>${fields['Notes'] || ''}</textarea>
                            </div>
                            <div class="form-group">
                                <label><i class="fas fa-tasks"></i> Att göra-lista</label>
                                <div id="todo-items" class="todo-items-container">${todoHTML}</div>
                                <button type="button" class="btn btn-secondary btn-sm" onclick="customerCardManager.addTodoItem()">
                                    <i class="fas fa-plus"></i> Lägg till fler uppgifter
                                </button>
                            </div>
                            <input type="hidden" name="byraId" value="${byraId}">
                            <input type="hidden" name="orgnr" value="${orgnr}">
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" onclick="customerCardManager.closeAddNoteModal()">Avbryt</button>
                                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Spara ändringar</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>`;

        const existing = document.getElementById('add-note-modal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('add-note-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateNote(note.id, e.target);
        });
    }

    async updateNote(noteId, form) {
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const formData = new FormData(form);

        const fields = {
            typAvAnteckning: [formData.get('typAvAnteckning')],
            datum: formData.get('datum'),
            foretagsnamn: formData.get('foretagsnamn') || '',
            person: formData.get('person') || '',
            notes: formData.get('notes'),
            byraId: formData.get('byraId'),
            orgnr: formData.get('orgnr')
        };
        for (let i = 1; i <= 8; i++) {
            const todo = formData.get(`todo${i}`);
            const status = formData.get(`status${i}`);
            fields[`ToDo${i}`] = todo?.trim() || '';
            fields[`Status${i}`] = status || '';
        }

        try {
            const response = await fetch(`${baseUrl}/api/notes/${noteId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }
            this.closeAddNoteModal();
            this.showNotification('Anteckning uppdaterad!', 'success');
            this.loadNotes();
        } catch (error) {
            console.error('❌ Fel vid uppdatering av anteckning:', error);
            this.showNotification(`Kunde inte uppdatera: ${error.message}`, 'error');
        }
    }

    async updateTaskStatus(noteId, index, status) {
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        try {
            const fields = { [`Status${index}`]: status || '' };
            const response = await fetch(`${baseUrl}/api/notes/${noteId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }
            this.showNotification('Status uppdaterad', 'success');
            this.loadNotes();
        } catch (error) {
            console.error('❌ Fel vid uppdatering av task:', error);
            this.showNotification(`Kunde inte uppdatera: ${error.message}`, 'error');
        }
    }

    async deleteNote(noteId) {
        if (!confirm('Är du säker på att du vill ta bort denna anteckning?')) return;
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        try {
            const response = await fetch(`${baseUrl}/api/notes/${noteId}`, {
                method: 'DELETE',
                ...getAuthOptsKundkort()
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }
            this.showNotification('Anteckning borttagen.', 'success');
            this.loadNotes();
        } catch (error) {
            console.error('❌ Fel vid borttagning:', error);
            this.showNotification(`Kunde inte ta bort: ${error.message}`, 'error');
        }
    }

    async pepScreening(idx) {
        const p = (this._kontaktPersoner || [])[idx];
        if (!p || !p.namn) {
            this.showNotification('Personen saknar namn — kan inte screena.', 'error');
            return;
        }

        const btn = document.getElementById(`pep-btn-${idx}`);
        const origHtml = btn?.innerHTML;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.style.pointerEvents = 'none';
        }
        if (typeof window.showAiThinking === 'function') window.showAiThinking();

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

            // Konvertera personnr (YYYYMMDD-XXXX) till dob (DD/MM/YYYY) om möjligt
            let dob = null;
            if (p.personnr) {
                const digits = p.personnr.replace(/\D/g, '');
                if (digits.length >= 8) {
                    const year = digits.substring(0, 4);
                    const month = digits.substring(4, 6);
                    const day = digits.substring(6, 8);
                    dob = `${day}/${month}/${year}`;
                }
            }

            const response = await fetch(`${baseUrl}/api/pep-screening/${this.customerId}`, {
                method: 'POST',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ namn: p.namn, personnr: p.personnr, dob })
            });

            const data = await response.json();

            if (!response.ok) {
                const msg = response.status === 429
                    ? 'För många sökningar – vänta några minuter och försök igen.'
                    : (data.error || `HTTP ${response.status}`);
                throw new Error(msg);
            }

            // Visa resultat i modal (PDF sparas i Airtable / Dokumentation, laddas inte ner automatiskt)
            this._showPepResultModal(p.namn, data);

            // Uppdatera dokumentation-fliken om rapporten sparades i Airtable
            if (data.savedToDocs) {
                this.loadDocuments();
                this.showNotification('PEP-rapport sparad på fliken Dokumentation.', 'success');
            }

            // Spara senaste PEP-sökningens datum på personen
            if (this._kontaktPersoner && this._kontaktPersoner[idx]) {
                this._kontaktPersoner[idx].pepSoktDatum = new Date().toISOString().split('T')[0];
                await this._saveKontaktPersoner();
                this._refreshRollerList();
            }

        } catch (error) {
            console.error('❌ PEP-screening fel:', error);
            this.showNotification(`Screening misslyckades: ${error.message}`, 'error');
        } finally {
            if (typeof window.hideAiThinking === 'function') window.hideAiThinking();
            if (btn) { btn.innerHTML = origHtml; btn.style.pointerEvents = ''; }
        }
    }

    _showPepResultModal(namn, data) {
        const hits = data.total_hits || 0;
        const records = data.found_records || [];

        const statusColor = hits === 0 ? '#16a34a' : '#dc2626';
        const statusIcon  = hits === 0 ? 'fa-check-circle' : 'fa-exclamation-triangle';
        const statusText  = hits === 0 ? 'Inga träffar — personen finns ej på PEP- eller sanktionslistor' : `${hits} träff(ar) hittades`;

        const recordsHtml = records.slice(0, 5).map(r => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;margin-bottom:0.5rem;">
                <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;">
                    <span style="font-weight:600;">${this._esc(r.name || '')}</span>
                    <span style="font-size:0.72rem;padding:0.15rem 0.5rem;border-radius:20px;font-weight:700;
                        background:${r.source_type === 'SANCTION' ? '#fee2e2' : r.source_type === 'PEP' ? '#fef3c7' : '#f1f5f9'};
                        color:${r.source_type === 'SANCTION' ? '#991b1b' : r.source_type === 'PEP' ? '#92400e' : '#475569'};">
                        ${r.source_type || ''}
                    </span>
                </div>
                ${r.positions?.length ? `<div style="font-size:0.78rem;color:#64748b;">${r.positions[0]}</div>` : ''}
                ${r.description?.length ? `<div style="font-size:0.78rem;color:#64748b;">${r.description[0]}</div>` : ''}
            </div>`).join('');

        const modalHtml = `
            <div id="pep-result-modal" style="
                position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;
                display:flex;align-items:center;justify-content:center;padding:1rem;">
                <div style="background:#fff;border-radius:12px;max-width:560px;width:100%;
                    max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                    <div style="padding:1.5rem;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.05em;">PEP & Sanktionsscreening</div>
                            <div style="font-size:1.1rem;font-weight:700;color:#1e293b;margin-top:0.2rem;">${this._esc(namn)}</div>
                        </div>
                        <button onclick="document.getElementById('pep-result-modal').remove()"
                            style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1.2rem;padding:0.25rem;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div style="padding:1.5rem;">
                        <div style="display:flex;align-items:center;gap:0.75rem;padding:1rem;border-radius:8px;margin-bottom:1.25rem;
                            background:${hits === 0 ? '#f0fdf4' : '#fef2f2'};border:1px solid ${hits === 0 ? '#bbf7d0' : '#fecaca'};">
                            <i class="fas ${statusIcon}" style="color:${statusColor};font-size:1.3rem;"></i>
                            <span style="font-weight:600;color:${statusColor};">${statusText}</span>
                        </div>
                        ${hits > 0 ? `<div style="margin-bottom:1rem;">${recordsHtml}</div>` : ''}
                        <div style="font-size:0.78rem;color:#94a3b8;margin-bottom:1rem;">
                            Sökning utförd: ${new Date().toLocaleString('sv-SE')}
                        </div>
                        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                            ${data.pdf_base64 ? `
                            <button onclick="customerCardManager._downloadBase64Pdf('${data.pdf_base64}', '${data.filnamn}')"
                                style="background:#007fa3;color:#fff;border:none;border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;">
                                <i class="fas fa-download"></i> Ladda ner PDF-rapport
                            </button>` : ''}
                            <button onclick="document.getElementById('pep-result-modal').remove()"
                                style="background:#f1f5f9;color:#475569;border:none;border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;">
                                Stäng
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

        const existing = document.getElementById('pep-result-modal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    _downloadBase64Pdf(base64, filnamn) {
        const byteChars = atob(base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filnamn || 'pep-screening.pdf';
        a.click();
        URL.revokeObjectURL(url);
    }

    async dokumenteraRiskbedomning() {
        const btn = document.getElementById('btn-dokumentera-riskbedomning');
        if (!btn || !this.customerId) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Genererar PDF...';
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/kunddata/${this.customerId}/riskbedomning-pdf`, {
                method: 'POST',
                ...getAuthOptsKundkort()
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || `HTTP ${res.status}`);
            }
            const data = await res.json();
            this.showNotification(data.message || 'Riskbedömning dokumenterad.', 'success');
            if (data.reloadedDocuments) this.loadDocuments();
            // Erbjud nedladdning om PDF genererades men inte sparades till Dokumentation (t.ex. vid localhost)
            if (data.fileUrl && !data.reloadedDocuments && data.filnamn) {
                const a = document.createElement('a');
                a.href = data.fileUrl;
                a.download = data.filnamn;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        } catch (err) {
            console.error('❌ Dokumentera riskbedömning:', err);
            this.showNotification('Kunde inte dokumentera: ' + (err.message || 'Okänt fel'), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-file-pdf"></i> Dokumentera riskbedömning';
        }
    }

    uploadDocument() {
        alert('Funktionalitet för att ladda upp dokument kommer snart!');
    }

    showError(message, options) {
        // Create and show error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
        `;
        if (options && options.link) {
            const link = document.createElement('a');
            link.href = options.link.href;
            link.textContent = options.link.text;
            link.className = 'error-message-link';
            link.style.marginLeft = '0.5rem';
            link.style.fontWeight = '600';
            errorDiv.appendChild(document.createTextNode(' '));
            errorDiv.appendChild(link);
        }
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
