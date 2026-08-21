/**
 * Gemensam femgradig riskskala för tjänster, övriga riskfaktorer, kund och byrå.
 * Låg · Normal · Förhöjd · Hög · Oacceptabel
 *
 * Gamla tregradiga värden läses som alias: Lag→Låg, Medel→Normal, Hog→Hög.
 */
(function (global) {
    var LEVELS = [
        {
            key: 'low',
            label: 'Låg',
            rank: 1,
            css: 'low',
            aliases: ['lag', 'low', 'låg', 'lag risk', 'låg risk']
        },
        {
            key: 'normal',
            label: 'Normal',
            rank: 2,
            css: 'normal',
            aliases: ['normal', 'medel', 'medium', 'med', 'normal risk', 'medel risk']
        },
        {
            key: 'elevated',
            label: 'Förhöjd',
            rank: 3,
            css: 'elevated',
            aliases: ['forhojd', 'förhöjd', 'elevated', 'forhojd risk', 'förhöjd risk']
        },
        {
            key: 'high',
            label: 'Hög',
            rank: 4,
            css: 'high',
            aliases: ['hog', 'high', 'hög', 'hog risk', 'hög risk']
        },
        {
            key: 'unacceptable',
            label: 'Oacceptabel',
            rank: 5,
            css: 'unacceptable',
            aliases: ['oacceptabel', 'unacceptable', 'oaccept', 'oacceptabel risk']
        }
    ];

    var BY_KEY = {};
    var BY_ALIAS = {};
    LEVELS.forEach(function (level) {
        BY_KEY[level.key] = level;
        BY_ALIAS[fold(level.label)] = level;
        BY_ALIAS[level.key] = level;
        (level.aliases || []).forEach(function (alias) {
            BY_ALIAS[fold(alias)] = level;
        });
    });

    var PREFIX_RE = /^\s*(?:\*\*)?sammantagen riskniv[aå]\s*:\s*\*?\*?\s*([^\n*]+)/i;

    var DEFINITIONS = [
        { label: 'Låg', text: 'Begränsad exponering. Standardåtgärder räcker.' },
        { label: 'Normal', text: 'Typisk redovisningskund eller -tjänst. Grundläggande kundkännedom.' },
        { label: 'Förhöjd', text: 'En eller flera riskhöjande faktorer. Skärpt uppföljning.' },
        { label: 'Hög', text: 'Flera samverkande faktorer eller en allvarlig enskild faktor. Förstärkt kundkännedom.' },
        { label: 'Oacceptabel', text: 'Utanför byråns riskaptit. Avstå från eller avveckla affärsförbindelsen.' }
    ];

    function fold(value) {
        return String(value == null ? '' : value)
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');
    }

    function lookup(raw) {
        var folded = fold(raw);
        if (!folded) return null;
        return BY_ALIAS[folded] || BY_KEY[folded] || null;
    }

    function normalizeRiskKey(raw) {
        var fromPrefix = extractPrefixedLevel(raw);
        if (fromPrefix) return fromPrefix;
        var level = lookup(raw);
        return level ? level.key : null;
    }

    function riskLabelSv(raw) {
        var key = typeof raw === 'string' && BY_KEY[raw] ? raw : normalizeRiskKey(raw);
        return key && BY_KEY[key] ? BY_KEY[key].label : '';
    }

    function riskRank(raw) {
        var key = normalizeRiskKey(raw);
        return key && BY_KEY[key] ? BY_KEY[key].rank : 0;
    }

    function riskCss(raw) {
        var key = normalizeRiskKey(raw);
        return key && BY_KEY[key] ? BY_KEY[key].css : 'normal';
    }

    function riskItemClass(raw) {
        return 'risk-' + riskCss(raw);
    }

    function riskPillClass(raw) {
        return 'risk-pill--' + riskCss(raw);
    }

    function riskBtnClass(raw) {
        var css = riskCss(raw);
        if (css === 'elevated') return 'is-forhojd';
        if (css === 'unacceptable') return 'is-oacceptabel';
        return 'is-' + css;
    }

    function extractPrefixedLevel(raw) {
        var text = String(raw == null ? '' : raw);
        var match = text.match(PREFIX_RE);
        if (!match) return null;
        var level = lookup(match[1]);
        return level ? level.key : null;
    }

    function stripRiskLevelPrefix(text) {
        return String(text == null ? '' : text).replace(PREFIX_RE, '').replace(/^\s+/, '');
    }

    function withRiskLevelPrefix(text, rawLevel) {
        var body = stripRiskLevelPrefix(text);
        var label = riskLabelSv(rawLevel);
        if (!label) return body;
        return 'Sammantagen risknivå: ' + label + (body ? '\n\n' + body : '');
    }

    function labels() {
        return LEVELS.map(function (level) { return level.label; });
    }

    function optionHtml(selected, opts) {
        var includeEmpty = !opts || opts.includeEmpty !== false;
        var emptyLabel = (opts && opts.emptyLabel) || 'Välj risknivå';
        var selectedKey = normalizeRiskKey(selected);
        var html = includeEmpty ? '<option value="">' + emptyLabel + '</option>' : '';
        LEVELS.forEach(function (level) {
            var sel = selectedKey === level.key ? ' selected' : '';
            html += '<option value="' + level.label + '"' + sel + '>' + level.label + '</option>';
        });
        return html;
    }

    function emptyCounts() {
        return {
            Låg: 0,
            Normal: 0,
            Förhöjd: 0,
            Hög: 0,
            Oacceptabel: 0,
            Övrigt: 0
        };
    }

    function countRisk(counts, raw) {
        var bag = counts || emptyCounts();
        var label = riskLabelSv(raw);
        if (label && Object.prototype.hasOwnProperty.call(bag, label)) bag[label] += 1;
        else if (String(raw == null ? '' : raw).trim()) bag.Övrigt += 1;
        return bag;
    }

    function sameLevel(a, b) {
        var ka = normalizeRiskKey(a);
        var kb = normalizeRiskKey(b);
        return !!(ka && kb && ka === kb);
    }

    function isHighOrAbove(raw) {
        return riskRank(raw) >= 4;
    }

    function isElevatedOrAbove(raw) {
        return riskRank(raw) >= 3;
    }

    function definitionsHtml() {
        return DEFINITIONS.map(function (item) {
            return '<li><strong>' + item.label + '</strong> — ' + item.text + '</li>';
        }).join('');
    }

    function definitionsPlain() {
        return DEFINITIONS.map(function (item) {
            return item.label + ': ' + item.text;
        }).join('\n');
    }

    // S×K (1–5) → femgradig skala. Samma trösklar för inneboende risk och residualrisk.
    // 1–4 Låg, 5–9 Normal, 10–15 Förhöjd, 16–19 Hög, 20–25 Oacceptabel.
    function toScore(value) {
        if (value == null || value === '') return null;
        var n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 5) return null;
        return n;
    }

    function levelFromProduct(product) {
        if (product == null || !isFinite(product)) return null;
        if (product <= 4) return BY_KEY.low;
        if (product <= 9) return BY_KEY.normal;
        if (product <= 15) return BY_KEY.elevated;
        if (product <= 19) return BY_KEY.high;
        return BY_KEY.unacceptable;
    }

    function assessRisk(sannolikhet, konsekvens) {
        var s = toScore(sannolikhet);
        var k = toScore(konsekvens);
        if (s == null || k == null) {
            return {
                sannolikhet: s,
                konsekvens: k,
                product: null,
                level: '',
                levelKey: '',
                badge: ''
            };
        }
        var product = s * k;
        var level = levelFromProduct(product);
        return {
            sannolikhet: s,
            konsekvens: k,
            product: product,
            level: level ? level.label : '',
            levelKey: level ? level.key : '',
            badge: level ? (level.label + ' (S×K ' + product + ')') : ''
        };
    }

    function formatInneboendeBadge(assessment) {
        if (!assessment || !assessment.level) return 'Inneboende risk: Ej satt';
        return 'Inneboende risk: ' + assessment.badge;
    }

    function formatResidualBadge(assessment) {
        if (!assessment || !assessment.level) return 'Residualrisk: Ej satt';
        return 'Residualrisk: ' + assessment.badge;
    }

    function scoresFromLegacyLevel(raw) {
        var key = normalizeRiskKey(raw);
        if (key === 'low') return { sannolikhet: 2, konsekvens: 2 };
        if (key === 'normal') return { sannolikhet: 3, konsekvens: 3 };
        if (key === 'elevated') return { sannolikhet: 3, konsekvens: 4 };
        if (key === 'high') return { sannolikhet: 4, konsekvens: 4 };
        if (key === 'unacceptable') return { sannolikhet: 5, konsekvens: 5 };
        return { sannolikhet: null, konsekvens: null };
    }

    function scoreOptionHtml(selected, opts) {
        var emptyLabel = (opts && opts.emptyLabel) || 'Ej satt';
        var selectedScore = toScore(selected);
        var html = '<option value="">' + emptyLabel + '</option>';
        for (var i = 1; i <= 5; i++) {
            html += '<option value="' + i + '"' + (selectedScore === i ? ' selected' : '') + '>' + i + '</option>';
        }
        return html;
    }

    function looksLikeRiskPoang(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        return toScore(obj.sannolikhet ?? obj.s ?? obj.likelihood) != null
            || toScore(obj.konsekvens ?? obj.k ?? obj.consequence) != null
            || toScore(obj.sannolikhetEfter ?? obj.sEfter ?? obj.residualLikelihood) != null
            || toScore(obj.konsekvensEfter ?? obj.kEfter ?? obj.residualConsequence) != null;
    }

    function normalizePoang(obj) {
        var raw = obj || {};
        return {
            sannolikhet: toScore(raw.sannolikhet ?? raw.s ?? raw.likelihood),
            konsekvens: toScore(raw.konsekvens ?? raw.k ?? raw.consequence),
            sannolikhetEfter: toScore(raw.sannolikhetEfter ?? raw.sEfter ?? raw.residualLikelihood),
            konsekvensEfter: toScore(raw.konsekvensEfter ?? raw.kEfter ?? raw.residualConsequence)
        };
    }

    function parseRiskPoang(raw) {
        if (!raw) return null;
        if (typeof raw === 'object' && !Array.isArray(raw)) {
            return looksLikeRiskPoang(raw) ? normalizePoang(raw) : null;
        }
        if (typeof raw !== 'string') return null;
        var t = raw.trim();
        if (!t) return null;
        try {
            var parsed = JSON.parse(t);
            return looksLikeRiskPoang(parsed) ? normalizePoang(parsed) : null;
        } catch (_) {
            return null;
        }
    }

    function serializeRiskPoang(poang) {
        var n = normalizePoang(poang || {});
        var out = {
            sannolikhet: n.sannolikhet,
            konsekvens: n.konsekvens,
            sannolikhetEfter: n.sannolikhetEfter,
            konsekvensEfter: n.konsekvensEfter
        };
        if (poang && (poang.kraverManualOversyn === true || poang.requiresReview === true)) {
            out.kraverManualOversyn = true;
        }
        return JSON.stringify(out);
    }

    function beraknaRiskniva(sannolikhet, konsekvens) {
        return assessRisk(sannolikhet, konsekvens).level || '';
    }

    function normalizePtTf(raw) {
        var t = fold(raw);
        if (!t) return '';
        if (t === 'tf' || t === 'terrorfinansiering' || t.indexOf('terror') === 0) return 'TF';
        if (t === 'bada' || t === 'pt/tf' || t === 'pttf' || t === 'bagge' || t === 'bada pt/tf') return 'Båda';
        if (t === 'pt' || t === 'penningtvatt' || t.indexOf('penning') === 0) return 'PT';
        return '';
    }

    function isTfRelevant(raw) {
        var v = normalizePtTf(raw);
        return v === 'TF' || v === 'Båda';
    }

    function migrateLegacyRiskScores(rawLevel) {
        var inferred = scoresFromLegacyLevel(rawLevel);
        return {
            sannolikhet: inferred.sannolikhet,
            konsekvens: inferred.konsekvens,
            sannolikhetEfter: inferred.sannolikhet,
            konsekvensEfter: inferred.konsekvens,
            kraverManualOversyn: true
        };
    }

    function poangNeedsReview(raw) {
        if (!raw) return false;
        var obj = raw;
        if (typeof raw === 'string') {
            try { obj = JSON.parse(raw); } catch (_) { return false; }
        }
        return !!(obj && typeof obj === 'object' && (obj.kraverManualOversyn === true || obj.requiresReview === true));
    }

    function readTjanstRisk(fields) {
        var f = fields || {};
        var stored = parseRiskPoang(f['Riskpoäng'] || f.Riskpoang);
        if (!stored) stored = parseRiskPoang(f['Samspelsexempel']);
        var legacy = String(f['Riskbedömning'] || '').trim();
        var sannolikhet = stored && stored.sannolikhet;
        var konsekvens = stored && stored.konsekvens;
        if (sannolikhet == null || konsekvens == null) {
            var inferred = scoresFromLegacyLevel(legacy);
            if (sannolikhet == null) sannolikhet = inferred.sannolikhet;
            if (konsekvens == null) konsekvens = inferred.konsekvens;
        }
        var inherent = assessRisk(sannolikhet, konsekvens);
        var residual = assessRisk(stored && stored.sannolikhetEfter, stored && stored.konsekvensEfter);
        return {
            sannolikhet: inherent.sannolikhet,
            konsekvens: inherent.konsekvens,
            product: inherent.product,
            level: inherent.level || riskLabelSv(legacy) || '',
            badge: inherent.badge || riskLabelSv(legacy),
            sannolikhetEfter: residual.sannolikhet,
            konsekvensEfter: residual.konsekvens,
            residualProduct: residual.product,
            residualLevel: residual.level,
            residualBadge: residual.badge
        };
    }

    function readOvrigRisk(fields) {
        var f = fields || {};
        var stored = parseRiskPoang(f['Riskpoäng'] || f.Riskpoang);
        var legacy = String(f['Riskbedömning'] || '').trim();
        var fromLegacy = false;
        if (!stored && legacy) {
            stored = normalizePoang(migrateLegacyRiskScores(legacy));
            fromLegacy = true;
        }
        var inherent = assessRisk(stored && stored.sannolikhet, stored && stored.konsekvens);
        var residual = assessRisk(stored && stored.sannolikhetEfter, stored && stored.konsekvensEfter);
        return {
            sannolikhet: inherent.sannolikhet,
            konsekvens: inherent.konsekvens,
            product: inherent.product,
            level: inherent.level || riskLabelSv(legacy) || '',
            badge: inherent.badge || riskLabelSv(legacy),
            sannolikhetEfter: residual.sannolikhet,
            konsekvensEfter: residual.konsekvens,
            residualProduct: residual.product,
            residualLevel: residual.level,
            residualBadge: residual.badge,
            ptTfRelevans: normalizePtTf(f['PT/TF-relevans'] || f.ptTfRelevans),
            kraverManualOversyn: fromLegacy || poangNeedsReview(f['Riskpoäng'] || f.Riskpoang)
        };
    }

    function ovrigNeedsMigration(fields) {
        var stored = parseRiskPoang(fields && (fields['Riskpoäng'] || (fields && fields.Riskpoang)));
        return !stored && !!(fields && String(fields['Riskbedömning'] || '').trim());
    }

    function ovrigMigrationFields(fields) {
        var f = fields || {};
        var migrated = migrateLegacyRiskScores(f['Riskbedömning']);
        var out = {
            Riskpoäng: serializeRiskPoang(migrated),
            Riskbedömning: beraknaRiskniva(migrated.sannolikhet, migrated.konsekvens) || f['Riskbedömning']
        };
        if (!String(f['PT/TF-relevans'] || '').trim()) out['PT/TF-relevans'] = 'PT';
        return out;
    }

    var api = {
        LEVELS: LEVELS,
        DEFINITIONS: DEFINITIONS,
        normalizeRiskKey: normalizeRiskKey,
        riskLabelSv: riskLabelSv,
        riskRank: riskRank,
        riskCss: riskCss,
        riskItemClass: riskItemClass,
        riskPillClass: riskPillClass,
        riskBtnClass: riskBtnClass,
        extractPrefixedLevel: extractPrefixedLevel,
        stripRiskLevelPrefix: stripRiskLevelPrefix,
        withRiskLevelPrefix: withRiskLevelPrefix,
        labels: labels,
        optionHtml: optionHtml,
        emptyCounts: emptyCounts,
        countRisk: countRisk,
        sameLevel: sameLevel,
        isHighOrAbove: isHighOrAbove,
        isElevatedOrAbove: isElevatedOrAbove,
        definitionsHtml: definitionsHtml,
        definitionsPlain: definitionsPlain,
        fold: fold,
        toScore: toScore,
        levelFromProduct: levelFromProduct,
        assessRisk: assessRisk,
        formatInneboendeBadge: formatInneboendeBadge,
        formatResidualBadge: formatResidualBadge,
        scoresFromLegacyLevel: scoresFromLegacyLevel,
        scoreOptionHtml: scoreOptionHtml,
        parseRiskPoang: parseRiskPoang,
        serializeRiskPoang: serializeRiskPoang,
        readTjanstRisk: readTjanstRisk,
        readOvrigRisk: readOvrigRisk,
        beraknaRiskniva: beraknaRiskniva,
        normalizePtTf: normalizePtTf,
        isTfRelevant: isTfRelevant,
        migrateLegacyRiskScores: migrateLegacyRiskScores,
        poangNeedsReview: poangNeedsReview,
        ovrigNeedsMigration: ovrigNeedsMigration,
        ovrigMigrationFields: ovrigMigrationFields
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.RiskSkala = api;
})(typeof window !== 'undefined' ? window : globalThis);
