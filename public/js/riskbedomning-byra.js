// Risk Assessment Management System
class RiskAssessmentManager {
    constructor() {
        this.airtableBaseId = 'appPF8F7VvO5XYB50';
        this.airtableTableName = 'Risker kopplad till tjänster';
        this.airtableApiKey = null; // Will be set from environment
        this.risks = [];
        this.filteredRisks = [];
        this.userData = null;
        this.userByraIds = [];
        
        this.init();
    }

    async init() {
        await this.loadAirtableConfig();
        await this.loadUserData();
        this.setupEventListeners();
        this.setupRoleBasedUI();
        await this.loadRiskAssessments();
        
        // Apply initial filtering based on user role
        this.applyFilters();
    }

    async loadAirtableConfig() {
        try {
            // Try to get config from environment or use default
                            const response = await fetch(`${window.apiConfig.baseUrl}/api/airtable/config`);
            if (response.ok) {
                const config = await response.json();
                this.airtableApiKey = config.apiKey;
            } else {
                console.warn('Could not load Airtable config, using fallback');
                // Fallback to environment variable or default
                this.airtableApiKey = null;
            }
        } catch (error) {
            console.error('Error loading Airtable config:', error);
        }
    }

    async loadUserData() {
        try {
            // Check if user is logged in by looking for auth token
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
                
                console.log('Raw user data:', this.userData);
                
                // Extract byrå IDs from various possible fields
                this.userByraIds = [];
                
                // Method 1: Check byraId field (prioritized - contains actual byrå ID)
                if (this.userData.byraId) {
                    this.userByraIds = [this.userData.byraId.toString()];
                    console.log('Found byrå ID from byraId field:', this.userByraIds);
                }
                // Method 2: Check byraIds array (fallback - contains Airtable record IDs)
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
                    <p>Du måste logga in för att se riskbedömningar. 
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
                    <span class="access-note">Visar endast risker för din byrå</span>
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

    async loadRiskAssessments() {
        const riskList = document.getElementById('risk-list');
        
        try {
            riskList.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Laddar riskbedömningar...</p>
                </div>
            `;

            // Load from Airtable via our API
            const response = await fetch(`${window.apiConfig.baseUrl}/api/risk-assessments`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
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
            console.error('Error loading risk assessments:', error);
            riskList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Fel vid laddning av riskbedömningar</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="riskManager.loadRiskAssessments()">
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
                    <h3>Inga riskbedömningar hittades</h3>
                    <p>Prova att justera dina filter eller lägg till en ny riskbedömning.</p>
                    <button class="btn btn-primary" onclick="this.openAddModal()">
                        <i class="fas fa-plus"></i>
                        Lägg till riskbedömning
                    </button>
                </div>
            `;
            return;
        }

        const riskItems = this.filteredRisks.map(risk => this.createRiskItem(risk)).join('');
        
        riskList.innerHTML = `
            <div class="risk-items">
                ${riskItems}
            </div>
        `;

        // Add event listeners to buttons
        this.setupRiskItemEventListeners();
    }

    createRiskItem(risk) {
        const riskLevelClass = this.getRiskLevelClass(risk.fields['Riskbedömning'] || 'Medel');
        const isChecked = risk.fields['Aktuell'] === true;
        const taskName = risk.fields['Task Name'] || 'Namnlös uppgift';
        const riskLevel = risk.fields['Riskbedömning'] || 'Medel';
        const approvalDate = risk.fields['Riskbedömning godkänd datum'] || '';
        
        return `
            <div class="risk-item ${riskLevelClass}" data-record-id="${risk.id}">
                <div class="risk-item-header" onclick="riskManager.toggleRiskItem(this)">
                    <div class="risk-item-title">
                        <div class="risk-status-indicator ${isChecked ? 'checked' : 'unchecked'}">
                            ${isChecked ? '✓' : '○'}
                        </div>
                        <div class="risk-item-info">
                            <h4 class="risk-task-name">${taskName}</h4>
                            <div class="risk-meta-info">
                                <span class="risk-level-badge ${riskLevelClass}">${riskLevel}</span>
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
                        <h5><i class="fas fa-exclamation-triangle"></i> Beskrivning av riskfaktor</h5>
                        <p class="risk-content-text">
                            ${this.formatDescription(risk.fields['Beskrivning av riskfaktor'] || '')}
                        </p>
                    </div>
                    
                    <div class="risk-content-section">
                        <h5><i class="fas fa-tools"></i> Åtgärd</h5>
                        <p class="risk-content-text">
                            ${this.formatDescription(risk.fields['Åtgjärd'] || '')}
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

    formatDescription(text) {
        if (!text) return '<em>Ingen beskrivning tillgänglig</em>';
        
        // Convert line breaks to HTML
        return text.replace(/\n/g, '<br>');
    }

    getRiskLevelClass(level) {
        switch (level) {
            case 'Hög': return 'risk-high';
            case 'Medel': return 'risk-medium';
            case 'Låg': return 'risk-low';
            default: return 'risk-medium';
        }
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
            
            console.log('Checking risk:', fields['Task Name'], 'with byrå ID:', riskByraId);
            
            // Role-based byrå filtering
            if (this.userData && this.userData.role !== 'ClientFlowAdmin') {
                // For non-admin users, only show risks from their byrå
                if (this.userByraIds.length === 0) {
                    console.log('No byrå IDs found for user, filtering out all risks');
                    return false;
                }
                
                if (!this.userByraIds.includes(riskByraId)) {
                    // console.log('Filtered out risk - not in user\'s byrå (user has:', this.userByraIds, ', risk has:', riskByraId, ')');
                    return false;
                }
                // console.log('Risk included - matches user\'s byrå');
            } else {
                // For admin users, apply manual byrå filter if selected
                if (byraFilter && riskByraId !== byraFilter) {
                    // console.log('Filtered out risk - doesn\'t match selected byrå');
                    return false;
                }
                // console.log('Risk included - admin user or matches selected byrå');
            }
            
            // Risk level filter
            if (riskFilter && fields['Riskbedömning'] !== riskFilter) {
                // console.log('Filtered out risk - doesn\'t match risk level filter');
                return false;
            }
            
            // Status filter
            if (statusFilter) {
                const isChecked = fields['Aktuell'] === true;
                const status = isChecked ? 'checked' : 'unchecked';
                if (status !== statusFilter) {
                    // console.log('Filtered out risk - doesn\'t match status filter');
                    return false;
                }
            }
            
            // console.log('Risk included - passed all filters');
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
        const totalCount = this.filteredRisks.length;
        const highRiskCount = this.filteredRisks.filter(risk => 
            risk.fields['Riskbedömning'] === 'Hög'
        ).length;
        const completedCount = this.filteredRisks.filter(risk => 
            risk.fields['Aktuell'] === true
        ).length;

        document.getElementById('total-count').textContent = totalCount;
        document.getElementById('high-risk-count').textContent = highRiskCount;
        document.getElementById('completed-count').textContent = completedCount;
    }

    openAddModal() {
        document.getElementById('add-risk-modal').style.display = 'flex';
    }

    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    async openEditModal(recordId) {
        const risk = this.risks.find(r => r.id === recordId);
        if (!risk) return;

        const fields = risk.fields;
        
        // Populate form fields
        document.getElementById('edit-record-id').value = recordId;
        document.getElementById('edit-task-name').value = fields['Task Name'] || '';
        document.getElementById('edit-byra-id').value = fields['Byrå ID'] || '';
        
        document.getElementById('edit-risk-description').value = fields['Beskrivning av riskfaktor'] || '';
        document.getElementById('edit-risk-level').value = fields['Riskbedömning'] || '';
        document.getElementById('edit-action').value = fields['Åtgjärd'] || '';

        document.getElementById('edit-risk-modal').style.display = 'flex';
    }

    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        
        // Clear forms
        if (modalId === 'add-risk-modal') {
            document.getElementById('add-risk-form').reset();
        }
    }

    async handleAddRisk(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const riskData = {
            'Task Name': formData.get('task-name'),
            'Byrå ID': formData.get('byra-id'),
            'Beskrivning av riskfaktor': formData.get('risk-description'),
            'Riskbedömning': formData.get('risk-level'),
            'Åtgjärd': formData.get('action'),
            'Aktuell': true
        };

        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/risk-assessments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(riskData)
            });

            if (response.ok) {
                this.closeModal('add-risk-modal');
                await this.loadRiskAssessments();
                this.showNotification('Riskbedömning tillagd framgångsrikt', 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error adding risk assessment:', error);
            this.showNotification('Fel vid tillägg av riskbedömning', 'error');
        }
    }

    async handleEditRisk(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const recordId = formData.get('record-id');
        const riskData = {
            'Task Name': formData.get('task-name'),
            'Byrå ID': formData.get('byra-id'),
            'Beskrivning av riskfaktor': formData.get('risk-description'),
            'Riskbedömning': formData.get('risk-level'),
            'Åtgjärd': formData.get('action')
        };

        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(riskData)
            });

            if (response.ok) {
                this.closeModal('edit-risk-modal');
                await this.loadRiskAssessments();
                this.showNotification('Riskbedömning uppdaterad framgångsrikt', 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error updating risk assessment:', error);
            this.showNotification('Fel vid uppdatering av riskbedömning', 'error');
        }
    }

    async markAsComplete(recordId) {
        const risk = this.risks.find(r => r.id === recordId);
        if (!risk) return;

        const currentStatus = risk.fields['Aktuell'] === true;
        const newStatus = !currentStatus;
        
        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'Aktuell': newStatus
                })
            });

            if (response.ok) {
                await this.loadRiskAssessments();
                const message = newStatus ? 'Riskbedömning klarmarkerad' : 'Klarmarkering avtagen';
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
        if (!confirm('Är du säker på att du vill ta bort denna riskbedömning?')) {
            return;
        }

        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                await this.loadRiskAssessments();
                this.showNotification('Riskbedömning borttagen', 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error deleting risk assessment:', error);
            this.showNotification('Fel vid borttagning av riskbedömning', 'error');
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
    window.riskManager = new RiskAssessmentManager();
});
