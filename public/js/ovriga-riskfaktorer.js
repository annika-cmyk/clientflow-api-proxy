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
        this.pageScope = (document.body && document.body.dataset.riskPageScope) || 'ovriga';
        this.kundAntalMaps = { riskfaktorer: {}, tjanster: {}, varningsflaggor: {}, risksankande: {} };
        this.byraProfil = null;
        this.riskFactorCatalogVersion = 1;
        this._profilForslagDismissed = this.readDismissedProfilSuggestions();
        this.klarmarkeradeFlikar = { add: new Set(), edit: new Set() };
        this._activeRiskTab = { add: 'utforande', edit: 'utforande' };

        this.init();
    }

    isKundriskerPage() {
        return this.pageScope === 'kundrisker';
    }

    kundRiskTypLabel() {
        return 'Riskfaktorer kopplat till kund';
    }

    riskBelongsToPageScope(risk) {
        const typ = this.groupRiskTyp(risk);
        const kundTyp = this.kundRiskTypLabel();
        const Geo = window.GeoRiskTyper;
        const byraGeo = (Geo && Geo.TYP_BYRA) || 'Geografisk riskfaktorer - här finns byråns kunder';
        const motpartGeo = (Geo && Geo.TYP_MOTPART) || 'Geografisk riskfaktorer - här finns kundens kunder & leverantörer';
        const isCustomerGeo = typ === byraGeo || typ === motpartGeo
            || (Geo && Geo.isGeoTyp && Geo.isGeoTyp(typ));
        if (this.isKundriskerPage()) {
            // Vilka är våra kunder: kundkategorier + egen hemvist + motparters geografi
            return typ === kundTyp || isCustomerGeo;
        }
        // Övriga: byråns arbetssätt — distribution och verksamhetsspecifikt (inte kundgeo)
        return typ !== kundTyp && !isCustomerGeo;
    }

    geoRiskGroupLabel() {
        // Båda geo-typerna hör till kundsidan; etiketten används bara som fallback.
        return (window.GeoRiskTyper && GeoRiskTyper.TYP_BYRA)
            || 'Geografisk riskfaktorer - här finns byråns kunder';
    }

    geoDisplayLabel() {
        return this.geoRiskGroupLabel();
    }

    displayGroupLabel(riskType) {
        const Geo = window.GeoRiskTyper;
        const byraGeo = (Geo && Geo.TYP_BYRA) || 'Geografisk riskfaktorer - här finns byråns kunder';
        const motpartGeo = (Geo && Geo.TYP_MOTPART) || 'Geografisk riskfaktorer - här finns kundens kunder & leverantörer';
        if (riskType === byraGeo) return 'Geografisk riskfaktorer – egen hemvist';
        if (riskType === motpartGeo) return 'Geografisk riskfaktorer – motparters geografi';
        return riskType;
    }

    async migrateRenamedGeoTyp() {
        const Geo = window.GeoRiskTyper;
        const RD = window.RiskDimensioner;
        const pending = (this.risks || []).filter((risk) => {
            const fields = risk.fields || {};
            if (Geo && Geo.needsTypMigration) return Geo.needsTypMigration(fields);
            const typ = String(fields['Typ av riskfaktor'] || '').trim();
            return typ === 'Geografiska riskfaktorer';
        });
        if (!pending.length) return;
        await Promise.all(pending.map(async (risk) => {
            const fields = risk.fields || {};
            const newTyp = (Geo && Geo.targetTypForRecord)
                ? Geo.targetTypForRecord(fields)
                : ((RD && RD.normalizeTyp) ? RD.normalizeTyp(fields['Typ av riskfaktor']) : fields['Typ av riskfaktor']);
            try {
                // Minimal payload: undvik 400 från PT/TF-/motiveringskrav på full post.
                const response = await this.saveRiskFactor(
                    `${window.apiConfig.baseUrl}/api/risk-factors/${risk.id}`,
                    'PUT',
                    { 'Typ av riskfaktor': newTyp }
                );
                if (response.ok) risk.fields['Typ av riskfaktor'] = newTyp;
            } catch (err) {
                console.warn('Kunde inte byta typ på geografisk riskfaktor:', fields.Riskfaktor, err);
            }
        }));
    }

    async ensureMotpartGeoTemplates() {
        const Geo = window.GeoRiskTyper;
        const Eu = window.EuHogriskLander;
        if (!Geo || !Eu || !Array.isArray(Eu.GEO_FACTORS)) return;
        const byraId = String(this.userData?.byraId || this.userByraIds?.[0] || '').trim();
        if (!byraId) return;
        const motpartTyp = Geo.TYP_MOTPART;
        const byraRisks = (this.risks || []).filter((risk) => {
            const bid = String((risk.fields || {})['Byrå ID'] || '').trim();
            return bid === byraId;
        });
        const fold = (v) => String(v || '').trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
        for (const factor of Eu.GEO_FACTORS) {
            const exists = byraRisks.some((risk) => {
                const f = risk.fields || {};
                if (fold(f['Typ av riskfaktor']) !== fold(motpartTyp)) return false;
                const hit = Eu.matchGeoFactor(f.Riskfaktor || f['Riskfaktor'] || '');
                return !!(hit && hit.id === factor.id);
            });
            if (exists) continue;
            const source = byraRisks.find((risk) => {
                const hit = Eu.matchGeoFactor((risk.fields || {}).Riskfaktor || '');
                return !!(hit && hit.id === factor.id);
            });
            const src = (source && source.fields) || {};
            const payload = {
                'Typ av riskfaktor': motpartTyp,
                Riskfaktor: factor.label,
                Beskrivning: src.Beskrivning
                    || `Geografisk residual för var kundens kunder och leverantörer finns (${factor.label}).`,
                'Byrå ID': byraId,
                'PT/TF-relevans': src['PT/TF-relevans'] || 'TF',
                Aktuell: source ? (src.Aktuell !== false) : false
            };
            if (src.Riskpoäng) payload.Riskpoäng = src.Riskpoäng;
            if (src.Riskbedömning) payload.Riskbedömning = src.Riskbedömning;
            if (src['Åtgjärd'] || src['Åtgärd']) payload['Åtgjärd'] = src['Åtgjärd'] || src['Åtgärd'];
            if (src.motivering_inneboende_risk) payload.motivering_inneboende_risk = src.motivering_inneboende_risk;
            if (src.motivering_residual_risk) payload.motivering_residual_risk = src.motivering_residual_risk;
            if (src.Motivering) payload.Motivering = src.Motivering;
            try {
                const response = await this.saveRiskFactor(
                    `${window.apiConfig.baseUrl}/api/risk-factors`,
                    'POST',
                    payload
                );
                if (response.ok) {
                    const data = await response.json().catch(() => ({}));
                    if (data.record) this.risks.push(data.record);
                }
            } catch (err) {
                console.warn('Kunde inte skapa motparts-geofaktor:', factor.label, err);
            }
        }
    }

    /** NRA kap. 4 — terrorfinansiering som kundriskfaktor (inte separat NRA-checklista). */
    async ensureTerrorfinansieringTemplate() {
        const Kat = window.OvrigaRiskKategorier;
        if (!Kat || !Kat.findFactor) return;
        const factor = Kat.findFactor('Kunder med terrorfinansieringsrisk (ideell/insamling/internationell överföring)')
            || (Kat.FACTORS || []).find((f) => f && f.id === 'terrorfinansiering');
        if (!factor) return;
        const byraId = String(this.userData?.byraId || this.userByraIds?.[0] || '').trim();
        if (!byraId) return;
        const kundTyp = 'Riskfaktorer kopplat till kund';
        const fold = (v) => String(v || '').trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
        const byraRisks = (this.risks || []).filter((risk) => {
            const bid = String((risk.fields || {})['Byrå ID'] || '').trim();
            return bid === byraId;
        });
        const exists = byraRisks.some((risk) => {
            const f = risk.fields || {};
            if (fold(f['Typ av riskfaktor']) !== fold(kundTyp)) return false;
            const hit = Kat.findFactor(f.Riskfaktor || '');
            return !!(hit && hit.id === 'terrorfinansiering');
        });
        if (exists) return;
        const payload = {
            'Typ av riskfaktor': kundTyp,
            Riskfaktor: factor.label,
            Beskrivning: factor.hint
                || 'Ideella föreningar, insamlingsorganisationer eller internationella överföringar utan tydlig affärsmässig motprestation (NRA kap. 4).',
            'Byrå ID': byraId,
            'PT/TF-relevans': 'TF',
            Aktuell: false
        };
        try {
            const response = await this.saveRiskFactor(
                `${window.apiConfig.baseUrl}/api/risk-factors`,
                'POST',
                payload
            );
            if (response.ok) {
                const data = await response.json().catch(() => ({}));
                if (data.record) this.risks.push(data.record);
            }
        } catch (err) {
            console.warn('Kunde inte skapa terrorfinansieringsfaktor:', factor.label, err);
        }
    }

    async init() {
        await this.loadDatasourceConfig();
        await this.loadUserData();
        this.setupEventListeners();
        this.setupRoleBasedUI();
        await Promise.all([
            this.loadByraProfilForKaskad(),
            this.loadRiskFactorCatalogVersion()
        ]);
        await this.loadRiskFactors();
        await this.loadKundantal();
        
        // Apply initial filtering based on user role
        this.applyFilters();
        this.bindMotiveringProposeButtons();
        this.renderByraProfilKaskad();
        if (document.getElementById('riskhoj-katalog-list')) {
            this.setupRiskhojandeKatalog();
        }
        if (document.getElementById('risksank-katalog-list')) {
            this.setupRisksankandeKatalog();
        }
    }

    readDismissedProfilSuggestions() {
        try {
            const raw = sessionStorage.getItem('byraProfilRiskForslagDismissed');
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr.map(String) : [];
        } catch (_) {
            return [];
        }
    }

    persistDismissedProfilSuggestions() {
        try {
            sessionStorage.setItem(
                'byraProfilRiskForslagDismissed',
                JSON.stringify(this._profilForslagDismissed || [])
            );
        } catch (_) { /* ignore */ }
    }

    async loadByraProfilForKaskad() {
        if (this.isKundriskerPage()) return;
        this.byraProfil = null;
        try {
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/byra/info`);
            if (!res.ok) return;
            const data = await res.json();
            this.byraProfil = data.fields || data || {};
        } catch (err) {
            console.warn('Kunde inte ladda byråprofil för kaskad:', err);
        }
    }

    async loadRiskFactorCatalogVersion() {
        if (this.isKundriskerPage()) return;
        try {
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/byra-resa`);
            if (!res.ok) return;
            const data = await res.json();
            const v = Number(data?.state?.riskFactorCatalogVersion);
            this.riskFactorCatalogVersion = (Number.isFinite(v) && v >= 1) ? Math.floor(v) : 1;
        } catch (err) {
            console.warn('Kunde inte ladda riskfaktorkatalogversion:', err);
        }
    }

    renderCatalogVersion() {
        const wrap = document.getElementById('byra-profil-katalogversion');
        const nr = document.getElementById('byra-profil-katalogversion-nr');
        if (!wrap || !nr) return;
        const v = (Number.isFinite(this.riskFactorCatalogVersion) && this.riskFactorCatalogVersion >= 1)
            ? Math.floor(this.riskFactorCatalogVersion)
            : 1;
        nr.textContent = String(v);
        wrap.hidden = false;
    }


    /** Läs S/K-motivering från DOM och synka dold kombinerad textarea. */
    readSplitMotiveringFromDom(prefix = '') {
        const RM = window.RiskMotivering;
        const baseIn = `${prefix}motivering-inneboende`;
        const baseRes = `${prefix}motivering-residual`;
        const val = (id) => document.getElementById(id)?.value.trim() || '';
        let poang = {
            motivering_sannolikhet_inneboende: val(`${baseIn}-s`),
            motivering_konsekvens_inneboende: val(`${baseIn}-k`),
            motivering_sannolikhet_residual: val(`${baseRes}-s`),
            motivering_konsekvens_residual: val(`${baseRes}-k`),
            legacy_motivering_inneboende: val(`${baseIn}-legacy`),
            legacy_motivering_residual: val(`${baseRes}-legacy`),
            motivering_inneboende_risk: val(baseIn),
            motivering_residual_risk: val(baseRes)
        };
        if (RM && RM.applyLegacyMigration) poang = RM.applyLegacyMigration(poang);
        if (RM && RM.syncCombinedFromSplit) poang = RM.syncCombinedFromSplit(poang);
        const inEl = document.getElementById(baseIn);
        const resEl = document.getElementById(baseRes);
        if (inEl) inEl.value = poang.motivering_inneboende_risk || '';
        if (resEl) resEl.value = poang.motivering_residual_risk || '';
        return poang;
    }

    fillSplitMotiveringToDom(prefix, scored = {}) {
        const RM = window.RiskMotivering;
        const migrated = RM && RM.applyLegacyMigration ? RM.applyLegacyMigration(scored) : scored;
        const baseIn = `${prefix}motivering-inneboende`;
        const baseRes = `${prefix}motivering-residual`;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        const showLegacy = (base, text) => {
            const wrap = document.getElementById(`${base}-legacy-wrap`);
            const ta = document.getElementById(`${base}-legacy`);
            if (ta) ta.value = text || '';
            if (wrap) wrap.hidden = !text;
        };
        let sIn = migrated.motivering_sannolikhet_inneboende || '';
        let kIn = migrated.motivering_konsekvens_inneboende || '';
        let sRes = migrated.motivering_sannolikhet_residual || '';
        let kRes = migrated.motivering_konsekvens_residual || '';
        const legacyIn = migrated.legacy_motivering_inneboende || '';
        const legacyRes = migrated.legacy_motivering_residual || '';
        if (!sIn && !kIn && legacyIn && RM && RM.proposeSplitFromLegacy) {
            const p = RM.proposeSplitFromLegacy(legacyIn);
            sIn = p.sannolikhet || '';
            kIn = p.konsekvens || '';
        }
        if (!sRes && !kRes && legacyRes && RM && RM.proposeSplitFromLegacy) {
            const p = RM.proposeSplitFromLegacy(legacyRes);
            sRes = p.sannolikhet || '';
            kRes = p.konsekvens || '';
        }
        // Om bara kombinerad text finns (ännu ej migrerad i lagring), visa som legacy + förslag
        if (!sIn && !kIn && !legacyIn && migrated.motivering_inneboende_risk && RM && RM.proposeSplitFromLegacy) {
            showLegacy(baseIn, migrated.motivering_inneboende_risk);
            const p = RM.proposeSplitFromLegacy(migrated.motivering_inneboende_risk);
            sIn = p.sannolikhet || '';
            kIn = p.konsekvens || '';
        } else {
            showLegacy(baseIn, legacyIn);
        }
        if (!sRes && !kRes && !legacyRes && migrated.motivering_residual_risk && RM && RM.proposeSplitFromLegacy) {
            showLegacy(baseRes, migrated.motivering_residual_risk);
            const p = RM.proposeSplitFromLegacy(migrated.motivering_residual_risk);
            sRes = p.sannolikhet || '';
            kRes = p.konsekvens || '';
        } else {
            showLegacy(baseRes, legacyRes);
        }
        set(`${baseIn}-s`, sIn);
        set(`${baseIn}-k`, kIn);
        set(`${baseRes}-s`, sRes);
        set(`${baseRes}-k`, kRes);
        set(baseIn, migrated.motivering_inneboende_risk || '');
        set(baseRes, migrated.motivering_residual_risk || '');
    }

    bindMotiveringProposeButtons(root = document) {
        root.querySelectorAll('[data-propose-split]').forEach((btn) => {
            if (btn.dataset.boundPropose) return;
            btn.dataset.boundPropose = '1';
            btn.addEventListener('click', () => {
                const base = btn.getAttribute('data-propose-split');
                const RM = window.RiskMotivering;
                const legacy = document.getElementById(`${base}-legacy`)?.value || '';
                if (!RM || !legacy) return;
                const p = RM.proposeSplitFromLegacy(legacy);
                const sEl = document.getElementById(`${base}-s`);
                const kEl = document.getElementById(`${base}-k`);
                if (sEl && !sEl.value.trim()) sEl.value = p.sannolikhet || '';
                if (kEl && !kEl.value.trim()) kEl.value = p.konsekvens || '';
            });
        });
    }

    renderByraProfilKaskad() {
        const root = document.getElementById('byra-profil-kaskad');
        if (!root || this.isKundriskerPage()) return;
        const API = window.ByraProfilRiskForslag;
        if (!API) {
            root.hidden = true;
            return;
        }
        root.hidden = false;
        this.renderCatalogVersion();
        const chips = document.getElementById('byra-profil-kaskad-chips');
        const forslagHost = document.getElementById('byra-profil-kaskad-forslag');
        const forslagWrap = document.getElementById('byra-profil-kaskad-forslag-wrap');
        const empty = document.getElementById('byra-profil-kaskad-empty');
        const summary = API.buildProfilSummary(this.byraProfil || {});
        const answered = summary.filter((r) => r.answered);
        if (chips) {
            chips.innerHTML = summary.map((row) => {
                const val = row.answered ? this.esc(row.value) : '–';
                const cls = row.answered ? '' : ' is-empty';
                return `<span class="byra-profil-chip${cls}" title="${this.esc(row.label)}"><span class="byra-profil-chip-label">${this.esc(row.label)}</span><span class="byra-profil-chip-value">${val}</span></span>`;
            }).join('');
        }
        const open = API.filterOpenSuggestions(
            API.suggestFromProfil(this.byraProfil || {}),
            this.risks || [],
            this._profilForslagDismissed || []
        );
        if (forslagWrap) forslagWrap.hidden = open.length === 0;
        if (empty) empty.hidden = answered.length > 0 || open.length > 0;
        if (forslagHost) {
            forslagHost.innerHTML = open.map((s) => `
                <article class="byra-profil-forslag-card" data-forslag-id="${this.esc(s.id)}">
                    <div class="byra-profil-forslag-main">
                        <h4>${this.esc(s.riskfaktor)}</h4>
                        <p class="byra-profil-forslag-meta">${this.esc(s.typ)} · ${this.esc(s.triggerLabel || '')}</p>
                        <p class="byra-profil-forslag-why">${this.esc(s.why || '')}</p>
                    </div>
                    <div class="byra-profil-forslag-actions">
                        <button type="button" class="btn btn-primary btn-sm" data-profil-accept="${this.esc(s.id)}">Acceptera</button>
                        <button type="button" class="btn btn-ghost btn-sm" data-profil-dismiss="${this.esc(s.id)}">Avfärda</button>
                    </div>
                </article>
            `).join('');
            forslagHost.querySelectorAll('[data-profil-accept]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-profil-accept');
                    const row = open.find((s) => s.id === id);
                    if (row) this.acceptProfilSuggestion(row);
                });
            });
            forslagHost.querySelectorAll('[data-profil-dismiss]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-profil-dismiss');
                    this.dismissProfilSuggestion(id);
                });
            });
        }
    }

    dismissProfilSuggestion(id) {
        if (!id) return;
        const list = Array.isArray(this._profilForslagDismissed) ? this._profilForslagDismissed.slice() : [];
        if (!list.includes(id)) list.push(id);
        this._profilForslagDismissed = list;
        this.persistDismissedProfilSuggestions();
        this.renderByraProfilKaskad();
    }

    acceptProfilSuggestion(suggestion) {
        if (!suggestion) return;
        this.openAddModal({
            typ: suggestion.typ,
            riskfaktor: suggestion.riskfaktor,
            beskrivning: suggestion.beskrivning || '',
            ptTf: suggestion.ptTf || ''
        });
    }

    setSelectValue(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        const wanted = String(value || '');
        if ([...el.options].some((o) => o.value === wanted)) {
            el.value = wanted;
        } else {
            el.value = '';
        }
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

    kundAntalFor(type, key) {
        const map = (this.kundAntalMaps && this.kundAntalMaps[type]) || {};
        if (type === 'riskfaktorer' || type === 'tjanster') {
            return map[key] || 0;
        }
        if (map[key] != null) return map[key];
        const KP = window.KundRiskprofil;
        const canon = KP && KP.canonicalRiskhojandeLabel
            ? KP.canonicalRiskhojandeLabel(key)
            : key;
        return map[canon] || 0;
    }

    renderKundCountBadge(n) {
        const num = Number(n) || 0;
        const label = num === 1 ? '1 kund' : `${num} kunder`;
        return `<span class="risk-kund-count" title="Antal aktiva kunder med detta val">${label}</span>`;
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

        this.bindRiskTabs();
        this.bindRiskDynLists();
        this.bindRiskKlarmarkering();

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
        ['motivering-inneboende', 'motivering-residual', 'motivering-inneboende-s', 'motivering-inneboende-k', 'motivering-residual-s', 'motivering-residual-k', 'edit-motivering-inneboende-s', 'edit-motivering-inneboende-k', 'edit-motivering-residual-s', 'edit-motivering-residual-k'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', () => this.updateMotiveringWarnings('add'));
            document.getElementById(`edit-${id}`)?.addEventListener('input', () => this.updateMotiveringWarnings('edit'));
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

    groupRiskTyp(risk) {
        const fields = risk && risk.fields ? risk.fields : {};
        const namn = fields.Riskfaktor || fields['Riskfaktor'] || '';
        const Kat = window.OvrigaRiskKategorier;
        const normalized = Kat && Kat.airtableTypForLinkedKundResidual
            ? Kat.airtableTypForLinkedKundResidual(namn)
            : '';
        const raw = normalized || fields['Typ av riskfaktor'] || 'Övriga riskfaktorer';
        const Geo = window.GeoRiskTyper;
        // Geo: gruppera efter namnklassning så byrå/motpart skiljs innan Airtable-migrering hunnit klart
        if (Geo && Geo.isGeoTyp && Geo.isGeoTyp(raw) && Geo.effectiveTyp) {
            return Geo.effectiveTyp(fields);
        }
        const RD = window.RiskDimensioner;
        return RD && RD.normalizeTyp ? RD.normalizeTyp(raw) : raw;
    }

    async migrateRenamedRiskFactorLabels() {
        const Kat = window.OvrigaRiskKategorier;
        if (!Kat || !Kat.canonicalLabel) return;
        const pending = (this.risks || []).filter((risk) => {
            const fields = risk.fields || {};
            const namn = fields.Riskfaktor || fields['Riskfaktor'] || '';
            const canonical = Kat.canonicalLabel(namn);
            return canonical && canonical !== namn;
        });
        if (!pending.length) return;
        await Promise.all(pending.map(async (risk) => {
            const fields = risk.fields || {};
            const namn = fields.Riskfaktor || fields['Riskfaktor'] || '';
            const canonical = Kat.canonicalLabel(namn);
            try {
                const response = await this.saveRiskFactor(
                    `${window.apiConfig.baseUrl}/api/risk-factors/${risk.id}`,
                    'PUT',
                    { Riskfaktor: canonical }
                );
                if (response.ok) risk.fields.Riskfaktor = canonical;
            } catch (err) {
                console.warn('Kunde inte byta namn på riskfaktor:', namn, err);
            }
        }));
    }

    async migrateMisplacedKundTransactionFactors() {
        const Kat = window.OvrigaRiskKategorier;
        if (!Kat || !Kat.airtableTypForLinkedKundResidual) return;
        const pending = (this.risks || []).filter((risk) => {
            const fields = risk.fields || {};
            const namn = fields.Riskfaktor || fields['Riskfaktor'] || '';
            const want = Kat.airtableTypForLinkedKundResidual(namn);
            return want && fields['Typ av riskfaktor'] !== want;
        });
        if (!pending.length) return;
        await Promise.all(pending.map(async (risk) => {
            const fields = risk.fields || {};
            const namn = fields.Riskfaktor || fields['Riskfaktor'] || '';
            const want = Kat.airtableTypForLinkedKundResidual(namn);
            try {
                const response = await this.saveRiskFactor(
                    `${window.apiConfig.baseUrl}/api/risk-factors/${risk.id}`,
                    'PUT',
                    { 'Typ av riskfaktor': want }
                );
                if (response.ok) risk.fields['Typ av riskfaktor'] = want;
            } catch (err) {
                console.warn('Kunde inte flytta riskfaktor till kund:', namn, err);
            }
        }));
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
                await this.migrateRenamedRiskFactorLabels();
                await this.migrateMisplacedKundTransactionFactors();
                await this.migrateRenamedGeoTyp();
                await this.ensureMotpartGeoTemplates();
                if (this.isKundriskerPage()) {
                    await this.ensureTerrorfinansieringTemplate();
                }
                
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

        // Group risks by normalized "Typ av riskfaktor"
        const groupedRisks = {};
        this.filteredRisks.forEach(risk => {
            const riskType = this.groupRiskTyp(risk);
            if (!groupedRisks[riskType]) {
                groupedRisks[riskType] = [];
            }
            groupedRisks[riskType].push(risk);
        });

        const RD = window.RiskDimensioner;
        const order = RD && RD.DIMENSIONS
            ? RD.DIMENSIONS.map((dim) => dim.label)
            : [this.kundRiskTypLabel(), 'Distrubutionskanaler - såhär möter vi våra kunder', 'Verksamhetsspecifika riskfaktorer'];
        const groupKeys = Object.keys(groupedRisks).sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            const ai = ia === -1 ? 50 : ia;
            const bi = ib === -1 ? 50 : ib;
            return ai - bi || a.localeCompare(b, 'sv');
        });

        const buildRiskItems = (risksInGroup) => {
            const sorted = risksInGroup.slice().sort((a, b) => {
                const sa = this.scoredRisk(a.fields);
                const sb = this.scoredRisk(b.fields);
                const S = window.RiskSkala;
                if (!S) return 0;
                const ra = Math.max(S.riskRank(sa.level), S.riskRank(sa.residualLevel));
                const rb = Math.max(S.riskRank(sb.level), S.riskRank(sb.residualLevel));
                return rb - ra;
            });
            return sorted.map(risk => this.createRiskItem(risk)).join('');
        };

        const Geo = window.GeoRiskTyper;
        const groupHTML = groupKeys.map(riskType => {
            const risksInGroup = groupedRisks[riskType];
            const riskItems = buildRiskItems(risksInGroup);
            const isGeo = !!(Geo && Geo.isGeoTyp && Geo.isGeoTyp(riskType));

            return `
                <div class="risk-group${isGeo ? ' risk-group--geografiska' : ''}">
                    <div class="risk-group-header">
                        <h3>${this.esc(this.displayGroupLabel(riskType))}</h3>
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
        this.updateMotiveringWarnings(mode);
        return { inherent, residual };
    }

    updateMotiveringWarnings(mode) {
        const RM = window.RiskMotivering;
        if (!RM) return;
        const prefix = mode === 'edit' ? 'edit-' : '';
        const poang = {
            sannolikhet: document.getElementById(`${prefix}sannolikhet`)?.value,
            konsekvens: document.getElementById(`${prefix}konsekvens`)?.value,
            sannolikhetEfter: document.getElementById(`${prefix}sannolikhet-efter`)?.value,
            konsekvensEfter: document.getElementById(`${prefix}konsekvens-efter`)?.value,
            ...this.readSplitMotiveringFromDom(prefix)
        };
        const status = RM.assessMotivering(poang);
        const warnPrefix = mode === 'edit' ? 'edit-' : 'add-';
        const setWarn = (suffix, show) => {
            const el = document.getElementById(`${warnPrefix}motivering-${suffix}-warn`);
            if (el) el.hidden = !show;
        };
        setWarn('inneboende', status.inneboendeNeedsMotivering && !status.inneboendeOk);
        setWarn('residual', (status.residualNeedsMotivering && !status.residualOk)
            || (status.residualNeedsDecision && !status.residualDecisionOk));
    }

    requirePtTf(raw) {
        const pt = (window.RiskSkala && RiskSkala.normalizePtTf(raw)) || String(raw || '').trim();
        if (!pt) {
            throw new Error('PT/TF-relevans är obligatorisk. Välj PT, TF eller Båda.');
        }
        return pt;
    }

    /**
     * Läs fält från DOM (inte FormData). Namnfältet ligger i modal-head utanför <form>,
     * så FormData missar Riskfaktor — samma mönster som tjänsteanalysen (getElementById).
     */
    readRiskFieldValue(mode, baseId) {
        const prefix = mode === 'edit' ? 'edit-' : '';
        const el = document.getElementById(`${prefix}${baseId}`);
        return el ? String(el.value || '').trim() : '';
    }

    collectRiskPayload(formData, mode = 'add') {
        const prefix = mode === 'edit' ? 'edit-' : '';
        const listPrefix = mode === 'edit' ? 'edit-' : 'add-';
        const klar = this.klarmarkeradeFlikar[mode] || new Set();
        const poang = {
            sannolikhet: this.readRiskFieldValue(mode, 'sannolikhet') || formData?.get?.('sannolikhet'),
            konsekvens: this.readRiskFieldValue(mode, 'konsekvens') || formData?.get?.('konsekvens'),
            sannolikhetEfter: this.readRiskFieldValue(mode, 'sannolikhet-efter') || formData?.get?.('sannolikhet-efter'),
            konsekvensEfter: this.readRiskFieldValue(mode, 'konsekvens-efter') || formData?.get?.('konsekvens-efter'),
            ...this.readSplitMotiveringFromDom(prefix),
            kraverManualOversyn: this.editNeedsReview === true,
            klarmarkeradeFlikar: [...klar]
        };
        const inherent = (window.RiskSkala && RiskSkala.assessRisk(poang.sannolikhet, poang.konsekvens)) || {};
        const underlagId = mode === 'edit' ? 'edit-risk-ai-extra-underlag' : 'risk-ai-extra-underlag';
        // Beskrivning/namn: alltid från DOM. Ingen client-side blockering på ord som
        // «byrån»/«kontroller» — hjälptexten är vägledning, inte sparspärr.
        return {
            'Typ av riskfaktor': this.readRiskFieldValue(mode, 'risk-type') || formData?.get?.('risk-type') || '',
            'Riskfaktor': this.readRiskFieldValue(mode, 'risk-factor') || formData?.get?.('risk-factor') || '',
            'Beskrivning': this.readRiskFieldValue(mode, 'description') || formData?.get?.('description') || '',
            'Åtgjärd': this.readRiskFieldValue(mode, 'action') || formData?.get?.('action') || '',
            'Hot': JSON.stringify(this.collectHot(listPrefix)),
            'Sårbarheter': JSON.stringify(this.collectSarbarhet(listPrefix)),
            'AI-extra underlag': (document.getElementById(underlagId)?.value || '').trim(),
            'Riskbedömning': inherent.level || '',
            'Riskpoäng': (window.RiskSkala && RiskSkala.serializeRiskPoang(poang)) || JSON.stringify(poang),
            'PT/TF-relevans': this.requirePtTf(
                this.readRiskFieldValue(mode, 'pt-tf') || formData?.get?.('pt-tf')
            )
        };
    }
    validateMotiveringBeforeSave(poang) {
        const RM = window.RiskMotivering;
        if (!RM) return { ok: true };
        const check = RM.validatePoangMotivering(poang, { asDraft: false });
        if (check.ok) return check;
        const first = check.errors[0] || {};
        this.showNotification(first.error || 'Motivering krävs.', 'error');
        return check;
    }

    /**
     * Validera obligatoriska fält i Din resa-modalen och växla till rätt flik.
     * Native HTML5-validering på hidden-paneler ger ofta ingen synlig feedback.
     * Åtgärd krävs inte vid Spara — den fylls i under Riskreducerande åtgärder /
     * Klarmarkera, så Beskrivning ska kunna sparas utan att hela resan är klar.
     */
    validateRiskFormBeforeSave(mode = 'add') {
        const isEdit = mode === 'edit';
        const modalId = isEdit ? 'edit-risk-modal' : 'add-risk-modal';
        const id = (base) => (isEdit ? `edit-${base}` : base);
        const checks = [
            // Namn ligger i modal-head (utanför form) — läs via id, inte FormData.
            { elId: id('risk-factor'), tab: 'oversikt', label: 'Riskfaktor', focusTab: null },
            { elId: id('risk-type'), tab: 'oversikt', label: 'Typ av riskfaktor' },
            { elId: id('pt-tf'), tab: 'oversikt', label: 'PT/TF-relevans' },
            { elId: id('description'), tab: 'oversikt', label: 'Beskrivning' }
        ];
        for (const check of checks) {
            const el = document.getElementById(check.elId);
            const value = el ? String(el.value || '').trim() : '';
            if (value) continue;
            if (check.tab) this.setRiskTab(modalId, check.tab);
            if (el && typeof el.focus === 'function') {
                try { el.focus({ preventScroll: false }); } catch (_) { el.focus(); }
            }
            this.showNotification(
                `${check.label} saknas. Fyll i fliken och spara igen — annars sparas inte analysen.`,
                'error'
            );
            return { ok: false, field: check.elId, tab: check.tab };
        }
        return { ok: true };
    }

    clearListFiltersThatHideAktuell() {
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter && statusFilter.value === 'unchecked') {
            statusFilter.value = '';
        }
        const riskFilter = document.getElementById('risk-filter');
        if (riskFilter) riskFilter.value = '';
    }

    refreshKundriskerEnkatAfterSave() {
        const API = window.KundriskerEnkatSammanfattning;
        if (API && typeof API.refresh === 'function') {
            try { API.refresh(); } catch (err) {
                console.warn('Kunde inte uppdatera Från byråprofilen efter sparning:', err);
            }
        }
    }

    /**
     * Efter lyckad sparning: visa kortet under Kundkategorier och geografi.
     */
    revealSavedRisk(recordId, riskName) {
        this.clearListFiltersThatHideAktuell();
        this.applyFilters();
        const listSection = document.querySelector('.risk-assessment-section')
            || document.getElementById('risk-list');
        let card = recordId
            ? document.querySelector(`.risk-item[data-record-id="${recordId}"]`)
            : null;
        if (!card && riskName) {
            const fold = (v) => String(v || '').trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
            const want = fold(riskName);
            card = [...document.querySelectorAll('.risk-item')].find((el) => {
                const title = el.querySelector('.risk-task-name');
                return title && fold(title.textContent).indexOf(want) === 0;
            }) || null;
        }
        const target = card || listSection;
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (card) {
            card.classList.add('risk-item--just-saved');
            if (!card.classList.contains('expanded')) {
                const header = card.querySelector('.risk-item-header');
                if (header) {
                    try { this.toggleRiskItem(header); } catch (_) { /* ignore */ }
                }
            }
            setTimeout(() => card.classList.remove('risk-item--just-saved'), 6000);
        }
        this.refreshKundriskerEnkatAfterSave();
    }

    createRiskItem(risk) {
        const scored = this.scoredRisk(risk.fields);
        const riskLevel = scored.level || 'Normal';
        const riskLevelClass = this.getRiskLevelClass(riskLevel);
        const residualLevel = scored.residualLevel || '';
        const residualClass = residualLevel ? this.getRiskLevelClass(residualLevel) : '';
        const rowRiskClass = (window.RiskSkala && RiskSkala.dominantRiskItemClass)
            ? RiskSkala.dominantRiskItemClass(riskLevel, residualLevel)
            : riskLevelClass;
        const badges = (window.RiskSkala && RiskSkala.listBadgeLabels(scored)) || {
            inneboende: scored.badge || riskLevel,
            residual: residualLevel ? ('Residualrisk: ' + (scored.residualBadge || residualLevel)) : '',
            inneboendeTitle: '',
            residualTitle: ''
        };
        const isChecked = risk.fields['Aktuell'] === true;
        const riskType = risk.fields['Typ av riskfaktor'] || 'Namnlös riskfaktor';
        const riskFactor = String(risk.fields['Riskfaktor'] || '').trim();
        const hasName = !!riskFactor;
        const titleHtml = hasName
            ? this.esc(riskFactor)
            : '<em class="risk-task-name-missing">Namnlös riskfaktor</em>';
        const motStatus = (window.RiskMotivering && RiskMotivering.assessMotivering(scored)) || { complete: true };
        const motWarn = (!motStatus.complete && isChecked)
            ? '<span class="risk-motivering-warn risk-motivering-warn--list" title="Motivering saknas eller är för kort">✗</span>'
            : (scored.kraver_uppdaterad_motivering
                ? '<span class="risk-motivering-warn risk-motivering-warn--list risk-motivering-warn--flag" title="Kräver uppdaterad motivering">!</span>'
                : '');
        const approvalDate = risk.fields['Riskbedömning godkänd datum'] || '';
        const tfTag = (window.RiskSkala && RiskSkala.isTfRelevant(scored.ptTfRelevans))
            ? '<span class="pt-tf-tag">TF</span>'
            : '';
        const nameSectionHtml = hasName
            ? `${this.esc(riskFactor).replace(/\n/g, '<br>')}${scored.ptTfRelevans ? ` · ${this.esc(scored.ptTfRelevans)}` : ''}`
            : `<em>Namn saknas</em>${scored.ptTfRelevans ? ` · ${this.esc(scored.ptTfRelevans)}` : ''} — öppna <strong>Byt namn</strong> i menyn eller <strong>Redigera</strong> för att sätta namnet.`;
        
        return `
            <div class="risk-item ${rowRiskClass} ${isChecked ? '' : 'inactive'}${hasName ? '' : ' risk-item--missing-name'}" data-record-id="${risk.id}">
                <div class="risk-item-header" onclick="riskManager.toggleRiskItem(this)">
                    <div class="risk-item-title">
                        <div class="risk-status-indicator ${isChecked ? 'checked' : 'unchecked'}">
                            ${isChecked ? '✓' : '○'}
                        </div>
                        <div class="risk-item-info">
                            <h4 class="risk-task-name">${titleHtml} ${tfTag} ${motWarn}</h4>
                            <div class="risk-meta-info">
                                <span class="risk-level-badge ${riskLevelClass}" title="${this.esc(badges.inneboendeTitle)}">${this.esc(badges.inneboende)}</span>
                                ${badges.residual ? `<span class="risk-level-badge ${residualClass}" title="${this.esc(badges.residualTitle)}">${this.esc(badges.residual)}</span>` : ''}
                                ${this.renderKundCountBadge(this.kundAntalFor('riskfaktorer', risk.id))}
                                ${approvalDate ? `<span>Godkänd: ${approvalDate}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="risk-item-actions">
                        <div class="risk-row-menu">
                            <button type="button" class="risk-row-menu-btn" data-risk-menu-toggle aria-haspopup="true" aria-expanded="false" aria-label="Fler åtgärder" onclick="event.stopPropagation()">
                                <i class="fas fa-ellipsis" aria-hidden="true"></i>
                            </button>
                            <div class="risk-row-menu-panel" hidden role="menu">
                                <button type="button" class="risk-row-menu-item rename-risk" role="menuitem" data-record-id="${risk.id}" onclick="event.stopPropagation()">
                                    <i class="fas fa-pen" aria-hidden="true"></i>
                                    Byt namn
                                </button>
                                <button type="button" class="risk-row-menu-item is-danger delete-risk" role="menuitem" data-record-id="${risk.id}" onclick="event.stopPropagation()">
                                    <i class="fas fa-trash" aria-hidden="true"></i>
                                    Ta bort
                                </button>
                            </div>
                        </div>
                        <button class="expand-toggle" onclick="event.stopPropagation(); riskManager.toggleRiskItem(this.closest('.risk-item-header'))">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                </div>
                
                <div class="risk-item-content">
                    <div class="risk-content-section">
                        <h5><i class="fas fa-exclamation-triangle"></i> Riskfaktor</h5>
                        <p class="risk-content-text">
                            ${nameSectionHtml}
                        </p>
                    </div>
                    
                    <div class="risk-content-section">
                        <h5><i class="fas fa-file-lines"></i> Riskfaktorn</h5>
                        <p class="risk-content-text">
                            ${this.formatDescription(risk.fields['Beskrivning'] || '')}
                        </p>
                    </div>

                    ${this.renderMotiveringSections(scored, { keys: ['inneboende'] })}
                    
                    <div class="risk-content-section">
                        <h5><i class="fas fa-list-check"></i> Hur hanteras risken?</h5>
                        <p class="risk-content-text">
                            ${this.formatDescription(risk.fields['Åtgjärd'] || risk.fields['Åtgärd'] || '')}
                        </p>
                    </div>

                    ${this.renderMotiveringSections(scored, { keys: ['residual'] })}
                    
                    <div class="risk-item-footer">
                        <button class="btn btn-secondary btn-sm edit-risk" data-record-id="${risk.id}">
                            <i class="fas fa-edit"></i>
                            Redigera
                        </button>
                        <button class="btn ${isChecked ? 'btn-secondary' : 'btn-success'} btn-sm mark-complete" data-record-id="${risk.id}">
                            <i class="fas fa-${isChecked ? 'eye-slash' : 'check'}"></i>
                            ${isChecked ? 'Inaktivera' : 'Aktivera'}
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

    renderMotiveringSection(part) {
        if (!part || !part.text) return '';
        const icon = part.key === 'residual' ? 'fa-shield-halved' : 'fa-scale-balanced';
        return `
            <div class="risk-content-section">
                <h5><i class="fas ${icon}"></i> ${this.esc(part.title)}</h5>
                <p class="risk-content-text">${this.esc(part.text).replace(/\n/g, '<br>')}</p>
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

        // Rename via ⋯-menu — öppnar samma modal med fokus på namnfältet
        document.querySelectorAll('.rename-risk').forEach(button => {
            button.addEventListener('click', (e) => {
                const recordId = e.target.closest('.rename-risk').dataset.recordId;
                this.closeAllRiskRowMenus();
                this.openEditModal(recordId, { focusName: true });
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

        this.setupRiskRowMenus(document.getElementById('risk-list'));
    }

    setupRiskRowMenus(root) {
        if (!root) return;
        root.querySelectorAll('[data-risk-menu-toggle]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const menu = btn.closest('.risk-row-menu');
                if (!menu) return;
                const open = !menu.classList.contains('is-open');
                this.closeAllRiskRowMenus();
                if (open) {
                    menu.classList.add('is-open');
                    const panel = menu.querySelector('.risk-row-menu-panel');
                    if (panel) panel.hidden = false;
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });
        if (!this._riskRowMenuDocBound) {
            this._riskRowMenuDocBound = true;
            document.addEventListener('click', (e) => {
                if (e.target.closest && e.target.closest('.risk-row-menu')) return;
                this.closeAllRiskRowMenus();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.closeAllRiskRowMenus();
            });
        }
    }

    closeAllRiskRowMenus() {
        document.querySelectorAll('.risk-row-menu.is-open').forEach((menu) => {
            menu.classList.remove('is-open');
            const panel = menu.querySelector('.risk-row-menu-panel');
            if (panel) panel.hidden = true;
            const btn = menu.querySelector('[data-risk-menu-toggle]');
            if (btn) btn.setAttribute('aria-expanded', 'false');
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

            if (!this.riskBelongsToPageScope(risk)) {
                return false;
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

    applyOvrigAiMotivering(prefix, data, { onlyEmpty = false, existing = {} } = {}) {
        const Ai = window.AiFaltGranskning;
        const motIn = data.motiveringInneboende || data.motivering_inneboende_risk || '';
        const motRes = data.motiveringResidual || data.motivering_residual_risk || '';
        const emptyIn = !onlyEmpty || !(Ai && Ai.isFilledText(existing.motiveringInneboende || existing.motivering_inneboende_risk));
        const emptyRes = !onlyEmpty || !(Ai && Ai.isFilledText(existing.motiveringResidual || existing.motivering_residual_risk));
        const inEl = document.getElementById(`${prefix}motivering-inneboende`);
        const resEl = document.getElementById(`${prefix}motivering-residual`);
        if (emptyIn && motIn && inEl) inEl.value = motIn;
        if (emptyRes && motRes && resEl) resEl.value = motRes;
    }


    currentModalRiskLevel(prefix = '') {
        const RS = window.RiskSkala;
        if (!RS || !RS.assessRisk) return '';
        const s = Number(document.getElementById(`${prefix}sannolikhet-efter`)?.value
            || document.getElementById(`${prefix}sannolikhet`)?.value);
        const k = Number(document.getElementById(`${prefix}konsekvens-efter`)?.value
            || document.getElementById(`${prefix}konsekvens`)?.value);
        return (RS.assessRisk(s, k) || {}).level || '';
    }

    gateAiAccept(aiOriginalText, currentText, tillagg = '', prefix = '') {
        const API = window.AiGodkannandeFriktion;
        if (!API || !API.assessAiAcceptFriction) return true;
        const result = API.assessAiAcceptFriction({
            riskLevel: this.currentModalRiskLevel(prefix),
            aiOriginalText,
            currentText,
            tillagg
        });
        if (result.allowed) return true;
        this.showNotification(result.reason || 'AI-förslaget måste redigeras vid hög risk.', 'error');
        return false;
    }

    applyOvrigAiAll(prefix, data) {
        const mode = prefix === 'edit-' ? 'edit' : 'add';
        const listPrefix = this.listPrefix(mode);
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
        this.applyOvrigAiMotivering(prefix, data);
        if (Array.isArray(data.hot) || Array.isArray(data.sarbarheter)) {
            const Ai = window.AiFaltGranskning;
            const existingHot = this.collectHot(listPrefix);
            const existingSar = this.collectSarbarhet(listPrefix);
            const hotList = document.getElementById(listPrefix + 'hot-list');
            const sarList = document.getElementById(listPrefix + 'sarbarhet-list');
            if (hotList) hotList.innerHTML = '';
            if (sarList) sarList.innerHTML = '';
            const keptHot = existingHot.filter((h) => this.isUserAddedItem(h));
            const keptSar = existingSar.filter((s) => this.isUserAddedItem(s));
            const hotMerged = Array.isArray(data.hot)
                ? (Ai && Ai.mergeHotLists ? Ai.mergeHotLists(keptHot, data.hot) : keptHot.concat(data.hot))
                : existingHot;
            let sarMerged = existingSar;
            if (Array.isArray(data.sarbarheter)) {
                sarMerged = keptSar.slice();
                data.sarbarheter.forEach((s) => {
                    const title = String(s.titel || s.title || '').trim().toLowerCase();
                    if (title && sarMerged.some((m) => String(m.titel || '').trim().toLowerCase() === title)) return;
                    sarMerged.push(s);
                });
            }
            hotMerged.forEach((h) => this.addHotRow(mode, h, { aiAdd: !this.isUserAddedItem(h) }));
            sarMerged.forEach((s) => this.addSarbarhetRow(mode, s, { aiAdd: !this.isUserAddedItem(s) }));
            this.updateRiskDynLists(mode);
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
        this.applyOvrigAiMotivering(prefix, data, { onlyEmpty: true, existing });
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
            ${comment ? `<p class="field-ai-comment"><strong>Varför:</strong> ${esc(comment)}</p>` : ''}
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
            const comment = Ai.usefulComment(item.kommentar)
                || Ai.explainTextFieldChange(item.falt, item.nuvarande, item.forslag);
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
            } else if (item.falt === 'motiveringInneboende') {
                this.attachOvrigFieldAi(document.getElementById(`${prefix}motivering-inneboende`), {
                    comment,
                    html: `<textarea data-ai-forslag rows="4">${String(item.forslag || '').replace(/</g, '&lt;')}</textarea>`,
                    onApply: (box) => this.applyOvrigAiField(prefix, item.falt, box.querySelector('[data-ai-forslag]')?.value || '')
                });
                changed = true;
            } else if (item.falt === 'motiveringResidual') {
                this.attachOvrigFieldAi(document.getElementById(`${prefix}motivering-residual`), {
                    comment,
                    html: `<textarea data-ai-forslag rows="4">${String(item.forslag || '').replace(/</g, '&lt;')}</textarea>`,
                    onApply: (box) => this.applyOvrigAiField(prefix, item.falt, box.querySelector('[data-ai-forslag]')?.value || '')
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
        } else if (falt === 'motiveringInneboende') {
            const el = document.getElementById(`${prefix}motivering-inneboende`);
            if (el) el.value = String(forslag || '');
        } else if (falt === 'motiveringResidual') {
            const el = document.getElementById(`${prefix}motivering-residual`);
            if (el) el.value = String(forslag || '');
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
            riskbedomning: inherent.level || '',
            motiveringInneboende: document.getElementById(`${prefix}motivering-inneboende`)?.value.trim() || '',
            motiveringResidual: document.getElementById(`${prefix}motivering-residual`)?.value.trim() || '',
            hot: this.collectHot(this.listPrefix(isEdit ? 'edit' : 'add')),
            sarbarheter: this.collectSarbarhet(this.listPrefix(isEdit ? 'edit' : 'add')),
            extraUnderlag: (document.getElementById(isEdit ? 'edit-risk-ai-extra-underlag' : 'risk-ai-extra-underlag')?.value || '').trim()
        };
        const reviewMode = !!(Ai && Ai.hasExistingOvrigContent(befintligt));
        const requestEpoch = this.bumpAiSuggestionEpoch();
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
            if (requestEpoch !== this._aiSuggestionEpoch) return;
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            if (requestEpoch !== this._aiSuggestionEpoch) return;
            this._lastAiAudit = data.auditLogId ? { logId: data.auditLogId } : null;
            if (reviewMode) {
                // Prefill från byråprofilen gör reviewMode (beskrivning redan ifylld).
                // Tomma flikar (åtgärd, S×K, motivering) måste ändå fyllas — annars
                // blockeras sparning tyst av required-fält i dolda Din resa-paneler.
                this.applyOvrigAiIfEmpty(prefix, befintligt, data);
                const basePoster = (data.granskning && Array.isArray(data.granskning.poster))
                    ? data.granskning.poster
                    : [];
                const poster = Ai.ensureAnalysisPosters('ovrig', befintligt, data, basePoster);
                const changed = this.paintInlineOvrigAi(prefix, poster, befintligt, reviewHost);
                this.showNotification(changed
                    ? 'AI har fyllt tomma fält och lagt förslag under ifyllda. Granska, kopiera in ändringar ni vill behålla, och spara.'
                    : 'AI har fyllt tomma fält. Granska och spara — analysen hamnar under listan på sidan.', 'success');
            } else {
                this.applyOvrigAiAll(prefix, data);
                this.showNotification('AI-förslag inlagt. Granska och spara — analysen hamnar under listan på sidan.', 'success');
            }
            if (mode === 'edit') this.editNeedsReview = false;
            this.updateRiskBadges(mode);
        } catch (error) {
            if (requestEpoch !== this._aiSuggestionEpoch) return;
            console.error('AI-förslag fel:', error);
            this.showNotification('Kunde inte generera AI-förslag: ' + error.message, 'error');
        } finally {
            if (requestEpoch === this._aiSuggestionEpoch && btn) {
                btn.disabled = false;
                btn.classList.remove('loading');
                if (label) label.textContent = originalLabel || 'Generera AI-analys';
            }
        }
    }

modeFromModalId(modalId) {
        return modalId === 'edit-risk-modal' ? 'edit' : 'add';
    }

    listPrefix(mode) {
        return mode === 'edit' ? 'edit-' : 'add-';
    }

    escAttr(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    parseJsonField(raw) {
        if (Array.isArray(raw)) return raw;
        if (raw == null || raw === '') return [];
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
        }
        return [];
    }

    isUserAddedItem(item) {
        const Ai = window.AiFaltGranskning;
        if (Ai && typeof Ai.isUserAddedItem === 'function') return Ai.isUserAddedItem(item);
        if (!item || typeof item !== 'object') return false;
        if (item.userAdded === true || item.userAdded === 'true' || item.userAdded === 1) return true;
        const origin = String(item.ursprung || item.source || '').trim().toLowerCase();
        return origin === 'user' || origin === 'eget' || origin === 'egen';
    }

    bindDynCard(row, { expand = false, hasSource = false, onChange } = {}) {
        row.classList.toggle('is-collapsed', !expand);
        row.querySelector('.dyn-remove')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            row.remove();
            if (onChange) onChange();
        });
        row.querySelector('.dyn-toggle')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            row.classList.toggle('is-collapsed');
        });
        if (expand) setTimeout(() => row.querySelector('.dyn-titel')?.focus(), 0);
        if (!hasSource) return;
        const kallaToggle = row.querySelector('.dyn-kalla-toggle');
        const kallaRow = row.querySelector('.dyn-kalla-row');
        kallaToggle?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wrap = row.querySelector('.dyn-kalla-wrap');
            if (kallaRow) kallaRow.hidden = false;
            if (wrap) wrap.classList.remove('is-collapsed');
            kallaToggle.hidden = true;
            row.classList.remove('is-collapsed');
            row.querySelector('.dyn-kalla')?.focus();
        });
    }

    updateRiskDynLists(mode) {
        const pfx = this.listPrefix(mode);
        ['hot', 'sarbarhet'].forEach((kind) => {
            const n = document.querySelectorAll('#' + pfx + kind + '-list .dyn-row').length;
            const empty = document.getElementById(pfx + kind + '-empty');
            if (empty) empty.hidden = n > 0;
        });
    }

    addHotRow(mode, data = {}, opts = {}) {
        const pfx = this.listPrefix(mode);
        const list = document.getElementById(pfx + 'hot-list');
        if (!list) return;
        const titel = data.titel ?? data.title ?? '';
        const beskrivning = data.beskrivning ?? data.description ?? '';
        const kalla = data.kalla ?? data.källa ?? data.source ?? '';
        const typ = (window.RiskSkala && RiskSkala.normalizePtTf(data.typ ?? data.type)) || '';
        const userAdded = !!(opts.userAdded || this.isUserAddedItem(data));
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-hot dyn-card'
            + (opts.aiAdd ? ' is-ai-add' : '')
            + (userAdded ? ' is-user-added' : '');
        if (typ) row.dataset.hotTyp = typ;
        if (userAdded) row.dataset.userAdded = '1';
        row.innerHTML = `
            <div class="dyn-row-header">
                <span class="dyn-drag" title="Dra för att sortera" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
                <span class="dyn-row-kind is-hot" aria-hidden="true"><i class="fas fa-triangle-exclamation"></i></span>
                ${opts.aiAdd ? '<span class="dyn-ai-badge">ny</span>' : ''}
                ${userAdded && !opts.aiAdd ? '<span class="dyn-user-badge" title="Tillagt av er">eget</span>' : ''}
                <input type="text" class="dyn-titel" placeholder="Hotets titel" value="${this.escAttr(titel)}">
                <button type="button" class="dyn-toggle" title="Visa mer" aria-label="Visa mer"><i class="fas fa-chevron-down"></i></button>
                <button type="button" class="dyn-remove" title="Ta bort"><i class="fas fa-times"></i></button>
            </div>
            <div class="dyn-row-body">
                <textarea class="dyn-besk" rows="3" placeholder="Hur riskfaktorn kan utnyttjas för penningtvätt eller finansiering av terrorism.">${this.escAttr(beskrivning)}</textarea>
            </div>
            <div class="dyn-kalla-wrap is-collapsed">
                <button type="button" class="dyn-kalla-toggle">${kalla ? 'Visa källa (valfritt)' : 'Lägg till källa (valfritt)'}</button>
                <div class="dyn-kalla-row" hidden>
                    <span class="dyn-kalla-label">Källa <span class="dyn-kalla-optional">(valfritt)</span></span>
                    <input type="text" class="dyn-kalla" placeholder="Valfritt — utgivare eller länk" value="${this.escAttr(kalla)}" aria-label="Källa (valfritt)">
                </div>
            </div>
        `;
        this.bindDynCard(row, {
            expand: opts.aiAdd ? false : !!opts.expand,
            hasSource: true,
            onChange: () => this.updateRiskDynLists(mode)
        });
        list.appendChild(row);
        this.updateRiskDynLists(mode);
    }

    addSarbarhetRow(mode, data = {}, opts = {}) {
        const pfx = this.listPrefix(mode);
        const list = document.getElementById(pfx + 'sarbarhet-list');
        if (!list) return;
        const titel = data.titel ?? data.title ?? '';
        const beskrivning = data.beskrivning ?? data.description ?? '';
        const kalla = data.kalla ?? data.källa ?? data.source ?? '';
        const userAdded = !!(opts.userAdded || this.isUserAddedItem(data));
        const row = document.createElement('div');
        row.className = 'dyn-row dyn-row-sarbarhet dyn-card'
            + (opts.aiAdd ? ' is-ai-add' : '')
            + (userAdded ? ' is-user-added' : '');
        if (userAdded) row.dataset.userAdded = '1';
        row.innerHTML = `
            <div class="dyn-row-header">
                <span class="dyn-drag" title="Dra för att sortera" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
                <span class="dyn-row-kind is-sarbarhet" aria-hidden="true"><i class="fas fa-circle-exclamation"></i></span>
                ${opts.aiAdd ? '<span class="dyn-ai-badge">ny</span>' : ''}
                ${userAdded && !opts.aiAdd ? '<span class="dyn-user-badge" title="Tillagt av er">eget</span>' : ''}
                <input type="text" class="dyn-titel" placeholder="Sårbarhetens titel" value="${this.escAttr(titel)}">
                <button type="button" class="dyn-toggle" title="Visa mer" aria-label="Visa mer"><i class="fas fa-chevron-down"></i></button>
                <button type="button" class="dyn-remove" title="Ta bort"><i class="fas fa-times"></i></button>
            </div>
            <div class="dyn-row-body">
                <textarea class="dyn-besk" rows="3" placeholder="Beskrivning av sårbarheten">${this.escAttr(beskrivning)}</textarea>
            </div>
            <div class="dyn-kalla-wrap is-collapsed">
                <button type="button" class="dyn-kalla-toggle">${kalla ? 'Visa källa (valfritt)' : 'Lägg till källa (valfritt)'}</button>
                <div class="dyn-kalla-row" hidden>
                    <span class="dyn-kalla-label">Källa <span class="dyn-kalla-optional">(valfritt)</span></span>
                    <input type="text" class="dyn-kalla" placeholder="Valfritt — utgivare eller länk" value="${this.escAttr(kalla)}" aria-label="Källa (valfritt)">
                </div>
            </div>
        `;
        this.bindDynCard(row, {
            expand: opts.aiAdd ? false : !!opts.expand,
            hasSource: true,
            onChange: () => this.updateRiskDynLists(mode)
        });
        list.appendChild(row);
        this.updateRiskDynLists(mode);
    }

    collectHot(listPrefix) {
        return [...document.querySelectorAll('#' + listPrefix + 'hot-list .dyn-row')].map((row) => {
            const item = {
                titel: row.querySelector('.dyn-titel')?.value.trim() || '',
                beskrivning: row.querySelector('.dyn-besk')?.value.trim() || '',
                kalla: row.querySelector('.dyn-kalla')?.value.trim() || ''
            };
            const typ = (window.RiskSkala && RiskSkala.normalizePtTf(row.dataset.hotTyp)) || '';
            if (typ) item.typ = typ;
            if (row.dataset.userAdded === '1') item.userAdded = true;
            return item;
        }).filter((h) => h.titel || h.beskrivning || h.kalla);
    }

    collectSarbarhet(listPrefix) {
        return [...document.querySelectorAll('#' + listPrefix + 'sarbarhet-list .dyn-row')].map((row) => {
            const item = {
                titel: row.querySelector('.dyn-titel')?.value.trim() || '',
                beskrivning: row.querySelector('.dyn-besk')?.value.trim() || '',
                kalla: row.querySelector('.dyn-kalla')?.value.trim() || ''
            };
            if (row.dataset.userAdded === '1') item.userAdded = true;
            return item;
        }).filter((s) => s.titel || s.beskrivning || s.kalla);
    }

    clearRiskDynLists(mode) {
        const pfx = this.listPrefix(mode);
        ['hot-list', 'sarbarhet-list'].forEach((id) => {
            const el = document.getElementById(pfx + id);
            if (el) el.innerHTML = '';
        });
        this.updateRiskDynLists(mode);
    }

    bindRiskDynLists() {
        ['add-risk-modal', 'edit-risk-modal'].forEach((modalId) => {
            const modal = document.getElementById(modalId);
            if (!modal || modal.dataset.riskDynBound === '1') return;
            modal.dataset.riskDynBound = '1';
            const mode = this.modeFromModalId(modalId);
            modal.querySelectorAll('.btn-add-row[data-add]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const kind = btn.getAttribute('data-add');
                    if (kind === 'hot') this.addHotRow(mode, {}, { expand: true, userAdded: true });
                    if (kind === 'sarbarhet') this.addSarbarhetRow(mode, {}, { expand: true, userAdded: true });
                });
            });
        });
    }

    setKlarmarkeradeFlikar(mode, list) {
        const RS = window.RiskSkala;
        const allowed = RS && RS.normalizeKlarmarkeradeFlikar
            ? RS.normalizeKlarmarkeradeFlikar(list)
            : (Array.isArray(list) ? list : []);
        this.klarmarkeradeFlikar[mode] = new Set(allowed);
        this.syncRiskTabDoneState(mode);
        this.syncRiskKlarmarkeraBtn(mode);
    }

    syncRiskTabDoneState(mode) {
        const modalId = mode === 'edit' ? 'edit-risk-modal' : 'add-risk-modal';
        const modal = document.getElementById(modalId);
        if (!modal) return;
        const klar = this.klarmarkeradeFlikar[mode] || new Set();
        modal.querySelectorAll('.tjanst-tab[data-risk-tab]').forEach((tab) => {
            const id = tab.getAttribute('data-risk-tab');
            const done = klar.has(id);
            tab.classList.toggle('is-done', done);
            tab.setAttribute('aria-label', done
                ? ((tab.querySelector('.tjanst-tab-label')?.textContent || id) + ' (klar)')
                : (tab.querySelector('.tjanst-tab-label')?.textContent || id));
        });
        this.syncRiskResaProgress(mode);
    }

    syncRiskKlarmarkeraBtn(mode) {
        const btnId = mode === 'edit' ? 'edit-risk-klarmarkera-btn' : 'add-risk-klarmarkera-btn';
        const btn = document.getElementById(btnId);
        const label = btn?.querySelector('.tjanst-klarmarkera-label');
        if (!btn) return;
        const done = (this.klarmarkeradeFlikar[mode] || new Set()).has(this._activeRiskTab[mode] || 'utforande');
        btn.classList.toggle('is-done', done);
        btn.setAttribute('aria-pressed', done ? 'true' : 'false');
        if (label) label.textContent = done ? 'Ta bort klarmarkering' : 'Klarmarkera';
    }

    syncRiskResaProgress(mode) {
        const elId = mode === 'edit' ? 'edit-risk-resa-progress' : 'add-risk-resa-progress';
        const el = document.getElementById(elId);
        if (!el) return;
        const RS = window.RiskSkala;
        const klar = [...(this.klarmarkeradeFlikar[mode] || [])];
        const progress = RS && RS.tjanstResaProgress
            ? RS.tjanstResaProgress(klar)
            : { doneCount: klar.length, total: 7, complete: false };
        el.hidden = progress.doneCount <= 0;
        el.classList.toggle('is-complete', !!progress.complete);
        el.innerHTML = progress.complete
            ? '<i class="fas fa-check-circle" aria-hidden="true"></i> Alla delar klara'
            : ('<i class="fas fa-check" aria-hidden="true"></i> ' + progress.doneCount + '/' + progress.total + ' delar klara');
    }

    async toggleRiskKlarmarkering(mode) {
        if (this._klarSaveInFlight) return;
        const id = this._activeRiskTab[mode] || 'utforande';
        const set = this.klarmarkeradeFlikar[mode] || new Set();
        const turningOn = !set.has(id);
        if (turningOn) set.add(id);
        else set.delete(id);
        this.klarmarkeradeFlikar[mode] = set;
        this.syncRiskTabDoneState(mode);
        this.syncRiskKlarmarkeraBtn(mode);

        const saved = await this.persistRiskKlarmarkeringViaSave(mode);
        if (!saved) {
            if (turningOn) set.delete(id);
            else set.add(id);
            this.klarmarkeradeFlikar[mode] = set;
            this.syncRiskTabDoneState(mode);
            this.syncRiskKlarmarkeraBtn(mode);
            return;
        }
        if (turningOn) this.advanceRiskResaAfterKlar(mode, id);
    }

    /** After marking a Din resa step klar, move to the next sidebar step (no-op on last). */
    advanceRiskResaAfterKlar(mode, fromId) {
        const flikar = (window.RiskSkala && Array.isArray(RiskSkala.TJANST_RESA_FLIKAR))
            ? RiskSkala.TJANST_RESA_FLIKAR
            : ['utforande', 'oversikt', 'hot', 'sarbarhet', 'inneboende', 'atgard', 'residual'];
        const idx = flikar.indexOf(fromId);
        if (idx < 0 || idx >= flikar.length - 1) return;
        const modalId = mode === 'edit' ? 'edit-risk-modal' : 'add-risk-modal';
        this.setRiskTab(modalId, flikar[idx + 1]);
    }

    /**
     * Persist risk-klarmarkering via same payload/API as normal save (edit only).
     * Stays in modal; skips hard form/motivering gates so mid-resa steps can save.
     * @returns {Promise<boolean>}
     */
    async persistRiskKlarmarkeringViaSave(mode) {
        if (mode !== 'edit') return true;

        const form = document.getElementById('edit-risk-form');
        if (!form) return true;
        const formData = new FormData(form);
        const recordId = formData.get('record-id');
        if (!recordId) return true;

        const userByraId = this.userByraIds.length > 0 ? this.userByraIds[0] : null;
        if (!userByraId) {
            this.showNotification('Inget byrå ID hittat för användaren. Kontakta administratören.', 'error');
            return false;
        }

        const btn = document.getElementById('edit-risk-klarmarkera-btn');
        this._klarSaveInFlight = true;
        if (btn) btn.disabled = true;
        try {
            let riskData;
            try {
                riskData = {
                    ...this.collectRiskPayload(formData, 'edit'),
                    'Byrå ID': userByraId
                };
            } catch (collectErr) {
                this.showNotification(collectErr.message || 'Kunde inte spara klarmarkering.', 'error');
                return false;
            }
            const RS = window.RiskSkala;
            const klar = [...(this.klarmarkeradeFlikar.edit || [])];
            const complete = !!(RS && RS.isTjanstResaComplete && RS.isTjanstResaComplete(klar));
            if (complete) riskData['Aktuell'] = true;

            const response = await this.saveRiskFactor(
                `${window.apiConfig.baseUrl}/api/risk-factors/${recordId}`,
                'PUT',
                riskData
            );
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || err.error || `HTTP ${response.status}`);
            }
            const risk = Array.isArray(this.risks)
                ? this.risks.find((r) => r.id === recordId)
                : null;
            if (risk) {
                risk.fields = Object.assign({}, risk.fields, riskData);
                if (complete) risk.fields['Aktuell'] = true;
            }
            return true;
        } catch (error) {
            console.error('Error saving risk klarmarkering:', error);
            this.showNotification(
                'Fel vid uppdatering av riskfaktor: ' + (error.message || ''),
                'error'
            );
            return false;
        } finally {
            this._klarSaveInFlight = false;
            if (btn) btn.disabled = false;
            this.syncRiskKlarmarkeraBtn(mode);
        }
    }

    bindRiskKlarmarkering() {
        const addBtn = document.getElementById('add-risk-klarmarkera-btn');
        if (addBtn && addBtn.dataset.bound !== '1') {
            addBtn.dataset.bound = '1';
            addBtn.addEventListener('click', () => this.toggleRiskKlarmarkering('add'));
        }
        const editBtn = document.getElementById('edit-risk-klarmarkera-btn');
        if (editBtn && editBtn.dataset.bound !== '1') {
            editBtn.dataset.bound = '1';
            editBtn.addEventListener('click', () => this.toggleRiskKlarmarkering('edit'));
        }
    }

    setRiskTab(modalId, tabId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        const mode = this.modeFromModalId(modalId);
        const id = tabId || 'utforande';
        this._activeRiskTab[mode] = id;
        modal.querySelectorAll('.tjanst-tab[data-risk-tab]').forEach((tab) => {
            const on = tab.getAttribute('data-risk-tab') === id;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        modal.querySelectorAll('.tjanst-panel[data-risk-panel]').forEach((panel) => {
            const on = panel.getAttribute('data-risk-panel') === id;
            panel.classList.toggle('is-active', on);
            panel.hidden = !on;
        });
        this.syncRiskTabDoneState(mode);
        this.syncRiskKlarmarkeraBtn(mode);
    }

    bindRiskTabs() {
        ['add-risk-modal', 'edit-risk-modal'].forEach((modalId) => {
            const modal = document.getElementById(modalId);
            if (!modal || modal.dataset.riskTabsBound === '1') return;
            modal.dataset.riskTabsBound = '1';
            modal.querySelectorAll('.tjanst-tab[data-risk-tab]').forEach((tab) => {
                tab.addEventListener('click', () => {
                    this.setRiskTab(modalId, tab.getAttribute('data-risk-tab'));
                });
            });
        });
    }


    /** Rensa AI-förslag-DOM så föregående riskfaktor aldrig syns i nästa modal. */
    clearOvrigInlineAi(modalId) {
        const scopes = modalId
            ? [document.getElementById(modalId)].filter(Boolean)
            : [document.getElementById('add-risk-modal'), document.getElementById('edit-risk-modal')].filter(Boolean);
        scopes.forEach((scope) => {
            scope.querySelectorAll('.field-ai-forslag').forEach((el) => el.remove());
        });
        if (window.AiFaltGranskning) {
            if (!modalId || modalId === 'add-risk-modal') {
                AiFaltGranskning.hideReview(document.getElementById('add-ai-review'));
            }
            if (!modalId || modalId === 'edit-risk-modal') {
                AiFaltGranskning.hideReview(document.getElementById('edit-ai-review'));
            }
        }
        const resetBtn = (id, fallbackLabel) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.disabled = false;
            btn.classList.remove('loading');
            const label = btn.querySelector('.ai-btn-label');
            if (label) label.textContent = fallbackLabel;
        };
        if (!modalId || modalId === 'add-risk-modal') resetBtn('add-ai-suggest-btn', 'Generera AI-analys');
        if (!modalId || modalId === 'edit-risk-modal') resetBtn('edit-ai-suggest-btn', 'Generera AI-analys');
        this._lastAiAudit = null;
    }

    /** Ogiltigförklara pågående AI-svar så de inte målar förslag i en annan riskfaktors modal. */
    bumpAiSuggestionEpoch() {
        this._aiSuggestionEpoch = (this._aiSuggestionEpoch || 0) + 1;
        return this._aiSuggestionEpoch;
    }

    openAddModal(prefill) {
        this.bumpAiSuggestionEpoch();
        this.clearOvrigInlineAi('add-risk-modal');
        document.getElementById('add-risk-form')?.reset();
        this.clearRiskDynLists('add');
        this.setKlarmarkeradeFlikar('add', []);
        const underlag = document.getElementById('risk-ai-extra-underlag');
        if (underlag) underlag.value = '';
        const pt = document.getElementById('pt-tf');
        if (pt) pt.value = '';
        const typ = document.getElementById('risk-type');
        if (typ && typ.options.length === 2) {
            typ.selectedIndex = 1;
        } else if (typ && this.isKundriskerPage()) {
            typ.value = this.kundRiskTypLabel();
        }
        if (prefill && typeof prefill === 'object') {
            if (prefill.typ) this.setSelectValue('risk-type', prefill.typ);
            const nameEl = document.getElementById('risk-factor');
            if (nameEl && prefill.riskfaktor) nameEl.value = prefill.riskfaktor;
            const descEl = document.getElementById('description');
            if (descEl && prefill.beskrivning) descEl.value = prefill.beskrivning;
            if (prefill.ptTf) this.setSelectValue('pt-tf', prefill.ptTf);
        }
        this.editNeedsReview = false;
        this.updateRiskBadges('add');
        this.updateMotiveringWarnings('add');
        this.setRiskTab('add-risk-modal', 'utforande');
        document.getElementById('add-risk-modal').style.display = 'flex';
    }
    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        this.bumpAiSuggestionEpoch();
        this.clearOvrigInlineAi(modalId);
    }

    async openEditModal(recordId, opts = {}) {
        const risk = this.risks.find(r => r.id === recordId);
        if (!risk) return;

        this.bumpAiSuggestionEpoch();
        this.clearOvrigInlineAi('edit-risk-modal');

        const fields = risk.fields;
        
        // Populate form fields
        document.getElementById('edit-record-id').value = recordId;
        const typRaw = fields['Typ av riskfaktor'] || '';
        const typSelect = document.getElementById('edit-risk-type');
        const typValue = (window.RiskDimensioner && RiskDimensioner.airtableTypValue)
            ? RiskDimensioner.airtableTypValue(typRaw)
            : typRaw;
        if (typSelect) {
            typSelect.value = [...typSelect.options].some((o) => o.value === typValue) ? typValue : typRaw;
        }
        
        const scored = this.scoredRisk(fields);
        const nameEl = document.getElementById('edit-risk-factor');
        if (nameEl) nameEl.value = fields['Riskfaktor'] || '';
        document.getElementById('edit-description').value = fields['Beskrivning'] || '';
        document.getElementById('edit-action').value = fields['Åtgjärd'] || fields['Åtgärd'] || '';
        const pt = document.getElementById('edit-pt-tf');
        if (pt) pt.value = scored.ptTfRelevans || '';
        this.setScoreSelect('edit-sannolikhet', scored.sannolikhet);
        this.setScoreSelect('edit-konsekvens', scored.konsekvens);
        this.setScoreSelect('edit-sannolikhet-efter', scored.sannolikhetEfter);
        this.setScoreSelect('edit-konsekvens-efter', scored.konsekvensEfter);
        this.fillSplitMotiveringToDom('edit-', scored);
        this.bindMotiveringProposeButtons();
        this.editNeedsReview = scored.kraverManualOversyn === true;
        this.updateRiskBadges('edit');

        this.clearRiskDynLists('edit');
        this.parseJsonField(fields.Hot).forEach((h) => this.addHotRow('edit', h));
        this.parseJsonField(fields['Sårbarheter']).forEach((s) => this.addSarbarhetRow('edit', s));
        const underlag = document.getElementById('edit-risk-ai-extra-underlag');
        if (underlag) underlag.value = fields['AI-extra underlag'] || '';
        this.setKlarmarkeradeFlikar('edit', scored.klarmarkeradeFlikar || []);
        this.setRiskTab('edit-risk-modal', 'utforande');
        document.getElementById('edit-risk-modal').style.display = 'flex';

        const focusName = opts.focusName === true || !String(fields['Riskfaktor'] || '').trim();
        if (focusName && nameEl && typeof nameEl.focus === 'function') {
            setTimeout(() => {
                try { nameEl.focus({ preventScroll: false }); } catch (_) { nameEl.focus(); }
                if (typeof nameEl.select === 'function' && nameEl.value) nameEl.select();
            }, 0);
        }
    }

    async handleAddRisk(event) {
        event.preventDefault();

        if (!this.validateRiskFormBeforeSave('add').ok) return;

        const formData = new FormData(event.target);

        // Use the first byrå ID from user's data
        const userByraId = this.userByraIds.length > 0 ? this.userByraIds[0] : null;

        if (!userByraId) {
            this.showNotification('Inget byrå ID hittat för användaren. Kontakta administratören.', 'error');
            return;
        }

        this.editNeedsReview = false;

        try {
            const riskData = {
                ...this.collectRiskPayload(formData, 'add'),
                'Byrå ID': userByraId,
                'Aktuell': true
            };
            const poang = RiskSkala && RiskSkala.parseRiskPoang ? RiskSkala.parseRiskPoang(riskData['Riskpoäng']) : null;
            const motCheck = this.validateMotiveringBeforeSave(poang || {});
            if (!motCheck.ok) {
                const first = motCheck.errors[0] || {};
                const isResidual = first.field === 'motivering_residual_risk';
                this.setRiskTab('add-risk-modal', isResidual ? 'residual' : 'inneboende');
                const prefix = isResidual ? 'motivering-residual' : 'motivering-inneboende';
                document.getElementById(prefix)?.focus();
                this.updateMotiveringWarnings('add');
                return;
            }
            const response = await this.saveRiskFactor(`${window.apiConfig.baseUrl}/api/risk-factors`, 'POST', riskData);
            if (response.ok) {
                const saved = await response.json().catch(() => ({}));
                const newId = (saved.record && saved.record.id) || saved.id || null;
                this.closeModal('add-risk-modal');
                await this.loadRiskFactors();
                await this.loadRiskFactorCatalogVersion();
                this.renderByraProfilKaskad();
                this.revealSavedRisk(newId, riskData.Riskfaktor || riskData['Riskfaktor']);
                const where = this.isKundriskerPage()
                    ? ' under Kundkategorier och geografi'
                    : '';
                this.showNotification(
                    `Analysen är sparad${where}. Öppna kortet för att granska eller redigera.`,
                    'success'
                );
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

        if (!this.validateRiskFormBeforeSave('edit').ok) return;

        const formData = new FormData(event.target);
        const recordId = formData.get('record-id');

        // Use the first byrå ID from user's data
        const userByraId = this.userByraIds.length > 0 ? this.userByraIds[0] : null;

        if (!userByraId) {
            this.showNotification('Inget byrå ID hittat för användaren. Kontakta administratören.', 'error');
            return;
        }

        try {
            const riskData = {
                ...this.collectRiskPayload(formData, 'edit'),
                'Byrå ID': userByraId
            };
            const poang = RiskSkala && RiskSkala.parseRiskPoang ? RiskSkala.parseRiskPoang(riskData['Riskpoäng']) : null;
            const motCheck = this.validateMotiveringBeforeSave(poang || {});
            if (!motCheck.ok) {
                const first = motCheck.errors[0] || {};
                const isResidual = first.field === 'motivering_residual_risk';
                this.setRiskTab('edit-risk-modal', isResidual ? 'residual' : 'inneboende');
                const prefix = isResidual ? 'edit-motivering-residual' : 'edit-motivering-inneboende';
                document.getElementById(prefix)?.focus();
                this.updateMotiveringWarnings('edit');
                return;
            }
            const response = await this.saveRiskFactor(`${window.apiConfig.baseUrl}/api/risk-factors/${recordId}`, 'PUT', riskData);
            if (response.ok) {
                this.closeModal('edit-risk-modal');
                await this.loadRiskFactors();
                await this.loadRiskFactorCatalogVersion();
                this.renderByraProfilKaskad();
                this.revealSavedRisk(recordId, riskData.Riskfaktor || riskData['Riskfaktor']);
                this.showNotification('Analysen är uppdaterad. Kortet är markerat i listan.', 'success');
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
        let lastErr = {};
        let lastStatus = 500;
        for (let attempt = 0; attempt < 5; attempt++) {
            const response = await riskAuthFetch(url, {
                method,
                body: JSON.stringify(body)
            });
            if (response.ok) {
                this._lastAiAudit = null;
                return response;
            }
            lastStatus = response.status;
            lastErr = await response.json().catch(() => ({}));
            const unknown = String(lastErr.message || lastErr.error || JSON.stringify(lastErr))
                .match(/Unknown field name:\s*"([^"]+)"/i)?.[1];
            if (!unknown || !Object.prototype.hasOwnProperty.call(body, unknown)) break;
            body = { ...body };
            if (unknown === 'Riskpoäng' && body['Riskpoäng']) {
                body['Samspelsexempel'] = body['Riskpoäng'];
            }
            delete body[unknown];
        }
        return new Response(JSON.stringify(lastErr), {
            status: lastStatus,
            headers: { 'Content-Type': 'application/json' }
        });
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
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || err.message || `HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error toggling risk status:', error);
            this.showNotification(error.message || 'Fel vid ändring av klarmarkering', 'error');
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
                await this.loadRiskFactorCatalogVersion();
                this.renderByraProfilKaskad();
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

    setupRiskhojandeKatalog() {
        const addBtn = document.getElementById('riskhoj-katalog-add');
        const saveBtn = document.getElementById('riskhoj-katalog-save');
        if (addBtn) addBtn.addEventListener('click', () => this.addRiskhojandeKatalogRad());
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveRiskhojandeKatalog());
        this.loadRiskhojandeKatalog();
    }

    riskhojandeKlassLabel(klass) {
        if (klass === 'OACCEPTABEL') return 'Oacceptabel';
        if (klass === 'GOLV_HOG') return 'Hög-aktiv';
        if (klass === 'INFORMATIV') return 'Informativ';
        return 'Bidrar vid kombination';
    }

    _riskhojKategoriOptions(selected) {
        const cats = (window.OvrigaRiskKategorier && OvrigaRiskKategorier.CATEGORIES) || [
            { id: 'samarbete', letter: 'A', title: 'Hur samarbetar vi?' },
            { id: 'kunden', letter: 'B', title: 'Vem är kunden?' },
            { id: 'verksamheten', letter: 'C', title: 'Vad gör kunden?' }
        ];
        return cats.map((c) => (
            `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${c.letter}. ${c.title}</option>`
        )).join('');
    }

    _riskhojDefaultCategory(namn) {
        const KP = window.KundRiskprofil;
        if (KP && KP.defaultRiskhojandeCategory) return KP.defaultRiskhojandeCategory(namn);
        const Kat = window.OvrigaRiskKategorier;
        const hit = Kat && Kat.findFactor ? Kat.findFactor(namn) : null;
        return (hit && hit.category) || 'verksamheten';
    }

    async loadRiskhojandeKatalog() {
        const list = document.getElementById('riskhoj-katalog-list');
        if (!list) return;
        try {
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/riskhojande-katalog`);
            const data = res.ok ? await res.json() : {};
            const KP = window.KundRiskprofil;
            this._riskhojEntries = KP && KP.mergeRiskhojandeEntries
                ? KP.mergeRiskhojandeEntries(data.overrides || data.katalog || {})
                : {};
            if (!Object.keys(this._riskhojEntries).length) {
                const katalog = KP && KP.mergeRiskhojandeKatalog
                    ? KP.mergeRiskhojandeKatalog(data.overrides || data.katalog || {})
                    : (data.katalog || {});
                const kategorier = data.kategorier || {};
                this._riskhojEntries = {};
                Object.keys(katalog).forEach((namn) => {
                    this._riskhojEntries[namn] = {
                        klass: katalog[namn],
                        category: kategorier[namn] || this._riskhojDefaultCategory(namn)
                    };
                });
            }
        } catch (e) {
            const katalog = (window.KundRiskprofil && KundRiskprofil.DEFAULT_RISKHOJANDE_KATALOG) || {};
            this._riskhojEntries = {};
            Object.keys(katalog).forEach((namn) => {
                this._riskhojEntries[namn] = {
                    klass: katalog[namn],
                    category: this._riskhojDefaultCategory(namn)
                };
            });
        }
        this.renderRiskhojandeKatalog();
    }

    renderRiskhojandeKatalog() {
        const list = document.getElementById('riskhoj-katalog-list');
        if (!list) return;
        const entries = this._riskhojEntries || {};
        const cats = (window.OvrigaRiskKategorier && OvrigaRiskKategorier.CATEGORIES) || [];
        const groups = (cats.length ? cats : [
            { id: 'samarbete', letter: 'A', title: 'Hur samarbetar vi?' },
            { id: 'kunden', letter: 'B', title: 'Vem är kunden?' },
            { id: 'verksamheten', letter: 'C', title: 'Vad gör kunden?' }
        ]).map((cat) => {
            const names = Object.keys(entries)
                .filter((namn) => (entries[namn].category || this._riskhojDefaultCategory(namn)) === cat.id)
                .sort((a, b) => a.localeCompare(b, 'sv'));
            const rows = names.map((namn) => {
                const klass = entries[namn].klass;
                const category = entries[namn].category || this._riskhojDefaultCategory(namn);
                const safeNamn = namn.replace(/</g, '&lt;').replace(/"/g, '&quot;');
                return `<div class="riskhoj-katalog-rad${klass === 'OACCEPTABEL' ? ' riskhoj-katalog-rad--oacceptabel' : (klass === 'GOLV_HOG' ? ' riskhoj-katalog-rad--golv' : '')}">
                    <span class="riskhoj-katalog-namn">${namn.replace(/</g, '&lt;')} ${this.renderKundCountBadge(this.kundAntalFor('varningsflaggor', namn))}</span>
                    <select class="form-select riskhoj-katalog-kategori" data-namn="${safeNamn}" aria-label="Kategori för ${safeNamn}">
                        ${this._riskhojKategoriOptions(category)}
                    </select>
                    <select class="form-select riskhoj-katalog-klass" data-namn="${safeNamn}">
                        <option value="OACCEPTABEL"${klass === 'OACCEPTABEL' ? ' selected' : ''}>Oacceptabel</option>
                        <option value="GOLV_HOG"${klass === 'GOLV_HOG' ? ' selected' : ''}>Hög-aktiv</option>
                        <option value="BIDRAR_VID_KOMBINATION"${klass === 'BIDRAR_VID_KOMBINATION' ? ' selected' : ''}>Bidrar vid kombination</option>
                        <option value="INFORMATIV"${klass === 'INFORMATIV' ? ' selected' : ''}>Informativ</option>
                    </select>
                    <button type="button" class="btn btn-ghost btn-sm riskhoj-katalog-remove" data-namn="${safeNamn}" title="Ta bort flagga" aria-label="Ta bort ${safeNamn}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`;
            }).join('');
            const Kat = window.OvrigaRiskKategorier;
            const suggestions = Kat && Kat.suggestedFactorsForCategory
                ? Kat.suggestedFactorsForCategory(cat.id, Object.keys(entries))
                : [];
            const forslagHtml = suggestions.length
                ? `<div class="riskhoj-katalog-forslag">
                    <p class="riskhoj-katalog-forslag-titel">Övriga förslag</p>
                    <div class="riskhoj-forslag-list">
                        ${suggestions.map((f) => {
                            const safe = String(f.label || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
                            const badge = Kat.klassBadge ? Kat.klassBadge(f.klass, f.badge) : '';
                            const hint = String(f.hint || '').replace(/"/g, '&quot;');
                            return `<button type="button" class="riskhoj-forslag-chip${f.klass === 'OACCEPTABEL' ? ' riskhoj-forslag-chip--oacceptabel' : (f.klass === 'GOLV_HOG' ? ' riskhoj-forslag-chip--golv' : '')}" data-namn="${safe}" data-klass="${f.klass}" data-category="${cat.id}" title="${hint}">
                                <i class="fas fa-plus" aria-hidden="true"></i>
                                <span class="riskhoj-forslag-label">${safe}</span>
                                ${badge ? `<span class="riskhoj-forslag-klass">${badge.replace(/</g, '&lt;')}</span>` : ''}
                            </button>`;
                        }).join('')}
                    </div>
                </div>`
                : '';
            return `<div class="riskhoj-katalog-grupp">
                <h4 class="riskhoj-katalog-grupp-titel"><span class="ovriga-risk-kategori-letter">${cat.letter}</span> ${cat.title}</h4>
                ${rows || '<p class="kyc-hint">Inga flaggor i den här kategorin.</p>'}
                ${forslagHtml}
            </div>`;
        }).join('');
        list.innerHTML = groups;
        list.querySelectorAll('.riskhoj-katalog-klass').forEach((sel) => {
            sel.addEventListener('change', () => {
                const namn = sel.getAttribute('data-namn');
                if (!namn || !this._riskhojEntries[namn]) return;
                this._riskhojEntries[namn] = Object.assign({}, this._riskhojEntries[namn], { klass: sel.value });
                this.renderRiskhojandeKatalog();
            });
        });
        list.querySelectorAll('.riskhoj-katalog-kategori').forEach((sel) => {
            sel.addEventListener('change', () => {
                const namn = sel.getAttribute('data-namn');
                if (!namn || !this._riskhojEntries[namn]) return;
                this._riskhojEntries[namn] = Object.assign({}, this._riskhojEntries[namn], { category: sel.value });
                this.renderRiskhojandeKatalog();
            });
        });
        list.querySelectorAll('.riskhoj-katalog-remove').forEach((btn) => {
            btn.addEventListener('click', () => {
                const namn = btn.getAttribute('data-namn');
                if (!namn) return;
                if (!window.confirm('Ta bort flaggan "' + namn + '"? Ändringen sparas när du klickar Spara katalogen.')) return;
                const next = Object.assign({}, this._riskhojEntries);
                delete next[namn];
                this._riskhojEntries = next;
                this.renderRiskhojandeKatalog();
            });
        });
        list.querySelectorAll('.riskhoj-forslag-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                const namn = btn.getAttribute('data-namn');
                const klass = btn.getAttribute('data-klass') || 'BIDRAR_VID_KOMBINATION';
                const category = btn.getAttribute('data-category') || 'verksamheten';
                if (!namn) return;
                if (this._riskhojEntries && this._riskhojEntries[namn]) return;
                this._riskhojEntries = Object.assign({}, this._riskhojEntries, {
                    [namn]: { klass, category }
                });
                this.renderRiskhojandeKatalog();
            });
        });
    }

    addRiskhojandeKatalogRad() {
        const input = document.getElementById('riskhoj-katalog-ny');
        const sel = document.getElementById('riskhoj-katalog-ny-klass');
        const catSel = document.getElementById('riskhoj-katalog-ny-kategori');
        const KP = window.KundRiskprofil;
        const namn = KP && KP.canonicalRiskhojandeLabel
            ? KP.canonicalRiskhojandeLabel(input && input.value)
            : String((input && input.value) || '').trim();
        const klass = (sel && sel.value) || 'BIDRAR_VID_KOMBINATION';
        const category = (catSel && catSel.value) || 'verksamheten';
        if (!namn) return;
        this._riskhojEntries = Object.assign({}, this._riskhojEntries, {
            [namn]: { klass, category }
        });
        if (input) input.value = '';
        this.renderRiskhojandeKatalog();
    }

    async saveRiskhojandeKatalog() {
        const saveBtn = document.getElementById('riskhoj-katalog-save');
        const orig = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = 'Sparar...'; }
        try {
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/riskhojande-katalog`, {
                method: 'PATCH',
                body: JSON.stringify({ katalog: this._riskhojEntries || {} })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            const KP = window.KundRiskprofil;
            this._riskhojEntries = KP && KP.mergeRiskhojandeEntries
                ? KP.mergeRiskhojandeEntries(this._riskhojEntries)
                : this._riskhojEntries;
            this.showNotification('Varningsflaggorna sparade', 'success');
            this.renderRiskhojandeKatalog();
        } catch (e) {
            this.showNotification(e.message || 'Kunde inte spara katalogen', 'error');
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = orig; }
        }
    }

    setupRisksankandeKatalog() {
        const addBtn = document.getElementById('risksank-katalog-add');
        const saveBtn = document.getElementById('risksank-katalog-save');
        if (addBtn) addBtn.addEventListener('click', () => this.addRisksankandeKatalogRad());
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveRisksankandeKatalog());
        this.loadRisksankandeKatalog();
    }

    async loadRisksankandeKatalog() {
        const list = document.getElementById('risksank-katalog-list');
        if (!list) return;
        const RS = window.RisksankandeKatalog;
        try {
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risksankande-katalog`);
            const data = res.ok ? await res.json() : {};
            this._risksankEntries = RS && RS.mergeKatalog
                ? RS.mergeKatalog(data.overrides || data.katalog || {})
                : (data.katalog || {});
        } catch (e) {
            this._risksankEntries = RS && RS.mergeKatalog ? RS.mergeKatalog({}) : {};
        }
        this.renderRisksankandeKatalog();
    }

    renderRisksankandeKatalog() {
        const list = document.getElementById('risksank-katalog-list');
        if (!list) return;
        const entries = this._risksankEntries || {};
        const names = Object.keys(entries).sort((a, b) => a.localeCompare(b, 'sv'));
        const RS = window.RisksankandeKatalog;
        list.innerHTML = names.map((namn) => {
            const row = RS && RS.renderKatalogRad
                ? RS.renderKatalogRad(namn, entries[namn])
                : '';
            if (!row) return '';
            const badge = this.renderKundCountBadge(this.kundAntalFor('risksankande', namn));
            return row.replace(
                'risksank-katalog-rad">',
                `risksank-katalog-rad"><span class="risk-kund-count-wrap">${badge}</span>`
            );
        }).join('') || '<p class="kyc-hint">Inga risksänkande faktorer. Lägg till en ny ovan.</p>';
        list.querySelectorAll('.risksank-katalog-namn').forEach((input) => {
            input.addEventListener('change', () => this._renameRisksankande(input.getAttribute('data-namn'), input.value));
        });
        list.querySelectorAll('.risksank-katalog-forklaring').forEach((area) => {
            area.addEventListener('change', () => {
                const namn = area.getAttribute('data-namn');
                if (!namn || !this._risksankEntries[namn]) return;
                this._risksankEntries[namn] = Object.assign({}, this._risksankEntries[namn], { forklaring: area.value });
            });
        });
        list.querySelectorAll('.risksank-katalog-kalla').forEach((input) => {
            input.addEventListener('change', () => {
                const namn = input.getAttribute('data-namn');
                if (!namn || !this._risksankEntries[namn]) return;
                this._risksankEntries[namn] = Object.assign({}, this._risksankEntries[namn], { kalla: input.value });
            });
        });
        list.querySelectorAll('.risksank-katalog-remove').forEach((btn) => {
            btn.addEventListener('click', () => {
                const namn = btn.getAttribute('data-namn');
                if (!namn) return;
                if (!window.confirm('Ta bort faktorn "' + namn + '"? Ändringen sparas när du klickar Spara katalogen.')) return;
                const next = Object.assign({}, this._risksankEntries);
                delete next[namn];
                this._risksankEntries = next;
                this.renderRisksankandeKatalog();
            });
        });
    }

    _renameRisksankande(oldNamn, rawNext) {
        const namn = String(rawNext || '').trim();
        if (!oldNamn || !this._risksankEntries[oldNamn]) return;
        if (!namn || namn === oldNamn) {
            this.renderRisksankandeKatalog();
            return;
        }
        if (this._risksankEntries[namn]) {
            this.showNotification('Det finns redan en faktor med det namnet', 'error');
            this.renderRisksankandeKatalog();
            return;
        }
        const next = {};
        Object.keys(this._risksankEntries).forEach((k) => {
            next[k === oldNamn ? namn : k] = this._risksankEntries[k];
        });
        this._risksankEntries = next;
        this.renderRisksankandeKatalog();
    }

    addRisksankandeKatalogRad() {
        const input = document.getElementById('risksank-katalog-ny');
        const namn = String((input && input.value) || '').trim();
        if (!namn) return;
        const RS = window.RisksankandeKatalog;
        if (RS && RS.isIngaLabel && RS.isIngaLabel(namn)) {
            this.showNotification('Inga är ett fast val på kundkortet och läggs inte i katalogen', 'error');
            return;
        }
        if (this._risksankEntries && this._risksankEntries[namn]) {
            this.showNotification('Faktorn finns redan', 'error');
            return;
        }
        this._risksankEntries = Object.assign({}, this._risksankEntries, {
            [namn]: { forklaring: '', kalla: '' }
        });
        if (input) input.value = '';
        this.renderRisksankandeKatalog();
    }

    async saveRisksankandeKatalog() {
        const saveBtn = document.getElementById('risksank-katalog-save');
        const orig = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = 'Sparar...'; }
        try {
            const res = await riskAuthFetch(`${window.apiConfig.baseUrl}/api/risksankande-katalog`, {
                method: 'PATCH',
                body: JSON.stringify({ katalog: this._risksankEntries || {} })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            const RS = window.RisksankandeKatalog;
            this._risksankEntries = data.katalog
                || (RS && RS.persistKatalog ? RS.persistKatalog(this._risksankEntries).visible : this._risksankEntries);
            this.showNotification('Risksänkande faktorer sparade', 'success');
            this.renderRisksankandeKatalog();
        } catch (e) {
            this.showNotification(e.message || 'Kunde inte spara katalogen', 'error');
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = orig; }
        }
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
