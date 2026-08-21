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

    function resolveKalla(raw) {
        const text = String(raw == null ? '' : raw).trim();
        if (!text) return { text: '', label: '', url: '', host: '' };

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

    function formatKallaDisplay(rawOrResolved) {
        const r = rawOrResolved && typeof rawOrResolved === 'object' && ('url' in rawOrResolved || 'label' in rawOrResolved)
            ? rawOrResolved
            : resolveKalla(rawOrResolved);
        const primary = r.label || r.host || r.text || '';
        const secondary = r.page || '';
        const path = r.path || r.host || '';
        const linkText = [primary, secondary].filter(Boolean).join(' · ') || path || 'Öppna källa';
        return {
            primary,
            secondary,
            path,
            url: r.url || '',
            linkText,
            title: r.url || primary
        };
    }

    const KALLA_AI_RULES = `KÄLLA på varje hot:
- Format: "Myndighet — Undersida — https://fullständig-url-till-undersidan"
- Peka på den undersida som faktiskt beskriver tillvägagångssättet, inte bara myndighetens startsida.
- Bra: "Ekobrottsmyndigheten — Penningtvätt — https://www.ekobrottsmyndigheten.se/om-ekobrott/penningtvatt/"
- Dåligt: "Ekobrottsmyndigheten — https://www.ekobrottsmyndigheten.se/"`;

    const api = {
        SITES,
        isKallaUrl,
        resolveKalla,
        formatKallaDisplay,
        pageFromUrl,
        pathDisplay,
        KALLA_AI_RULES
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.AmlKalla = api;
})(typeof window !== 'undefined' ? window : globalThis);
