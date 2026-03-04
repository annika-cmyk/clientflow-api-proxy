/**
 * KYC (Know Your Customer) Management
 * Handles the KYC form functionality and data management
 */

class KYCManager {
    constructor() {
        this.companyData = null;
        this.kycData = {
            companyInfo: {},
            roles: [],
            services: {},
            riskAssessment: {}
        };
        this.editingRoleIndex = -1;
        
        this.init();
    }

    init() {
        console.log('🚀 Initializing KYC Manager...');
        
        // Check if user is authenticated
        if (!this.checkAuthentication()) {
            console.log('❌ User not authenticated, redirecting to login');
            window.location.href = 'login.html';
            return;
        }

        // Load company data from URL parameters
        this.loadCompanyData();
        
        // Bind events
        this.bindEvents();
        
        // Populate company information
        this.populateCompanyInfo();
        
        // Initialize roles table
        this.renderRolesTable();
        
        console.log('✅ KYC Manager initialized successfully');
    }

    checkAuthentication() {
        const user = (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) || (window.__clientFlowUser);
        if (!user) return false;
        console.log('👤 Authenticated user:', user.name, 'Role:', user.role);
        return true;
    }

    loadCompanyData() {
        console.log('🔍 Loading company data for KYC...');
        
        // Try to get company data from URL parameters first
        const urlParams = new URLSearchParams(window.location.search);
        const companyDataParam = urlParams.get('companyData');
        console.log('🔍 URL params:', urlParams.toString());
        console.log('🔍 Company data param from URL:', companyDataParam);
        
        if (companyDataParam) {
            try {
                this.companyData = JSON.parse(decodeURIComponent(companyDataParam));
                console.log('📊 Company data loaded from URL:', this.companyData);
            } catch (error) {
                console.error('❌ Error parsing company data from URL:', error);
            }
        }
        
        // Företagsdata kommer endast från URL-parametrar (ingen localStorage).
        
        // If still no data, show error
        if (!this.companyData) {
            console.warn('⚠️ No company data found');
            this.showMessage('Ingen företagsdata hittades. Vänligen gå tillbaka till företagssökningen.', 'warning');
        } else {
            console.log('✅ Company data loaded successfully:', {
                namn: this.companyData.namn,
                organisationsnummer: this.companyData.organisationsnummer,
                allFields: Object.keys(this.companyData)
            });
        }
    }

    forceShowTabs() {
        console.log('🔧 Force showing tabs with JavaScript...');
        
        const kycTabsContainer = document.querySelector('.kyc-tabs');
        const tabButtons = document.querySelectorAll('.kyc-tabs .tab-button');
        
        if (kycTabsContainer) {
            // Force show the container with CSS classes
            kycTabsContainer.style.display = 'flex';
            kycTabsContainer.style.visibility = 'visible';
            kycTabsContainer.style.opacity = '1';
            kycTabsContainer.style.position = 'relative';
            kycTabsContainer.style.zIndex = '10';
            kycTabsContainer.style.background = '#f8fafc';
            kycTabsContainer.style.borderBottom = '2px solid #667eea';
            kycTabsContainer.style.minHeight = '60px';
            kycTabsContainer.style.width = '100%';
            kycTabsContainer.style.margin = '20px 0';
            kycTabsContainer.style.padding = '0';
            console.log('✅ KYC tabs container forced to show');
        }
        
        tabButtons.forEach((button, index) => {
            // Force show each button with proper styling
            button.style.display = 'flex';
            button.style.visibility = 'visible';
            button.style.opacity = '1';
            button.style.position = 'relative';
            button.style.zIndex = '11';
            button.style.background = '#ffffff';
            button.style.border = '1px solid #e1e5e9';
            button.style.borderBottom = '2px solid transparent';
            button.style.color = '#1e293b';
            button.style.fontSize = '0.9rem';
            button.style.fontWeight = '500';
            button.style.padding = '1rem 1.5rem';
            button.style.margin = '0 2px 0 0';
            button.style.minHeight = '50px';
            button.style.width = 'auto';
            button.style.alignItems = 'center';
            button.style.gap = '0.5rem';
            button.style.cursor = 'pointer';
            button.style.transition = 'all 0.2s ease';
            button.style.whiteSpace = 'nowrap';
            button.style.flexShrink = '0';
            console.log(`✅ Tab button ${index} forced to show:`, button.textContent.trim());
        });
        
        console.log('✅ All tabs forced to show with JavaScript');
    }

