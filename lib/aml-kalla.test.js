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
