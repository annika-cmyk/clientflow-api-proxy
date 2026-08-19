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
            const leftover = text.replace(url, '').replace(/[()[\]—–\-]+/g, ' ').replace(/\s+/g, ' ').trim();
            return {
                text,
                label: leftover || (known && known.label) || hostnameOf(url) || url,
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
                url,
                host: hostnameOf(url)
            };
        }

        const known = matchKnown(text);
        if (known) {
            return { text, label: known.label, url: known.url, host: known.host };
        }

        return { text, label: text, url: '', host: '' };
    }

    const api = {
        SITES,
        isKallaUrl,
        resolveKalla
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.AmlKalla = api;
})(typeof window !== 'undefined' ? window : globalThis);