    forceShowTabContent() {
        console.log('🔧 Setting up tab content visibility...');
        
        const tabContent = document.querySelector('.tab-content');
        const tabPanes = document.querySelectorAll('.kyc-card .tab-pane');
        
        if (tabContent) {
            tabContent.style.display = 'block';
            tabContent.style.visibility = 'visible';
            tabContent.style.opacity = '1';
            tabContent.style.position = 'relative';
            tabContent.style.background = '#ffffff';
            tabContent.style.minHeight = '400px';
            console.log('✅ Tab content container set up');
        }
        
        tabPanes.forEach((pane, index) => {
            console.log(`🔍 Setting up tab pane ${index}:`, pane.id);
            
            // Set up all panes with proper styling
            pane.style.background = '#ffffff';
            pane.style.padding = '2rem';
            pane.style.minHeight = '400px';
            pane.style.position = 'relative';
            
            // Only show the active pane
            if (pane.classList.contains('active')) {
                pane.style.display = 'block';
                pane.style.visibility = 'visible';
                pane.style.opacity = '1';
                console.log(`✅ Active tab pane ${index} shown:`, pane.id);
            } else {
                pane.style.display = 'none';
                pane.style.visibility = 'hidden';
                pane.style.opacity = '0';
                console.log(`✅ Inactive tab pane ${index} hidden:`, pane.id);
            }
        });
        
        console.log('✅ Tab content visibility set up correctly');
    }

    ensureContentVisibility() {
        console.log('🔧 Final check - ensuring content visibility...');
        
        const activeTabPane = document.querySelector('.tab-pane.active');
        if (activeTabPane) {
            // Ensure active tab is visible
            activeTabPane.style.display = 'block';
            activeTabPane.style.visibility = 'visible';
            activeTabPane.style.opacity = '1';
            activeTabPane.style.position = 'relative';
            
            // Ensure all content elements are visible
            const contentElements = activeTabPane.querySelectorAll('*');
            contentElements.forEach(element => {
                element.style.visibility = 'visible';
                element.style.opacity = '1';
            });
            
            console.log('✅ Active tab content visibility ensured');
            console.log('🔍 Active tab content preview:', activeTabPane.textContent.substring(0, 100) + '...');
            
            // Ensure inactive tabs are hidden
            const inactivePanes = document.querySelectorAll('.kyc-card .tab-pane:not(.active)');
            inactivePanes.forEach(pane => {
                pane.style.display = 'none';
                pane.style.visibility = 'hidden';
                pane.style.opacity = '0';
            });
            
            console.log('✅ Inactive tabs properly hidden');
        } else {
            console.warn('⚠️ No active tab pane found for visibility check');
        }
        
        console.log('✅ Content visibility check completed');
    }

