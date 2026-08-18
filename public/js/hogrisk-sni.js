/**
 * Matchar kundens SNI-koder mot Högrisk SNI (Airtable).
 * Delas av API och kundkort.
 */
(function (global) {
    const DEFAULT_PATTERNS = [
        { label: 'Växlingskontor', regex: '66120' },
        { label: 'Bilhandel', regex: '45\\d{3,}' },
        { label: 'Skrot- och metallhandel', regex: '46770' },
        { label: 'Smycken/antikviteter', regex: '4777\\d' },
        { label: 'Bygg', regex: '4[1-3]\\d{3,}' },
        { label: 'Bemanning', regex: '7810\\d' },
        { label: 'Restaurang', regex: '5610\\d' },
        { label: 'Städning', regex: '8121\\d' },
        { label: 'Bolagsbildning', regex: '6910\\d' },
        { label: 'Redovisning etc.', regex: '6920\\d' },
        { label: 'Spelbolag', regex: '9200\\d' },
        { label: 'Trustförvaltning', regex: '643\\d' },
        { label: 'Fastighetsmäklare', regex: '6831\\d' },
        { label: 'Oberoende jurister', regex: '691\\d' }
    ];

    function digitsOf(value) {
        return String(value == null ? '' : value).replace(/\D/g, '');
    }

    function parseSniEntries(raw) {
        const s = Array.isArray(raw) ? raw.join('\n') : String(raw || '');
        if (!s.trim()) return [];
        const chunks = s
            .split(/\n/)
            .flatMap((row) => String(row).split(','))
            .map((row) => row.trim())
            .filter(Boolean);
        const seen = new Set();
        const entries = [];
        chunks.forEach((row) => {
            const m = row.match(/^(\d{4,6})\s*(?:[-–]\s*|\s{1,})(.+)$/) || row.match(/^(\d{4,6})$/);
            const kod = m ? m[1] : '';
            if (!kod || seen.has(kod)) return;
            seen.add(kod);
            entries.push({ kod, label: m && m[2] ? String(m[2]).trim() : '' });
        });
        return entries;
    }

    function compileRegex(pattern) {
        const src = String(pattern || '').trim();
        if (!src) return null;
        try {
            return new RegExp(src);
        } catch (_) {
            return null;
        }
    }

    function codeMatchesPattern(kod, pattern) {
        const digits = digitsOf(kod);
        if (!digits || !pattern) return false;
        const re = compileRegex(pattern);
        if (re && re.test(digits)) return true;
        const literal = String(pattern).trim();
        return /^\d+$/.test(literal) && (digits === literal || digits.startsWith(literal));
    }

    function normalizePatterns(list) {
        const src = Array.isArray(list) && list.length ? list : DEFAULT_PATTERNS;
        return src
            .map((p) => ({
                label: String(p?.label || p?.bransch || '').trim(),
                regex: String(p?.regex || p?.pattern || '').trim()
            }))
            .filter((p) => p.label && p.regex);
    }

    function matchSni(raw, patterns) {
        const entries = parseSniEntries(raw);
        const rules = normalizePatterns(patterns);
        const matches = [];
        const branschSet = new Set();
        const codeSet = new Set();
        entries.forEach((entry) => {
            rules.forEach((rule) => {
                if (!codeMatchesPattern(entry.kod, rule.regex)) return;
                codeSet.add(entry.kod);
                branschSet.add(rule.label);
                matches.push({
                    kod: entry.kod,
                    beskrivning: entry.label,
                    bransch: rule.label,
                    regex: rule.regex
                });
            });
        });
        return {
            matches,
            branscher: Array.from(branschSet),
            codes: Array.from(codeSet)
        };
    }

    function fieldName(fields, names) {
        const src = fields || {};
        for (let i = 0; i < names.length; i++) {
            if (src[names[i]] != null && String(src[names[i]]).trim()) return names[i];
        }
        return names[0];
    }

    function sniRawFromFields(fields) {
        const src = fields || {};
        const key = fieldName(src, ['SNI kod', 'SNI-koder', 'SNI-kod', 'SNI-bransch']);
        return src[key] || '';
    }

    function listLabels(raw) {
        if (Array.isArray(raw)) return raw.map((v) => String(v || '').trim()).filter((v) => v && v !== '---');
        return String(raw || '')
            .split(/[,;\n]/)
            .map((v) => v.trim())
            .filter((v) => v && v !== '---');
    }

    function mergeLabels(existing, incoming) {
        const out = [];
        const seen = new Set();
        listLabels(existing).concat(listLabels(incoming)).forEach((label) => {
            const key = label.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(label);
        });
        return out;
    }

    function patternsFromRecords(records) {
        const out = [];
        (Array.isArray(records) ? records : []).forEach((rec) => {
            const f = rec?.fields || rec || {};
            const label = String(f['Text SNI kod'] || f['Text SNI'] || f.Namn || f.label || '').trim();
            const regex = String(f['Regex-mönster'] || f['Regex-monster'] || f.Regex || f.regex || '').trim();
            if (label && regex) out.push({ label, regex });
        });
        return out;
    }

    function matchFromFields(fields, patterns) {
        return matchSni(sniRawFromFields(fields), patterns);
    }

    const api = {
        DEFAULT_PATTERNS,
        parseSniEntries,
        codeMatchesPattern,
        matchSni,
        matchFromFields,
        sniRawFromFields,
        mergeLabels,
        listLabels,
        patternsFromRecords
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.HogriskSni = api;
})(typeof window !== 'undefined' ? window : globalThis);
