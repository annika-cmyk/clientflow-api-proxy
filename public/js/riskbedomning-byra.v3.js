// Byråns tjänster – riskbedömning per tjänst
// Hanterar listning, AI-förslag och CRUD av byråns tjänster i tabellen
// "Risker kopplad till tjänster".
class RiskAssessmentManager {
    constructor() {
        this.gristBaseId = null;
        this.gristTableName = 'Risker kopplad till tjänster';
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
        await this.loadRiskAssessments();
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
            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            const response = await fetch(`${window.apiConfig.baseUrl}/api/auth/me`, { method: 'GET', ...opts });
            if (!response.ok) {
                console.warn('User not logged in');
                return;
            }

            const data = await response.json();
            this.userData = data.user;
            this.userByraIds = [];

            if (this.userData.byraId) {
                this.userByraIds = [this.userData.byraId.toString()];
            } else if (this.userData.byraIds && Array.isArray(this.userData.byraIds)) {
                this.userByraIds = this.userData.byraIds.map(id => id.toString());
            } else if (this.userData.byra && typeof this.userData.byra === 'string') {
                const match = this.userData.byra.match(/Byrå\s+(\d+)/);
                if (match) this.userByraIds = [match[1]];
            } else if (this.userData.byra && typeof this.userData.byra === 'object') {
                if (this.userData.byra.id) {
                    this.userByraIds = [this.userData.byra.id.toString()];
                } else if (this.userData.byra.name) {
                    const match = this.userData.byra.name.match(/Byrå\s+(\d+)/);
                    if (match) this.userByraIds = [match[1]];
                }
            }

            if (this.userByraIds.length === 0) {
                console.warn('No byrå IDs found for user:', this.userData.name);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    setupRoleBasedUI() {
        const byraFilterGroup = document.querySelector('.filter-group');
        const byraFilter = document.getElementById('byra-filter');
        if (!byraFilterGroup || !byraFilter) return;

        if (!this.userData) {
            byraFilterGroup.style.display = 'none';
            this.showLoginRequiredMessage();
            return;
        }

        if (this.userData.role !== 'ClientFlowAdmin') {
            byraFilterGroup.style.display = 'none';
            this.showUserAccessInfo();
        } else {
            byraFilterGroup.style.display = 'block';
        }
    }

    showLoginRequiredMessage() {
        const header = document.querySelector('.risk-header-content');
        if (!header) return;
        const existingInfo = header.querySelector('.user-access-info');
        if (existingInfo) existingInfo.remove();

        const infoDiv = document.createElement('div');
        infoDiv.className = 'user-access-info';
        infoDiv.innerHTML = `
            <div class="access-info" style="background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px;">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Inloggning krävs</strong>
                <p>Du måste logga in för att se byråns tjänster.
                <a href="/login.html" style="color: #856404; text-decoration: underline;">Klicka här för att logga in</a></p>
            </div>
        `;
        header.appendChild(infoDiv);
    }

    showUserAccessInfo() {
        const header = document.querySelector('.risk-header-content');
        if (!header || !this.userData) return;
        const existingInfo = header.querySelector('.user-access-info');
        if (existingInfo) existingInfo.remove();

        const infoDiv = document.createElement('div');
        infoDiv.className = 'user-access-info';
        const byraInfo = this.userByraIds.length > 0
            ? `Byrå: ${this.userByraIds.join(', ')}`
            : 'Ingen byrå tilldelad';
        infoDiv.innerHTML = `
            <div class="access-info">
                <span class="user-byra-info">${byraInfo}</span>
                <span class="access-note">Visar endast tjänster för din byrå</span>
            </div>
        `;
        header.appendChild(infoDiv);
    }

    setupEventListeners() {
        document.getElementById('apply-filters')?.addEventListener('click', () => this.applyFilters());
        document.getElementById('clear-filters')?.addEventListener('click', () => this.clearFilters());
        document.getElementById('byra-filter')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('risk-filter')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('status-filter')?.addEventListener('change', () => this.applyFilters());

        document.getElementById('tjanst-form')?.addEventListener('submit', (e) => this.handleSaveTjanst(e));
        document.getElementById('ai-suggest-btn')?.addEventListener('click', () => this.generateAiSuggestion());

        // Lägg till-rad-knappar i modalen
        document.querySelectorAll('.btn-add-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const kind = btn.dataset.add;
                if (kind === 'hot') this.addHotRow();
                else if (kind === 'sarbarhet') this.addSarbarhetRow();
                else if (kind === 'atgard') this.addAtgardRow();
            });
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
                const modal = e.target.closest('.modal');
                if (modal) this.closeModal(modal.id);
            }
        });
    }

    async loadRiskAssessments() {
        const riskList = document.getElementById('risk-list');
        try {
            riskList.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Laddar tjänster...</p>
                </div>
            `;

            const response = await fetch(`${window.apiConfig.baseUrl}/api/risk-assessments`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                this.risks = data.records || [];
                this.populateByraDropdown();
                this.applyFilters();
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error loading risk assessments:', error);
            riskList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Fel vid laddning av tjänster</h3>
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

        const uniqueByraIds = [...new Set(this.risks.map(risk => risk.fields['Byrå ID']).filter(id => id))];
        byraFilter.innerHTML = '<option value="">Alla byråer</option>';
        if (uniqueByraIds.length === 0) return;

        uniqueByraIds.sort((a, b) => a - b).forEach(byraId => {
            const option = document.createElement('option');
            option.value = byraId;
            option.textContent = `Byrå ${byraId}`;
            byraFilter.appendChild(option);
        });
    }

    // ---- Hjälpfunktioner ----
    esc(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    parseJsonField(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    getRiskLevelClass(level) {
        switch (level) {
            case 'Hög': return 'risk-high';
            case 'Medel': return 'risk-medium';
            case 'Låg': return 'risk-low';
            default: return 'risk-medium';
        }
    }

    formatDescription(text) {
        if (!text) return '<em>Ingen beskrivning tillgänglig</em>';
        return this.esc(text).replace(/\n/g, '<br>');
    }

    // ---- Rendering ----
    renderRiskList() {
        const riskList = document.getElementById('risk-list');

        if (this.filteredRisks.length === 0) {
            riskList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <h3>Inga tjänster hittades</h3>
                    <p>Lägg till en tjänst för att börja, eller justera dina filter.</p>
                    <button class="btn btn-primary" onclick="riskManager.openAddModal()">
                        <i class="fas fa-plus"></i>
                        Lägg till tjänst
                    </button>
                </div>
            `;
            return;
        }

        const riskItems = this.filteredRisks.map(risk => this.createRiskItem(risk)).join('');
        riskList.innerHTML = `<div class="risk-items">${riskItems}</div>`;
        this.setupRiskItemEventListeners();
    }

    createRiskItem(risk) {
        const f = risk.fields || {};
        const riskLevel = f['Riskbedömning'] || 'Medel';
        const riskLevelClass = this.getRiskLevelClass(riskLevel);
        const isChecked = f['Aktuell'] === true;
        const taskName = f['Task Name'] || 'Namnlös tjänst';

        const beskrivning = f['Tjänstebeskrivning'] || '';
        const hot = this.parseJsonField(f['Hot']);
        const sarbarheter = this.parseJsonField(f['Sårbarheter']);
        const atgarder = this.parseJsonField(f['Tjänstespecifika åtgärder']);
        // Bakåtkompatibilitet: gamla fritextfält
        const legacyBeskrivning = f['Beskrivning av riskfaktor'] || '';
        const legacyAtgard = f['Åtgjärd'] || '';

        const sections = [];

        if (beskrivning) {
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-file-lines"></i> Tjänstebeskrivning</h5>
                    <p class="risk-content-text">${this.formatDescription(beskrivning)}</p>
                </div>
            `);
        } else if (legacyBeskrivning) {
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-exclamation-triangle"></i> Beskrivning av riskfaktor</h5>
                    <p class="risk-content-text">${this.formatDescription(legacyBeskrivning)}</p>
                </div>
            `);
        }

        if (hot.length) {
            const rows = hot.map(h => {
                const typ = (h.typ || 'PT').toUpperCase() === 'TF' ? 'TF' : 'PT';
                const typClass = typ === 'TF' ? 'tag-tf' : 'tag-pt';
                return `
                    <div class="threat-row">
                        <span class="tag ${typClass}">${typ}</span>
                        <div class="threat-body">
                            <div class="threat-title">${this.esc(h.titel || '')}</div>
                            <div class="threat-desc">${this.esc(h.beskrivning || '')}</div>
                        </div>
                    </div>
                `;
            }).join('');
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-triangle-exclamation"></i> Hot</h5>
                    <div class="threat-list">${rows}</div>
                </div>
            `);
        }

        if (sarbarheter.length) {
            const tagClassMap = { 'Kunder': 'tag-kund', 'Distribution': 'tag-dist', 'Geografi': 'tag-geo', 'Verksamhet': 'tag-verk' };
            const items = sarbarheter.map(s => {
                const kat = s.kategori || 'Verksamhet';
                const tagClass = tagClassMap[kat] || 'tag-verk';
                return `
                    <div class="vuln-item">
                        <div class="tags-row"><span class="tag ${tagClass}">${this.esc(kat)}</span></div>
                        <div class="vuln-item-title">${this.esc(s.titel || '')}</div>
                        <div class="vuln-item-desc">${this.esc(s.beskrivning || '')}</div>
                    </div>
                `;
            }).join('');
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-shield-halved"></i> Sårbarheter</h5>
                    <div class="vuln-grid">${items}</div>
                </div>
            `);
        }

        if (atgarder.length) {
            const items = atgarder.map(a => `
                <div class="action-item">
                    <i class="fas fa-check action-icon"></i>
                    <span class="action-text"><strong>${this.esc(a.titel || '')}</strong>${a.beskrivning ? ' — ' + this.esc(a.beskrivning) : ''}</span>
                </div>
            `).join('');
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-list-check"></i> Tjänstespecifika åtgärder</h5>
                    <div class="action-list">${items}</div>
                </div>
            `);
        } else if (legacyAtgard) {
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-tools"></i> Åtgärd</h5>
                    <p class="risk-content-text">${this.formatDescription(legacyAtgard)}</p>
                </div>
            `);
        }

        if (!sections.length) {
            sections.push(`
                <div class="risk-content-section">
                    <p class="risk-content-text"><em>Inget innehåll ännu. Klicka på "Redigera" och låt AI föreslå ett underlag.</em></p>
                </div>
            `);
        }

        return `
            <div class="risk-item ${riskLevelClass} ${isChecked ? '' : 'inactive'}" data-record-id="${risk.id}">
                <div class="risk-item-header" onclick="riskManager.toggleRiskItem(this)">
                    <div class="risk-item-title">
                        <div class="risk-status-indicator ${isChecked ? 'checked' : 'unchecked'}">
                            ${isChecked ? '✓' : '○'}
                        </div>
                        <div class="risk-item-info">
                            <h4 class="risk-task-name">${this.esc(taskName)}</h4>
                            <div class="risk-meta-info">
                                <span class="risk-level-badge ${riskLevelClass}">${this.esc(riskLevel)}</span>
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
                    ${sections.join('')}

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

    toggleRiskItem(headerElement) {
        const riskItem = headerElement.closest('.risk-item');
        const toggle = riskItem.querySelector('.expand-toggle');
        const icon = toggle.querySelector('i');

        if (riskItem.classList.contains('expanded')) {
            riskItem.classList.remove('expanded');
            toggle.classList.remove('expanded');
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        } else {
            riskItem.classList.add('expanded');
            toggle.classList.add('expanded');
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        }
    }

    setupRiskItemEventListeners() {
        document.querySelectorAll('.edit-risk').forEach(button => {
            button.addEventListener('click', (e) => {
                const recordId = e.target.closest('.edit-risk').dataset.recordId;
                this.openEditModal(recordId);
            });
        });
        document.querySelectorAll('.mark-complete').forEach(button => {
            button.addEventListener('click', (e) => {
                const recordId = e.target.closest('.mark-complete').dataset.recordId;
                this.markAsComplete(recordId);
            });
        });
        document.querySelectorAll('.delete-risk').forEach(button => {
            button.addEventListener('click', (e) => {
                const recordId = e.target.closest('.delete-risk').dataset.recordId;
                this.deleteRisk(recordId);
            });
        });
    }

    applyFilters() {
        if (!this.risks || this.risks.length === 0) {
            this.filteredRisks = [];
            this.renderRiskList();
            this.updateStats();
            return;
        }

        if (!this.userData) {
            this.filteredRisks = [];
            this.renderRiskList();
            this.updateStats();
            return;
        }

        const byraFilter = document.getElementById('byra-filter')?.value || '';
        const riskFilter = document.getElementById('risk-filter')?.value || '';
        const statusFilter = document.getElementById('status-filter')?.value || '';

        this.filteredRisks = this.risks.filter(risk => {
            const fields = risk.fields;
            const riskByraId = fields['Byrå ID']?.toString();

            if (this.userData && this.userData.role !== 'ClientFlowAdmin') {
                if (this.userByraIds.length === 0) return false;
                if (!this.userByraIds.includes(riskByraId)) return false;
            } else {
                if (byraFilter && riskByraId !== byraFilter) return false;
            }

            if (riskFilter && fields['Riskbedömning'] !== riskFilter) return false;

            if (statusFilter) {
                const isChecked = fields['Aktuell'] === true;
                const status = isChecked ? 'checked' : 'unchecked';
                if (status !== statusFilter) return false;
            }

            return true;
        });

        this.renderRiskList();
        this.updateStats();
    }

    clearFilters() {
        if (this.userData && this.userData.role === 'ClientFlowAdmin') {
            const byraFilter = document.getElementById('byra-filter');
            if (byraFilter) byraFilter.value = '';
        }
        const riskFilter = document.getElementById('risk-filter');
        const statusFilter = document.getElementById('status-filter');
        if (riskFilter) riskFilter.value = '';
        if (statusFilter) statusFilter.value = '';
        this.applyFilters();
    }

    updateStats() {
        const highRiskCount = this.filteredRisks.filter(risk => risk.fields['Riskbedömning'] === 'Hög').length;
        const completedCount = this.filteredRisks.filter(risk => risk.fields['Aktuell'] === true).length;
        const highEl = document.getElementById('high-risk-count');
        const compEl = document.getElementById('completed-count');
        if (highEl) highEl.textContent = highRiskCount;
        if (compEl) compEl.textContent = completedCount;
    }

    // ---- Modal: dynamiska rader ----
    addHotRow(data = {}) {
        const list = document.getElementById('hot-list');
        if (!list) return;
        const typ = ((data.typ ?? data.type) || '').toString().toUpperCase() === 'TF' ? 'TF' : 'PT';
        const titel = data.titel ?? data.title ?? '';
        const beskrivning = data.beskrivning ?? data.description ?? '';
        const kalla = data.kalla ?? data.källa ?? data.source ?? '';
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-hot';
        row.innerHTML = `
            <select class="dyn-typ">
                <option value="PT" ${typ === 'TF' ? '' : 'selected'}>PT</option>
                <option value="TF" ${typ === 'TF' ? 'selected' : ''}>TF</option>
            </select>
            <div class="dyn-fields">
                <input type="text" class="dyn-titel" placeholder="Hotets titel" value="${this.esc(titel)}">
                <textarea class="dyn-besk" rows="2" placeholder="Tillvägagångssätt">${this.esc(beskrivning)}</textarea>
                <div class="dyn-kalla-row">
                    <i class="fas fa-link dyn-kalla-icon" aria-hidden="true"></i>
                    <input type="text" class="dyn-kalla" placeholder="Källa, t.ex. Finanspolisen eller FATF" value="${this.esc(kalla)}">
                    <a class="dyn-kalla-link" target="_blank" rel="noopener" style="display:none;">Öppna källa ↗</a>
                </div>
            </div>
            <button type="button" class="dyn-remove" title="Ta bort"><i class="fas fa-times"></i></button>
        `;
        row.querySelector('.dyn-remove').addEventListener('click', () => row.remove());
        const kallaInput = row.querySelector('.dyn-kalla');
        const kallaLink = row.querySelector('.dyn-kalla-link');
        const syncKallaLink = () => {
            const val = kallaInput.value.trim();
            if (this.isKallaUrl(val)) {
                kallaLink.href = val;
                kallaLink.style.display = '';
            } else {
                kallaLink.removeAttribute('href');
                kallaLink.style.display = 'none';
            }
        };
        kallaInput.addEventListener('input', syncKallaLink);
        syncKallaLink();
        list.appendChild(row);
    }

    // Källa räknas som länk endast om värdet börjar med http(s).
    isKallaUrl(value) {
        return /^https?:\/\//i.test((value || '').toString().trim());
    }

    addSarbarhetRow(data = {}) {
        const list = document.getElementById('sarbarhet-list');
        if (!list) return;
        const kategorier = ['Kunder', 'Distribution', 'Geografi', 'Verksamhet'];
        const kategori = data.kategori ?? data.category ?? '';
        const titel = data.titel ?? data.title ?? '';
        const beskrivning = data.beskrivning ?? data.description ?? '';
        const opts = kategorier.map(k => `<option value="${k}" ${kategori === k ? 'selected' : ''}>${k}</option>`).join('');
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-sarbarhet';
        row.innerHTML = `
            <select class="dyn-kategori">${opts}</select>
            <div class="dyn-fields">
                <input type="text" class="dyn-titel" placeholder="Sårbarhetens titel" value="${this.esc(titel)}">
                <textarea class="dyn-besk" rows="2" placeholder="Beskrivning">${this.esc(beskrivning)}</textarea>
            </div>
            <button type="button" class="dyn-remove" title="Ta bort"><i class="fas fa-times"></i></button>
        `;
        row.querySelector('.dyn-remove').addEventListener('click', () => row.remove());
        list.appendChild(row);
    }

    addAtgardRow(data = {}) {
        const list = document.getElementById('atgard-list');
        if (!list) return;
        const titel = data.titel ?? data.title ?? '';
        const beskrivning = data.beskrivning ?? data.description ?? '';
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-atgard';
        row.innerHTML = `
            <div class="dyn-fields">
                <input type="text" class="dyn-titel" placeholder="Åtgärdens titel" value="${this.esc(titel)}">
                <textarea class="dyn-besk" rows="2" placeholder="Vad kontrolleras och dokumenteras?">${this.esc(beskrivning)}</textarea>
            </div>
            <button type="button" class="dyn-remove" title="Ta bort"><i class="fas fa-times"></i></button>
        `;
        row.querySelector('.dyn-remove').addEventListener('click', () => row.remove());
        list.appendChild(row);
    }

    collectHot() {
        return [...document.querySelectorAll('#hot-list .dyn-row')].map(row => ({
            typ: row.querySelector('.dyn-typ')?.value || 'PT',
            titel: row.querySelector('.dyn-titel')?.value.trim() || '',
            beskrivning: row.querySelector('.dyn-besk')?.value.trim() || '',
            kalla: row.querySelector('.dyn-kalla')?.value.trim() || ''
        })).filter(h => h.titel || h.beskrivning || h.kalla);
    }

    collectSarbarhet() {
        return [...document.querySelectorAll('#sarbarhet-list .dyn-row')].map(row => ({
            kategori: row.querySelector('.dyn-kategori')?.value || 'Verksamhet',
            titel: row.querySelector('.dyn-titel')?.value.trim() || '',
            beskrivning: row.querySelector('.dyn-besk')?.value.trim() || ''
        })).filter(s => s.titel || s.beskrivning);
    }

    collectAtgard() {
        return [...document.querySelectorAll('#atgard-list .dyn-row')].map(row => ({
            titel: row.querySelector('.dyn-titel')?.value.trim() || '',
            beskrivning: row.querySelector('.dyn-besk')?.value.trim() || ''
        })).filter(a => a.titel || a.beskrivning);
    }

    resetModal() {
        document.getElementById('tjanst-form')?.reset();
        document.getElementById('tjanst-record-id').value = '';
        ['hot-list', 'sarbarhet-list', 'atgard-list'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
    }

    fillModal(risk) {
        const f = risk.fields || {};
        document.getElementById('tjanst-record-id').value = risk.id;
        document.getElementById('tjanst-name').value = f['Task Name'] || '';
        document.getElementById('tjanst-risk-level').value = f['Riskbedömning'] || '';
        document.getElementById('tjanst-beskrivning').value = f['Tjänstebeskrivning'] || f['Beskrivning av riskfaktor'] || '';

        this.parseJsonField(f['Hot']).forEach(h => this.addHotRow(h));
        this.parseJsonField(f['Sårbarheter']).forEach(s => this.addSarbarhetRow(s));
        this.parseJsonField(f['Tjänstespecifika åtgärder']).forEach(a => this.addAtgardRow(a));
    }

    openAddModal() {
        this.resetModal();
        document.getElementById('tjanst-modal-title').textContent = 'Lägg till tjänst';
        document.getElementById('tjanst-modal').style.display = 'flex';
    }

    openEditModal(recordId) {
        const risk = this.risks.find(r => r.id === recordId);
        if (!risk) return;
        this.resetModal();
        document.getElementById('tjanst-modal-title').textContent = 'Redigera tjänst';
        this.fillModal(risk);
        document.getElementById('tjanst-modal').style.display = 'flex';
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
        if (modalId === 'tjanst-modal') this.resetModal();
    }

    // ---- AI-förslag ----
    async generateAiSuggestion() {
        const namn = document.getElementById('tjanst-name').value.trim();
        if (!namn) {
            this.showNotification('Ange tjänstens namn först.', 'error');
            document.getElementById('tjanst-name').focus();
            return;
        }

        const btn = document.getElementById('ai-suggest-btn');
        const label = btn.querySelector('.ai-btn-label');
        const originalLabel = label.textContent;
        btn.disabled = true;
        btn.classList.add('loading');
        label.textContent = 'Genererar…';

        try {
            const befintligt = {
                tjanstebeskrivning: document.getElementById('tjanst-beskrivning').value.trim(),
                riskniva: document.getElementById('tjanst-risk-level').value
            };

            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            const response = await fetch(`${window.apiConfig.baseUrl}/api/ai-byra-tjanst`, {
                method: 'POST',
                ...opts,
                headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
                body: JSON.stringify({ namn, befintligt })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.tjanstebeskrivning) document.getElementById('tjanst-beskrivning').value = data.tjanstebeskrivning;
            if (data.riskniva) document.getElementById('tjanst-risk-level').value = data.riskniva;

            // Ersätt befintliga rader med AI-förslag
            ['hot-list', 'sarbarhet-list', 'atgard-list'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
            });
            (data.hot || []).forEach(h => this.addHotRow(h));
            (data.sarbarheter || []).forEach(s => this.addSarbarhetRow(s));
            (data.atgarder || []).forEach(a => this.addAtgardRow(a));

            this.showNotification('AI-förslag inlagt. Granska och justera innan du sparar.', 'success');
        } catch (error) {
            console.error('AI-förslag fel:', error);
            this.showNotification('Kunde inte generera AI-förslag: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
            label.textContent = originalLabel;
        }
    }

    // ---- Spara (skapa/uppdatera) ----
    buildPayload() {
        return {
            'Task Name': document.getElementById('tjanst-name').value.trim(),
            'Riskbedömning': document.getElementById('tjanst-risk-level').value || '',
            'Tjänstebeskrivning': document.getElementById('tjanst-beskrivning').value.trim(),
            'Hot': JSON.stringify(this.collectHot()),
            'Sårbarheter': JSON.stringify(this.collectSarbarhet()),
            'Tjänstespecifika åtgärder': JSON.stringify(this.collectAtgard())
        };
    }

    async handleSaveTjanst(event) {
        event.preventDefault();

        const recordId = document.getElementById('tjanst-record-id').value;
        const namn = document.getElementById('tjanst-name').value.trim();
        if (!namn) {
            this.showNotification('Tjänstens namn är obligatoriskt.', 'error');
            return;
        }

        const payload = this.buildPayload();

        // Vid skapande: koppla byrå-ID
        if (!recordId) {
            const userByraId = this.userByraIds.length > 0 ? this.userByraIds[0] : null;
            if (!userByraId && this.userData?.role !== 'ClientFlowAdmin') {
                this.showNotification('Inget byrå-ID hittat för användaren. Kontakta administratören.', 'error');
                return;
            }
            if (userByraId) payload['Byrå ID'] = userByraId;
            payload['Aktuell'] = true;
        }

        try {
            const url = recordId
                ? `${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`
                : `${window.apiConfig.baseUrl}/api/risk-assessments`;
            const method = recordId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                this.closeModal('tjanst-modal');
                await this.loadRiskAssessments();
                this.showNotification(recordId ? 'Tjänsten uppdaterad.' : 'Tjänsten tillagd.', 'success');
            } else {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || err.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error saving tjänst:', error);
            this.showNotification('Fel vid sparande: ' + error.message, 'error');
        }
    }

    async markAsComplete(recordId) {
        const risk = this.risks.find(r => r.id === recordId);
        if (!risk) return;
        const newStatus = !(risk.fields['Aktuell'] === true);

        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 'Aktuell': newStatus })
            });
            if (response.ok) {
                await this.loadRiskAssessments();
                this.showNotification(newStatus ? 'Tjänsten klarmarkerad.' : 'Klarmarkering avtagen.', 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error toggling status:', error);
            this.showNotification('Fel vid ändring av status.', 'error');
        }
    }

    async deleteRisk(recordId) {
        if (!confirm('Är du säker på att du vill ta bort denna tjänst?')) return;

        try {
            const response = await fetch(`${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await this.loadRiskAssessments();
                this.showNotification('Tjänsten borttagen.', 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error deleting tjänst:', error);
            this.showNotification('Fel vid borttagning.', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${this.esc(message)}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            if (notification.parentElement) notification.remove();
        }, 5000);
    }
}

// Global funktion för modal-stängning (bakåtkompatibel med inline onclick)
function closeModal(modalId) {
    if (window.riskManager) riskManager.closeModal(modalId);
}

document.addEventListener('DOMContentLoaded', () => {
    console.info('[ClientFlow] riskbedomning-byra v3 laddad – formuläret visar titel + beskrivning för hot/sårbarheter/åtgärder.');
    window.riskManager = new RiskAssessmentManager();
});