    testTabSwitching() {
        console.log('🧪 Testing tab switching functionality...');
        
        const tabButtons = document.querySelectorAll('.kyc-tabs .tab-button');
        const tabPanes = document.querySelectorAll('.kyc-card .tab-pane');
        
        console.log(`🔍 Found ${tabButtons.length} tab buttons and ${tabPanes.length} tab panes`);
        
        // Check if all tabs have proper data-tab attributes
        tabButtons.forEach((button, index) => {
            const dataTab = button.getAttribute('data-tab');
            const correspondingPane = document.getElementById(dataTab);
            
            console.log(`🔍 Tab ${index}:`, {
                buttonText: button.textContent.trim(),
                dataTab: dataTab,
                hasCorrespondingPane: !!correspondingPane,
                paneId: correspondingPane?.id
            });
        });
        
        // Verify that only one tab is active
        const activeButtons = document.querySelectorAll('.kyc-tabs .tab-button.active');
        const activePanes = document.querySelectorAll('.kyc-card .tab-pane.active');
        
        console.log(`🔍 Active elements: ${activeButtons.length} buttons, ${activePanes.length} panes`);
        
        if (activeButtons.length === 1 && activePanes.length === 1) {
            console.log('✅ Tab switching setup is correct');
        } else {
            console.warn('⚠️ Tab switching setup issue detected');
        }
        
        console.log('✅ Tab switching test completed');
    }

