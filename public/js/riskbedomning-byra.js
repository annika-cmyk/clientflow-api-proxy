// Risk Assessment Management System
class RiskAssessmentManager {
    constructor() {
        this.airtableBaseId = 'appPF8F7VvO5XYB50';
        this.airtableTableName = 'Risker kopplad till tjänster';
        this.airtableApiKey = null; // Will be set from environment
        this.risks = [];
        this.filteredRisks = [];
        
        this.init();
    }

    async init() {
        await this.loadAirtableConfig();
        this.setupEventListeners();
        await this.loadRiskAssessments();
    }

    async loadAirtableConfig() {
        try {
            // Try to get config from environment or use default
                            const response = await fetch('http://localhost:3001/api/airtable/config');
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

    setupEventListeners() {
        // Filter controls
        document.getElementById('apply-filters').addEventListener('click', () => this.applyFilters());
        document.getElementById('clear-filters').addEventListener('click', () => this.clearFilters());

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
            const response = await fetch('http://localhost:3001/api/risk-assessments', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.risks = data.records || [];
                this.filteredRisks = [...this.risks];
                this.renderRiskList();
                this.updateStats();
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
        const isActive = risk.fields['Aktuell'] ? 'active' : 'inactive';
        const approvalDate = risk.fields['Riskbedömning godkänd datum'] || '';
        
        return `
            <div class="risk-item ${riskLevelClass} ${isActive}" data-record-id="${risk.id}">
                <div class="risk-header">
                    <div class="risk-title">
                        <h4>${risk.fields['Task Name'] || 'Namnlös uppgift'}</h4>
                        <span class="risk-type">${risk.fields['TJÄNSTTYP'] || 'Okänd tjänsttyp'}</span>
                    </div>
                    <div class="risk-meta">
                        <span class="risk-level ${riskLevelClass}">
                            ${risk.fields['Riskbedömning'] || 'Medel'}
                        </span>
                        ${approvalDate ? `<span class="approval-date">Godkänd: ${approvalDate}</span>` : ''}
                    </div>
                </div>
                
                <div class="risk-content">
                    <div class="risk-section">
                        <h5><i class="fas fa-exclamation-triangle"></i> Beskrivning av riskfaktor</h5>
                        <div class="risk-description">
                            ${this.formatDescription(risk.fields['Beskrivning av riskfaktor'] || '')}
                        </div>
                    </div>
                    
                    <div class="risk-section">
                        <h5><i class="fas fa-tools"></i> Åtgärd</h5>
                        <div class="risk-action">
                            ${this.formatDescription(risk.fields['Åtgjärd'] || '')}
                        </div>
                    </div>
                </div>
                
                <div class="risk-actions">
                    <button class="btn btn-secondary btn-sm edit-risk" data-record-id="${risk.id}">
                        <i class="fas fa-edit"></i>
                        Redigera
                    </button>
                    <button class="btn btn-success btn-sm mark-complete" data-record-id="${risk.id}">
                        <i class="fas fa-check"></i>
                        Klarmarkera
                    </button>
                    <button class="btn btn-danger btn-sm delete-risk" data-record-id="${risk.id}">
                        <i class="fas fa-trash"></i>
                        Ta bort
                    </button>
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
        const byraFilter = document.getElementById('byra-filter').value;
        const tjansttypFilter = document.getElementById('tjänsttyp-filter').value;
        const riskFilter = document.getElementById('risk-filter').value;
        const statusFilter = document.getElementById('status-filter').value;

        this.filteredRisks = this.risks.filter(risk => {
            const fields = risk.fields;
            
            // Byrå filter
            if (byraFilter && fields['Byrå ID'] !== byraFilter) return false;
            
            // Tjänsttyp filter
            if (tjansttypFilter && fields['TJÄNSTTYP'] !== tjansttypFilter) return false;
            
            // Risk level filter
            if (riskFilter && fields['Riskbedömning'] !== riskFilter) return false;
            
            // Status filter
            if (statusFilter) {
                const isActive = fields['Aktuell'] ? 'checked' : 'unchecked';
                if (isActive !== statusFilter) return false;
            }
            
            return true;
        });

        this.renderRiskList();
        this.updateStats();
    }

    clearFilters() {
        document.getElementById('byra-filter').value = '';
        document.getElementById('tjänsttyp-filter').value = '';
        document.getElementById('risk-filter').value = '';
        document.getElementById('status-filter').value = '';
        
        this.filteredRisks = [...this.risks];
        this.renderRiskList();
        this.updateStats();
    }

    updateStats() {
        const totalCount = this.filteredRisks.length;
        const highRiskCount = this.filteredRisks.filter(risk => 
            risk.fields['Riskbedömning'] === 'Hög'
        ).length;
        const completedCount = this.filteredRisks.filter(risk => 
            risk.fields['Riskbedömning godkänd datum']
        ).length;

        document.getElementById('total-count').textContent = totalCount;
        document.getElementById('high-risk-count').textContent = highRiskCount;
        document.getElementById('completed-count').textContent = completedCount;
    }

    openAddModal() {
        document.getElementById('add-risk-modal').style.display = 'flex';
    }

    async openEditModal(recordId) {
        const risk = this.risks.find(r => r.id === recordId);
        if (!risk) return;

        const fields = risk.fields;
        
        // Populate form fields
        document.getElementById('edit-record-id').value = recordId;
        document.getElementById('edit-task-name').value = fields['Task Name'] || '';
        document.getElementById('edit-byra-id').value = fields['Byrå ID'] || '';
        document.getElementById('edit-tjansttyp').value = fields['TJÄNSTTYP'] || '';
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
            'TJÄNSTTYP': formData.get('tjansttyp'),
            'Beskrivning av riskfaktor': formData.get('risk-description'),
            'Riskbedömning': formData.get('risk-level'),
            'Åtgjärd': formData.get('action'),
            'Aktuell': true
        };

        try {
            const response = await fetch('http://localhost:3001/api/risk-assessments', {
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
            'TJÄNSTTYP': formData.get('tjansttyp'),
            'Beskrivning av riskfaktor': formData.get('risk-description'),
            'Riskbedömning': formData.get('risk-level'),
            'Åtgjärd': formData.get('action')
        };

        try {
            const response = await fetch(`http://localhost:3001/api/risk-assessments/${recordId}`, {
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
        const approvalDate = new Date().toISOString().split('T')[0];
        
        try {
            const response = await fetch(`http://localhost:3001/api/risk-assessments/${recordId}/approve`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'Riskbedömning godkänd datum': approvalDate
                })
            });

            if (response.ok) {
                await this.loadRiskAssessments();
                this.showNotification('Riskbedömning godkänd', 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error marking risk as complete:', error);
            this.showNotification('Fel vid godkännande av riskbedömning', 'error');
        }
    }

    async deleteRisk(recordId) {
        if (!confirm('Är du säker på att du vill ta bort denna riskbedömning?')) {
            return;
        }

        try {
            const response = await fetch(`http://localhost:3001/api/risk-assessments/${recordId}`, {
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
