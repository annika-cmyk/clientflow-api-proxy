/**
 * Kopplar AML-källor (myndighetsnamn eller URL) till officiell webbplats.
 * Delas av byråns tjänsterisk och kundkortet.
 */
(function (global) {
    const SITES = [
        {
            keys: ['ekobrottsmyndigheten', 'ekobrott'],
            label: 'Ekobrottsmyndigheten',
            host: 'ekobrottsmyndigheten.se',
            url: 'https://www.ekobrottsmyndigheten.se/'
        },
        {
            keys: ['skatteverket'],
            label: 'Skatteverket',
            host: 'skatteverket.se',
            url: 'https://www.skatteverket.se/'
        },
        {
            keys: ['finanspolisen', 'fipo'],
            label: 'Finanspolisen',
            host: 'polisen.se',
            url: 'https://polisen.se/om-polisen/organisation/sarskilda-organisationer/finanspolisen/'
        },
        {
            keys: ['samordningsfunktionen'],
            label: 'Samordningsfunktionen',
            host: 'fi.se',
            url: 'https://www.fi.se/sv/penningtvatt/samordningsfunktionen-mot-penningtvatt-och-finansiering-av-terrorism/'
        },
        {
            keys: ['finansinspektionen'],
            label: 'Finansinspektionen',
            host: 'fi.se',
            url: 'https://www.fi.se/'
        },
        {
            keys: ['polismyndigheten', 'polisen'],
            label: 'Polisen',
            host: 'polisen.se',
            url: 'https://polisen.se/'
        },
        {
            keys: ['fatf', 'fatf-gafi'],
            label: 'FATF',
            host: 'fatf-gafi.org',
            url: 'https://www.fatf-gafi.org/'
        },
        {
            keys: ['europol'],
            label: 'Europol',
            host: 'europol.europa.eu',
            url: 'https://www.europol.europa.eu/'
        },
        {
            keys: ['eu-kommissionen', 'europeiska kommissionen', 'commission.europa'],
            label: 'EU-kommissionen',
            host: 'commission.europa.eu',
            url: 'https://commission.europa.eu/'
        },
        {
            keys: ['brottsforebyggande radet', 'brottsförebyggande rådet', 'bra.se', 'bra'],
            label: 'Brå',
            host: 'bra.se',
            url: 'https://bra.se/'
        },
        {
            keys: ['sakerhetspolisen', 'sapo'],
            label: 'Säkerhetspolisen',
            host: 'sakerhetspolisen.se',
            url: 'https://sakerhetspolisen.se/'
        },
        {
            keys: ['bolagsverket'],
            label: 'Bolagsverket',
            host: 'bolagsverket.se',
            url: 'https://bolagsverket.se/'
        }
    ];

    function fold(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function hostnameOf(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch (_) {
            return '';
        }
    }

    function extractUrls(text) {
        const matches = String(text || '').match(/https?:\/\/[^\s)>\]]+/gi) || [];
        return matches.map((u) => u.replace(/[.,;]+$/g, ''));
    }

    function splitNamePage(leftover) {
        const cleaned = String(leftover || '')
            .replace(/[\s]*[—–\-|:]+[\s]*$/g, '')
            .trim();
        const parts = cleaned
            .split(/\s*[—–|]\s+|\s+-\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
        if (parts.length >= 2) {
            return { label: parts[0], page: parts.slice(1).join(' · ') };
        }
        return { label: cleaned, page: '' };
    }

    function humanizeSegment(seg) {
        const raw = decodeURIComponent(String(seg || ''))
            .replace(/\.(html|aspx|php)$/i, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!raw) return '';
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    function pathParts(url) {
        try {
            const u = new URL(url);
            return u.pathname.split('/').filter(Boolean);
        } catch (_) {
            return [];
        }
    }

    function isHomepage(url) {
        const parts = pathParts(url);
        return parts.length === 0 || (parts.length === 1 && /^(sv|en|index)$/i.test(parts[0]));
    }

    function pageFromUrl(url) {
        const parts = pathParts(url);
        if (!parts.length) return '';
        const skip = /^(sv|en|om-polisen|organisation|topics|en-topics)$/i;
        const useful = parts.filter((p) => !skip.test(p));
        const last = useful[useful.length - 1] || parts[parts.length - 1];
        return humanizeSegment(last);
    }

    function pathDisplay(url) {
        try {
            const u = new URL(url);
            const path = u.pathname.replace(/\/$/, '') || '/';
            return hostnameOf(url) + (path === '/' ? '' : path);
        } catch (_) {
            return hostnameOf(url);
        }
    }

    function isKallaUrl(value) {
        return /^https?:\/\//i.test(String(value || '').trim());
    }

    function looksLikeDomain(value) {
        return /^(https?:\/\/)?(www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/?#].*)?$/i.test(String(value || '').trim());
    }

    function includesKey(hay, key) {
        const k = fold(key);
        if (!k) return false;
        if (k.length <= 3) {
            return new RegExp('(?:^|[^a-z0-9])' + k + '(?:[^a-z0-9]|$)').test(hay);
        }
        return hay.includes(k);
    }

    function matchKnown(text) {
        const hay = fold(text);
        let best = null;
        let bestLen = 0;
        SITES.forEach((site) => {
            site.keys.forEach((key) => {
                if (includesKey(hay, key) && key.length > bestLen) {
                    best = site;
                    bestLen = key.length;
                }
            });
        });
        return best;
    }

    const NRA_2024_PDF =
        'https://polisen.se/siteassets/dokument/om-polisen/penningtvatt/nationell-riskbedomning-av-penningtvatt-och-finansiering-av-terrorism-i-sverige-2024_2025.pdf';
    const NRA_RAPPORTER_URL =
        'https://polisen.se/om-polisen/samordning-mot-penningtvatt-och-finansiering-av-terrorism/rapporter/';

    const KALLA_DOKUMENT = [
        {
            id: 'nra-2024-2025',
            keys: ['nationell riskbedomning', 'nationella riskbedomningen', 'nra 2024', '2024/2025'],
            publisher: 'Samordningsfunktionen',
            title: 'Nationell riskbedömning 2024/2025',
            url: NRA_2024_PDF,
            sections: [
                { keys: ['finansiering av terrorism', 'terrorfinans', 'terror'], label: 'kap. 4 Finansiering av terrorism' },
                { keys: ['bokforing', 'redovisning', 'bokslut'], label: 'kap. 7.19 Bokförings- och revisionstjänster' },
                { keys: ['skatteradgiv', 'deklaration', 'rot', 'rut'], label: 'kap. 7.20 Skatterådgivare' },
                { keys: ['revisor'], label: 'kap. 7.18 Revisorer' },
                { keys: ['mojliggorare'], label: 'kap. 5 Tvärgående risker' }
            ]
        },
        {
            id: 'ebm-pt-naringsverksamhet',
            keys: ['penningtvatt i naringsverksamhet'],
            publisher: 'Ekobrottsmyndigheten',
            title: 'Penningtvätt i näringsverksamhet (2024)',
            url: 'https://www.ekobrottsmyndigheten.se/wp-content/uploads/se/2024/12/penningtvatt-i-naringsverksamhet-inkl-sammanfattning-1.pdf'
        },
        {
            id: 'ebm-penningtvattsbrott',
            keys: ['penningtvattsbrott'],
            publisher: 'Ekobrottsmyndigheten',
            title: 'Penningtvättsbrott',
            url: 'https://www.ekobrottsmyndigheten.se/om-ekobrott/brotten-vi-utreder/penningtvattsbrott/'
        },
        {
            id: 'ebm-redovisningskonsult',
            keys: ['vagledning for redovisningskonsulter', 'redovisningskonsult'],
            publisher: 'Ekobrottsmyndigheten',
            title: 'Vägledning för redovisningskonsulter',
            url: 'https://www.ekobrottsmyndigheten.se/om-ekobrott/tipsa-om-ekobrott/redovisningskonsult/'
        },
        {
            id: 'fi-prioriterade-2026',
            keys: ['prioriterade risker'],
            publisher: 'Finansinspektionen',
            title: 'Prioriterade risker inom penningtvätt, TF och sanktioner (2026)',
            url: 'https://www.fi.se/sv/publicerat/rapporter/rapporter/2026/fis-prioriterade-risker-inom-penningtvatt-finansiering-av-terrorism-och-internationella-sanktioner/'
        },
        {
            id: 'polisen-rapporter',
            keys: ['rapporter och omvarldsbevak'],
            publisher: 'Polismyndigheten',
            title: 'Rapporter och omvärldsbevakningar',
            url: NRA_RAPPORTER_URL
        },
        {
            id: 'fatf-recommendations',
            keys: ['fatf-rekommendation', 'fatf recommendations', 'fatf standards'],
            publisher: 'FATF',
            title: 'FATF Recommendations',
            url: 'https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html'
        }
    ];

    const GENERIC_LANDING_PATHS = [
        'om-polisen/polisens-arbete/finanspolisen',
        'om-polisen/organisation/sarskilda-organisationer/finanspolisen',
        'om-polisen',
        'sv/penningtvatt',
        'sv/penningtvatt/samordningsfunktionen-mot-penningtvatt-och-finansiering-av-terrorism',
        'om-ekobrott',
        'om-oss'
    ];

    function matchBest(list, text, pickKeys) {
        const hay = fold(text);
        let best = null;
        let bestLen = 0;
        list.forEach((item) => {
            (pickKeys(item) || []).forEach((key) => {
                if (includesKey(hay, key) && key.length > bestLen) {
                    best = item;
                    bestLen = key.length;
                }
            });
        });
        return best;
    }

    function matchDokument(text) {
        return matchBest(KALLA_DOKUMENT, text, (doc) => doc.keys);
    }

    function matchDokumentSection(doc, text) {
        if (!doc || !Array.isArray(doc.sections) || !doc.sections.length) return '';
        const hit = matchBest(doc.sections, text, (sec) => sec.keys);
        return hit ? hit.label : '';
    }

    function isGenericKallaUrl(url) {
        const raw = String(url || '').trim();
        if (!raw) return true;
        if (isHomepage(raw)) return true;
        const path = pathParts(raw).join('/').replace(/\/+$/, '').toLowerCase();
        if (!path) return true;
        return GENERIC_LANDING_PATHS.some((g) => path === g);
    }

    function formatDokumentKalla(doc, section, url) {
        const href = url || doc.url;
        const mid = section ? `${doc.title}, ${section}` : doc.title;
        return `${doc.publisher} — ${mid} — ${href}`;
    }

    function sameishKallaTitle(a, b) {
        const clean = (v) => fold(v).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
        const fa = clean(a);
        const fb = clean(b);
        if (!fa || !fb) return false;
        return fa === fb || fa.includes(fb) || fb.includes(fa);
    }

    function normalizeKalla(raw) {
        const text = String(raw == null ? '' : raw).trim();
        if (!text) return '';
        const doc = matchDokument(text);
        if (!doc) return text;
        const urls = extractUrls(text);
        const url = urls[0] || '';
        const leftover = text.replace(url, '').replace(/[()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
        const named = splitNamePage(leftover);
        const sectionMatch = matchDokumentSection(doc, leftover + ' ' + named.page);
        // Do not treat the document title itself as a "section" — that duplicated
        // "Penningtvätt i näringsverksamhet (2024)" in the stored/display string.
        const pageAsSection = named.page && !sameishKallaTitle(named.page, doc.title) ? named.page : '';
        const section = sectionMatch || pageAsSection || '';
        const keepUrl = url && !isGenericKallaUrl(url);
        return formatDokumentKalla(doc, section, keepUrl ? url : doc.url);
    }

    function resolveFromText(text) {
        const urls = extractUrls(text);
        if (urls.length) {
            const url = urls[0];
            const known = matchKnown(text);
            const leftover = text.replace(url, '').replace(/[()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
            const named = splitNamePage(leftover);
            const page = named.page || pageFromUrl(url);
            return {
                text,
                label: named.label || (known && known.label) || hostnameOf(url) || url,
                page: isHomepage(url) && !named.page ? '' : page,
                path: pathDisplay(url),
                url,
                host: hostnameOf(url)
            };
        }

        if (looksLikeDomain(text)) {
            const url = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/\//, '')}`;
            const known = matchKnown(text);
            return {
                text,
                label: (known && known.label) || hostnameOf(url) || text,
                page: pageFromUrl(url),
                path: pathDisplay(url),
                url,
                host: hostnameOf(url)
            };
        }

        const known = matchKnown(text);
        if (known) {
            return { text, label: known.label, page: '', path: known.host, url: known.url, host: known.host };
        }

        return { text, label: text, page: '', path: '', url: '', host: '' };
    }

    function resolveKalla(raw) {
        const original = String(raw == null ? '' : raw).trim();
        if (!original) return { text: '', label: '', url: '', host: '' };
        const normalized = normalizeKalla(original);
        const parsed = resolveFromText(normalized);
        parsed.text = original;
        return parsed;
    }

    function formatKallaDisplay(rawOrResolved) {
        const r = rawOrResolved && typeof rawOrResolved === 'object' && ('url' in rawOrResolved || 'label' in rawOrResolved)
            ? rawOrResolved
            : resolveKalla(rawOrResolved);
        const primary = r.label || r.host || r.text || '';
        const secondary = r.page && !sameishKallaTitle(r.page, primary) ? r.page : '';
        const path = r.path || r.host || '';
        const linkText = [primary, secondary].filter(Boolean).join(' · ') || path || 'Öppna källa';
        return {
            primary,
            secondary,
            path,
            host: r.host || '',
            url: r.url || '',
            linkText,
            title: r.url || primary
        };
    }

    const KALLA_AI_RULES = `KÄLLA på varje hot:
- Format: "Utgivare — Dokumenttitel ÅÅÅÅ, kap. X Avsnitt — https://exakt-url-till-dokumentet"
- Peka på det dokument eller den rapportsida som faktiskt beskriver tillvägagångssättet. Inte myndighetens startsida och inte en generell avdelningssida (t.ex. Finanspolisens startsida).
- Ange år och kapitel/avsnitt när dokumentet har det. För nationell riskbedömning: kap. 4 vid TF, kap. 7.19 vid bokföring/redovisning, kap. 7.20 vid skatt/deklaration/ROT-RUT, kap. 7.18 vid revision.
- Hitta inte på webbadresser. Använd bara URL:er från källistan eller från file_search-träffar med synlig URL.
- Bra: "Samordningsfunktionen — Nationell riskbedömning 2024/2025, kap. 4 Finansiering av terrorism — ${NRA_2024_PDF}"
- Dåligt: "Nationell riskbedömning — Finansiering av terrorism — https://www.polisen.se/om-polisen/polisens-arbete/finanspolisen/"`;

    const KALLA_DOKUMENT_PROMPT = [
        'GODKÄNDA DOKUMENT (använd dessa URL:er i stället för myndigheters startsidor):',
        ...KALLA_DOKUMENT.map((doc) => {
            const secs = Array.isArray(doc.sections) && doc.sections.length
                ? ` Avsnitt: ${doc.sections.map((s) => s.label).join('; ')}.`
                : '';
            return `- ${doc.publisher} — ${doc.title} — ${doc.url}.${secs}`;
        })
    ].join('\n');

    const api = {
        SITES,
        KALLA_DOKUMENT,
        isKallaUrl,
        isGenericKallaUrl,
        matchDokument,
        normalizeKalla,
        resolveKalla,
        formatKallaDisplay,
        pageFromUrl,
        pathDisplay,
        KALLA_AI_RULES,
        KALLA_DOKUMENT_PROMPT
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.AmlKalla = api;
})(typeof window !== 'undefined' ? window : globalThis);