    initTabs() {
        console.log('🔗 Initializing tab functionality...');
        
        const tabButtons = document.querySelectorAll('.kyc-tabs .tab-button');
        const tabPanes = document.querySelectorAll('.kyc-card .tab-pane');
        
        console.log('🔍 Found tab buttons:', tabButtons.length);
        console.log('🔍 Found tab panes:', tabPanes.length);
        
        if (tabButtons.length === 0) {
            console.error('❌ No tab buttons found!');
            return;
        }
        
        if (tabPanes.length === 0) {
            console.error('❌ No tab panes found!');
            return;
        }
        
        // Ensure first tab is active
        tabPanes.forEach((pane, index) => {
            console.log(`🔍 Setting up tab pane ${index}:`, pane.id);
            if (index === 0) {
                pane.classList.add('active');
                pane.style.display = 'block';
                pane.style.visibility = 'visible';
                pane.style.opacity = '1';
                console.log('✅ First tab pane activated:', pane.id);
            } else {
                pane.classList.remove('active');
                pane.style.display = 'none';
                pane.style.visibility = 'hidden';
                pane.style.opacity = '0';
                console.log('✅ Tab pane deactivated:', pane.id);
            }
        });
        
        tabButtons.forEach((button, index) => {
            console.log(`🔍 Setting up tab button ${index}:`, button.textContent.trim());
            if (index === 0) {
                button.classList.add('active');
                button.style.borderBottomColor = '#667eea';
                button.style.color = '#667eea';
                console.log('✅ First tab button activated:', button.textContent.trim());
            } else {
                button.classList.remove('active');
                button.style.borderBottomColor = 'transparent';
                button.style.color = '#1e293b';
                console.log('✅ Tab button deactivated:', button.textContent.trim());
            }
            
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                console.log('🖱️ Tab clicked:', targetTab);
                this.switchTab(targetTab);
            });
        });
        
        console.log('✅ Tab functionality initialized successfully');
    }

    switchTab(targetTab) {
        console.log('🔄 Switching to tab:', targetTab);
        
        // Remove active class from all buttons and panes
        document.querySelectorAll('.kyc-tabs .tab-button').forEach(btn => {
            btn.classList.remove('active');
            btn.style.borderBottomColor = 'transparent';
            btn.style.color = '#1e293b';
        });
        
        document.querySelectorAll('.kyc-card .tab-pane').forEach(pane => {
            pane.classList.remove('active');
            pane.style.display = 'none';
            pane.style.visibility = 'hidden';
            pane.style.opacity = '0';
            console.log(`🔍 Hidden tab pane:`, pane.id);
        });
        
        // Add active class to clicked button and corresponding pane
        const activeButton = document.querySelector(`.kyc-tabs [data-tab="${targetTab}"]`);
        const activePane = document.getElementById(targetTab);
        
        if (activeButton && activePane) {
            // Activate button
            activeButton.classList.add('active');
            activeButton.style.borderBottomColor = '#667eea';
            activeButton.style.color = '#667eea';
            
            // Activate pane
            activePane.classList.add('active');
            activePane.style.display = 'block';
            activePane.style.visibility = 'visible';
            activePane.style.opacity = '1';
            
            console.log('✅ Switched to tab:', targetTab);
            console.log('🔍 Active pane content preview:', activePane.textContent.substring(0, 100) + '...');
        } else {
            console.error('❌ Tab not found:', targetTab, 'Button:', activeButton, 'Pane:', activePane);
        }
    }

    bindEvents() {
        console.log('🔗 Binding events...');
        
        // Save KYC data button
        const saveBtn = document.getElementById('save-kyc-data');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveKYCData());
        }
        
        // Export button
        const exportBtn = document.getElementById('export-kyc');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportKYCData());
        }
        
        // Role management events
        this.bindRoleEvents();
        
        // Auto-save form data as user types
        this.setupAutoSave();
        
        console.log('✅ Events bound successfully');
    }

    // Role Management Methods
    openRoleModal(roleIndex = -1) {
        console.log('📝 Opening role modal, editing index:', roleIndex);
        this.editingRoleIndex = roleIndex;
        
        const modal = document.getElementById('role-modal');
        const title = document.getElementById('role-modal-title');
        const form = document.getElementById('role-form');
        
        if (roleIndex >= 0 && this.kycData.roles[roleIndex]) {
            // Editing existing role
            const role = this.kycData.roles[roleIndex];
            title.textContent = 'Redigera befattningshavare';
            form.elements['name'].value = role.name || '';
            form.elements['role'].value = role.role || '';
            form.elements['personnr'].value = role.personnr || '';
        } else {
            // Adding new role
            title.textContent = 'Lägg till befattningshavare';
            form.reset();
        }
        
        modal.classList.add('show');
    }

    closeRoleModal() {
        console.log('❌ Closing role modal');
        const modal = document.getElementById('role-modal');
        modal.classList.remove('show');
        this.editingRoleIndex = -1;
    }

    handleRoleSubmit(e) {
        e.preventDefault();
        console.log('💾 Handling role form submission');
        
        const formData = new FormData(e.target);
        const roleData = {
            name: formData.get('name'),
            role: formData.get('role'),
            personnr: formData.get('personnr')
        };
        
        console.log('📊 Role data:', roleData);
        
        if (this.editingRoleIndex >= 0) {
            // Update existing role
            this.kycData.roles[this.editingRoleIndex] = roleData;
            console.log('✏️ Updated role at index:', this.editingRoleIndex);
        } else {
            // Add new role
            this.kycData.roles.push(roleData);
            console.log('➕ Added new role, total roles:', this.kycData.roles.length);
        }
        
        this.renderRolesTable();
        this.closeRoleModal();
        this.showMessage('Befattningshavare sparad!', 'success');
        
        // Sync with Airtable
        this.syncRolesToAirtable();
    }

    deleteRole(index) {
        console.log('🗑️ Deleting role at index:', index);
        if (confirm('Är du säker på att du vill ta bort denna befattningshavare?')) {
            this.kycData.roles.splice(index, 1);
            this.renderRolesTable();
            this.showMessage('Befattningshavare borttagen!', 'success');
        }
    }

    renderRolesTable() {
        console.log('📋 Rendering roles table with', this.kycData.roles.length, 'roles');
        const tbody = document.getElementById('roles-tbody');
        
        if (!tbody) {
            console.error('❌ Roles table body not found');
            return;
        }
        
        if (this.kycData.roles.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: #666; padding: 2rem;">
                        Inga befattningshavare tillagda än
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = this.kycData.roles.map((role, index) => `
            <tr>
                <td>${role.name || '-'}</td>
                <td>${role.role || '-'}</td>
                <td>${role.personnr || '-'}</td>
                <td>
                    <div class="role-actions">
                        <button class="btn btn-sm btn-secondary" onclick="kycManager.openRoleModal(${index})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="kycManager.deleteRole(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    async syncRolesToAirtable() {
        console.log('🔄 Syncing roles to Airtable...');
        
        try {
            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
                console.error('❌ Not logged in');
                return;
            }
            const companyId = this.companyData?.organisationsnummer;
            if (!companyId) {
                console.error('❌ No company ID found');
                return;
            }
            const rolesData = this.kycData.roles.map(role => ({
                fields: {
                    'Företag': companyId,
                    'Namn': role.name,
                    'Roll': role.role,
                    'Personnummer': role.personnr
                }
            }));
            console.log('📊 Roles data to sync:', rolesData);
            const baseUrl = window.apiConfig?.baseUrl || '';
            const response = await fetch((baseUrl || '') + '/api/airtable/befattningshavare', {
                method: 'POST',
                ...opts,
                body: JSON.stringify({ records: rolesData })
            });

            if (response.ok) {
                console.log('✅ Roles synced to Airtable successfully');
                this.showMessage('Befattningshavare synkroniserade med Airtable!', 'success');
            } else {
                console.error('❌ Failed to sync roles to Airtable:', response.statusText);
                this.showMessage('Kunde inte synkronisera med Airtable', 'warning');
            }
        } catch (error) {
            console.error('❌ Error syncing roles to Airtable:', error);
            this.showMessage('Fel vid synkronisering med Airtable', 'error');
        }
    }

    async loadRolesFromAirtable() {
        console.log('📥 Loading roles from Airtable...');
        
        try {
            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
                console.error('❌ Not logged in');
                return;
            }
            const companyId = this.companyData?.organisationsnummer;
            if (!companyId) {
                console.error('❌ No company ID found');
                return;
            }
            const baseUrl = window.apiConfig?.baseUrl || '';
            const response = await fetch((baseUrl || '') + '/api/airtable/befattningshavare?company=' + encodeURIComponent(companyId), opts);

            if (response.ok) {
                const data = await response.json();
                console.log('📊 Roles loaded from Airtable:', data);
                
                if (data.records && data.records.length > 0) {
                    this.kycData.roles = data.records.map(record => ({
                        name: record.fields.Namn || '',
                        role: record.fields.Roll || '',
                        personnr: record.fields.Personnummer || ''
                    }));
                    
                    this.renderRolesTable();
                    this.showMessage('Befattningshavare laddade från Airtable!', 'success');
                }
            } else {
                console.error('❌ Failed to load roles from Airtable:', response.statusText);
            }
        } catch (error) {
            console.error('❌ Error loading roles from Airtable:', error);
        }
    }

    bindRoleEvents() {
        // Add role button
        const addRoleBtn = document.getElementById('add-role-btn');
        if (addRoleBtn) {
            addRoleBtn.addEventListener('click', () => this.openRoleModal());
        }
        
        // Load roles from Airtable button
        const loadRolesBtn = document.getElementById('load-roles-btn');
        if (loadRolesBtn) {
            loadRolesBtn.addEventListener('click', () => this.loadRolesFromAirtable());
        }
        
        // Role form submission
        const roleForm = document.getElementById('role-form');
        if (roleForm) {
            roleForm.addEventListener('submit', (e) => this.handleRoleSubmit(e));
        }
        
        // Modal close events
        const roleModal = document.getElementById('role-modal');
        if (roleModal) {
            roleModal.addEventListener('click', (e) => {
                if (e.target === roleModal) {
                    this.closeRoleModal();
                }
            });
        }
    }

    setupAutoSave() {
        // Auto-save form data in memory as user types
        const formElements = document.querySelectorAll('input, textarea, select');
        
        formElements.forEach(element => {
            element.addEventListener('input', () => {
                this.saveFormData();
            });
            
            element.addEventListener('change', () => {
                this.saveFormData();
            });
        });
        
        // Load saved form data
        this.loadFormData();
    }

    saveFormData() {
        const formData = {
            roles: {
                ceoName: document.getElementById('ceo-name')?.value || '',
                chairmanName: document.getElementById('chairman-name')?.value || '',
                cfoName: document.getElementById('cfo-name')?.value || '',
                auditorName: document.getElementById('auditor-name')?.value || '',
                notes: document.getElementById('roles-notes')?.value || ''
            },
            services: {
                mainActivity: document.getElementById('main-activity')?.value || '',
                industry: document.getElementById('industry')?.value || '',
                revenue: document.getElementById('revenue')?.value || '',
                employees: document.getElementById('employees')?.value || '',
                marketValue: document.getElementById('market-value')?.value || '',
                notes: document.getElementById('services-notes')?.value || ''
            },
            riskAssessment: {
                riskLevel: document.querySelector('input[name="risk-level"]:checked')?.value || '',
                riskFactors: {
                    politicallyExposed: document.getElementById('risk-politically-exposed')?.checked || false,
                    sanctions: document.getElementById('risk-sanctions')?.checked || false,
                    adverseMedia: document.getElementById('risk-adverse-media')?.checked || false,
                    financialDifficulties: document.getElementById('risk-financial-difficulties')?.checked || false,
                    complexStructure: document.getElementById('risk-complex-structure')?.checked || false,
                    offshore: document.getElementById('risk-offshore')?.checked || false
                },
                notes: document.getElementById('risk-notes')?.value || ''
            }
        };
        this._kycFormData = formData;
    }

    loadFormData() {
        const savedData = this._kycFormData;
        if (savedData) {
            try {
                const formData = savedData;
                
                // Load roles data
                if (formData.roles) {
                    Object.keys(formData.roles).forEach(key => {
                        const element = document.getElementById(key === 'ceoName' ? 'ceo-name' : 
                                                              key === 'chairmanName' ? 'chairman-name' :
                                                              key === 'cfoName' ? 'cfo-name' :
                                                              key === 'auditorName' ? 'auditor-name' :
                                                              key === 'notes' ? 'roles-notes' : key);
                        if (element) element.value = formData.roles[key];
                    });
                }
                
                // Load services data
                if (formData.services) {
                    Object.keys(formData.services).forEach(key => {
                        const element = document.getElementById(key === 'mainActivity' ? 'main-activity' :
                                                              key === 'industry' ? 'industry' :
                                                              key === 'revenue' ? 'revenue' :
                                                              key === 'employees' ? 'employees' :
                                                              key === 'marketValue' ? 'market-value' :
                                                              key === 'notes' ? 'services-notes' : key);
                        if (element) element.value = formData.services[key];
                    });
                }
                
                // Load risk assessment data
                if (formData.riskAssessment) {
                    if (formData.riskAssessment.riskLevel) {
                        const radioButton = document.querySelector(`input[name="risk-level"][value="${formData.riskAssessment.riskLevel}"]`);
                        if (radioButton) radioButton.checked = true;
                    }
                    
                    if (formData.riskAssessment.riskFactors) {
                        Object.keys(formData.riskAssessment.riskFactors).forEach(key => {
                            const element = document.getElementById(`risk-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
                            if (element) element.checked = formData.riskAssessment.riskFactors[key];
                        });
                    }
                    
                    const notesElement = document.getElementById('risk-notes');
                    if (notesElement) notesElement.value = formData.riskAssessment.notes || '';
                }
                
                console.log('✅ Form data loaded');
            } catch (error) {
                console.error('❌ Error loading form data:', error);
            }
        }
    }

    populateCompanyInfo() {
        console.log('🔍 populateCompanyInfo called');
        console.log('🔍 this.companyData:', this.companyData);
        
        if (!this.companyData) {
            console.warn('⚠️ No company data to populate');
            return;
        }
        
        console.log('📊 Populating company information...');
        console.log('🔍 Company data fields:', Object.keys(this.companyData));
        console.log('🔍 Company name:', this.companyData.namn);
        
        // Update company name in header
        const companyNameElement = document.getElementById('company-name');
        console.log('🔍 Company name element:', companyNameElement);
        
        if (companyNameElement && this.companyData.namn) {
            companyNameElement.textContent = this.companyData.namn;
            console.log('✅ Company name updated in header');
        } else {
            console.warn('⚠️ Could not update company name in header');
        }
        
        // Populate company details
        const companyDetailsElement = document.getElementById('company-details');
        console.log('🔍 Company details element:', companyDetailsElement);
        
        if (companyDetailsElement) {
            const html = this.generateCompanyDetailsHTML();
            console.log('🔍 Generated HTML length:', html.length);
            companyDetailsElement.innerHTML = html;
            console.log('✅ Company details populated');
            
            // Initialize tabs after HTML is generated
            setTimeout(() => {
                console.log('🔧 Initializing tabs after HTML generation...');
                
        // Debug: Check if tab elements exist
        const allTabButtons = document.querySelectorAll('.tab-button');
        const allTabPanes = document.querySelectorAll('.tab-pane');
        console.log('🔍 All tab buttons in DOM:', allTabButtons.length);
        console.log('🔍 All tab panes in DOM:', allTabPanes.length);
        
        // Debug: Check if kyc-tabs container exists
        const kycTabsContainer = document.querySelector('.kyc-tabs');
        console.log('🔍 KYC tabs container:', kycTabsContainer);
        
        // Debug: Check tab content
        const tabContent = document.querySelector('.tab-content');
        const activeTabPane = document.querySelector('.tab-pane.active');
        console.log('🔍 Tab content container:', tabContent);
        console.log('🔍 Active tab pane:', activeTabPane);
        if (activeTabPane) {
            console.log('🔍 Active tab pane content:', activeTabPane.innerHTML.substring(0, 200) + '...');
        }
                
                // Force show tabs with JavaScript
                this.forceShowTabs();
                
                // Force show tab content
                this.forceShowTabContent();
                
                this.initTabs();
                
                // Final check to ensure content is visible
                setTimeout(() => {
                    this.ensureContentVisibility();
                    this.testTabSwitching();
                }, 200);
            }, 100);
        } else {
            console.error('❌ Company details element not found');
        }
    }

    generateCompanyDetailsHTML() {
        if (!this.companyData) return '<p>Ingen företagsdata tillgänglig</p>';
        
        const companyData = this.companyData;
        
        // Debug: Log all available fields
        console.log('🔍 All available company data fields:', Object.keys(companyData));
        console.log('🔍 Full company data:', companyData);
        
        // Helper function to replace N/A with Saknas
        const formatValue = (value) => {
            if (!value || value === 'N/A' || value === 'null' || value === 'undefined' || value === '') {
                return '<span class="missing-data">Saknas</span>';
            }
            return value;
        };

        // Create HTML for company information (copied from index-sidan)
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
                        ${(() => {
                            const gata = companyData.adress?.gatuadress || '';
                            const postnr = companyData.adress?.postnummer || '';
                            const ort = companyData.adress?.postort || '';
                            const fullAdress = [gata, postnr, ort].filter(Boolean).join(', ') || 'Saknas';
                            return `
                        <div class="address-item full-width">
                            <label>Fullständig adress</label>
                            <span>${fullAdress}</span>
                        </div>`;
                        })()}
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
        `;
        
        return html;
    }

    async saveKYCData() {
        console.log('💾 Saving KYC data...');
        
        const saveBtn = document.getElementById('save-kyc-data');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...';
        saveBtn.disabled = true;
        
        try {
            // Collect all form data
            const kycData = {
                companyData: this.companyData,
                roles: this.kycData.roles,
                rolesNotes: document.getElementById('roles-notes')?.value || '',
                services: {
                    mainActivity: document.getElementById('main-activity')?.value || '',
                    industry: document.getElementById('industry')?.value || '',
                    revenue: document.getElementById('revenue')?.value || '',
                    employees: document.getElementById('employees')?.value || '',
                    marketValue: document.getElementById('market-value')?.value || '',
                    notes: document.getElementById('services-notes')?.value || ''
                },
                riskAssessment: {
                    riskLevel: document.querySelector('input[name="risk-level"]:checked')?.value || '',
                    riskFactors: {
                        politicallyExposed: document.getElementById('risk-politically-exposed')?.checked || false,
                        sanctions: document.getElementById('risk-sanctions')?.checked || false,
                        adverseMedia: document.getElementById('risk-adverse-media')?.checked || false,
                        financialDifficulties: document.getElementById('risk-financial-difficulties')?.checked || false,
                        complexStructure: document.getElementById('risk-complex-structure')?.checked || false,
                        offshore: document.getElementById('risk-offshore')?.checked || false
                    },
                    notes: document.getElementById('risk-notes')?.value || ''
                },
                timestamp: new Date().toISOString(),
                userId: (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())?.id,
                bureauId: (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())?.byraId
            };
            if (!this._kycSavedByOrg) this._kycSavedByOrg = {};
            this._kycSavedByOrg[this.companyData.organisationsnummer] = kycData;
            this._kycFormData = null;
            this.showMessage('KYC-data sparad (session). Spara till servern via befattningshavare-synk om det behövs.', 'success');
            
            console.log('✅ KYC data saved successfully');
            
        } catch (error) {
            console.error('❌ Error saving KYC data:', error);
            this.showMessage('Ett fel uppstod vid sparandet av KYC-data', 'error');
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    exportKYCData() {
        console.log('📤 Exporting KYC data...');
        
        if (!this.companyData) {
            this.showMessage('Ingen KYC-data att exportera', 'warning');
            return;
        }
        
        try {
            const kycData = {
                companyData: this.companyData,
                roles: {
                    ceoName: document.getElementById('ceo-name')?.value || '',
                    chairmanName: document.getElementById('chairman-name')?.value || '',
                    cfoName: document.getElementById('cfo-name')?.value || '',
                    auditorName: document.getElementById('auditor-name')?.value || '',
                    notes: document.getElementById('roles-notes')?.value || ''
                },
                services: {
                    mainActivity: document.getElementById('main-activity')?.value || '',
                    industry: document.getElementById('industry')?.value || '',
                    revenue: document.getElementById('revenue')?.value || '',
                    employees: document.getElementById('employees')?.value || '',
                    marketValue: document.getElementById('market-value')?.value || '',
                    notes: document.getElementById('services-notes')?.value || ''
                },
                riskAssessment: {
                    riskLevel: document.querySelector('input[name="risk-level"]:checked')?.value || '',
                    riskFactors: {
                        politicallyExposed: document.getElementById('risk-politically-exposed')?.checked || false,
                        sanctions: document.getElementById('risk-sanctions')?.checked || false,
                        adverseMedia: document.getElementById('risk-adverse-media')?.checked || false,
                        financialDifficulties: document.getElementById('risk-financial-difficulties')?.checked || false,
                        complexStructure: document.getElementById('risk-complex-structure')?.checked || false,
                        offshore: document.getElementById('risk-offshore')?.checked || false
                    },
                    notes: document.getElementById('risk-notes')?.value || ''
                },
                exportDate: new Date().toISOString()
            };
            
            // Create and download JSON file
            const dataStr = JSON.stringify(kycData, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `kyc-data-${this.companyData.organisationsnummer}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            this.showMessage('KYC-data exporterad framgångsrikt!', 'success');
            console.log('✅ KYC data exported successfully');
            
        } catch (error) {
            console.error('❌ Error exporting KYC data:', error);
            this.showMessage('Ett fel uppstod vid exporten av KYC-data', 'error');
        }
    }

    showMessage(message, type = 'info') {
        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${type}`;
        messageDiv.innerHTML = `
            <div class="message-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;
        
        // Add to page
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.insertBefore(messageDiv, mainContent.firstChild);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 5000);
        }
    }
}

// Global functions for modal handling
function closeRoleModal() {
    if (window.kycManager) {
        window.kycManager.closeRoleModal();
    }
}

// Initialize KYC Manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM loaded, initializing KYC Manager...');
    window.kycManager = new KYCManager();
});
