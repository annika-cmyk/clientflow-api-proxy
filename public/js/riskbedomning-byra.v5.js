// Byråns tjänster – riskbedömning per tjänst
// Hanterar listning, AI-förslag och CRUD av byråns tjänster i tabellen
// "Risker kopplad till tjänster".
function riskAuthFetch(url, init) {
    const base = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions())
        || { credentials: 'include', headers: {} };
    const headers = Object.assign({ 'Content-Type': 'application/json' }, base.headers || {}, (init && init.headers) || {});
    return fetch(url, Object.assign({}, base, init || {}, { credentials: 'include', headers }));
}

class RiskAssessmentManager {
    constructor() {
        this.gristBaseId = null;
        this.gristTableName = 'Risker kopplad till tjänster';
        this.datasourceConfig = null;
        this.risks = [];
        this.filteredRisks = [];
        this.userData = null;
        this.userByraIds = [];
        this.byraProfil = null;

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
        document.getElementById('tjanst-save-draft-btn')?.addEventListener('click', (e) => this.handleSaveTjanst(e, { asDraft: true }));
        document.getElementById('ai-suggest-btn')?.addEventListener('click', () => this.generateAiSuggestion());
        ['tjanst-sannolikhet', 'tjanst-konsekvens', 'tjanst-sannolikhet-efter', 'tjanst-konsekvens-efter'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', () => this.updateRiskBadges());
        });

