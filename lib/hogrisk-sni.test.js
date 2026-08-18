const { test } = require('node:test');
const assert = require('node:assert/strict');
const HogriskSni = require('../public/js/hogrisk-sni.js');

test('redovisning SNI 69201 matches Redovisning etc.', () => {
    const found = HogriskSni.matchSni('69201 Redovisning och bokföring');
    assert.deepEqual(found.branscher, ['Redovisning etc.']);
    assert.deepEqual(found.codes, ['69201']);
});

test('bilhandel and bygg match their regexes', () => {
    const found = HogriskSni.matchSni('45110 Försäljning av personbilar\n41200 Byggande av bostadshus');
    assert.ok(found.branscher.includes('Bilhandel'));
    assert.ok(found.branscher.includes('Bygg'));
    assert.ok(found.codes.includes('45110'));
    assert.ok(found.codes.includes('41200'));
});

test('ordinary IT SNI is not high risk', () => {
    const found = HogriskSni.matchSni('62010 Dataprogrammering');
    assert.deepEqual(found.branscher, []);
    assert.deepEqual(found.codes, []);
});

test('69102 matches both Bolagsbildning and Oberoende jurister', () => {
    const found = HogriskSni.matchSni('69102 Juridisk verksamhet');
    assert.ok(found.branscher.includes('Bolagsbildning'));
    assert.ok(found.branscher.includes('Oberoende jurister'));
});

test('comma-separated Bolagsverket string is parsed', () => {
    const found = HogriskSni.parseSniEntries('70200 - Konsultverksamhet, 01500 - Blandat jordbruk');
    assert.deepEqual(found.map((x) => x.kod), ['70200', '01500']);
});

test('invalid regex does not throw', () => {
    const found = HogriskSni.matchSni('66120', [{ label: 'Trasig', regex: '(' }]);
    assert.deepEqual(found.branscher, []);
});

test('patternsFromRecords reads Airtable field names', () => {
    const patterns = HogriskSni.patternsFromRecords([
        { fields: { 'Text SNI kod': 'Restaurang', 'Regex-mönster': '5610\\d' } },
        { fields: { 'Text SNI kod': '', 'Regex-mönster': '999' } }
    ]);
    assert.deepEqual(patterns, [{ label: 'Restaurang', regex: '5610\\d' }]);
    const found = HogriskSni.matchSni('56101 Restaurangverksamhet', patterns);
    assert.deepEqual(found.branscher, ['Restaurang']);
});

test('mergeLabels keeps manual picks and adds SNI hits', () => {
    assert.deepEqual(
        HogriskSni.mergeLabels(['Bygg', '---'], ['Redovisning etc.', 'Bygg']),
        ['Bygg', 'Redovisning etc.']
    );
});
