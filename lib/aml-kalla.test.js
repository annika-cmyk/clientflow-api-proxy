const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveKalla, isKallaUrl } = require('../public/js/aml-kalla');

describe('resolveKalla', () => {
    it('kopplar Skatteverket och Ekobrottsmyndigheten till officiell webbplats', () => {
        const skv = resolveKalla('Skatteverket');
        assert.equal(skv.label, 'Skatteverket');
        assert.equal(skv.url, 'https://www.skatteverket.se/');
        assert.equal(skv.host, 'skatteverket.se');

        const ebm = resolveKalla('Ekobrottsmyndigheten');
        assert.equal(ebm.label, 'Ekobrottsmyndigheten');
        assert.equal(ebm.url, 'https://www.ekobrottsmyndigheten.se/');
        assert.equal(ebm.host, 'ekobrottsmyndigheten.se');
    });

    it('behåller redan ifylld URL och visar värdnamn', () => {
        const r = resolveKalla('https://www.skatteverket.se/omoss');
        assert.equal(r.url, 'https://www.skatteverket.se/omoss');
        assert.equal(r.host, 'skatteverket.se');
        assert.equal(r.label, 'Skatteverket');
    });

    it('läser namn + URL från AI-text', () => {
        const r = resolveKalla('FATF — https://www.fatf-gafi.org/');
        assert.equal(r.url, 'https://www.fatf-gafi.org/');
        assert.match(r.label, /FATF/i);
        assert.equal(r.host, 'fatf-gafi.org');
    });

    it('länkar domän utan protokoll', () => {
        const r = resolveKalla('bra.se');
        assert.equal(r.url, 'https://bra.se');
        assert.equal(r.host, 'bra.se');
    });

    it('ger ingen länk för okänd fritext', () => {
        const r = resolveKalla('Intern byråpolicy 2024');
        assert.equal(r.url, '');
        assert.equal(r.label, 'Intern byråpolicy 2024');
    });

    it('kopplar kortformen Brå till bra.se', () => {
        const r = resolveKalla('Brå');
        assert.equal(r.url, 'https://bra.se/');
        assert.equal(r.host, 'bra.se');
    });

    it('isKallaUrl kräver http(s)', () => {
        assert.equal(isKallaUrl('https://polisen.se/'), true);
        assert.equal(isKallaUrl('Skatteverket'), false);
    });
});

describe('tydlig undersida', () => {
    const { formatKallaDisplay, pageFromUrl } = require('../public/js/aml-kalla');

    it('läser myndighet, undersida och sökväg från AI-text', () => {
        const r = resolveKalla('Ekobrottsmyndigheten — Penningtvätt — https://www.ekobrottsmyndigheten.se/om-ekobrott/penningtvatt/');
        assert.equal(r.label, 'Ekobrottsmyndigheten');
        assert.equal(r.page, 'Penningtvätt');
        assert.equal(r.url, 'https://www.ekobrottsmyndigheten.se/om-ekobrott/penningtvatt/');
        assert.match(r.path, /om-ekobrott\/penningtvatt/);
        const d = formatKallaDisplay(r);
        assert.match(d.linkText, /Ekobrottsmyndigheten/);
        assert.match(d.linkText, /Penningtvätt/);
    });

    it('tar bort avslutande tankstreck när undersida saknas', () => {
        const r = resolveKalla('Skatteverket — https://www.skatteverket.se/');
        assert.equal(r.label, 'Skatteverket');
        assert.equal(r.page, '');
        assert.equal(formatKallaDisplay(r).linkText, 'Skatteverket');
    });

    it('gör undersida av URL-sökvägen när sidtitel saknas', () => {
        assert.match(pageFromUrl('https://polisen.se/om-polisen/samordning-mot-penningtvatt-och-finansiering-av-terrorism/rapporter/'), /rapporter/i);
        const r = resolveKalla('https://www.skatteverket.se/foretagochorganisationer/moms');
        assert.equal(r.host, 'skatteverket.se');
        assert.match(r.page, /moms/i);
    });
});

describe('exakt dokumenthänvisning', () => {
    const {
        normalizeKalla,
        isGenericKallaUrl,
        KALLA_AI_RULES,
        KALLA_DOKUMENT_PROMPT
    } = require('../public/js/aml-kalla');

    const nraPdf = 'https://polisen.se/siteassets/dokument/om-polisen/penningtvatt/nationell-riskbedomning-av-penningtvatt-och-finansiering-av-terrorism-i-sverige-2024_2025.pdf';
    const vagStart = 'Nationell riskbedömning — Finansiering av terrorism — https://www.polisen.se/om-polisen/polisens-arbete/finanspolisen/';

    it('räknar Finanspolisens startsida som för vag', () => {
        assert.equal(isGenericKallaUrl('https://www.polisen.se/om-polisen/polisens-arbete/finanspolisen/'), true);
        assert.equal(isGenericKallaUrl(nraPdf), false);
    });

    it('skriver om vag NRA-källa till PDF och kapitel', () => {
        const out = normalizeKalla(vagStart);
        assert.match(out, /Samordningsfunktionen/);
        assert.match(out, /2024\/2025/);
        assert.match(out, /kap\. 4/);
        assert.match(out, /nationell-riskbedomning-av-penningtvatt/);
        assert.doesNotMatch(out, /polisens-arbete\/finanspolisen/);
    });

    it('låter en konkret undersida vara orörd', () => {
        const raw = 'Ekobrottsmyndigheten — Penningtvätt — https://www.ekobrottsmyndigheten.se/om-ekobrott/penningtvatt/';
        assert.equal(normalizeKalla(raw), raw);
    });

    it('visar PDF-länk för sparad vag NRA-källa', () => {
        const r = resolveKalla(vagStart);
        assert.equal(r.url, nraPdf);
        assert.match(r.label, /Samordningsfunktionen/);
        assert.match(r.page, /kap\. 4/);
    });

    it('ber AI peka på dokument och kapitel, inte startsida', () => {
        assert.match(KALLA_AI_RULES, /kap\. X/);
        assert.match(KALLA_AI_RULES, /Finanspolisens startsida/);
        assert.match(KALLA_DOKUMENT_PROMPT, /GODKÄNDA DOKUMENT/);
        assert.match(KALLA_DOKUMENT_PROMPT, /2024\/2025/);
    });

    it('API:t normaliserar AI-källor och skickar dokumentlistan i prompten', () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const indexJs = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
        assert.match(indexJs, /AmlKalla\.normalizeKalla/);
        assert.match(indexJs, /AmlKalla\.KALLA_DOKUMENT_PROMPT/);
        assert.match(indexJs, /Utgivare — Dokument ÅÅÅÅ, kap\. X/);
    });
});
