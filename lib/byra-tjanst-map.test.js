const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapByraTjanstRecord, parseJsonList } = require('./byra-tjanst-map');

test('prefers the new agency assessment over leftover template fields', () => {
    const mapped = mapByraTjanstRecord({
        id: 'rec1',
        fields: {
            'Task Name': 'Bokslut',
            'Riskbedömning': 'Medel',
            'TJÄNSTTYP': 'Redovisning',
            'Tjänstebeskrivning': 'Upprättande av årsbokslut.',
            'Beskrivning av riskfaktor': 'Gammal malltext som inte ska visas',
            'Åtgjärd': 'Gammal åtgärdsmall',
            'Hot': JSON.stringify([{ typ: 'PT', titel: 'Fiktiva leverantörer', beskrivning: 'Risk för strukturering.' }]),
            'Sårbarheter': JSON.stringify([{ kategori: 'Kunder', titel: 'Kontanter', beskrivning: 'Kontantintensiv verksamhet.' }]),
            'Tjänstespecifika åtgärder': JSON.stringify([{ titel: 'Känn kunden', beskrivning: 'Bedöm om transaktioner är rimliga.' }])
        }
    });

    assert.equal(mapped.beskrivning, 'Upprättande av årsbokslut.');
    assert.equal(mapped.tjanstebeskrivning, 'Upprättande av årsbokslut.');
    assert.equal(mapped.hot.length, 1);
    assert.equal(mapped.hot[0].titel, 'Fiktiva leverantörer');
    assert.equal(mapped.sarbarheter[0].kategori, 'Kunder');
    assert.match(mapped.atgard, /Känn kunden/);
    assert.doesNotMatch(mapped.atgard, /Gammal åtgärdsmall/);
});

test('falls back to legacy fields when the new assessment is empty', () => {
    const mapped = mapByraTjanstRecord({
        id: 'rec2',
        fields: {
            'Task Name': 'Moms',
            'Beskrivning av riskfaktor': 'Äldre risktext',
            'Åtgjärd': 'Äldre åtgärd'
        }
    });
    assert.equal(mapped.beskrivning, 'Äldre risktext');
    assert.equal(mapped.atgard, 'Äldre åtgärd');
    assert.deepEqual(mapped.hot, []);
});

test('parseJsonList ignores broken JSON', () => {
    assert.deepEqual(parseJsonList('not-json'), []);
    assert.deepEqual(parseJsonList([{ titel: 'ok' }]), [{ titel: 'ok' }]);
});
