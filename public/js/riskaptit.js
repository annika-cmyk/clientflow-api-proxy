/**
 * Riskaptit: tröskel mot sammantagen residual-S×K (samma band som beraknaRiskniva).
 * Status: Inom_aptit | Kräver_beslut | Överskriden
 */
(function (global) {
    var RiskSkala = (typeof module !== 'undefined' && module.exports)
        ? require('./risk-skala')
        : (global.RiskSkala || null);

    var FIELDS = {
        STATUS: 'Riskaptit status',
        BESLUT_DATUM: 'Riskaptit beslut datum',
        BESLUT_AV: 'Riskaptit beslut av',
        BESLUT_MOTIVERING: 'Riskaptit beslut motivering',
        BESLUT_UTFALL: 'Riskaptit beslut utfall',
        BESLUT_RISKBILD: 'Riskaptit beslut för riskbild',
        HISTORIK: 'Riskaptit historik',
        RISK_CANONICAL: 'Riskniva',
        RISK_LEGACY: 'sammanlagd risk',
        RISK_POANG: 'Riskpoäng',
        SANKTIONER: 'Antal träffar PEP och sanktionslistor'
    };

    var STATUS = {
        INOM: 'Inom_aptit',
        KRAVER: 'Kräver_beslut',
        OVER: 'Överskriden'
    };

    var UTFALL = [
        'Fortsätter_med_skärpta_åtgärder',
        'Avslutas',
        'Avstår_nytt_uppdrag'
    ];

    var UTFALL_LABELS = {
        Fortsätter_med_skärpta_åtgärder: 'Fortsätter med skärpta åtgärder',
        Avslutas: 'Avslutas',
        Avstår_nytt_uppdrag: 'Avstår nytt uppdrag'
    };

    var MOTIVERING_MIN_LENGTH = 20;

    var STATUS_LABELS = {
        Inom_aptit: 'Inom riskaptit',
        Kräver_beslut: 'Kräver beslut',
        Överskriden: 'Överskriden'
    };

    function fieldStr(fields, key) {
        if (!fields) return '';
        var val = fields[key];
        if (val == null) return '';
        return String(val).trim();
    }

    function parseJson(raw, fallback) {
        if (raw == null || raw === '') return fallback;
        if (typeof raw === 'object') return raw;
        try {
            return JSON.parse(String(raw));
        } catch (_) {
            return fallback;
        }
    }

    function sxkBands() {
        var bands = [];
        var current = null;
        for (var p = 1; p <= 25; p++) {
            var level = RiskSkala.levelFromProduct(p);
            var label = level && level.label;
            if (!label) continue;
            if (!current || current.label !== label) {
                if (current) bands.push(current);
                current = { label: label, from: p, to: p };
            } else {
                current.to = p;
            }
        }
        if (current) bands.push(current);
        return bands;
    }

    function residualFromPoang(fields) {
        var poang = RiskSkala.parseRiskPoang(fields && (fields[FIELDS.RISK_POANG] || fields.Riskpoang));
        if (!poang) return { level: '', product: null, source: '' };
        var residual = RiskSkala.assessRisk(poang.sannolikhetEfter, poang.konsekvensEfter);
        if (residual.level) {
            return { level: residual.level, product: residual.product, source: 'residual_sxk' };
        }
        var inherent = RiskSkala.assessRisk(poang.sannolikhet, poang.konsekvens);
        if (inherent.level) {
            return { level: inherent.level, product: inherent.product, source: 'inneboende_sxk' };
        }
        return { level: '', product: null, source: '' };
    }

    /**
     * Kanoniskt fält är Riskniva. sammanlagd risk läses bara som fallback
     * för äldre poster. Residual-S×K i Riskpoäng vinner om den finns.
     */
    function resolveResidualNiva(fields) {
        var fromPoang = residualFromPoang(fields);
        if (fromPoang.level) return fromPoang.level;
        var raw = fieldStr(fields, FIELDS.RISK_CANONICAL) || fieldStr(fields, FIELDS.RISK_LEGACY) || fieldStr(fields, 'Risknivå');
        return RiskSkala.riskLabelSv(raw) || '';
    }

    function resolveResidualMeta(fields) {
        var fromPoang = residualFromPoang(fields);
        var niva = fromPoang.level || resolveResidualNiva(fields);
        return {
            niva: niva,
            product: fromPoang.product,
            source: fromPoang.source || (niva ? 'Riskniva' : '')
        };
    }

    function sanctionCount(fields) {
        var n = Number(fields && fields[FIELDS.SANKTIONER]);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function riskPictureKey(fields) {
        var niva = resolveResidualNiva(fields) || 'okänd';
        return niva + '|sanktioner:' + sanctionCount(fields);
    }

    function pictureNiva(key) {
        return String(key || '').split('|')[0] || '';
    }

    function pictureSanctions(key) {
        var m = String(key || '').match(/sanktioner:(\d+)/);
        return m ? Number(m[1]) : 0;
    }

    function isWorsePicture(previousKey, nextKey) {
        if (!nextKey || nextKey === previousKey) return false;
        var prevRank = RiskSkala.riskRank(pictureNiva(previousKey));
        var nextRank = RiskSkala.riskRank(pictureNiva(nextKey));
        if (nextRank > prevRank) return true;
        if (nextRank === prevRank && pictureSanctions(nextKey) > pictureSanctions(previousKey)) return true;
        return false;
    }

    function hasDecision(fields) {
        return !!(fieldStr(fields, FIELDS.BESLUT_UTFALL) && (
            fieldStr(fields, FIELDS.BESLUT_DATUM) || fieldStr(fields, FIELDS.BESLUT_MOTIVERING)
        ));
    }

    function hasValidDecisionForPicture(fields, pictureKey) {
        if (!hasDecision(fields)) return false;
        var stored = fieldStr(fields, FIELDS.BESLUT_RISKBILD);
        if (!stored) return false;
        return stored === pictureKey;
    }

    function deriveStatus(niva, validDecision) {
        var key = RiskSkala.normalizeRiskKey(niva);
        if (key === 'unacceptable') return STATUS.OVER;
        if (key === 'high') return validDecision ? STATUS.INOM : STATUS.KRAVER;
        return STATUS.INOM;
    }

    function evaluateCustomer(fields) {
        var meta = resolveResidualMeta(fields);
        var picture = riskPictureKey(fields);
        var valid = hasValidDecisionForPicture(fields, picture);
        var status = deriveStatus(meta.niva, valid);
        var needsAction = status === STATUS.KRAVER || (status === STATUS.OVER && !valid);
        return {
            niva: meta.niva,
            product: meta.product,
            source: meta.source,
            pictureKey: picture,
            status: status,
            statusLabel: STATUS_LABELS[status] || status,
            hasDecision: hasDecision(fields),
            hasValidDecision: valid,
            needsAction: needsAction,
            showBanner: status === STATUS.KRAVER || status === STATUS.OVER,
            beslutUtfall: fieldStr(fields, FIELDS.BESLUT_UTFALL),
            beslutMotivering: fieldStr(fields, FIELDS.BESLUT_MOTIVERING),
            beslutDatum: fieldStr(fields, FIELDS.BESLUT_DATUM),
            beslutAv: fieldStr(fields, FIELDS.BESLUT_AV),
            historik: parseHistorik(fields[FIELDS.HISTORIK])
        };
    }

    function parseHistorik(raw) {
        var parsed = parseJson(raw, []);
        return Array.isArray(parsed) ? parsed : [];
    }

    function snapshotDecision(fields, extra) {
        if (!hasDecision(fields)) return null;
        return Object.assign({
            at: fieldStr(fields, FIELDS.BESLUT_DATUM) || '',
            utfall: fieldStr(fields, FIELDS.BESLUT_UTFALL),
            motivering: fieldStr(fields, FIELDS.BESLUT_MOTIVERING),
            beslutAv: fieldStr(fields, FIELDS.BESLUT_AV),
            forRiskbild: fieldStr(fields, FIELDS.BESLUT_RISKBILD),
            niva: pictureNiva(fieldStr(fields, FIELDS.BESLUT_RISKBILD)) || resolveResidualNiva(fields)
        }, extra || {});
    }

    function RISK_TRIGGER_KEYS() {
        return [FIELDS.RISK_CANONICAL, FIELDS.RISK_LEGACY, 'Risknivå', FIELDS.RISK_POANG, 'Riskpoang', FIELDS.SANKTIONER];
    }

    function incomingTouchesRisk(incoming) {
        if (!incoming || typeof incoming !== 'object') return false;
        return RISK_TRIGGER_KEYS().some(function (key) {
            return Object.prototype.hasOwnProperty.call(incoming, key);
        });
    }

    function applyOnRiskChange(input) {
        var previous = (input && input.previousFields) || {};
        var incoming = (input && input.incomingFields) || {};
        var next = Object.assign({}, previous, incoming);
        var prevEval = evaluateCustomer(previous);
        var nextEval = evaluateCustomer(next);
        var writeFields = {};
        if (nextEval.status !== fieldStr(next, FIELDS.STATUS)) {
            writeFields[FIELDS.STATUS] = nextEval.status;
        }
        var worsened = isWorsePicture(prevEval.pictureKey, nextEval.pictureKey);
        return {
            previous: prevEval,
            next: nextEval,
            writeFields: writeFields,
            statusChanged: nextEval.status !== prevEval.status || !!writeFields[FIELDS.STATUS],
            worsened: worsened,
            shouldWrite: incomingTouchesRisk(incoming) || Object.keys(writeFields).length > 0
        };
    }

    function validateBeslut(input) {
        var utfall = String((input && input.utfall) || '').trim();
        var motivering = String((input && input.motivering) || '').trim();
        if (UTFALL.indexOf(utfall) === -1) {
            return { ok: false, error: 'Välj utfall för beslutet.' };
        }
        if (motivering.length < MOTIVERING_MIN_LENGTH) {
            return { ok: false, error: 'Motivering krävs (minst ' + MOTIVERING_MIN_LENGTH + ' tecken).' };
        }
        return { ok: true, utfall: utfall, motivering: motivering };
    }

    function registerBeslut(input) {
        var fields = (input && input.fields) || {};
        var actor = String((input && input.actor) || '').trim();
        var nowIso = String((input && input.nowIso) || new Date().toISOString()).slice(0, 10);
        var checked = validateBeslut(input);
        if (!checked.ok) return checked;
        var historik = parseHistorik(fields[FIELDS.HISTORIK]);
        var previousSnap = snapshotDecision(fields, { ersatt: nowIso });
        if (previousSnap) historik.push(previousSnap);
        var picture = riskPictureKey(fields);
        var niva = resolveResidualNiva(fields);
        var nextFields = Object.assign({}, fields, {
            [FIELDS.BESLUT_UTFALL]: checked.utfall,
            [FIELDS.BESLUT_MOTIVERING]: checked.motivering,
            [FIELDS.BESLUT_AV]: actor,
            [FIELDS.BESLUT_DATUM]: nowIso,
            [FIELDS.BESLUT_RISKBILD]: picture
        });
        var status = deriveStatus(niva, true);
        var writeFields = {
            [FIELDS.BESLUT_UTFALL]: checked.utfall,
            [FIELDS.BESLUT_MOTIVERING]: checked.motivering,
            [FIELDS.BESLUT_AV]: actor,
            [FIELDS.BESLUT_DATUM]: nowIso,
            [FIELDS.BESLUT_RISKBILD]: picture,
            [FIELDS.STATUS]: status,
            [FIELDS.HISTORIK]: JSON.stringify(historik)
        };
        return {
            ok: true,
            writeFields: writeFields,
            previousDecision: previousSnap,
            historik: historik,
            status: status,
            niva: niva,
            pictureKey: picture,
            evaluation: evaluateCustomer(Object.assign({}, nextFields, writeFields))
        };
    }

    function policyText() {
        var bands = sxkBands();
        var lines = [
            'Byråns riskaptit är kodad i ClientFlow (beraknaRiskniva / RiskSkala.levelFromProduct) och ska inte skilja sig från denna text.',
            '',
            'Sammantagen residualrisk räknas som sannolikhet × konsekvens (S×K) på skalan 1–5 × 1–5:'
        ];
        bands.forEach(function (band) {
            var extra = '';
            if (band.label === 'Hög') extra = ' — kräver dokumenterat beslut om fortsatt affärsförbindelse (riskaptitStatus = Kräver_beslut tills beslut registrerats).';
            if (band.label === 'Oacceptabel') extra = ' — överskrider byråns riskaptit (riskaptitStatus = Överskriden). Dokumenterat beslut krävs.';
            lines.push('- ' + band.label + ': S×K ' + band.from + '–' + band.to + extra);
        });
        lines.push('');
        lines.push('Kundspecifika beslut och historik registreras på kundkortet och i revisionsloggen (riskaptit_status_ändrad, riskaptit_beslut_registrerat), inte i detta byrådokument.');
        return lines.join('\n');
    }

    function nivaDisplayLabel(niva) {
        return RiskSkala.riskLabelSv(niva) || niva || '';
    }

    function utfallLabel(utfall) {
        return UTFALL_LABELS[utfall] || utfall || '';
    }

    var api = {
        FIELDS: FIELDS,
        STATUS: STATUS,
        UTFALL: UTFALL,
        UTFALL_LABELS: UTFALL_LABELS,
        STATUS_LABELS: STATUS_LABELS,
        MOTIVERING_MIN_LENGTH: MOTIVERING_MIN_LENGTH,
        sxkBands: sxkBands,
        resolveResidualNiva: resolveResidualNiva,
        resolveResidualMeta: resolveResidualMeta,
        riskPictureKey: riskPictureKey,
        isWorsePicture: isWorsePicture,
        deriveStatus: deriveStatus,
        evaluateCustomer: evaluateCustomer,
        applyOnRiskChange: applyOnRiskChange,
        incomingTouchesRisk: incomingTouchesRisk,
        validateBeslut: validateBeslut,
        registerBeslut: registerBeslut,
        parseHistorik: parseHistorik,
        policyText: policyText,
        nivaDisplayLabel: nivaDisplayLabel,
        utfallLabel: utfallLabel
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.Riskaptit = api;
})(typeof window !== 'undefined' ? window : globalThis);