        // Lägg till-rad-knappar i modalen
        document.querySelectorAll('.btn-add-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const kind = btn.dataset.add;
                this.setTjanstTab(kind);
                if (kind === 'hot') this.addHotRow({}, { expand: true });
                else if (kind === 'sarbarhet') this.addSarbarhetRow({}, { expand: true });
                else if (kind === 'atgard') this.addAtgardRow({}, { expand: true });
            });
        });

        document.querySelectorAll('.tjanst-tab').forEach((tab) => {
            tab.addEventListener('click', () => this.setTjanstTab(tab.getAttribute('data-tjanst-tab')));
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

            const response = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risk-assessments`, {
                method: 'GET'
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
        return (window.RiskSkala && RiskSkala.riskItemClass(level)) || 'risk-normal';
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
        const scored = (window.RiskSkala && RiskSkala.readTjanstRisk(f)) || {};
        const riskLevel = scored.level || (window.RiskSkala && RiskSkala.riskLabelSv(f['Riskbedömning'])) || f['Riskbedömning'] || 'Normal';
        const riskLevelClass = this.getRiskLevelClass(riskLevel);
        const residualLevel = scored.residualLevel || '';
        const residualClass = residualLevel ? this.getRiskLevelClass(residualLevel) : '';
        const badges = (window.RiskSkala && RiskSkala.listBadgeLabels(scored)) || {
            inneboende: scored.badge || riskLevel,
            residual: residualLevel ? ('Residualrisk: ' + (scored.residualBadge || residualLevel)) : '',
            inneboendeTitle: '',
            residualTitle: ''
        };
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
                    <h5><i class="fas fa-file-lines"></i> Tjänstebeskrivning och inneboende risk</h5>
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
                const typ = (window.RiskSkala && RiskSkala.normalizePtTf(h.typ)) || ((h.typ || 'PT').toUpperCase() === 'TF' ? 'TF' : 'PT');
                const typClass = (window.TjanstTfTackning ? TjanstTfTackning.isTfHot(h) : typ === 'TF') ? 'tag-tf' : 'tag-pt';
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
                                <span class="risk-level-badge ${riskLevelClass}" title="${this.esc(badges.inneboendeTitle)}">${this.esc(badges.inneboende)}</span>
                                ${badges.residual ? `<span class="risk-level-badge ${residualClass}" title="${this.esc(badges.residualTitle)}">${this.esc(badges.residual)}</span>` : ''}
                                ${(window.TjanstTfTackning && TjanstTfTackning.tjanstSaknarTfTackning(f)) ? '<span class="tf-missing-pill"><span class="tf-missing-dot" aria-hidden="true"></span>TF saknas</span>' : ''}
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

            const scoredLevel = window.RiskSkala
                ? RiskSkala.readTjanstRisk(fields).level
                : fields['Riskbedömning'];
            if (riskFilter && !(window.RiskSkala ? RiskSkala.sameLevel(scoredLevel, riskFilter) : scoredLevel === riskFilter)) return false;

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
        const highRiskCount = this.filteredRisks.filter(risk => {
            const level = window.RiskSkala
                ? RiskSkala.readTjanstRisk(risk.fields).level
                : risk.fields['Riskbedömning'];
            return window.RiskSkala ? RiskSkala.isHighOrAbove(level) : level === 'Hög';
        }).length;
        const completedCount = this.filteredRisks.filter(risk => risk.fields['Aktuell'] === true).length;
        const highEl = document.getElementById('high-risk-count');
        const compEl = document.getElementById('completed-count');
        if (highEl) highEl.textContent = highRiskCount;
        if (compEl) compEl.textContent = completedCount;
    }

    // ---- Modal: dynamiska rader (hopfällbara kort) ----
    tjanstAiHosts() {
        return {
            oversikt: document.getElementById('tjanst-ai-oversikt'),
            hot: document.getElementById('tjanst-ai-hot'),
            sarbarhet: document.getElementById('tjanst-ai-sarbarhet'),
            atgard: document.getElementById('tjanst-ai-atgard')
        };
    }

    clearTjanstAiSummary() {
        const bar = document.getElementById('tjanst-ai-summary');
        if (bar) {
            bar.hidden = true;
            bar.innerHTML = '';
        }
        document.querySelectorAll('.tjanst-tab-ai').forEach((el) => { el.hidden = true; });
    }

    updateTjanstAiSummary(counts) {
        const labels = { oversikt: 'Översikt', hot: 'Hot', sarbarhet: 'Sårbarheter', atgard: 'Åtgärder' };
        const present = Object.keys(labels).filter((key) => (counts && counts[key]) > 0);
        document.querySelectorAll('.tjanst-tab-ai').forEach((el) => {
            const key = el.getAttribute('data-ai-for');
            const n = (counts && counts[key]) || 0;
            el.hidden = n < 1;
            el.textContent = n > 1 ? `AI ${n}` : 'AI';
        });
        const bar = document.getElementById('tjanst-ai-summary');
        if (!bar) return;
        if (!present.length) {
            bar.hidden = true;
            bar.innerHTML = '';
            return;
        }
        bar.hidden = false;
        bar.innerHTML = `
            <p>AI har förslag på ${present.map((key) => `<a href="#" data-goto-tab="${key}">${labels[key]}</a>`).join(', ')}.</p>
            <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss-all-tabs>Avfärda alla</button>
        `;
        bar.onclick = (ev) => {
            const link = ev.target.closest('[data-goto-tab]');
            if (link) {
                ev.preventDefault();
                this.setTjanstTab(link.getAttribute('data-goto-tab'));
                return;
            }
            if (ev.target.closest('[data-ai-dismiss-all-tabs]')) {
                if (window.AiFaltGranskning) AiFaltGranskning.hideReviewHosts(this.tjanstAiHosts());
                this.clearInlineAi();
                this.clearTjanstAiSummary();
            }
        };
    }

    setTjanstTab(tabId) {
        const id = tabId || 'oversikt';
        document.querySelectorAll('.tjanst-tab').forEach((tab) => {
            const on = tab.getAttribute('data-tjanst-tab') === id;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('.tjanst-panel').forEach((panel) => {
            const on = panel.getAttribute('data-tjanst-panel') === id;
            panel.classList.toggle('is-active', on);
            panel.hidden = !on;
        });
    }

    updateTjanstLists() {
        const counts = {
            hot: document.querySelectorAll('#hot-list .dyn-row').length,
            sarbarhet: document.querySelectorAll('#sarbarhet-list .dyn-row').length,
            atgard: document.querySelectorAll('#atgard-list .dyn-row').length
        };
        Object.entries(counts).forEach(([key, n]) => {
            document.querySelectorAll(`[data-count-for="${key}"]`).forEach((el) => { el.textContent = String(n); });
            const empty = document.getElementById(`${key}-empty`);
            if (empty) empty.hidden = n > 0;
        });
        this.updateTfBanner();
    }

    updateTfBanner() {
        const Tf = window.TjanstTfTackning;
        const hasTf = !!(Tf && Tf.hasTfHot(this.collectHot()));
        const banner = document.getElementById('tjanst-tf-banner');
        const textEl = document.getElementById('tjanst-tf-banner-text');
        const overview = document.getElementById('tjanst-tf-oversikt-flag');
        if (textEl && Tf) textEl.textContent = Tf.TF_BANNER_TEXT;
        if (banner) banner.hidden = hasTf;
        if (overview) {
            overview.hidden = hasTf;
            overview.textContent = hasTf ? '' : ((Tf && Tf.TF_BANNER_TEXT) || '');
        }
    }

    bindDynCard(row, { expand = false, hasSource = false } = {}) {
        row.classList.toggle('is-collapsed', !expand);
        row.querySelector('.dyn-remove')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            row.remove();
            this.updateTjanstLists();
        });
        row.querySelector('.dyn-toggle')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            row.classList.toggle('is-collapsed');
        });
        if (expand) {
            setTimeout(() => row.querySelector('.dyn-titel')?.focus(), 0);
        }
        if (!hasSource) return;
        const kallaInput = row.querySelector('.dyn-kalla');
        const kallaLink = row.querySelector('.dyn-kalla-link');
        if (!kallaInput || !kallaLink) return;
        const syncKallaLink = () => {
            const val = kallaInput.value.trim();
            const resolved = (typeof AmlKalla !== 'undefined' && AmlKalla.resolveKalla)
                ? AmlKalla.resolveKalla(val)
                : { url: this.isKallaUrl(val) ? val : '', host: '', label: val, page: '', path: '' };
            const display = (typeof AmlKalla !== 'undefined' && AmlKalla.formatKallaDisplay)
                ? AmlKalla.formatKallaDisplay(resolved)
                : { linkText: resolved.host || resolved.label || 'Öppna webbplats', url: resolved.url, title: resolved.url };
            if (display.url) {
                kallaLink.href = display.url;
                kallaLink.hidden = false;
                const page = resolved.page ? `<span class="dyn-kalla-page">${this.esc(resolved.page)}</span>` : '';
                const path = resolved.path ? `<span class="dyn-kalla-path">${this.esc(resolved.path)}</span>` : '';
                kallaLink.innerHTML = `<span class="dyn-kalla-name">${this.esc(resolved.label || display.linkText)}</span>${page}${path}`;
                kallaLink.title = display.title || display.url;
                row.classList.add('has-kalla-link');
            } else {
                kallaLink.removeAttribute('href');
                kallaLink.removeAttribute('title');
                kallaLink.hidden = true;
                kallaLink.innerHTML = '';
                row.classList.remove('has-kalla-link');
            }
        };
        kallaInput.addEventListener('input', syncKallaLink);
        syncKallaLink();
    }

    addHotRow(data = {}, opts = {}) {
        const list = document.getElementById('hot-list');
        if (!list) return;
        const rawTyp = (window.RiskSkala && RiskSkala.normalizePtTf(data.typ ?? data.type)) || 'PT';
        const typ = rawTyp === 'TF' || rawTyp === 'Båda' ? rawTyp : 'PT';
        const titel = data.titel ?? data.title ?? '';
        const beskrivning = data.beskrivning ?? data.description ?? '';
        const kalla = data.kalla ?? data.källa ?? data.source ?? '';
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-hot dyn-card' + (opts.aiAdd ? ' is-ai-add' : '');
        row.innerHTML = `
            <div class="dyn-row-header">
                <span class="dyn-drag" title="Dra för att sortera" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
                ${opts.aiAdd ? '<span class="dyn-ai-badge">Ny</span>' : ''}
                <select class="dyn-typ" aria-label="Hottyp">
                    <option value="PT" ${typ === 'PT' ? 'selected' : ''}>PT</option>
                    <option value="TF" ${typ === 'TF' ? 'selected' : ''}>TF</option>
                    <option value="Båda" ${typ === 'Båda' ? 'selected' : ''}>Båda</option>
                </select>
                <input type="text" class="dyn-titel" placeholder="Hotets titel" value="${this.esc(titel)}">
                <button type="button" class="dyn-toggle" title="Visa mer" aria-label="Visa mer"><i class="fas fa-chevron-down"></i></button>
                <button type="button" class="dyn-remove" title="Ta bort"><i class="fas fa-times"></i></button>
            </div>
            <div class="dyn-row-body">
                <textarea class="dyn-besk" rows="3" placeholder="Hur tjänsten kan utnyttjas för penningtvätt eller finansiering av terrorism.">${this.esc(beskrivning)}</textarea>
                <p class="hot-aml-tf-warn" hidden></p>
            </div>
            <div class="dyn-kalla-row">
                <span class="dyn-kalla-label">Källa</span>
                <input type="text" class="dyn-kalla" placeholder="Myndighet — undersida — https://…" value="${this.esc(kalla)}" aria-label="Källa">
                <a class="dyn-kalla-link" target="_blank" rel="noopener noreferrer" hidden></a>
            </div>
        `;
        this.bindDynCard(row, { expand: !!opts.expand, hasSource: true });
        this.bindHotAmlTf(row);
        row.querySelector('.dyn-typ')?.addEventListener('change', () => this.updateTfBanner());
        list.appendChild(row);
        this.updateTjanstLists();
    }

    // Källa räknas som länk endast om värdet börjar med http(s).
    isKallaUrl(value) {
        return /^https?:\/\//i.test((value || '').toString().trim());
    }

    addSarbarhetRow(data = {}, opts = {}) {
        const list = document.getElementById('sarbarhet-list');
        if (!list) return;
        const kategorier = ['Kunder', 'Distribution', 'Geografi', 'Verksamhet'];
        const kategori = data.kategori ?? data.category ?? '';
        const titel = data.titel ?? data.title ?? '';
        const beskrivning = data.beskrivning ?? data.description ?? '';
        const optsHtml = kategorier.map(k => `<option value="${k}" ${kategori === k ? 'selected' : ''}>${k}</option>`).join('');
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-sarbarhet dyn-card' + (opts.aiAdd ? ' is-ai-add' : '');
        row.innerHTML = `
            <div class="dyn-row-header">
                <span class="dyn-drag" title="Dra för att sortera" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
                ${opts.aiAdd ? '<span class="dyn-ai-badge">Ny</span>' : ''}
                <select class="dyn-kategori" aria-label="Sårbarhetskategori">${optsHtml}</select>
                <input type="text" class="dyn-titel" placeholder="Sårbarhetens titel" value="${this.esc(titel)}">
                <button type="button" class="dyn-toggle" title="Visa mer" aria-label="Visa mer"><i class="fas fa-chevron-down"></i></button>
                <button type="button" class="dyn-remove" title="Ta bort"><i class="fas fa-times"></i></button>
            </div>
            <div class="dyn-row-body">
                <textarea class="dyn-besk" rows="3" placeholder="Beskrivning av sårbarheten">${this.esc(beskrivning)}</textarea>
            </div>
        `;
        this.bindDynCard(row, { expand: !!opts.expand });
        list.appendChild(row);
        this.updateTjanstLists();
    }

    addAtgardRow(data = {}, opts = {}) {
        const list = document.getElementById('atgard-list');
        if (!list) return;
        const titel = data.titel ?? data.title ?? data.namn ?? '';
        const beskrivning = data.beskrivning ?? data.description ?? '';
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-atgard dyn-card' + (opts.aiAdd ? ' is-ai-add' : '');
        row.innerHTML = `
            <div class="dyn-row-header">
                <span class="dyn-drag" title="Dra för att sortera" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
                ${opts.aiAdd ? '<span class="dyn-ai-badge">Ny</span>' : ''}
                <span class="dyn-header-label">Åtgärd</span>
                <input type="text" class="dyn-titel" placeholder="Åtgärdens titel" value="${this.esc(titel)}">
                <button type="button" class="dyn-toggle" title="Visa mer" aria-label="Visa mer"><i class="fas fa-chevron-down"></i></button>
                <button type="button" class="dyn-remove" title="Ta bort"><i class="fas fa-times"></i></button>
            </div>
            <div class="dyn-row-body">
                <textarea class="dyn-besk" rows="3" placeholder="T.ex. Underlag för alla transaktioner dokumenteras i bokslutsprogrammet.">${this.esc(beskrivning)}</textarea>
            </div>
        `;
        this.bindDynCard(row, { expand: !!opts.expand });
        list.appendChild(row);
        this.updateTjanstLists();
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

    bindHotAmlTf(row) {
        const sync = () => this.paintHotAmlTf(row);
        row.querySelector('.dyn-titel')?.addEventListener('input', sync);
        row.querySelector('.dyn-besk')?.addEventListener('input', sync);
        sync();
    }

    paintHotAmlTf(row) {
        const H = window.HotAmlTf;
        const warn = row.querySelector('.hot-aml-tf-warn');
        if (!H || !warn) return;
        const check = H.assessHot({
            titel: row.querySelector('.dyn-titel')?.value || '',
            beskrivning: row.querySelector('.dyn-besk')?.value || ''
        });
        const off = check.empty ? false : check.ok === false;
        row.classList.toggle('is-off-topic', off);
        warn.hidden = !off;
        warn.textContent = off ? H.HINT : '';
    }

    collectAtgard() {
        return [...document.querySelectorAll('#atgard-list .dyn-row')].map(row => ({
            titel: row.querySelector('.dyn-titel')?.value.trim() || '',
            beskrivning: row.querySelector('.dyn-besk')?.value.trim() || ''
        })).filter(a => a.titel || a.beskrivning);
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

    updateRiskBadges() {
        const inherent = (window.RiskSkala && RiskSkala.assessRisk(
            document.getElementById('tjanst-sannolikhet')?.value,
            document.getElementById('tjanst-konsekvens')?.value
        )) || {};
        const residual = (window.RiskSkala && RiskSkala.assessRisk(
            document.getElementById('tjanst-sannolikhet-efter')?.value,
            document.getElementById('tjanst-konsekvens-efter')?.value
        )) || {};
        this.paintRiskBadge(
            'tjanst-inneboende-badge',
            (window.RiskSkala && RiskSkala.formatInneboendeBadge(inherent)) || 'Inneboende risk: Ej satt',
            inherent.level
        );
        this.paintRiskBadge(
            'tjanst-residual-badge',
            (window.RiskSkala && RiskSkala.formatResidualBadge(residual)) || 'Residualrisk: Ej satt',
            residual.level
        );
        return { inherent, residual };
    }

    collectRiskPoang() {
        return {
            sannolikhet: document.getElementById('tjanst-sannolikhet')?.value,
            konsekvens: document.getElementById('tjanst-konsekvens')?.value,
            sannolikhetEfter: document.getElementById('tjanst-sannolikhet-efter')?.value,
            konsekvensEfter: document.getElementById('tjanst-konsekvens-efter')?.value
        };
    }

    resetModal() {
        document.getElementById('tjanst-form')?.reset();
        document.getElementById('tjanst-record-id').value = '';
        ['hot-list', 'sarbarhet-list', 'atgard-list'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        this.setTjanstTab('oversikt');
        this.updateTjanstLists();
        this.updateRiskBadges();
        const tfEl = document.getElementById('tjanst-tf-motivering');
        if (tfEl) tfEl.value = '';
        this.updateTfBanner();
        if (window.AiFaltGranskning) {
            AiFaltGranskning.hideReviewHosts(this.tjanstAiHosts());
            this.clearTjanstAiSummary();
        }
        this.clearInlineAi();
    }

    fillModal(risk) {
        const f = risk.fields || {};
        const scored = (window.RiskSkala && RiskSkala.readTjanstRisk(f)) || {};
        document.getElementById('tjanst-record-id').value = risk.id;
        document.getElementById('tjanst-name').value = f['Task Name'] || '';
        this.setScoreSelect('tjanst-sannolikhet', scored.sannolikhet);
        this.setScoreSelect('tjanst-konsekvens', scored.konsekvens);
        this.setScoreSelect('tjanst-sannolikhet-efter', scored.sannolikhetEfter);
        this.setScoreSelect('tjanst-konsekvens-efter', scored.konsekvensEfter);
        document.getElementById('tjanst-beskrivning').value = f['Tjänstebeskrivning'] || f['Beskrivning av riskfaktor'] || '';
        const tfEl = document.getElementById('tjanst-tf-motivering');
        if (tfEl) tfEl.value = (window.TjanstTfTackning && TjanstTfTackning.readTfMotivering(f)) || '';

        this.parseJsonField(f['Hot']).forEach(h => this.addHotRow(h));
        this.parseJsonField(f['Sårbarheter']).forEach(s => this.addSarbarhetRow(s));
        this.parseJsonField(f['Tjänstespecifika åtgärder']).forEach(a => this.addAtgardRow(a));
        this.updateRiskBadges();
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

    // ---- Byråprofil för AI ----
    buildByraProfilFromApiFields(f) {
        if (!f || typeof f !== 'object') return {};
        return {
            antalKunder: f.antalKunder ?? '',
            vanligasteBolagsformer: f.vanligasteBolagsformer ?? '',
            branscherKundstock: f.branscherKundstock ?? '',
            andelInternationellHandel: f.andelInternationellHandel ?? '',
            andelKontantintensiva: f.andelKontantintensiva ?? '',
            leveranssatt: f.leveranssatt ?? '',
            geografiskMarknad: f.geografiskMarknad ?? '',
            antalAnstallda: f.antalAnstallda ?? '',
            typAvByra: f.bransch ?? ''
        };
    }

    async fetchByraProfil() {
        if (this.byraProfil) return this.byraProfil;
        try {
            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            const response = await fetch(`${window.apiConfig.baseUrl}/api/byra/info`, { method: 'GET', ...opts });
            if (!response.ok) {
                console.warn('Kunde inte hämta byråprofil för AI (HTTP ' + response.status + '). Fortsätter utan profil.');
                this.byraProfil = {};
                return this.byraProfil;
            }
            const data = await response.json();
            this.byraProfil = this.buildByraProfilFromApiFields(data.fields || data);
            const hasProfil = Object.values(this.byraProfil).some(v => v !== '' && v != null);
            if (!hasProfil) {
                console.warn('Byråprofil saknas eller ofullständig – AI genereras med begränsat underlag.');
            }
            return this.byraProfil;
        } catch (error) {
            console.warn('Kunde inte hämta byråprofil för AI:', error);
            this.byraProfil = {};
            return this.byraProfil;
        }
    }

    applyTjanstAiScores(data, { onlyEmpty = false, existing = {} } = {}) {
        const Ai = window.AiFaltGranskning;
        const emptySxk = !onlyEmpty || !(Ai && (Ai.isFilledScore(existing.sannolikhet) || Ai.isFilledScore(existing.konsekvens)));
        const emptyRes = !onlyEmpty || !(Ai && (Ai.isFilledScore(existing.sannolikhetEfter) || Ai.isFilledScore(existing.konsekvensEfter)));
        if (emptySxk && data.sannolikhet != null) this.setScoreSelect('tjanst-sannolikhet', data.sannolikhet);
        if (emptySxk && data.konsekvens != null) this.setScoreSelect('tjanst-konsekvens', data.konsekvens);
        if (emptyRes && data.sannolikhetEfter != null) this.setScoreSelect('tjanst-sannolikhet-efter', data.sannolikhetEfter);
        if (emptyRes && data.konsekvensEfter != null) this.setScoreSelect('tjanst-konsekvens-efter', data.konsekvensEfter);
        if (emptySxk && (data.sannolikhet == null || data.konsekvens == null) && data.riskniva && window.RiskSkala) {
            const inferred = RiskSkala.scoresFromLegacyLevel(data.riskniva);
            if (data.sannolikhet == null) this.setScoreSelect('tjanst-sannolikhet', inferred.sannolikhet);
            if (data.konsekvens == null) this.setScoreSelect('tjanst-konsekvens', inferred.konsekvens);
        }
        this.updateRiskBadges();
    }

    replaceTjanstList(kind, items) {
        const listId = kind === 'hot' ? 'hot-list' : kind === 'sarbarheter' ? 'sarbarhet-list' : 'atgard-list';
        const el = document.getElementById(listId);
        if (el) el.innerHTML = '';
        const add = kind === 'hot'
            ? (row) => this.addHotRow(row)
            : kind === 'sarbarheter'
                ? (row) => this.addSarbarhetRow(row)
                : (row) => this.addAtgardRow(row);
        (items || []).forEach(add);
        this.updateTjanstLists();
    }

    applyTjanstAiAll(data) {
        if (data.tjanstebeskrivning) document.getElementById('tjanst-beskrivning').value = data.tjanstebeskrivning;
        this.applyTjanstAiScores(data);
        this.replaceTjanstList('hot', data.hot);
        this.replaceTjanstList('sarbarheter', data.sarbarheter);
        this.replaceTjanstList('atgarder', data.atgarder);
        const tfEl = document.getElementById('tjanst-tf-motivering');
        if (tfEl) tfEl.value = data.tfMotivering || '';
        this.updateTfBanner();
    }

    applyTjanstAiIfEmpty(existing, data) {
        const Ai = window.AiFaltGranskning;
        if (!(Ai && Ai.isFilledText(existing.tjanstebeskrivning)) && data.tjanstebeskrivning) {
            document.getElementById('tjanst-beskrivning').value = data.tjanstebeskrivning;
        }
        this.applyTjanstAiScores(data, { onlyEmpty: true, existing });
        if (!(existing.hot || []).length && (data.hot || []).length) this.replaceTjanstList('hot', data.hot);
        if (!(existing.sarbarheter || []).length && (data.sarbarheter || []).length) {
            this.replaceTjanstList('sarbarheter', data.sarbarheter);
        }
        if (!(existing.atgarder || []).length && (data.atgarder || []).length) {
            this.replaceTjanstList('atgarder', data.atgarder);
        }
        const tfEl = document.getElementById('tjanst-tf-motivering');
        if (tfEl && !(Ai && Ai.isFilledText(existing.tfMotivering)) && data.tfMotivering) {
            tfEl.value = data.tfMotivering;
        }
        this.updateTfBanner();
    }

    applyTjanstAiField(falt, forslag) {
        if (falt === 'tjanstebeskrivning') {
            document.getElementById('tjanst-beskrivning').value = String(forslag || '');
            this.setTjanstTab('oversikt');
        } else if (falt === 'sxk') {
            const scores = forslag && typeof forslag === 'object' ? forslag : {};
            if (scores.sannolikhet != null) this.setScoreSelect('tjanst-sannolikhet', scores.sannolikhet);
            if (scores.konsekvens != null) this.setScoreSelect('tjanst-konsekvens', scores.konsekvens);
            this.updateRiskBadges();
        } else if (falt === 'residual') {
            const scores = forslag && typeof forslag === 'object' ? forslag : {};
            if (scores.sannolikhet != null) this.setScoreSelect('tjanst-sannolikhet-efter', scores.sannolikhet);
            if (scores.konsekvens != null) this.setScoreSelect('tjanst-konsekvens-efter', scores.konsekvens);
            this.updateRiskBadges();
            this.setTjanstTab('atgard');
        } else if (falt === 'hot') {
            this.replaceTjanstList('hot', forslag);
            this.setTjanstTab('hot');
        } else if (falt === 'sarbarheter') {
            this.replaceTjanstList('sarbarheter', forslag);
            this.setTjanstTab('sarbarhet');
        } else if (falt === 'atgarder') {
            this.replaceTjanstList('atgarder', forslag);
            this.setTjanstTab('atgard');
        } else if (falt === 'tfMotivering') {
            const tfEl = document.getElementById('tjanst-tf-motivering');
            if (tfEl) tfEl.value = String(forslag || '');
            this.setTjanstTab('hot');
            this.updateTfBanner();
        }
    }

    clearInlineAi() {
        document.querySelectorAll('.dyn-ai-forslag, .dyn-ai-bar, .field-ai-forslag, .dyn-ai-list-note').forEach((el) => el.remove());
        document.querySelectorAll('.dyn-card.is-ai-remove').forEach((row) => {
            row.classList.remove('is-ai-remove');
            row.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = false; });
        });
        document.querySelectorAll('.dyn-card.is-ai-add').forEach((row) => row.remove());
        this.updateTjanstLists();
    }

    paintInlineAiSummary(host, hasChanges) {
        const Ai = window.AiFaltGranskning;
        if (!host) return;
        if (!hasChanges) {
            if (Ai) Ai.hideReview(host);
            return;
        }
        host.hidden = false;
        host.classList.add('is-inline-summary');
        host.innerHTML = `
            <div class="ai-review-head">
                <div>
                    <strong>AI har lagt förslag i formuläret</strong>
                    <p>Grönt kort = ny faktor. Överstruket = föreslås tas bort. Text under ett kort = nytt förslag. Du ansvarar för vad som sparas.</p>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss-all>Avfärda alla</button>
            </div>
        `;
        host.onclick = (ev) => {
            if (!ev.target.closest('[data-ai-dismiss-all]')) return;
            this.clearInlineAi();
            if (Ai) Ai.hideReview(host);
        };
    }

    attachFieldAiForslag(afterEl, { label, html, comment, onApply }) {
        if (!afterEl) return;
        afterEl.parentElement?.querySelectorAll('.field-ai-forslag').forEach((el) => el.remove());
        const box = document.createElement('div');
        box.className = 'field-ai-forslag';
        box.innerHTML = `
            <span class="field-ai-label">${this.esc(label || 'AI-förslag')}</span>
            ${comment ? `<p class="field-ai-comment">${this.esc(comment)}</p>` : ''}
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

    markRowAiRemove(row, comment) {
        if (!row) return;
        row.classList.remove('is-ai-add');
        row.classList.add('is-ai-remove');
        row.classList.remove('is-collapsed');
        row.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = true; });
        row.querySelector('.dyn-ai-bar')?.remove();
        const bar = document.createElement('div');
        bar.className = 'dyn-ai-bar';
        bar.innerHTML = `
            <span class="dyn-ai-label">Föreslås tas bort</span>
            <p class="dyn-ai-comment">${this.esc(comment || 'AI tar inte med den här faktorn i sin analys. Du avgör om den ska vara kvar.')}</p>
            <div class="dyn-ai-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-ai-keep>Behåll</button>
                <button type="button" class="btn btn-primary btn-sm" data-ai-drop>Ta bort</button>
            </div>
        `;
        row.appendChild(bar);
        bar.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-ai-keep]')) {
                row.classList.remove('is-ai-remove');
                row.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = false; });
                bar.remove();
            }
            if (ev.target.closest('[data-ai-drop]')) {
                row.remove();
                this.updateTjanstLists();
            }
        });
    }

    markRowAiUpdate(row, kind, forslag, comment) {
        if (!row || !forslag) return;
        row.classList.remove('is-collapsed');
        row.querySelector('.dyn-ai-forslag')?.remove();
        const box = document.createElement('div');
        box.className = 'dyn-ai-forslag';
        const typ = forslag.typ || 'PT';
        const kat = forslag.kategori || 'Verksamhet';
        const extra = kind === 'hot'
            ? `<select class="dyn-ai-typ" aria-label="PT eller TF">
                <option value="PT"${typ === 'PT' ? ' selected' : ''}>PT</option>
                <option value="TF"${typ === 'TF' ? ' selected' : ''}>TF</option>
                <option value="Båda"${typ === 'Båda' ? ' selected' : ''}>Båda</option>
              </select>`
            : kind === 'sarbarheter'
                ? `<select class="dyn-ai-kat" aria-label="Kategori">
                    <option${kat === 'Verksamhet' ? ' selected' : ''}>Verksamhet</option>
                    <option${kat === 'Kunder' ? ' selected' : ''}>Kunder</option>
                    <option${kat === 'Distribution' ? ' selected' : ''}>Distribution</option>
                    <option${kat === 'Geografi' ? ' selected' : ''}>Geografi</option>
                  </select>`
                : '';
        box.innerHTML = `
            <span class="dyn-ai-label">AI-förslag</span>
            ${comment ? `<p class="dyn-ai-comment">${this.esc(comment)}</p>` : ''}
            ${extra}
            <input type="text" class="dyn-ai-titel" value="${this.esc(forslag.titel || forslag.namn || '')}" placeholder="Titel">
            <textarea class="dyn-ai-besk" rows="3">${this.esc(forslag.beskrivning || '')}</textarea>
            ${kind === 'hot' ? `<input type="text" class="dyn-ai-kalla" value="${this.esc(forslag.kalla || '')}" placeholder="Källa">` : ''}
            <div class="dyn-ai-actions">
                <button type="button" class="btn btn-primary btn-sm" data-ai-apply>Kopiera in</button>
                <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss>Avfärda</button>
            </div>
        `;
        row.appendChild(box);
        box.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-ai-apply]')) {
                const titel = box.querySelector('.dyn-ai-titel')?.value || '';
                const besk = box.querySelector('.dyn-ai-besk')?.value || '';
                if (row.querySelector('.dyn-titel')) row.querySelector('.dyn-titel').value = titel;
                if (row.querySelector('.dyn-besk')) row.querySelector('.dyn-besk').value = besk;
                if (kind === 'hot') {
                    const typEl = row.querySelector('.dyn-typ');
                    const kallaEl = row.querySelector('.dyn-kalla');
                    if (typEl) typEl.value = box.querySelector('.dyn-ai-typ')?.value || 'PT';
                    if (kallaEl) {
                        kallaEl.value = box.querySelector('.dyn-ai-kalla')?.value || '';
                        kallaEl.dispatchEvent(new Event('input'));
                    }
                    this.updateTfBanner();
                }
                if (kind === 'sarbarheter' && row.querySelector('.dyn-kategori')) {
                    row.querySelector('.dyn-kategori').value = box.querySelector('.dyn-ai-kat')?.value || 'Verksamhet';
                }
                box.remove();
            }
            if (ev.target.closest('[data-ai-dismiss]')) box.remove();
        });
    }

    paintInlineListAi(kind, current, forslag, comment) {
        const Ai = window.AiFaltGranskning;
        if (!Ai) return false;
        const diff = Ai.listDiff(current, forslag);
        if (!Ai.listDiffHasChanges(diff)) return false;
        const listId = kind === 'hot' ? 'hot-list' : kind === 'sarbarheter' ? 'sarbarhet-list' : 'atgard-list';
        const rows = [...document.querySelectorAll(`#${listId} .dyn-row:not(.is-ai-add)`)];
        const note = Ai.usefulComment(comment);
        const list = document.getElementById(listId);
        if (list) list.querySelectorAll('.dyn-ai-list-note').forEach((el) => el.remove());
        if (list && note && (diff.updated.length > 1 || (diff.updated.length && (diff.added.length || diff.removed.length)))) {
            const banner = document.createElement('p');
            banner.className = 'dyn-ai-list-note dyn-ai-comment';
            banner.textContent = note;
            list.insertAdjacentElement('beforebegin', banner);
        }
        const itemComment = (diff.updated.length === 1 && !diff.added.length && !diff.removed.length) ? note : '';
        diff.updated.forEach((row) => this.markRowAiUpdate(rows[row.currentIndex], kind, row.forslag, itemComment));
        diff.removed.forEach((row) => this.markRowAiRemove(rows[row.currentIndex], note && diff.removed.length === 1 ? note : ''));
        const add = kind === 'hot'
            ? (item) => this.addHotRow(item, { expand: true, aiAdd: true })
            : kind === 'sarbarheter'
                ? (item) => this.addSarbarhetRow(item, { expand: true, aiAdd: true })
                : (item) => this.addAtgardRow(item, { expand: true, aiAdd: true });
        diff.added.forEach(add);
        return true;
    }

    paintInlineTjanstAi(poster, befintligt) {
        const Ai = window.AiFaltGranskning;
        this.clearInlineAi();
        const items = (poster || []).map((item) => Ai.decoratePoster(item, befintligt)).filter(Ai.isVisibleReviewItem);
        let changed = false;
        let firstTab = '';
        items.forEach((item) => {
            if (!item.andra) return;
            const comment = Ai.usefulComment(item.kommentar);
            if (item.falt === 'hot' || item.falt === 'sarbarheter' || item.falt === 'atgarder') {
                if (this.paintInlineListAi(item.falt, item.nuvarande, item.forslag, comment)) {
                    changed = true;
                    if (!firstTab) firstTab = item.falt === 'sarbarheter' ? 'sarbarhet' : (item.falt === 'atgarder' ? 'atgard' : 'hot');
                }
                return;
            }
            if (item.falt === 'tjanstebeskrivning') {
                this.attachFieldAiForslag(document.getElementById('tjanst-beskrivning'), {
                    comment,
                    html: `<textarea data-ai-forslag rows="6">${this.esc(item.forslag || '')}</textarea>`,
                    onApply: (box) => {
                        document.getElementById('tjanst-beskrivning').value = box.querySelector('[data-ai-forslag]')?.value || '';
                    }
                });
                changed = true;
                if (!firstTab) firstTab = 'oversikt';
                return;
            }
            if (item.falt === 'tfMotivering') {
                const tf = document.getElementById('tjanst-tf-motivering');
                this.attachFieldAiForslag(tf, {
                    comment,
                    html: `<textarea data-ai-forslag rows="4">${this.esc(item.forslag || '')}</textarea>`,
                    onApply: (box) => {
                        if (tf) tf.value = box.querySelector('[data-ai-forslag]')?.value || '';
                        this.updateTfBanner();
                    }
                });
                changed = true;
                if (!firstTab) firstTab = 'hot';
                return;
            }
            if (item.falt === 'sxk' || item.falt === 'residual') {
                const s = item.forslag && typeof item.forslag === 'object' ? item.forslag : {};
                const afterEl = item.falt === 'sxk'
                    ? document.getElementById('tjanst-inneboende-badge')
                    : document.getElementById('tjanst-residual-badge');
                this.attachFieldAiForslag(afterEl, {
                    label: item.falt === 'sxk' ? 'AI-förslag S×K' : 'AI-förslag residual',
                    comment,
                    html: `<div class="ai-review-scores">
                        <label>Sannolikhet <select data-ai-s>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${String(s.sannolikhet) === String(n) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
                        <label>Konsekvens <select data-ai-k>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${String(s.konsekvens) === String(n) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
                    </div>`,
                    onApply: (box) => {
                        if (item.falt === 'sxk') {
                            this.setScoreSelect('tjanst-sannolikhet', box.querySelector('[data-ai-s]')?.value);
                            this.setScoreSelect('tjanst-konsekvens', box.querySelector('[data-ai-k]')?.value);
                        } else {
                            this.setScoreSelect('tjanst-sannolikhet-efter', box.querySelector('[data-ai-s]')?.value);
                            this.setScoreSelect('tjanst-konsekvens-efter', box.querySelector('[data-ai-k]')?.value);
                        }
                        this.updateRiskBadges();
                    }
                });
                changed = true;
                if (!firstTab) firstTab = item.falt === 'residual' ? 'atgard' : 'oversikt';
            }
        });
        if (Ai) Ai.hideReviewHosts(this.tjanstAiHosts());
        this.updateTjanstAiSummary({
            oversikt: document.querySelectorAll('#tjanst-beskrivning ~ .field-ai-forslag, #tjanst-inneboende-badge ~ .field-ai-forslag').length,
            hot: document.querySelectorAll('#hot-list .is-ai-add, #hot-list .is-ai-remove, #hot-list .dyn-ai-forslag, #tjanst-tf-motivering ~ .field-ai-forslag').length,
            sarbarhet: document.querySelectorAll('#sarbarhet-list .is-ai-add, #sarbarhet-list .is-ai-remove, #sarbarhet-list .dyn-ai-forslag').length,
            atgard: document.querySelectorAll('#atgard-list .is-ai-add, #atgard-list .is-ai-remove, #atgard-list .dyn-ai-forslag, #tjanst-residual-badge ~ .field-ai-forslag').length
        });
        if (firstTab) this.setTjanstTab(firstTab);
        return changed;
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
        const Ai = window.AiFaltGranskning;
        const poang = this.collectRiskPoang();
        const inherent = (window.RiskSkala && RiskSkala.assessRisk(poang.sannolikhet, poang.konsekvens)) || {};
        const befintligt = {
            tjanstebeskrivning: document.getElementById('tjanst-beskrivning').value.trim(),
            sannolikhet: poang.sannolikhet,
            konsekvens: poang.konsekvens,
            sannolikhetEfter: poang.sannolikhetEfter,
            konsekvensEfter: poang.konsekvensEfter,
            riskniva: inherent.level || '',
            hot: this.collectHot(),
            sarbarheter: this.collectSarbarhet(),
            atgarder: this.collectAtgard(),
            tfMotivering: document.getElementById('tjanst-tf-motivering')?.value.trim() || ''
        };
        const reviewMode = !!(Ai && Ai.hasExistingTjanstContent(befintligt));
        btn.disabled = true;
        btn.classList.add('loading');
        label.textContent = reviewMode ? 'Analyserar…' : 'Genererar…';

        try {
            const byraProfil = await this.fetchByraProfil();

            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            const response = await fetch(`${window.apiConfig.baseUrl}/api/ai-byra-tjanst`, {
                method: 'POST',
                ...opts,
                headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
                body: JSON.stringify({ namn, befintligt, byraProfil })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            this._lastAiAudit = data.auditLogId ? { logId: data.auditLogId } : null;

            if (reviewMode) {
                this.applyTjanstAiIfEmpty(befintligt, data);
                const poster = (data.granskning && Array.isArray(data.granskning.poster) && data.granskning.poster.length)
                    ? data.granskning.poster
                    : (Ai.ensureAnalysisPosters('tjanst', befintligt, data, []).concat(
                        Ai.ensureTfCoveragePosters(befintligt, data, [])
                    ));
                const changed = this.paintInlineTjanstAi(poster, befintligt);
                this.showNotification(changed
                    ? 'AI har lagt förslag i era kort. Grönt är nytt, överstruket föreslås tas bort. Du ansvarar för vad som sparas.'
                    : 'AI har fyllt tomma fält. Inga nya förslag skilde sig från era texter.', 'success');
            } else {
                this.applyTjanstAiAll(data);
                this.setTjanstTab('hot');
                this.showNotification('AI-förslag inlagt. Granska och justera innan du sparar.', 'success');
            }
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
        const poang = this.collectRiskPoang();
        const inherent = (window.RiskSkala && RiskSkala.assessRisk(poang.sannolikhet, poang.konsekvens)) || {};
        const tfMotivering = document.getElementById('tjanst-tf-motivering')?.value.trim() || '';
        const serialized = (window.RiskSkala && RiskSkala.serializeRiskPoang({ ...poang, tfMotivering })) || JSON.stringify({ ...poang, tfMotivering });
        return {
            'Task Name': document.getElementById('tjanst-name').value.trim(),
            'Riskbedömning': inherent.level || '',
            'Riskpoäng': serialized,
            'Tjänstebeskrivning': document.getElementById('tjanst-beskrivning').value.trim(),
            'Hot': JSON.stringify(this.collectHot()),
            'Sårbarheter': JSON.stringify(this.collectSarbarhet()),
            'Tjänstespecifika åtgärder': JSON.stringify(this.collectAtgard()),
            'TF-motivering': tfMotivering
        };
    }

    async handleSaveTjanst(event, opts = {}) {
        event.preventDefault();
        const asDraft = opts.asDraft === true;

        const recordId = document.getElementById('tjanst-record-id').value;
        const namn = document.getElementById('tjanst-name').value.trim();
        if (!namn) {
            this.showNotification('Tjänstens namn är obligatoriskt.', 'error');
            return;
        }

        const payload = this.buildPayload();
        const Tf = window.TjanstTfTackning;
        if (Tf && !asDraft) {
            const check = Tf.validateTjanstTfTackning({
                hot: this.collectHot(),
                tfMotivering: payload['TF-motivering'],
                asDraft: false
            });
            if (!check.ok) {
                this.setTjanstTab('hot');
                this.updateTfBanner();
                this.showNotification(check.error, 'error');
                document.getElementById('tjanst-tf-motivering')?.focus();
                return;
            }
        }
        const Hot = window.HotAmlTf;
        if (Hot && !asDraft) {
            const hotCheck = Hot.validateHots(this.collectHot(), { asDraft: false });
            if (!hotCheck.ok) {
                this.setTjanstTab('hot');
                document.querySelectorAll('#hot-list .dyn-row').forEach((row) => this.paintHotAmlTf(row));
                this.showNotification(hotCheck.error, 'error');
                return;
            }
        }
        // Vid skapande: koppla byrå-ID
        if (!recordId) {
            const userByraId = this.userByraIds.length > 0 ? this.userByraIds[0] : null;
            if (!userByraId && this.userData?.role !== 'ClientFlowAdmin') {
                this.showNotification('Inget byrå-ID hittat för användaren. Kontakta administratören.', 'error');
                return;
            }
            if (userByraId) payload['Byrå ID'] = userByraId;
        }
        payload['Aktuell'] = !asDraft;
        if (asDraft) payload.utkast = true;

        try {
            const url = recordId
                ? `${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`
                : `${window.apiConfig.baseUrl}/api/risk-assessments`;
            const method = recordId ? 'PUT' : 'POST';

            let body = this._lastAiAudit ? { ...payload, aiAudit: this._lastAiAudit } : payload;
            let response = await riskAuthFetch(url, {
                method,
                body: JSON.stringify(body)
            });
            if (response.ok) this._lastAiAudit = null;

            if (!response.ok && (body['Riskpoäng'] || body['TF-motivering'])) {
                const err = await response.json().catch(() => ({}));
                const raw = JSON.stringify(err);
                if (/UNKNOWN_FIELD_NAME|Unknown field/i.test(raw)) {
                    body = { ...body };
                    if (body['Riskpoäng']) {
                        body['Samspelsexempel'] = body['Riskpoäng'];
                        delete body['Riskpoäng'];
                    }
                    delete body['TF-motivering'];
                    response = await riskAuthFetch(url, {
                        method,
                        body: JSON.stringify(body)
                    });
                } else {
                    const raw = err.message || err.error;
                    const msg = (raw && typeof raw === 'object')
                        ? (raw.message || JSON.stringify(raw))
                        : (raw || `HTTP ${response.status}`);
                    throw new Error(msg);
                }
            }

            if (response.ok) {
                this.closeModal('tjanst-modal');
                await this.loadRiskAssessments();
                this.showNotification(
                    asDraft
                        ? 'Utkast sparat. TF-täckning krävs innan tjänsten kan användas i AR-exporten.'
                        : (recordId ? 'Tjänsten uppdaterad.' : 'Tjänsten tillagd.'),
                    'success'
                );
            } else {
                const err = await response.json().catch(() => ({}));
                const raw = err.message || err.error;
                const msg = (raw && typeof raw === 'object')
                    ? (raw.message || JSON.stringify(raw))
                    : (raw || `HTTP ${response.status}`);
                throw new Error(msg);
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
        if (newStatus && window.TjanstTfTackning && TjanstTfTackning.tjanstSaknarTfTackning(risk.fields)) {
            this.showNotification(TjanstTfTackning.TF_SAVE_ERROR, 'error');
            this.openEditModal(recordId);
            this.setTjanstTab('hot');
            return;
        }
        if (newStatus && window.HotAmlTf) {
            const hotCheck = HotAmlTf.validateHots(risk.fields['Hot']);
            if (!hotCheck.ok) {
                this.showNotification(hotCheck.error, 'error');
                this.openEditModal(recordId);
                this.setTjanstTab('hot');
                return;
            }
        }
        try {
            const response = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`, {
                method: 'PUT',
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
            const response = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`, {
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
    console.info('[ClientFlow] riskbedomning-byra v5 laddad – S×K och residualrisk.');
    window.riskManager = new RiskAssessmentManager();
});
