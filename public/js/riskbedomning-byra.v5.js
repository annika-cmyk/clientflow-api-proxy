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
        this.kundAntalMaps = { riskfaktorer: {}, tjanster: {}, varningsflaggor: {}, risksankande: {} };
        this.utforandeState = { version: 1, tjanster: {} };
        this.utforandeViews = {};
        this._utforandeSaveTimer = null;

        this.init();
    }

    async init() {
        await this.loadDatasourceConfig();
        await this.loadUserData();
        this.setupEventListeners();
        this.setupRoleBasedUI();
        await this.loadRiskAssessments();
        await this.loadKundantal();
        await this.loadUtforande();
        this.applyFilters();
    }

    async loadKundantal() {
        this.kundAntalMaps = { riskfaktorer: {}, tjanster: {}, varningsflaggor: {}, risksankande: {} };
        try {
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risk-kundantal`);
            if (!res.ok) return;
            const data = await res.json();
            this.kundAntalMaps = {
                riskfaktorer: data.riskfaktorer || {},
                tjanster: data.tjanster || {},
                varningsflaggor: data.varningsflaggor || {},
                risksankande: data.risksankande || {}
            };
        } catch (err) {
            console.warn('Kunde inte ladda kundantal:', err);
        }
    }

    async loadUtforande() {
        const Mallar = window.TjanstUtforandeMallar;
        this.utforandeState = Mallar ? Mallar.emptyState() : { version: 1, tjanster: {} };
        try {
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/byra/tjanst-utforande`);
            if (res.ok) {
                const data = await res.json();
                this.utforandeState = (Mallar && Mallar.parseState(data.state)) || data.state || this.utforandeState;
            }
        } catch (err) {
            console.warn('Kunde inte ladda tjänsteutförande:', err);
        }
        await this.fetchByraProfil().catch(() => {});
        this.renderUtforandeKatalog();
    }

    renderUtforandeKatalog() {
        const host = document.getElementById('tjanst-utforande-katalog');
        const Mallar = window.TjanstUtforandeMallar;
        if (!host || !Mallar) return;
        const cards = Mallar.listCatalogCards(this.utforandeState);
        host.innerHTML = cards.map((card) => this.renderUtforandeCard(card.template, card.entry)).join('');
        host.querySelectorAll('[data-mall-id]').forEach((cardEl) => {
            const mallId = cardEl.getAttribute('data-mall-id');
            cardEl.querySelector('[data-utforande-aktiv]')?.addEventListener('change', (e) => {
                this.patchUtforandeEntry(mallId, { aktiv: !!e.target.checked });
            });
            cardEl.querySelectorAll('[data-q-id]').forEach((qEl) => {
                const qid = qEl.getAttribute('data-q-id');
                qEl.querySelectorAll('input, textarea, select').forEach((input) => {
                    input.addEventListener('change', () => this.collectUtforandeQuestion(mallId, qid, qEl));
                    if (input.classList.contains('tjanst-mall-text') || input.classList.contains('tjanst-mall-number')) {
                        input.addEventListener('input', () => this.collectUtforandeQuestion(mallId, qid, qEl));
                    }
                });
                qEl.querySelector('.tjanst-mall-comment')?.addEventListener('input', () => {
                    this.collectUtforandeQuestion(mallId, qid, qEl);
                });
                qEl.querySelector('[data-comment-add]')?.addEventListener('click', () => {
                    const commentEl = qEl.querySelector('.tjanst-mall-comment');
                    const addEl = qEl.querySelector('[data-comment-add]');
                    if (addEl) addEl.hidden = true;
                    if (commentEl) {
                        commentEl.hidden = false;
                        commentEl.focus();
                    }
                });
            });
            cardEl.querySelectorAll('[data-utforande-view]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const next = btn.getAttribute('data-utforande-view') || '';
                    this.utforandeViews[mallId] = this.utforandeViews[mallId] === next ? '' : next;
                    this.renderUtforandeKatalog();
                });
            });
            this.applyUtforandeQuestionVisibility(mallId, cardEl);
            const statsHost = cardEl.querySelector('[data-tjanst-stats]');
            if (statsHost) this.loadUtforandeClientflowStats(mallId, cardEl.getAttribute('data-mall-namn'), statsHost);
            cardEl.querySelectorAll('[data-open-analys]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.openTjanstAnalysFromCard(mallId, cardEl.getAttribute('data-mall-namn') || '', {
                        ai: btn.hasAttribute('data-open-analys-ai')
                    });
                });
            });
        });
    }

    findTjanstRisksByName(namn) {
        const wanted = String(namn || '').trim();
        if (!wanted) return [];
        const Mallar = window.TjanstUtforandeMallar;
        return (this.risks || []).filter((r) => {
            const task = (r.fields && r.fields['Task Name']) || '';
            if (!task) return false;
            if (task === wanted) return true;
            if (Mallar && Mallar.tjanstNamesMatch) return Mallar.tjanstNamesMatch(task, wanted);
            return String(task).trim().toLowerCase() === wanted.toLowerCase();
        });
    }

    findTjanstRiskByName(namn) {
        const matches = this.findTjanstRisksByName(namn);
        const exact = matches.find((r) => (r.fields && r.fields['Task Name']) === namn);
        return exact || matches[0] || null;
    }

    openTjanstAnalysFromCard(mallId, namn, opts = {}) {
        this.utforandeViews[mallId] = 'analys';
        const existing = this.findTjanstRiskByName(namn);
        if (existing) this.openEditModal(existing.id);
        else {
            this.openAddModal();
            const nameEl = document.getElementById('tjanst-name');
            if (nameEl) nameEl.value = namn;
        }
        if (opts.ai) this.generateAiSuggestion();
    }

    renderUtforandeRiskMeta(risk) {
        const f = (risk && risk.fields) || {};
        const scored = (window.RiskSkala && RiskSkala.readTjanstRisk(f)) || {};
        const riskLevel = scored.level || (window.RiskSkala && RiskSkala.riskLabelSv(f['Riskbedömning'])) || f['Riskbedömning'] || '';
        const residualLevel = scored.residualLevel || '';
        const badges = (window.RiskSkala && RiskSkala.listBadgeLabels(scored)) || {
            inneboende: scored.badge || riskLevel,
            residual: residualLevel ? ('Residualrisk: ' + (scored.residualBadge || residualLevel)) : ''
        };
        if (!badges.inneboende && !badges.residual) {
            return '<span class="tjanst-mall-status">AML-analys finns</span>';
        }
        return `
            <span class="tjanst-mall-meta">
                ${badges.inneboende ? `<span class="risk-level-badge ${this.getRiskLevelClass(riskLevel)}">${this.esc(badges.inneboende)}</span>` : ''}
                ${badges.residual ? `<span class="risk-level-badge ${this.getRiskLevelClass(residualLevel)}">${this.esc(badges.residual)}</span>` : ''}
            </span>
        `;
    }

    renderUtforandeQuestionGroup(mallId, title, questions, entry) {
        if (!questions.length) return '';
        return `
            <section class="tjanst-mall-group">
                <h5 class="tjanst-mall-group-title">${this.esc(title)}</h5>
                <div class="tjanst-mall-group-list">
                    ${questions.map((q) => this.renderUtforandeQuestion(mallId, q, entry)).join('')}
                </div>
            </section>
        `;
    }

    renderUtforandeCard(template, entry) {
        const aktiv = !!(entry && entry.aktiv);
        const grouped = window.TjanstUtforandeMallar.groupQuestionsForTemplate(template);
        const analysNamn = entry.namn || template.name;
        const existing = this.findTjanstRiskByName(analysNamn);
        const view = this.utforandeViews[template.id] || '';
        const qHtml = `${this.renderUtforandeQuestionGroup(template.id, 'Kundunderlag', grouped.stats || [], entry)}
            ${this.renderUtforandeStatsHint(template, entry)}
            ${this.renderUtforandeQuestionGroup(template.id, 'Så här görs tjänsten', grouped.base, entry)}
            ${this.renderUtforandeQuestionGroup(template.id, 'Specifikt för ' + (template.name || 'tjänsten'), grouped.extra, entry)}`;
        const analysHtml = existing
            ? `${this.buildTjanstRiskSections(existing)}
                <div class="tjanst-mall-actions">
                    <button type="button" class="btn btn-primary" data-open-analys>Redigera riskbedömning</button>
                </div>`
            : `<div class="tjanst-mall-empty">
                    <p>Ingen riskbedömning ännu. Välj hur ni vill ta fram den.</p>
                    <div class="tjanst-mall-choice">
                        <button type="button" class="btn btn-primary" data-open-analys data-open-analys-ai>Låt AI skapa ett utkast</button>
                        <button type="button" class="btn btn-secondary" data-open-analys>Hantera manuellt</button>
                    </div>
                </div>`;
        return `
            <article class="tjanst-mall-card${aktiv ? '' : ' is-inactive'}${view ? ` is-view-${this.esc(view)}` : ''}" data-mall-id="${this.esc(template.id)}" data-mall-namn="${this.esc(analysNamn)}">
                <div class="tjanst-mall-top">
                    <div>
                        <h4 class="tjanst-mall-title">${this.esc(template.name)}</h4>
                        ${template.description ? `<p class="tjanst-mall-desc">${this.esc(template.description)}</p>` : ''}
                    </div>
                    <label class="tjanst-mall-toggle">
                        <input type="checkbox" data-utforande-aktiv ${aktiv ? 'checked' : ''}>
                        <span>${aktiv ? 'Aktiv' : 'Inaktiv'}</span>
                    </label>
                </div>
                <div class="tjanst-mall-toolbar">
                    <div class="tjanst-mall-tabs" role="tablist">
                        <button type="button" class="tjanst-mall-nav-btn${view === 'fragor' ? ' is-active' : ''}" data-utforande-view="fragor" aria-pressed="${view === 'fragor' ? 'true' : 'false'}">Utförandefrågor</button>
                        <button type="button" class="tjanst-mall-nav-btn${view === 'analys' ? ' is-active' : ''}" data-utforande-view="analys" aria-pressed="${view === 'analys' ? 'true' : 'false'}">Riskbedömning</button>
                    </div>
                    ${existing ? this.renderUtforandeRiskMeta(existing) : '<span class="tjanst-mall-status">Ingen analys ännu</span>'}
                </div>
                <div class="tjanst-mall-body">
                    <div class="tjanst-mall-panel" data-panel="fragor">${qHtml}</div>
                    <div class="tjanst-mall-panel" data-panel="analys">${analysHtml}</div>
                </div>
            </article>
        `;
    }

    renderUtforandeQuestion(mallId, question, entry) {
        const answers = (entry && entry.answers) || {};
        const comments = (entry && entry.kommentarer) || {};
        const value = answers[question.id];
        const selected = new Set(Array.isArray(value) ? value : (value ? [value] : []));
        const showComment = (question.showCommentWhen || []).some((opt) => selected.has(opt));
        const commentValue = comments[question.id] || '';
        const hasCommentField = !!(question.showCommentWhen && question.showCommentWhen.length);
        let control = '';
        if (question.type === 'text') {
            control = `<textarea class="tjanst-mall-text" rows="3">${this.esc(value || '')}</textarea>`;
        } else if (question.type === 'number') {
            control = `<input type="number" min="0" step="1" class="tjanst-mall-number" value="${this.esc(value || '')}" placeholder="t.ex. 12">`;
        } else {
            const type = question.type === 'multi' ? 'checkbox' : 'radio';
            const name = `utforande-${mallId}-${question.id}`;
            control = `<div class="tjanst-mall-options" role="${type === 'radio' ? 'radiogroup' : 'group'}">${(question.options || []).map((opt) => `
                <label class="tjanst-mall-chip${selected.has(opt) ? ' is-selected' : ''}">
                    <input type="${type}" name="${this.esc(name)}" value="${this.esc(opt)}"${selected.has(opt) ? ' checked' : ''}>
                    <span>${this.esc(opt)}</span>
                </label>
            `).join('')}</div>`;
        }
        const visible = !window.TjanstUtforandeMallar || !window.TjanstUtforandeMallar.questionIsVisible
            ? true
            : window.TjanstUtforandeMallar.questionIsVisible(question, answers);
        return `
            <div class="tjanst-mall-q" data-q-id="${this.esc(question.id)}" data-q-type="${this.esc(question.type)}"${visible ? '' : ' hidden'}>
                <p class="tjanst-mall-q-label">${this.esc(question.label)}</p>
                ${question.helpText ? `<p class="tjanst-mall-q-help">${this.esc(question.helpText)}</p>` : ''}
                ${control}
                ${hasCommentField
                    ? `<button type="button" class="tjanst-mall-comment-add" data-comment-add${showComment && !commentValue ? '' : ' hidden'}>Lägg till kommentar</button>
                    <textarea class="tjanst-mall-comment" rows="2" placeholder="Valfri kommentar"${showComment && commentValue ? '' : ' hidden'}>${this.esc(commentValue)}</textarea>`
                    : ''}
            </div>
        `;
    }

    collectUtforandeQuestion(mallId, qid, qEl) {
        const type = qEl.getAttribute('data-q-type');
        const Mallar = window.TjanstUtforandeMallar;
        const entry = Mallar.getEntry(this.utforandeState, mallId);
        const answers = Object.assign({}, entry.answers);
        const kommentarer = Object.assign({}, entry.kommentarer);
        if (type === 'text') {
            answers[qid] = qEl.querySelector('.tjanst-mall-text')?.value.trim() || '';
        } else if (type === 'number') {
            answers[qid] = qEl.querySelector('.tjanst-mall-number')?.value.trim() || '';
        } else if (type === 'multi') {
            answers[qid] = [...qEl.querySelectorAll('input:checked')].map((el) => el.value);
        } else {
            answers[qid] = qEl.querySelector('input:checked')?.value || '';
        }
        const commentEl = qEl.querySelector('.tjanst-mall-comment');
        const addEl = qEl.querySelector('[data-comment-add]');
        if (commentEl || addEl) {
            const template = Mallar.templateById(mallId);
            const question = Mallar.questionsForTemplate(template).find((q) => q.id === qid);
            const selected = Array.isArray(answers[qid]) ? answers[qid] : (answers[qid] ? [answers[qid]] : []);
            const show = (question && question.showCommentWhen || []).some((opt) => selected.includes(opt));
            const commentValue = show && commentEl ? commentEl.value.trim() : '';
            const commentOpen = !!(commentEl && !commentEl.hidden);
            if (commentEl) commentEl.hidden = !(show && (commentOpen || commentValue));
            if (addEl) addEl.hidden = !(show && commentEl && commentEl.hidden);
            kommentarer[qid] = commentValue;
        }
        qEl.querySelectorAll('.tjanst-mall-chip').forEach((chip) => {
            const input = chip.querySelector('input');
            chip.classList.toggle('is-selected', !!(input && input.checked));
        });
        this.patchUtforandeEntry(mallId, { answers, kommentarer }, { rerender: qid === 'hamtaClientflowStatistik' });
        if (qid !== 'hamtaClientflowStatistik') {
            this.applyUtforandeQuestionVisibility(mallId, qEl.closest('[data-mall-id]'));
        }
    }

    renderUtforandeStatsHint(template, entry) {
        const Mallar = window.TjanstUtforandeMallar;
        if (Mallar && Mallar.wantsClientflowStatistik(entry)) {
            return `<div class="tjanst-mall-stats" data-tjanst-stats="${this.esc(template.id)}">Hämtar statistik från Clientflow…</div>`;
        }
        if (entry && entry.answers && entry.answers.hamtaClientflowStatistik === 'Nej') {
            const tot = this.byraProfil && this.byraProfil.antalKunder;
            if (tot !== '' && tot != null) {
                return `<p class="tjanst-mall-q-help tjanst-mall-byra-antal">Byråns totala kundantal enligt byråuppgifterna: <strong>${this.esc(tot)}</strong>.</p>`;
            }
            return '<p class="tjanst-mall-q-help tjanst-mall-byra-antal">Byråns totala kundantal saknas i byråuppgifterna.</p>';
        }
        return '';
    }

    async loadUtforandeClientflowStats(mallId, namn, host) {
        if (!host) return;
        try {
            const matches = this.findTjanstRisksByName(namn);
            const query = new URLSearchParams({ namn: namn || '' });
            const recordIds = matches.map((r) => r.id).filter(Boolean);
            if (recordIds.length) query.set('recordId', recordIds.join(','));
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/byra/tjanst-exponering?${query}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            const expo = data.exponering || {};
            if (expo.ok === false || expo.antal_kunder == null) {
                const msg = expo.fel || (Array.isArray(expo.saknade) && expo.saknade[0])
                    || 'Kunde inte hämta statistik från Clientflow.';
                host.innerHTML = `<p class="tjanst-mall-stats-error">${this.esc(msg)}</p>`;
                return;
            }
            const row = (label, value) => `<div class="tjanst-mall-stat"><span>${this.esc(label)}</span><strong>${this.esc(value == null ? 'uppgift saknas' : value)}</strong></div>`;
            const notes = [];
            const matchedNames = Array.isArray(expo.matchade_namn) ? expo.matchade_namn : [];
            const Mallar = window.TjanstUtforandeMallar;
            const otherNames = matchedNames.filter((label) => {
                if (!label || label === namn) return false;
                return !(Mallar && Mallar.foldName && Mallar.foldName(label) === Mallar.foldName(namn));
            });
            if (otherNames.length) {
                notes.push(`Matchade kundernas tjänst: ${otherNames.join(', ')}.`);
            }
            if (expo.antal_kunder === 0) {
                notes.push(expo.kopplad
                    ? 'Inga aktiva kunder har den här tjänsten.'
                    : `Hittade inga kunder kopplade till «${namn}». Kontrollera att namnet stämmer med kundernas tjänster.`);
            }
            host.innerHTML = `
                <p class="tjanst-mall-stats-title">Statistik från Clientflow</p>
                <div class="tjanst-mall-stat-grid">
                    ${row('Kunder med tjänsten', expo.antal_kunder)}
                    ${row('Kontanthantering', expo.kontanthantering)}
                    ${row('Utlandstransaktioner', expo.internationella_transaktioner)}
                    ${row('Högriskbranscher', expo.hogrisksbranscher)}
                    ${row('PEP eller PEP-anhörig', expo.pep)}
                    ${row('Högriskland', expo.hogrisksland)}
                </div>
                ${notes.length ? `<p class="tjanst-mall-q-help">${notes.map((n) => this.esc(n)).join(' ')}</p>` : ''}`;
        } catch (err) {
            host.innerHTML = `<p class="tjanst-mall-stats-error">Kunde inte hämta statistik från Clientflow: ${this.esc(err.message || 'okänt fel')}</p>`;
        }
    }

    applyUtforandeQuestionVisibility(mallId, cardEl) {
        const Mallar = window.TjanstUtforandeMallar;
        if (!Mallar || !cardEl || !Mallar.questionIsVisible) return;
        const template = Mallar.templateById(mallId);
        const entry = Mallar.getEntry(this.utforandeState, mallId);
        Mallar.questionsForTemplate(template).forEach((q) => {
            const el = cardEl.querySelector(`[data-q-id="${CSS.escape(q.id)}"]`);
            if (el) el.hidden = !Mallar.questionIsVisible(q, entry.answers);
        });
    }

    patchUtforandeEntry(mallId, patch, opts = {}) {
        const Mallar = window.TjanstUtforandeMallar;
        if (!Mallar) return;
        this.utforandeState = Mallar.upsertEntry(this.utforandeState, mallId, patch);
        if (opts.rerender !== false) this.renderUtforandeKatalog();
        this.scheduleUtforandeSave();
    }

    scheduleUtforandeSave() {
        clearTimeout(this._utforandeSaveTimer);
        this._utforandeSaveTimer = setTimeout(() => this.saveUtforande(), 600);
    }

    async saveUtforande() {
        try {
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/byra/tjanst-utforande`, {
                method: 'PUT',
                body: JSON.stringify({ state: this.utforandeState })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
        } catch (err) {
            console.warn('Kunde inte spara tjänsteutförande:', err);
            this.showNotification('Kunde inte spara hur tjänsten utförs: ' + err.message, 'error');
        }
    }

    addCustomUtforandeTjanst() {
        const namn = window.prompt('Namn på den egna tjänsten');
        if (!namn || !namn.trim()) return;
        const Mallar = window.TjanstUtforandeMallar;
        if (!Mallar) return;
        const added = Mallar.addCustomService(this.utforandeState, namn.trim());
        this.utforandeState = added.state;
        this.renderUtforandeKatalog();
        this.scheduleUtforandeSave();
    }

    renderKundCountBadge(n) {
        const num = Number(n) || 0;
        const label = num === 1 ? '1 kund' : `${num} kunder`;
        return `<span class="risk-kund-count" title="Antal aktiva kunder med denna tjänst">${label}</span>`;
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
        document.getElementById('tjanst-utforande-add-custom')?.addEventListener('click', () => this.addCustomUtforandeTjanst());
        ['tjanst-sannolikhet', 'tjanst-konsekvens', 'tjanst-sannolikhet-efter', 'tjanst-konsekvens-efter'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', () => this.updateRiskBadges());
        });
        ['tjanst-motivering-inneboende', 'tjanst-motivering-residual'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', () => this.updateMotiveringWarnings());
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

    renderMotiveringSection(part) {
        if (!part || !part.text) return '';
        const icon = part.key === 'residual' ? 'fa-shield-halved' : 'fa-scale-balanced';
        return `
            <div class="risk-content-section">
                <h5><i class="fas ${icon}"></i> ${this.esc(part.title)}</h5>
                <p class="risk-content-text">${this.formatDescription(part.text)}</p>
            </div>
        `;
    }

    renderMotiveringSections(scored, { keys } = {}) {
        const RM = window.RiskMotivering;
        if (!RM || !RM.motiveringDisplayParts) return '';
        const allowed = keys ? new Set(keys) : null;
        return RM.motiveringDisplayParts(scored)
            .filter((part) => !allowed || allowed.has(part.key))
            .map((part) => this.renderMotiveringSection(part))
            .join('');
    }

    buildTjanstRiskSections(risk) {
        const f = (risk && risk.fields) || {};
        const scored = (window.RiskSkala && RiskSkala.readTjanstRisk(f)) || {};
        const beskrivning = f['Tjänstebeskrivning'] || '';
        const hot = this.parseJsonField(f['Hot']);
        const sarbarheter = this.parseJsonField(f['Sårbarheter']);
        const atgarder = this.parseJsonField(f['Tjänstespecifika åtgärder']);
        const legacyBeskrivning = f['Beskrivning av riskfaktor'] || '';
        const legacyAtgard = f['Åtgjärd'] || '';
        const sections = [];

        if (beskrivning) {
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-file-lines"></i> Tjänsten</h5>
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
            const rows = hot.map((h) => `
                    <div class="threat-row">
                        <div class="threat-body">
                            <div class="threat-title">${this.esc(h.titel || '')}</div>
                            <div class="threat-desc">${this.esc(h.beskrivning || '')}</div>
                        </div>
                    </div>
                `).join('');
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-triangle-exclamation"></i> Hot och modus</h5>
                    <div class="threat-list">${rows}</div>
                </div>
            `);
        }

        if (sarbarheter.length) {
            const items = sarbarheter.map((s) => `
                    <div class="vuln-item">
                        <div class="vuln-item-title">${this.esc(s.titel || '')}</div>
                        <div class="vuln-item-desc">${this.esc(s.beskrivning || '')}</div>
                    </div>
                `).join('');
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-shield-halved"></i> Sårbarheter</h5>
                    <div class="vuln-grid">${items}</div>
                </div>
            `);
        }

        const motInneboende = this.renderMotiveringSections(scored, { keys: ['inneboende'] });
        if (motInneboende) sections.push(motInneboende);

        if (atgarder.length) {
            const items = atgarder.map((a) => `
                <div class="action-item">
                    <i class="fas fa-check action-icon"></i>
                    <span class="action-text"><strong>${this.esc(a.titel || '')}</strong>${a.beskrivning ? ' — ' + this.esc(a.beskrivning) : ''}</span>
                    <span class="atgard-status-badge${this.normalizeAtgardStatus(a.status) === 'befintlig' ? ' is-befintlig' : ''}">${this.normalizeAtgardStatus(a.status) === 'befintlig' ? 'Befintlig' : 'Föreslagen'}</span>
                </div>
            `).join('');
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-list-check"></i> Riskreducerande åtgärder</h5>
                    <div class="action-list">${items}</div>
                </div>
            `);
        } else if (legacyAtgard) {
            sections.push(`
                <div class="risk-content-section">
                    <h5><i class="fas fa-tools"></i> Riskreducerande åtgärder</h5>
                    <p class="risk-content-text">${this.formatDescription(legacyAtgard)}</p>
                </div>
            `);
        }

        const motResidual = this.renderMotiveringSections(scored, { keys: ['residual'] });
        if (motResidual) sections.push(motResidual);

        if (!sections.length) {
            sections.push(`
                <div class="risk-content-section">
                    <p class="risk-content-text"><em>Inget innehåll ännu. Klicka på "Redigera riskbedömning" och låt AI föreslå ett underlag.</em></p>
                </div>
            `);
        }

        return sections.join('');
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
            this.renderAtgardTypGranskning();
            return;
        }

        const riskItems = this.filteredRisks.map(risk => this.createRiskItem(risk)).join('');
        riskList.innerHTML = `<div class="risk-items">${riskItems}</div>`;
        this.setupRiskItemEventListeners();
        this.renderAtgardTypGranskning();
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
        const motStatus = (window.RiskMotivering && RiskMotivering.assessMotivering(scored)) || { complete: true };
        const motWarn = (!motStatus.complete && isChecked)
            ? '<span class="risk-motivering-warn risk-motivering-warn--list" title="Motivering saknas eller är för kort">✗</span>'
            : (scored.kraver_uppdaterad_motivering
                ? '<span class="risk-motivering-warn risk-motivering-warn--list risk-motivering-warn--flag" title="Kräver uppdaterad motivering">!</span>'
                : '');

        return `
            <div class="risk-item ${riskLevelClass} ${isChecked ? '' : 'inactive'}" data-record-id="${risk.id}">
                <div class="risk-item-header" onclick="riskManager.toggleRiskItem(this)">
                    <div class="risk-item-title">
                        <div class="risk-status-indicator ${isChecked ? 'checked' : 'unchecked'}">
                            ${isChecked ? '✓' : '○'}
                        </div>
                        <div class="risk-item-info">
                            <h4 class="risk-task-name">${this.esc(taskName)} ${motWarn}</h4>
                            <div class="risk-meta-info">
                                <span class="risk-level-badge ${riskLevelClass}" title="${this.esc(badges.inneboendeTitle)}">${this.esc(badges.inneboende)}</span>
                                ${badges.residual ? `<span class="risk-level-badge ${residualClass}" title="${this.esc(badges.residualTitle)}">${this.esc(badges.residual)}</span>` : ''}
                                ${this.renderKundCountBadge((this.kundAntalMaps.tjanster && this.kundAntalMaps.tjanster[risk.id]) || 0)}
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
                    ${this.buildTjanstRiskSections(risk)}

                    <div class="risk-item-footer">
                        <button class="btn btn-secondary btn-sm edit-risk" data-record-id="${risk.id}">
                            <i class="fas fa-edit"></i>
                            Redigera
                        </button>
                        <button class="btn ${isChecked ? 'btn-secondary' : 'btn-success'} btn-sm mark-complete" data-record-id="${risk.id}">
                            <i class="fas fa-${isChecked ? 'eye-slash' : 'check'}"></i>
                            ${isChecked ? 'Inaktivera' : 'Aktivera'}
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
        const labels = { oversikt: 'Översikt', hot: 'Hot och modus', sarbarhet: 'Sårbarheter', atgard: 'Riskreducerande åtgärder' };
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
        row.dataset.hotTyp = typ;
        row.innerHTML = `
            <div class="dyn-row-header">
                <span class="dyn-drag" title="Dra för att sortera" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
                ${opts.aiAdd ? '<span class="dyn-ai-badge">Ny</span>' : ''}
                <input type="text" class="dyn-titel" placeholder="Hotets titel" value="${this.esc(titel)}">
                <button type="button" class="dyn-toggle" title="Visa mer" aria-label="Visa mer"><i class="fas fa-chevron-down"></i></button>
                <button type="button" class="dyn-remove" title="Ta bort"><i class="fas fa-times"></i></button>
            </div>
            <div class="dyn-row-body">
                <textarea class="dyn-besk" rows="3" placeholder="Hur tjänsten kan utnyttjas för penningtvätt eller finansiering av terrorism.">${this.esc(beskrivning)}</textarea>
            </div>
            <div class="dyn-kalla-row">
                <span class="dyn-kalla-label">Källa</span>
                <input type="text" class="dyn-kalla" placeholder="Utgivare — dokument, kap. — https://…" value="${this.esc(kalla)}" aria-label="Källa">
                <a class="dyn-kalla-link" target="_blank" rel="noopener noreferrer" hidden></a>
            </div>
        `;
        this.bindDynCard(row, { expand: !!opts.expand, hasSource: true });
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
        const kategori = data.kategori ?? data.category ?? 'Verksamhet';
        const titel = data.titel ?? data.title ?? '';
        const beskrivning = data.beskrivning ?? data.description ?? '';
        const evidens = this.normalizeEvidens(data.evidens);
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-sarbarhet dyn-card' + (opts.aiAdd ? ' is-ai-add' : '');
        row.dataset.kategori = kategori || 'Verksamhet';
        row.dataset.evidens = evidens;
        row.innerHTML = `
            <div class="dyn-row-header">
                <span class="dyn-drag" title="Dra för att sortera" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
                ${opts.aiAdd ? '<span class="dyn-ai-badge">Ny</span>' : ''}
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
        const TF = window.TjanstForutsattning;
        const typ = TF ? TF.normalizeAtgardTyp(data.atgardTyp) : (data.atgardTyp || '');
        const lagsUt = !!(TF && TF.readLagsUt ? TF.readLagsUt(data) : data.lagsUtSomUppdragsatgard);
        const seq = (this._atgardTypSeq = (this._atgardTypSeq || 0) + 1);
        const name = `atgard-typ-${seq}`;
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-atgard dyn-card' + (opts.aiAdd ? ' is-ai-add' : '');
        if (typ === 'kundberoende_forutsattning' && lagsUt) row.dataset.lagsUt = '1';
        const forslag = (!typ && TF) ? TF.suggestAtgardTyp({ titel, beskrivning }) : { typ: '', reason: '' };
        const forslagHtml = (!typ && forslag.typ)
            ? `<p class="dyn-atgard-forslag">Förslag: ${this.esc(TF.typLabel(forslag.typ))}${forslag.reason ? ' — ' + this.esc(forslag.reason) : ''}. Bekräfta eller ändra nedan.</p>`
            : '';
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
                <label class="tjanst-panel-hint">Åtgärdens status
                    <select class="dyn-atgard-status" aria-label="Åtgärdsstatus">
                        <option value="foreslagen"${this.normalizeAtgardStatus(data.status) === 'foreslagen' ? ' selected' : ''}>Föreslagen</option>
                        <option value="befintlig"${this.normalizeAtgardStatus(data.status) === 'befintlig' ? ' selected' : ''}>Befintlig kontroll</option>
                    </select>
                </label>
                <div class="dyn-atgard-typ" role="radiogroup" aria-label="Åtgärdstyp">
                    <label class="dyn-atgard-typ-opt"><input type="radio" name="${name}" value="byrarutin"${typ === 'byrarutin' ? ' checked' : ''}> Byrårutin — ingår i vårt normala arbetssätt</label>
                    <label class="dyn-atgard-typ-opt"><input type="radio" name="${name}" value="kundberoende_forutsattning"${typ === 'kundberoende_forutsattning' ? ' checked' : ''}> Kundspecifik åtgärd</label>
                    <label class="dyn-atgard-typ-opt"><input type="radio" name="${name}" value="uppdragsatgard"${typ === 'uppdragsatgard' ? ' checked' : ''}> Risksänkande åtgärd som ska kopplas till specifika uppdragskörningar</label>
                </div>
                ${forslagHtml}
            </div>
        `;
        this.bindDynCard(row, { expand: !!opts.expand || !typ });
        list.appendChild(row);
        this.updateTjanstLists();
    }

    collectHot() {
        return [...document.querySelectorAll('#hot-list .dyn-row')].map((row) => ({
            typ: (window.RiskSkala && RiskSkala.normalizePtTf(row.dataset.hotTyp)) || row.dataset.hotTyp || 'PT',
            titel: row.querySelector('.dyn-titel')?.value.trim() || '',
            beskrivning: row.querySelector('.dyn-besk')?.value.trim() || '',
            kalla: row.querySelector('.dyn-kalla')?.value.trim() || ''
        })).filter((h) => h.titel || h.beskrivning || h.kalla);
    }

    normalizeEvidens(raw) {
        const t = String(raw || '').trim().toLowerCase();
        if (t === 'bekraftad' || t === 'bekräftad') return 'bekraftad';
        if (t === 'saknas' || t === 'saknad') return 'saknas';
        return 'tjanstetypisk';
    }

    evidensLabel(raw) {
        const v = this.normalizeEvidens(raw);
        if (v === 'bekraftad') return 'Bekräftad byråspecifik faktor';
        if (v === 'saknas') return 'Saknad information';
        return 'Tjänstetypisk risk';
    }

    normalizeAtgardStatus(raw) {
        const t = String(raw || '').trim().toLowerCase();
        return t === 'befintlig' ? 'befintlig' : 'foreslagen';
    }

    collectSarbarhet() {
        return [...document.querySelectorAll('#sarbarhet-list .dyn-row')].map((row) => ({
            kategori: row.dataset.kategori || 'Verksamhet',
            titel: row.querySelector('.dyn-titel')?.value.trim() || '',
            beskrivning: row.querySelector('.dyn-besk')?.value.trim() || '',
            evidens: this.normalizeEvidens(row.dataset.evidens)
        })).filter((s) => s.titel || s.beskrivning);
    }

    collectAtgard() {
        return [...document.querySelectorAll('#atgard-list .dyn-row')].map(row => {
            const typ = row.querySelector('.dyn-atgard-typ input:checked')?.value || '';
            const item = {
                titel: row.querySelector('.dyn-titel')?.value.trim() || '',
                beskrivning: row.querySelector('.dyn-besk')?.value.trim() || '',
                status: this.normalizeAtgardStatus(row.querySelector('.dyn-atgard-status')?.value)
            };
            if (typ) item.atgardTyp = typ;
            if (typ === 'uppdragsatgard') item.lagsUtSomUppdragsatgard = true;
            else if (typ === 'kundberoende_forutsattning' && row.dataset.lagsUt === '1') {
                item.lagsUtSomUppdragsatgard = true;
            }
            return item;
        }).filter(a => a.titel || a.beskrivning);
    }

    renderAtgardTypGranskning() {
        const box = document.getElementById('atgard-typ-granskning');
        const TF = window.TjanstForutsattning;
        if (!box || !TF) return;
        const lista = TF.buildGranskningslista((this.filteredRisks || []).map((r) => ({
            id: r.id,
            namn: (r.fields && r.fields['Task Name']) || '',
            atgarder: this.parseJsonField(r.fields && r.fields['Tjänstespecifika åtgärder'])
        })));
        const oklar = lista.flatMap((t) => t.atgarder.filter((a) => !a.klassificerad).map((a) => ({
            tjanstId: t.id,
            tjanstNamn: t.namn,
            ...a
        })));
        if (!oklar.length) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        box.hidden = false;
        box.innerHTML = `
            <h3>Granska åtgärdstyp</h3>
            <p>Befintliga åtgärder är inte klassificerade. Förslagen är bara hjälp — bekräfta eller ändra innan de räknas som kundspecifik åtgärd eller uppdragsåtgärd.</p>
            <ul class="atgard-typ-granskning-list">
                ${oklar.map((a) => `
                    <li>
                        <strong>${this.esc(a.tjanstNamn)}</strong>
                        — ${this.esc(a.titel || 'Åtgärd')}
                        ${a.forslagTyp ? `<em>Förslag: ${this.esc(TF.typLabel(a.forslagTyp))}</em>` : '<em>Inget förslag</em>'}
                        <span class="atgard-typ-granskning-actions">
                            <button type="button" class="btn btn-ghost btn-sm" onclick="riskManager.confirmAtgardTyp('${this.esc(a.tjanstId)}','${this.esc(a.key)}','byrarutin')">Byrårutin</button>
                            <button type="button" class="btn btn-ghost btn-sm" onclick="riskManager.confirmAtgardTyp('${this.esc(a.tjanstId)}','${this.esc(a.key)}','kundberoende_forutsattning')">Kundspecifik</button>
                            <button type="button" class="btn btn-ghost btn-sm" onclick="riskManager.confirmAtgardTyp('${this.esc(a.tjanstId)}','${this.esc(a.key)}','uppdragsatgard')">Uppdragskörning</button>
                        </span>
                    </li>`).join('')}
            </ul>`;
    }

    async confirmAtgardTyp(recordId, key, typ) {
        const TF = window.TjanstForutsattning;
        const risk = (this.risks || []).find((r) => r.id === recordId);
        if (!risk || !TF) return;
        const atgarder = this.parseJsonField(risk.fields && risk.fields['Tjänstespecifika åtgärder']).map((a) => {
            if (TF.atgardKey(a) !== key) return a;
            return Object.assign({}, a, { atgardTyp: typ });
        });
        try {
            const response = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risk-assessments/${recordId}`, {
                method: 'PUT',
                body: JSON.stringify({ 'Tjänstespecifika åtgärder': JSON.stringify(atgarder) })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || err.error || `HTTP ${response.status}`);
            }
            risk.fields = risk.fields || {};
            risk.fields['Tjänstespecifika åtgärder'] = JSON.stringify(atgarder);
            this.renderAtgardTypGranskning();
            this.showNotification('Åtgärdstyp sparad.', 'success');
        } catch (error) {
            this.showNotification('Kunde inte spara åtgärdstyp: ' + error.message, 'error');
        }
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
        this.updateMotiveringWarnings();
        return { inherent, residual };
    }

    updateMotiveringWarnings() {
        const RM = window.RiskMotivering;
        if (!RM) return;
        const poang = this.collectRiskPoang();
        const status = RM.assessMotivering(poang);
        const setWarn = (id, show) => {
            const el = document.getElementById(id);
            if (el) el.hidden = !show;
        };
        setWarn('tjanst-motivering-inneboende-warn', status.inneboendeNeedsMotivering && !status.inneboendeOk);
        setWarn('tjanst-motivering-residual-warn', (status.residualNeedsMotivering && !status.residualOk)
            || (status.residualNeedsDecision && !status.residualDecisionOk));
    }

    collectRiskPoang() {
        return {
            sannolikhet: document.getElementById('tjanst-sannolikhet')?.value,
            konsekvens: document.getElementById('tjanst-konsekvens')?.value,
            sannolikhetEfter: document.getElementById('tjanst-sannolikhet-efter')?.value,
            konsekvensEfter: document.getElementById('tjanst-konsekvens-efter')?.value,
            motivering_inneboende_risk: document.getElementById('tjanst-motivering-inneboende')?.value.trim() || '',
            motivering_residual_risk: document.getElementById('tjanst-motivering-residual')?.value.trim() || ''
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
        const motIn = document.getElementById('tjanst-motivering-inneboende');
        const motRes = document.getElementById('tjanst-motivering-residual');
        if (motIn) motIn.value = '';
        if (motRes) motRes.value = '';
        this.updateMotiveringWarnings();
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
        const motIn = document.getElementById('tjanst-motivering-inneboende');
        const motRes = document.getElementById('tjanst-motivering-residual');
        if (motIn) motIn.value = scored.motivering_inneboende_risk || '';
        if (motRes) motRes.value = scored.motivering_residual_risk || '';
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

    applyTjanstAiMotivering(data, { onlyEmpty = false, existing = {} } = {}) {
        const Ai = window.AiFaltGranskning;
        const motIn = data.motiveringInneboende || data.motivering_inneboende_risk || '';
        const motRes = data.motiveringResidual || data.motivering_residual_risk || '';
        const emptyIn = !onlyEmpty || !(Ai && Ai.isFilledText(existing.motiveringInneboende || existing.motivering_inneboende_risk));
        const emptyRes = !onlyEmpty || !(Ai && Ai.isFilledText(existing.motiveringResidual || existing.motivering_residual_risk));
        const inEl = document.getElementById('tjanst-motivering-inneboende');
        const resEl = document.getElementById('tjanst-motivering-residual');
        if (emptyIn && motIn && inEl) inEl.value = motIn;
        if (emptyRes && motRes && resEl) resEl.value = motRes;
        this.updateMotiveringWarnings();
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
        this.applyTjanstAiMotivering(data);
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
        this.applyTjanstAiMotivering(data, { onlyEmpty: true, existing });
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
        } else if (falt === 'motiveringInneboende') {
            const el = document.getElementById('tjanst-motivering-inneboende');
            if (el) el.value = String(forslag || '');
            this.setTjanstTab('sarbarhet');
            this.updateMotiveringWarnings();
        } else if (falt === 'motiveringResidual') {
            const el = document.getElementById('tjanst-motivering-residual');
            if (el) el.value = String(forslag || '');
            this.setTjanstTab('atgard');
            this.updateMotiveringWarnings();
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
                    <p>Grönt kort = ny faktor (med motivering). Överstruket = föreslås tas bort (med varför). Ändringsförslag visar vad som ändras och varför. Du ansvarar för vad som sparas.</p>
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
            ${comment ? `<p class="field-ai-comment"><strong>Varför:</strong> ${this.esc(comment)}</p>` : ''}
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
            <p class="dyn-ai-comment"><strong>Varför:</strong> ${this.esc(comment || 'AI tar inte med den här faktorn i sin samlade analys. Du avgör om den ska vara kvar.')}</p>
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

    markRowAiUpdate(row, kind, forslag, comment, current) {
        if (!row || !forslag) return;
        const Ai = window.AiFaltGranskning;
        row.classList.remove('is-collapsed');
        row.querySelector('.dyn-ai-forslag')?.remove();
        const box = document.createElement('div');
        box.className = 'dyn-ai-forslag';
        const fieldChanges = Ai ? Ai.listItemFieldChanges(kind, current, forslag) : [];
        box.innerHTML = `
            <div class="dyn-ai-forslag-head">
                <span class="dyn-ai-label">AI föreslår ändring</span>
            </div>
            ${comment ? `<p class="dyn-ai-comment"><strong>Varför:</strong> ${this.esc(comment)}</p>` : ''}
            ${fieldChanges.length ? `<p class="dyn-ai-change-hint"><strong>Ändras:</strong> ${this.esc(fieldChanges.join(', '))}</p>` : ''}
            <div class="dyn-ai-form">
                <div class="dyn-ai-field dyn-ai-field--titel">
                    <label class="dyn-ai-field-label">Titel</label>
                    <input type="text" class="dyn-ai-titel dyn-ai-control" value="${this.esc(forslag.titel || forslag.namn || '')}" placeholder="Titel">
                </div>
                <div class="dyn-ai-field dyn-ai-field--besk">
                    <label class="dyn-ai-field-label">Beskrivning</label>
                    <textarea class="dyn-ai-besk dyn-ai-control" rows="3">${this.esc(forslag.beskrivning || '')}</textarea>
                </div>
                ${kind === 'hot' ? `<div class="dyn-ai-field dyn-ai-field--kalla">
                    <label class="dyn-ai-field-label">Källa</label>
                    <input type="text" class="dyn-ai-kalla dyn-ai-control" value="${this.esc(forslag.kalla || '')}" placeholder="Utgivare — dokument, kap. — https://…">
                </div>` : ''}
            </div>
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
                    const typ = (window.RiskSkala && RiskSkala.normalizePtTf(forslag.typ)) || forslag.typ || '';
                    if (typ) row.dataset.hotTyp = typ;
                    const kallaEl = row.querySelector('.dyn-kalla');
                    if (kallaEl) {
                        kallaEl.value = box.querySelector('.dyn-ai-kalla')?.value || '';
                        kallaEl.dispatchEvent(new Event('input'));
                    }
                    this.updateTfBanner();
                }
                if (kind === 'sarbarheter') {
                    if (forslag.kategori) row.dataset.kategori = forslag.kategori;
                    if (forslag.evidens) row.dataset.evidens = this.normalizeEvidens(forslag.evidens);
                }
                box.remove();
            }
            if (ev.target.closest('[data-ai-dismiss]')) box.remove();
        });
    }

    markRowAiAdd(row, comment) {
        if (!row || !comment) return;
        row.querySelector('.dyn-ai-bar')?.remove();
        const bar = document.createElement('div');
        bar.className = 'dyn-ai-bar dyn-ai-bar-add';
        bar.innerHTML = `
            <span class="dyn-ai-label">Ny faktor</span>
            <p class="dyn-ai-comment"><strong>Varför:</strong> ${this.esc(comment)}</p>
            <div class="dyn-ai-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss-add>Avfärda</button>
            </div>
        `;
        row.appendChild(bar);
        bar.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-ai-dismiss-add]')) {
                row.remove();
                this.updateTjanstLists();
            }
        });
    }

    paintInlineListAi(item) {
        const Ai = window.AiFaltGranskning;
        if (!Ai || !item) return false;
        const kind = item.falt;
        const current = item.nuvarande;
        const forslag = item.forslag;
        const diff = Ai.listDiff(current, forslag);
        if (!Ai.listDiffHasChanges(diff)) return false;
        const listId = kind === 'hot' ? 'hot-list' : kind === 'sarbarheter' ? 'sarbarhet-list' : 'atgard-list';
        const rows = [...document.querySelectorAll(`#${listId} .dyn-row:not(.is-ai-add)`)];
        const note = Ai.usefulComment(item.kommentar);
        const list = document.getElementById(listId);
        if (list) list.querySelectorAll('.dyn-ai-list-note').forEach((el) => el.remove());
        if (list && note && (diff.updated.length > 1 || (diff.updated.length && (diff.added.length || diff.removed.length)) || diff.added.length > 1 || diff.removed.length > 1)) {
            const banner = document.createElement('p');
            banner.className = 'dyn-ai-list-note dyn-ai-comment';
            banner.innerHTML = `<strong>AI:s helhetsmotivering:</strong> ${this.esc(note)}`;
            list.insertAdjacentElement('beforebegin', banner);
        }
        diff.updated.forEach((row) => {
            const comment = Ai.getListItemComment(item, 'redigera', row.current, row.forslag);
            this.markRowAiUpdate(rows[row.currentIndex], kind, row.forslag, comment, row.current);
        });
        diff.removed.forEach((row) => {
            const comment = Ai.getListItemComment(item, 'ta-bort', row.item, null);
            this.markRowAiRemove(rows[row.currentIndex], comment);
        });
        const add = kind === 'hot'
            ? (rowItem) => this.addHotRow(rowItem, { expand: true, aiAdd: true })
            : kind === 'sarbarheter'
                ? (rowItem) => this.addSarbarhetRow(rowItem, { expand: true, aiAdd: true })
                : (rowItem) => this.addAtgardRow(rowItem, { expand: true, aiAdd: true });
        diff.added.forEach((rowItem) => {
            add(rowItem);
            const addedRows = list ? [...list.querySelectorAll('.dyn-row.is-ai-add')] : [];
            const row = addedRows[addedRows.length - 1];
            this.markRowAiAdd(row, Ai.getListItemComment(item, 'lagg-till', null, rowItem));
        });
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
            if (item.falt === 'hot' || item.falt === 'sarbarheter' || item.falt === 'atgarder') {
                if (this.paintInlineListAi(item)) {
                    changed = true;
                    if (!firstTab) firstTab = item.falt === 'sarbarheter' ? 'sarbarhet' : (item.falt === 'atgarder' ? 'atgard' : 'hot');
                }
                return;
            }
            const comment = Ai.usefulComment(item.kommentar)
                || Ai.explainTextFieldChange(item.falt, item.nuvarande, item.forslag);
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
            if (item.falt === 'motiveringInneboende') {
                this.attachFieldAiForslag(document.getElementById('tjanst-motivering-inneboende'), {
                    comment,
                    html: `<textarea data-ai-forslag rows="4">${this.esc(item.forslag || '')}</textarea>`,
                    onApply: (box) => {
                        const el = document.getElementById('tjanst-motivering-inneboende');
                        if (el) el.value = box.querySelector('[data-ai-forslag]')?.value || '';
                        this.updateMotiveringWarnings();
                    }
                });
                changed = true;
                if (!firstTab) firstTab = 'sarbarhet';
                return;
            }
            if (item.falt === 'motiveringResidual') {
                this.attachFieldAiForslag(document.getElementById('tjanst-motivering-residual'), {
                    comment,
                    html: `<textarea data-ai-forslag rows="4">${this.esc(item.forslag || '')}</textarea>`,
                    onApply: (box) => {
                        const el = document.getElementById('tjanst-motivering-residual');
                        if (el) el.value = box.querySelector('[data-ai-forslag]')?.value || '';
                        this.updateMotiveringWarnings();
                    }
                });
                changed = true;
                if (!firstTab) firstTab = 'atgard';
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
                if (!firstTab) {
                    if (item.falt === 'residual' || item.falt === 'motiveringResidual') firstTab = 'atgard';
                    else if (item.falt === 'motiveringInneboende') firstTab = 'sarbarhet';
                    else firstTab = 'oversikt';
                }
            }
        });
        if (Ai) Ai.hideReviewHosts(this.tjanstAiHosts());
        this.updateTjanstAiSummary({
            oversikt: document.querySelectorAll('#tjanst-beskrivning ~ .field-ai-forslag, #tjanst-inneboende-badge ~ .field-ai-forslag').length,
            hot: document.querySelectorAll('#hot-list .is-ai-add, #hot-list .is-ai-remove, #hot-list .dyn-ai-forslag, #tjanst-tf-motivering ~ .field-ai-forslag').length,
            sarbarhet: document.querySelectorAll('#sarbarhet-list .is-ai-add, #sarbarhet-list .is-ai-remove, #sarbarhet-list .dyn-ai-forslag, #tjanst-motivering-inneboende ~ .field-ai-forslag').length,
            atgard: document.querySelectorAll('#atgard-list .is-ai-add, #atgard-list .is-ai-remove, #atgard-list .dyn-ai-forslag, #tjanst-residual-badge ~ .field-ai-forslag, #tjanst-motivering-residual ~ .field-ai-forslag').length
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
        const label = btn && btn.querySelector('.ai-btn-label');
        const originalLabel = (label && label.textContent) || 'Generera AI-förslag';
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
            tfMotivering: document.getElementById('tjanst-tf-motivering')?.value.trim() || '',
            motiveringInneboende: poang.motivering_inneboende_risk || '',
            motiveringResidual: poang.motivering_residual_risk || ''
        };
        const reviewMode = !!(Ai && Ai.hasExistingTjanstContent(befintligt));
        if (btn) {
            btn.disabled = true;
            btn.classList.add('loading');
        }
        if (label) label.textContent = reviewMode ? 'Analyserar…' : 'Genererar…';

        try {
            const byraProfil = await this.fetchByraProfil();

            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            const response = await fetch(`${window.apiConfig.baseUrl}/api/ai-byra-tjanst`, {
                method: 'POST',
                ...opts,
                headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
                body: JSON.stringify({
                    namn,
                    recordId: document.getElementById('tjanst-record-id')?.value || '',
                    befintligt,
                    byraProfil,
                    utforande: this.utforandeState
                })
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
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('loading');
            }
            if (label) label.textContent = originalLabel;
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
        const RM = window.RiskMotivering;
        if (RM && !asDraft) {
            const motCheck = RM.validatePoangMotivering(this.collectRiskPoang(), { asDraft: false });
            if (!motCheck.ok) {
                const first = motCheck.errors[0] || {};
                this.showNotification(first.error || 'Motivering krävs.', 'error');
                const field = first.field === 'motivering_residual_risk'
                    ? 'tjanst-motivering-residual'
                    : 'tjanst-motivering-inneboende';
                if (first.field === 'motivering_residual_risk') this.setTjanstTab('atgard');
                else this.setTjanstTab('sarbarhet');
                document.getElementById(field)?.focus();
                this.updateMotiveringWarnings();
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
                this.renderUtforandeKatalog();
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
