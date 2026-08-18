/**
 * Normaliserar Bolagsverket/SCB (värdefulla datamängder) till Clientflow-status.
 * Spara både originalvärden och company_status så nya koder inte tappar information.
 *
 * "Verksam organisation" betyder minst en av F-skatt, moms eller arbetsgivare hos SCB —
 * inte tre separata verifierade registreringar.
 */
(function (global) {
    const STATUS = {
        ACTIVE: 'ACTIVE',
        INACTIVE: 'INACTIVE',
        DEREGISTERED: 'DEREGISTERED',
        LIQUIDATION: 'LIQUIDATION',
        BANKRUPTCY: 'BANKRUPTCY',
        RECONSTRUCTION: 'RECONSTRUCTION',
        UNKNOWN: 'UNKNOWN'
    };

    const STATUS_LABEL = {
        ACTIVE: 'Aktiv',
        INACTIVE: 'Inaktiv',
        DEREGISTERED: 'Avregistrerad',
        LIQUIDATION: 'Likvidation',
        BANKRUPTCY: 'Konkurs',
        RECONSTRUCTION: 'Rekonstruktion',
        UNKNOWN: 'Okänd'
    };

    const VERKSAM_NOTE = 'SCB klassar organisationen som verksam om minst en av F-skatt, momsregistrering eller arbetsgivarregistrering finns. Det visar inte vilken registrering som gäller.';

    const AIRTABLE_STATUS_FIELD = 'Bolagsverket status';
    const AIRTABLE_ACTIVE_FIELD = 'Aktivt företag';
    const AIRTABLE_WARNING_FIELD = 'Intelligence varning';

    function isBlank(v) {
        return v == null || String(v).trim() === '';
    }

    function toDateStr(value) {
        const s = String(value == null ? '' : value).trim();
        if (!s) return '';
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : '';
    }

    function pickText(v) {
        if (v == null) return '';
        if (typeof v === 'string') return v.trim();
        if (typeof v === 'number') return String(v);
        return String(v.klartext || v.beskrivning || v.text || v.name || v.kod || '').trim();
    }

    function pickCode(v) {
        if (v == null) return '';
        if (typeof v === 'string') return v.trim();
        return String(v.kod || '').trim();
    }

    function isFelOnly(obj) {
        if (!obj || typeof obj !== 'object') return false;
        if (!obj.fel) return false;
        const keys = Object.keys(obj).filter((k) => k !== 'fel' && k !== 'dataproducent');
        return keys.every((k) => {
            const val = obj[k];
            if (val == null || val === '') return true;
            if (Array.isArray(val) && val.length === 0) return true;
            return false;
        });
    }

    function hasUsable(obj) {
        return !!(obj && typeof obj === 'object' && !isFelOnly(obj));
    }

    function extractOrganisations(payload) {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload.organisationer)) return payload.organisationer;
        if (Array.isArray(payload.data)) return payload.data;
        if (payload.organisationsnamn || payload.organisationsidentitet || payload.organisationsform) {
            return [payload];
        }
        return [];
    }

    function extractPrimaryOrg(payload) {
        const orgs = extractOrganisations(payload);
        return orgs[0] || null;
    }

    function parseSniList(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) {
            return raw.map((item) => {
                if (!item) return null;
                if (typeof item === 'string') return parseSniList(item)[0] || { kod: '', klartext: item.trim() };
                const kod = pickCode(item);
                const klartext = pickText(item);
                if (!kod && !klartext) return null;
                return { kod, klartext: klartext === kod ? '' : klartext };
            }).filter(Boolean);
        }
        if (typeof raw === 'string') {
            const s = raw.trim();
            if (!s) return [];
            const items = [];
            const re = /kod\s*=\s*([0-9]{4,6})\s*,\s*klartext\s*=\s*([^,]+?)(?=(?:\s*kod\s*=)|$)/gi;
            let m;
            while ((m = re.exec(s))) {
                items.push({ kod: m[1], klartext: m[2].trim() });
            }
            if (items.length) return items;
            return s.split(/\n|,/).map((row) => {
                const t = row.trim();
                if (!t) return null;
                const mm = t.match(/^(\d{4,6})\s*(?:[-–]\s*|\s+)(.+)$/);
                if (mm) return { kod: mm[1], klartext: mm[2].trim() };
                const mm2 = t.match(/^(\d{4,6})$/);
                if (mm2) return { kod: mm2[1], klartext: '' };
                return { kod: '', klartext: t };
            }).filter(Boolean);
        }
        return [];
    }

    function classifyEvent(code, text) {
        const c = String(code || '').trim().toUpperCase();
        const t = String(text || '').trim().toLowerCase();
        if (c === 'KK' || c === 'KONK' || t.includes('konkurs')) return STATUS.BANKRUPTCY;
        if (c === 'LI' || c === 'LIK' || c === 'LIAV' || t.includes('likvidation')) return STATUS.LIQUIDATION;
        if (c === 'RE' || c === 'REK' || c === 'FR' || t.includes('rekonstruktion') || t.includes('omstrukturering')) {
            return STATUS.RECONSTRUCTION;
        }
        return '';
    }

    function parseOngoingEvents(org) {
        const block = org?.pagaendeAvvecklingsEllerOmstruktureringsforfarande
            || org?.pagandeAvvecklingsEllerOmstruktureringsforsfarande
            || org?.pagandeAvveckling
            || null;
        if (!hasUsable(block)) return [];
        const list = Array.isArray(block.pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista)
            ? block.pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista
            : (Array.isArray(block.lista) ? block.lista : []);
        return list.map((item) => {
            if (!item) return null;
            const kod = pickCode(item);
            const klartext = pickText(item);
            const from = toDateStr(item.fromDatum || item.datum || item.from);
            const kind = classifyEvent(kod, klartext) || STATUS.UNKNOWN;
            if (!kod && !klartext) return null;
            return { kod, klartext, from, kind, raw: item };
        }).filter(Boolean);
    }

    function parseDeregistration(org) {
        const block = org?.avregistreradOrganisation;
        const reason = org?.avregistreringsorsak;
        const at = hasUsable(block) ? toDateStr(block.avregistreringsdatum || block.datum) : '';
        const reasonOk = hasUsable(reason);
        return {
            is_deregistered: !!(at || (reasonOk && pickCode(reason))),
            deregistered_at: at || '',
            deregistered_reason_code: reasonOk ? pickCode(reason) : '',
            deregistered_reason_text: reasonOk ? pickText(reason) : '',
            raw: {
                avregistreradOrganisation: block || null,
                avregistreringsorsak: reason || null
            }
        };
    }

    function parseNames(org) {
        const list = org?.organisationsnamn?.organisationsnamnLista || [];
        const names = list.map((n) => String(n?.namn || '').trim()).filter(Boolean);
        return {
            name: names[0] || '',
            all_names: names,
            namnskyddslopnummer: org?.namnskyddslopnummer == null ? '' : String(org.namnskyddslopnummer)
        };
    }

    function parseAddress(org) {
        const address = org?.postadressOrganisation?.postadress || {};
        const parts = [address.utdelningsadress, address.coAdress, address.postnummer, address.postort]
            .map((x) => String(x || '').trim())
            .filter(Boolean);
        return {
            street: String(address.utdelningsadress || '').trim(),
            co: String(address.coAdress || '').trim(),
            zip: String(address.postnummer || '').trim(),
            city: String(address.postort || '').trim(),
            full: parts.join(', ')
        };
    }

    function parseJaNej(block) {
        if (!hasUsable(block)) return '';
        const kod = String(block.kod || '').trim().toUpperCase();
        return kod === 'JA' || kod === 'NEJ' ? kod : '';
    }

    function warningForStatus(status, extras) {
        const label = STATUS_LABEL[status] || status;
        if (status === STATUS.BANKRUPTCY) {
            return {
                title: 'Konkurs',
                text: extras.eventText || 'Bolaget har en pågående konkurs registrerad hos Bolagsverket.'
            };
        }
        if (status === STATUS.LIQUIDATION) {
            return {
                title: 'Likvidation',
                text: extras.eventText || 'Bolaget är under likvidation.'
            };
        }
        if (status === STATUS.RECONSTRUCTION) {
            return {
                title: 'Rekonstruktion',
                text: extras.eventText || 'Bolaget genomgår rekonstruktion eller omstrukturering.'
            };
        }
        if (status === STATUS.DEREGISTERED) {
            const reason = extras.reasonText ? ` Orsak: ${extras.reasonText}.` : '';
            const at = extras.deregisteredAt ? ` Avregistrerad ${extras.deregisteredAt}.` : '';
            return {
                title: 'Avregistrerad',
                text: `Organisationen är avregistrerad.${at}${reason}`.trim()
            };
        }
        return { title: '', text: '' };
    }

    function deriveCompanyStatus(org) {
        const events = parseOngoingEvents(org);
        const dereg = parseDeregistration(org);
        const rank = {
            [STATUS.BANKRUPTCY]: 5,
            [STATUS.LIQUIDATION]: 4,
            [STATUS.RECONSTRUCTION]: 3,
            [STATUS.UNKNOWN]: 1
        };
        let eventKind = '';
        let eventText = '';
        events.forEach((ev) => {
            if ((rank[ev.kind] || 0) > (rank[eventKind] || 0)) {
                eventKind = ev.kind;
                eventText = [ev.klartext, ev.from ? `från ${ev.from}` : ''].filter(Boolean).join(' ');
            }
        });
        if (dereg.is_deregistered && !eventKind) {
            eventKind = classifyEvent(dereg.deregistered_reason_code, dereg.deregistered_reason_text);
        }

        let company_status = STATUS.UNKNOWN;
        if (eventKind === STATUS.BANKRUPTCY) company_status = STATUS.BANKRUPTCY;
        else if (eventKind === STATUS.LIQUIDATION) company_status = STATUS.LIQUIDATION;
        else if (eventKind === STATUS.RECONSTRUCTION) company_status = STATUS.RECONSTRUCTION;
        else if (dereg.is_deregistered) company_status = STATUS.DEREGISTERED;
        else {
            const verksam = parseJaNej(org?.verksamOrganisation);
            if (verksam === 'NEJ') company_status = STATUS.INACTIVE;
            else if (verksam === 'JA') company_status = STATUS.ACTIVE;
            else company_status = STATUS.ACTIVE;
        }

        const has_critical_company_event = [
            STATUS.BANKRUPTCY,
            STATUS.LIQUIDATION,
            STATUS.RECONSTRUCTION,
            STATUS.DEREGISTERED
        ].includes(company_status) || events.length > 0;

        const warning = warningForStatus(company_status, {
            eventText,
            reasonText: dereg.deregistered_reason_text,
            deregisteredAt: dereg.deregistered_at
        });

        return {
            company_status,
            company_status_label: STATUS_LABEL[company_status] || STATUS_LABEL.UNKNOWN,
            has_critical_company_event,
            ongoing_events: events,
            warning_title: warning.title,
            warning_text: warning.text,
            ...dereg
        };
    }

    function normalizeOrganisation(org, nowIso) {
        const names = parseNames(org);
        const address = parseAddress(org);
        const derived = deriveCompanyStatus(org);
        const sni = parseSniList(org?.naringsgrenOrganisation?.sni);
        const verksam = parseJaNej(org?.verksamOrganisation);
        const reklamsparr = parseJaNej(org?.reklamsparr) === 'JA';
        const orgForm = {
            kod: pickCode(org?.organisationsform),
            klartext: pickText(org?.organisationsform)
        };
        const juridisk = {
            kod: pickCode(org?.juridiskForm),
            klartext: pickText(org?.juridiskForm)
        };
        const orgnr = String(
            org?.organisationsidentitet?.identitetsbeteckning
            || org?.identitetsbeteckning
            || ''
        ).replace(/[^\d]/g, '');
        const description = pickText(org?.verksamhetsbeskrivning)
            || String(org?.verksamhetsbeskrivning?.beskrivning || '').trim();
        const registeredAt = toDateStr(org?.organisationsdatum?.registreringsdatum);
        const formedAt = toDateStr(org?.organisationsdatum?.bildandedatum || org?.organisationsdatum?.infortHosScb);

        return {
            company_status: derived.company_status,
            company_status_label: derived.company_status_label,
            has_critical_company_event: derived.has_critical_company_event,
            company_data_source: 'BOL/SCB',
            company_data_last_checked_at: nowIso || new Date().toISOString(),
            company_data_changed_at: '',
            manual_override: false,
            orgnr,
            name: names.name,
            all_names: names.all_names,
            namnskyddslopnummer: names.namnskyddslopnummer,
            registreringsland: pickCode(org?.registreringsland) || 'SE',
            organisation_form_code: orgForm.kod,
            organisation_form_text: orgForm.klartext,
            juridisk_form_code: juridisk.kod,
            juridisk_form_text: juridisk.klartext,
            address: address.full,
            address_parts: address,
            verksamhetsbeskrivning: description,
            sni,
            sni_primary: sni[0] || null,
            registered_at: registeredAt,
            formed_at: formedAt,
            verksam_organisation: verksam,
            verksam_organisation_note: VERKSAM_NOTE,
            reklamsparr,
            is_deregistered: derived.is_deregistered,
            deregistered_at: derived.deregistered_at,
            deregistered_reason_code: derived.deregistered_reason_code,
            deregistered_reason_text: derived.deregistered_reason_text,
            ongoing_events: derived.ongoing_events,
            warning_title: derived.warning_title,
            warning_text: derived.warning_text,
            latest_annual_report_period_end: '',
            latest_annual_report_registered_at: '',
            latest_annual_report_dokument_id: '',
            latest_annual_report_filformat: '',
            original: {
                organisationsform: org?.organisationsform || null,
                juridiskForm: org?.juridiskForm || null,
                verksamOrganisation: org?.verksamOrganisation || null,
                avregistreradOrganisation: org?.avregistreradOrganisation || null,
                avregistreringsorsak: org?.avregistreringsorsak || null,
                pagaendeAvvecklingsEllerOmstruktureringsforfarande:
                    org?.pagaendeAvvecklingsEllerOmstruktureringsforfarande
                    || org?.pagandeAvvecklingsEllerOmstruktureringsforsfarande
                    || null,
                reklamsparr: org?.reklamsparr || null,
                namnskyddslopnummer: org?.namnskyddslopnummer ?? null
            }
        };
    }

    function normalizeFromApiPayload(payload, nowIso) {
        const org = extractPrimaryOrg(payload);
        if (!org) {
            return {
                company_status: STATUS.UNKNOWN,
                company_status_label: STATUS_LABEL.UNKNOWN,
                has_critical_company_event: false,
                company_data_source: 'BOL/SCB',
                company_data_last_checked_at: nowIso || new Date().toISOString(),
                warning_title: '',
                warning_text: '',
                sni: [],
                ongoing_events: []
            };
        }
        return normalizeOrganisation(org, nowIso);
    }

    function attachLatestReport(snapshot, documents) {
        const next = snapshot && typeof snapshot === 'object' ? { ...snapshot } : {};
        const docs = normalizeDocumentList(documents);
        const latest = docs[0] || null;
        next.latest_annual_report_period_end = latest ? latest.rapporteringsperiodTom : '';
        next.latest_annual_report_registered_at = latest ? latest.registreringstidpunkt : '';
        next.latest_annual_report_dokument_id = latest ? latest.dokumentId : '';
        next.latest_annual_report_filformat = latest ? latest.filformat : '';
        next.annual_reports = docs.slice(0, 8);
        return next;
    }

    function normalizeDocumentList(documents) {
        const list = Array.isArray(documents) ? documents : [];
        return list.map((doc) => ({
            dokumentId: String(doc?.dokumentId || doc?.id || '').trim(),
            filformat: String(doc?.filformat || doc?.mimeType || '').trim(),
            rapporteringsperiodTom: toDateStr(doc?.rapporteringsperiodTom || doc?.periodTom || doc?.periodEnd),
            registreringstidpunkt: toDateStr(doc?.registreringstidpunkt || doc?.registeredAt)
        })).filter((d) => d.dokumentId).sort((a, b) => {
            return String(b.rapporteringsperiodTom || b.registreringstidpunkt)
                .localeCompare(String(a.rapporteringsperiodTom || a.registreringstidpunkt));
        });
    }

    function parseStoredSnapshot(raw) {
        if (!raw) return null;
        if (typeof raw === 'object') return raw;
        const s = String(raw).trim();
        if (!s) return null;
        try {
            return JSON.parse(s);
        } catch (_e) {
            return null;
        }
    }

    function snapshotToJson(snapshot) {
        try {
            return JSON.stringify(snapshot || {});
        } catch (_e) {
            return '{}';
        }
    }

    function namesLikelyMatch(a, b) {
        const n = (s) => String(s || '')
            .toLowerCase()
            .replace(/\b(ab|aktiebolag|hb|handelsbolag|kb|kommanditbolag)\b/g, '')
            .replace(/[^a-z0-9åäö]/g, '')
            .trim();
        const left = n(a);
        const right = n(b);
        return !!(left && right && left === right);
    }

    function airtableFieldsFromSnapshot(snapshot, existingFields) {
        const snap = snapshot || {};
        const fields = {};
        if (snap.name) fields.Namn = snap.name;
        if (snap.orgnr) fields.Orgnr = snap.orgnr;
        if (snap.registered_at) fields.regdatum = snap.registered_at;
        if (snap.organisation_form_text) fields.Bolagsform = snap.organisation_form_text;
        if (snap.address) fields.Address = snap.address;
        if (snap.verksamhetsbeskrivning) fields.Verksamhetsbeskrivning = snap.verksamhetsbeskrivning;
        if (Array.isArray(snap.sni) && snap.sni.length) {
            const lines = snap.sni
                .filter((s) => s && (s.kod || s.klartext))
                .map((s) => (s.klartext ? `${s.kod} - ${s.klartext}`.replace(/^ - /, '') : s.kod))
                .join('\n');
            if (lines) {
                const target = (existingFields && existingFields['SNI-koder'] != null && existingFields['SNI kod'] == null)
                    ? 'SNI-koder'
                    : 'SNI kod';
                fields[target] = lines;
            }
        }
        fields[AIRTABLE_ACTIVE_FIELD] = snap.company_status === STATUS.ACTIVE ? 'Ja' : 'Nej';
        fields[AIRTABLE_STATUS_FIELD] = snapshotToJson(snap);
        return fields;
    }

    function diffSnapshots(prevSnap, nextSnap, currentFields) {
        const prev = prevSnap || {};
        const next = nextSnap || {};
        const fields = currentFields || {};
        const rows = [];
        const push = (key, label, from, to, kind) => {
            const a = String(from == null ? '' : from).trim();
            const b = String(to == null ? '' : to).trim();
            if (a === b) return;
            rows.push({ key, label, prev: a, next: b, kind: kind || 'field' });
        };
        push('Namn', 'Företagsnamn', fields.Namn || prev.name, next.name, 'identity');
        push('Address', 'Adress', fields.Address || fields.Adress || prev.address, next.address);
        push('Bolagsform', 'Organisationsform', fields.Bolagsform || prev.organisation_form_text, next.organisation_form_text);
        push('regdatum', 'Registreringsdatum', fields.regdatum || prev.registered_at, next.registered_at);
        push('Verksamhetsbeskrivning', 'Verksamhetsbeskrivning', fields.Verksamhetsbeskrivning || prev.verksamhetsbeskrivning, next.verksamhetsbeskrivning);
        const sniTarget = (fields['SNI-koder'] != null && fields['SNI kod'] == null) ? 'SNI-koder' : 'SNI kod';
        const nextSni = (next.sni || []).map((s) => (s.klartext ? `${s.kod} - ${s.klartext}` : s.kod)).join('\n');
        push(sniTarget, 'SNI-koder', fields[sniTarget] || '', nextSni);
        push('company_status', 'Företagsstatus', prev.company_status_label || '', next.company_status_label, 'status');
        push(
            'latest_annual_report',
            'Senaste årsredovisning',
            prev.latest_annual_report_period_end || '',
            next.latest_annual_report_period_end || '',
            'report'
        );
        return rows;
    }

    const api = {
        STATUS,
        STATUS_LABEL,
        VERKSAM_NOTE,
        AIRTABLE_STATUS_FIELD,
        AIRTABLE_ACTIVE_FIELD,
        AIRTABLE_WARNING_FIELD,
        toDateStr,
        isFelOnly,
        extractOrganisations,
        extractPrimaryOrg,
        parseSniList,
        classifyEvent,
        deriveCompanyStatus,
        normalizeOrganisation,
        normalizeFromApiPayload,
        normalizeDocumentList,
        attachLatestReport,
        parseStoredSnapshot,
        snapshotToJson,
        namesLikelyMatch,
        airtableFieldsFromSnapshot,
        diffSnapshots
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.CompanyStatus = api;
})(typeof window !== 'undefined' ? window : globalThis);
