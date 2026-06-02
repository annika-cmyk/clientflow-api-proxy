// Customer Card Management System
// Version marker to verify browser cache.
console.log('🔍 SCRIPT LOADED - kundkort.js v14.4', new Date().toISOString());
console.log('🔍 SCRIPT LOADED - Current URL:', window.location.href);
console.log('🔍 SCRIPT LOADED - URL search:', window.location.search);

function getAuthOptsKundkort() { return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } }; }
function isLoggedInKundkort() { return !!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()); }

/** Omsättningsintervall (Airtable-fält "Omsättning") — samma texter skickas till AI-riskbedömning */
const KUND_OMSATTNING_VAL = [
    '0–200 000 kr',
    '200 000–1 500 000 kr',
    '1 500 000–10 000 000 kr',
    'Över 10 000 000 kr'
];

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
        this._ensureTabStatusElements();
        this._updateKlarTabIndicators({});
        
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
                this.refreshTabIndicators();
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

    _ensureTabStatusElements() {
        const tabIds = [
            'foretagsinformation', 'ovrigkyc', 'kycformular', 'uppdragsavtal',
            'uppdrag', 'avvikelser', 'samarbete'
        ];
        tabIds.forEach((tabId) => {
            const btn = document.querySelector(`.customer-details-section .tab-button[data-tab="${tabId}"]`);
            if (!btn) return;
            btn.querySelectorAll(':scope > i.fas, :scope > i.tab-button-icon').forEach((el) => el.remove());
            const label = btn.querySelector(':scope > .tab-button-label');
            let status = btn.querySelector(`:scope > .tab-status[data-tab-status="${tabId}"]`);
            if (!status) {
                status = document.createElement('span');
                status.className = 'tab-status';
                status.dataset.tabStatus = tabId;
                status.setAttribute('aria-hidden', 'true');
                if (label) btn.insertBefore(status, label);
                else btn.appendChild(status);
            } else if (label && status.nextElementSibling !== label) {
                btn.insertBefore(status, label);
            }
        });
    }

    _tabStatusEl(tabId) {
        this._ensureTabStatusElements();
        return document.querySelector(`.customer-details-section .tab-status[data-tab-status="${tabId}"]`);
    }

    _setTabStatus(tabId, html, title = '') {
        const el = this._tabStatusEl(tabId);
        if (!el) return;
        el.innerHTML = html || '';
        el.className = 'tab-status' + (html ? '' : '');
        if (title) {
            el.setAttribute('title', title);
            el.removeAttribute('aria-hidden');
        } else {
            el.removeAttribute('title');
            el.setAttribute('aria-hidden', 'true');
        }
    }

    _parseKontaktPersoner(fields) {
        const raw = fields['Kontaktpersoner'] || fields['Befattningshavare'] || '';
        if (!raw) return [];
        const s = String(raw).trim();
        if (s.startsWith('[')) {
            try {
                return JSON.parse(s) || [];
            } catch (_) {
                return [];
            }
        }
        return s.split('\n').map(r => r.trim()).filter(Boolean).map(r => {
            const match = r.match(/^(.+?)\s*\((.+)\)$/);
            return { namn: match ? match[1].trim() : r };
        });
    }

    _isForetagsinformationKlar(fields) {
        if (!fields) return false;
        const manual = fields['Flik klar - Företagsinformation'];
        if (manual === true) return true;
        if (manual === false) return false;
        const email = (fields['e-post'] || fields['Email'] || fields['E-post'] || '').toString().trim();
        const telefon = (fields['Telefonnr'] || fields['telefon'] || '').toString().trim();
        const beskrivning = (fields['Beskrivning av kunden'] || '').toString().trim();
        const personer = this._parseKontaktPersoner(fields);
        const harKontakt = personer.length > 0;
        return !!(email && telefon && beskrivning && harKontakt);
    }

    _isRiskbedomningKlar(fields) {
        if (!fields) return false;
        const manual = fields['Flik klar - Riskbedömning'];
        if (manual === true) return true;
        if (manual === false) return false;
        const sammanlagd = (fields['sammanlagd risk'] || fields['Riskniva'] || '').toString().trim();
        const utförd = fields['Riskbedömning utförd datum'];
        const bedömning = (fields['Byrans riskbedomning'] || fields['Motivering'] || '').toString().trim();
        return !!(sammanlagd && (utförd || bedömning));
    }

    _fieldIsChecked(fields, fieldName) {
        const v = fields?.[fieldName];
        return v === true || v === 1 || v === 'true' || v === 'Ja' || v === 'checked';
    }

    _renderExternClientFlowOption({ id, checked, label, hint, onChangeHandler }) {
        return `
            <div class="kundkort-extern-option-card">
                <label class="kundkort-extern-option">
                    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}
                        onchange="customerCardManager.${onChangeHandler}(this.checked)">
                    <span>${this._esc(label)}</span>
                </label>
                ${hint ? `<p class="kundkort-extern-option-hint">${this._esc(hint)}</p>` : ''}
            </div>`;
    }

    async _patchKunddataFields(fields) {
        const customerId = this.customerId;
        if (!customerId) {
            this.showNotification('Kund-ID saknas', 'error');
            return false;
        }
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const response = await fetch(`${baseUrl}/api/kunddata/${customerId}`, {
                method: 'PATCH',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ fields })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                const msg = err.error || err.message || `HTTP ${response.status}`;
                if (response.status === 422) {
                    throw new Error(`${msg} Skapa checkbox-fält i KUNDDATA: ${Object.keys(fields).join(', ')}`);
                }
                throw new Error(msg);
            }
            if (this.customerData?.fields) {
                Object.assign(this.customerData.fields, fields);
            }
            this._updateKlarTabIndicators(this.customerData?.fields || {});
            return true;
        } catch (error) {
            console.error('❌ Kunde inte spara kundfält:', error);
            this.showNotification('Kunde inte spara: ' + error.message, 'error');
            return false;
        }
    }

    async setUppdragsavtalUtanforClientFlow(checked) {
        const ok = await this._patchKunddataFields({ 'Uppdragsavtal utanför ClientFlow': !!checked });
        if (ok) {
            const cb = document.getElementById('kund-ua-utanfor-avtal-cf');
            if (cb) cb.checked = !!checked;
            this.showNotification(checked ? 'Uppdragsavtal utanför ClientFlow registrerat.' : 'Markering borttagen.', 'success');
            this.loadUppdragsavtal();
        } else {
            const cb = document.getElementById('kund-ua-utanfor-avtal-cf');
            if (cb) cb.checked = !checked;
        }
    }

    async setKycFormularUtanforClientFlow(checked) {
        const ok = await this._patchKunddataFields({ 'KYC-formulär utanför ClientFlow': !!checked });
        if (ok) {
            const cb = document.getElementById('kund-kyc-utanfor-cf');
            if (cb) cb.checked = !!checked;
            this.showNotification(checked ? 'KYC utanför ClientFlow registrerat.' : 'Markering borttagen.', 'success');
            this.loadKYCFormular();
        } else {
            const cb = document.getElementById('kund-kyc-utanfor-cf');
            if (cb) cb.checked = !checked;
        }
    }

    _isKycFormularKlar(fields, savedKyc = {}) {
        if (!fields) return false;
        const manual = fields['Flik klar - KYC-formulär'];
        if (manual === true) return true;
        if (manual === false) return false;
        if (this._fieldIsChecked(fields, 'KYC-formulär utanför ClientFlow')) return true;
        if (savedKyc?.utanforClientFlow === true) return true;
        const status = (savedKyc?.status || '').toString().trim();
        if (status === 'Signerat') return true;
        return !!(fields['KYC UTFÖRD DATUM']);
    }

    _isUppdragsavtalKlar(avtalFields, customerFields = {}) {
        if (this._fieldIsChecked(customerFields, 'Uppdragsavtal utanför ClientFlow')) return true;
        if (!avtalFields) return false;
        const status = (avtalFields['Avtalsstatus'] || avtalFields['Status'] || '').toString().trim();
        return status === 'Signerat';
    }

    _samarbetePendingProgress(req) {
        const titleFull = (req.title || 'Förfrågan').trim().replace(/\s*\[fil obligatorisk\]\s*$/gi, '').trim();
        const titleLines = titleFull.split('\n').map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
        const n = titleLines.length;
        if (!n) return { answered: 0, total: 0, hasPartial: false, unanswered: true };
        const raw = (req.responseText || '').toString().trim();
        if (!raw || !raw.startsWith('[')) return { answered: 0, total: n, hasPartial: false, unanswered: true };
        try {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return { answered: 0, total: n, hasPartial: false, unanswered: true };
            let answered = 0;
            titleLines.forEach((_, idx) => {
                const a = arr[idx] || {};
                const hasText = a.text && String(a.text).trim();
                const hasFile = a.filename && String(a.filename).trim();
                if (hasText || hasFile) answered++;
            });
            return {
                answered,
                total: n,
                hasPartial: answered > 0 && answered < n,
                unanswered: answered === 0
            };
        } catch (_) {
            return { answered: 0, total: n, hasPartial: false, unanswered: true };
        }
    }

    _computeSamarbeteTabState(requests) {
        const list = Array.isArray(requests) ? requests : [];
        const isArchived = (r) => (r.status || '') === 'Arkiverad' || !!r.archived;
        const active = list.filter(r => !isArchived(r));
        const pending = active.filter(r => (r.status || 'Väntar') === 'Väntar');
        const answered = active.filter(r => (r.status || '') === 'Besvarad');

        let hasUnanswered = false;
        let hasPartial = false;
        pending.forEach((req) => {
            const p = this._samarbetePendingProgress(req);
            if (p.unanswered) hasUnanswered = true;
            else if (p.hasPartial) hasPartial = true;
        });

        if (hasUnanswered) return 'red';
        if (hasPartial) return 'yellow';
        if (answered.length > 0) return 'green';
        return null;
    }

    _hasOpenAvvikelser(avvikelser) {
        const closed = new Set(['Avslutad', 'Avslutade']);
        return (avvikelser || []).some((a) => {
            const status = (a.fields?.['Status'] || 'Öppen').toString().trim();
            return !closed.has(status);
        });
    }

    _updateKlarTabIndicators(fields) {
        const f = fields || this.customerData?.fields || {};
        const savedKyc = this._savedKycFormular || {};

        if (this._isForetagsinformationKlar(f)) {
            this._setTabStatus('foretagsinformation',
                '<i class="fas fa-check-circle tab-status--ok" aria-hidden="true"></i>',
                'Företagsinformation klarmarkerad');
        } else {
            this._setTabStatus('foretagsinformation',
                '<i class="fas fa-exclamation-circle tab-status--warn" aria-hidden="true"></i>',
                'Företagsinformation ej klarmarkerad');
        }

        if (this._isRiskbedomningKlar(f)) {
            this._setTabStatus('ovrigkyc',
                '<i class="fas fa-check-circle tab-status--ok" aria-hidden="true"></i>',
                'Riskbedömning klarmarkerad');
        } else {
            this._setTabStatus('ovrigkyc',
                '<i class="fas fa-exclamation-circle tab-status--warn" aria-hidden="true"></i>',
                'Riskbedömning ej klarmarkerad');
        }

        if (this._isKycFormularKlar(f, savedKyc)) {
            this._setTabStatus('kycformular',
                '<i class="fas fa-check-circle tab-status--ok" aria-hidden="true"></i>',
                'KYC-formulär klarmarkerat');
        } else {
            this._setTabStatus('kycformular',
                '<i class="fas fa-exclamation-circle tab-status--warn" aria-hidden="true"></i>',
                'KYC-formulär ej klarmarkerat');
        }

        const avtalF = this._uppdragsavtalFields;
        if (this._isUppdragsavtalKlar(avtalF, f)) {
            this._setTabStatus('uppdragsavtal',
                '<i class="fas fa-check-circle tab-status--ok" aria-hidden="true"></i>',
                'Uppdragsavtal klarmarkerat');
        } else {
            this._setTabStatus('uppdragsavtal',
                '<i class="fas fa-exclamation-circle tab-status--warn" aria-hidden="true"></i>',
                'Uppdragsavtal ej klarmarkerat');
        }
    }

    async refreshTabIndicators() {
        this._ensureTabStatusElements();
        if (!this.customerId) {
            this._updateKlarTabIndicators({});
            return;
        }
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const opts = getAuthOptsKundkort();
        const f = this.customerData?.fields || {};

        this._updateKlarTabIndicators(f);

        try {
            const [kycRes, avtalRes, uppdragRes, avvikRes, samRes] = await Promise.all([
                fetch(`${baseUrl}/api/kyc-formular/${this.customerId}`, { method: 'GET', ...opts }).catch(() => null),
                fetch(`${baseUrl}/api/uppdragsavtal?customerId=${encodeURIComponent(this.customerId)}`, { method: 'GET', ...opts }).catch(() => null),
                fetch(`${baseUrl}/api/uppdrag?customerId=${encodeURIComponent(this.customerId)}`, { method: 'GET', ...opts }).catch(() => null),
                fetch(`${baseUrl}/api/avvikelser?customerId=${encodeURIComponent(this.customerId)}`, { method: 'GET', ...opts }).catch(() => null),
                fetch(`${baseUrl}/api/samarbete/requests?customerId=${encodeURIComponent(this.customerId)}`, { method: 'GET', ...opts }).catch(() => null)
            ]);

            if (kycRes?.ok) {
                const kycData = await kycRes.json().catch(() => ({}));
                this._savedKycFormular = kycData.kyc || {};
            }

            if (avtalRes?.ok) {
                const avtalData = await avtalRes.json().catch(() => ({}));
                this._uppdragsavtalFields = avtalData.avtal?.fields || null;
            } else {
                this._uppdragsavtalFields = null;
            }

            this._updateKlarTabIndicators(this.customerData?.fields || {});

            let uppdragCount = 0;
            if (uppdragRes?.ok) {
                const uppdragData = await uppdragRes.json().catch(() => ({}));
                const records = Array.isArray(uppdragData.records) ? uppdragData.records : [];
                uppdragCount = records.length;
                this._uppdragCount = uppdragCount;
            }
            if (uppdragCount > 0) {
                this._setTabStatus('uppdrag',
                    `<span class="tab-status--count">${uppdragCount}</span>`,
                    `${uppdragCount} uppdrag upplagda`);
            } else {
                this._setTabStatus('uppdrag', '');
            }

            let avvikelser = [];
            if (avvikRes?.ok) {
                const avvikData = await avvikRes.json().catch(() => ({}));
                avvikelser = avvikData.avvikelser || [];
            }
            if (this._hasOpenAvvikelser(avvikelser)) {
                this._setTabStatus('avvikelser',
                    '<i class="fas fa-exclamation-triangle tab-status--warn" aria-hidden="true"></i>',
                    'Öppna avvikelser finns');
            } else {
                this._setTabStatus('avvikelser', '');
            }

            let requests = [];
            if (samRes?.ok) {
                const samData = await samRes.json().catch(() => ({}));
                requests = samData.requests || [];
            }
            const samState = this._computeSamarbeteTabState(requests);
            if (samState === 'red') {
                this._setTabStatus('samarbete',
                    '<span class="tab-status-bubble tab-status-bubble--red" aria-hidden="true">?</span>',
                    'Förfrågningar utan svar från kund');
            } else if (samState === 'yellow') {
                this._setTabStatus('samarbete',
                    '<span class="tab-status-bubble tab-status-bubble--yellow" aria-hidden="true">?</span>',
                    'Förfrågningar delvis besvarade');
            } else if (samState === 'green') {
                this._setTabStatus('samarbete',
                    '<span class="tab-status-bubble tab-status-bubble--green" aria-hidden="true"><i class="fas fa-comment"></i></span>',
                    'Kund har svarat på förfrågningar');
            } else {
                this._setTabStatus('samarbete', '');
            }
        } catch (e) {
            console.warn('Kunde inte uppdatera flikindikatorer:', e.message);
        }
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
            case 'uppdrag':
                this.loadUppdrag();
                break;
            case 'ovrigkyc':
                this.loadOvrigKYC();
                break;
            case 'kycformular':
                this.loadKYCFormular();
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
            case 'samarbete':
                this.loadSamarbete();
                break;
        }
    }

    async loadUppdrag() {
        const container = document.getElementById('uppdrag-content');
        if (!container) return;

        container.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Laddar uppdrag...</p>
            </div>
        `;

        return this.loadUppdragDataAndRender().catch((e) => {
            console.error('❌ loadUppdrag:', e);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Kunde inte ladda uppdrag.</p>
                </div>
            `;
        });
    }

    _getRiskAtgarderList() {
        const f = this.customerData?.fields || {};
        const raw = (f['Atgarder riskbedomning'] || f['Åtgärder'] || f['Åtgärd'] || '').toString();
        const lines = raw
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => s.replace(/^\s*[-•]\s*/, '').trim())
            .filter(Boolean);
        // Deduplicate while keeping order
        const seen = new Set();
        const out = [];
        for (const l of lines) {
            const k = l.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(l);
        }
        return out;
    }

    async loadUppdragDataAndRender() {
        console.log('[UppdragBoard] loadUppdragDataAndRender anropad', new Error().stack?.split('\n').slice(1, 4).join(' <- '));
        const container = document.getElementById('uppdrag-content');
        if (!container) return;
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const opts = getAuthOptsKundkort();
        const customerId = this.customerId || this.currentCustomerId;
        if (!customerId) throw new Error('Saknar customerId');

        const [uppdragRes, usersRes, samarbeteRes, runsRes] = await Promise.all([
            fetch(`${baseUrl}/api/uppdrag?customerId=${encodeURIComponent(customerId)}`, { method: 'GET', ...opts }),
            fetch(`${baseUrl}/api/byra/anvandare`, { method: 'GET', ...opts }).catch(() => null),
            fetch(`${baseUrl}/api/samarbete/requests?customerId=${encodeURIComponent(customerId)}`, { method: 'GET', ...opts }).catch(() => null),
            fetch(`${baseUrl}/api/uppdrag/runs?customerId=${encodeURIComponent(customerId)}`, { method: 'GET', ...opts }).catch(() => null)
        ]);
        if (!uppdragRes.ok) {
            const err = await uppdragRes.json().catch(() => ({}));
            const msg = err.error || err.message || `HTTP ${uppdragRes.status}`;
            // Special case: Airtable table not installed / missing fields
            if (/Uppdrag-tabellen i Airtable saknar fält/i.test(String(msg))) {
                container.innerHTML = `
                    <div class="uppdrag-tab">
                        <div class="collapsible-card uppdrag-setup-card">
                            <div class="collapsible-header" style="cursor:default;">
                                <div class="collapsible-title"><i class="fas fa-database"></i><span>Installera Uppdrag-tabell i Airtable</span></div>
                            </div>
                            <div class="collapsible-body">
                                <div class="uppdrag-setup-desc">
                                    Uppdrag-funktionen kräver en Airtable-tabell. Jag kan skapa/uppdatera den automatiskt eftersom servern har Airtable-behörighet.
                                </div>
                                <div class="uppdrag-setup-hint" style="margin-bottom:0.75rem;">${this._esc(String(err.details || msg || ''))}</div>
                                <div class="uppdrag-actions">
                                    <button type="button" class="btn btn-primary" id="uppdrag-install-btn">
                                        <i class="fas fa-magic"></i> Installera nu
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                const btn = document.getElementById('uppdrag-install-btn');
                if (btn) {
                    btn.addEventListener('click', async () => {
                        try {
                            btn.disabled = true;
                            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Installerar...';
                            const r1 = await fetch(`${baseUrl}/api/setup/airtable-uppdrag`, { method: 'POST', ...opts });
                            const d1 = await r1.json().catch(() => ({}));
                            if (!r1.ok) throw new Error(d1.error || `HTTP ${r1.status}`);
                            const r2 = await fetch(`${baseUrl}/api/setup/airtable-uppdrag-fields`, { method: 'POST', ...opts });
                            const d2 = await r2.json().catch(() => ({}));
                            if (!r2.ok) throw new Error(d2.error || `HTTP ${r2.status}`);
                            const r3 = await fetch(`${baseUrl}/api/setup/airtable-uppdrag-runs`, { method: 'POST', ...opts });
                            const d3 = await r3.json().catch(() => ({}));
                            if (!r3.ok) throw new Error(d3.error || `HTTP ${r3.status}`);
                            const r4 = await fetch(`${baseUrl}/api/setup/airtable-uppdrag-runs-fields`, { method: 'POST', ...opts });
                            const d4 = await r4.json().catch(() => ({}));
                            if (!r4.ok) throw new Error(d4.error || `HTTP ${r4.status}`);
                            this.showNotification('Uppdrag- och körningstabeller installerade ✅', 'success');
                            this.loadUppdrag();
                        } catch (e) {
                            this.showNotification('Kunde inte installera: ' + (e.message || 'fel'), 'error');
                            btn.disabled = false;
                            btn.innerHTML = '<i class="fas fa-magic"></i> Installera nu';
                        }
                    });
                }
                return;
            }
            throw new Error(msg);
        }

        const uppdragData = await uppdragRes.json().catch(() => ({ records: [] }));
        const usersData = (usersRes && usersRes.ok) ? await usersRes.json() : { users: [] };
        const samarbeteData = (samarbeteRes && samarbeteRes.ok) ? await samarbeteRes.json() : { requests: [] };
        const runsData = (runsRes && runsRes.ok) ? await runsRes.json().catch(() => ({ records: [] })) : { records: [] };
        if (runsRes && !runsRes.ok) {
            const err = await runsRes.json().catch(() => ({}));
            const msg = err.error || err.message || err.details || `HTTP ${runsRes.status}`;
            console.warn('Uppdragskörningar kunde inte hämtas:', runsRes.status, msg);
            if (!window.__clientflowRunsWarned) {
                window.__clientflowRunsWarned = true;
                this.showNotification('Kunde inte ladda uppdragskörningar (fallback: status sparas i uppdragets historik).', 'warning');
            }
        } else if (runsData.tableMissing) {
            console.warn('Uppdragskörningar-tabellen saknas i Airtable:', runsData.hint || '');
        }

        const records = Array.isArray(uppdragData.records) ? uppdragData.records : [];
        this._uppdragCount = records.length;
        if (records.length > 0) {
            this._setTabStatus('uppdrag',
                `<span class="tab-status--count">${records.length}</span>`,
                `${records.length} uppdrag upplagda`);
        } else {
            this._setTabStatus('uppdrag', '');
        }
        const runRecords = Array.isArray(runsData.records) ? runsData.records : [];
        const byraUsers = Array.isArray(usersData.users) ? usersData.users : [];
        const samarbeteReqs = Array.isArray(samarbeteData.requests) ? samarbeteData.requests : [];
        const samarbeteByUppdragTyp = new Map();
        const samarbeteByUppdragId = new Map();
        samarbeteReqs.forEach((r) => {
            if (!r || !r.fromUppdrag) return;
            const t = (r.uppdragTyp || '').toString().trim();
            const id = (r.uppdragId || '').toString().trim();
            if (t) {
                const arr = samarbeteByUppdragTyp.get(t) || [];
                arr.push(r);
                samarbeteByUppdragTyp.set(t, arr);
            }
            if (id) {
                const arr2 = samarbeteByUppdragId.get(id) || [];
                arr2.push(r);
                samarbeteByUppdragId.set(id, arr2);
            }
        });

        const ALL_TYPES = ['Löneuppdrag', 'Momsredovisning', 'Bokslut', 'Deklaration'];
        const _recByType = new Map();
        records.forEach(r => { const t = (r.fields?.['Typ'] || '').toString().trim(); if (t) _recByType.set(t, r); });
        const byType = (typ) => _recByType.get(typ) || null;
        const riskAtgarder = this._getRiskAtgarderList();

        // Används i Samarbete-modalen för att kunna koppla en förfrågan till ett uppdrag
        this._uppdragRecords = records.slice();

        const existingTypes = ALL_TYPES.filter(t => !!byType(t));
        const missingTypes = ALL_TYPES.filter(t => !byType(t));

        const addDisabled = missingTypes.length ? '' : 'disabled';

        // ============================
        // Uppdrag (översikt) – kundvy
        // ============================
        const toDateStr = (iso) => {
            const s = String(iso || '').slice(0, 10);
            return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
        };
        const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = (d) => d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
        const addMonthsIso = (iso, n) => {
            const s = toDateStr(iso);
            if (!s) return '';
            const [y, m, d] = s.split('-').map(Number);
            const base = new Date(y, (m - 1) + n, 1);
            const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
            const day = Math.min(d, last);
            const out = new Date(base.getFullYear(), base.getMonth(), day);
            return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
        };
        const monthsStepFromFreq = (freqRaw) => {
            const f = String(freqRaw || '').toLowerCase();
            if (f.includes('kvartal')) return 3;
            if (f.includes('månad')) return 1;
            if (f.includes('årsvis')) return 12;
            if (f.includes('engång')) return 0;
            return 1;
        };
        const isDoneForPeriod = (fields, instanceDeadlineIso) => {
            const doneAt = String(fields?.['Senast utförd'] || '').trim();
            const nextDeadline = String(instanceDeadlineIso || fields?.['Nästa deadline'] || '').trim();
            const freq = String(fields?.['Frekvens'] || '').toLowerCase();
            if (!doneAt || !nextDeadline) return false;
            const toD = (iso) => {
                const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
                return Number.isNaN(d.getTime()) ? null : d;
            };
            const doneD = toD(doneAt);
            const nextD = toD(nextDeadline);
            if (!doneD || !nextD) return false;
            const start = new Date(nextD.getTime());
            if (freq.includes('kvartal')) start.setMonth(start.getMonth() - 3);
            else if (freq.includes('månad')) start.setMonth(start.getMonth() - 1);
            else if (freq.includes('årsvis')) start.setFullYear(start.getFullYear() - 1);
            else start.setMonth(start.getMonth() - 1);
            return doneD >= start && doneD < nextD;
        };

        const monthNow = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        if (!this._kundUppdragBoardMonth) this._kundUppdragBoardMonth = new Date(monthNow.getFullYear(), monthNow.getMonth(), 1);
        const monthMin = new Date(monthNow.getFullYear(), monthNow.getMonth() - 12, 1);
        const monthMax = new Date(monthNow.getFullYear(), monthNow.getMonth() + 12, 1);

        // Bygg upp instanser för perioden [monthMin..monthMax]
        // Viktigt: visa uppdraget när det är "öppet" (periodstart -> deadline-månad),
        // inte bara i deadline-månaden.
        const instByTypeMonth = new Map(); // typ -> Map(monthKey -> deadlineIso)
        // Primärt: använd Uppdragskörningar-tabellen om den finns (ger korrekt per-körning-koppling).
        // Fallback: använd Uppdrag-tabellen (gamla beteendet) om körningar saknas.
        const instanceSource = (runRecords && runRecords.length) ? runRecords : records;
        for (const r of instanceSource) {
            const f = r.fields || {};
            const typ = String(f['Typ'] || '').trim();
            if (!typ) continue;
            const deadline0 = toDateStr(f['Deadline'] || f['Nästa deadline'] || '');
            if (!deadline0) continue;
            const step = monthsStepFromFreq(f['Frekvens']);
            const map = instByTypeMonth.get(typ) || new Map();
            if (step === 0) {
                // Engång: visa från innevarande månad fram till deadline-månaden
                const endMonth = deadline0.slice(0, 7);
                let cursor = new Date(monthNow.getFullYear(), monthNow.getMonth(), 1);
                const end = new Date(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)) - 1, 1);
                for (let guard = 0; guard < 36; guard++) {
                    if (cursor > monthMax) break;
                    if (cursor > end) break;
                    if (cursor >= monthMin) map.set(monthKey(cursor), deadline0);
                    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
                }
                instByTypeMonth.set(typ, map);
                continue;
            }
            // Öppen-period: från periodstart (deadline - step) fram till deadline-månaden
            const deadlineMonth = deadline0.slice(0, 7);
            let startIso = deadline0;
            if (step > 0) startIso = addMonthsIso(deadline0, -step);
            const startMonth = toDateStr(startIso) ? startIso.slice(0, 7) : deadlineMonth;
            let cursor = new Date(Number(startMonth.slice(0, 4)), Number(startMonth.slice(5, 7)) - 1, 1);
            const end = new Date(Number(deadlineMonth.slice(0, 4)), Number(deadlineMonth.slice(5, 7)) - 1, 1);
            for (let guard = 0; guard < 36; guard++) {
                if (cursor > monthMax) break;
                if (cursor > end) break;
                if (cursor >= monthMin) map.set(monthKey(cursor), deadline0);
                cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            }
            instByTypeMonth.set(typ, map);
        }

        const boardHtml = `
            <div class="uppdragboard-top" style="margin-bottom:0.85rem;">
                <div class="uppdragboard-title">
                    <div class="uppdragboard-period">
                        <button type="button" class="uppdragboard-navbtn" id="kund-uppdragboard-prev" title="Föregående månad" aria-label="Föregående månad"><i class="fas fa-chevron-left"></i></button>
                        <div class="uppdragboard-month" id="kund-uppdragboard-month">—</div>
                        <button type="button" class="uppdragboard-navbtn" id="kund-uppdragboard-next" title="Nästa månad" aria-label="Nästa månad"><i class="fas fa-chevron-right"></i></button>
                    </div>
                </div>
            </div>
            <div class="uppdragboard-table-wrap" style="margin-bottom:1rem;">
                <table class="uppdragboard-table">
                    <thead>
                        <tr>
                            <th class="uppdragboard-th-client" style="width:44%; text-align:left;">Uppdrag</th>
                            <th class="uppdragboard-th-run" style="width:22%; text-align:center;">Klart senast</th>
                            <th class="uppdragboard-th-done" style="width:16%; text-align:center;">Underlag</th>
                            <th class="uppdragboard-th-done" style="width:12%; text-align:center;">Status</th>
                            <th class="uppdragboard-th-arrow" style="width:6%;"></th>
                        </tr>
                    </thead>
                    <tbody id="kund-uppdragboard-tbody"></tbody>
                </table>
            </div>
            <div style="display:flex; justify-content:flex-end; margin-top:0.5rem;">
                <button type="button" class="btn btn-primary btn-sm" id="uppdrag-add-btn-top" ${addDisabled}>
                    <i class="fas fa-plus"></i> Lägg upp uppdrag
                </button>
            </div>
        `;

        const runsSetupHtml = runsData.tableMissing ? `
            <div class="collapsible-card uppdrag-setup-card" style="margin-bottom:1rem;">
                <div class="collapsible-header" style="cursor:default;">
                    <div class="collapsible-title"><i class="fas fa-database"></i><span>Installera tabellen Uppdragskörningar</span></div>
                </div>
                <div class="collapsible-body">
                    <div class="uppdrag-setup-desc">
                        Momsuppdrag och per-period-anteckningar kräver tabellen <strong>Uppdragskörningar</strong> i Airtable. Den saknas eller är felkonfigurerad (403).
                    </div>
                    <div class="uppdrag-setup-hint" style="margin-bottom:0.75rem;">${this._esc(String(runsData.hint || 'Skapa tabellen med knappen nedan.'))}</div>
                    <div class="uppdrag-actions">
                        <button type="button" class="btn btn-primary" id="uppdrag-install-runs-btn">
                            <i class="fas fa-magic"></i> Skapa Uppdragskörningar
                        </button>
                    </div>
                </div>
            </div>
        ` : '';

        container.innerHTML = `
            <div class="uppdrag-tab">
                ${runsSetupHtml}
                ${boardHtml}
                <div id="kund-uppdrag-edit-host" style="display:none; margin-top:1rem;">
                    ${existingTypes.length ? existingTypes.map(t => {
                        if (t === 'Löneuppdrag') return this._renderUppdragKort('Löneuppdrag', 'fa-money-check-alt', byType('Löneuppdrag'), byraUsers, riskAtgarder);
                        if (t === 'Momsredovisning') return this._renderUppdragKort('Momsredovisning', 'fa-receipt', byType('Momsredovisning'), byraUsers, riskAtgarder);
                        if (t === 'Bokslut') return this._renderUppdragKort('Bokslut', 'fa-file-invoice-dollar', byType('Bokslut'), byraUsers, riskAtgarder);
                        if (t === 'Deklaration') return this._renderUppdragKort('Deklaration', 'fa-file-signature', byType('Deklaration'), byraUsers, riskAtgarder, { showDeklaration: true });
                        return '';
                    }).join('') : `
                        <div class="uppdrag-empty" style="padding:0.25rem 0;">
                            <div class="uppdrag-muted">Inga uppdrag upplagda ännu.</div>
                        </div>
                    `}
                </div>
            </div>
        `;

        const renderBoard = () => {
            const monthEl = document.getElementById('kund-uppdragboard-month');
            const tbody = document.getElementById('kund-uppdragboard-tbody');
            if (!monthEl || !tbody) return;
            const cursor = this._kundUppdragBoardMonth;
            monthEl.textContent = monthLabel(cursor);
            const mk = monthKey(cursor);
            const fmtShort = (iso) => {
                const s = toDateStr(iso);
                if (!s) return '—';
                try { return new Date(s + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }); } catch (_) { return s; }
            };
            const fmtLong = (iso) => {
                const s = toDateStr(iso);
                if (!s) return '';
                try { return new Date(s + 'T00:00:00').toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (_) { return s; }
            };
            const parseAnswersArray = (rawText) => {
                const raw = (rawText || '').toString().trim();
                if (!raw || !raw.startsWith('[')) return null;
                try {
                    const arr = JSON.parse(raw);
                    return Array.isArray(arr) ? arr : null;
                } catch (_) {
                    return null;
                }
            };
            const attachmentLink = (att) => {
                if (!att || (!att.url && !att.id)) return '';
                const url = att.url || '#';
                const label = this._esc(att.filename || att.name || 'Bifogad fil');
                return `<a href="${this._esc(url)}" target="_blank" rel="noopener" class="samarbete-file-link"><i class="fas fa-download"></i> ${label}</a>`;
            };
            const openKey = (this._kundUppdragBoardOpenKey || this._kundUppdragBoardOpenTyp || '').toString();
            const todayIso = (() => {
                try { return new Date().toISOString().slice(0, 10); } catch (_) { return ''; }
            })();
            const quarterKeyForMonth = (ym) => {
                const y = Number(String(ym || '').slice(0, 4));
                const m = Number(String(ym || '').slice(5, 7));
                if (!y || !m) return '';
                const q = Math.ceil(m / 3);
                return `${y}-Q${q}`;
            };
            const yearKeyForMonth = (ym) => {
                const y = Number(String(ym || '').slice(0, 4));
                return y ? String(y) : '';
            };
            const getModeForUppdrag = (typ, freqStr) => {
                const tt = (typ || '').toString().trim();
                const ff = (freqStr || '').toString().toLowerCase();
                if (tt === 'Momsredovisning') {
                    if (ff.includes('kvartal')) return 'quarter';
                    if (ff.includes('år')) return 'year';
                    return 'month';
                }
                if (tt === 'Bokslut' || tt === 'Deklaration') return 'year';
                return 'month';
            };
            const periodMatchesRun = (periodStr, expectedKey) => {
                const p = (periodStr || '').toString().trim();
                const exp = (expectedKey || '').toString().trim();
                if (!p || !exp) return false;
                if (p === exp) return true;
                // fallback: vissa perioder kan sparas med extra text
                if (p.includes(exp)) return true;
                // månad: matcha även på yyyy + mm om exp = YYYY-MM
                if (/^\d{4}-\d{2}$/.test(exp)) {
                    const yyyy = exp.slice(0, 4);
                    const mm = exp.slice(5, 7);
                    return (p.includes(yyyy) && p.includes(mm));
                }
                return false;
            };

            const runByTypPeriod = new Map();
            (Array.isArray(runRecords) ? runRecords : []).forEach(rr => {
                const ff = rr?.fields || {};
                const typ = String(ff['Typ'] || '').trim();
                const pk = String(ff['PeriodKey'] || '').trim();
                if (!typ || !pk) return;
                runByTypPeriod.set(`${typ}|||${pk}`, rr);
            });

            const runStatusFromUppdragHistory = (uppdragFields, periodKey) => {
                const pk = String(periodKey || '').trim();
                if (!pk) return '';
                let history = [];
                try {
                    const raw = (uppdragFields?.['Historik'] || '').toString().trim();
                    if (raw && raw.startsWith('[')) history = JSON.parse(raw);
                    if (!Array.isArray(history)) history = [];
                } catch (_) { history = []; }
                const hit = history.find(it => it && String(it.periodKey || '').trim() === pk);
                return hit ? String(hit.status || '').trim() : '';
            };

            const statusBadgeFromRunStatus = (st) => {
                const s = String(st || '').trim();
                if (!s) return '';
                const style = (s === 'Klar')
                    ? 'background:#dcfce7; color:#166534; border-color:#86efac;'
                    : (s === 'Sen')
                        ? 'background:#fee2e2; color:#991b1b; border-color:#fecaca;'
                        : (s === 'Pågående')
                            ? 'background:#dbeafe; color:#1d4ed8; border-color:#bfdbfe;'
                            : 'background:#f1f5f9; color:#334155; border-color:#e2e8f0;';
                const icon = (s === 'Klar') ? 'fa-check' : (s === 'Sen') ? 'fa-exclamation-triangle' : (s === 'Pågående') ? 'fa-spinner' : 'fa-calendar';
                return `<span class="uppdragboard-progress" style="${style}"><i class="fas ${icon}"></i> ${this._esc(s)}</span>`;
            };

            const runStatusOptionsHtml = (selected) => {
                const opts = ['Planerad', 'Pågående', 'Klar', 'Sen'];
                const sel = String(selected || '').trim();
                return opts.map(o => `<option value="${this._esc(o)}" ${o === sel ? 'selected' : ''}>${this._esc(o)}</option>`).join('');
            };
            const rowContexts = [];
            existingTypes.forEach((t) => {
                const rec = byType(t);
                if (!rec) {
                    console.warn('[UppdragBoard] byType returnerade null för typ:', t, '– records:', records.length, records.map(r => r?.fields?.['Typ']));
                    return;
                }
                const f = rec.fields || {};
                const freq = (f['Frekvens'] || '').toString().trim() || '—';
                const modeForPrefillDefault = getModeForUppdrag(t, freq);
                const defaultPeriodKey = (modeForPrefillDefault === 'quarter')
                    ? quarterKeyForMonth(mk)
                    : (modeForPrefillDefault === 'year')
                        ? yearKeyForMonth(mk)
                        : mk;

                if (t === 'Momsredovisning' && window.MomsPeriod && (MomsPeriod.isMonthlyFreq(freq) || MomsPeriod.isQuarterlyFreq(freq))) {
                    let visible = (Array.isArray(runRecords) ? runRecords : [])
                        .filter((rr) => String(rr?.fields?.['Typ'] || '').trim() === 'Momsredovisning')
                        .filter((rr) => MomsPeriod.runVisibleInBoardMonth(rr.fields, mk, todayIso));
                    visible.sort((a, b) => String(a?.fields?.['PeriodKey'] || '').localeCompare(String(b?.fields?.['PeriodKey'] || '')));
                    if (!visible.length) {
                        const instMap = instByTypeMonth.get(t) || new Map();
                        rowContexts.push({
                            t, rec, f, freq,
                            boardKey: t,
                            displayTitle: t,
                            instDeadline: instMap.get(mk) || '',
                            prefillPeriodKey: defaultPeriodKey,
                            runRec: runByTypPeriod.get(`${t}|||${defaultPeriodKey}`) || null
                        });
                    } else {
                        visible.forEach((rr) => {
                            const pk = String(rr?.fields?.['PeriodKey'] || '').trim();
                            rowContexts.push({
                                t, rec, f, freq,
                                boardKey: `${t}|||${pk}`,
                                displayTitle: String(rr?.fields?.['Period Label'] || '').trim() || MomsPeriod.displayLabel(pk, freq),
                                instDeadline: String(rr?.fields?.['Deadline'] || '').trim(),
                                prefillPeriodKey: pk,
                                runRec: rr
                            });
                        });
                    }
                    return;
                }

                const instMap = instByTypeMonth.get(t) || new Map();
                const instDeadline = instMap.get(mk) || '';
                rowContexts.push({
                    t, rec, f, freq,
                    boardKey: t,
                    displayTitle: t,
                    instDeadline,
                    prefillPeriodKey: defaultPeriodKey,
                    runRec: runByTypPeriod.get(`${t}|||${defaultPeriodKey}`) || null
                });
            });

            const rows = rowContexts.map((ctx) => {
                const t = ctx.t;
                const rec = ctx.rec;
                const f = ctx.f;
                const instDeadline = ctx.instDeadline || '';
                const done = instDeadline ? isDoneForPeriod(f, instDeadline) : false;
                const freq = ctx.freq || '—';
                const boardKey = ctx.boardKey || t;
                const displayTitle = ctx.displayTitle || t;
                const autoOn = !!f['Auto underlagsförfrågan'];
                const sendDayNum = parseInt(String(f['Underlagsutskick dag'] || '').trim(), 10);
                const deadlineDayNum = parseInt(String(f['Underlagsdeadline dag'] || '').trim(), 10);
                const sendIso = (Number.isFinite(sendDayNum) && sendDayNum >= 1 && sendDayNum <= 28) ? `${mk}-${String(sendDayNum).padStart(2, '0')}` : '';
                const custDeadlineIso = (Number.isFinite(deadlineDayNum) && deadlineDayNum >= 1 && deadlineDayNum <= 28) ? `${mk}-${String(deadlineDayNum).padStart(2, '0')}` : '';
                const autoChip = autoOn
                    ? `<span class="uppdragboard-badge is-tooltip" style="margin-left:0.4rem;" role="button" tabindex="0" aria-label="Auto-utskick info" data-kund-action="toggle-auto-tooltip"
                        data-auto-on="${autoOn ? '1' : '0'}"
                        data-auto-ym="${this._esc(mk || '')}"
                        data-auto-send-iso="${this._esc(sendIso || '')}"
                        data-auto-send-day="${this._esc(Number.isFinite(sendDayNum) ? String(sendDayNum) : (f['Underlagsutskick dag'] ? String(f['Underlagsutskick dag']) : ''))}"
                        data-auto-deadline-iso="${this._esc(custDeadlineIso || '')}"
                        data-auto-deadline-day="${this._esc(Number.isFinite(deadlineDayNum) ? String(deadlineDayNum) : (f['Underlagsdeadline dag'] ? String(f['Underlagsdeadline dag']) : ''))}"
                        data-auto-period="${this._esc(f['Underlagsperiod'] ? String(f['Underlagsperiod']) : '')}"
                        data-auto-rec-name="${this._esc(f['Underlagsmottagare namn'] ? String(f['Underlagsmottagare namn']) : '')}"
                        data-auto-rec-email="${this._esc(f['Underlagsmottagare e-post'] ? String(f['Underlagsmottagare e-post']) : '')}">
                        <i class="fas fa-paper-plane"></i> Auto
                    </span>`
                    : '';
                const runHtml = instDeadline
                    ? `<div><strong>${fmtShort(instDeadline)}</strong></div><div style="font-size:0.8rem; color:#94a3b8;">${this._esc(freq)}</div>`
                    : `<div style="font-size:0.85rem; color:#94a3b8;">—</div>`;
                const isOpen = openKey === boardKey;
                const samList = (() => {
                    const byTyp = (samarbeteByUppdragTyp.get(t) || []);
                    const byId = (samarbeteByUppdragId.get(String(rec.id || '').trim()) || []);
                    const uniq = new Map();
                    byTyp.concat(byId).forEach(x => { if (x && x.id) uniq.set(String(x.id), x); });
                    return Array.from(uniq.values()).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
                })();
                const stripFileObligatorisk = (s) => (s || '').replace(/\s*\[fil obligatorisk\]\s*$/gi, '').trim();
                const isReqFullyAnswered = (s) => {
                    const status = (s?.status || '').toString().trim().toLowerCase();
                    if (status === 'besvarad' || status === 'stängd' || status === 'klar') return true;
                    const respTxt = (s?.responseText || '').toString().trim();
                    const answersArray = parseAnswersArray(respTxt);
                    const titleFull = stripFileObligatorisk((s?.title || '').toString().trim());
                    const titleLines = titleFull.split('\n').map(x => x.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
                    const total = titleLines.length || (Array.isArray(answersArray) ? answersArray.length : 0);
                    if (!total) return false;
                    const answeredCount = (Array.isArray(answersArray) && total)
                        ? titleLines.reduce((acc, _, idx) => {
                            const a = answersArray[idx] || {};
                            const hasText = a.text && String(a.text).trim();
                            const hasFile = a.filename && String(a.filename).trim();
                            return acc + ((hasText || hasFile) ? 1 : 0);
                        }, 0)
                        : 0;
                    return answeredCount >= total;
                };
                const prefillPeriodKey = ctx.prefillPeriodKey || mk;
                const runRec = ctx.runRec || runByTypPeriod.get(`${t}|||${prefillPeriodKey}`) || null;
                // En källa: status i uppdragets historik (så det alltid matchar uppdragsöversikten).
                // Om vi även har en runRec synkar backend den best-effort.
                const runStatus = runStatusFromUppdragHistory(f, prefillPeriodKey) || '';

                const samForRun = samList.filter(s => periodMatchesRun(s.uppdragPeriod, prefillPeriodKey));
                const underlagTotal = samForRun.length;
                const underlagDone = samForRun.reduce((acc, s) => acc + (isReqFullyAnswered(s) ? 1 : 0), 0);
                const anyLate = samForRun.some(s => {
                    const dl = String(s?.deadline || '').slice(0, 10);
                    return !!dl && !!todayIso && dl < todayIso && !isReqFullyAnswered(s);
                });
                const underlagState = (underlagTotal === 0)
                    ? 'none'
                    : (underlagDone >= underlagTotal)
                        ? 'done'
                        : (anyLate ? 'late' : 'wait');
                const underlagHtml = (underlagTotal === 0)
                    ? `<span class="uppdrag-muted">—</span>`
                    : `<span class="uppdragboard-progress" style="${
                        underlagState === 'done'
                            ? 'background:#dcfce7; color:#166534; border-color:#86efac;'
                            : underlagState === 'late'
                                ? 'background:#fee2e2; color:#991b1b; border-color:#fecaca;'
                                : 'background:#fef9c3; color:#854d0e; border-color:#fde68a;'
                    }">${underlagDone}/${underlagTotal}</span>`;

                const samHtml = `
                    <div class="uppdrag-view-field uppdrag-view-field--plain" style="margin-top:1.35rem;">
                        <div class="uppdrag-view-label">Underlagsförfrågningar</div>
                        ${samForRun.length ? `
                            <div class="samarbete-list samarbete-list--plain" style="margin-top:0.35rem;">
                                ${samForRun.slice(0, 6).map(s => {
                                    const respTxt = (s.responseText || '').toString().trim();
                                    const answersArray = parseAnswersArray(respTxt);
                                    const attachments = Array.isArray(s.responseAttachment) ? s.responseAttachment : [];

                                    const titleFull = stripFileObligatorisk((s.title || 'Förfrågan').toString().trim());
                                    const titleLines = titleFull.split('\n').map(x => x.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);

                                    let qaHtml = '';
                                    if (titleLines.length > 0) {
                                        qaHtml = this.buildSamarbeteQaTableHtml(titleLines, answersArray, attachments, {
                                            escape: (s) => this._esc(s),
                                            attachmentLink,
                                            qMaxLen: 120
                                        });
                                    }

                                    return `
                                        <div class="samarbete-list-item samarbete-list-item--plain">
                                            ${qaHtml ? `<div class="samarbete-block samarbete-block--questions">${qaHtml}</div>` : `<div class="uppdrag-muted">—</div>`}
                                        </div>`;
                                }).join('')}
                            </div>
                        ` : `<div class="uppdrag-muted">Inga skickade förfrågningar kopplade till denna körning ännu.</div>`}
                    </div>
                `;

                const runningNote = (f['Anteckning för denna körning'] || f['Anteckning'] || '').toString();
                const docsKey = `${t}:${mk}`;
                const docsDeadlineKey = String(instDeadline || '').slice(0, 10);
                const attFieldName = Array.isArray(f['Dokumentation']) ? 'Dokumentation' : (Array.isArray(f['Attachments']) ? 'Attachments' : null);
                const allAtt = attFieldName ? (f[attFieldName] || []) : [];
                const runAtt = (Array.isArray(allAtt) && docsDeadlineKey)
                    ? allAtt.filter(a => String(a?.filename || '').includes(docsDeadlineKey)).slice(0, 10)
                    : [];
                const runAttHtml = runAtt.length
                    ? `<div class="uppdrag-view-list">${runAtt.map(a => {
                        const fn = this._esc(String(a?.filename || 'Bilaga'));
                        const url = this._esc(String(a?.url || ''));
                        return url
                            ? `<div class="uppdrag-view-list-item"><i class="fas fa-paperclip"></i><a href="${url}" target="_blank" rel="noopener noreferrer">${fn}</a></div>`
                            : `<div class="uppdrag-view-list-item"><i class="fas fa-paperclip"></i>${fn}</div>`;
                    }).join('')}</div>`
                    : ``;

                const detailsHtml = `
                    <div class="uppdragboard-details-inner">
                        <div class="uppdragboard-details-top">
                            <div class="uppdrag-view-field uppdrag-view-field--plain">
                                <div class="uppdrag-view-label">Rutin / instruktion</div>
                                <div class="uppdrag-view-text">${(f['Rutin'] || '').toString().trim() ? this._esc(String(f['Rutin'])) : '<span class="uppdrag-muted">Ingen rutin sparad.</span>'}</div>
                            </div>
                        </div>
                        ${runRec ? `
                          <div class="uppdrag-view-field uppdrag-view-field--plain" style="margin-top:0.85rem;">
                            <div class="uppdrag-view-label">Status för uppdragskörning</div>
                            <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-top:0.35rem;">
                              <select class="form-select uppdrag-run-status-select"
                                data-kund-action="set-run-status"
                                data-run-id="${this._esc(String(runRec.id || ''))}"
                                data-run-typ="${this._esc(String(t || ''))}"
                                data-run-period="${this._esc(String(prefillPeriodKey || ''))}">
                                ${runStatusOptionsHtml(runStatus || 'Planerad')}
                              </select>
                              <span class="uppdrag-muted" data-kund-run-status-msg="${this._esc(String(runRec.id || ''))}" style="margin:0;"></span>
                            </div>
                          </div>
                        ` : ``}
                        ${samHtml}
                        <div style="display:flex; justify-content:flex-end; margin-top:0.5rem;">
                            <button type="button" class="btn btn-primary btn-sm"
                                data-kund-action="begar-underlag"
                                data-kund-uppdrag-id="${this._esc(String(rec.id || ''))}"
                                data-kund-uppdrag-period="${this._esc(String(prefillPeriodKey || ''))}">
                                <i class="fas fa-paper-plane"></i> Begär underlag
                            </button>
                        </div>
                        <div class="form-group" style="margin-top:0.9rem; margin-bottom:0;">
                            <div class="uppdrag-view-label" style="margin-bottom:0.35rem;">Anteckning (för denna körning)</div>
                            ${(runningNote || '').toString().trim()
                                ? `
                                    <textarea class="kunduppgifter-input uppdrag-run-note" rows="3" data-kund-note-typ="${this._esc(t)}" placeholder="Anteckning..." readonly>${this._esc(runningNote)}</textarea>
                                    <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem; flex-wrap:wrap;">
                                        <button type="button" class="btn btn-secondary btn-sm" data-kund-action="toggle-note-edit" data-kund-mode="edit" data-kund-typ="${this._esc(t)}">
                                            <i class="fas fa-pen"></i> Redigera
                                        </button>
                                        <span class="uppdrag-muted" data-kund-note-status="${this._esc(t)}" style="margin:0;"></span>
                                    </div>
                                `
                                : `
                                    <button type="button" class="btn btn-secondary btn-sm" data-kund-action="create-note" data-kund-typ="${this._esc(t)}">
                                        <i class="fas fa-plus"></i> Skapa anteckning för körningen
                                    </button>
                                    <div style="margin-top:0.6rem; display:none;" data-kund-note-wrap="${this._esc(t)}">
                                        <textarea class="kunduppgifter-input uppdrag-run-note" rows="3" data-kund-note-typ="${this._esc(t)}" placeholder="Anteckning..."></textarea>
                                        <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem; flex-wrap:wrap;">
                                            <button type="button" class="btn btn-secondary btn-sm" data-kund-action="save-note" data-kund-typ="${this._esc(t)}">
                                                <i class="fas fa-save"></i> Spara anteckning
                                            </button>
                                            <span class="uppdrag-muted" data-kund-note-status="${this._esc(t)}" style="margin:0;"></span>
                                        </div>
                                    </div>
                                `}
                        </div>

                        <div class="form-group" style="margin-top:0.9rem; margin-bottom:0;">
                            <div class="uppdrag-view-label" style="margin-bottom:0.35rem;">Dokumentation för denna körning</div>
                            <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                                <input type="file" class="kunduppgifter-input" style="padding:0.45rem; display:none;" data-kund-docs-input="${this._esc(docsKey)}" multiple />
                                <button type="button" class="btn btn-secondary btn-sm" data-kund-action="upload-docs" data-kund-typ="${this._esc(t)}" data-kund-deadline="${this._esc(docsDeadlineKey)}" data-kund-docs-key="${this._esc(docsKey)}">
                                    <i class="fas fa-upload"></i> Ladda upp
                                </button>
                                <span class="uppdrag-muted" data-kund-docs-status="${this._esc(docsKey)}" style="margin:0;"></span>
                            </div>
                            <div data-kund-docs-list="${this._esc(docsKey)}" style="margin-top:0.5rem;">${runAttHtml}</div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; margin-top:0.9rem;">
                            <button type="button" class="btn btn-ghost btn-sm"
                                title="Redigera uppdrag"
                                aria-label="Redigera uppdrag"
                                data-kund-action="edit-uppdrag"
                                data-kund-edit-typ="${this._esc(t)}">
                                <i class="fas fa-pen"></i>
                            </button>
                        </div>
                    </div>
                `;

                const statusHtml = (instDeadline || runStatus)
                    ? (runRec
                        ? `
                            <div class="uppdragboard-statuscell">
                              <select class="form-select uppdragboard-status-select"
                                aria-label="Status"
                                title="Ändra status"
                                data-kund-action="set-run-status"
                                data-run-id="${this._esc(String(runRec.id || ''))}"
                                data-run-typ="${this._esc(String(t || ''))}"
                                data-run-period="${this._esc(String(prefillPeriodKey || ''))}">
                                ${runStatusOptionsHtml(runStatus || 'Planerad')}
                              </select>
                              <span class="uppdrag-muted uppdragboard-status-msg" data-kund-run-status-msg="${this._esc(String(runRec.id || ''))}"></span>
                            </div>
                          `
                        : `
                            <div class="uppdragboard-statuscell">
                              <select class="form-select uppdragboard-status-select"
                                aria-label="Status"
                                title="Ändra status"
                                data-kund-action="set-run-status"
                                data-run-id=""
                                data-run-typ="${this._esc(String(t || ''))}"
                                data-run-period="${this._esc(String(prefillPeriodKey || ''))}">
                                ${runStatusOptionsHtml(runStatus || 'Planerad')}
                              </select>
                              <span class="uppdrag-muted uppdragboard-status-msg" data-kund-run-status-msg="fallback:${this._esc(String(t || ''))}:${this._esc(String(prefillPeriodKey || ''))}"></span>
                            </div>
                          `
                    )
                    : `<span class="uppdragboard-progress" style="opacity:.65;">Ingen körning</span>`;

                return `
                <tr class="uppdragboard-row ${isOpen ? 'is-open' : ''}" data-kund-board-key="${this._esc(boardKey)}" data-kund-board-typ="${this._esc(t)}">
                    <td>
                        <div class="uppdragboard-client">
                            <span class="uppdragboard-link">${this._esc(displayTitle)}</span>
                            ${autoChip}
                        </div>
                    </td>
                    <td>${runHtml}</td>
                    <td style="text-align:center;">${underlagHtml}</td>
                    <td>${statusHtml}</td>
                    <td class="uppdragboard-arrow">
                        <button type="button" class="uppdragboard-expandbtn" title="Visa mer" aria-label="Visa mer" data-kund-board-key="${this._esc(boardKey)}" data-kund-toggle-typ="${this._esc(t)}">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </td>
                </tr>
                <tr class="uppdragboard-details" data-kund-details-for="${this._esc(boardKey)}" style="${isOpen ? '' : 'display:none;'}">
                    <td colspan="5">${detailsHtml}</td>
                </tr>
                `;
            }).filter(Boolean).join('');
            if (!rows && existingTypes.length) {
                console.error('[UppdragBoard] rows blev tomt trots existingTypes:', existingTypes, '– records:', records.map(r => ({ id: r?.id, typ: r?.fields?.['Typ'] })));
            }
            tbody.innerHTML = rows || `<tr><td colspan="5" class="uppdragboard-empty">Inga uppdrag.</td></tr>`;
        };

        const installRunsBtn = document.getElementById('uppdrag-install-runs-btn');
        if (installRunsBtn) {
            installRunsBtn.addEventListener('click', async () => {
                try {
                    installRunsBtn.disabled = true;
                    installRunsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Skapar...';
                    const r3 = await fetch(`${baseUrl}/api/setup/airtable-uppdrag-runs`, { method: 'POST', ...opts });
                    const d3 = await r3.json().catch(() => ({}));
                    if (!r3.ok) throw new Error(d3.error || `HTTP ${r3.status}`);
                    const r4 = await fetch(`${baseUrl}/api/setup/airtable-uppdrag-runs-fields`, { method: 'POST', ...opts });
                    const d4 = await r4.json().catch(() => ({}));
                    if (!r4.ok) throw new Error(d4.error || `HTTP ${r4.status}`);
                    this.showNotification('Uppdragskörningar installerad ✅', 'success');
                    window.__clientflowRunsWarned = false;
                    this.loadUppdrag();
                } catch (e) {
                    this.showNotification('Kunde inte skapa tabellen: ' + (e.message || 'fel'), 'error');
                    installRunsBtn.disabled = false;
                    installRunsBtn.innerHTML = '<i class="fas fa-magic"></i> Skapa Uppdragskörningar';
                }
            });
        }

        const prevBtn = document.getElementById('kund-uppdragboard-prev');
        const nextBtn = document.getElementById('kund-uppdragboard-next');
        if (prevBtn) prevBtn.addEventListener('click', () => {
            const d = this._kundUppdragBoardMonth;
            const next = new Date(d.getFullYear(), d.getMonth() - 1, 1);
            if (next < monthMin) return;
            this._kundUppdragBoardMonth = next;
            renderBoard();
        });
        if (nextBtn) nextBtn.addEventListener('click', () => {
            const d = this._kundUppdragBoardMonth;
            const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            if (next > monthMax) return;
            this._kundUppdragBoardMonth = next;
            renderBoard();
        });

        // Auto-tooltip overlay (för att undvika clipping/scroll inne i kort)
        const ensureAutoTooltipOverlay = () => {
            let el = document.getElementById('auto-tooltip-overlay');
            if (el) return el;
            el = document.createElement('div');
            el.id = 'auto-tooltip-overlay';
            el.className = 'uppdragboard-tooltip-overlay';
            el.style.display = 'none';
            document.body.appendChild(el);
            return el;
        };
        const hideAutoTooltipOverlay = (opts = {}) => {
            const { force = false } = opts || {};
            const el = document.getElementById('auto-tooltip-overlay');
            if (!el) return;
            if (!force && el.getAttribute('data-pinned') === '1') return;
            el.style.display = 'none';
            el.removeAttribute('data-for');
            el.setAttribute('data-pinned', '0');
        };
        const showAutoTooltipOverlayFor = (badge, opts = {}) => {
            const { pin = false } = opts || {};
            if (!badge) return;
            const el = ensureAutoTooltipOverlay();

            const autoOn = (badge.getAttribute('data-auto-on') || '0') === '1';
            const ym = (badge.getAttribute('data-auto-ym') || '').toString();
            const sendIso = (badge.getAttribute('data-auto-send-iso') || '').toString();
            const sendDay = (badge.getAttribute('data-auto-send-day') || '').toString();
            const deadlineIso = (badge.getAttribute('data-auto-deadline-iso') || '').toString();
            const deadlineDay = (badge.getAttribute('data-auto-deadline-day') || '').toString();
            const period = (badge.getAttribute('data-auto-period') || '').toString();
            const recName = (badge.getAttribute('data-auto-rec-name') || '').toString();
            const recEmail = (badge.getAttribute('data-auto-rec-email') || '').toString();

            const esc = (s) => this._esc((s == null) ? '' : String(s));
            const fmtDate = (iso) => {
                const t = (iso || '').toString().trim();
                if (!t) return '';
                try { return fmtLong(t); } catch (_) { return t; }
            };

            const computedSendIso = (!sendIso && ym && sendDay) ? `${ym}-${String(sendDay).padStart(2, '0')}` : sendIso;
            const sendWhen = computedSendIso
                ? `${esc(fmtDate(computedSendIso))}${(sendDay ? ` <span style="color:#64748b;">(dag ${esc(sendDay)})</span>` : '')}`
                : (sendDay ? `dag ${esc(sendDay)}` : '');

            el.innerHTML = [
                `<div><strong>Auto-utskick sker:</strong> ${sendWhen || (autoOn ? 'På' : 'Av')}</div>`,
                (deadlineIso
                    ? `<div><strong>Kund-deadline:</strong> ${esc(fmtDate(deadlineIso))}${(deadlineDay ? ` <span style="color:#64748b;">(dag ${esc(deadlineDay)})</span>` : '')}</div>`
                    : (deadlineDay ? `<div><strong>Kund-deadline:</strong> dag ${esc(deadlineDay)}</div>` : '')),
                (period ? `<div><strong>Avser:</strong> ${esc(period)}</div>` : ''),
                ((recName || recEmail)
                    ? `<div><strong>Mottagare:</strong> ${esc(recName)}${(recEmail ? ` <span style="color:#64748b;">(${esc(recEmail)})</span>` : '')}</div>`
                    : '')
            ].filter(Boolean).join('');

            el.setAttribute('data-pinned', pin ? '1' : '0');
            const id = badge.id || '';
            el.setAttribute('data-for', id || 'auto-badge');
            el.style.display = '';

            // Positionera likt help-popover, men med vit tooltip-stil
            const r = badge.getBoundingClientRect();
            const margin = 8;
            const maxW = Math.min(360, Math.max(240, window.innerWidth - 2 * margin));
            el.style.maxWidth = maxW + 'px';
            const pr = el.getBoundingClientRect();

            let left = r.left;
            left = Math.min(left, window.innerWidth - pr.width - margin);
            left = Math.max(margin, left);

            let top = r.bottom + 8;
            if (top + pr.height > window.innerHeight - margin) {
                top = r.top - pr.height - 8;
            }
            top = Math.max(margin, top);

            el.style.left = `${Math.round(left)}px`;
            el.style.top = `${Math.round(top)}px`;
        };

        // Klick: toggle detaljer + redigera från översikten
        // Avregistrera gamla lyssnare så att vi aldrig kör en stale renderBoard-closure
        if (this._kundUppdragBoardAbort) this._kundUppdragBoardAbort.abort();
        this._kundUppdragBoardAbort = new AbortController();
        const _boardSignal = this._kundUppdragBoardAbort.signal;
        {
            container.addEventListener('click', (e) => {
                // Toggle Samarbete-mini-kort in uppdrag-details
                const samHead = e.target.closest('.samarbete-item-head--toggle');
                if (samHead && container.contains(samHead)) {
                    const item = samHead.closest('.samarbete-list-item--collapsible');
                    if (item) {
                        item.classList.toggle('collapsed');
                        samHead.setAttribute('aria-expanded', item.classList.contains('collapsed') ? 'false' : 'true');
                        return;
                    }
                }

                // Begär underlag direkt från uppdragets detaljvy (förvalt uppdrag + period)
                const begarBtn = e.target.closest('[data-kund-action="begar-underlag"]');
                if (begarBtn) {
                    e.preventDefault();
                    const uppdragId = begarBtn.getAttribute('data-kund-uppdrag-id') || '';
                    const uppdragPeriod = begarBtn.getAttribute('data-kund-uppdrag-period') || '';
                    this.openBegarUnderlagModal(null, { uppdragId, uppdragPeriod });
                    return;
                }

                // Redigera uppdrag via liten penna i detaljvyn
                const editBtn = e.target.closest('[data-kund-action="edit-uppdrag"]');
                if (editBtn) {
                    e.preventDefault();
                    const t = editBtn.getAttribute('data-kund-edit-typ') || '';
                    const host = document.getElementById('kund-uppdrag-edit-host');
                    if (host) host.style.display = '';
                    const target = document.querySelector(`[data-uppdrag-typ="${CSS.escape(t)}"]`);
                    if (target) {
                        try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
                        target.classList.remove('is-collapsed');
                        target.querySelector('[data-action="toggle-edit"]')?.click();
                    }
                    return;
                }

                const toggle = e.target.closest('[data-kund-board-key]') || e.target.closest('[data-kund-toggle-typ]');
                if (toggle) {
                    const key = toggle.getAttribute('data-kund-board-key') || toggle.getAttribute('data-kund-toggle-typ') || '';
                    this._kundUppdragBoardOpenKey = (this._kundUppdragBoardOpenKey === key) ? '' : key;
                    this._kundUppdragBoardOpenTyp = toggle.getAttribute('data-kund-toggle-typ') || '';
                    try { renderBoard(); } catch (err) { console.error('[UppdragBoard] renderBoard kastade fel vid toggle:', err); }
                    const anyOpen = !!(this._kundUppdragBoardOpenKey || '');
                    const tbody = document.getElementById('kund-uppdragboard-tbody');
                    if (tbody) tbody.classList.toggle('uppdragboard-has-open', anyOpen);
                    return;
                }

                // Auto-tooltip för Auto-badge (click-to-pin via overlay)
                const autoBadge = e.target.closest('[data-kund-action="toggle-auto-tooltip"]');
                if (autoBadge && container.contains(autoBadge)) {
                    e.preventDefault();
                    const overlay = document.getElementById('auto-tooltip-overlay');
                    const alreadyForThis = overlay && overlay.style.display !== 'none' && (overlay.getAttribute('data-pinned') === '1');
                    if (alreadyForThis) {
                        hideAutoTooltipOverlay({ force: true });
                    } else {
                        showAutoTooltipOverlayFor(autoBadge, { pin: true });
                    }
                    return;
                }

                // Skapa anteckning (visar textarea)
                const createNoteBtn = e.target.closest('[data-kund-action="create-note"]');
                if (createNoteBtn) {
                    e.preventDefault();
                    const typ = createNoteBtn.getAttribute('data-kund-typ') || '';
                    const wrap = container.querySelector(`[data-kund-note-wrap="${CSS.escape(typ)}"]`);
                    if (wrap) {
                        wrap.style.display = '';
                        const ta = wrap.querySelector(`textarea[data-kund-note-typ="${CSS.escape(typ)}"]`);
                        try { ta && ta.focus(); } catch (_) {}
                    }
                    createNoteBtn.style.display = 'none';
                    return;
                }

                // Redigera / spara anteckning när det redan finns text (penna -> spara)
                const toggleEditBtn = e.target.closest('[data-kund-action="toggle-note-edit"]');
                if (toggleEditBtn) {
                    e.preventDefault();
                    const typ = toggleEditBtn.getAttribute('data-kund-typ') || '';
                    const mode = (toggleEditBtn.getAttribute('data-kund-mode') || 'edit').toLowerCase();
                    const textarea = container.querySelector(`textarea[data-kund-note-typ="${CSS.escape(typ)}"]`);
                    const statusEl = container.querySelector(`[data-kund-note-status="${CSS.escape(typ)}"]`);

                    if (mode === 'edit') {
                        if (textarea) {
                            textarea.removeAttribute('readonly');
                            try { textarea.focus(); } catch (_) {}
                        }
                        toggleEditBtn.setAttribute('data-kund-mode', 'save');
                        toggleEditBtn.innerHTML = '<i class="fas fa-save"></i> Spara anteckning';
                        if (statusEl) statusEl.textContent = '';
                        return;
                    }

                    const note = (textarea?.value || '').toString();
                    if (statusEl) statusEl.textContent = 'Sparar...';
                    fetch(`${baseUrl}/api/uppdrag`, {
                        method: 'POST',
                        ...getAuthOptsKundkort(),
                        headers: { 'Content-Type': 'application/json', ...(getAuthOptsKundkort().headers || {}) },
                        body: JSON.stringify({ customerId, typ, fields: { 'Anteckning för denna körning': note } })
                    })
                        .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; }))
                        .then((d) => {
                            if (statusEl) statusEl.textContent = d.warning ? String(d.warning) : 'Sparat.';
                            // Uppdatera lokalt cache
                            const rec = _recByType.get(typ) || records.find(x => String(x?.fields?.['Typ'] || '') === String(typ));
                            if (rec && rec.fields) rec.fields['Anteckning för denna körning'] = note;
                            setTimeout(() => { if (statusEl && statusEl.textContent === 'Sparat.') statusEl.textContent = ''; }, 2000);

                            if (String(note || '').trim()) {
                                if (textarea) textarea.setAttribute('readonly', 'readonly');
                                toggleEditBtn.setAttribute('data-kund-mode', 'edit');
                                toggleEditBtn.innerHTML = '<i class="fas fa-pen"></i> Redigera';
                            } else {
                                toggleEditBtn.setAttribute('data-kund-mode', 'save');
                                toggleEditBtn.innerHTML = '<i class="fas fa-save"></i> Spara anteckning';
                            }
                        })
                        .catch(err => { if (statusEl) statusEl.textContent = 'Kunde inte spara: ' + (err.message || 'fel'); });
                    return;
                }

                // Spara anteckning för körning (som uppdragsöversikten)
                const saveNoteBtn = e.target.closest('[data-kund-action="save-note"]');
                if (saveNoteBtn) {
                    e.preventDefault();
                    const typ = saveNoteBtn.getAttribute('data-kund-typ') || '';
                    const textarea = container.querySelector(`textarea[data-kund-note-typ="${CSS.escape(typ)}"]`);
                    const statusEl = container.querySelector(`[data-kund-note-status="${CSS.escape(typ)}"]`);
                    const note = (textarea?.value || '').toString();
                    if (statusEl) statusEl.textContent = 'Sparar...';
                    fetch(`${baseUrl}/api/uppdrag`, {
                        method: 'POST',
                        ...getAuthOptsKundkort(),
                        headers: { 'Content-Type': 'application/json', ...(getAuthOptsKundkort().headers || {}) },
                        body: JSON.stringify({ customerId, typ, fields: { 'Anteckning för denna körning': note } })
                    })
                        .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; }))
                        .then((d) => {
                            if (statusEl) statusEl.textContent = d.warning ? String(d.warning) : 'Sparat.';
                            // Uppdatera lokalt cache
                            const rec = _recByType.get(typ) || records.find(x => String(x?.fields?.['Typ'] || '') === String(typ));
                            if (rec && rec.fields) rec.fields['Anteckning för denna körning'] = note;
                            setTimeout(() => { if (statusEl && statusEl.textContent === 'Sparat.') statusEl.textContent = ''; }, 2000);
                        })
                        .catch(err => { if (statusEl) statusEl.textContent = 'Kunde inte spara: ' + (err.message || 'fel'); });
                    return;
                }

                // Ladda upp dokumentation för körning (som uppdragsöversikten)
                const uploadBtn = e.target.closest('[data-kund-action="upload-docs"]');
                if (uploadBtn) {
                    e.preventDefault();
                    const typ = uploadBtn.getAttribute('data-kund-typ') || '';
                    const dl = uploadBtn.getAttribute('data-kund-deadline') || '';
                    const docsKey = uploadBtn.getAttribute('data-kund-docs-key') || '';
                    const input = container.querySelector(`input[type="file"][data-kund-docs-input="${CSS.escape(docsKey)}"]`);
                    const statusEl = container.querySelector(`[data-kund-docs-status="${CSS.escape(docsKey)}"]`);
                    const listEl = container.querySelector(`[data-kund-docs-list="${CSS.escape(docsKey)}"]`);
                    const files = input && input.files ? Array.from(input.files) : [];
                    if (!dl) { if (statusEl) statusEl.textContent = 'Saknar deadline.'; return; }
                    if (!input) { if (statusEl) statusEl.textContent = 'Saknar filväljare.'; return; }
                    if (!files.length) {
                        // öppna filväljaren – användaren klickar på "Ladda upp" igen efter valet
                        try { input.click(); } catch (_) {}
                        if (statusEl) statusEl.textContent = 'Välj fil(er) och klicka sedan “Ladda upp”.';
                        return;
                    }
                    if (statusEl) statusEl.textContent = 'Laddar upp...';
                    uploadBtn.disabled = true;

                    const readAsDataUrl = (file) => new Promise((resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(String(r.result || ''));
                        r.onerror = () => reject(new Error('Kunde inte läsa fil'));
                        r.readAsDataURL(file);
                    });

                    (async () => {
                        for (const file of files.slice(0, 5)) {
                            const dataUrl = await readAsDataUrl(file);
                            const res = await fetch(`${baseUrl}/api/uppdrag/run-docs`, {
                                method: 'POST',
                                ...getAuthOptsKundkort(),
                                headers: { 'Content-Type': 'application/json', ...(getAuthOptsKundkort().headers || {}) },
                                body: JSON.stringify({
                                    customerId,
                                    typ,
                                    deadline: String(dl).slice(0, 10),
                                    filename: file.name,
                                    contentType: file.type || 'application/octet-stream',
                                    base64: dataUrl
                                })
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

                            const rec = _recByType.get(typ) || records.find(x => String(x?.fields?.['Typ'] || '') === String(typ));
                            if (rec && data.record && data.record.fields) {
                                const savedTyp = rec.fields?.['Typ'];
                                rec.fields = data.record.fields;
                                if (savedTyp && !rec.fields['Typ']) rec.fields['Typ'] = savedTyp;
                            }

                            if (listEl && rec && rec.fields) {
                                const f = rec.fields || {};
                                const attFieldName = Array.isArray(f['Dokumentation']) ? 'Dokumentation' : (Array.isArray(f['Attachments']) ? 'Attachments' : (data.fieldName || null));
                                const allAtt = attFieldName ? (f[attFieldName] || []) : [];
                                const runAtt = Array.isArray(allAtt) ? allAtt.filter(a => String(a?.filename || '').includes(String(dl).slice(0, 10))).slice(0, 10) : [];
                                listEl.innerHTML = runAtt.length
                                    ? `<div class="uppdrag-view-list">${runAtt.map(a => {
                                        const fn = (a?.filename || 'Bilaga');
                                        const url = (a?.url || '');
                                        const eFn = (String(fn)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                                        const eUrl = (String(url)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                                        return url
                                            ? `<div class="uppdrag-view-list-item"><i class="fas fa-paperclip"></i><a href="${eUrl}" target="_blank" rel="noopener noreferrer">${eFn}</a></div>`
                                            : `<div class="uppdrag-view-list-item"><i class="fas fa-paperclip"></i>${eFn}</div>`;
                                    }).join('')}</div>`
                                    : ``;
                            }
                        }

                        if (statusEl) statusEl.textContent = 'Uppladdat.';
                        if (input) input.value = '';
                        setTimeout(() => { if (statusEl && statusEl.textContent === 'Uppladdat.') statusEl.textContent = ''; }, 2500);
                    })().catch((err) => {
                        if (statusEl) statusEl.textContent = 'Kunde inte ladda upp: ' + (err.message || 'fel');
                    }).finally(() => {
                        uploadBtn.disabled = false;
                    });
                    return;
                }
                // Redigera-knapp borttagen från översiktsraderna.
                // (Redigera sker i kortet "Redigera uppdrag" längre ner om man fäller ut det.)
            }, { signal: _boardSignal });

            container.addEventListener('change', (e) => {
                const sel = e.target.closest('[data-kund-action="set-run-status"]');
                if (!sel || !container.contains(sel)) return;
                const runId = (sel.getAttribute('data-run-id') || '').toString();
                const newStatus = (sel.value || '').toString().trim();
                const typ = (sel.getAttribute('data-run-typ') || '').toString();
                const periodKey = (sel.getAttribute('data-run-period') || '').toString();
                const msgKey = runId ? runId : `fallback:${typ}:${periodKey}`;
                const msgEl = container.querySelector(`[data-kund-run-status-msg="${CSS.escape(runId)}"]`);
                const msgEl2 = container.querySelector(`[data-kund-run-status-msg="${CSS.escape(msgKey)}"]`) || msgEl;
                if (msgEl2) msgEl2.textContent = 'Sparar...';
                const doSave = fetch(`${baseUrl}/api/uppdrag/run-status`, {
                    method: 'PATCH',
                    ...getAuthOptsKundkort(),
                    headers: { 'Content-Type': 'application/json', ...(getAuthOptsKundkort().headers || {}) },
                    body: JSON.stringify({ customerId, typ, periodKey, status: newStatus, runId: runId || undefined })
                });

                doSave
                    .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; }))
                    .then((d) => {
                        // uppdatera lokal cache (uppdragspostens historik är källan)
                        const rec = _recByType.get(typ) || records.find(x => String(x?.fields?.['Typ'] || '') === String(typ));
                        if (rec) {
                            const savedTyp = rec.fields?.['Typ'];
                            rec.fields = rec.fields || {};
                            if (d && d.record && d.record.fields) rec.fields = d.record.fields;
                            if (savedTyp && !rec.fields['Typ']) rec.fields['Typ'] = savedTyp;
                        }
                        // best-effort: uppdatera runRecords om vi har en (enbart för UI consistency)
                        if (runId) {
                            const rr = (Array.isArray(runRecords) ? runRecords : []).find(x => String(x?.id || '') === String(runId));
                            if (rr) { rr.fields = rr.fields || {}; rr.fields['Status'] = newStatus; }
                        }
                        if (msgEl2) msgEl2.textContent = 'Sparat.';
                        setTimeout(() => { if (msgEl2 && msgEl2.textContent === 'Sparat.') msgEl2.textContent = ''; }, 2000);
                        // re-render så status uppdateras
                        try { renderBoard(); } catch (_) {}
                    })
                    .catch(err => {
                        if (msgEl2) msgEl2.textContent = 'Kunde inte spara: ' + (err.message || 'fel');
                    });
            }, { signal: _boardSignal });
            container.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const samHead = e.target.closest('.samarbete-item-head--toggle');
                if (!samHead || !container.contains(samHead)) return;
                e.preventDefault();
                const item = samHead.closest('.samarbete-list-item--collapsible');
                if (item) {
                    item.classList.toggle('collapsed');
                    samHead.setAttribute('aria-expanded', item.classList.contains('collapsed') ? 'false' : 'true');
                }
            }, { signal: _boardSignal });

            // Hover: visa overlay utan att "pinna"
            container.addEventListener('mouseover', (e) => {
                const autoBadge = e.target.closest('[data-kund-action="toggle-auto-tooltip"]');
                if (!autoBadge || !container.contains(autoBadge)) return;
                const overlay = document.getElementById('auto-tooltip-overlay');
                if (overlay && overlay.getAttribute('data-pinned') === '1') return;
                showAutoTooltipOverlayFor(autoBadge, { pin: false });
            }, { signal: _boardSignal });
            container.addEventListener('mouseout', (e) => {
                const fromBadge = e.target.closest('[data-kund-action="toggle-auto-tooltip"]');
                if (!fromBadge || !container.contains(fromBadge)) return;
                const to = e.relatedTarget;
                if (to && fromBadge.contains && fromBadge.contains(to)) return;
                const overlay = document.getElementById('auto-tooltip-overlay');
                if (overlay && (to === overlay || (overlay.contains && overlay.contains(to)))) return;
                hideAutoTooltipOverlay();
            }, { signal: _boardSignal });

            // Stäng overlay vid scroll/resize/click utanför (om inte pinnad)
            const onAutoOverlayDoc = (e) => {
                const overlay = document.getElementById('auto-tooltip-overlay');
                if (!overlay || overlay.style.display === 'none') return;
                const target = e.target;
                if (overlay.contains(target)) return;
                const badge = target.closest?.('[data-kund-action="toggle-auto-tooltip"]');
                if (badge) return;
                hideAutoTooltipOverlay({ force: true });
            };
            const onAutoOverlayEsc = (e) => {
                if (e.key === 'Escape') hideAutoTooltipOverlay({ force: true });
            };
            const onAutoOverlayScroll = () => hideAutoTooltipOverlay({ force: true });
            document.addEventListener('mousedown', onAutoOverlayDoc, { capture: true, signal: _boardSignal });
            document.addEventListener('keydown', onAutoOverlayEsc, { capture: true, signal: _boardSignal });
            window.addEventListener('scroll', onAutoOverlayScroll, { capture: true, signal: _boardSignal });
            window.addEventListener('resize', onAutoOverlayScroll, { capture: true, signal: _boardSignal });
        }

        renderBoard();

        // Setup actions
        const addBtn = document.getElementById('uppdrag-add-btn-top');
        const onAdd = () => this._showUppdragSetupModal({ missingTypes, byraUsers, riskAtgarder });
        if (addBtn) addBtn.addEventListener('click', onAdd);

        // Bind events (save / complete) for each card
        existingTypes.forEach((typ) => {
            const root = document.querySelector(`[data-uppdrag-typ="${CSS.escape(typ)}"]`);
            if (!root) return;
            const saveBtn = root.querySelector('[data-action="save"]');
            const doneBtn = root.querySelector('[data-action="done"]');
            const doneHeaderBtn = root.querySelector('[data-action="done-header"]');
            if (saveBtn) saveBtn.addEventListener('click', () => this._saveUppdragFromCard(root, typ));
            if (doneBtn) doneBtn.addEventListener('click', () => this._showCompleteUppdragModal(root, typ));
            if (doneHeaderBtn) doneHeaderBtn.addEventListener('click', () => this._showCompleteUppdragModal(root, typ));

            // Live-sync header meta when user edits
            ['Frekvens', 'Nästa deadline', 'Ansvarig'].forEach((field) => {
                const el = root.querySelector(`[data-field="${CSS.escape(field)}"]`);
                if (el) el.addEventListener('change', () => this._syncUppdragHeaderMeta(root));
                if (el && el.tagName === 'INPUT') el.addEventListener('input', () => this._syncUppdragHeaderMeta(root));
            });

            // Autofyll mottagare-namn när mottagare-e-post väljs från Roller
            const underlagEpostEl = root.querySelector('[data-field="Underlagsmottagare e-post"]');
            const underlagNamnEl = root.querySelector('[data-field="Underlagsmottagare namn"]');
            const tryAutofillUnderlagRecipient = () => {
                if (!underlagEpostEl || !underlagNamnEl) return;
                const email = (underlagEpostEl.value || '').toString().trim().toLowerCase();
                if (!email) return;
                const persons = Array.isArray(this._kontaktPersoner) ? this._kontaktPersoner : [];
                const match = persons.find(p => ((p?.epost || p?.email || '').toString().trim().toLowerCase() === email));
                if (!match) return;
                const name = (match?.namn || '').toString().trim();
                if (!name) return;

                const currentName = (underlagNamnEl.value || '').toString().trim();
                const canOverwrite = !currentName || underlagNamnEl.dataset.autofilled === '1';
                if (!canOverwrite) return;

                underlagNamnEl.value = name;
                underlagNamnEl.dataset.autofilled = '1';
            };
            const markManualNameEdit = () => {
                if (!underlagNamnEl) return;
                const v = (underlagNamnEl.value || '').toString().trim();
                if (v) underlagNamnEl.dataset.autofilled = '0';
            };
            if (underlagEpostEl) {
                underlagEpostEl.addEventListener('change', tryAutofillUnderlagRecipient);
                underlagEpostEl.addEventListener('input', tryAutofillUnderlagRecipient);
            }
            if (underlagNamnEl) {
                underlagNamnEl.addEventListener('input', markManualNameEdit);
                underlagNamnEl.addEventListener('change', markManualNameEdit);
            }

            // Schemalagd förfrågan: lägga till / ta bort rader (som Samarbete)
            const underlagAddBtn = root.querySelector('[data-action="underlag-add-item"]');
            const underlagWrap = root.querySelector('[data-underlag-items-wrap]');
            if (underlagAddBtn && underlagWrap) {
                underlagAddBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const n = underlagWrap.querySelectorAll('.samarbete-item-row').length;
                    const row = document.createElement('div');
                    row.className = 'samarbete-item-row';
                    row.innerHTML = `<input type="text" class="form-control samarbete-item-input" placeholder="t.ex. ytterligare underlag eller fråga" data-underlag-item="${n}"><label class="samarbete-file-req-wrap" title="Klicka för att kräva fil från kunden"><input type="checkbox" class="samarbete-file-required samarbete-file-required-input" data-underlag-item="${n}"><span class="samarbete-file-req-icon"><i class="fas fa-file-upload"></i></span></label><button type="button" class="btn btn-ghost btn-sm underlag-item-remove" title="Ta bort" style="flex-shrink:0;"><i class="fas fa-times"></i></button>`;
                    underlagWrap.appendChild(row);
                });

                underlagWrap.addEventListener('click', (e) => {
                    const rm = e.target.closest('.underlag-item-remove');
                    if (rm && rm.closest('.samarbete-item-row')) rm.closest('.samarbete-item-row').remove();
                });

                underlagWrap.addEventListener('change', (e) => {
                    const chk = e.target.closest('.samarbete-file-required-input');
                    if (chk) {
                        const wrap = chk.closest('.samarbete-file-req-wrap');
                        if (wrap) {
                            wrap.classList.toggle('is-checked', chk.checked);
                            wrap.title = chk.checked ? 'Fil krävs – klicka för att ta bort kravet' : 'Klicka för att kräva fil från kunden';
                        }
                    }
                });
            }

            // Edit mode toggle
            const editBtn = root.querySelector('[data-action="toggle-edit"]');
            const cancelBtn = root.querySelector('[data-action="cancel-edit"]');
            const setEditing = (on) => {
                root.dataset.uppdragEditing = on ? '1' : '0';
                const view = root.querySelector('[data-uppdrag-mode="view"]');
                const edit = root.querySelector('[data-uppdrag-mode="edit"]');
                if (view) view.style.display = on ? 'none' : 'block';
                if (edit) edit.style.display = on ? 'block' : 'none';
                // Disable edit inputs when not editing (prevents accidental changes)
                root.querySelectorAll('[data-uppdrag-mode="edit"] [data-field]').forEach(inp => {
                    inp.disabled = !on;
                });
                if (on) this._syncUppdragHeaderMeta(root);
            };
            if (editBtn) editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Om kortet är kollapsat: fäll ut innan vi går in i edit-läge,
                // annars ser det ut som att "pennan" inte gör något.
                try {
                    root.classList.remove('is-collapsed');
                    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch (_) {}
                setEditing(root.dataset.uppdragEditing !== '1');
            });
            if (cancelBtn) cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                setEditing(false);
                // Re-render to discard edits
                this.loadUppdrag();
            });

            // default: view mode
            setEditing(false);

            // PTL underlag upload (edit mode)
            const uploadBtn = root.querySelector('[data-action="upload-ptl"]');
            if (uploadBtn) {
                uploadBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    try {
                        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
                        const customerId = this.customerId || this.currentCustomerId;
                        const input = root.querySelector('[data-ptl-file]');
                        const files = input ? Array.from(input.files || []) : [];
                        if (!files.length) {
                            this.showNotification('Välj minst en fil att ladda upp', 'info');
                            return;
                        }
                        uploadBtn.disabled = true;
                        const orig = uploadBtn.innerHTML;
                        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Laddar upp...';

                        const uploaded = [];
                        for (const file of files) {
                            const base64 = await this.fileToBase64(file);
                            const filename = `PTL-${typ}-${(new Date().toISOString().slice(0, 10))}-${file.name}`;
                            const res = await fetch(`${baseUrl}/api/documents/upload`, {
                                method: 'POST',
                                ...getAuthOptsKundkort(),
                                body: JSON.stringify({
                                    customerId,
                                    file: base64,
                                    filename,
                                    category: 'riskbedomning',
                                    customCategory: 'ptl-underlag'
                                })
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                            uploaded.push({ filename, uploadedAt: new Date().toISOString() });
                        }

                        // store in hidden PTL Underlag field
                        const ptlField = root.querySelector('[data-field="PTL Underlag"]');
                        let existing = [];
                        try { existing = ptlField?.value ? JSON.parse(ptlField.value) : []; } catch (_) { existing = []; }
                        if (!Array.isArray(existing)) existing = [];
                        ptlField.value = JSON.stringify(uploaded.concat(existing)).slice(0, 200000);
                        const hidden = root.querySelector('[data-uppdrag-ptl-underlag]');
                        if (hidden) hidden.value = ptlField.value;

                        this._renderPtlFiles(root);
                        this.showNotification('Underlag uppladdat', 'success');
                        uploadBtn.innerHTML = orig;
                        uploadBtn.disabled = false;
                        if (input) input.value = '';
                    } catch (err) {
                        console.error('❌ PTL upload:', err);
                        this.showNotification('Kunde inte ladda upp: ' + (err.message || 'fel'), 'error');
                        uploadBtn.disabled = false;
                        uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Ladda upp underlag';
                    }
                });
            }

            this._renderPtlFiles(root);

            // Deklaration: dynamiska rader (typ + fritext) i edit-läge
            if (typ === 'Deklaration') {
                // NE = näringsbilaga. NEA fanns tidigare som legacy-värde, behåll för kompatibilitet.
                const declTypes = ['NE', 'NEA', 'K4', 'K5', 'K7', 'K10', 'Inkomstdeklaration'];
                const rowsWrap = root.querySelector('[data-dek-rows]');
                const addBtn = root.querySelector('[data-action="dek-add"]');
                const hiddenDecl = root.querySelector('[data-field="Deklaration rader"]');

                const syncHidden = () => {
                    if (!rowsWrap || !hiddenDecl) return;
                    const rows = Array.from(rowsWrap.querySelectorAll('.uppdrag-dek-row')).map(r => ({
                        typ: r.querySelector('.uppdrag-dek-typ')?.value || 'NE',
                        text: (r.querySelector('.uppdrag-dek-text')?.value || '').toString().trim()
                    })).filter(x => x.typ || x.text);
                    hiddenDecl.value = JSON.stringify(rows);
                };

                const makeRow = (row) => {
                    const t = (row?.typ || 'NE').toString();
                    const txt = (row?.text || '').toString();
                    const wrapper = document.createElement('div');
                    wrapper.innerHTML = `
                        <div class="uppdrag-dek-row">
                            <select class="form-control uppdrag-dek-typ">
                                ${declTypes.map(x => `<option value="${this._esc(x)}" ${x === t ? 'selected' : ''}>${this._esc(x)}</option>`).join('')}
                            </select>
                            <input type="text" class="kunduppgifter-input uppdrag-dek-text" placeholder="Fritext (t.ex. namn)" value="${this._esc(txt)}">
                            <button type="button" class="btn btn-ghost btn-sm uppdrag-dek-remove" title="Ta bort"><i class="fas fa-times"></i></button>
                        </div>
                    `.trim();
                    const node = wrapper.firstElementChild;
                    node.querySelector('.uppdrag-dek-remove')?.addEventListener('click', () => { node.remove(); syncHidden(); });
                    node.querySelector('.uppdrag-dek-typ')?.addEventListener('change', syncHidden);
                    node.querySelector('.uppdrag-dek-text')?.addEventListener('input', syncHidden);
                    return node;
                };

                const hydrate = () => {
                    if (!rowsWrap || !hiddenDecl) return;
                    if (rowsWrap.dataset.hydrated === '1') return;
                    rowsWrap.dataset.hydrated = '1';
                    let rows = [];
                    try { rows = hiddenDecl.value ? JSON.parse(hiddenDecl.value) : []; } catch (_) { rows = []; }
                    if (!Array.isArray(rows)) rows = [];
                    rowsWrap.innerHTML = '';
                    if (rows.length === 0) rows = [{ typ: 'NE', text: '' }];
                    rows.forEach(r => rowsWrap.appendChild(makeRow(r)));
                    syncHidden();
                };

                hydrate();
                if (addBtn) {
                    addBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        hydrate();
                        rowsWrap?.appendChild(makeRow({ typ: 'NE', text: '' }));
                        syncHidden();
                    });
                }
            }
        });
    }

    _isUppdragDoneForPeriod(fields) {
        const doneAt = (fields?.['Senast utförd'] || '').toString().trim();
        const nextDeadline = (fields?.['Nästa deadline'] || '').toString().trim();
        const freq = (fields?.['Frekvens'] || '').toString().toLowerCase();
        if (!doneAt || !nextDeadline) return false;

        const toDate = (iso) => {
            const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
            return Number.isNaN(d.getTime()) ? null : d;
        };
        const doneD = toDate(doneAt);
        const nextD = toDate(nextDeadline);
        if (!doneD || !nextD) return false;

        const start = new Date(nextD.getTime());
        if (freq.includes('kvartal')) start.setMonth(start.getMonth() - 3);
        else if (freq.includes('månad')) start.setMonth(start.getMonth() - 1);
        else if (freq.includes('årsvis')) start.setFullYear(start.getFullYear() - 1);
        else start.setMonth(start.getMonth() - 1);

        return doneD >= start && doneD < nextD;
    }

    _showCompleteUppdragModal(root, typ) {
        const existing = document.getElementById('uppdrag-complete-modal');
        if (existing) existing.remove();

        // PTL anses "på" om det finns valda åtgärder (checkbox-togglen är borttagen)
        const riskOn = (root.querySelectorAll('input[data-risk-item]:checked').length > 0)
            || (() => { try { return (JSON.parse(root.querySelector('[data-uppdrag-risk-valda]')?.value || '[]') || []).length > 0; } catch (_) { return false; } })();

        const modal = document.createElement('div');
        modal.id = 'uppdrag-complete-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="max-width:720px; width:96vw; max-height:90vh;">
                <div class="modal-header">
                    <h3><i class="fas fa-check-circle"></i> Klarmarkera: ${this._esc(typ)}</h3>
                    <button class="modal-close" type="button" onclick="document.getElementById('uppdrag-complete-modal')?.remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="overflow:auto;">
                    ${riskOn ? `
                        <div class="uppdrag-riskbox" style="margin-top:0;">
                            <div class="uppdrag-setup-desc" style="margin:0;">
                                PTL-åtgärd är aktiverad för detta uppdrag. För dokumentation behöver du skriva en anteckning och du kan även ladda upp underlag.
                            </div>
                        </div>
                    ` : `
                        <div class="uppdrag-setup-desc" style="margin-top:0;">
                            Vill du lämna en anteckning till denna körning? (valfritt)
                        </div>
                    `}

                    <div class="form-group" style="margin-top:0.75rem;">
                        <label>${riskOn ? 'Anteckning *' : 'Anteckning'}</label>
                        <textarea id="uppdrag-complete-note" class="kunduppgifter-input" rows="3" placeholder="Skriv anteckning..."></textarea>
                    </div>

                    ${riskOn ? `
                        <div class="form-group" style="margin-top:0.75rem;">
                            <label>Underlag (valfritt)</label>
                            <input type="file" id="uppdrag-complete-files" class="kunduppgifter-input" multiple>
                            <div class="uppdrag-muted" style="margin-top:0.35rem;">Filerna sparas på fliken Dokumentation (kategori: riskbedömning).</div>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost btn-sm" type="button" onclick="document.getElementById('uppdrag-complete-modal')?.remove()">Avbryt</button>
                    <button class="btn btn-primary btn-sm" type="button" id="uppdrag-complete-confirm"><i class="fas fa-check"></i> Klarmarkera</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('uppdrag-complete-confirm').addEventListener('click', async () => {
            try {
                const note = (document.getElementById('uppdrag-complete-note')?.value || '').trim();

                if (riskOn && !note) {
                    this.showNotification('Anteckning krävs när PTL-åtgärd är aktiverad.', 'error');
                    return;
                }

                // PTL-krav: om åtgärder är aktiverade måste minst en vara vald
                let riskValda = [];
                try { riskValda = JSON.parse(root.querySelector('[data-uppdrag-risk-valda]')?.value || '[]'); } catch (_) { riskValda = []; }
                if (root.querySelectorAll('input[data-risk-item]:checked').length) {
                    riskValda = Array.from(root.querySelectorAll('input[data-risk-item]:checked')).map(i => i.value);
                }
                if (riskOn && (!riskValda || riskValda.length === 0)) {
                    root.classList.remove('is-collapsed');
                    root.querySelector('[data-action="toggle-edit"]')?.click();
                    this.showNotification('Välj minst en PTL-åtgärd innan klarmarkering.', 'error');
                    document.getElementById('uppdrag-complete-modal')?.remove();
                    return;
                }

                // Upload files (if any)
                if (riskOn) {
                    const input = document.getElementById('uppdrag-complete-files');
                    const files = input ? Array.from(input.files || []) : [];
                    if (files.length) {
                        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
                        const customerId = this.customerId || this.currentCustomerId;
                        const uploaded = [];
                        for (const file of files) {
                            const base64 = await this.fileToBase64(file);
                            const filename = `PTL-${typ}-${(new Date().toISOString().slice(0, 10))}-${file.name}`;
                            const res = await fetch(`${baseUrl}/api/documents/upload`, {
                                method: 'POST',
                                ...getAuthOptsKundkort(),
                                body: JSON.stringify({
                                    customerId,
                                    file: base64,
                                    filename,
                                    category: 'riskbedomning',
                                    customCategory: 'ptl-underlag'
                                })
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                            uploaded.push({ filename, uploadedAt: new Date().toISOString() });
                        }
                        // Persist PTL Underlag into uppdrag record
                        await this._saveUppdragPtlUnderlagOnly(typ, uploaded);
                    }
                }

                document.getElementById('uppdrag-complete-modal')?.remove();
                await this._completeUppdragFromCard(root, typ, { noteOverride: note });
            } catch (e) {
                this.showNotification('Kunde inte klarmarkera: ' + (e.message || 'fel'), 'error');
            }
        });
    }

    async _saveUppdragPtlUnderlagOnly(typ, uploadedItems) {
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const customerId = this.customerId || this.currentCustomerId;
        let existing = [];
        try {
            existing = JSON.parse(document.querySelector(`[data-uppdrag-typ="${CSS.escape(typ)}"] [data-uppdrag-ptl-underlag]`)?.value || '[]');
        } catch (_) { existing = []; }
        if (!Array.isArray(existing)) existing = [];
        const merged = uploadedItems.concat(existing).slice(0, 200);
        const res = await fetch(`${baseUrl}/api/uppdrag`, {
            method: 'POST',
            ...getAuthOptsKundkort(),
            body: JSON.stringify({
                customerId,
                typ,
                fields: { 'PTL Underlag': JSON.stringify(merged) }
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    }

    _renderPtlFiles(root) {
        const wrap = root?.querySelector('[data-ptl-files]');
        if (!wrap) return;
        const ptlField = root.querySelector('[data-field="PTL Underlag"]') || root.querySelector('[data-uppdrag-ptl-underlag]');
        let arr = [];
        try {
            const raw = (ptlField?.value || '').toString().trim();
            arr = raw ? JSON.parse(raw) : [];
        } catch (_) { arr = []; }
        if (!Array.isArray(arr) || arr.length === 0) {
            wrap.innerHTML = `<div class="uppdrag-muted">Inga underlag uppladdade.</div>`;
            return;
        }
        wrap.innerHTML = `<div class="uppdrag-view-list">${arr.slice(0, 10).map(x => {
            const fn = this._esc(String(x?.filename || 'fil'));
            const dt = this._esc(String(x?.uploadedAt || '').slice(0, 10));
            return `<div class="uppdrag-view-list-item"><i class="fas fa-paperclip"></i>${fn}${dt ? ` <span class="uppdrag-muted">(${dt})</span>` : ''}</div>`;
        }).join('')}</div>`;
    }

    _showUppdragSetupModal({ missingTypes, byraUsers, riskAtgarder }) {
        if (!missingTypes || missingTypes.length === 0) {
            this.showNotification('Alla uppdrag är redan upplagda på kunden', 'info');
            return;
        }

        const existing = document.getElementById('uppdrag-setup-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'uppdrag-setup-modal';
        modal.className = 'modal-overlay';

        const currentUserName = ((window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()?.name) || this.userData?.name || '').toString().trim();
        const userOptions = [{ name: '' }].concat((byraUsers || []).map(u => ({ name: u.name || u.email || u.id || '' }))).filter(x => x.name !== undefined);
        const userOptHtml = userOptions.map(u => {
            const name = String(u.name || '');
            const label = name || 'Välj handläggare';
            const sel = name && currentUserName && name === currentUserName ? 'selected' : '';
            return `<option value="${this._esc(name)}" ${sel}>${this._esc(label)}</option>`;
        }).join('');

        const riskChoicesHtml = (riskAtgarder || []).map(a => {
            return `<label style="display:flex; gap:0.5rem; align-items:flex-start; margin:0.25rem 0;">
                <input type="checkbox" class="uppdrag-risk-cb" value="${this._esc(a)}">
                <span>${this._esc(a)}</span>
            </label>`;
        }).join('') || `<div style="color:#94a3b8;">Inga åtgärder hittades i kundens riskbedömning.</div>`;

        const typeOptionsHtml = missingTypes.map(t => `<option value="${this._esc(t)}">${this._esc(t)}</option>`).join('');

        modal.innerHTML = `
            <div class="modal-box" style="max-width:760px; width:96vw; max-height:90vh;">
                <div class="modal-header">
                    <h3><i class="fas fa-briefcase"></i> Skapa uppdrag</h3>
                    <button class="modal-close" type="button" onclick="document.getElementById('uppdrag-setup-modal')?.remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="overflow:auto;">
                    <div class="lead-fields uppdrag-lead-fields" style="margin-top:0;">
                        <div class="lead-field">
                            <label>Typ av uppdrag *</label>
                            <select class="form-control" id="uppdrag-new-typ">${typeOptionsHtml}</select>
                        </div>
                        <div class="lead-field">
                            <label>Handläggare *</label>
                            <select class="form-control" id="uppdrag-new-ansvarig">${userOptHtml}</select>
                        </div>
                        <div class="lead-field">
                            <label>Frekvens *</label>
                            <select class="form-control" id="uppdrag-new-frekvens"></select>
                        </div>
                        <div class="lead-field uppdrag-span-full" id="uppdrag-moms-period-wrap" style="display:none;">
                            <label id="uppdrag-moms-period-label">Första momsperiod *</label>
                            <select class="form-control" id="uppdrag-new-forsta-period"></select>
                            <p class="uppdrag-muted" style="margin:0.35rem 0 0;" id="uppdrag-moms-period-hint">Start och deadline enligt Skatteverket (12:e, 17:e i jan/aug) fylls i automatiskt.</p>
                        </div>
                        <div class="lead-field" id="uppdrag-new-start-wrap">
                            <label>Startdatum *</label>
                            <input class="kunduppgifter-input" type="date" id="uppdrag-new-start">
                        </div>
                        <div class="lead-field" id="uppdrag-new-deadline-wrap">
                            <label>Deadline *</label>
                            <input class="kunduppgifter-input" type="date" id="uppdrag-new-deadline">
                        </div>
                        <div class="lead-field uppdrag-span-full" id="uppdrag-moms-preview-wrap" style="display:none;">
                            <label>Beräknat (SKV)</label>
                            <p class="uppdrag-muted" style="margin:0;" id="uppdrag-moms-preview-text">—</p>
                        </div>
                        <div class="lead-field uppdrag-span-full">
                            <label>Rutin / instruktion</label>
                            <textarea class="kunduppgifter-input" rows="4" id="uppdrag-new-rutin" placeholder="Skriv rutin/instruktion..."></textarea>
                        </div>
                    </div>

                    <div class="uppdrag-riskbox" style="margin-top:1rem;">
                        <div class="uppdrag-riskbox-title">Åtgärd enligt kundens riskbedömning</div>
                        <div class="uppdrag-riskbox-items" id="uppdrag-new-risk-items">
                            ${riskChoicesHtml}
                        </div>
                    </div>

                    <div id="uppdrag-new-deklaration-extra" style="margin-top:1rem; display:none;">
                        <div class="uppdrag-deklaration-rows">
                            <div class="uppdrag-deklaration-head">
                                <div class="uppdrag-riskbox-title" style="margin:0;">Deklarationstyper</div>
                                <button type="button" class="btn btn-secondary btn-sm" id="uppdrag-dek-add"><i class="fas fa-plus"></i> Lägg till rad</button>
                            </div>
                            <div id="uppdrag-dek-rows"></div>
                            <div class="uppdrag-muted" style="margin-top:0.35rem;">Du kan lägga samma deklarationstyp flera gånger och skriva fritext (t.ex. namn).</div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost btn-sm" type="button" onclick="document.getElementById('uppdrag-setup-modal')?.remove()">Avbryt</button>
                    <button class="btn btn-primary btn-sm" type="button" id="uppdrag-new-save"><i class="fas fa-save"></i> Skapa</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const typEl = document.getElementById('uppdrag-new-typ');
        const freqEl = document.getElementById('uppdrag-new-frekvens');
        const riskItemsEl = document.getElementById('uppdrag-new-risk-items');
        const declWrap = document.getElementById('uppdrag-new-deklaration-extra');
        const dekRowsEl = document.getElementById('uppdrag-dek-rows');
        const dekAddBtn = document.getElementById('uppdrag-dek-add');

        const setFreqOptions = (typ) => {
            const choices = (typ === 'Momsredovisning')
                ? ['Varje månad', 'Varje kvartal', 'Årsvis', 'Årsvis med deklaration']
                : (typ === 'Löneuppdrag' ? ['Varje månad'] : ['Årsvis', 'Engång']);
            freqEl.innerHTML = choices.map(c => `<option value="${this._esc(c)}">${this._esc(c)}</option>`).join('');
        };

        // NE = näringsbilaga. NEA fanns tidigare som legacy-värde, behåll för kompatibilitet.
        const declTypes = ['NE', 'NEA', 'K4', 'K5', 'K7', 'K10', 'Inkomstdeklaration'];
        const renderDekRow = (row) => {
            const t = row?.typ || 'NE';
            const txt = row?.text || '';
            return `
                <div class="uppdrag-dek-row">
                    <select class="form-control uppdrag-dek-typ">
                        ${declTypes.map(x => `<option value="${this._esc(x)}" ${x === t ? 'selected' : ''}>${this._esc(x)}</option>`).join('')}
                    </select>
                    <input type="text" class="kunduppgifter-input uppdrag-dek-text" placeholder="Fritext (t.ex. namn)" value="${this._esc(txt)}">
                    <button type="button" class="btn btn-ghost btn-sm uppdrag-dek-remove" title="Ta bort"><i class="fas fa-times"></i></button>
                </div>
            `;
        };
        const addDekRow = (row) => {
            if (!dekRowsEl) return;
            const wrap = document.createElement('div');
            wrap.innerHTML = renderDekRow(row || { typ: 'NE', text: '' });
            const node = wrap.firstElementChild;
            dekRowsEl.appendChild(node);
            node.querySelector('.uppdrag-dek-remove')?.addEventListener('click', () => node.remove());
        };

        const momsWrap = document.getElementById('uppdrag-moms-period-wrap');
        const momsPeriodEl = document.getElementById('uppdrag-new-forsta-period');
        const momsPeriodLabel = document.getElementById('uppdrag-moms-period-label');
        const startWrap = document.getElementById('uppdrag-new-start-wrap');
        const deadlineWrap = document.getElementById('uppdrag-new-deadline-wrap');
        const momsPreviewWrap = document.getElementById('uppdrag-moms-preview-wrap');
        const momsPreviewText = document.getElementById('uppdrag-moms-preview-text');
        const startEl = document.getElementById('uppdrag-new-start');
        const deadlineEl = document.getElementById('uppdrag-new-deadline');

        const fillMomsPeriodOptions = () => {
            if (!momsPeriodEl || !window.MomsPeriod) return;
            const freq = freqEl.value || '';
            const isQ = MomsPeriod.isQuarterlyFreq(freq);
            const opts = isQ
                ? MomsPeriod.quarterOptionsForYear(new Date().getFullYear())
                : MomsPeriod.monthOptionsAroundNow();
            momsPeriodLabel.textContent = isQ ? 'Första kvartalsperiod *' : 'Första momsperiod (månad) *';
            momsPeriodEl.innerHTML = opts.map(o => `<option value="${this._esc(o.value)}">${this._esc(o.label)}</option>`).join('');
        };

        const applyMomsFromPeriod = () => {
            if (!window.MomsPeriod || !momsPeriodEl) return;
            const pk = momsPeriodEl.value;
            const freq = freqEl.value || '';
            const meta = MomsPeriod.runMeta(pk, freq);
            if (startEl) startEl.value = meta.startIso || '';
            if (deadlineEl) deadlineEl.value = meta.deadlineIso || '';
            if (momsPreviewText) {
                momsPreviewText.textContent = meta.periodLabel
                    ? `${meta.periodLabel} · start ${meta.startIso || '—'} · klart senast ${meta.deadlineIso || '—'}`
                    : '—';
            }
        };

        const syncExtra = () => {
            const t = typEl.value;
            setFreqOptions(t);
            declWrap.style.display = (t === 'Deklaration') ? 'block' : 'none';
            const isMoms = t === 'Momsredovisning';
            if (momsWrap) momsWrap.style.display = isMoms ? 'block' : 'none';
            if (momsPreviewWrap) momsPreviewWrap.style.display = isMoms ? 'block' : 'none';
            const manualDates = !isMoms;
            if (startWrap) startWrap.style.display = manualDates ? '' : 'none';
            if (deadlineWrap) deadlineWrap.style.display = manualDates ? '' : 'none';
            if (isMoms) {
                fillMomsPeriodOptions();
                applyMomsFromPeriod();
            }
            if (t === 'Deklaration' && dekRowsEl && dekRowsEl.children.length === 0) {
                addDekRow({ typ: 'NE', text: '' });
            }
        };
        typEl.addEventListener('change', syncExtra);
        freqEl.addEventListener('change', () => { if (typEl.value === 'Momsredovisning') { fillMomsPeriodOptions(); applyMomsFromPeriod(); } });
        if (momsPeriodEl) momsPeriodEl.addEventListener('change', applyMomsFromPeriod);
        syncExtra();

        if (dekAddBtn) dekAddBtn.addEventListener('click', () => addDekRow({ typ: 'NE', text: '' }));

        document.getElementById('uppdrag-new-save').addEventListener('click', async () => {
            try {
                const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
                const opts = getAuthOptsKundkort();
                const customerId = this.customerId || this.currentCustomerId;
                const typ = typEl.value;
                const ansvarig = document.getElementById('uppdrag-new-ansvarig').value || '';
                const frekvens = freqEl.value || '';
                const startdatum = document.getElementById('uppdrag-new-start').value || '';
                const deadline = document.getElementById('uppdrag-new-deadline').value || '';
                const rutin = document.getElementById('uppdrag-new-rutin').value || '';

                if (!typ) throw new Error('Välj typ');
                if (!ansvarig) throw new Error('Välj handläggare');
                if (!frekvens) throw new Error('Välj frekvens');
                const forstaPeriod = (typ === 'Momsredovisning' && momsPeriodEl) ? (momsPeriodEl.value || '').trim() : '';
                if (typ === 'Momsredovisning') {
                    if (!forstaPeriod) throw new Error('Välj första momsperiod');
                    if (!startdatum || !deadline) throw new Error('Kunde inte beräkna start/deadline – välj period igen');
                } else {
                    if (!startdatum) throw new Error('Välj startdatum');
                    if (!deadline) throw new Error('Välj deadline');
                }

                const riskSelected = Array.from(document.querySelectorAll('#uppdrag-new-risk-items .uppdrag-risk-cb:checked')).map(i => i.value);
                const riskOn = riskSelected.length > 0;

                const fields = {
                    'Ansvarig': ansvarig,
                    'Frekvens': frekvens,
                    'Startdatum': startdatum,
                    'Nästa deadline': deadline,
                    'Rutin': rutin,
                    'Riskåtgärder aktiverade': riskOn,
                    'Riskåtgärder valda': JSON.stringify(riskSelected),
                    'Status': 'Aktiv'
                };
                if (forstaPeriod) fields['Första period'] = forstaPeriod;

                if (typ === 'Deklaration') {
                    const rows = Array.from(document.querySelectorAll('#uppdrag-dek-rows .uppdrag-dek-row')).map(r => ({
                        typ: r.querySelector('.uppdrag-dek-typ')?.value || 'NE',
                        text: (r.querySelector('.uppdrag-dek-text')?.value || '').toString().trim()
                    })).filter(x => x.typ || x.text);
                    fields['Deklaration rader'] = JSON.stringify(rows);
                }

                const res = await fetch(`${baseUrl}/api/uppdrag`, {
                    method: 'POST',
                    ...opts,
                    body: JSON.stringify({ customerId, typ, fields })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

                document.getElementById('uppdrag-setup-modal')?.remove();
                this.showNotification('Uppdrag skapat', 'success');
                this.loadUppdrag();
            } catch (e) {
                this.showNotification(e.message || 'Kunde inte skapa uppdrag', 'error');
            }
        });
    }

    _renderUppdragKort(typ, icon, record, byraUsers, riskAtgarder, extra = {}) {
        const f = record?.fields || {};
        const recId = record?.id || '';
        const freq = f['Frekvens'] || (typ === 'Löneuppdrag' ? 'Varje månad' : '');
        const deadline = f['Nästa deadline'] || '';
        const startdatum = f['Startdatum'] || '';
        const ansvarig = f['Ansvarig'] || '';
        const rutin = f['Rutin'] || '';
        const riskValdaRaw = (f['Riskåtgärder valda'] || '').toString().trim();
        let riskValda = [];
        try { riskValda = riskValdaRaw ? JSON.parse(riskValdaRaw) : []; } catch (_) { riskValda = riskValdaRaw ? riskValdaRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : []; }
        if (!Array.isArray(riskValda)) riskValda = [];
        const riskOn = (!!f['Riskåtgärder aktiverade']) || (riskValda.length > 0);

        let history = [];
        try { history = (f['Historik'] || '').toString().trim() ? JSON.parse(String(f['Historik']).trim()) : []; } catch (_) { history = []; }
        if (!Array.isArray(history)) history = [];
        const histHtml = history.slice(0, 5).map(h => {
            const d = this._esc(String(h?.doneAt || ''));
            const n = this._esc(String(h?.note || ''));
            return `<div class="uppdrag-history-item">
                <div class="uppdrag-history-title"><i class="fas fa-check-circle"></i> ${d || 'Klarmarkerad'}</div>
                ${n ? `<div class="uppdrag-history-note">${n}</div>` : ''}
            </div>`;
        }).join('') || `<div class="empty-state" style="margin-top:0.25rem;"><i class="fas fa-info-circle"></i><p>Ingen historik ännu.</p></div>`;

        const notesHtml = history
            .filter(h => (h?.note || '').toString().trim())
            .slice(0, 8)
            .map(h => {
                const d = this._esc(String(h?.doneAt || ''));
                const n = this._esc(String(h?.note || ''));
                return `<div class="uppdrag-prev-note">
                    <div class="uppdrag-prev-note-date"><i class="fas fa-check-circle"></i> ${d || 'Klarmarkerad'}</div>
                    <div class="uppdrag-prev-note-text">${n}</div>
                </div>`;
            }).join('') || `<div class="uppdrag-muted">Inga tidigare anteckningar.</div>`;

        const userOptions = [{ id: '', name: 'Välj handläggare' }].concat(
            (byraUsers || []).map(u => ({ id: u.id || u.email || u.name || '', name: u.name || u.email || u.id || '' }))
        );
        const userOptHtml = userOptions.map(u => `<option value="${this._esc(String(u.name))}" ${String(u.name) === String(ansvarig) ? 'selected' : ''}>${this._esc(String(u.name))}</option>`).join('');

        const freqChoices = typ === 'Momsredovisning'
            ? ['Varje månad', 'Varje kvartal', 'Årsvis', 'Årsvis med deklaration']
            : (typ === 'Löneuppdrag' ? ['Varje månad'] : ['Årsvis', 'Engång']);
        const freqHtml = freqChoices.map(c => `<option value="${this._esc(c)}" ${String(c) === String(freq) ? 'selected' : ''}>${this._esc(c)}</option>`).join('');

        const lastUnderlagPeriod = (f['Senast underlagsutskick period'] || '').toString().trim();
        const lastUnderlagInfo = lastUnderlagPeriod
            ? `<div class="uppdrag-muted" style="margin-top:0.5rem;"><i class="fas fa-paper-plane"></i> Senast skickad underlagsförfrågan: <strong>${this._esc(lastUnderlagPeriod)}</strong></div>`
            : `<div class="uppdrag-muted" style="margin-top:0.5rem;"><i class="fas fa-paper-plane"></i> Ingen underlagsförfrågan har skickats ännu.</div>`;

        const safeIdPart = String(recId || typ || 'uppdrag').replace(/[^a-z0-9_-]/gi, '_');
        const underlagEpostListId = `underlag-epost-${safeIdPart}`;
        const rollerEpostOptions = (Array.isArray(this._kontaktPersoner) ? this._kontaktPersoner : [])
            .map(p => ({
                namn: (p?.namn || '').toString().trim(),
                epost: (p?.epost || p?.email || '').toString().trim(),
                roller: Array.isArray(p?.roller) ? p.roller : []
            }))
            .filter(p => p.epost)
            .map(p => {
                const labelParts = [p.namn || ''];
                if (p.roller.length) labelParts.push(`(${p.roller.join(', ')})`);
                return `<option value="${this._esc(p.epost)}" label="${this._esc(labelParts.filter(Boolean).join(' '))}"></option>`;
            })
            .join('');

        const riskChoicesHtml = (riskAtgarder || []).map(a => {
            const checked = riskValda.some(x => String(x).toLowerCase() === String(a).toLowerCase());
            return `<label style="display:flex; gap:0.5rem; align-items:flex-start; margin:0.25rem 0;">
                <input type="checkbox" data-risk-item value="${this._esc(a)}" ${checked ? 'checked' : ''}>
                <span>${this._esc(a)}</span>
            </label>`;
        }).join('') || `<div style="color:#94a3b8;">Inga åtgärder hittades i kundens riskbedömning.</div>`;
        const hasRiskAtgarder = Array.isArray(riskAtgarder) && riskAtgarder.length > 0;

        const decRowsRaw = (f['Deklaration rader'] || '').toString().trim();
        let decRows = [];
        try { decRows = decRowsRaw ? JSON.parse(decRowsRaw) : []; } catch (_) { decRows = []; }
        if (!Array.isArray(decRows)) decRows = [];

        const decRowsView = decRows.length
            ? `<div class="uppdrag-view-list">${decRows.map(r => {
                const t = this._esc(String(r?.typ || ''));
                const tx = this._esc(String(r?.text || ''));
                return `<div class="uppdrag-view-list-item"><i class="fas fa-file-alt"></i>${t}${tx ? ` — ${tx}` : ''}</div>`;
            }).join('')}</div>`
            : `<div class="uppdrag-muted">Inga deklarationsrader valda.</div>`;
        const decExtraHtml = extra.showDeklaration ? `
            <div class="uppdrag-deklaration-rows">
                <div class="uppdrag-deklaration-head">
                    <div class="uppdrag-riskbox-title" style="margin:0;">Deklarationstyper</div>
                    <button type="button" class="btn btn-secondary btn-sm" data-action="dek-add"><i class="fas fa-plus"></i> Lägg till rad</button>
                </div>
                <div data-dek-rows></div>
                <textarea class="kunduppgifter-input" rows="2" data-field="Deklaration rader" style="display:none;">${this._esc(decRowsRaw || '[]')}</textarea>
                <div class="uppdrag-muted" style="margin-top:0.35rem;">Du kan lägga samma deklarationstyp flera gånger och skriva fritext (t.ex. namn).</div>
            </div>
        ` : '';

        const headerDeadline = deadline ? this._esc(String(deadline)) : '–';
        const headerFreq = freq ? this._esc(String(freq)) : '–';
        const headerAnsvarig = ansvarig ? this._esc(String(ansvarig)) : '–';

        const viewRiskSelectedHtml = (riskValda && riskValda.length)
            ? `<div class="uppdrag-view-list">${riskValda.map(x => `<div class="uppdrag-view-list-item"><i class="fas fa-check"></i>${this._esc(String(x))}</div>`).join('')}</div>`
            : `<div class="uppdrag-muted">Inga riskåtgärder valda.</div>`;

        const viewRutinHtml = rutin
            ? `<div class="uppdrag-view-text">${this._esc(String(rutin))}</div>`
            : `<div class="uppdrag-muted">Ingen rutin sparad.</div>`;

        const viewRiskSectionHtml = hasRiskAtgarder
            ? `<div class="uppdrag-view-field">
                                <div class="uppdrag-view-label">Åtgärd enligt kundens riskbedömning</div>
                                ${riskOn ? viewRiskSelectedHtml : `<div class="uppdrag-muted">Ej aktiverat.</div>`}
                            </div>`
            : `<div class="uppdrag-view-field">
                                <div class="uppdrag-view-label">Inga åtgärder hittades i kundens riskbedömning</div>
                            </div>`;

        const editRiskSectionHtml = hasRiskAtgarder
            ? `<div class="uppdrag-riskbox">
                            <div class="uppdrag-riskbox-title">Åtgärd enligt kundens riskbedömning</div>
                            <div class="uppdrag-riskbox-items" data-risk-wrap>
                                ${riskChoicesHtml}
                            </div>
                        </div>`
            : `<div class="uppdrag-riskbox">
                            <div class="uppdrag-riskbox-title">Inga åtgärder hittades i kundens riskbedömning</div>
                        </div>`;

        const ptlSectionHtml = hasRiskAtgarder ? `
                        <div class="uppdrag-block">
                            <label class="uppdrag-label"><i class="fas fa-paperclip"></i> Underlag till PTL-åtgärd (valfritt)</label>
                            <input type="file" class="kunduppgifter-input" data-ptl-file multiple>
                            <div class="uppdrag-actions" style="margin-top:0.5rem;">
                                <button type="button" class="btn btn-secondary btn-sm" data-action="upload-ptl"><i class="fas fa-upload"></i> Ladda upp underlag</button>
                            </div>
                            <textarea class="kunduppgifter-input" rows="2" data-field="PTL Underlag" style="display:none;">${this._esc(ptlUnderlagRaw || '[]')}</textarea>
                            <div class="uppdrag-ptl-files" data-ptl-files></div>
                            <div class="uppdrag-muted" style="margin-top:0.35rem;">Filerna sparas på fliken Dokumentation (kategori: riskbedömning).</div>
                        </div>
        ` : '';

        const viewDeklarationHtml = extra.showDeklaration ? `
            <div class="uppdrag-view-field uppdrag-span-full" style="margin-top:0.85rem;">
                <div class="uppdrag-view-label">Deklarationstyper</div>
                ${decRowsView}
            </div>
        ` : '';

        const riskValdaJson = this._esc(JSON.stringify(riskValda || []));
        const ptlUnderlagRaw = (f['PTL Underlag'] || '').toString().trim();
        const ptlUnderlagJson = this._esc(ptlUnderlagRaw || '[]');

        const isDone = this._isUppdragDoneForPeriod(f);
        const doneBtnClass = isDone ? 'uppdrag-done-btn is-done' : 'uppdrag-done-btn';

        return `
            <div class="collapsible-card uppdrag-card is-collapsed" data-uppdrag-typ="${this._esc(typ)}">
                <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('is-collapsed')">
                    <div class="uppdrag-header">
                        <div class="collapsible-title"><i class="fas ${icon}"></i><span>${this._esc(typ)}</span></div>
                        <div class="uppdrag-header-meta">
                            <span class="uppdrag-meta-chip"><i class="fas fa-redo"></i> <span data-uppdrag-meta="Frekvens">${headerFreq}</span></span>
                            <span class="uppdrag-meta-chip"><i class="fas fa-calendar-alt"></i> <span data-uppdrag-meta="Nästa deadline">${headerDeadline}</span></span>
                            <span class="uppdrag-meta-chip"><i class="fas fa-user"></i> <span data-uppdrag-meta="Ansvarig">${headerAnsvarig}</span></span>
                        </div>
                    </div>
                    <button type="button" class="${doneBtnClass}" title="${isDone ? 'Klarmarkerad' : 'Klarmarkera'}" aria-label="Klarmarkera" data-action="done-header" onclick="event.stopPropagation()">
                        <i class="fas fa-check"></i>
                    </button>
                    <button type="button" class="uppdrag-edit-btn" title="Redigera" aria-label="Redigera" data-action="toggle-edit" onclick="event.stopPropagation()">
                        <i class="fas fa-pen"></i>
                    </button>
                    <i class="fas fa-chevron-down collapsible-chevron uppdrag-chevron"></i>
                </div>
                <div class="collapsible-body">
                    <input type="hidden" data-uppdrag-risk-on value="${riskOn ? '1' : '0'}">
                    <input type="hidden" data-uppdrag-risk-valda value="${riskValdaJson}">
                    <input type="hidden" data-uppdrag-ptl-underlag value="${ptlUnderlagJson}">

                    <div class="uppdrag-view" data-uppdrag-mode="view">
                        <div class="uppdrag-view-top">
                            <div class="uppdrag-startdatum">
                                <div class="uppdrag-startdatum-label">Startdatum</div>
                                <div class="uppdrag-startdatum-value">${startdatum ? this._esc(String(startdatum)) : '–'}</div>
                            </div>
                            <div class="uppdrag-view-field">
                                <div class="uppdrag-view-label">Rutin / instruktion</div>
                                ${viewRutinHtml}
                            </div>
                            ${viewRiskSectionHtml}
                        </div>

                        ${viewDeklarationHtml}

                        <div class="uppdrag-block">
                            <label class="uppdrag-label"><i class="fas fa-sticky-note"></i> Anteckning (för denna körning)</label>
                            <textarea class="kunduppgifter-input" rows="2" data-field="_note" placeholder="T.ex. avvikelse, extra info..."></textarea>
                        </div>

                        <div class="uppdrag-actions uppdrag-actions--after-note">
                            <button type="button" class="btn btn-secondary btn-sm" data-action="done"><i class="fas fa-check"></i> Klarmarkera</button>
                        </div>

                        <div class="uppdrag-prev-notes">
                            <div class="uppdrag-prev-notes-head">Tidigare anteckningar (klarmarkerade körningar)</div>
                            <div class="uppdrag-prev-notes-list">${notesHtml}</div>
                        </div>
                    </div>

                    <div class="uppdrag-edit" data-uppdrag-mode="edit" style="display:none;">
                        <div class="lead-fields uppdrag-lead-fields">
                            <div class="lead-field">
                                <label>Frekvens</label>
                                <select class="form-control" data-field="Frekvens">${freqHtml}</select>
                            </div>
                            <div class="lead-field">
                                <label>Startdatum</label>
                                <input class="kunduppgifter-input" type="date" data-field="Startdatum" value="${this._esc(String(startdatum || ''))}">
                            </div>
                            <div class="lead-field">
                                <label>Handläggare</label>
                                <select class="form-control" data-field="Ansvarig">${userOptHtml}</select>
                            </div>
                            <div class="lead-field">
                                <label>Nästa deadline</label>
                                <input class="kunduppgifter-input" type="date" data-field="Nästa deadline" value="${this._esc(String(deadline || ''))}">
                            </div>
                        </div>

                        <div class="uppdrag-block">
                            <label class="uppdrag-label"><i class="fas ${icon}"></i> Rutin / instruktion</label>
                            <textarea class="kunduppgifter-input" rows="4" data-field="Rutin" placeholder="Skriv rutin/instruktion...">${this._esc(String(rutin || ''))}</textarea>
                        </div>

                        <div class="collapsible-card uppdrag-subcard is-collapsed" style="margin-top:0.75rem;">
                            <div class="collapsible-header" onclick="this.closest('.collapsible-card').classList.toggle('is-collapsed')">
                                <div class="collapsible-title"><i class="fas fa-paper-plane"></i><span>Schemalagd förfrågan till kund (valfritt)</span></div>
                                <i class="fas fa-chevron-down collapsible-chevron uppdrag-chevron"></i>
                            </div>
                            <div class="collapsible-body">
                                <div class="uppdrag-muted" style="margin-top:0.1rem;">Skickar automatiskt en underlagsförfrågan via Samarbete enligt schema. Stöd i mall: <strong>{PERIOD}</strong> → t.ex. “mars 2026”.</div>
                                <div style="display:grid; gap:0.65rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top:0.75rem;">
                                    <label style="display:flex; gap:0.5rem; align-items:center;">
                                        <input type="checkbox" data-field="Auto underlagsförfrågan" ${f['Auto underlagsförfrågan'] ? 'checked' : ''}>
                                        <span>Aktivera auto-utskick</span>
                                    </label>
                                    <div>
                                        <label style="display:block; font-weight:600; margin-bottom:0.25rem;">Underlaget avser</label>
                                    <select class="form-control" data-field="Underlagsperiod">
                                            ${(typ === 'Momsredovisning'
                                                ? ['Föregående månad','Föregående kvartal','Föregående år']
                                                : ['Föregående månad','Denna månad','Nästa månad']
                                            ).map(v => `<option value="${this._esc(v)}" ${(String(f['Underlagsperiod']||'Föregående månad')===v)?'selected':''}>${this._esc(v)}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div>
                                        <label style="display:block; font-weight:600; margin-bottom:0.25rem;">Skickas dag i månaden</label>
                                        <input class="kunduppgifter-input" type="number" min="1" max="28" step="1" data-field="Underlagsutskick dag" value="${this._esc(String(f['Underlagsutskick dag'] || ''))}" placeholder="t.ex. 1 eller 10">
                                    </div>
                                    <div>
                                        <label style="display:block; font-weight:600; margin-bottom:0.25rem;">Deadline dag i månaden</label>
                                        <input class="kunduppgifter-input" type="number" min="1" max="28" step="1" data-field="Underlagsdeadline dag" value="${this._esc(String(f['Underlagsdeadline dag'] || ''))}" placeholder="t.ex. 5 eller 15">
                                    </div>
                                    <div>
                                        <label style="display:block; font-weight:600; margin-bottom:0.25rem;">Mottagare namn</label>
                                        <input class="kunduppgifter-input" type="text" data-field="Underlagsmottagare namn" value="${this._esc(String(f['Underlagsmottagare namn'] || ''))}" placeholder="t.ex. Kund">
                                    </div>
                                    <div>
                                        <label style="display:block; font-weight:600; margin-bottom:0.25rem;">Mottagare e-post</label>
                                        <input class="kunduppgifter-input" type="email" list="${this._esc(underlagEpostListId)}" data-field="Underlagsmottagare e-post" value="${this._esc(String(f['Underlagsmottagare e-post'] || ''))}" placeholder="Välj från roller eller skriv...">
                                        <datalist id="${this._esc(underlagEpostListId)}">${rollerEpostOptions}</datalist>
                                    </div>
                                </div>
                                <div style="margin-top:0.75rem;">
                                    <label style="display:block; font-weight:600; margin-bottom:0.25rem;">Meddelande till kunden <span style="color:#64748b; font-weight:400;">(visas i mejlet)</span></label>
                                    <textarea class="kunduppgifter-input" rows="2" data-field="Underlagsmeddelande" placeholder="t.ex. Jag behöver detta senast på torsdag">${this._esc(String(f['Underlagsmeddelande'] || ''))}</textarea>
                                </div>

                                <div style="margin-top:0.75rem;">
                                    <label style="display:block; font-weight:600; margin-bottom:0.25rem;">Begärt underlag <span style="color:#ef4444;">*</span></label>
                                    <div data-underlag-items-wrap>
                                        ${(String(f['Underlagsmall'] || '').trim()
                                            ? String(f['Underlagsmall']).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
                                            : ['']
                                        ).map((line, idx) => {
                                            const hasReq = /\[fil obligatorisk\]\s*$/i.test(line || '');
                                            const clean = (line || '').replace(/\s*\[fil obligatorisk\]\s*$/gi, '').trim();
                                            return `
                                                <div class="samarbete-item-row">
                                                    <input type="text" class="form-control samarbete-item-input" placeholder="t.ex. kontoutdrag {PERIOD} eller en längre fråga" data-underlag-item="${idx}" value="${this._esc(clean)}">
                                                    <label class="samarbete-file-req-wrap ${hasReq ? 'is-checked' : ''}" title="${hasReq ? 'Fil krävs – klicka för att ta bort kravet' : 'Klicka för att kräva fil från kunden'}">
                                                        <input type="checkbox" class="samarbete-file-required samarbete-file-required-input" data-underlag-item="${idx}" ${hasReq ? 'checked' : ''}>
                                                        <span class="samarbete-file-req-icon"><i class="fas fa-file-upload"></i></span>
                                                    </label>
                                                    <button type="button" class="btn btn-ghost btn-sm underlag-item-remove" title="Ta bort" style="flex-shrink:0;"><i class="fas fa-times"></i></button>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                    <button type="button" class="btn btn-ghost btn-sm" data-action="underlag-add-item" style="margin-top:0.5rem;"><i class="fas fa-plus"></i> Lägg till fler frågor</button>
                                    <div class="uppdrag-muted" style="margin-top:0.35rem;">Stöd: <strong>{PERIOD}</strong> ersätts med t.ex. “mars 2026”.</div>
                                </div>
                                ${lastUnderlagInfo}
                            </div>
                        </div>

                        ${decExtraHtml}

                        ${editRiskSectionHtml}

                        ${ptlSectionHtml}

                        <div class="uppdrag-actions">
                            <button type="button" class="btn btn-primary btn-sm" data-action="save"><i class="fas fa-save"></i> Spara</button>
                            <button type="button" class="btn btn-ghost btn-sm" data-action="cancel-edit"><i class="fas fa-times"></i> Avbryt</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async _saveUppdragFromCard(root, typ) {
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const opts = getAuthOptsKundkort();
            const customerId = this.customerId || this.currentCustomerId;
            if (!customerId) throw new Error('Saknar customerId');

            const getVal = (name) => root.querySelector(`[data-field="${CSS.escape(name)}"]`);
            const fields = {};
            fields['Frekvens'] = getVal('Frekvens')?.value || '';
            fields['Startdatum'] = getVal('Startdatum')?.value || '';
            fields['Nästa deadline'] = getVal('Nästa deadline')?.value || '';
            fields['Ansvarig'] = getVal('Ansvarig')?.value || '';
            fields['Rutin'] = getVal('Rutin')?.value || '';
            const riskSelected = Array.from(root.querySelectorAll('input[data-risk-item]:checked')).map(i => i.value);
            fields['Riskåtgärder valda'] = JSON.stringify(riskSelected);
            fields['Riskåtgärder aktiverade'] = riskSelected.length > 0;
            fields['PTL Underlag'] = getVal('PTL Underlag')?.value || '[]';
            // Schemalagd förfrågan (underlag)
            const autoCb = getVal('Auto underlagsförfrågan');
            fields['Auto underlagsförfrågan'] = !!(autoCb && autoCb.checked);
            fields['Underlagsperiod'] = getVal('Underlagsperiod')?.value || '';
            const clamp28 = (v) => {
                const n = parseInt(String(v || '').trim(), 10);
                if (!Number.isFinite(n)) return null;
                if (n < 1 || n > 28) return null;
                return n;
            };
            const sendDay = clamp28(getVal('Underlagsutskick dag')?.value);
            const deadlineDay = clamp28(getVal('Underlagsdeadline dag')?.value);
            fields['Underlagsutskick dag'] = sendDay;
            fields['Underlagsdeadline dag'] = deadlineDay;
            fields['Underlagsmottagare namn'] = getVal('Underlagsmottagare namn')?.value || '';
            fields['Underlagsmottagare e-post'] = getVal('Underlagsmottagare e-post')?.value || '';
            fields['Underlagsmeddelande'] = getVal('Underlagsmeddelande')?.value || '';
            // Underlagsfrågor (sparas fortfarande i Underlagsmall i Airtable)
            const underlagRows = Array.from(root.querySelectorAll('[data-underlag-items-wrap] .samarbete-item-row'));
            const underlagLines = [];
            underlagRows.forEach((row) => {
                const inp = row.querySelector('.samarbete-item-input');
                const chk = row.querySelector('.samarbete-file-required');
                const text = (inp && inp.value) ? inp.value.trim() : '';
                if (!text) return;
                underlagLines.push(text + ((chk && chk.checked) ? ' [fil obligatorisk]' : ''));
            });
            fields['Underlagsmall'] = underlagLines.join('\n');
            if (typ === 'Deklaration') {
                // Deklarationsrader (typ + fritext) sparas som JSON
                const rowsWrap = root.querySelector('[data-dek-rows]');
                const rows = rowsWrap ? Array.from(rowsWrap.querySelectorAll('.uppdrag-dek-row')).map(r => ({
                    typ: r.querySelector('.uppdrag-dek-typ')?.value || 'NE',
                    text: (r.querySelector('.uppdrag-dek-text')?.value || '').toString().trim()
                })).filter(x => x.typ || x.text) : [];
                fields['Deklaration rader'] = JSON.stringify(rows);
            }

            const res = await fetch(`${baseUrl}/api/uppdrag`, {
                method: 'POST',
                ...opts,
                body: JSON.stringify({ customerId, typ, fields })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            if (data.warning) {
                this.showNotification(String(data.warning), 'error');
            } else {
                this.showNotification('Uppdrag sparat', 'success');
            }
            this._syncUppdragHeaderMeta(root);
            // Re-render för att visa att kortet nu är "sparat i Airtable" + ev andra fält
            this.loadUppdrag();
        } catch (e) {
            console.error('❌ _saveUppdragFromCard:', e);
            this.showNotification('Kunde inte spara uppdrag: ' + (e.message || 'fel'), 'error');
        }
    }

    async _completeUppdragFromCard(root, typ, options = {}) {
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const opts = getAuthOptsKundkort();
            const customerId = this.customerId || this.currentCustomerId;
            if (!customerId) throw new Error('Saknar customerId');

            // PTL-krav: om åtgärder är aktiverade måste minst en vara vald
        const riskOn = root.querySelector('[data-uppdrag-risk-on]')?.value === '1'
            || !!root.querySelector('[data-field="Riskåtgärder aktiverade"]')?.checked;
            let riskValda = [];
            try { riskValda = JSON.parse(root.querySelector('[data-uppdrag-risk-valda]')?.value || '[]'); } catch (_) { riskValda = []; }
            if (root.querySelectorAll('input[data-risk-item]:checked').length) {
                riskValda = Array.from(root.querySelectorAll('input[data-risk-item]:checked')).map(i => i.value);
            }
        if (riskOn && (!riskValda || riskValda.length === 0)) {
            // open edit mode for clarity
            root.classList.remove('is-collapsed');
            root.querySelector('[data-action="toggle-edit"]')?.click();
            this.showNotification('Du måste välja minst en PTL-åtgärd innan du kan klarmarkera uppdraget.', 'error');
            return;
        }

            const note = (options.noteOverride != null) ? String(options.noteOverride) : (root.querySelector('[data-field="_note"]')?.value || '');
            const res = await fetch(`${baseUrl}/api/uppdrag/complete`, {
                method: 'POST',
                ...opts,
                body: JSON.stringify({ customerId, typ, note })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            this.showNotification(data.nextDeadline ? `Klart ✅ Nästa deadline: ${data.nextDeadline}` : 'Klart ✅', 'success');
            // Reload uppdrag och vänta in render så listan aldrig blir "tom" i mellanläge
            await this.loadUppdrag();
        } catch (e) {
            console.error('❌ _completeUppdragFromCard:', e);
            this.showNotification('Kunde inte klarmarkera: ' + (e.message || 'fel'), 'error');
        }
    }

    _syncUppdragHeaderMeta(root) {
        if (!root) return;
        const getVal = (name) => root.querySelector(`[data-field="${CSS.escape(name)}"]`);
        const freq = getVal('Frekvens')?.value || '–';
        const deadline = getVal('Nästa deadline')?.value || '–';
        const ansvarig = getVal('Ansvarig')?.value || '–';
        const set = (k, v) => {
            const el = root.querySelector(`[data-uppdrag-meta="${CSS.escape(k)}"]`);
            if (el) el.textContent = String(v || '–');
        };
        set('Frekvens', freq || '–');
        set('Nästa deadline', deadline || '–');
        set('Ansvarig', ansvarig || '–');
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
        // OBS: "Verksamhetsbeskrivning" i kortet "Uppgifter från Bolagsverket" ska komma från Bolagsverket-data,
        // inte från den manuella texten i "Beskrivning av kunden".
        const verksamhet = fields.Verksamhetsbeskrivning || '';
        const sniRaw = fields['SNI kod'] || fields['SNI-koder'] || '';
        const befattning = fields.Befattningshavare || '';

        // SNI-koder — kan komma som:
        // - "62010 Dataprogrammering\n62020 Konsultverksamhet"
        // - "70200 - Konsultverksamhet..., 01500 - Blandat jordbruk"
        let sniHTML = '<span class="lead-empty">Saknas</span>';
        if (sniRaw) {
            const chunks = sniRaw
                .split('\n')
                .flatMap(r => r.split(','))
                .map(r => r.trim())
                .filter(Boolean);

            const parsed = chunks.map((row) => {
                // "12345 - text", "12345 – text" eller "12345  text" (siffror först)
                const m = row.match(/^(\d{4,6})\s*(?:[-–]\s*|\s{1,})(.+)$/);
                if (m) return { kod: m[1], label: (m[2] || '').trim() };
                const m2 = row.match(/^(\d{4,6})$/);
                if (m2) return { kod: m2[1], label: '' };
                // Avklippt beskrivning efter komma-split m.m. — aldrig som "kod", bara löptext
                return { kod: null, label: row };
            });

            if (parsed.length > 0) {
                sniHTML = parsed.map(({ kod, label }) => {
                    const lRaw = String(label || '').trim();
                    const l = lRaw ? this._esc(lRaw) : '';
                    if (kod != null && /^\d{4,6}$/.test(String(kod).trim())) {
                        const k = this._esc(String(kod).trim());
                        return l
                            ? `<span class="sni-code-badge">${k}</span><span class="sni-code-label">${l}</span>`
                            : `<span class="sni-code-badge">${k}</span>`;
                    }
                    return l ? `<span class="sni-code-label">${l}</span>` : '';
                }).filter(Boolean).join('');
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

        // Om enskild firma: standardrad i Roller — företagsnamn, roll Ägare EF, personnr = orgnr, e-post som i kontaktuppgifter (går att ändra)
        const arEnskildFirma = bolagsform === 'Enskild firma';
        const harAgareEF = kontaktPersoner.some(p => (p.roller || []).includes('Ägare EF') || p.roll === 'Ägare EF');
        if (arEnskildFirma && !harAgareEF && namn) {
            const kundEpost = fields['e-post'] || fields['Email'] || fields['E-post'] || '';
            const agare = {
                namn: namn.trim(),
                roller: ['Ägare EF'],
                epost: kundEpost,
                personnr: orgnr || ''
            };
            kontaktPersoner = [agare, ...kontaktPersoner];
            this._kontaktPersoner = kontaktPersoner;
            this._saveKontaktPersoner({ 'Verklig huvudman': namn.trim() });
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
        this._updateKlarTabIndicators(fields);

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

        const curOms = (fields['Omsättning'] || '').toString().trim();
        let omsOpts = '<option value="">Välj omsättningsintervall...</option>';
        for (const v of KUND_OMSATTNING_VAL) {
            omsOpts += `<option value="${this._esc(v)}" ${curOms === v ? 'selected' : ''}>${this._esc(v)}</option>`;
        }
        if (curOms && !KUND_OMSATTNING_VAL.includes(curOms)) {
            omsOpts += `<option value="${this._esc(curOms)}" selected>${this._esc(curOms)} (befintligt värde)</option>`;
        }

        const mis = '<span class="missing-data">Ej angiven</span>';

        container.innerHTML = `

            <!-- KORT 1: Uppgifter från Bolagsverket -->
            <div class="collapsible-card" id="bolagsverket-card" >
                <div class="collapsible-header" onclick="customerCardManager.toggleCard('bolagsverket-card')">
                    <div class="collapsible-title"><i class="fas fa-building"></i><span>Uppgifter från Bolagsverket</span></div>
                    <div class="collapsible-actions" onclick="event.stopPropagation()">
                        <button type="button" class="btn btn-ghost btn-sm" id="bolagsverket-refresh-btn" title="Sök om hos Bolagsverket">
                            <i class="fas fa-rotate-right"></i> Uppdatera
                        </button>
                    </div>
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
                    <div class="collapsible-title">
                        <i class="fas fa-align-left"></i>
                        <span>Beskrivning av kunden</span>
                        <button
                            type="button"
                            class="help-qmark"
                            id="beskrivning-help-btn"
                            aria-label="Hjälp för Beskrivning av kunden"
                            data-help-text="Beskriv kundens verksamhet, vilka som är deras typiska kunder och leverantörer, hur de tar betalt för sina tjänster. Beskriv varför de anlitar byrån och omfattningen. Har de verksamhet/kunder eller leverantörer utomlands? Vilka länder isåfall."
                            title="Beskriv kundens verksamhet, vilka som är deras typiska kunder och leverantörer, hur de tar betalt för sina tjänster. Beskriv varför de anlitar byrån och omfattningen. Har de verksamhet/kunder eller leverantörer utomlands? Vilka länder isåfall."
                            onclick="event.stopPropagation(); customerCardManager && customerCardManager.showHelpPopover && customerCardManager.showHelpPopover(this);"
                        >?</button>
                    </div>
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
                        <div class="kunduppgifter-row">
                            <span class="kunduppgifter-label"><i class="fas fa-chart-line"></i> Omsättning</span>
                            <span class="kunduppgifter-value" id="redov-omsattning-view">${curOms || mis}</span>
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
                            <div class="kunduppgifter-form-row">
                                <label>Omsättning</label>
                                <select id="redov-omsattning-input" class="kunduppgifter-input">${omsOpts}</select>
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

        // Uppdatera-knapp för Bolagsverket: sök om + visa förändringar
        const refreshBtn = document.getElementById('bolagsverket-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.refreshBolagsverketData();
            });
        }

        console.log('✅ Company info loaded with lead-card layout');
    }

    async refreshBolagsverketData() {
        const btn = document.getElementById('bolagsverket-refresh-btn');
        const origHtml = btn?.innerHTML;

        try {
            const customerId = this.customerId;
            const fields = this.customerData?.fields || {};
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

            const orgnrRaw = (fields.Orgnr || fields['Organisationsnummer'] || fields['Org.nr'] || '').toString().trim();
            const orgnr = orgnrRaw.replace(/[^\d]/g, '');
            if (!orgnr) {
                this.showNotification('Organisationsnummer saknas på kunden.', 'error');
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Hämtar...';
            }

            const res = await fetch(`${baseUrl}/api/bolagsverket/organisationer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organisationsnummer: orgnr })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || payload.message || `HTTP ${res.status}`);

            const app = window.clientFlowApp;
            if (!app || typeof app.transformBolagsverketData !== 'function') {
                throw new Error('Kunde inte hitta transformBolagsverketData (app.js).');
            }
            app.lastSearchedOrgNumber = orgnr;
            const transformed = app.transformBolagsverketData(payload.data);

            const newFields = {};
            const setIf = (key, val) => {
                const v = (val == null) ? '' : String(val).trim();
                if (v) newFields[key] = v;
            };

            setIf('regdatum', transformed.registreringsdatum);
            setIf('registreringsland', transformed.registreringsland);
            setIf('Bolagsform', transformed.form);
            setIf('Address', transformed.adress?.fullAddress);
            setIf('Verksamhetsbeskrivning', transformed.verksamhet);

            if (Array.isArray(transformed.sniKoder) && transformed.sniKoder.length) {
                const lines = transformed.sniKoder
                    .filter(s => (s?.kod || '').toString().trim())
                    .map(s => {
                        const kod = String(s.kod || '').trim();
                        const klar = String(s.klartext || '').trim();
                        return klar ? `${kod} - ${klar}` : kod;
                    })
                    .join('\n');
                if (lines) {
                    const target = (fields['SNI kod'] != null) ? 'SNI kod'
                        : ((fields['SNI-koder'] != null) ? 'SNI-koder' : 'SNI kod');
                    newFields[target] = lines;
                }
            }

            const norm = (v) => (v == null) ? '' : String(v).replace(/\r/g, '').trim();
            const diffs = Object.keys(newFields)
                .map((k) => ({ key: k, prev: norm(fields[k]), next: norm(newFields[k]) }))
                .filter(d => d.prev !== d.next);

            this._showBolagsverketDiffModal({ customerId, diffs, newFields });
        } catch (e) {
            console.error('❌ refreshBolagsverketData:', e);
            this.showNotification('Kunde inte uppdatera från Bolagsverket: ' + (e.message || 'fel'), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml || '<i class="fas fa-rotate-right"></i> Uppdatera';
            }
        }
    }

    _showBolagsverketDiffModal({ customerId, diffs, newFields }) {
        const existing = document.getElementById('bolagsverket-diff-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bolagsverket-diff-modal';
        modal.className = 'modal-overlay';

        const rowsHtml = diffs.length ? diffs.map((d) => `
            <label class="uppdrag-riskbox-toggle" style="align-items:flex-start; font-weight:600;">
                <input type="checkbox" class="bv-diff-cb" value="${this._esc(d.key)}">
                <div style="display:grid; gap:0.15rem;">
                    <div style="color:#0f172a;">${this._esc(d.key)}</div>
                    <div class="uppdrag-muted">Nu: ${this._esc(d.prev || '—')}</div>
                    <div class="uppdrag-muted">Ny: ${this._esc(d.next || '—')}</div>
                </div>
            </label>
        `).join('') : `<div class="uppdrag-muted">Inga förändringar hittades.</div>`;

        modal.innerHTML = `
            <div class="modal-box" style="max-width:820px; width:96vw; max-height:90vh;">
                <div class="modal-header">
                    <h3><i class="fas fa-rotate-right"></i> Förändringar från Bolagsverket</h3>
                    <button class="modal-close" type="button" onclick="document.getElementById('bolagsverket-diff-modal')?.remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="overflow:auto;">
                    ${rowsHtml}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost btn-sm" type="button" onclick="document.getElementById('bolagsverket-diff-modal')?.remove()">Stäng</button>
                    <button class="btn btn-primary btn-sm" type="button" id="bolagsverket-diff-apply" ${diffs.length ? '' : 'disabled'}>
                        <i class="fas fa-save"></i> Uppdatera kund
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const applyBtn = document.getElementById('bolagsverket-diff-apply');
        if (applyBtn) {
            applyBtn.addEventListener('click', async () => {
                try {
                    const selectedKeys = Array.from(modal.querySelectorAll('.bv-diff-cb:checked')).map(cb => cb.value);
                    const fieldsToSave = {};
                    selectedKeys.forEach(k => { fieldsToSave[k] = newFields[k]; });
                    if (!Object.keys(fieldsToSave).length) return;

                    const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
                    const orig = applyBtn.innerHTML;
                    applyBtn.disabled = true;
                    applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...';

                    const resp = await fetch(`${baseUrl}/api/kunddata/${customerId}`, {
                        method: 'PATCH',
                        ...getAuthOptsKundkort(),
                        body: JSON.stringify({ fields: fieldsToSave })
                    });
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

                    this.customerData.fields = { ...(this.customerData.fields || {}), ...fieldsToSave };
                    document.getElementById('bolagsverket-diff-modal')?.remove();
                    this.showNotification('Uppgifter uppdaterade från Bolagsverket', 'success');
                    this.loadCompanyInfo();
                } catch (e) {
                    this.showNotification('Kunde inte uppdatera kund: ' + (e.message || 'fel'), 'error');
                    applyBtn.disabled = false;
                    applyBtn.innerHTML = '<i class="fas fa-save"></i> Uppdatera kund';
                }
            });
        }
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

            if (this._syncEfAgareEpostWithKontakt(email)) {
                await this._saveKontaktPersoner({}, { skipSuccessNotification: true });
                this._refreshRollerList();
            }

            this.toggleKunduppgifterEdit();
            this._updateKlarTabIndicators(this.customerData?.fields || {});
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
            this._updateKlarTabIndicators(this.customerData?.fields || {});
            this.showNotification('Beskrivning sparad!', 'success');
        } catch (error) {
            this.showNotification(`Kunde inte spara: ${error.message}`, 'error');
        } finally {
            if (saveBtn) { saveBtn.innerHTML = orig; saveBtn.disabled = false; }
        }
    }

    showHelpPopover(btn) {
        try {
            const text = (btn?.getAttribute('data-help-text') || '').toString();
            if (!text) return;

            // Toggle: stäng om den redan är öppen på samma knapp
            const existing = document.getElementById('help-popover');
            const existingFor = existing?.getAttribute('data-for') || '';
            const id = btn.id || '';
            if (existing && existingFor && existingFor === id) {
                existing.remove();
                return;
            }
            if (existing) existing.remove();

            const pop = document.createElement('div');
            pop.id = 'help-popover';
            pop.className = 'help-popover';
            pop.setAttribute('role', 'dialog');
            if (id) pop.setAttribute('data-for', id);
            pop.textContent = text;
            document.body.appendChild(pop);

            const r = btn.getBoundingClientRect();
            const margin = 8;
            const maxW = Math.min(420, Math.max(240, window.innerWidth - 2 * margin));
            pop.style.maxWidth = maxW + 'px';
            const pr = pop.getBoundingClientRect();

            let left = r.left;
            left = Math.min(left, window.innerWidth - pr.width - margin);
            left = Math.max(margin, left);
            let top = r.bottom + 8;
            if (top + pr.height > window.innerHeight - margin) {
                top = r.top - pr.height - 8;
            }
            top = Math.max(margin, top);

            pop.style.left = `${Math.round(left)}px`;
            pop.style.top = `${Math.round(top)}px`;

            const onDoc = (e) => {
                const target = e.target;
                if (target === btn) return;
                if (pop.contains(target)) return;
                pop.remove();
                document.removeEventListener('mousedown', onDoc, true);
                document.removeEventListener('keydown', onEsc, true);
                window.removeEventListener('scroll', onScroll, true);
                window.removeEventListener('resize', onScroll, true);
            };
            const onEsc = (e) => {
                if (e.key === 'Escape') {
                    pop.remove();
                    document.removeEventListener('mousedown', onDoc, true);
                    document.removeEventListener('keydown', onEsc, true);
                    window.removeEventListener('scroll', onScroll, true);
                    window.removeEventListener('resize', onScroll, true);
                }
            };
            const onScroll = () => {
                // stäng vid scroll/resize för att slippa "flyta runt"
                if (document.getElementById('help-popover')) pop.remove();
                document.removeEventListener('mousedown', onDoc, true);
                document.removeEventListener('keydown', onEsc, true);
                window.removeEventListener('scroll', onScroll, true);
                window.removeEventListener('resize', onScroll, true);
            };
            document.addEventListener('mousedown', onDoc, true);
            document.addEventListener('keydown', onEsc, true);
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', onScroll, true);
        } catch (_) {}
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
        const omsattning = document.getElementById('redov-omsattning-input')?.value?.trim() || '';

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
            if (omsattning) fields['Omsättning'] = omsattning;

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
            const omsEl = document.getElementById('redov-omsattning-view');
            if (metodEl) metodEl.innerHTML = metod || mis;
            if (periodEl) periodEl.innerHTML = period || mis;
            if (rakEl) rakEl.innerHTML = rakenskapsår || mis;
            if (bokEl) bokEl.innerHTML = bokforing || mis;
            if (bankEl) bankEl.innerHTML = bank || mis;
            if (omsEl) omsEl.innerHTML = omsattning || mis;

            if (this.customerData?.fields) {
                this.customerData.fields['Redovisningsmetod'] = metod;
                this.customerData.fields['Redovisningsperiod'] = period;
                this.customerData.fields['Räkenskapsår'] = rakenskapsår;
                this.customerData.fields['Bokforingsprogram'] = bokforing;
                this.customerData.fields['Bank'] = bank;
                if (omsattning) this.customerData.fields['Omsättning'] = omsattning;
            }
            if (omsattning) {
                this.renderOvrigKYCBase();
                this.loadServices();
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
        return ['Styrelseledamot', 'Revisor', 'VD', 'Suppleant', 'Firmatecknare', 'Ägare EF', 'Ombud', 'Verklig huvudman'];
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
                const pepMarked = !!p.pepMarkerad;
                return `
                <div class="roller-person-item" data-idx="${idx}">
                    <div class="roller-person-info">
                        <div class="roller-person-name-row">
                            <span class="roller-person-name"><i class="fas fa-user"></i> ${this._esc(p.namn || 'Namnlös')}</span>
                            ${pepMarked ? `<span class="roller-person-pep-flag" title="Markerad som PEP/sanktionslista"><i class="fas fa-flag"></i> PEP/Sanktion</span>` : ''}
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
            this._updateKlarTabIndicators(this.customerData.fields);
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

    _normalizeOrgNrForMatch(s) {
        return (s || '').toString().replace(/[\s-]/g, '');
    }

    /**
     * Enskild firma: uppdatera Ägare EF-radens e-post så den följer kontaktuppgifter (träff på namn = företagsnamn eller personnr = orgnr).
     * @returns {boolean} om någon rad ändrades
     */
    _syncEfAgareEpostWithKontakt(email) {
        const f = this.customerData?.fields;
        if (!f || f.Bolagsform !== 'Enskild firma' || !this._kontaktPersoner?.length) return false;
        const firmNamn = (f.Namn || f.namn || '').trim();
        const org = this._normalizeOrgNrForMatch(f.Orgnr || f.orgnr);
        const em = (email || '').trim();
        let changed = false;
        for (const p of this._kontaktPersoner) {
            const rolls = p.roller || [];
            if (!rolls.includes('Ägare EF')) continue;
            const pnr = this._normalizeOrgNrForMatch(p.personnr);
            const pn = (p.namn || '').trim();
            const matchOrg = !!org && pnr === org;
            const matchNamn = !!firmNamn && pn === firmNamn;
            if (matchOrg || matchNamn) {
                if ((p.epost || '').trim() !== em) {
                    p.epost = em;
                    changed = true;
                }
            }
        }
        return changed;
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

    async _saveKontaktPersoner(extraFields = {}, opts = {}) {
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
                this._updateKlarTabIndicators(this.customerData?.fields || {});
                if (!opts.skipSuccessNotification && !extraFields['Verklig huvudman']) this.showNotification('Kontaktpersoner sparade', 'success');
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
        this._updateKlarTabIndicators(this.customerData?.fields || {});
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
        const fmt = (v) => {
            const d = this.formatFieldDisplay(v);
            return d != null ? this._esc(d) : null;
        };
        const rich = (v) => {
            const d = this.formatFieldDisplay(v);
            return d ? this._esc(d).replace(/\n/g, '<br>') : '';
        };

        const chips = (items) => fmtList(items)
            .map(i => this.formatFieldDisplay(i))
            .filter(Boolean)
            .map(i => `<span class="kyc-chip">${this._esc(i)}</span>`).join('');

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
                    ${row('Frekvens', fmtList(f['Frekvens']).join(', ') || null, 'fa-sync')}
                    ${row('Omfattning (h)', fmt(f['omfattning i h']), 'fa-hourglass-half')}
                    ${row('Verklig huvudman', fmt(f['Verklig huvudman']), 'fa-user-shield')}
                    ${row('Ombud', fmt(f['Ombud']), 'fa-user-tie')}
                    ${chipsRow('Skatterättslig hemvist', f['Skatterättslig hemvist'], 'fa-flag')}
                    ${rich(f['Affärsmodell']) ? `<div class="kyc-richtext-row"><span class="kyc-row-label"><i class="fas fa-project-diagram"></i> Affärsmodell</span><div class="kyc-richtext">${rich(f['Affärsmodell'])}</div></div>` : ''}
                    ${rich(f['Ytterligare beskrivning av kunden och verksamheten']) ? `
                    <div class="kyc-richtext-row">
                        <span class="kyc-row-label"><i class="fas fa-align-left"></i> Ytterligare beskrivning</span>
                        <div class="kyc-richtext">${rich(f['Ytterligare beskrivning av kunden och verksamheten'])}</div>
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

                <!-- Kundens riskbedömning -->
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
                        ${rich(f['Uppdragstext']) ? `<div class="kyc-richtext-row"><span class="kyc-row-label"><i class="fas fa-align-left"></i> Uppdragstext</span><div class="kyc-richtext">${rich(f['Uppdragstext'])}</div></div>` : ''}

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
                    <p class="kyc-hint" style="margin-top:0.5rem;font-size:0.85rem;color:#64748b;">Skapar PDF med riskbedömning och bedömningspunkter, en lista över kundens valda tjänster (utan byråns tjänstanalyser), samt KYC som bilaga sist. Sparas på fliken Dokumentation.</p>
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

        const viewText = this.formatFieldDisplay(värde);
        const viewContent = typ === 'text'
            ? (viewText ? `<div class="kyc-richtext">${this._esc(viewText).replace(/\n/g, '<br>')}</div>` : '<span class="missing-data">Ej angiven</span>')
            : (ingaHtml
                ? ingaHtml
                : valda.length
                    ? `<div class="riskf-chips">${valda.map(v => {
                        const label = this.formatFieldDisplay(v) || String(v || '');
                        return label ? `<span class="${chipClass}">${this._esc(label)}</span>` : '';
                    }).filter(Boolean).join('')}</div>`
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
                        Kundens riskbedömning
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
                        <div class="risker-vald-section-label">Kundens riskbedömning</div>
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
                            <label style="font-weight:600;font-size:0.82rem;color:#475569;margin-bottom:0.3rem;display:block;">Kundens riskbedömning</label>
                            <textarea id="ai-rb-text-input" class="kunduppgifter-input" rows="5" placeholder="Skriv kundens riskbedömning...">${riskbedomning}</textarea>
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
                ${riskbedomning ? `<div class="risker-vald-section-label">Kundens riskbedömning</div>
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
                    <p class="rb-text">${this._esc(this.formatFieldDisplay(f['Motivering']) || '')}</p>
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
                    <p class="rb-text">${this._esc(this.formatFieldDisplay(f['Risksänkande åtgjärder']) || '')}</p>
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
                    <div style="margin-top:0.75rem;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="customerCardManager.entityScreeningFromBolagsverket(event)">
                            <i class="fas fa-building"></i> Sanktionsscreening företag (Dilisense)
                        </button>
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

    _normalizeTjanstNamn(namn) {
        return (namn || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    }

    /** Högre siffra = högre risk (används vid sammanslagning av dubbletter i Airtable). */
    _tjanstRiskRank(riskbedomning) {
        const r = (riskbedomning || '').trim();
        const order = { 'Hög': 4, 'Förhöjd': 3, 'Medel': 2, 'Låg': 1, 'Normal': 1 };
        return order[r] ?? 0;
    }

    /**
     * Flera rader i "Risker kopplad till tjänster" kan ha samma visningsnamn (olika risk/stavning).
     * Visar en rad per logisk tjänst; _mergedRecordIds = alla Airtable-id som hör ihop.
     */
    _dedupeByraTjanster(tjanster) {
        if (!Array.isArray(tjanster) || !tjanster.length) return [];
        const buckets = new Map();
        for (const t of tjanster) {
            const key = this._normalizeTjanstNamn(t.namn);
            if (!key) continue;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(t);
        }
        const merged = [];
        for (const arr of buckets.values()) {
            arr.sort((a, b) => {
                const dr = this._tjanstRiskRank(b.riskbedomning) - this._tjanstRiskRank(a.riskbedomning);
                if (dr !== 0) return dr;
                return String(a.id).localeCompare(String(b.id));
            });
            const primary = { ...arr[0] };
            primary._mergedRecordIds = arr.map((x) => x.id);
            merged.push(primary);
        }
        merged.sort((a, b) => {
            const ta = (a.typ || 'Övrigt').localeCompare(b.typ || 'Övrigt', 'sv');
            if (ta !== 0) return ta;
            return (a.namn || '').localeCompare(b.namn || '', 'sv');
        });
        return merged;
    }

    _tjanstIdMatchSet(t) {
        return t._mergedRecordIds && t._mergedRecordIds.length ? t._mergedRecordIds : [t.id];
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
                const raw = data.tjanster?.length ? data.tjanster : [];
                this._byransTjanster = this._dedupeByraTjanster(raw);
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
        const isTjanstAktiv = (t) => this._tjanstIdMatchSet(t).some((id) => aktSet.has(id));

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

        const aktiva = alla.filter((t) => isTjanstAktiv(t));

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
                        <input type="checkbox" name="tjanst-${p}" value="${t.id}" ${isTjanstAktiv(t) ? 'checked' : ''}
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

        // Incheckade värden = kanoniska record-ID (en per logisk tjänst efter deduplicering)
        const checkedIds = [...document.querySelectorAll(`#tjanster-edit-${p} input[name="tjanst-${p}"]:checked`)]
            .map((cb) => cb.value);

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

    // ─── KYC-FORMULÄR ─────────────────────────────────────────────────────────
    async loadKYCFormular() {
        const container = document.getElementById('kycformular-content');
        if (!container) return;

        if (!this.customerData?.fields) {
            container.innerHTML = '<p class="lead-empty">Ingen kunddata tillgänglig.</p>';
            return;
        }

        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const byraId = this.userByraIds?.[0] || this.userData?.byraId || '';

        // Ladda byråns tjänster om de inte redan cachats (behövs för att förifyll "tjänster")
        if (!this._byransTjanster && byraId) {
            try {
                const res = await fetch(`${baseUrl}/api/byra-tjanster?byraId=${encodeURIComponent(byraId)}`, { ...getAuthOptsKundkort() });
                const data = res.ok ? await res.json() : {};
                const raw = data.tjanster?.length ? data.tjanster : [];
                this._byransTjanster = this._dedupeByraTjanster ? this._dedupeByraTjanster(raw) : raw;
            } catch (e) {
                console.warn('⚠️ Kunde inte hämta byråns tjänster för KYC:', e.message);
                this._byransTjanster = [];
            }
        }

        // Ladda kundens aktiva tjänster om de inte redan cachats
        if (!this._aktivaTjansterIds) {
            try {
                const res = await fetch(`${baseUrl}/api/kunddata/${this.customerId}/tjanster`, { ...getAuthOptsKundkort() });
                const data = res.ok ? await res.json() : {};
                this._aktivaTjansterIds = new Set((data.tjanster || []).map(t => t.id));
                if (this.customerData?.fields) {
                    this.customerData.fields['Kundens utvalda tjänster'] = data.linkedIds || [];
                }
            } catch (e) {
                console.warn('⚠️ Kunde inte hämta kundens tjänster för KYC:', e.message);
                this._aktivaTjansterIds = new Set();
            }
        }

        // Hämta eventuellt sparat KYC-formulär
        let savedKyc = {};
        try {
            const res = await fetch(`${baseUrl}/api/kyc-formular/${this.customerId}`, { ...getAuthOptsKundkort() });
            if (res.ok) {
                const data = await res.json();
                savedKyc = data.kyc || {};
            }
        } catch (e) { console.warn('Kunde inte hämta sparat KYC-formulär:', e.message); }

        this._savedKycFormular = savedKyc;
        this._updateKlarTabIndicators(this.customerData?.fields || {});
        this.renderKYCFormular(savedKyc);
    }

    renderKYCFormular(saved = {}) {
        const container = document.getElementById('kycformular-content');
        if (!container) return;

        const f = this.customerData?.fields || {};
        const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        // 1. Grunduppgifter - hämtas från Airtable
        const foretagsnamn = saved.foretagsnamn || f['Namn'] || '';
        const orgnr = saved.orgnr || f['Orgnr'] || '';

        // 2. Företrädare - lista (sparad lista, äldre enskilt fält, eller förifyll från roller)
        const kontaktPersoner = this._kontaktPersoner || [];
        const foretradare = kontaktPersoner.filter(p => {
            const roller = p.roller || (p.roll ? [p.roll] : []);
            return roller.some(r => ['Styrelseledamot','VD','Firmatecknare','Ägare EF','Suppleant','Ombud'].includes(r));
        });
        let foretradareList = [];
        if (Array.isArray(saved.foretradare) && saved.foretradare.length > 0) {
            foretradareList = saved.foretradare.map(p => ({
                namn: p.namn || '',
                personnr: p.personnr || '',
                hemvist: p.skatterattslig_hemvist || p.hemvist || 'Sverige',
                tin: p.tin || ''
            }));
        } else if (saved.foretradareNamn || saved.foretradarePnr) {
            // Bakåtkompatibilitet: tidigare enskilt företrädarfält
            foretradareList = [{
                namn: saved.foretradareNamn || '',
                personnr: saved.foretradarePnr || '',
                hemvist: saved.skatterattslig_hemvist_foretradare || 'Sverige',
                tin: saved.tin_foretradare || ''
            }];
        } else if (foretradare.length > 0) {
            // Förifyll från befattningshavare/roller
            foretradareList = foretradare.map(p => ({
                namn: p.namn || '',
                personnr: p.personnr || '',
                hemvist: 'Sverige',
                tin: ''
            }));
        }
        if (foretradareList.length === 0) foretradareList = [{ namn: '', personnr: '', hemvist: 'Sverige', tin: '' }];

        // 3. Verklig huvudman - hämtas från roller
        const huvudman = kontaktPersoner.filter(p => {
            const roller = p.roller || (p.roll ? [p.roll] : []);
            return roller.includes('Verklig huvudman');
        });
        const savedHuvudmanInfo = saved.huvudmanInfo || huvudman.map(p => `${p.namn || ''}${p.personnr ? ' (' + p.personnr + ')' : ''}`).join('\n');
        const savedHuvudmanAnnatSatt = saved.huvudmanAnnatSatt || '';

        // 4. PEP - hämtas från roller
        const pepPersoner = kontaktPersoner.filter(p => p.pepMarkerad);
        const defaultPepSvar = pepPersoner.length > 0 ? 'Ja' : 'Nej';
        const savedPep = saved.pep || defaultPepSvar;
        const savedPepDetaljer = saved.pepDetaljer || pepPersoner.map(p => p.namn).join(', ');
        const savedPepFamilj = saved.pepFamilj || 'Nej';
        const savedPepFamiljDetaljer = saved.pepFamiljDetaljer || '';

        // 5. Affärsförbindelsens syfte - delvis hämtat
        const savedVerksamhet = saved.verksamhet || f['Verksamhetsbeskrivning'] || f['Beskrivning av kunden'] || '';
        // Tjänster - hämta aktiva tjänstnamn via cachade ID:n (laddas i loadKYCFormular)
        const aktivaIds = this._aktivaTjansterIds || new Set(f['Kundens utvalda tjänster'] || []);
        const aktivaTjanster = (this._byransTjanster || []).filter(t => this._tjanstIdMatchSet(t).some(id => aktivaIds.has(id))).map(t => t.namn);
        const savedTjanster = saved.tjanster || aktivaTjanster.join(', ');
        const savedKapitalUrsprung = saved.kapitalUrsprung || '';
        const savedAnstallda = saved.anstallda || '';
        const savedOmsattning = saved.omsattning || f['Omsättning'] || '';

        // 6. Internationell handel — hämta default från riskbedömningen
        const transaktionerAndraLander = f['Har företaget transaktioner med andra länder?'] || '';
        const defaultInternationell = transaktionerAndraLander === 'Ja' ? 'Ja' : (transaktionerAndraLander === 'Nej' ? 'Nej' : '');
        const savedInternationellHandel = saved.internationellHandel || defaultInternationell;
        const savedInternationellaLander = saved.internationellaLander || '';

        // 7. Kontanthantering — hämta default från riskhöjande faktorer
        const riskhojande = Array.isArray(f['Riskhöjande faktorer övrigt']) ? f['Riskhöjande faktorer övrigt'] : (f['Riskhöjande faktorer övrigt'] ? [f['Riskhöjande faktorer övrigt']] : []);
        const harKontanthantering = riskhojande.some(r => r.toLowerCase().includes('kontant'));
        const defaultKontanter = harKontanthantering ? 'Ja' : (riskhojande.length > 0 ? 'Nej' : '');
        const savedKontanter = saved.kontanter || defaultKontanter;
        const savedKontanterAndel = saved.kontanterAndel || '';

        // Nya fält — Sektion 1 (grunduppgifter)
        // Autohämta bolagsform från företagsinformationen (med normalisering av vanliga varianter)
        const bolagsformOptions = ['Aktiebolag', 'Enskild firma', 'Handelsbolag', 'Kommanditbolag', 'Ekonomisk förening', 'Annat'];
        const rawBolagsform = (f['Bolagsform'] || '').toString().trim();
        const bolagsformSynonymer = {
            'Enskild näringsidkare': 'Enskild firma',
            'Enskild näringsverksamhet': 'Enskild firma',
            'Enskild firma': 'Enskild firma',
            'Fysiska personer': 'Enskild firma'
        };
        const normBolagsform = bolagsformSynonymer[rawBolagsform] || rawBolagsform;
        const savedBolagsform = saved.bolagsform || (bolagsformOptions.includes(normBolagsform) ? normBolagsform : (rawBolagsform ? 'Annat' : ''));

        // Autohämta SNI-kod(er) och bransch från företagsinformationen
        const sniRaw = f['SNI kod'] || f['SNI-koder'] || f['SNI-kod'] || '';
        let autoSniKoder = '';
        let autoBransch = '';
        if (sniRaw) {
            const sniChunks = String(sniRaw).split('\n').flatMap(r => r.split(',')).map(r => r.trim()).filter(Boolean);
            const sniParsed = sniChunks.map(row => {
                const m = row.match(/^(\d{4,6})\s*(?:[-–]\s*|\s{1,})(.+)$/);
                if (m) return { kod: m[1], label: (m[2] || '').trim() };
                const m2 = row.match(/^(\d{4,6})$/);
                if (m2) return { kod: m2[1], label: '' };
                return { kod: null, label: row };
            });
            autoSniKoder = sniParsed.map(p => p.kod).filter(Boolean).join(', ');
            autoBransch = (sniParsed.find(p => p.label)?.label) || '';
        }
        const savedBransch = saved.bransch || autoBransch;
        const savedSniKod = saved.sni_kod || autoSniKoder;
        const savedHemvistForetag = saved.skatterattslig_hemvist_foretag || 'Sverige';
        const savedTinForetag = saved.tin_foretag || '';
        const visaTinForetag = savedHemvistForetag.trim().toLowerCase() !== 'sverige' && savedHemvistForetag.trim() !== '';

        // Nya fält — Sektion 3 (verklig huvudman)
        const savedVhAgarandel = (saved.vh_agarandel === null || saved.vh_agarandel === undefined) ? '' : saved.vh_agarandel;
        const savedVhNoteratBolag = saved.vh_noterat_bolag === true;
        const savedVhUtlandskaAgare = saved.vh_utlandska_agare === true;

        // Nya fält — Sektion 5 (syfte)
        const savedSyfteAffarsrelation = saved.syfte_affarsrelation || '';

        // Status
        const kycStatus = saved.status || '';
        const kycInleedId = saved.inleedDokumentId || '';
        const kycSigneringsdatum = saved.signeringsdatum || '';
        const kycUtanfor = this._fieldIsChecked(f, 'KYC-formulär utanför ClientFlow');

        const kycUtanforHtml = this._renderExternClientFlowOption({
            id: 'kund-kyc-utanfor-cf',
            checked: kycUtanfor,
            label: 'Finns utanför ClientFlow',
            hint: 'Fliken KYC-formulär markeras som klar när detta är valt.',
            onChangeHandler: 'setKycFormularUtanforClientFlow'
        });

        const statusBannerHtml = kycUtanfor ? `
            <div class="uppdrag-banner uppdrag-banner--ok">
                <i class="fas fa-check-circle"></i>
                KYC-formulär finns utanför ClientFlow.
            </div>` : kycStatus === 'Signerat' ? `
            <div class="uppdrag-banner uppdrag-banner--ok">
                <i class="fas fa-check-circle"></i>
                KYC-formuläret signerat${kycSigneringsdatum ? ' ' + kycSigneringsdatum : ''}.
            </div>` : kycStatus === 'Skickat till kund' ? `
            <div class="uppdrag-banner uppdrag-banner--vantar">
                <i class="fas fa-clock"></i>
                KYC-formuläret utskickat och väntar signering.
            </div>` : kycStatus === 'Sparat' ? `
            <div class="uppdrag-banner uppdrag-banner--utkast">
                <i class="fas fa-save"></i>
                Utkast sparat — ej utskickat för signering.
            </div>` : `
            <div class="uppdrag-banner uppdrag-banner--ny">
                <i class="fas fa-info-circle"></i>
                Fyll i KYC-formuläret. Data hämtas automatiskt från kundkortet men kan redigeras.
            </div>`;

        const idagStr = new Date().toLocaleDateString('sv-SE');
        const senastUppdaterad = saved.updatedAt ? new Date(saved.updatedAt).toLocaleDateString('sv-SE') : '';

        // Hjälpare: Ja/Nej-select i appens stil
        const janejSelect = (id, val, onchange = '') => `
            <select id="${id}" class="uppdrag-input" style="max-width:220px;" ${onchange ? `onchange="${onchange}"` : ''}>
                <option value="">Välj...</option>
                <option value="Ja" ${val === 'Ja' ? 'selected' : ''}>Ja</option>
                <option value="Nej" ${val === 'Nej' ? 'selected' : ''}>Nej</option>
            </select>`;

        container.innerHTML = `
            <div class="uppdrag-wrap">
                ${kycUtanforHtml}
                ${statusBannerHtml}

                <div class="uppdrag-doc-header">
                    <div class="uppdrag-doc-titel">KYC — KUNDKÄNNEDOMSFORMULÄR</div>
                    <div class="uppdrag-doc-välkommen">
                        Formuläret används för att uppfylla penningtvättslagen (2017:630) och dokumentera kundkännedom. Vissa uppgifter hämtas automatiskt från företagsinformationen men kan redigeras.
                    </div>
                </div>

                <form id="kyc-formular-form" onsubmit="return false;">

                    <!-- 1. GRUNDUPPGIFTER -->
                    <div class="uppdrag-section uppdrag-section--card">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-building"></i> 1. Grunduppgifter om företaget</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                            <div class="uppdrag-grid">
                                <div class="uppdrag-field">
                                    <label>Företagets namn</label>
                                    <input type="text" id="kyc-foretagsnamn" class="uppdrag-input" value="${esc(foretagsnamn)}">
                                </div>
                                <div class="uppdrag-field">
                                    <label>Organisationsnummer</label>
                                    <input type="text" id="kyc-orgnr" class="uppdrag-input" value="${esc(orgnr)}">
                                </div>
                                <div class="uppdrag-field">
                                    <label>Bolagsform *</label>
                                    <select id="kyc-bolagsform" class="uppdrag-input">
                                        <option value="">Välj...</option>
                                        ${bolagsformOptions.map(o => `<option value="${esc(o)}" ${savedBolagsform === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="uppdrag-field">
                                    <label>Bransch</label>
                                    <input type="text" id="kyc-bransch" class="uppdrag-input" value="${esc(savedBransch)}" placeholder="t.ex. Bygg, Restaurang, Konsult">
                                </div>
                                <div class="uppdrag-field">
                                    <label>SNI-kod <span class="uppdrag-hint" style="font-weight:400;text-transform:none;letter-spacing:0;">(hämtas automatiskt)</span></label>
                                    <input type="text" id="kyc-sni-kod" class="uppdrag-input" value="${esc(savedSniKod)}" placeholder="t.ex. 41200">
                                </div>
                                <div class="uppdrag-field">
                                    <label>Skatterättslig hemvist *</label>
                                    <input type="text" id="kyc-hemvist-foretag" class="uppdrag-input" value="${esc(savedHemvistForetag)}" placeholder="Sverige" oninput="customerCardManager._toggleKycTinByHemvist('kyc-hemvist-foretag','kyc-tin-foretag-wrap')">
                                </div>
                                <div class="uppdrag-field" id="kyc-tin-foretag-wrap" style="display:${visaTinForetag ? 'block' : 'none'};">
                                    <label>Utländskt skatteregistreringsnummer (TIN)</label>
                                    <input type="text" id="kyc-tin-foretag" class="uppdrag-input" value="${esc(savedTinForetag)}">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 2. FÖRETRÄDARE -->
                    <div class="uppdrag-section uppdrag-section--card">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-user-tie"></i> 2. Företrädare</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                            <p class="uppdrag-hint">Vem är företrädare för företaget i kontakten med byrån? Lägg till fler vid behov.</p>
                            <div id="kyc-foretradare-list">
                                ${foretradareList.map(p => this._kycForetradareRowHtml(p)).join('')}
                            </div>
                            <button type="button" class="btn btn-secondary btn-sm" style="margin-top:0.75rem;" onclick="customerCardManager.addKycForetradare()">
                                <i class="fas fa-plus"></i> Lägg till företrädare
                            </button>
                        </div>
                    </div>

                    <!-- 3. VERKLIG HUVUDMAN -->
                    <div class="uppdrag-section uppdrag-section--card">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-user-shield"></i> 3. Verklig huvudman</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                            <p class="uppdrag-hint">Finns det någon eller några fysiska personer som (direkt eller indirekt) äger eller kontrollerar mer än 25 % av företaget? I så fall, ange namn och personnummer.</p>
                            <div class="uppdrag-field uppdrag-field--full">
                                <label>Verklig(a) huvudman/-män (namn och personnummer)</label>
                                <textarea id="kyc-huvudman-info" class="uppdrag-input uppdrag-textarea" rows="3" placeholder="Namn (personnummer)&#10;Namn (personnummer)">${esc(savedHuvudmanInfo)}</textarea>
                            </div>
                            <div class="uppdrag-field uppdrag-field--full" style="margin-top:0.75rem;">
                                <label>Person som på annat sätt (t.ex. genom avtal) utövar yttersta kontroll</label>
                                <textarea id="kyc-huvudman-annat-satt" class="uppdrag-input uppdrag-textarea" rows="2" placeholder="Beskriv...">${esc(savedHuvudmanAnnatSatt)}</textarea>
                            </div>
                            <div class="uppdrag-grid" style="margin-top:0.75rem;">
                                <div class="uppdrag-field">
                                    <label>Ägarandel (%)</label>
                                    <input type="number" id="kyc-vh-agarandel" class="uppdrag-input" value="${esc(savedVhAgarandel)}" min="0" max="100" step="0.1" placeholder="t.ex. 100">
                                </div>
                                <div class="uppdrag-field">
                                    <label>Noterat bolag eller ägt av noterat bolag</label>
                                    ${janejSelect('kyc-vh-noterat-bolag', savedVhNoteratBolag ? 'Ja' : (saved.vh_noterat_bolag === false ? 'Nej' : ''))}
                                </div>
                                <div class="uppdrag-field">
                                    <label>Utländska ägare eller styrelseledamöter</label>
                                    ${janejSelect('kyc-vh-utlandska-agare', savedVhUtlandskaAgare ? 'Ja' : (saved.vh_utlandska_agare === false ? 'Nej' : ''))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 4. PEP -->
                    <div class="uppdrag-section uppdrag-section--card">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-flag"></i> 4. Politiskt exponerad person (PEP)</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                            <p class="uppdrag-hint">Är någon av företrädarna eller de verkliga huvudmännen en "PEP" (dvs. har, eller har det senaste året haft, en viktig offentlig funktion i en stat eller internationell organisation, t.ex. riksdagsledamot, ambassadör eller domare i högsta instans)?</p>
                            <div class="uppdrag-grid">
                                <div class="uppdrag-field">
                                    <label>PEP-status</label>
                                    ${janejSelect('kyc-pep', savedPep, "customerCardManager._toggleKycConditional('kyc-pep','Ja','kyc-pep-detaljer-wrap')")}
                                </div>
                                <div class="uppdrag-field" id="kyc-pep-detaljer-wrap" style="display:${savedPep === 'Ja' ? 'block' : 'none'}">
                                    <label>Vem? Beskriv vilken funktion.</label>
                                    <input type="text" id="kyc-pep-detaljer" class="uppdrag-input" value="${esc(savedPepDetaljer)}">
                                </div>
                                <div class="uppdrag-field">
                                    <label>Familjemedlem/medarbetare till PEP</label>
                                    ${janejSelect('kyc-pep-familj', savedPepFamilj, "customerCardManager._toggleKycConditional('kyc-pep-familj','Ja','kyc-pep-familj-detaljer-wrap')")}
                                </div>
                                <div class="uppdrag-field" id="kyc-pep-familj-detaljer-wrap" style="display:${savedPepFamilj === 'Ja' ? 'block' : 'none'}">
                                    <label>Vem? Beskriv relation.</label>
                                    <input type="text" id="kyc-pep-familj-detaljer" class="uppdrag-input" value="${esc(savedPepFamiljDetaljer)}">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 5. AFFÄRSFÖRBINDELSENS SYFTE OCH ART -->
                    <div class="uppdrag-section uppdrag-section--card">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-briefcase"></i> 5. Affärsförbindelsens syfte och art</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                            <p class="uppdrag-hint">Länsstyrelsen kräver att du vet hur kunden kommer använda dina tjänster och hur deras normala verksamhet ser ut, så att du senare kan upptäcka om något verkar avvikande.</p>
                            <div class="uppdrag-field uppdrag-field--full">
                                <label>Syfte med affärsrelationen</label>
                                <textarea id="kyc-syfte-affarsrelation" class="uppdrag-input uppdrag-textarea" rows="2" placeholder="Varför ingås affärsrelationen och hur ska byråns tjänster användas?">${esc(savedSyfteAffarsrelation)}</textarea>
                            </div>
                            <div class="uppdrag-field uppdrag-field--full" style="margin-top:0.75rem;">
                                <label>Huvudsaklig verksamhet (vad säljer/gör ni)</label>
                                <textarea id="kyc-verksamhet" class="uppdrag-input uppdrag-textarea" rows="3" placeholder="Beskriv verksamheten...">${esc(savedVerksamhet)}</textarea>
                            </div>
                            <div class="uppdrag-grid" style="margin-top:0.75rem;">
                                <div class="uppdrag-field">
                                    <label>Byråns tjänster</label>
                                    <textarea id="kyc-tjanster" class="uppdrag-input uppdrag-textarea" rows="2" placeholder="Vilka av byråns tjänster avses användas?">${esc(savedTjanster)}</textarea>
                                </div>
                                <div class="uppdrag-field">
                                    <label>Pengarnas ursprung</label>
                                    <textarea id="kyc-kapital-ursprung" class="uppdrag-input uppdrag-textarea" rows="2" placeholder="t.ex. svensk försäljning, lån, investeringar">${esc(savedKapitalUrsprung)}</textarea>
                                </div>
                                <div class="uppdrag-field">
                                    <label>Antal anställda</label>
                                    <input type="text" id="kyc-anstallda" class="uppdrag-input" value="${esc(savedAnstallda)}" placeholder="t.ex. 5">
                                </div>
                                <div class="uppdrag-field">
                                    <label>Uppskattad årsomsättning</label>
                                    <input type="text" id="kyc-omsattning" class="uppdrag-input" value="${esc(savedOmsattning)}" placeholder="t.ex. 2 000 000 kr">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 6. INTERNATIONELL HANDEL -->
                    <div class="uppdrag-section uppdrag-section--card">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-globe"></i> 6. Internationell handel</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                            <div class="uppdrag-field uppdrag-field--full">
                                <label>Bedriver företaget handel med kunder eller leverantörer utanför Sverige?</label>
                                ${janejSelect('kyc-internationell', savedInternationellHandel, "customerCardManager._toggleKycConditional('kyc-internationell','Ja','kyc-internationella-lander-wrap')")}
                            </div>
                            <div class="uppdrag-field uppdrag-field--full" id="kyc-internationella-lander-wrap" style="display:${savedInternationellHandel === 'Ja' ? 'block' : 'none'};margin-top:0.75rem;">
                                <label>Vilka länder handlar ni med?</label>
                                <input type="text" id="kyc-internationella-lander" class="uppdrag-input" value="${esc(savedInternationellaLander)}" placeholder="t.ex. Norge, Tyskland">
                            </div>
                        </div>
                    </div>

                    <!-- 7. KONTANTHANTERING -->
                    <div class="uppdrag-section uppdrag-section--card">
                        <div class="uppdrag-section-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                            <div class="uppdrag-section-title"><i class="fas fa-money-bill-wave"></i> 7. Kontanthantering</div>
                            <i class="fas fa-chevron-down uppdrag-section-chevron"></i>
                        </div>
                        <div class="uppdrag-section-body">
                            <div class="uppdrag-field uppdrag-field--full">
                                <label>Hanterar företaget kontanter i sin verksamhet?</label>
                                ${janejSelect('kyc-kontanter', savedKontanter, "customerCardManager._toggleKycConditional('kyc-kontanter','Ja','kyc-kontanter-andel-wrap')")}
                            </div>
                            <div class="uppdrag-field uppdrag-field--full" id="kyc-kontanter-andel-wrap" style="display:${savedKontanter === 'Ja' ? 'block' : 'none'};margin-top:0.75rem;">
                                <label>Ungefär hur stor del av försäljningen utgörs av kontanter?</label>
                                <input type="text" id="kyc-kontanter-andel" class="uppdrag-input" value="${esc(savedKontanterAndel)}" placeholder="t.ex. ca 30%">
                            </div>
                        </div>
                    </div>

                    <!-- KUNDENS INTYGANDE -->
                    <div class="uppdrag-section uppdrag-section--card" style="border-left:3px solid #4f6ef7;">
                        <div class="uppdrag-section-body" style="padding-top:0;">
                            <div class="uppdrag-section-title" style="margin-bottom:0.5rem;"><i class="fas fa-file-signature"></i> Kundens intygande</div>
                            <p class="uppdrag-hint" style="margin:0;">Jag intygar att lämnade uppgifter är korrekta och fullständiga. Jag förbinder mig att meddela redovisningsbyrån vid väsentliga förändringar i verksamheten, ägarstrukturen eller gällande vem som är verklig huvudman.</p>
                        </div>
                    </div>

                    <!-- KNAPPAR -->
                    <div class="uppdrag-actions" style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;">
                        <button type="button" class="btn btn-primary" onclick="customerCardManager.saveKYCFormular()">
                            <i class="fas fa-save"></i> Spara KYC-formulär
                        </button>
                        ${saved.status ? `
                        <button type="button" class="btn btn-secondary" onclick="customerCardManager.downloadKYCFormularPdf()">
                            <i class="fas fa-file-pdf"></i> Ladda ner PDF
                        </button>
                        <button type="button" class="btn btn-inleed" onclick="customerCardManager.skickaKYCFormularInleed()">
                            <i class="fas fa-pen-nib"></i> Skicka för signering (InLeed)
                        </button>
                        ${(kycInleedId && kycStatus === 'Skickat till kund') ? `
                        <button type="button" class="btn btn-secondary" onclick="customerCardManager.hamtaSigneratKYCFormular()" title="Hämta färdigsignerat KYC-dokument från Inleed">
                            <i class="fas fa-download"></i> Hämta signerat dokument
                        </button>` : ''}
                        ` : '<span class="uppdrag-hint" style="margin:0;">Spara formuläret först för att kunna generera PDF.</span>'}
                        ${senastUppdaterad ? `<span class="uppdrag-hint" style="margin:0 0 0 auto;">Senast uppdaterad: <strong>${esc(senastUppdaterad)}</strong></span>` : ''}
                    </div>

                </form>
            </div>
        `;

        this._updateKycForetradareRemoveButtons();
    }

    // HTML för en företrädar-rad (används vid render och när man lägger till fler)
    _kycForetradareRowHtml(p = {}) {
        const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const namn = p.namn || '';
        const pnr = p.personnr || '';
        const hemvist = (p.hemvist || p.skatterattslig_hemvist || 'Sverige');
        const tin = p.tin || '';
        const visaTin = hemvist.trim() !== '' && hemvist.trim().toLowerCase() !== 'sverige';
        return `
            <div class="kyc-foretradare-row" style="border-top:1px dashed #e2e8f0;padding-top:0.85rem;margin-top:0.85rem;">
                <div class="uppdrag-grid">
                    <div class="uppdrag-field">
                        <label>Namn</label>
                        <input type="text" class="uppdrag-input kyc-ftr-namn" value="${esc(namn)}">
                    </div>
                    <div class="uppdrag-field">
                        <label>Personnummer</label>
                        <input type="text" class="uppdrag-input kyc-ftr-pnr" value="${esc(pnr)}" placeholder="ÅÅÅÅMMDD-XXXX">
                    </div>
                    <div class="uppdrag-field">
                        <label>Skatterättslig hemvist</label>
                        <input type="text" class="uppdrag-input kyc-ftr-hemvist" value="${esc(hemvist)}" placeholder="Sverige" oninput="customerCardManager._toggleKycForetradareTin(this)">
                    </div>
                    <div class="uppdrag-field kyc-ftr-tin-wrap" style="display:${visaTin ? 'block' : 'none'};">
                        <label>Utländskt skatteregistreringsnummer (TIN)</label>
                        <input type="text" class="uppdrag-input kyc-ftr-tin" value="${esc(tin)}">
                    </div>
                </div>
                <button type="button" class="kyc-ftr-remove" onclick="customerCardManager.removeKycForetradare(this)" title="Ta bort företrädare" style="margin-top:0.5rem;background:none;border:none;color:#dc2626;font-size:0.82rem;cursor:pointer;padding:0;">
                    <i class="fas fa-times"></i> Ta bort
                </button>
            </div>`;
    }

    // Lägg till en ny tom företrädar-rad
    addKycForetradare() {
        const list = document.getElementById('kyc-foretradare-list');
        if (!list) return;
        list.insertAdjacentHTML('beforeend', this._kycForetradareRowHtml({}));
        this._updateKycForetradareRemoveButtons();
        const rows = list.querySelectorAll('.kyc-foretradare-row');
        rows[rows.length - 1]?.querySelector('.kyc-ftr-namn')?.focus();
    }

    // Ta bort en företrädar-rad (töm sista raden i stället för att ta bort den)
    removeKycForetradare(btn) {
        const list = document.getElementById('kyc-foretradare-list');
        const row = btn?.closest('.kyc-foretradare-row');
        if (!list || !row) return;
        const rows = list.querySelectorAll('.kyc-foretradare-row');
        if (rows.length <= 1) {
            row.querySelectorAll('input').forEach(i => {
                i.value = i.classList.contains('kyc-ftr-hemvist') ? 'Sverige' : '';
            });
            this._toggleKycForetradareTin(row.querySelector('.kyc-ftr-hemvist'));
        } else {
            row.remove();
        }
        this._updateKycForetradareRemoveButtons();
    }

    // Dölj "Ta bort" när det bara finns en rad
    _updateKycForetradareRemoveButtons() {
        const rows = document.querySelectorAll('#kyc-foretradare-list .kyc-foretradare-row');
        rows.forEach(r => {
            const b = r.querySelector('.kyc-ftr-remove');
            if (b) b.style.display = rows.length > 1 ? '' : 'none';
        });
    }

    // Visa/dölj TIN-fältet i en företrädar-rad utifrån skatterättslig hemvist
    _toggleKycForetradareTin(inputEl) {
        const row = inputEl?.closest('.kyc-foretradare-row');
        if (!row) return;
        const wrap = row.querySelector('.kyc-ftr-tin-wrap');
        if (!wrap) return;
        const v = (inputEl.value || '').trim().toLowerCase();
        wrap.style.display = (v !== '' && v !== 'sverige') ? 'block' : 'none';
    }

    _toggleKycConditional(selectId, showValue, wrapId) {
        const sel = document.getElementById(selectId);
        const wrap = document.getElementById(wrapId);
        if (sel && wrap) {
            wrap.style.display = sel.value === showValue ? 'block' : 'none';
        }
    }

    // Visa TIN-fältet endast om angiven skatterättslig hemvist inte är Sverige
    _toggleKycTinByHemvist(hemvistId, wrapId) {
        const input = document.getElementById(hemvistId);
        const wrap = document.getElementById(wrapId);
        if (!input || !wrap) return;
        const v = (input.value || '').trim().toLowerCase();
        const visa = v !== '' && v !== 'sverige';
        wrap.style.display = visa ? 'block' : 'none';
    }

    _collectKYCFormularData() {
        const g = (id) => (document.getElementById(id)?.value || '').trim();
        // Sektion 2 — samla in alla företrädar-rader
        const foretradare = Array.from(document.querySelectorAll('#kyc-foretradare-list .kyc-foretradare-row')).map(row => ({
            namn: (row.querySelector('.kyc-ftr-namn')?.value || '').trim(),
            personnr: (row.querySelector('.kyc-ftr-pnr')?.value || '').trim(),
            skatterattslig_hemvist: (row.querySelector('.kyc-ftr-hemvist')?.value || '').trim(),
            tin: (row.querySelector('.kyc-ftr-tin')?.value || '').trim()
        })).filter(p => p.namn || p.personnr || p.tin || (p.skatterattslig_hemvist && p.skatterattslig_hemvist.toLowerCase() !== 'sverige'));
        return {
            foretagsnamn: g('kyc-foretagsnamn'),
            orgnr: g('kyc-orgnr'),
            // Företrädare som lista + bakåtkompatibla enskilda fält (för PDF/äldre läsare)
            foretradare,
            foretradareNamn: foretradare[0]?.namn || '',
            foretradarePnr: foretradare[0]?.personnr || '',
            huvudmanInfo: g('kyc-huvudman-info'),
            huvudmanAnnatSatt: g('kyc-huvudman-annat-satt'),
            pep: g('kyc-pep'),
            pepDetaljer: g('kyc-pep-detaljer'),
            pepFamilj: g('kyc-pep-familj'),
            pepFamiljDetaljer: g('kyc-pep-familj-detaljer'),
            verksamhet: g('kyc-verksamhet'),
            tjanster: g('kyc-tjanster'),
            kapitalUrsprung: g('kyc-kapital-ursprung'),
            anstallda: g('kyc-anstallda'),
            omsattning: g('kyc-omsattning'),
            internationellHandel: g('kyc-internationell'),
            internationellaLander: g('kyc-internationella-lander'),
            kontanter: g('kyc-kontanter'),
            kontanterAndel: g('kyc-kontanter-andel'),
            // Sektion 1 — nya fält
            bolagsform: g('kyc-bolagsform'),
            bransch: g('kyc-bransch'),
            sni_kod: g('kyc-sni-kod'),
            skatterattslig_hemvist_foretag: g('kyc-hemvist-foretag'),
            tin_foretag: g('kyc-tin-foretag'),
            // Sektion 2 — bakåtkompatibla enskilda fält (första företrädaren)
            skatterattslig_hemvist_foretradare: foretradare[0]?.skatterattslig_hemvist || 'Sverige',
            tin_foretradare: foretradare[0]?.tin || '',
            // Sektion 3 — nya fält
            vh_agarandel: (() => { const v = g('kyc-vh-agarandel'); return v === '' ? null : Number(v); })(),
            vh_noterat_bolag: document.getElementById('kyc-vh-noterat-bolag')?.value === 'Ja',
            vh_utlandska_agare: document.getElementById('kyc-vh-utlandska-agare')?.value === 'Ja',
            // Sektion 5 — nytt fält
            syfte_affarsrelation: g('kyc-syfte-affarsrelation')
        };
    }

    async saveKYCFormular() {
        const data = this._collectKYCFormularData();

        // Validering: bolagsform och skatterättslig hemvist (företag) är obligatoriska
        const saknas = [];
        if (!data.bolagsform) saknas.push('Bolagsform');
        if (!data.skatterattslig_hemvist_foretag) saknas.push('Skatterättslig hemvist (företag)');
        if (saknas.length > 0) {
            this.showNotification(`Fyll i obligatoriska fält: ${saknas.join(', ')}.`, 'error');
            const firstId = !data.bolagsform ? 'kyc-bolagsform' : 'kyc-hemvist-foretag';
            const el = document.getElementById(firstId);
            if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            return;
        }

        const btn = document.querySelector('#kyc-formular-form .btn-primary');
        const origText = btn?.innerHTML;
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; btn.disabled = true; }

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const resp = await fetch(`${baseUrl}/api/kyc-formular/${this.customerId}`, {
                method: 'POST',
                ...getAuthOptsKundkort(),
                body: JSON.stringify(data)
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${resp.status}`);
            }
            this.showNotification('KYC-formuläret sparat!', 'success');
            this.loadKYCFormular();
        } catch (e) {
            this.showNotification(`Kunde inte spara KYC-formulär: ${e.message}`, 'error');
        } finally {
            if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        }
    }

    async downloadKYCFormularPdf() {
        const btn = document.querySelector('#kyc-formular-form .btn-secondary');
        const origText = btn?.innerHTML;
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Genererar...'; btn.disabled = true; }

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const resp = await fetch(`${baseUrl}/api/kyc-formular/${this.customerId}/pdf`, {
                method: 'POST',
                ...getAuthOptsKundkort()
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${resp.status}`);
            }
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const disposition = resp.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
            a.download = match ? decodeURIComponent(match[1].replace(/"/g, '')) : 'KYC-formular.pdf';
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showNotification('KYC PDF nedladdad!', 'success');
        } catch (e) {
            this.showNotification(`Kunde inte generera KYC PDF: ${e.message}`, 'error');
        } finally {
            if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        }
    }

    async skickaKYCFormularInleed() {
        const kontaktPersoner = this._kontaktPersoner || [];
        const valjbara = kontaktPersoner.filter(p => p.epost);
        const existing = document.getElementById('kyc-inleed-modal');
        if (existing) existing.remove();

        const personOptions = valjbara.length > 0
            ? valjbara.map((p, idx) => `
                <label class="inleed-person-option">
                    <input type="checkbox" name="kyc-signerare-choice" value="${idx}">
                    <div class="inleed-person-info">
                        <span class="inleed-person-name">${this._esc(p.namn)}</span>
                        ${(p.roller?.length || p.roll) ? `<span class="inleed-person-roll">${this._esc((p.roller || (p.roll ? [p.roll] : [])).join(', '))}</span>` : ''}
                        <span class="inleed-person-contact"><i class="fas fa-envelope"></i> ${this._esc(p.epost)}</span>
                        ${p.personnr ? `<span class="inleed-person-contact"><i class="fas fa-id-card"></i> ${this._esc(p.personnr)}</span>` : ''}
                    </div>
                </label>`).join('')
            : '';

        const modal = document.createElement('div');
        modal.id = 'kyc-inleed-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="max-width:520px;">
                <div class="modal-header">
                    <h3><i class="fas fa-pen-nib" style="color:var(--accent)"></i> Skicka KYC-formulär för BankID-signering</h3>
                    <button class="modal-close" onclick="document.getElementById('kyc-inleed-modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    ${valjbara.length > 0 ? `
                        <p style="color:#475569;margin-bottom:1rem;font-size:0.9rem;">
                            Välj vilka kontaktpersoner som ska signera KYC-formuläret via BankID.
                        </p>
                        <div class="inleed-person-list">${personOptions}</div>
                    ` : `
                        <p style="color:#475569;margin-bottom:1rem;font-size:0.9rem;">
                            Inga kontaktpersoner med e-post. Lägg till kontaktpersoner med e-postadress på fliken Företagsinformation.
                        </p>
                    `}
                    <div id="kyc-inleed-status-msg" style="display:none;margin-top:1rem;padding:0.75rem;border-radius:8px;font-size:0.9rem;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('kyc-inleed-modal').remove()">Avbryt</button>
                    <button id="kyc-inleed-send-btn" class="btn btn-primary btn-sm" onclick="customerCardManager._genomforKYCSignering()" ${valjbara.length === 0 ? 'disabled' : ''}>
                        <i class="fas fa-paper-plane"></i> Skicka för signering
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        this._kycValjbaraSignerare = valjbara;
        if (valjbara.length > 0) {
            const checkboxes = modal.querySelectorAll('input[name="kyc-signerare-choice"]');
            if (checkboxes[0]) checkboxes[0].checked = true;
        }
    }

    async _genomforKYCSignering() {
        const valjbara = this._kycValjbaraSignerare || [];
        const checked = Array.from(document.querySelectorAll('input[name="kyc-signerare-choice"]:checked')) || [];
        const signerare = checked
            .map(cb => valjbara[parseInt(cb.value, 10)])
            .filter(p => p && p.epost)
            .map(p => ({ namn: p.namn || '', epost: p.epost || '', personnr: p.personnr || '', telefon: p.telefon || '' }));

        if (signerare.length === 0) {
            this._showKycInleedStatus('Välj minst en kontaktperson att skicka till.', 'error');
            return;
        }

        const btn = document.getElementById('kyc-inleed-send-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Skickar...'; }

        this._showKycInleedStatus('Genererar KYC PDF och skickar till Inleed...', 'info');

        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const resp = await fetch(`${baseUrl}/api/kyc-formular/${this.customerId}/skicka-for-signering`, {
                method: 'POST',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ signerare })
            });
            const data = await resp.json();
            if (!resp.ok) {
                this._showKycInleedStatus(`Fel: ${data.error || 'Okänt fel'}`, 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Försök igen'; }
                return;
            }
            this._showKycInleedStatus(`✅ ${data.message}`, 'success');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-check"></i> Skickat!'; }
            setTimeout(() => document.getElementById('kyc-inleed-modal')?.remove(), 2500);
            const epostLista = signerare.map(s => s.epost).join(', ');
            this.showNotification(`KYC-formuläret skickat till ${epostLista} för BankID-signering`, 'success');
            this.loadKYCFormular();
        } catch (e) {
            this._showKycInleedStatus(`Fel: ${e.message}`, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Försök igen'; }
        }
    }

    _showKycInleedStatus(msg, type) {
        const el = document.getElementById('kyc-inleed-status-msg');
        if (!el) return;
        const colors = { success: '#dcfce7', error: '#fee2e2', info: '#eff6ff' };
        const textColors = { success: '#166534', error: '#991b1b', info: '#1e40af' };
        el.style.display = 'block';
        el.style.background = colors[type] || colors.info;
        el.style.color = textColors[type] || textColors.info;
        el.textContent = msg;
    }

    async hamtaSigneratKYCFormular() {
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const resp = await fetch(`${baseUrl}/api/kyc-formular/${this.customerId}/hamta-signerat`, {
                method: 'POST',
                ...getAuthOptsKundkort()
            });
            const data = await resp.json();
            if (resp.ok && data.savedToDocs) {
                this.showNotification(data.message || 'Signerat KYC-dokument sparat på Dokumentation.', 'success');
                this.loadKYCFormular();
                this.loadDocuments();
            } else {
                this.showNotification(data.error || 'Kunde inte hämta signerat dokument.', 'error');
            }
        } catch (e) {
            this.showNotification(`Fel: ${e.message}`, 'error');
        }
    }

    // ─── END KYC-FORMULÄR ───────────────────────────────────────────────────────

    async loadUppdragsavtal() {
        const container = document.getElementById('uppdragsavtal-content');
        if (!container) return;

        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const customerByraId =
            this.customerData?.fields?.['Byrå ID'] ??
            this.customerData?.fields?.['Byra ID'] ??
            this.customerData?.fields?.['Byra_ID'] ??
            this.customerData?.fields?.['ByraID'] ??
            '';
        const byraInfoUrl = customerByraId
            ? `${baseUrl}/api/byra-info?byraId=${encodeURIComponent(String(customerByraId))}`
            : `${baseUrl}/api/byra-info`;

        try {
            // Hämta avtal och byråinfo parallellt
            const [avtalRes, byraRes] = await Promise.all([
                fetch(`${baseUrl}/api/uppdragsavtal?customerId=${this.customerId}`, {
                    ...getAuthOptsKundkort()
                }),
                fetch(byraInfoUrl, {
                    ...getAuthOptsKundkort()
                })
            ]);

            const avtalData = avtalRes.ok ? await avtalRes.json() : { avtal: null };
            const byraData  = byraRes.ok  ? await byraRes.json()  : {};

            this._uppdragsavtalFields = avtalData.avtal?.fields || null;
            this._updateKlarTabIndicators(this.customerData?.fields || {});
            this.renderUppdragsavtal(avtalData.avtal, byraData);
        } catch (e) {
            console.error('❌ loadUppdragsavtal:', e);
            this._uppdragsavtalFields = null;
            this._updateKlarTabIndicators(this.customerData?.fields || {});
            this.renderUppdragsavtal(null, {});
        }
    }

    renderUppdragsavtal(avtal, byraData = {}) {
        const container = document.getElementById('uppdragsavtal-content');
        if (!container) return;

        const rawF = avtal?.fields || {};
        const hasField = (k) => Object.prototype.hasOwnProperty.call(rawF || {}, k);
        const esc = (s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
            // Legacy (bilagor 1/2 tas bort från UI men fälten kan finnas kvar i äldre avtal)
            'Kunden godkänner allmänna villkor':            rawF['Kunden godkanner allm villkor'] || rawF['Kunden godkänner allmänna villkor'] || false,
            'Kunden godkänner personuppgiftsbiträdesavtal': rawF['Kunden godkanner puba'] || rawF['Kunden godkänner personuppgiftsbiträdesavtal'] || false,
            'Status':              rawF['Avtalsstatus'] || rawF['Status'] || '',
            'Signeringsdatum':     rawF['Signeringsdatum'] || '',
            'Utskickningsdatum':   rawF['Utskickningsdatum'] || rawF['fldCfjnBetFm03KES'] || '',
            'Signerat av kund':    rawF['Signerat av kund'] || rawF['Signerat av byra'] || '',
            'Signerat av byrå':    rawF['Signerat av byra'] || rawF['Signerat av byrå'] || '',
            // Om fältet inte finns på avtalet än: default = true (ikryssad)
            'Bifoga prislista':    hasField('Bifoga prislista') ? !!rawF['Bifoga prislista'] : true,
            'Valda byråbilagor (JSON)': rawF['Valda byråbilagor (JSON)'] || ''
        };
        const isNew = !avtal;
        const kundFields = this.customerData?.fields || {};
        const uaUtanfor = this._fieldIsChecked(kundFields, 'Uppdragsavtal utanför ClientFlow');
        const uaUtanforHtml = this._renderExternClientFlowOption({
            id: 'kund-ua-utanfor-avtal-cf',
            checked: uaUtanfor,
            label: 'Uppdragsavtal utanför ClientFlow',
            hint: 'Fliken Uppdragsavtal markeras som klar när detta är valt.',
            onChangeHandler: 'setUppdragsavtalUtanforClientFlow'
        });

        const today = new Date().toISOString().split('T')[0];
        const fmtDate = (d) => d ? d.split('T')[0] : '';
        const chk = (val) => val ? 'checked' : '';
        const sel = (opts, cur) => opts.map(v => `<option value="${v}" ${cur === v ? 'selected' : ''}>${v}</option>`).join('');

        // Byrådata — allt hämtat från Airtable via /api/byra-info
        const byraNamn     = byraData.byraNamn     || '';
        const byraOrgnr    = byraData.byraOrgnr    || this.userData?.orgnr || '';
        const konsulter    = byraData.konsulter     || [];
        const inloggadNamn = byraData.inloggadNamn  || this.userData?.name || '';
        const avtalDefaults = byraData.avtalDefaults || {};
        const byraBilagor = Array.isArray(byraData.uppdragsbrevBilagor) ? byraData.uppdragsbrevBilagor : [];
        let selectedByraBilagaIds = [];
        try {
            const raw = (f['Valda byråbilagor (JSON)'] || '').toString().trim();
            const arr = raw ? JSON.parse(raw) : [];
            selectedByraBilagaIds = Array.isArray(arr) ? arr : [];
        } catch (_) { selectedByraBilagaIds = []; }
        // Default: om inget sparat val finns -> alla bilagor ikryssade
        if ((!selectedByraBilagaIds || selectedByraBilagaIds.length === 0) && byraBilagor.length) {
            selectedByraBilagaIds = byraBilagor.map(b => (b?.id || '').toString()).filter(Boolean);
        }
        const isSelected = (id) => selectedByraBilagaIds.includes(id);
        const bilageChecklistHtml = `
            <div style="display:grid;gap:0.45rem;margin-top:0.25rem;">
                <label style="display:flex;align-items:center;gap:0.6rem;margin:0;">
                    <input type="checkbox" id="ua-bifoga-prislista" ${f['Bifoga prislista'] ? 'checked' : ''}>
                    <span style="font-weight:650;">Prislista</span>
                </label>

                ${byraBilagor.length ? byraBilagor.map((b) => {
                    const id = (b.id || '').toString();
                    const label = (b.label || b.filename || 'Bilaga').toString();
                    return `
                        <label style="display:flex;align-items:center;gap:0.6rem;margin:0;">
                            <input type="checkbox" class="ua-byra-bilaga-cb" value="${esc(id)}" ${isSelected(id) ? 'checked' : ''}>
                            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(label)}</span>
                        </label>
                    `;
                }).join('') : `<div class="uppdrag-muted">Inga byråbilagor upplagda.</div>`}
            </div>
        `;

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

        const uppsagningstidVal = (f['Uppsägningstid'] !== '' && f['Uppsägningstid'] !== null && f['Uppsägningstid'] !== undefined)
            ? f['Uppsägningstid']
            : (avtalDefaults.defaultUppsagningstid ?? 3);
        const fakturaperiodVal = (f['Fakturaperiod'] || avtalDefaults.defaultFakturaperiod || '');
        const betalningsvillkorVal = (() => {
            const hasAvtalValue = (f['Betalningsvillkor'] !== '' && f['Betalningsvillkor'] !== null && f['Betalningsvillkor'] !== undefined);
            if (hasAvtalValue) return f['Betalningsvillkor'];
            const d = avtalDefaults.defaultBetalningsvillkor;
            // hantera att default kan komma som '' eller sträng
            if (d === '' || d === null || d === undefined) return 10;
            const n = Number(String(d).trim().replace(',', '.'));
            return Number.isFinite(n) ? n : 10;
        })();

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
                ${uaUtanforHtml}

                <!-- STATUS-BANNER -->
                ${uaUtanfor ? `
                <div class="uppdrag-banner uppdrag-banner--ok">
                    <i class="fas fa-check-circle"></i>
                    Uppdragsavtalet finns utanför ClientFlow.
                </div>` : isNew ? `
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
                                <input type="number" id="ua-uppsagningstid" class="uppdrag-input" value="${uppsagningstidVal}" min="0" placeholder="3">
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
                                    ${sel(['Månadsvis','Kvartalsvis','Halvårsvis','Årsvis','Löpande'], fakturaperiodVal)}
                                </select>
                            </div>
                            <div class="uppdrag-field">
                                <label>Betalningsvillkor (dagar)</label>
                                <input type="number" id="ua-betvillkor" class="uppdrag-input" value="${betalningsvillkorVal}" placeholder="10">
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- BILAGOR (valbara) -->
                    <div class="uppdrag-section">
                        <div class="uppdrag-section-title"><i class="fas fa-paperclip"></i> Bilagor till uppdragsavtal</div>
                        <div class="uppdrag-bilaga-toggle" onclick="this.classList.toggle('is-open'); this.nextElementSibling.classList.toggle('open')">
                            <i class="fas fa-chevron-right uppdrag-bilaga-chevron"></i>
                            Välj bilagor
                        </div>
                        <div class="uppdrag-bilaga-text">
                            ${bilageChecklistHtml}
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
            'Uppsagningstid':                       (() => { const n = parseInt(val('ua-uppsagningstid'), 10); return isNaN(n) ? null : n; })(),
            'Valda tjanster':                       valdaTjanster.join(', '),
            'Ovrigt uppdrag':                       val('ua-tjanster-ovrigt'),
            'Ersattningsmodell':                    ersattningsmodell,
            'Arvode':                               (() => { const n = parseFloat(val('ua-arvode')); return isNaN(n) ? null : n; })(),
            'Arvodesperiod':                        val('ua-arvode-period') || 'manad',
            'Arvodekommentar':                      val('ua-arvode-kommentar'),
            'Fakturaperiod':                        val('ua-fakturaperiod'),
            'Betalningsvillkor':                    (() => { const n = parseInt(val('ua-betvillkor'), 10); return isNaN(n) ? null : n; })(),
            // Bilaga 1/2 (legacy) är borttaget från UI, men fälten kan finnas kvar i gamla avtal.
            'Avtalsstatus':                          val('ua-status'),
            'Signeringsdatum':                      val('ua-signdatum') || null,
            'Signerat av kund':                     val('ua-sign-kund'),
            'Signerat av byra':                     val('ua-sign-byra'),
        };

        // Valbara bilagor: prislista + byråbilagor (per kund)
        fields['Bifoga prislista'] = chk('ua-bifoga-prislista');
        const selectedBilagor = Array.from(document.querySelectorAll('.ua-byra-bilaga-cb:checked'))
            .map(cb => (cb?.value || '').toString().trim())
            .filter(Boolean);
        fields['Valda byråbilagor (JSON)'] = JSON.stringify(selectedBilagor);

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
        // Person/skapad av visas inte i UI (för att undvika "// Namn" längst ner)
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
                const list = data.avvikelser || [];
                if (this._hasOpenAvvikelser(list)) {
                    this._setTabStatus('avvikelser',
                        '<i class="fas fa-exclamation-triangle tab-status--warn" aria-hidden="true"></i>',
                        'Öppna avvikelser finns');
                } else {
                    this._setTabStatus('avvikelser', '');
                }
                this.displayAvvikelser(list);
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
        this._setTabStatus('avvikelser', '');
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

            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const response = await fetch(`${baseUrl}/api/documents?customerId=${this.customerId}`, {
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
        if (!content) return;
        const categoryOrder = ['riskbedomning', 'arsredovisning', 'uppdragsavtal', 'bolagsverket_skatteverket', 'ovrigt'];
        const categoryIcons = {
            riskbedomning: 'fa-clipboard-check',
            arsredovisning: 'fa-file-invoice',
            uppdragsavtal: 'fa-file-signature',
            bolagsverket_skatteverket: 'fa-landmark',
            ovrigt: 'fa-folder-open'
        };

        let bodyHTML;
        if (documents.length === 0) {
            bodyHTML = `<div class="empty-state"><i class="fas fa-file-alt"></i><p>Inga dokument uppladdade ännu.</p></div>`;
        } else {
            const byCategory = {};
            documents.forEach(doc => {
                const label = doc.categoryLabel || doc.category || 'Övrigt';
                if (!byCategory[label]) byCategory[label] = [];
                byCategory[label].push(doc);
            });
            const orderedLabels = [];
            categoryOrder.forEach(cat => {
                const label = this.getCategoryLabel(cat);
                if (byCategory[label] && byCategory[label].length) orderedLabels.push(label);
            });
            Object.keys(byCategory).forEach(label => {
                if (!orderedLabels.includes(label)) orderedLabels.push(label);
            });
            bodyHTML = orderedLabels.map(label => {
                const list = byCategory[label];
                const cat = list[0]?.category || 'ovrigt';
                const icon = categoryIcons[cat] || 'fa-file-alt';
                const safeLabel = (label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                return `
                    <div class="documentation-card kyc-section collapsible-card collapsible-card--kyc">
                        <div class="collapsible-header">
                            <div class="collapsible-title"><i class="fas ${icon}"></i> ${safeLabel}</div>
                        </div>
                        <div class="collapsible-body">
                            <ul class="document-list">${list.map(doc => this.createDocumentListItem(doc)).join('')}</ul>
                            <button class="card-edit-fab" title="Ladda upp dokument till denna kategori" onclick="event.stopPropagation(); customerCardManager.uploadDocument('${cat}')">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                        </div>
                    </div>`;
            }).join('');
        }

        content.innerHTML = `
            <div class="documentation-content documentation-cards">
                ${bodyHTML}
                <div class="document-list-actions">
                    <button class="btn btn-ghost btn-sm" onclick="customerCardManager.uploadDocument()">
                        <i class="fas fa-upload"></i> Ladda upp dokument
                    </button>
                </div>
            </div>`;
    }

    getCategoryLabel(cat) {
        const labels = {
            riskbedomning: 'Dokumentation riskbedömning',
            arsredovisning: 'Årsredovisningar',
            uppdragsavtal: 'Uppdragsavtal',
            bolagsverket_skatteverket: 'Bolagsverket och Skatteverket',
            ovrigt: 'Övrigt'
        };
        return labels[cat] || cat;
    }

    displayEmptyDocuments() {
        this.displayDocuments([]);
    }

    parseSamarbeteAnswersArray(rawText) {
        const raw = (rawText || '').toString().trim();
        if (!raw || !raw.startsWith('[')) return null;
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : null;
        } catch (_) {
            return null;
        }
    }

    _samarbeteAttKey(att) {
        if (!att) return '';
        if (att.id) return `id:${att.id}`;
        if (att.url) return `url:${att.url}`;
        const fn = (att.filename || att.name || '').trim().toLowerCase();
        return fn ? `fn:${fn}` : '';
    }

    /** Airtable lagrar alla filer i en lista i uppladdningsordning – inte per frågeindex. */
    matchSamarbeteAttachment(attachments, answer, usedKeys = null) {
        if (!Array.isArray(attachments) || attachments.length === 0) return null;
        const a = answer || {};
        const want = String(a.filename || a.attachmentFilename || '').trim().toLowerCase();
        if (want) {
            const hit = attachments.find((att) => {
                const key = this._samarbeteAttKey(att);
                if (usedKeys && key && usedKeys.has(key)) return false;
                const fn = String(att.filename || att.name || '').trim().toLowerCase();
                if (!fn) return false;
                return fn === want || fn.endsWith(want) || want.endsWith(fn);
            });
            if (hit) {
                const key = this._samarbeteAttKey(hit);
                if (usedKeys && key) usedKeys.add(key);
                return hit;
            }
        }
        if (a.attachmentUrl) {
            const byUrl = attachments.find((att) => {
                const key = this._samarbeteAttKey(att);
                if (usedKeys && key && usedKeys.has(key)) return false;
                return att.url && att.url === a.attachmentUrl;
            });
            if (byUrl) {
                const key = this._samarbeteAttKey(byUrl);
                if (usedKeys && key) usedKeys.add(key);
                return byUrl;
            }
        }
        if (a.attachmentId) {
            const byId = attachments.find((att) => {
                const key = this._samarbeteAttKey(att);
                if (usedKeys && key && usedKeys.has(key)) return false;
                return att.id === a.attachmentId;
            });
            if (byId) {
                const key = this._samarbeteAttKey(byId);
                if (usedKeys && key) usedKeys.add(key);
                return byId;
            }
        }
        return null;
    }

    buildSamarbeteQaTableHtml(titleLines, answersArray, attachments, opts = {}) {
        const escape = opts.escape || ((s) => this.escapeDocHtml(s));
        const linkFn = opts.attachmentLink;
        const qMaxLen = opts.qMaxLen || 80;
        const lines = (titleLines && titleLines.length)
            ? titleLines
            : (Array.isArray(answersArray) ? answersArray.map((_, i) => `Punkt ${i + 1}`) : []);
        if (!lines.length) return '';
        const usedKeys = new Set();
        let html = '<div class="samarbete-qa-table"><div class="samarbete-qa-header"><span class="samarbete-qa-col-q">FRÅGA</span><span class="samarbete-qa-col-a">SVAR</span></div><ul class="samarbete-response-list samarbete-response-list--cols">';
        lines.forEach((line, idx) => {
            const qShort = String(line || '').slice(0, qMaxLen);
            const a = (Array.isArray(answersArray) && answersArray[idx]) ? answersArray[idx] : {};
            const textRaw = (a && a.text) ? String(a.text).trim() : '';
            const att = this.matchSamarbeteAttachment(attachments, a, usedKeys);
            const parts = [];
            const text = this.formatSamarbeteAnswerText(textRaw, linkFn);
            if (text) parts.push(escape(text));
            if (att && linkFn) parts.push(linkFn(att));
            const svar = parts.length ? parts.join(' · ') : '—';
            html += `<li class="samarbete-response-row"><div class="samarbete-response-q">${escape(qShort)}${qShort.length >= qMaxLen ? '…' : ''}</div><div class="samarbete-response-a">${svar}</div></li>`;
        });
        html += '</ul>';
        const extra = (attachments || []).filter((att) => {
            const key = this._samarbeteAttKey(att);
            return key && !usedKeys.has(key);
        });
        if (extra.length && linkFn) {
            html += '<p class="samarbete-extra-files"><strong>Övriga bifogade filer:</strong> ';
            extra.forEach((att, i) => {
                html += linkFn(att);
                if (i < extra.length - 1) html += ' ';
            });
            html += '</p>';
        }
        html += '</div>';
        return html;
    }

    async loadSamarbete() {
        const content = document.getElementById('samarbete-content');
        if (!content) return;
        if (!this.customerId) {
            content.innerHTML = '<p class="lead-empty">Ingen kund vald.</p>';
            return;
        }
        try {
            if (!isLoggedInKundkort()) {
                content.innerHTML = '<p class="lead-empty">Logga in för att se samarbetsförfrågningar.</p>';
                return;
            }
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/samarbete/requests?customerId=${encodeURIComponent(this.customerId)}`, { method: 'GET', ...getAuthOptsKundkort() });
            const data = res.ok ? await res.json() : { requests: [] };
            const requests = data.requests || [];
            const samState = this._computeSamarbeteTabState(requests);
            if (samState === 'red') {
                this._setTabStatus('samarbete',
                    '<span class="tab-status-bubble tab-status-bubble--red" aria-hidden="true">?</span>',
                    'Förfrågningar utan svar från kund');
            } else if (samState === 'yellow') {
                this._setTabStatus('samarbete',
                    '<span class="tab-status-bubble tab-status-bubble--yellow" aria-hidden="true">?</span>',
                    'Förfrågningar delvis besvarade');
            } else if (samState === 'green') {
                this._setTabStatus('samarbete',
                    '<span class="tab-status-bubble tab-status-bubble--green" aria-hidden="true"><i class="fas fa-comment"></i></span>',
                    'Kund har svarat på förfrågningar');
            } else {
                this._setTabStatus('samarbete', '');
            }
            this.displaySamarbete(requests);
        } catch (e) {
            console.error('loadSamarbete:', e);
            content.innerHTML = '<p class="lead-empty">Kunde inte ladda förfrågningar.</p>';
        }
    }

    getKontaktPersonerForSamarbete() {
        const raw = (this.customerData?.fields || {})['Kontaktpersoner'] || (this.customerData?.fields || {})['Befattningshavare'] || '';
        let list = [];
        try {
            if (raw && String(raw).trim().startsWith('[')) {
                list = (JSON.parse(raw) || []).map(p => ({
                    namn: p.namn || p.name || 'Namnlös',
                    epost: (p.epost || p.email || '').trim(),
                    roller: Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : [])
                }));
            }
        } catch (_) {}
        return list.filter(p => p.namn);
    }

    displaySamarbete(requests) {
        const content = document.getElementById('samarbete-content');
        if (!content) return;
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
        const isArchived = (r) => (r.status || '') === 'Arkiverad' || !!r.archived;
        const archived = requests.filter(isArchived);
        const drafts = requests.filter(r => (r.status || '') === 'Utkast' && !isArchived(r));
        const pending = requests.filter(r => (r.status || 'Väntar') === 'Väntar' && !isArchived(r));
        const answered = requests.filter(r => (r.status || '') === 'Besvarad' && !isArchived(r));

        const stripFileObligatorisk = (s) => (s || '').replace(/\s*\[fil obligatorisk\]\s*$/gi, '').trim();
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
        const fmtDeadline = (d) => d ? new Date(d).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        const renderHiddenLinkInput = (req) => {
            const link = `${baseUrl}/samarbete-svar.html?token=${encodeURIComponent(req.token || '')}`;
            return `<input type="text" readonly value="${this.escapeDocHtml(link)}" id="samarbete-link-${this.escapeDocHtml(req.id)}" class="samarbete-link-input-hidden" aria-hidden="true" tabindex="-1">`;
        };
        const copyLinkBtn = (req) => `<button type="button" class="btn btn-secondary btn-sm" onclick="customerCardManager.copySamarbeteLink('${this.escapeDocHtml(req.id)}')" title="Kopiera länk till kundformulär"><i class="fas fa-link"></i> Kopiera länk</button>`;
        const resendEmailBtn = (req) => `<button type="button" class="btn btn-primary btn-sm" onclick="customerCardManager.resendSamarbeteEmail('${this.escapeDocHtml(req.id)}')" title="Skicka mejlet igen"><i class="fas fa-envelope"></i> Skicka mejl igen</button>`;
        const uppdragBadge = (req) => {
            if (!(req && req.fromUppdrag)) return '';
            const typ = (req.uppdragTyp || '').toString().trim();
            const period = (req.uppdragPeriod || '').toString().trim();
            const label = typ ? `Uppdrag: ${typ}` : 'Uppdrag';
            const extra = period ? ` · ${period}` : '';
            return ` <span class="badge badge-info" style="margin-left:0.5rem; background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe; padding:2px 8px; border-radius:999px; font-weight:700; font-size:0.75rem;"><i class="fas fa-briefcase"></i> ${this.escapeDocHtml(label + extra)}</span>`;
        };

        const parseAnswersArray = (rawText) => {
            const raw = (rawText || '').toString().trim();
            if (!raw || !raw.startsWith('[')) return null;
            try {
                const arr = JSON.parse(raw);
                return Array.isArray(arr) ? arr : null;
            } catch (_) {
                return null;
            }
        };

        const attachmentLink = (att) => {
            if (!att || (!att.url && !att.id)) return '';
            const url = att.url || '#';
            const label = this.escapeDocHtml(att.filename || att.name || 'Bifogad fil');
            return `<a href="${this.escapeDocHtml(url)}" target="_blank" rel="noopener" class="samarbete-file-link"><i class="fas fa-download"></i> ${label}</a>`;
        };

        const pendingItems = pending.map(req => {
            const created = fmtDate(req.createdAt);
            const deadline = fmtDeadline(req.deadline);
            const titleFull = stripFileObligatorisk((req.title || 'Förfrågan').trim());
            const titleLines = titleFull.split('\n').map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
            const n = titleLines.length;
            const answersArray = parseAnswersArray(req.responseText);
            const attachments = Array.isArray(req.responseAttachment) ? req.responseAttachment : [];
            const answeredCount = Array.isArray(answersArray)
                ? titleLines.reduce((acc, _, idx) => {
                    const a = answersArray[idx] || {};
                    const hasText = a.text && String(a.text).trim();
                    const hasFile = a.filename && String(a.filename).trim();
                    return acc + ((hasText || hasFile) ? 1 : 0);
                }, 0)
                : 0;
            const progress = (answeredCount > 0 && n > 0) ? ` · Påbörjad: ${answeredCount}/${n}` : '';
            const headerLine = `${req.recipientName || '—'} · Skickad den ${created}${deadline ? ` · Deadline ${deadline}` : ''} · ${n} ${n === 1 ? 'punkt' : 'punkter'}${progress}`;
            const questionsHtml = titleLines.length > 0
                ? this.buildSamarbeteQaTableHtml(titleLines, answersArray, attachments, {
                    escape: (s) => this.escapeDocHtml(s),
                    attachmentLink,
                    qMaxLen: 80
                })
                : '';
            return `
                <div class="samarbete-list-item samarbete-list-item--collapsible collapsed">
                    ${renderHiddenLinkInput(req)}
                    <div class="samarbete-item-head samarbete-item-head--toggle samarbete-item-head--meta" role="button" tabindex="0" aria-expanded="false">
                        <div class="samarbete-item-head-inner">
                            <span class="samarbete-item-title-main">${this.escapeDocHtml(headerLine)}${uppdragBadge(req)}</span>
                        </div>
                        <i class="fas fa-chevron-down samarbete-item-chevron"></i>
                    </div>
                    <div class="samarbete-item-collapse">
                        <div class="samarbete-item-body samarbete-response-block">
                            ${titleLines.length > 0 ? `<div class="samarbete-block samarbete-block--questions">${questionsHtml}</div>` : ''}
                        </div>
                        <div class="samarbete-item-actions">
                            ${resendEmailBtn(req)}
                            <button type="button" class="btn btn-primary btn-sm" data-request-id="${this.escapeDocHtml(req.id)}" onclick="customerCardManager.archiveSamarbeteRequest('${this.escapeDocHtml(req.id)}')" title="Arkivera förfrågan"><i class="fas fa-archive"></i> Arkivera</button>
                            ${copyLinkBtn(req)}
                        </div>
                    </div>
                </div>`;
        }).join('');

        const answeredItems = answered.map(req => {
            const created = fmtDate(req.createdAt);
            const answeredAt = fmtDate(req.answeredAt);
            const deadline = fmtDeadline(req.deadline);
            let responseHtml = '';
            const rawText = (req.responseText || '').trim();
            const attachments = Array.isArray(req.responseAttachment) ? req.responseAttachment : [];
            let answersArray = null;
            if (rawText && rawText.startsWith('[')) {
                try { answersArray = JSON.parse(rawText); } catch (_) {}
            }
            const titleFull = stripFileObligatorisk((req.title || 'Förfrågan').trim());
            const titleLines = titleFull.split('\n').map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
            const titleFirst = titleLines[0] || 'Förfrågan';
            const numPoints = titleLines.length;

            if (numPoints > 0 || (Array.isArray(answersArray) && answersArray.length > 0)) {
                responseHtml += this.buildSamarbeteQaTableHtml(
                    titleLines.length ? titleLines : null,
                    answersArray,
                    attachments,
                    { escape: (s) => this.escapeDocHtml(s), attachmentLink, qMaxLen: 80 }
                );
            } else {
                if (rawText) responseHtml += `<p class="samarbete-response-text">${this.escapeDocHtml(rawText)}</p>`;
                if (attachments.length > 0) {
                    responseHtml += '<p class="samarbete-extra-files">';
                    attachments.forEach((att) => { responseHtml += attachmentLink(att); });
                    responseHtml += '</p>';
                }
            }
            if (!responseHtml) responseHtml = '<p class="samarbete-no-response">Inget svar sparades.</p>';
            const responseAttr = this.escapeDocHtml((rawText || '').slice(0, 2000));
            const allAnswered = numPoints > 0 && Array.isArray(answersArray) && answersArray.length >= numPoints &&
                answersArray.slice(0, numPoints).every(a => (a && ((a.text && String(a.text).trim()) || (a.filename && String(a.filename).trim()))));
            const headerLine = `${req.recipientName || '—'} · Skickad den ${created}${deadline ? ` · Deadline ${deadline}` : ''} · ${numPoints} ${numPoints === 1 ? 'punkt' : 'punkter'} · Besvarad: ${answeredAt}`;
            return `
                <div class="samarbete-list-item samarbete-list-item--collapsible collapsed">
                    ${renderHiddenLinkInput(req)}
                    <div class="samarbete-item-head samarbete-item-head--toggle samarbete-item-head--meta" role="button" tabindex="0" aria-expanded="false">
                        <div class="samarbete-item-head-inner">
                            <span class="samarbete-item-title-main">${this.escapeDocHtml(headerLine)}${uppdragBadge(req)}</span>
                        </div>
                        <i class="fas fa-chevron-down samarbete-item-chevron"></i>
                    </div>
                    <div class="samarbete-item-collapse">
                        <div class="samarbete-item-body samarbete-response-block">
                            <div class="samarbete-block samarbete-block--questions">${responseHtml}</div>
                        </div>
                        <div class="samarbete-item-actions">
                            ${req.closed ? '<span class="samarbete-closed-badge"><i class="fas fa-lock"></i> Stängd</span>' : ''}
                            <button type="button" class="btn btn-primary btn-sm" data-request-id="${this.escapeDocHtml(req.id)}" onclick="customerCardManager.archiveSamarbeteRequest('${this.escapeDocHtml(req.id)}')" title="Arkivera förfrågan"><i class="fas fa-archive"></i> Arkivera</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        const archivedItems = archived.map(req => {
            const created = fmtDate(req.createdAt);
            const answeredAt = fmtDate(req.answeredAt);
            const deadline = fmtDeadline(req.deadline);
            const titleFull = stripFileObligatorisk((req.title || 'Förfrågan').trim());
            const n = titleFull.split('\n').filter(Boolean).length;
            const headerLine = `${req.recipientName || '—'} · Skickad den ${created}${deadline ? ` · Deadline ${deadline}` : ''} · ${n} ${n === 1 ? 'punkt' : 'punkter'}${req.answeredAt ? ' · Besvarad: ' + answeredAt : ''}`;
            return `
                <div class="samarbete-list-item samarbete-list-item--collapsible collapsed">
                    ${renderHiddenLinkInput(req)}
                    <div class="samarbete-item-head samarbete-item-head--toggle samarbete-item-head--meta" role="button" tabindex="0" aria-expanded="false">
                        <div class="samarbete-item-head-inner">
                            <span class="samarbete-item-title-main">${this.escapeDocHtml(headerLine)}${uppdragBadge(req)}</span>
                        </div>
                        <i class="fas fa-chevron-down samarbete-item-chevron"></i>
                    </div>
                    <div class="samarbete-item-collapse">
                        <div class="samarbete-item-body samarbete-response-block">
                            ${req.closed ? '<div class="samarbete-block"><span class="samarbete-closed-badge"><i class="fas fa-lock"></i> Stängd</span></div>' : ''}
                        </div>
                        <div class="samarbete-item-actions">
                            <button type="button" class="btn btn-primary btn-sm" onclick="customerCardManager.unarchiveSamarbeteRequest('${this.escapeDocHtml(req.id)}')" title="Återställ till väntande/besvarade"><i class="fas fa-undo"></i> Återställ från arkiv</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        const editDraftBtn = (req) => `<button type="button" class="btn btn-secondary btn-sm" onclick='customerCardManager.openBegarUnderlagModal(${JSON.stringify({
            id: req.id,
            title: req.title || '',
            recipientEmail: req.recipientEmail || '',
            recipientName: req.recipientName || '',
            customerMessage: req.customerMessage || '',
            deadline: req.deadline || '',
            uppdragId: req.uppdragId || '',
            uppdragTyp: req.uppdragTyp || '',
            uppdragPeriod: req.uppdragPeriod || ''
        }).replace(/'/g, "\\'")})' title="Redigera utkast"><i class="fas fa-pen"></i> Redigera</button>`;
        const sendDraftBtn = (req) => `<button type="button" class="btn btn-primary btn-sm" onclick="customerCardManager.sendSamarbeteDraft('${this.escapeDocHtml(req.id)}')" title="Skicka utkast"><i class="fas fa-paper-plane"></i> Skicka</button>`;

        const draftItems = drafts.map(req => {
            const created = fmtDate(req.createdAt);
            const deadline = fmtDeadline(req.deadline);
            const titleFull = stripFileObligatorisk((req.title || 'Utkast').trim());
            const n = titleFull.split('\n').filter(Boolean).length;
            const headerLine = `${req.recipientName || '—'} · Utkast · Skapat ${created}${deadline ? ` · Deadline ${deadline}` : ''} · ${n} ${n === 1 ? 'punkt' : 'punkter'}`;
            return `
                <div class="samarbete-list-item samarbete-list-item--collapsible collapsed">
                    <div class="samarbete-item-head samarbete-item-head--toggle samarbete-item-head--meta" role="button" tabindex="0" aria-expanded="false">
                        <div class="samarbete-item-head-inner">
                            <span class="samarbete-item-title-main">${this.escapeDocHtml(headerLine)}${uppdragBadge(req)}</span>
                        </div>
                        <i class="fas fa-chevron-down samarbete-item-chevron"></i>
                    </div>
                    <div class="samarbete-item-collapse">
                        <div class="samarbete-item-body samarbete-response-block">
                            <div class="samarbete-block">
                                <div style="white-space:pre-line; color:#334155;">${this.escapeDocHtml(titleFull)}</div>
                            </div>
                        </div>
                        <div class="samarbete-item-actions">
                            ${editDraftBtn(req)}
                            ${sendDraftBtn(req)}
                            <button type="button" class="btn btn-primary btn-sm" onclick="customerCardManager.archiveSamarbeteRequest('${this.escapeDocHtml(req.id)}')" title="Arkivera utkast"><i class="fas fa-archive"></i> Arkivera</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        content.innerHTML = `
            <div class="documentation-content documentation-cards">
                <div class="documentation-card kyc-section collapsible-card collapsible-card--kyc">
                    <div class="collapsible-header">
                        <div class="collapsible-title"><i class="fas fa-pen"></i> Utkast</div>
                    </div>
                    <div class="collapsible-body">
                        ${drafts.length ? `<div class="samarbete-list">${draftItems}</div>` : '<p class="samarbete-empty">Inga utkast.</p>'}
                    </div>
                </div>
                <div class="documentation-card kyc-section collapsible-card collapsible-card--kyc">
                    <div class="collapsible-header">
                        <div class="collapsible-title"><i class="fas fa-clock"></i> Väntande förfrågningar</div>
                    </div>
                    <div class="collapsible-body">
                        ${pending.length ? `<div class="samarbete-list">${pendingItems}</div>` : '<p class="samarbete-empty">Inga väntande förfrågningar.</p>'}
                    </div>
                </div>
                <div class="documentation-card kyc-section collapsible-card collapsible-card--kyc">
                    <div class="collapsible-header">
                        <div class="collapsible-title"><i class="fas fa-check-circle"></i> Besvarade förfrågningar</div>
                    </div>
                    <div class="collapsible-body">
                        ${answered.length ? `<div class="samarbete-list">${answeredItems}</div>` : '<p class="samarbete-empty">Inga besvarade förfrågningar ännu.</p>'}
                    </div>
                </div>
                <div class="documentation-card kyc-section collapsible-card collapsible-card--kyc">
                    <div class="collapsible-header">
                        <div class="collapsible-title"><i class="fas fa-archive"></i> Arkiverade förfrågningar</div>
                    </div>
                    <div class="collapsible-body">
                        ${archived.length ? `<div class="samarbete-list">${archivedItems}</div>` : '<p class="samarbete-empty">Inga arkiverade förfrågningar.</p>'}
                    </div>
                </div>
                <div class="document-list-actions">
                    <button class="btn btn-primary btn-sm" onclick="customerCardManager.openBegarUnderlagModal()">
                        <i class="fas fa-paper-plane"></i> Begär underlag
                    </button>
                </div>
            </div>`;
        if (!content._samarbeteToggleBound) {
            content._samarbeteToggleBound = true;
            content.addEventListener('click', function(e) {
                const head = e.target.closest('.samarbete-item-head--toggle');
                if (!head) return;
                const item = head.closest('.samarbete-list-item--collapsible');
                if (item) {
                    item.classList.toggle('collapsed');
                    head.setAttribute('aria-expanded', item.classList.contains('collapsed') ? 'false' : 'true');
                }
            });
            content.addEventListener('keydown', function(e) {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const head = e.target.closest('.samarbete-item-head--toggle');
                if (!head) return;
                e.preventDefault();
                const item = head.closest('.samarbete-list-item--collapsible');
                if (item) {
                    item.classList.toggle('collapsed');
                    head.setAttribute('aria-expanded', item.classList.contains('collapsed') ? 'false' : 'true');
                }
            });
        }
    }

    openSamarbeteRespondModal(triggerButton) {
        const requestId = (triggerButton && triggerButton.dataset && triggerButton.dataset.requestId) || '';
        const currentResponseText = (triggerButton && triggerButton.dataset && triggerButton.dataset.responseText) || '';
        const modal = document.getElementById('samarbete-respond-modal');
        if (modal) modal.remove();
        const wrap = document.createElement('div');
        wrap.id = 'samarbete-respond-modal';
        wrap.className = 'modal-overlay';
        wrap.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Lägg till svar manuellt</h3>
                    <button class="modal-close" onclick="document.getElementById('samarbete-respond-modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <p class="samarbete-modal-hint">Dokumentera svar från kunden (t.ex. om de svarat via e-post). Det sparas på förfrågan och visas under Besvarade förfrågningar.</p>
                    <div class="form-group">
                        <label for="samarbete-respond-comment">Kommentar / svar</label>
                        <textarea id="samarbete-respond-comment" class="form-control" rows="4" placeholder="Klistra in eller skriv kundens svar...">${this.escapeDocHtml(currentResponseText)}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="samarbete-respond-file">Bifoga fil (valfritt)</label>
                        <input type="file" id="samarbete-respond-file" class="form-control" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-ghost" onclick="document.getElementById('samarbete-respond-modal').remove()">Avbryt</button>
                        <button type="button" class="btn btn-primary" id="samarbete-respond-submit" data-request-id="${this.escapeDocHtml(requestId)}"><i class="fas fa-save"></i> Spara svar</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        const submitBtn = document.getElementById('samarbete-respond-submit');
        if (submitBtn) submitBtn.addEventListener('click', () => this.submitSamarbeteRespond(requestId));
    }

    async submitSamarbeteRespond(requestId) {
        const commentEl = document.getElementById('samarbete-respond-comment');
        const fileEl = document.getElementById('samarbete-respond-file');
        const btn = document.getElementById('samarbete-respond-submit');
        const comment = (commentEl && commentEl.value) ? commentEl.value.trim() : '';
        const file = fileEl && fileEl.files && fileEl.files[0];
        if (!comment && !file) {
            this.showNotification('Skriv en kommentar eller bifoga en fil.', 'error');
            return;
        }
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; }
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const body = { comment };
            if (file) {
                const b64 = await new Promise((res, rej) => {
                    const r = new FileReader();
                    r.onload = () => res(r.result.replace(/^data:[^;]+;base64,/, ''));
                    r.onerror = rej;
                    r.readAsDataURL(file);
                });
                body.file = b64;
                body.filename = file.name;
            }
            const res = await fetch(`${baseUrl}/api/samarbete/requests/${encodeURIComponent(requestId)}/respond`, {
                method: 'PUT',
                ...getAuthOptsKundkort(),
                headers: { 'Content-Type': 'application/json', ...(getAuthOptsKundkort().headers || {}) },
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Kunde inte spara svar');
            document.getElementById('samarbete-respond-modal').remove();
            this.showNotification('Svar sparades.', 'success');
            this.loadSamarbete();
        } catch (e) {
            this.showNotification(e.message || 'Kunde inte spara svar', 'error');
        }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Spara svar'; }
    }

    async runSamarbeteFieldsSetup() {
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/setup/airtable-samarbete-fields`, { method: 'POST', ...getAuthOptsKundkort() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Kunde inte uppdatera tabellen');
            this.showNotification(data.message || 'Tabellen uppdaterad.', 'success');
            this.loadSamarbete();
        } catch (e) {
            this.showNotification(e.message || 'Kunde inte uppdatera tabellen', 'error');
        }
    }

    async closeSamarbeteRequest(requestId) {
        if (!requestId || !confirm('Vill du stänga denna förfrågan? Kunden kan då inte längre öppna länken eller lämna underlag.')) return;
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/samarbete/requests/${encodeURIComponent(requestId)}/close`, { method: 'PUT', ...getAuthOptsKundkort() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Kunde inte stänga');
            this.showNotification(data.message || 'Förfrågan är stängd.', 'success');
            this.loadSamarbete();
        } catch (e) {
            this.showNotification(e.message || 'Kunde inte stänga förfrågan', 'error');
        }
    }

    async archiveSamarbeteRequest(requestId) {
        if (!requestId) return;
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/samarbete/requests/${encodeURIComponent(requestId)}/archive`, { method: 'PUT', ...getAuthOptsKundkort() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Kunde inte arkivera');
            this.showNotification(data.message || 'Förfrågan är arkiverad.', 'success');
            this.loadSamarbete();
        } catch (e) {
            this.showNotification(e.message || 'Kunde inte arkivera förfrågan', 'error');
        }
    }

    async unarchiveSamarbeteRequest(requestId) {
        if (!requestId) return;
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/samarbete/requests/${encodeURIComponent(requestId)}/unarchive`, { method: 'PUT', ...getAuthOptsKundkort() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Kunde inte återställa');
            this.showNotification(data.message || 'Förfrågan är återställd från arkivet.', 'success');
            this.loadSamarbete();
        } catch (e) {
            this.showNotification(e.message || 'Kunde inte återställa från arkiv', 'error');
        }
    }

    async resendSamarbeteEmail(requestId) {
        if (!requestId) return;
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/samarbete/requests/${encodeURIComponent(requestId)}/resend-email`, {
                method: 'POST',
                ...getAuthOptsKundkort()
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Kunde inte skicka mejlet igen');
            this.showNotification(data.message || 'Mejlet har skickats igen.', 'success');
        } catch (e) {
            this.showNotification(e.message || 'Kunde inte skicka mejlet igen', 'error');
        }
    }

    copySamarbeteLink(recordId) {
        const input = document.getElementById('samarbete-link-' + recordId);
        if (!input) return;
        input.select();
        input.setSelectionRange(0, 99999);
        try {
            navigator.clipboard.writeText(input.value);
            this.showNotification('Länken har kopierats till urklipp.', 'success');
        } catch (_) {
            this.showNotification('Kopiera länken manuellt från rutan.', 'info');
        }
    }

    openBegarUnderlagModal(existingDraft, prefill) {
        const personer = this.getKontaktPersonerForSamarbete();
        const draft = existingDraft && typeof existingDraft === 'object' ? existingDraft : null;
        const pre = (prefill && typeof prefill === 'object') ? prefill : null;
        const options = personer.length
            ? personer.map((p, i) => `<option value="${this.escapeDocHtml(p.epost)}" data-name="${this.escapeDocHtml(p.namn)}">${this.escapeDocHtml(p.namn)}${p.epost ? ' – ' + p.epost : ' (e-post saknas)'}</option>`).join('')
            : '<option value="">Inga roller med e-post – lägg till på Företagsinformation</option>';

        const uppdrag = Array.isArray(this._uppdragRecords) ? this._uppdragRecords : [];
        const uppdragOptions = ['<option value="">Ingen koppling</option>'].concat(
            uppdrag
                .map(r => ({
                    id: r?.id || '',
                    typ: (r?.fields?.['Typ'] || '').toString().trim()
                }))
                .filter(x => x.id && x.typ)
                .map(x => `<option value="${this.escapeDocHtml(x.id)}" data-typ="${this.escapeDocHtml(x.typ)}">${this.escapeDocHtml(x.typ)}</option>`)
        ).join('');
        const modalHtml = `
            <div id="begar-underlag-modal" class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-paper-plane"></i> Begär underlag från kund</h3>
                        <button class="modal-close" onclick="customerCardManager.closeBegarUnderlagModal()"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <input type="hidden" id="samarbete-draft-id" value="${draft ? this.escapeDocHtml(draft.id || '') : ''}">
                        <div class="form-group">
                            <label for="samarbete-recipient">Välj mottagare</label>
                            <select id="samarbete-recipient" class="form-control">${options}</select>
                        </div>
                        <div class="form-group">
                            <label for="samarbete-uppdrag-link">Koppla till uppdrag <span style="color:#64748b; font-weight:400;">(valfritt)</span></label>
                            <select id="samarbete-uppdrag-link" class="form-control">${uppdragOptions}</select>
                            <div style="font-size:0.8rem;color:#64748b;margin-top:0.35rem;">Visas som “Uppdrag” i Samarbete-listan så du ser att den hör ihop med ett uppdrag.</div>
                        </div>
                        <div class="form-group" id="samarbete-uppdrag-period-wrap" style="display:none;">
                            <label for="samarbete-uppdrag-period">Uppdragskörning / period <span style="color:#64748b; font-weight:400;">(valfri men rekommenderad)</span></label>
                            <select id="samarbete-uppdrag-period" class="form-control"></select>
                            <div style="font-size:0.8rem;color:#64748b;margin-top:0.35rem;">Exempel: 2026-01 (lön januari), 2026-Q1 (moms kvartal 1), 2025 (år).</div>
                        </div>
                        <div class="form-group">
                            <label>Begärt underlag *</label>
                            <div id="samarbete-items-wrap">
                                <div class="samarbete-item-row">
                                    <input type="text" class="form-control samarbete-item-input" placeholder="t.ex. kontoutdrag 2025 eller en längre fråga" data-item="0">
                                    <label class="samarbete-file-req-wrap" title="Klicka för att kräva fil från kunden">
                                        <input type="checkbox" class="samarbete-file-required samarbete-file-required-input" data-item="0">
                                        <span class="samarbete-file-req-icon"><i class="fas fa-file-upload"></i></span>
                                    </label>
                                    <button type="button" class="btn btn-ghost btn-sm samarbete-item-remove" title="Ta bort" style="flex-shrink:0;"><i class="fas fa-times"></i></button>
                                </div>
                            </div>
                            <button type="button" class="btn btn-ghost btn-sm" id="samarbete-add-item" style="margin-top:0.5rem;"><i class="fas fa-plus"></i> Lägg till fler frågor</button>
                        </div>
                        <div class="form-group">
                            <label for="samarbete-customer-message">Meddelande till kunden <span style="color:#64748b; font-weight:400;">(visas i mejlet)</span></label>
                            <textarea id="samarbete-customer-message" class="form-control" rows="2" placeholder="t.ex. Jag behöver dessa senast på torsdag">${draft ? this.escapeDocHtml(draft.customerMessage || '') : ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label for="samarbete-deadline">Deadline <span style="color:#64748b; font-weight:400;">(valfri)</span></label>
                            <input type="date" id="samarbete-deadline" class="form-control" value="${draft ? this.escapeDocHtml((draft.deadline || '').toString().slice(0, 10)) : ''}" />
                            <div style="font-size:0.8rem;color:#64748b;margin-top:0.35rem;">Om du anger en deadline visas den i mejlet och kunden får automatiska påminnelser.</div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-ghost" onclick="customerCardManager.closeBegarUnderlagModal()">Avbryt</button>
                            <button type="button" class="btn btn-secondary" id="samarbete-draft-btn" onclick="customerCardManager.submitBegarUnderlag({ asDraft: true })">
                                <i class="fas fa-save"></i> Spara utkast
                            </button>
                            <button type="button" class="btn btn-primary" id="samarbete-submit-btn" onclick="customerCardManager.submitBegarUnderlag({ asDraft: false })">
                                <i class="fas fa-paper-plane"></i> Skapa förfrågan
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        const wrap = document.createElement('div');
        wrap.innerHTML = modalHtml;
        document.body.appendChild(wrap.firstElementChild);

        // Periodval för uppdragskoppling
        const uppdragSel = document.getElementById('samarbete-uppdrag-link');
        const periodWrap = document.getElementById('samarbete-uppdrag-period-wrap');
        const periodSel = document.getElementById('samarbete-uppdrag-period');
        const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const prevQuarterKey = (d) => {
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            let q = Math.ceil(m / 3) - 1;
            let yy = y;
            if (q <= 0) { q = 4; yy = y - 1; }
            return `${yy}-Q${q}`;
        };
        const quarterKeyFor = (d) => {
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const q = Math.ceil(m / 3);
            return `${y}-Q${q}`;
        };
        const buildPeriodOptions = (mode) => {
            const now = new Date();
            const unique = new Set();
            const out = [];
            const push = (value, label) => {
                const v = String(value || '').trim();
                if (!v || unique.has(v)) return;
                unique.add(v);
                out.push({ value: v, label: String(label || v) });
            };

            if (mode === 'year') {
                // Visa: föregående år + 2 år framåt
                const y = now.getFullYear();
                push(String(y - 1), String(y - 1));
                push(String(y), String(y));
                push(String(y + 1), String(y + 1));
                push(String(y + 2), String(y + 2));
                return out;
            }

            if (mode === 'quarter') {
                // Visa: föregående kvartal + 6 kvartal framåt
                const qLabel = (key) => `Kvartal ${String(key).split('Q')[1]} ${String(key).split('-')[0]}`;
                const cur = quarterKeyFor(new Date(now.getFullYear(), now.getMonth(), 1));
                const prev = prevQuarterKey(new Date(now.getFullYear(), now.getMonth(), 1));
                push(prev, qLabel(prev));
                push(cur, qLabel(cur));
                let cursor = new Date(now.getFullYear(), now.getMonth() + 3, 1);
                for (let i = 0; i < 6; i++) {
                    const key = quarterKeyFor(cursor);
                    push(key, qLabel(key));
                    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
                }
                return out;
            }

            // month: Visa: föregående månad + 12 månader framåt
            const mLabel = (d) => d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            push(monthKey(prev), mLabel(prev));
            for (let i = 0; i < 13; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                push(monthKey(d), mLabel(d));
            }
            return out;
        };
        const getUppdragMode = (rec) => {
            const typ = (rec?.fields?.['Typ'] || '').toString().trim();
            const freq = (rec?.fields?.['Frekvens'] || '').toString().toLowerCase();
            if (typ === 'Momsredovisning') {
                if (freq.includes('kvartal')) return 'quarter';
                if (freq.includes('år')) return 'year';
                return 'month';
            }
            if (typ === 'Bokslut' || typ === 'Deklaration') return 'year';
            return 'month';
        };
        const renderPeriodForUppdrag = () => {
            if (!uppdragSel || !periodWrap || !periodSel) return;
            const uppdragId = (uppdragSel.value || '').trim();
            if (!uppdragId) {
                periodWrap.style.display = 'none';
                periodSel.innerHTML = '';
                return;
            }
            const rec = (Array.isArray(this._uppdragRecords) ? this._uppdragRecords : []).find(r => String(r?.id || '') === uppdragId) || null;
            const mode = getUppdragMode(rec);
            const opts = buildPeriodOptions(mode);
            const pref = (mode === 'quarter')
                ? prevQuarterKey(new Date(now.getFullYear(), now.getMonth(), 1))
                : (mode === 'year'
                    ? String(now.getFullYear() - 1)
                    : monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            periodSel.innerHTML = ['<option value="">Välj period...</option>'].concat(
                opts.map(o => `<option value="${this.escapeDocHtml(o.value)}" ${String(o.value) === String(pref) ? 'selected' : ''}>${this.escapeDocHtml(o.value)} – ${this.escapeDocHtml(o.label)}</option>`)
            ).join('');
            periodWrap.style.display = '';
        };
        if (uppdragSel) {
            uppdragSel.addEventListener('change', renderPeriodForUppdrag);
            // initial
            renderPeriodForUppdrag();
        }

        // Prefill uppdrag + period (t.ex. från uppdragsöversikten)
        if (pre && uppdragSel) {
            const preUppdragId = (pre.uppdragId || '').toString().trim();
            const prePeriod = (pre.uppdragPeriod || '').toString().trim();
            if (preUppdragId) {
                uppdragSel.value = preUppdragId;
                renderPeriodForUppdrag();
                if (periodSel && prePeriod) {
                    // Om perioden inte finns i listan (ovanligt) – lägg till den överst
                    if (![...periodSel.options].some(o => String(o.value) === String(prePeriod))) {
                        const opt = document.createElement('option');
                        opt.value = prePeriod;
                        opt.textContent = `${prePeriod} – (förvalt)`;
                        periodSel.insertBefore(opt, periodSel.firstChild);
                    }
                    periodSel.value = prePeriod;
                    if (periodWrap) periodWrap.style.display = '';
                }

                // Om modalen öppnas från en specifik körning: lås kopplingen så den alltid sparas korrekt
                try {
                    uppdragSel.disabled = true;
                    if (periodSel) periodSel.disabled = true;
                    if (periodWrap && periodWrap.querySelector('label')) {
                        const lbl = periodWrap.querySelector('label');
                        if (lbl && !periodWrap.querySelector('.samarbete-prefill-hint')) {
                            const hint = document.createElement('div');
                            hint.className = 'samarbete-prefill-hint';
                            hint.style.cssText = 'font-size:0.8rem;color:#64748b;margin-top:0.35rem;';
                            hint.textContent = 'Förvalt från uppdragskörningen.';
                            periodWrap.appendChild(hint);
                        }
                    }
                } catch (_) {}
            }
        }

        const wrapEl = document.getElementById('samarbete-items-wrap');
        const addBtn = document.getElementById('samarbete-add-item');
        if (addBtn && wrapEl) {
            addBtn.addEventListener('click', () => {
                const n = wrapEl.querySelectorAll('.samarbete-item-row').length;
                const row = document.createElement('div');
                row.className = 'samarbete-item-row';
                row.innerHTML = `<input type="text" class="form-control samarbete-item-input" placeholder="t.ex. ytterligare underlag eller fråga" data-item="${n}"><label class="samarbete-file-req-wrap" title="Klicka för att kräva fil från kunden"><input type="checkbox" class="samarbete-file-required samarbete-file-required-input" data-item="${n}"><span class="samarbete-file-req-icon"><i class="fas fa-file-upload"></i></span></label><button type="button" class="btn btn-ghost btn-sm samarbete-item-remove" title="Ta bort" style="flex-shrink:0;"><i class="fas fa-times"></i></button>`;
                wrapEl.appendChild(row);
                row.querySelector('.samarbete-item-remove').addEventListener('click', () => { row.remove(); });
            });
            wrapEl.addEventListener('click', (e) => {
                const rm = e.target.closest('.samarbete-item-remove');
                if (rm && rm.closest('.samarbete-item-row')) rm.closest('.samarbete-item-row').remove();
            });
            wrapEl.addEventListener('change', (e) => {
                const chk = e.target.closest('.samarbete-file-required-input');
                if (chk) {
                    const wrap = chk.closest('.samarbete-file-req-wrap');
                    if (wrap) {
                        wrap.classList.toggle('is-checked', chk.checked);
                        wrap.title = chk.checked ? 'Fil krävs – klicka för att ta bort kravet' : 'Klicka för att kräva fil från kunden';
                    }
                }
            });
            wrapEl.querySelectorAll('.samarbete-file-required-input').forEach(chk => {
                const wrap = chk.closest('.samarbete-file-req-wrap');
                if (wrap) {
                    wrap.classList.toggle('is-checked', chk.checked);
                    wrap.title = chk.checked ? 'Fil krävs – klicka för att ta bort kravet' : 'Klicka för att kräva fil från kunden';
                }
            });
        }

        // Prefill frågor för utkast
        if (draft && wrapEl) {
            try {
                const titleFull = ((draft.title || '') + '').trim();
                const lines = titleFull
                    ? titleFull.split('\n').map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean)
                    : [];
                if (lines.length) {
                    wrapEl.innerHTML = '';
                    lines.forEach((line, idx) => {
                        const row = document.createElement('div');
                        row.className = 'samarbete-item-row';
                        row.innerHTML = `<input type="text" class="form-control samarbete-item-input" placeholder="t.ex. kontoutdrag 2025 eller en längre fråga" data-item="${idx}" value="${this.escapeDocHtml(line)}"><label class="samarbete-file-req-wrap" title="Klicka för att kräva fil från kunden"><input type="checkbox" class="samarbete-file-required samarbete-file-required-input" data-item="${idx}"><span class="samarbete-file-req-icon"><i class="fas fa-file-upload"></i></span></label><button type="button" class="btn btn-ghost btn-sm samarbete-item-remove" title="Ta bort" style="flex-shrink:0;"><i class="fas fa-times"></i></button>`;
                        wrapEl.appendChild(row);
                    });
                }
            } catch (_) {}
        }

        // Prefill mottagare om finns
        if (draft) {
            const sel = document.getElementById('samarbete-recipient');
            if (sel && draft.recipientEmail) {
                sel.value = draft.recipientEmail;
            }
        }
    }

    closeBegarUnderlagModal() {
        const modal = document.getElementById('begar-underlag-modal');
        if (modal) modal.remove();
    }

    async submitBegarUnderlag(options) {
        const asDraft = !!(options && options.asDraft);
        const recipientSelect = document.getElementById('samarbete-recipient');
        const typeSelect = document.getElementById('samarbete-type');
        const uppdragSelect = document.getElementById('samarbete-uppdrag-link');
        const draftIdEl = document.getElementById('samarbete-draft-id');
        const draftId = (draftIdEl && draftIdEl.value) ? draftIdEl.value.trim() : '';
        const rows = document.querySelectorAll('#samarbete-items-wrap .samarbete-item-row');
        const btn = document.getElementById(asDraft ? 'samarbete-draft-btn' : 'samarbete-submit-btn');
        const items = [];
        rows.forEach((row, i) => {
            const inp = row.querySelector('.samarbete-item-input');
            const chk = row.querySelector('.samarbete-file-required');
            const text = (inp && inp.value) ? inp.value.trim() : '';
            if (text) items.push({ text, fileRequired: !!(chk && chk.checked) });
        });
        if (items.length === 0) {
            this.showNotification('Lägg till minst en fråga eller underlagsbegäran.', 'error');
            return;
        }
        const title = items.length === 1
            ? (items[0].text + (items[0].fileRequired ? ' [fil obligatorisk]' : ''))
            : items.map((it, i) => `${i + 1}. ${it.text}${it.fileRequired ? ' [fil obligatorisk]' : ''}`).join('\n');
        const recipientEmail = recipientSelect ? recipientSelect.value : '';
        const recipientName = recipientSelect && recipientSelect.selectedOptions[0] ? recipientSelect.selectedOptions[0].getAttribute('data-name') || '' : '';
        const messageEl = document.getElementById('samarbete-customer-message');
        const customerMessage = (messageEl && messageEl.value) ? messageEl.value.trim() : '';
        const deadlineEl = document.getElementById('samarbete-deadline');
        const deadline = (deadlineEl && deadlineEl.value) ? deadlineEl.value : '';
        const uppdragId = uppdragSelect ? (uppdragSelect.value || '').trim() : '';
        const uppdragTyp = (uppdragSelect && uppdragSelect.selectedOptions && uppdragSelect.selectedOptions[0])
            ? (uppdragSelect.selectedOptions[0].getAttribute('data-typ') || '').trim()
            : '';
        const uppdragPeriodEl = document.getElementById('samarbete-uppdrag-period');
        const uppdragPeriod = uppdragPeriodEl ? (uppdragPeriodEl.value || '').trim() : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...'; }
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const payload = {
                customerId: this.customerId,
                recipientName: recipientName || 'Kund',
                recipientEmail: recipientEmail || '',
                type: typeSelect ? typeSelect.value : 'Filer',
                title: title,
                customerMessage: customerMessage || undefined,
                deadline: deadline || undefined,
                uppdragId: uppdragId || undefined,
                uppdragTyp: uppdragTyp || undefined,
                uppdragPeriod: uppdragPeriod || undefined,
                status: asDraft ? 'Utkast' : 'Väntar'
            };

            const res = draftId
                ? await fetch(`${baseUrl}/api/samarbete/requests/${encodeURIComponent(draftId)}`, {
                    method: 'PUT',
                    ...getAuthOptsKundkort(),
                    headers: { 'Content-Type': 'application/json', ...(getAuthOptsKundkort().headers || {}) },
                    body: JSON.stringify(payload)
                })
                : await fetch(`${baseUrl}/api/samarbete/requests`, {
                    method: 'POST',
                    ...getAuthOptsKundkort(),
                    headers: { 'Content-Type': 'application/json', ...(getAuthOptsKundkort().headers || {}) },
                    body: JSON.stringify(payload)
                });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                // Logga detaljer så vi kan se exakt Airtable-fel (t.ex. okänt fält, ogiltig e-post, saknade select-vals)
                try {
                    console.error('❌ Samarbete create failed (raw):', JSON.stringify({ status: res.status, data }, null, 2));
                } catch (_) {
                    console.error('❌ Samarbete create failed:', { status: res.status, data });
                }
                const detailMsg =
                    (data && data.details && data.details.error && data.details.error.message)
                        ? String(data.details.error.message)
                        : '';
                const baseMsg = (data && data.error) ? String(data.error) : 'Kunde inte skapa förfrågan';
                const combined = (detailMsg && detailMsg !== baseMsg) ? `${baseMsg} (${detailMsg})` : baseMsg;
                throw new Error(combined);
            }
            this.closeBegarUnderlagModal();
            this.showNotification(data.message || (asDraft ? 'Utkast sparat.' : 'Förfrågan skapad.'), 'success');
            if (data.link) {
                const linkModal = document.createElement('div');
                linkModal.className = 'modal-overlay';
                linkModal.id = 'samarbete-link-modal';
                const emailSent = !!data.emailSent;
                const introText = emailSent
                    ? 'Ett mejl har skickats till mottagaren. Du kan också dela länken manuellt om du vill.'
                    : 'Skicka denna länk till kunden (t.ex. via e-post) så kan de lämna underlag eller svar.';
                linkModal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3><i class="fas fa-link"></i> Länk till kunden</h3>
                            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="modal-body">
                            <p>${this.escapeDocHtml(introText)}</p>
                            <div class="samarbete-link-wrap"><input type="text" readonly value="${this.escapeDocHtml(data.link)}" class="samarbete-link-input" id="samarbete-copy-global"></div>
                            <button type="button" class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('samarbete-copy-global').value); customerCardManager.showNotification('Länken kopierad.', 'success');">Kopiera länk</button>
                        </div>
                    </div>`;
                document.body.appendChild(linkModal);
            }
            if (data.emailError) {
                this.showNotification('Mejlet kunde inte skickas: ' + data.emailError, 'error');
            }
            this.loadSamarbete();
        } catch (e) {
            const msg = e.message || 'Något gick fel';
            if (msg.indexOf('Samarbete') !== -1 && msg.indexOf('finns inte') !== -1) {
                this.showSamarbeteSetupModal(msg);
            } else if (msg.indexOf('Insufficient permissions') !== -1 && msg.indexOf('select option') !== -1) {
                this.showStatusValModal();
            } else {
                this.showNotification(msg, 'error');
            }
        }
        if (btn) { btn.disabled = false; btn.innerHTML = asDraft ? '<i class="fas fa-save"></i> Spara utkast' : '<i class="fas fa-paper-plane"></i> Skapa förfrågan'; }
    }

    async sendSamarbeteDraft(requestId) {
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/samarbete/requests/${encodeURIComponent(requestId)}/send`, { method: 'POST', ...getAuthOptsKundkort() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Kunde inte skicka utkast');
            this.showNotification('Utkast skickat.', 'success');
            this.loadSamarbete();
        } catch (e) {
            this.showNotification(e.message || 'Kunde inte skicka utkast', 'error');
        }
    }

    showStatusValModal() {
        const modal = document.getElementById('samarbete-status-val-modal');
        if (modal) return;
        const wrap = document.createElement('div');
        wrap.id = 'samarbete-status-val-modal';
        wrap.className = 'modal-overlay';
        wrap.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-list"></i> Lägg till val i fältet Status</h3>
                    <button class="modal-close" onclick="document.getElementById('samarbete-status-val-modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <p>Fältet <strong>Status</strong> i tabellen <strong>Samarbete</strong> i Airtable behöver ha följande val. Kontrollera att alla finns (även <strong>Utkast</strong> och <strong>Arkiverad</strong> som används internt) och lägg till de som saknas:</p>
                    <ol style="margin:1rem 0; padding-left:1.5rem;">
                        <li>Öppna din Airtable-bas och tabellen <strong>Samarbete</strong>.</li>
                        <li>Klicka på kolumnrubriken <strong>Status</strong> (eller pilen bredvid).</li>
                        <li>Välj <strong>Customize field type</strong> / Anpassa fälttyp.</li>
                        <li>Under <strong>Single select</strong>, klicka <strong>Add option</strong> och lägg till exakt dessa fyra val: <strong>Utkast</strong>, <strong>Väntar</strong>, <strong>Besvarad</strong> och <strong>Arkiverad</strong>.</li>
                        <li>Spara. Försök sedan skapa förfrågan igen här.</li>
                    </ol>
                    <button type="button" class="btn btn-primary" onclick="document.getElementById('samarbete-status-val-modal').remove()">OK, jag förstår</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
    }

    showSamarbeteSetupModal(errorMessage) {
        const modal = document.getElementById('samarbete-setup-modal');
        if (modal) return;
        const wrap = document.createElement('div');
        wrap.id = 'samarbete-setup-modal';
        wrap.className = 'modal-overlay';
        wrap.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-database"></i> Tabellen "Samarbete" saknas</h3>
                    <button class="modal-close" onclick="document.getElementById('samarbete-setup-modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <p class="samarbete-modal-hint">${this.escapeDocHtml(errorMessage)}</p>
                    <p>Du kan skapa tabellen automatiskt i Airtable med ett klick. Kräver att din Airtable-token har behörighet att ändra basens schema.</p>
                    <div class="form-actions" style="margin-top:1rem;">
                        <button type="button" class="btn btn-ghost" onclick="document.getElementById('samarbete-setup-modal').remove()">Stäng</button>
                        <button type="button" class="btn btn-primary" id="samarbete-setup-btn" onclick="customerCardManager.runSamarbeteSetup()">
                            <i class="fas fa-plus"></i> Skapa tabell i Airtable
                        </button>
                    </div>
                    <p id="samarbete-setup-status" class="samarbete-setup-status"></p>
                </div>
            </div>`;
        document.body.appendChild(wrap);
    }

    async runSamarbeteSetup() {
        const btn = document.getElementById('samarbete-setup-btn');
        const statusEl = document.getElementById('samarbete-setup-status');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Skapar...'; }
        if (statusEl) { statusEl.textContent = ''; statusEl.className = 'samarbete-setup-status'; }
        try {
            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const res = await fetch(`${baseUrl}/api/setup/airtable-samarbete`, { method: 'POST', ...getAuthOptsKundkort() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Kunde inte skapa tabellen');
            if (statusEl) { statusEl.textContent = data.message || 'Tabellen skapad.'; statusEl.style.color = '#16a34a'; }
            this.showNotification(data.message || 'Tabellen "Samarbete" skapad. Försök skapa förfrågan igen.', 'success');
            if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> Klart'; }
            setTimeout(() => { const m = document.getElementById('samarbete-setup-modal'); if (m) m.remove(); }, 2500);
        } catch (e) {
            if (statusEl) { statusEl.textContent = e.message || 'Något gick fel'; statusEl.style.color = '#dc2626'; }
            this.showNotification(e.message || 'Kunde inte skapa tabellen', 'error');
        }
        if (btn) { btn.disabled = false; if (btn.innerHTML.indexOf('Klart') === -1) btn.innerHTML = '<i class="fas fa-plus"></i> Skapa tabell i Airtable'; }
    }

    /** Visar Airtable-värden som läsbar text (inte rec-id eller rå JSON för bilagor). */
    formatFieldDisplay(val) {
        if (val == null || val === '') return null;
        if (typeof val === 'boolean') return val ? 'Ja' : 'Nej';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'object' && !Array.isArray(val)) {
            if (val.text != null) return String(val.text).trim() || null;
            if (val.filename) return String(val.filename).trim();
            return null;
        }
        if (Array.isArray(val)) {
            if (!val.length) return null;
            const first = val[0];
            if (first && typeof first === 'object' && (first.filename || first.url || (first.id && String(first.id).startsWith('att')))) {
                return val.map(a => a.filename || a.name || 'Bifogad fil').filter(Boolean).join(', ') || null;
            }
            const parts = val.map(x => this.formatFieldDisplay(x)).filter(Boolean);
            return parts.length ? parts.join(', ') : null;
        }
        const s = String(val).trim();
        if (!s) return null;
        if (/^rec[a-zA-Z0-9]{14}$/.test(s)) return null;
        if ((s.startsWith('{') || s.startsWith('[')) && (s.includes('airtable') || s.includes('"url"') || s.includes('"filename"'))) {
            try {
                const parsed = JSON.parse(s);
                const list = Array.isArray(parsed) ? parsed : [parsed];
                const names = list.filter(x => x && (x.filename || x.url)).map(x => x.filename || x.name || 'Bifogad fil');
                if (names.length) return names.join(', ');
            } catch (_) {}
            return null;
        }
        return s;
    }

    formatSamarbeteAnswerText(text, linkFn) {
        const raw = String(text || '').trim();
        if (!raw) return '';
        if (/^rec[a-zA-Z0-9]{14}$/.test(raw)) return '';
        if ((raw.startsWith('{') || raw.startsWith('[')) && raw.includes('"url"')) {
            try {
                const parsed = JSON.parse(raw);
                const list = Array.isArray(parsed) ? parsed : [parsed];
                const parts = list.filter(x => x && (x.filename || x.url)).map(x => {
                    if (linkFn && x.url) return linkFn(x);
                    return x.filename || x.name || 'Bifogad fil';
                });
                if (parts.length) return parts.join(' · ');
            } catch (_) {}
            return '';
        }
        return raw;
    }

    escapeDocHtml(s) {
        if (s == null || s === '') return '';
        const t = String(s);
        return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    createDocumentListItem(doc) {
        const fields = doc.fields || {};
        const namn = fields['Namn'] || doc.filename || 'Namnlös fil';
        const url = doc.url || '';
        const datum = fields['UppladdadDatum'] || (typeof namn === 'string' ? namn.match(/\d{4}-\d{2}-\d{2}/)?.[0] : null) || '-';
        const beskrivning = fields['Beskrivning'] || '';
        const safeNamn = this.escapeDocHtml(namn);
        const safeBeskr = this.escapeDocHtml(beskrivning);
        const downloadBtn = url
            ? `<a href="${this.escapeDocHtml(url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm document-download-btn" download="${this.escapeDocHtml((doc.filename || namn || '').replace(/"/g, ''))}"><i class="fas fa-download"></i> Ladda ner</a>`
            : `<button class="btn btn-primary btn-sm" disabled><i class="fas fa-download"></i> Ladda ner</button>`;
        const deleteBtn = (doc.sourceField != null && doc.sourceIndex != null)
            ? `<button type="button" class="btn btn-ghost btn-sm document-delete-btn" data-source-field="${this.escapeDocHtml(doc.sourceField || '')}" data-source-index="${doc.sourceIndex}" data-doc-name="${safeNamn}" title="Ta bort dokument" onclick="customerCardManager.deleteDocumentFromBtn(this)"><i class="fas fa-trash-alt"></i></button>`
            : '';
        return `
            <li class="document-list-item">
                <i class="fas fa-file-pdf document-list-icon"></i>
                <div class="document-list-info">
                    <span class="document-list-name">${safeNamn}</span>
                    <span class="document-list-meta">${safeBeskr ? safeBeskr + ' · ' : ''}${this.escapeDocHtml(datum)}</span>
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
                                <div id="todo-items" class="todo-items-container" style="display:none;">
                                    ${this.createTodoInputFields(0)}
                                </div>
                                <button type="button" class="btn btn-secondary btn-sm" onclick="customerCardManager.addTodoItem()">
                                    <i class="fas fa-plus"></i> + Lägg till uppgift
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
        if (todoItems && todoItems.style.display === 'none') todoItems.style.display = '';
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

        // Bygg todo-fält förifyllda (visa inte tomma kort förrän användaren väljer att lägga till)
        let todoHTML = '';
        let hasAnyTodo = false;
        for (let i = 1; i <= 8; i++) {
            const todo = fields[`ToDo${i}`] || '';
            const status = fields[`Status${i}`] || '';
            if (todo) {
                hasAnyTodo = true;
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
                                <div id="todo-items" class="todo-items-container" style="${hasAnyTodo ? '' : 'display:none;'}">${todoHTML}</div>
                                <button type="button" class="btn btn-secondary btn-sm" onclick="customerCardManager.addTodoItem()">
                                    <i class="fas fa-plus"></i> + Lägg till uppgift
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
            this._showPepResultModal(p.namn, data, idx);

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

    async entityScreeningFromBolagsverket(e) {
        try {
            if (e && e.preventDefault) e.preventDefault();
            if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
                this.showNotification('Du måste logga in.', 'error');
                return;
            }
            const kundId = this.customerId;
            if (!kundId) {
                this.showNotification('Kund-ID saknas.', 'error');
                return;
            }
            const f = this.customerData?.fields || {};
            const namn = (f['Namn'] || f['Företagsnamn'] || '').toString().trim();
            const orgnr = (f['Orgnr'] || f['Organisationsnummer'] || '').toString().trim();
            if (!namn) {
                this.showNotification('Företagsnamn saknas på kunden.', 'error');
                return;
            }

            if (typeof window.showAiThinking === 'function') window.showAiThinking('Söker företag i sanktionslistor...');

            const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';
            const response = await fetch(`${baseUrl}/api/entity-screening/${kundId}`, {
                method: 'POST',
                ...getAuthOptsKundkort(),
                body: JSON.stringify({ namn, orgnr })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const msg = response.status === 429
                    ? 'För många sökningar – vänta några minuter och försök igen.'
                    : (data.error || `HTTP ${response.status}`);
                throw new Error(msg);
            }

            this._showEntityResultModal(namn, orgnr, data);
            if (data.savedToDocs) {
                this.loadDocuments();
                this.showNotification('Entity-rapport sparad på fliken Dokumentation.', 'success');
            }
        } catch (err) {
            console.error('❌ Entity-screening fel:', err);
            this.showNotification(`Screening misslyckades: ${err.message}`, 'error');
        } finally {
            if (typeof window.hideAiThinking === 'function') window.hideAiThinking();
        }
    }

    _showEntityResultModal(namn, orgnr, data) {
        const hits = data.total_hits || 0;
        const records = data.found_records || [];

        const statusColor = hits === 0 ? '#16a34a' : '#dc2626';
        const statusIcon  = hits === 0 ? 'fa-check-circle' : 'fa-exclamation-triangle';
        const statusText  = hits === 0 ? 'Inga träffar — företaget finns ej på sanktions-/PEP-listor i snabbkontrollen' : `${hits} träff(ar) hittades`;

        const recordsHtml = records.slice(0, 5).map(r => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;margin-bottom:0.5rem;">
                <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;flex-wrap:wrap;">
                    <span style="font-weight:600;">${this._esc(r.name || '')}</span>
                    <span style="font-size:0.72rem;padding:0.15rem 0.5rem;border-radius:20px;font-weight:700;
                        background:${r.source_type === 'SANCTION' ? '#fee2e2' : r.source_type === 'PEP' ? '#fef3c7' : '#f1f5f9'};
                        color:${r.source_type === 'SANCTION' ? '#991b1b' : r.source_type === 'PEP' ? '#92400e' : '#475569'};">
                        ${r.source_type || ''}
                    </span>
                </div>
                ${r.jurisdiction?.length ? `<div style="font-size:0.78rem;color:#64748b;">${this._esc(r.jurisdiction[0])}</div>` : ''}
                ${r.sanction_details?.length ? `<div style="font-size:0.78rem;color:#64748b;">${this._esc(r.sanction_details[0])}</div>` : ''}
            </div>`).join('');

        const modalHtml = `
            <div id="entity-result-modal" style="
                position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;
                display:flex;align-items:center;justify-content:center;padding:1rem;">
                <div style="background:#fff;border-radius:12px;max-width:640px;width:100%;
                    max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                    <div style="padding:1.5rem;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.05em;">Sanktionsscreening (företag)</div>
                            <div style="font-size:1.1rem;font-weight:700;color:#1e293b;margin-top:0.2rem;">${this._esc(namn || '')}</div>
                            ${orgnr ? `<div style="font-size:0.85rem;color:#64748b;margin-top:0.15rem;">${this._esc(orgnr)}</div>` : ''}
                        </div>
                        <button onclick="document.getElementById('entity-result-modal').remove()"
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
                            <button onclick="document.getElementById('entity-result-modal').remove()"
                                style="background:#f1f5f9;color:#475569;border:none;border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;">
                                Stäng
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

        const existing = document.getElementById('entity-result-modal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    _showPepResultModal(namn, data, idx) {
        const hits = data.total_hits || 0;
        const records = data.found_records || [];
        const pepMarked = !!(this._kontaktPersoner && this._kontaktPersoner[idx] && this._kontaktPersoner[idx].pepMarkerad);

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
                        <label style="display:flex;align-items:center;gap:0.6rem;margin:0.75rem 0 0.25rem 0; padding:0.6rem 0.75rem;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;cursor:pointer;">
                            <input type="checkbox" id="pep-mark-checkbox" ${pepMarked ? 'checked' : ''} style="width:16px;height:16px;">
                            <span style="font-size:0.9rem;color:#0f172a;font-weight:600;">Markera personen som PEP/på sanktionslista</span>
                        </label>
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

        // Bind checkbox -> spara på personen i Kontaktpersoner
        const cb = document.getElementById('pep-mark-checkbox');
        if (cb) {
            cb.addEventListener('change', async () => {
                try {
                    if (!this._kontaktPersoner || !this._kontaktPersoner[idx]) return;
                    this._kontaktPersoner[idx].pepMarkerad = !!cb.checked;
                    await this._saveKontaktPersoner();
                    this._refreshRollerList();
                    this.showNotification(cb.checked ? 'Markerad som PEP/sanktionslista.' : 'Markering borttagen.', 'success');
                } catch (e) {
                    this.showNotification('Kunde inte spara markering: ' + (e.message || 'fel'), 'error');
                }
            });
        }
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

    uploadDocument(preselectedCategory) {
        this.showUploadDocumentModal(preselectedCategory);
    }

    showUploadDocumentModal(preselectedCategory) {
        const modalHTML = `
            <div id="upload-document-modal" class="modal-overlay">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3><i class="fas fa-upload"></i> Ladda upp dokument</h3>
                        <button class="modal-close" onclick="customerCardManager.closeUploadDocumentModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="upload-document-form">
                            <div class="form-group">
                                <label for="upload-doc-file">Fil *</label>
                                <input type="file" id="upload-doc-file" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" required>
                            </div>
                            <div class="form-group">
                                <label for="upload-doc-category">Kategori *</label>
                                <select id="upload-doc-category" name="category" required>
                                    <option value="riskbedomning">Dokumentation riskbedömning</option>
                                    <option value="arsredovisning">Årsredovisningar</option>
                                    <option value="uppdragsavtal">Uppdragsavtal</option>
                                    <option value="bolagsverket_skatteverket">Bolagsverket och Skatteverket</option>
                                    <option value="ovrigt">Övrigt</option>
                                </select>
                            </div>
                            <div class="form-group" id="upload-doc-custom-wrap" style="display:none;">
                                <label for="upload-doc-custom">Egen kategori (valfritt)</label>
                                <input type="text" id="upload-doc-custom" name="customCategory" placeholder="t.ex. Specifikation, Avtal 2024">
                            </div>
                            <div class="form-actions">
                                <button type="button" class="btn btn-ghost" onclick="customerCardManager.closeUploadDocumentModal()">Avbryt</button>
                                <button type="submit" class="btn btn-primary" id="upload-doc-submit">
                                    <i class="fas fa-upload"></i> Ladda upp
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>`;
        const wrap = document.createElement('div');
        wrap.innerHTML = modalHTML;
        document.body.appendChild(wrap.firstElementChild);
        const form = document.getElementById('upload-document-form');
        const catSelect = document.getElementById('upload-doc-category');
        const customWrap = document.getElementById('upload-doc-custom-wrap');
        if (catSelect && customWrap) {
            if (preselectedCategory && catSelect.querySelector(`option[value="${preselectedCategory}"]`)) {
                catSelect.value = preselectedCategory;
            }
            customWrap.style.display = catSelect.value === 'ovrigt' ? 'block' : 'none';
            catSelect.addEventListener('change', () => {
                customWrap.style.display = catSelect.value === 'ovrigt' ? 'block' : 'none';
            });
        }
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                customerCardManager.submitUploadDocument();
            });
        }
    }

    closeUploadDocumentModal() {
        const modal = document.getElementById('upload-document-modal');
        if (modal) modal.remove();
    }

    async submitUploadDocument() {
        const fileInput = document.getElementById('upload-doc-file');
        const categorySelect = document.getElementById('upload-doc-category');
        const customInput = document.getElementById('upload-doc-custom');
        const submitBtn = document.getElementById('upload-doc-submit');
        if (!fileInput?.files?.length || !categorySelect) return;
        const file = fileInput.files[0];
        const category = categorySelect.value;
        const customCategory = (customInput?.value || '').trim();
        const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Laddar upp...';
        }
        try {
            const base64 = await this.fileToBase64(file);
            const opts = getAuthOptsKundkort();
            const res = await fetch(`${baseUrl}/api/documents/upload`, {
                method: 'POST',
                ...opts,
                headers: { ...(opts.headers || {}), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: this.customerId,
                    file: base64,
                    filename: file.name,
                    category,
                    customCategory: customCategory || undefined
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
            this.showNotification('Dokument uppladdat.', 'success');
            this.closeUploadDocumentModal();
            this.loadDocuments();
        } catch (err) {
            this.showNotification('Kunde inte ladda upp: ' + (err.message || 'Okänt fel'), 'error');
        } finally {
            const btn = document.getElementById('upload-doc-submit');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-upload"></i> Ladda upp';
            }
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const match = reader.result.match(/^data:[^;]+;base64,(.+)$/);
                resolve(match ? match[1] : reader.result);
            };
            reader.onerror = () => reject(new Error('Kunde inte läsa fil'));
            reader.readAsDataURL(file);
        });
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
