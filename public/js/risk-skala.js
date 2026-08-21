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
        fold: fold
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.RiskSkala = api;
})(typeof window !== 'undefined' ? window : globalThis);
