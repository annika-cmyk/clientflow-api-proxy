// Risk Factors Management System
function riskAuthFetch(url, init) {
    const base = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions())
        || { credentials: 'include', headers: {} };
    const headers = Object.assign({ 'Content-Type': 'application/json' }, base.headers || {}, (init && init.headers) || {});
    return fetch(url, Object.assign({}, base, init || {}, { credentials: 'include', headers }));
}

class RiskFactorsManager {
    constructor() {
        this.gristBaseId = null;
        this.gristTableName = 'Risker kopplade till kunden';
        this.datasourceConfig = null;
        this.risks = [];
        this.filteredRisks = [];
        this.userData = null;
        this.userByraIds = [];
        
        this.init();
    }

    async init() {
        await this.loadDatasourceConfig();
        await this.loadUserData();
        this.setupEventListeners();
        this.setupRoleBasedUI();
        await this.loadRiskFactors();
        
        // Apply initial filtering based on user role
        this.applyFilters();
    }

    async loadDatasourceConfig() {
        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/datasource/config`);
            if (response.ok) {
                const config = await response.json();
                this.datasourceConfig = config;
                this.gristBaseId = config.baseId || config.docId || null;
                this.airtableApiKey = config.apiKey || (config.configured ? '***' : null);
            } else {
                console.warn('Could not load datasource config, using fallback');
                this.datasourceConfig = null;
            }
        } catch (error) {
            console.error('Error loading datasource config:', error);
        }
    }

    async loadUserData() {
        try {
            // Check if user is logged in by looking for auth token
            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            const response = await fetch(`${window.apiConfig.baseUrl}/api/auth/me`, { method: 'GET', ...opts });
            if (!response.ok) {
                console.warn('User not logged in');
                return;
            }

            if (response.ok) {
                const data = await response.json();
                this.userData = data.user;
                
                console.log('Raw user data:', this.userData);
                
                // Extract byrå IDs from various possible fields
                this.userByraIds = [];
                
                // Method 1: Check byraId field (prioritized - contains actual byrå ID)
                if (this.userData.byraId) {
                    this.userByraIds = [this.userData.byraId.toString()];
                    console.log('Found byrå ID from byraId field:', this.userByraIds);
                }
                // Method 2: Check byraIds array (fallback - contains record IDs)
                else if (this.userData.byraIds && Array.isArray(this.userData.byraIds)) {
                    this.userByraIds = this.userData.byraIds.map(id => id.toString());
                    console.log('Found byrå IDs from byraIds array:', this.userByraIds);
                }
                // Method 3: Check byra field (string)
                else if (this.userData.byra) {
                    // Try to extract byrå ID from byrå name (e.g., "Byrå 49" -> "49")
                    const match = this.userData.byra.match(/Byrå\s+(\d+)/);
                    if (match) {
                        this.userByraIds = [match[1]];
                        console.log('Found byrå ID from byra field:', this.userByraIds);
                    }
                }
                // Method 4: Check byra field (object)
                else if (this.userData.byra && typeof this.userData.byra === 'object') {
                    if (this.userData.byra.id) {
                        this.userByraIds = [this.userData.byra.id.toString()];
                        console.log('Found byrå ID from byra object:', this.userByraIds);
                    } else if (this.userData.byra.name) {
                        const match = this.userData.byra.name.match(/Byrå\s+(\d+)/);
                        if (match) {
                            this.userByraIds = [match[1]];
                            console.log('Found byrå ID from byra object name:', this.userByraIds);
                        }
                    }
                }
                
                console.log('Final user byrå IDs:', this.userByraIds);
                console.log('User role:', this.userData.role);
                
                // If no byrå IDs found, log warning
                if (this.userByraIds.length === 0) {
                    console.warn('No byrå IDs found for user:', this.userData.name);
                }
            } else {
                console.warn('Could not load user data - HTTP', response.status);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    setupRoleBasedUI() {
        const byraFilterGroup = document.querySelector('.filter-group');
        const byraFilter = document.getElementById('byra-filter');
        if (!byraFilterGroup || !byraFilter) return;

        console.log('Setting up role-based UI for user:', this.userData?.role);
        console.log('User byrå IDs:', this.userByraIds);

        // If no user data (not logged in), show login message
        if (!this.userData) {
            byraFilterGroup.style.display = 'none';
            this.showLoginRequiredMessage();
            console.log('No user data - showing login required message');
            return;
        }

        if (this.userData.role !== 'ClientFlowAdmin') {
            // For non-admin users, hide the byrå filter dropdown
            byraFilterGroup.style.display = 'none';
            console.log('Hidden byrå filter for non-admin user');
            
            // Add info about user's access
            this.showUserAccessInfo();
        } else {
            // For admin users, show all byråer in dropdown
            byraFilterGroup.style.display = 'block';
            console.log('Showing byrå filter for admin user');
        }
    }

    showLoginRequiredMessage() {
        const header = document.querySelector('.risk-header-content');
        if (header) {
            // Remove existing info if any
            const existingInfo = header.querySelector('.user-access-info');
            if (existingInfo) {
                existingInfo.remove();
            }
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'user-access-info';
            infoDiv.innerHTML = `
                <div class="access-info" style="background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Inloggning krävs</strong>
                    <p>Du måste logga in för att se riskfaktorer. 
                    <a href="/login.html" style="color: #856404; text-decoration: underline;">Klicka här för att logga in</a></p>
                </div>
            `;
            header.appendChild(infoDiv);
        }
    }

    showUserAccessInfo() {
        // Add user access info to the page
        const header = document.querySelector('.risk-header-content');
        if (header && this.userData) {
            // Remove existing info if any
            const existingInfo = header.querySelector('.user-access-info');
            if (existingInfo) {
                existingInfo.remove();
            }
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'user-access-info';
            
            const byraInfo = this.userByraIds.length > 0 
                ? `Byrå: ${this.userByraIds.join(', ')}` 
                : 'Ingen byrå tilldelad';
                
            infoDiv.innerHTML = `
                <div class="access-info">
                    <span class="user-byra-info">${byraInfo}</span>
                    <span class="access-note">Visar endast riskfaktorer för din byrå</span>
                </div>
            `;
            header.appendChild(infoDiv);
            
            console.log('Added user access info:', byraInfo);
        }
    }

    setupEventListeners() {
        // Filter controls
        document.getElementById('apply-filters').addEventListener('click', () => this.applyFilters());
        document.getElementById('clear-filters').addEventListener('click', () => this.clearFilters());

        // Auto-apply filters when dropdown values change
        document.getElementById('byra-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('risk-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('status-filter').addEventListener('change', () => this.applyFilters());

        // Form submissions
        document.getElementById('add-risk-form').addEventListener('submit', (e) => this.handleAddRisk(e));
        document.getElementById('edit-risk-form').addEventListener('submit', (e) => this.handleEditRisk(e));

        const addAiBtn = document.getElementById('add-ai-suggest-btn');
        if (addAiBtn) addAiBtn.addEventListener('click', () => this.generateAiSuggestion('add'));
        const editAiBtn = document.getElementById('edit-ai-suggest-btn');
        if (editAiBtn) editAiBtn.addEventListener('click', () => this.generateAiSuggestion('edit'));

        ['sannolikhet', 'konsekvens', 'sannolikhet-efter', 'konsekvens-efter'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', () => this.updateRiskBadges('add'));
            document.getElementById(`edit-${id}`)?.addEventListener('change', () => {
                this.editNeedsReview = false;
                this.updateRiskBadges('edit');
            });
        });

        // Modal controls
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
                const modal = e.target.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            }
        });
    }

    async loadRiskFactors() {
        const riskList = document.getElementById('risk-list');
        
        try {
            riskList.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Laddar riskfaktorer...</p>
                </div>
            `;

            // Load from Airtable via our API
            const response = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risk-factors`, {
                method: 'GET'
            });

            if (response.ok) {
                const data = await response.json();
                this.risks = data.records || [];
                
                // Populate byrå dropdown with unique byrå IDs from the data
                this.populateByraDropdown();
                
                // Apply role-based filtering automatically
                this.applyFilters();
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error loading risk factors:', error);
            riskList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Fel vid laddning av riskfaktorer</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="riskManager.loadRiskFactors()">
                        <i class="fas fa-refresh"></i>
                        Försök igen
                    </button>
                </div>
            `;
        }
    }

    populateByraDropdown() {
        const byraFilter = document.getElementById('byra-filter');
        if (!byraFilter) return;

        // Get unique byrå IDs from the risks data
        const uniqueByraIds = [...new Set(this.risks.map(risk => risk.fields['Byrå ID']).filter(id => id))];
        
        console.log('Found unique byrå IDs:', uniqueByraIds);
        
        // Clear existing options except "Alla byråer"
        byraFilter.innerHTML = '<option value="">Alla byråer</option>';
        
        if (uniqueByraIds.length === 0) {
            console.log('No byrå IDs found in the data');
            return;
        }
        
        // Add options for each unique byrå ID
        uniqueByraIds.sort((a, b) => a - b).forEach(byraId => {
            const option = document.createElement('option');
            option.value = byraId;
            option.textContent = `Byrå ${byraId}`;
            byraFilter.appendChild(option);
        });
        
        console.log('Byrå dropdown populated with', uniqueByraIds.length, 'byråer');
    }

    renderRiskList() {
        const riskList = document.getElementById('risk-list');
        
        if (this.filteredRisks.length === 0) {
            riskList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <h3>Inga riskfaktorer hittades</h3>
                    <p>Prova att justera dina filter eller lägg till en ny riskfaktor.</p>
                    <button class="btn btn-primary" onclick="this.openAddModal()">
                        <i class="fas fa-plus"></i>
                        Lägg till riskfaktor
                    </button>
                </div>
            `;
            return;
        }

        // Group risks by "Typ av riskfaktor"
        const groupedRisks = {};
        this.filteredRisks.forEach(risk => {
            const riskType = risk.fields['Typ av riskfaktor'] || 'Övriga riskfaktorer';
            if (!groupedRisks[riskType]) {
                groupedRisks[riskType] = [];
            }
            groupedRisks[riskType].push(risk);
        });

        // Create HTML for each group
        const groupHTML = Object.keys(groupedRisks).map(riskType => {
            const risksInGroup = groupedRisks[riskType];
            const riskItems = risksInGroup.map(risk => this.createRiskItem(risk)).join('');
            
            return `
                <div class="risk-group">
                    <div class="risk-group-header">
                        <h3>${riskType}</h3>
                    </div>
                    <div class="risk-items">
                        ${riskItems}
                    </div>
                </div>
            `;
        }).join('');

        riskList.innerHTML = groupHTML;

        // Add event listeners to buttons
        this.setupRiskItemEventListeners();
    }

    scoredRisk(fields) {
        return (window.RiskSkala && RiskSkala.readOvrigRisk(fields || {})) || {};
    }

    setScoreSelect(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = value == null ? '' : String(value);
    }

    paintRiskBadge(id, text, level) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        const pill = (window.RiskSkala && level) ? RiskSkala.riskPillClass(level) : '';
        el.className = 'tjanst-risk-badge' + (pill ? ` ${pill}` : ' is-empty');
        if (id.indexOf('residual') !== -1) {
            el.title = (window.RiskSkala && RiskSkala.RESIDUAL_BEGREPP) || '';
        } else {
            el.title = (window.RiskSkala && RiskSkala.INNEBOENDE_BEGREPP) || '';
        }
    }

    updateRiskBadges(mode) {
        const prefix = mode === 'edit' ? 'edit-' : '';
        const inherent = (window.RiskSkala && RiskSkala.assessRisk(
            document.getElementById(`${prefix}sannolikhet`)?.value,
            document.getElementById(`${prefix}konsekvens`)?.value
        )) || {};
        const residual = (window.RiskSkala && RiskSkala.assessRisk(
            document.getElementById(`${prefix}sannolikhet-efter`)?.value,
            document.getElementById(`${prefix}konsekvens-efter`)?.value
        )) || {};
        this.paintRiskBadge(
            `${mode === 'edit' ? 'edit' : 'add'}-inneboende-badge`,
            (window.RiskSkala && RiskSkala.formatInneboendeBadge(inherent)) || 'Inneboende risk: Ej satt',
            inherent.level
        );
        this.paintRiskBadge(
            `${mode === 'edit' ? 'edit' : 'add'}-residual-badge`,
            (window.RiskSkala && RiskSkala.formatResidualBadge(residual)) || 'Residualrisk: Ej satt',
            residual.level
        );
        const flag = document.getElementById('edit-review-flag');
        if (flag) flag.hidden = mode !== 'edit' || !this.editNeedsReview;
        return { inherent, residual };
    }

    collectRiskPayload(formData) {
        const poang = {
            sannolikhet: formData.get('sannolikhet'),
            konsekvens: formData.get('konsekvens'),
            sannolikhetEfter: formData.get('sannolikhet-efter'),
            konsekvensEfter: formData.get('konsekvens-efter'),
            kraverManualOversyn: this.editNeedsReview === true
        };
        const inherent = (window.RiskSkala && RiskSkala.assessRisk(poang.sannolikhet, poang.konsekvens)) || {};
        return {
            'Typ av riskfaktor': formData.get('risk-type'),
            'Riskfaktor': formData.get('risk-factor'),
            'Beskrivning': formData.get('description'),
            'Åtgjärd': formData.get('action'),
            'Riskbedömning': inherent.level || '',
            'Riskpoäng': (window.RiskSkala && RiskSkala.serializeRiskPoang(poang)) || JSON.stringify(poang),
            'PT/TF-relevans': (window.RiskSkala && RiskSkala.normalizePtTf(formData.get('pt-tf'))) || formData.get('pt-tf') || 'PT'
        };
    }

    createRiskItem(risk) {
        const scored = this.scoredRisk(risk.fields);
        const riskLevel = scored.level || 'Normal';
        const riskLevelClass = this.getRiskLevelClass(riskLevel);
        const residualLevel = scored.residualLevel || '';
        const residualClass = residualLevel ? this.getRiskLevelClass(residualLevel) : '';
        const badges = (window.RiskSkala && RiskSkala.listBadgeLabels(scored)) || {
            inneboende: scored.badge || riskLevel,
            residual: residualLevel ? ('Residualrisk: ' + (scored.residualBadge || residualLevel)) : '',
            inneboendeTitle: '',
            residualTitle: ''
        };
        const isChecked = risk.fields['Aktuell'] === true;
        const riskType = risk.fields['Typ av riskfaktor'] || 'Namnlös riskfaktor';
        const riskFactor = risk.fields['Riskfaktor'] || '';
        const approvalDate = risk.fields['Riskbedömning godkänd datum'] || '';
        const tfTag = (window.RiskSkala && RiskSkala.isTfRelevant(scored.ptTfRelevans))
            ? '<span class="pt-tf-tag">TF</span>'
            : '';
        
        return `
            <div class="risk-item ${riskLevelClass}" data-record-id="${risk.id}">
                <div class="risk-item-header" onclick="riskManager.toggleRiskItem(this)">
                    <div class="risk-item-title">
                        <div class="risk-status-indicator ${isChecked ? 'checked' : 'unchecked'}">
                            ${isChecked ? '✓' : '○'}
                        </div>
                        <div class="risk-item-info">
                            <h4 class="risk-task-name">${riskFactor} ${tfTag}</h4>
                            <div class="risk-meta-info">
                                <span class="risk-level-badge ${riskLevelClass}" title="${this.esc(badges.inneboendeTitle)}">${this.esc(badges.inneboende)}</span>
                                ${badges.residual ? `<span class="risk-level-badge ${residualClass}" title="${this.esc(badges.residualTitle)}">${this.esc(badges.residual)}</span>` : ''}
                                ${approvalDate ? `<span>Godkänd: ${approvalDate}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="risk-item-actions">
                        <button class="expand-toggle" onclick="event.stopPropagation(); riskManager.toggleRiskItem(this.closest('.risk-item-header'))">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                </div>
                
                <div class="risk-item-content">
                    <div class="risk-content-section">
                        <h5><i class="fas fa-exclamation-triangle"></i> Riskfaktor</h5>
                        <p class="risk-content-text">
                            ${this.formatDescription(riskFactor)}${scored.ptTfRelevans ? ` · ${scored.ptTfRelevans}` : ''}
                        </p>
                    </div>
                    
                    <div class="risk-content-section">
                        <h5><i class="fas fa-info-circle"></i> Beskrivning och inneboende risk</h5>
                        <p class="risk-content-text">
                            ${this.formatDescription(risk.fields['Beskrivning'] || '')}
                        </p>
                    </div>
                    
                    <div class="risk-content-section">
                        <h5><i class="fas fa-tools"></i> Åtgärd</h5>
                        <p class="risk-content-text">
                            ${this.formatDescription(risk.fields['Åtgjärd'] || risk.fields['Åtgärd'] || '')}
                        </p>
                    </div>
                    
                    <div class="risk-item-footer">
                        <button class="btn btn-secondary btn-sm edit-risk" data-record-id="${risk.id}">
                            <i class="fas fa-edit"></i>
                            Redigera
                        </button>
                        <button class="btn btn-success btn-sm mark-complete" data-record-id="${risk.id}">
                            <i class="fas fa-check"></i>
                            ${isChecked ? 'Avmarkera' : 'Klarmarkera'}
                        </button>
                        <button class="btn btn-danger btn-sm delete-risk" data-record-id="${risk.id}">
                            <i class="fas fa-trash"></i>
                            Ta bort
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    esc(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    formatDescription(text) {
        if (!text) return '<em>Ingen beskrivning tillgänglig</em>';
        
        // Convert line breaks to HTML
        return text.replace(/\n/g, '<br>');
    }

    getRiskLevelClass(level) {
        return (window.RiskSkala && RiskSkala.riskItemClass(level)) || 'risk-normal';
    }

    toggleRiskItem(headerElement) {
        const riskItem = headerElement.closest('.risk-item');
        const content = riskItem.querySelector('.risk-item-content');
        const toggle = riskItem.querySelector('.expand-toggle');
        const icon = toggle.querySelector('i');
        
        if (riskItem.classList.contains('expanded')) {
            // Collapse
            riskItem.classList.remove('expanded');
            toggle.classList.remove('expanded');
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        } else {
            // Expand
            riskItem.classList.add('expanded');
            toggle.classList.add('expanded');
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        }
    }

    setupRiskItemEventListeners() {
        // Edit buttons
        document.querySelectorAll('.edit-risk').forEach(button => {
            button.addEventListener('click', (e) => {
                const recordId = e.target.closest('.edit-risk').dataset.recordId;
                this.openEditModal(recordId);
            });
        });

        // Mark complete buttons
        document.querySelectorAll('.mark-complete').forEach(button => {
            button.addEventListener('click', (e) => {
                const recordId = e.target.closest('.mark-complete').dataset.recordId;
                this.markAsComplete(recordId);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-risk').forEach(button => {
            button.addEventListener('click', (e) => {
                const recordId = e.target.closest('.delete-risk').dataset.recordId;
                this.deleteRisk(recordId);
            });
        });
    }

    applyFilters() {
        // Don't apply filters if data isn't loaded yet
        if (!this.risks || this.risks.length === 0) {
            console.log('No risks data available yet, skipping filters');
            return;
        }

        // If user is not logged in, don't show any risks
        if (!this.userData) {
            console.log('User not logged in - showing no risks');
            this.filteredRisks = [];
            this.renderRiskList();
            this.updateStats();
            return;
        }

        const byraFilter = document.getElementById('byra-filter')?.value || '';
        const riskFilter = document.getElementById('risk-filter')?.value || '';
        const statusFilter = document.getElementById('status-filter')?.value || '';

        console.log('Applying filters with user role:', this.userData?.role);
        console.log('User byrå IDs:', this.userByraIds);
        console.log('Byrå filter value:', byraFilter);
        console.log('Risk filter value:', riskFilter);
        console.log('Status filter value:', statusFilter);

        this.filteredRisks = this.risks.filter(risk => {
            const fields = risk.fields;
            const riskByraId = fields['Byrå ID']?.toString();
            
            console.log('Checking risk:', fields['Typ av riskfaktor'], 'with byrå ID:', riskByraId);
            
            // Role-based byrå filtering
            if (this.userData && this.userData.role !== 'ClientFlowAdmin') {
                // For non-admin users, only show risks from their byrå
                if (this.userByraIds.length === 0) {
                    console.log('No byrå IDs found for user, filtering out all risks');
                    return false;
                }
                
                if (!this.userByraIds.includes(riskByraId)) {
                    return false;
                }
            } else {
                // For admin users, apply manual byrå filter if selected
                if (byraFilter && riskByraId !== byraFilter) {
                    return false;
                }
            }
            
            const scored = this.scoredRisk(fields);
            if (riskFilter) {
                const hitInherent = window.RiskSkala
                    ? RiskSkala.sameLevel(scored.level, riskFilter)
                    : scored.level === riskFilter;
                const hitResidual = window.RiskSkala
                    ? RiskSkala.sameLevel(scored.residualLevel, riskFilter)
                    : scored.residualLevel === riskFilter;
                if (!hitInherent && !hitResidual) return false;
            }
            
            // Status filter
            if (statusFilter) {
                const isChecked = fields['Aktuell'] === true;
                const status = isChecked ? 'checked' : 'unchecked';
                if (status !== statusFilter) {
                    return false;
                }
            }
            
            return true;
        });

        console.log('Filtered risks count:', this.filteredRisks.length);
        this.renderRiskList();
        this.updateStats();
    }

    clearFilters() {
        // Only clear byrå filter for admin users
        if (this.userData && this.userData.role === 'ClientFlowAdmin') {
            const byraFilter = document.getElementById('byra-filter');
            if (byraFilter) byraFilter.value = '';
        }
        
        const riskFilter = document.getElementById('risk-filter');
        const statusFilter = document.getElementById('status-filter');
        
        if (riskFilter) riskFilter.value = '';
        if (statusFilter) statusFilter.value = '';
        
        console.log('Filters cleared, re-applying...');
        
        // Re-apply role-based filtering
        this.applyFilters();
    }

    updateStats() {
        const highRiskCount = this.filteredRisks.filter(risk => {
            const scored = this.scoredRisk(risk.fields);
            if (window.RiskSkala) {
                return RiskSkala.isElevatedOrAbove(scored.level) || RiskSkala.isElevatedOrAbove(scored.residualLevel);
            }
            return ['Förhöjd', 'Hög', 'Oacceptabel'].includes(scored.level);
        }).length;
        const completedCount = this.filteredRisks.filter(risk => 
            risk.fields['Aktuell'] === true
        ).length;

        document.getElementById('high-risk-count').textContent = highRiskCount;
        document.getElementById('completed-count').textContent = completedCount;
    }

    applyOvrigAiAll(prefix, data) {
        if (data.beskrivning) document.getElementById(`${prefix}description`).value = data.beskrivning;
        if (data.atgard) document.getElementById(`${prefix}action`).value = data.atgard;
        if (data.ptTfRelevans) {
            const pt = document.getElementById(`${prefix}pt-tf`);
            if (pt) pt.value = (window.RiskSkala && RiskSkala.normalizePtTf(data.ptTfRelevans)) || data.ptTfRelevans;
        }
        if (data.sannolikhet != null) this.setScoreSelect(`${prefix}sannolikhet`, data.sannolikhet);
        if (data.konsekvens != null) this.setScoreSelect(`${prefix}konsekvens`, data.konsekvens);
        if (data.sannolikhetEfter != null) this.setScoreSelect(`${prefix}sannolikhet-efter`, data.sannolikhetEfter);
        if (data.konsekvensEfter != null) this.setScoreSelect(`${prefix}konsekvens-efter`, data.konsekvensEfter);
        if ((data.sannolikhet == null || data.konsekvens == null) && data.riskbedomning && window.RiskSkala) {
            const inferred = RiskSkala.scoresFromLegacyLevel(data.riskbedomning);
            if (data.sannolikhet == null) this.setScoreSelect(`${prefix}sannolikhet`, inferred.sannolikhet);
            if (data.konsekvens == null) this.setScoreSelect(`${prefix}konsekvens`, inferred.konsekvens);
        }
    }

    applyOvrigAiIfEmpty(prefix, existing, data) {
        const Ai = window.AiFaltGranskning;
        if (!(Ai && Ai.isFilledText(existing.beskrivning)) && data.beskrivning) {
            document.getElementById(`${prefix}description`).value = data.beskrivning;
        }
        if (!(Ai && Ai.isFilledText(existing.atgard)) && data.atgard) {
            document.getElementById(`${prefix}action`).value = data.atgard;
        }
        const emptySxk = !(Ai && (Ai.isFilledScore(existing.sannolikhet) || Ai.isFilledScore(existing.konsekvens)));
        const emptyRes = !(Ai && (Ai.isFilledScore(existing.sannolikhetEfter) || Ai.isFilledScore(existing.konsekvensEfter)));
        if (emptySxk && data.sannolikhet != null) this.setScoreSelect(`${prefix}sannolikhet`, data.sannolikhet);
        if (emptySxk && data.konsekvens != null) this.setScoreSelect(`${prefix}konsekvens`, data.konsekvens);
        if (emptyRes && data.sannolikhetEfter != null) this.setScoreSelect(`${prefix}sannolikhet-efter`, data.sannolikhetEfter);
        if (emptyRes && data.konsekvensEfter != null) this.setScoreSelect(`${prefix}konsekvens-efter`, data.konsekvensEfter);
    }

    attachOvrigFieldAi(afterEl, { label, html, comment, onApply }) {
        if (!afterEl) return;
        afterEl.parentElement?.querySelectorAll('.field-ai-forslag').forEach((el) => el.remove());
        const box = document.createElement('div');
        box.className = 'field-ai-forslag';
        const esc = (s) => String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        box.innerHTML = `
            <span class="field-ai-label">${esc(label || 'AI-förslag')}</span>
            ${comment ? `<p class="field-ai-comment">${esc(comment)}</p>` : ''}
            ${html}
            <div class="field-ai-actions">
                <button type="button" class="btn btn-primary btn-sm" data-ai-apply>Kopiera in</button>
                <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss>Avfärda</button>
            </div>
        `;
        afterEl.insertAdjacentElement('afterend', box);
        box.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-ai-apply]') && onApply) onApply(box);
            if (ev.target.closest('[data-ai-apply]') || ev.target.closest('[data-ai-dismiss]')) box.remove();
        });
    }

    paintInlineOvrigAi(prefix, poster, befintligt, host) {
        const Ai = window.AiFaltGranskning;
        document.querySelectorAll(`#${prefix || ''}add-risk-form .field-ai-forslag, #${prefix}risk-form .field-ai-forslag, .field-ai-forslag`).forEach((el) => {
            if (el.closest('#add-risk-modal, #edit-risk-modal')) el.remove();
        });
        const items = (poster || []).map((item) => Ai.decoratePoster(item, befintligt)).filter(Ai.isVisibleReviewItem);
        let changed = false;
        items.forEach((item) => {
            if (!item.andra) return;
            const comment = Ai.usefulComment(item.kommentar);
            if (item.falt === 'beskrivning') {
                this.attachOvrigFieldAi(document.getElementById(`${prefix}description`), {
                    comment,
                    html: `<textarea data-ai-forslag rows="5">${String(item.forslag || '').replace(/</g, '&lt;')}</textarea>`,
                    onApply: (box) => {
                        document.getElementById(`${prefix}description`).value = box.querySelector('[data-ai-forslag]')?.value || '';
                    }
                });
                changed = true;
            } else if (item.falt === 'atgard') {
                this.attachOvrigFieldAi(document.getElementById(`${prefix}action`), {
                    comment,
                    html: `<textarea data-ai-forslag rows="4">${String(item.forslag || '').replace(/</g, '&lt;')}</textarea>`,
                    onApply: (box) => {
                        document.getElementById(`${prefix}action`).value = box.querySelector('[data-ai-forslag]')?.value || '';
                    }
                });
                changed = true;
            } else if (item.falt === 'sxk' || item.falt === 'residual') {
                const s = item.forslag && typeof item.forslag === 'object' ? item.forslag : {};
                const afterEl = item.falt === 'sxk'
                    ? document.getElementById(`${prefix}inneboende-badge`)
                    : document.getElementById(`${prefix}residual-badge`);
                this.attachOvrigFieldAi(afterEl, {
                    label: item.falt === 'sxk' ? 'AI-förslag S×K' : 'AI-förslag residual',
                    comment,
                    html: `<div class="ai-review-scores">
                        <label>Sannolikhet <select data-ai-s>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${String(s.sannolikhet) === String(n) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
                        <label>Konsekvens <select data-ai-k>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${String(s.konsekvens) === String(n) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
                    </div>`,
                    onApply: (box) => this.applyOvrigAiField(prefix, item.falt, {
                        sannolikhet: box.querySelector('[data-ai-s]')?.value,
                        konsekvens: box.querySelector('[data-ai-k]')?.value
                    })
                });
                changed = true;
            }
        });
        if (host) {
            if (!changed) Ai.hideReview(host);
            else {
                host.hidden = false;
                host.classList.add('is-inline-summary');
                host.innerHTML = `
                    <div class="ai-review-head">
                        <div>
                            <strong>AI har lagt förslag under fälten</strong>
                            <p>Jämför, redigera och kopiera in det du vill behålla. Du ansvarar för vad som sparas.</p>
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss-all>Avfärda alla</button>
                    </div>
                `;
                host.onclick = (ev) => {
                    if (!ev.target.closest('[data-ai-dismiss-all]')) return;
                    host.closest('.modal')?.querySelectorAll('.field-ai-forslag').forEach((el) => el.remove());
                    Ai.hideReview(host);
                };
            }
        }
        return changed;
    }

    applyOvrigAiField(prefix, falt, forslag) {
        if (falt === 'beskrivning') {
            document.getElementById(`${prefix}description`).value = String(forslag || '');
        } else if (falt === 'atgard') {
            document.getElementById(`${prefix}action`).value = String(forslag || '');
        } else if (falt === 'ptTfRelevans') {
            const pt = document.getElementById(`${prefix}pt-tf`);
            if (pt) pt.value = (window.RiskSkala && RiskSkala.normalizePtTf(forslag)) || forslag;
        } else if (falt === 'sxk') {
            const scores = forslag && typeof forslag === 'object' ? forslag : {};
            if (scores.sannolikhet != null) this.setScoreSelect(`${prefix}sannolikhet`, scores.sannolikhet);
            if (scores.konsekvens != null) this.setScoreSelect(`${prefix}konsekvens`, scores.konsekvens);
        } else if (falt === 'residual') {
            const scores = forslag && typeof forslag === 'object' ? forslag : {};
            if (scores.sannolikhet != null) this.setScoreSelect(`${prefix}sannolikhet-efter`, scores.sannolikhet);
            if (scores.konsekvens != null) this.setScoreSelect(`${prefix}konsekvens-efter`, scores.konsekvens);
        }
        this.updateRiskBadges(prefix ? 'edit' : 'add');
    }

    async generateAiSuggestion(mode) {
        const isEdit = mode === 'edit';
        const prefix = isEdit ? 'edit-' : '';
        const riskfaktor = (document.getElementById(`${prefix}risk-factor`)?.value || '').trim();
        const typ = (document.getElementById(`${prefix}risk-type`)?.value || '').trim();
        if (!riskfaktor) {
            this.showNotification('Ange riskfaktorn först.', 'error');
            document.getElementById(`${prefix}risk-factor`)?.focus();
            return;
        }

        const btn = document.getElementById(isEdit ? 'edit-ai-suggest-btn' : 'add-ai-suggest-btn');
        const label = btn?.querySelector('.ai-btn-label');
        const originalLabel = label ? label.textContent : '';
        const Ai = window.AiFaltGranskning;
        const reviewHost = document.getElementById(isEdit ? 'edit-ai-review' : 'add-ai-review');
        const inherent = (window.RiskSkala && RiskSkala.assessRisk(
            document.getElementById(`${prefix}sannolikhet`)?.value,
            document.getElementById(`${prefix}konsekvens`)?.value
        )) || {};
        const befintligt = {
            beskrivning: document.getElementById(`${prefix}description`)?.value?.trim() || '',
            atgard: document.getElementById(`${prefix}action`)?.value?.trim() || '',
            sannolikhet: document.getElementById(`${prefix}sannolikhet`)?.value || '',
            konsekvens: document.getElementById(`${prefix}konsekvens`)?.value || '',
            sannolikhetEfter: document.getElementById(`${prefix}sannolikhet-efter`)?.value || '',
            konsekvensEfter: document.getElementById(`${prefix}konsekvens-efter`)?.value || '',
            ptTfRelevans: document.getElementById(`${prefix}pt-tf`)?.value || '',
            riskbedomning: inherent.level || ''
        };
        const reviewMode = !!(Ai && Ai.hasExistingOvrigContent(befintligt));
        if (btn) {
            btn.disabled = true;
            btn.classList.add('loading');
            if (label) label.textContent = reviewMode ? 'Analyserar…' : 'Genererar…';
        }

        try {
            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            const response = await fetch(`${window.apiConfig.baseUrl}/api/ai-ovriga-riskfaktor`, {
                method: 'POST',
                ...opts,
                headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
                body: JSON.stringify({ riskfaktor, typ, befintligt })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            this._lastAiAudit = data.auditLogId ? { logId: data.auditLogId } : null;
            if (reviewMode) {
                this.applyOvrigAiIfEmpty(prefix, befintligt, data);
                const poster = (data.granskning && Array.isArray(data.granskning.poster) && data.granskning.poster.length)
                    ? data.granskning.poster
                    : Ai.ensureAnalysisPosters('ovrig', befintligt, data, []);
                const changed = this.paintInlineOvrigAi(prefix, poster, befintligt, reviewHost);
                this.showNotification(changed
                    ? 'AI har lagt förslag under era fält. Jämför och kopiera in det ni vill använda. Du ansvarar för vad som sparas.'
                    : 'AI har fyllt tomma fält. Inga nya förslag skilde sig från era texter.', 'success');
            } else {
                this.applyOvrigAiAll(prefix, data);
                this.showNotification('AI-förslag inlagt. Granska och justera innan du sparar.', 'success');
            }
            if (mode === 'edit') this.editNeedsReview = false;
            this.updateRiskBadges(mode);
        } catch (error) {
            console.error('AI-förslag fel:', error);
            this.showNotification('Kunde inte generera AI-förslag: ' + error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('loading');
                if (label) label.textContent = originalLabel || 'Generera AI-förslag';
            }
        }
    }

    openAddModal() {
        document.getElementById('add-risk-form')?.reset();
        const pt = document.getElementById('pt-tf');
        if (pt) pt.value = 'PT';
        this.editNeedsReview = false;
        this.updateRiskBadges('add');
        document.getElementById('add-risk-modal').style.display = 'flex';
    }

    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        if (window.AiFaltGranskning) {
            AiFaltGranskning.hideReview(document.getElementById('add-ai-review'));
            AiFaltGranskning.hideReview(document.getElementById('edit-ai-review'));
        }
    }

    async openEditModal(recordId) {
        const risk = this.risks.find(r => r.id === recordId);
        if (!risk) return;

        const fields = risk.fields;
        
        // Populate form fields
        document.getElementById('edit-record-id').value = recordId;
        document.getElementById('edit-risk-type').value = fields['Typ av riskfaktor'] || '';
        
        const scored = this.scoredRisk(fields);
        document.getElementById('edit-risk-factor').value = fields['Riskfaktor'] || '';
        document.getElementById('edit-description').value = fields['Beskrivning'] || '';
        document.getElementById('edit-action').value = fields['Åtgjärd'] || fields['Åtgärd'] || '';
        const pt = document.getElementById('edit-pt-tf');
        if (pt) pt.value = scored.ptTfRelevans || 'PT';
        this.setScoreSelect('edit-sannolikhet', scored.sannolikhet);
        this.setScoreSelect('edit-konsekvens', scored.konsekvens);
        this.setScoreSelect('edit-sannolikhet-efter', scored.sannolikhetEfter);
        this.setScoreSelect('edit-konsekvens-efter', scored.konsekvensEfter);
        this.editNeedsReview = scored.kraverManualOversyn === true;
        this.updateRiskBadges('edit');

        document.getElementById('edit-risk-modal').style.display = 'flex';
    }

    async handleAddRisk(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        
        // Use the first byrå ID from user's data
        const userByraId = this.userByraIds.length > 0 ? this.userByraIds[0] : null;
        
        if (!userByraId) {
            this.showNotification('Inget byrå ID hittat för användaren. Kontakta administratören.', 'error');
            return;
        }
        
        this.editNeedsReview = false;
        const riskData = {
            ...this.collectRiskPayload(formData),
            'Byrå ID': userByraId,
            'Aktuell': true
        };

        try {
            const response = await this.saveRiskFactor(`${window.apiConfig.baseUrl}/api/risk-factors`, 'POST', riskData);
            if (response.ok) {
                this.closeModal('add-risk-modal');
                await this.loadRiskFactors();
                this.showNotification('Riskfaktor tillagd framgångsrikt', 'success');
            } else {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || err.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error adding risk factor:', error);
            this.showNotification('Fel vid tillägg av riskfaktor: ' + (error.message || ''), 'error');
        }
    }

    async handleEditRisk(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const recordId = formData.get('record-id');
        
        // Use the first byrå ID from user's data
        const userByraId = this.userByraIds.length > 0 ? this.userByraIds[0] : null;
        
        if (!userByraId) {
            this.showNotification('Inget byrå ID hittat för användaren. Kontakta administratören.', 'error');
            return;
        }
        
        const riskData = {
            ...this.collectRiskPayload(formData),
            'Byrå ID': userByraId
        };

        try {
            const response = await this.saveRiskFactor(`${window.apiConfig.baseUrl}/api/risk-factors/${recordId}`, 'PUT', riskData);
            if (response.ok) {
                this.closeModal('edit-risk-modal');
                await this.loadRiskFactors();
                this.showNotification('Riskfaktor uppdaterad framgångsrikt', 'success');
            } else {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || err.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error updating risk factor:', error);
            this.showNotification('Fel vid uppdatering av riskfaktor: ' + (error.message || ''), 'error');
        }
    }

    async saveRiskFactor(url, method, payload) {
        let body = this._lastAiAudit ? { ...payload, aiAudit: this._lastAiAudit } : payload;
        let response = await riskAuthFetch(url, {
            method,
            body: JSON.stringify(body)
        });
        if (response.ok) this._lastAiAudit = null;
        if (!response.ok && (body['Riskpoäng'] || body['PT/TF-relevans'])) {
            const err = await response.json().catch(() => ({}));
            const raw = JSON.stringify(err);
            if (/UNKNOWN_FIELD_NAME|Unknown field/i.test(raw)) {
                body = { ...body };
                if (body['Riskpoäng']) {
                    body['Samspelsexempel'] = body['Riskpoäng'];
                    delete body['Riskpoäng'];
                }
                if (/PT\/TF/i.test(raw)) delete body['PT/TF-relevans'];
                response = await riskAuthFetch(url, {
                    method,
                    body: JSON.stringify(body)
                });
            }
        }
        return response;
    }

    async markAsComplete(recordId) {
        const risk = this.risks.find(r => r.id === recordId);
        if (!risk) return;

        const currentStatus = risk.fields['Aktuell'] === true;
        const newStatus = !currentStatus;

        try {
            const response = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risk-factors/${recordId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    'Aktuell': newStatus
                })
            });

            if (response.ok) {
                await this.loadRiskFactors();
                const message = newStatus ? 'Riskfaktor klarmarkerad' : 'Klarmarkering avtagen';
                this.showNotification(message, 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error toggling risk status:', error);
            this.showNotification('Fel vid ändring av klarmarkering', 'error');
        }
    }

    async deleteRisk(recordId) {
        if (!confirm('Är du säker på att du vill ta bort denna riskfaktor?')) {
            return;
        }

        try {
            const response = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risk-factors/${recordId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                await this.loadRiskFactors();
                this.showNotification('Riskfaktor borttagen', 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error deleting risk factor:', error);
            this.showNotification('Fel vid borttagning av riskfaktor', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
}

// Global functions for modal handling
function closeModal(modalId) {
    if (window.riskManager) {
        riskManager.closeModal(modalId);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.riskManager = new RiskFactorsManager();
});
