/**
 * Verkliga huvudmän i KYC: namn, personnummer och skatterättslig hemvist.
 * Delas av kundkort, personregister och PDF.
 */
(function (global) {
    const UBO_FLAG = 'Utländska verkliga huvudmän (UBO)';

    function trimStr(value) {
        return value == null ? '' : String(value).trim();
    }

    function normalizePerson(p) {
        const src = p && typeof p === 'object' ? p : {};
        return {
            namn: trimStr(src.namn || src.name),
            personnr: trimStr(src.personnr || src.personnummer),
            hemvist: trimStr(src.skatterattslig_hemvist || src.hemvist) || 'Sverige',
            tin: trimStr(src.tin)
        };
    }

    function isForeignHemvist(hemvist) {
        const v = trimStr(hemvist).toLowerCase();
        return !!(v && v !== 'sverige' && v !== 'sweden' && v !== 'se');
    }

    function hasForeignHemvist(list) {
        return (Array.isArray(list) ? list : []).some((p) => {
            const person = normalizePerson(p);
            return isForeignHemvist(person.hemvist);
        });
    }

    function parseHuvudmanInfo(text) {
        return String(text || '')
            .split(/\n/)
            .map((line) => trimStr(line))
            .filter(Boolean)
            .map((line) => {
                const paren = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
                if (paren) return normalizePerson({ namn: paren[1], personnr: paren[2] });
                const tail = line.match(/^(.+?)\s+(\d{6,12}[- ]?\d{0,4})\s*$/);
                if (tail) return normalizePerson({ namn: tail[1], personnr: tail[2] });
                return normalizePerson({ namn: line });
            });
    }

    function formatHuvudmanInfo(list) {
        return (Array.isArray(list) ? list : [])
            .map((p) => normalizePerson(p))
            .filter((p) => p.namn || p.personnr)
            .map((p) => (p.personnr ? `${p.namn} (${p.personnr})` : p.namn))
            .join('\n');
    }

    function listFromSaved(saved, fallbackPeople) {
        const src = saved && typeof saved === 'object' ? saved : {};
        if (Array.isArray(src.huvudman) && src.huvudman.length) {
            return src.huvudman.map(normalizePerson);
        }
        if (Array.isArray(src.verkligaHuvudman) && src.verkligaHuvudman.length) {
            return src.verkligaHuvudman.map(normalizePerson);
        }
        if (trimStr(src.huvudmanInfo)) return parseHuvudmanInfo(src.huvudmanInfo);
        const fromKontakt = (Array.isArray(fallbackPeople) ? fallbackPeople : []).map((p) => (
            normalizePerson({
                namn: p.namn || p.name,
                personnr: p.personnr || p.personnummer,
                hemvist: p.skatterattslig_hemvist || p.hemvist,
                tin: p.tin
            })
        )).filter((p) => p.namn || p.personnr);
        return fromKontakt.length ? fromKontakt : [normalizePerson({})];
    }

    function isUboFlagLabel(namn) {
        const v = trimStr(namn).toLowerCase();
        if (!v) return false;
        return v === UBO_FLAG.toLowerCase()
            || /utl[äa]ndska verkliga huvudm/.test(v)
            || v === 'ubo utlandet'
            || /kunder med utl[äa]ndska huvudm/.test(v);
    }

    function mergeUtlandskaUboFlag(existing, hasForeign) {
        const list = Array.isArray(existing) ? existing.slice() : (existing ? [existing] : []);
        const kept = list.filter((raw) => {
            const label = raw && raw.name ? raw.name : raw;
            return trimStr(label) && trimStr(label) !== '---' && !isUboFlagLabel(label);
        });
        if (hasForeign) kept.push(UBO_FLAG);
        return kept;
    }

    const api = {
        UBO_FLAG,
        normalizePerson,
        isForeignHemvist,
        hasForeignHemvist,
        parseHuvudmanInfo,
        formatHuvudmanInfo,
        listFromSaved,
        isUboFlagLabel,
        mergeUtlandskaUboFlag
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.KycHuvudman = api;
})(typeof window !== 'undefined' ? window : globalThis);
