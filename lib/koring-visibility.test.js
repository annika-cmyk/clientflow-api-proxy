const { test } = require('node:test');
const assert = require('node:assert/strict');
const KV = require('../public/js/koring-visibility.js');

const TODAY = '2026-08-17';

test('Bokslut with 2027 window is hidden in August 2026', () => {
    const bokslut = {
        Typ: 'Bokslut',
        Frekvens: 'Årsvis',
        Startdatum: '2027-01-01',
        'Nästa deadline': '2027-06-15',
        Status: 'Aktiv'
    };
    assert.equal(KV.isAssignmentOpenInMonth(bokslut, '2026-08'), false);
    assert.equal(KV.isAssignmentOverdueNotDone(bokslut, TODAY), false);
    assert.equal(KV.shouldShowAssignmentInPeriod(bokslut, '2026-08', TODAY), false);
});

test('Bokslut is visible inside its work window', () => {
    const bokslut = {
        Typ: 'Bokslut',
        Frekvens: 'Årsvis',
        Startdatum: '2027-01-01',
        'Nästa deadline': '2027-06-15',
        Status: 'Aktiv'
    };
    assert.equal(KV.shouldShowAssignmentInPeriod(bokslut, '2027-01', TODAY), true);
    assert.equal(KV.shouldShowAssignmentInPeriod(bokslut, '2027-06', TODAY), true);
    assert.equal(KV.shouldShowAssignmentInPeriod(bokslut, '2027-07', TODAY), false);
});

test('overdue unfinished assignment stays visible after the window', () => {
    const bokslut = {
        Typ: 'Bokslut',
        Frekvens: 'Årsvis',
        Startdatum: '2026-01-01',
        'Nästa deadline': '2026-06-15',
        Status: 'Aktiv'
    };
    assert.equal(KV.isAssignmentOpenInMonth(bokslut, '2026-08'), false);
    assert.equal(KV.isAssignmentOverdueNotDone(bokslut, TODAY), true);
    assert.equal(KV.shouldShowAssignmentInPeriod(bokslut, '2026-08', TODAY), true);
});

test('completed overdue assignment is hidden outside the window', () => {
    const run = {
        Typ: 'Bokslut',
        Startdatum: '2026-01-01',
        Deadline: '2026-06-15',
        Status: 'Klar'
    };
    assert.equal(KV.shouldShowRunInPeriod(run, '2026-08', TODAY), false);
    assert.equal(KV.shouldShowRunInPeriod(run, '2026-03', TODAY), true);
});

test('monthly assignment is open every month after start', () => {
    const moms = {
        Typ: 'Momsredovisning',
        Frekvens: 'Varje månad',
        Startdatum: '2025-01-01',
        Status: 'Aktiv'
    };
    assert.equal(KV.shouldShowAssignmentInPeriod(moms, '2026-08', TODAY), true);
    assert.equal(KV.shouldShowAssignmentInPeriod(moms, '2024-12', TODAY), false);
});

test('run without dates is not open and not overdue', () => {
    const run = { Typ: 'Bokslut', Status: 'Planerad' };
    assert.equal(KV.shouldShowRunInPeriod(run, '2026-08', TODAY), false);
});

test('monthly assignment without start stays visible', () => {
    const moms = { Typ: 'Momsredovisning', Frekvens: 'Varje månad', Status: 'Aktiv' };
    assert.equal(KV.shouldShowAssignmentInPeriod(moms, '2026-08', TODAY), true);
});

test('yearly assignment without dates is not open', () => {
    const bokslut = { Typ: 'Bokslut', Frekvens: 'Årsvis', Status: 'Aktiv' };
    assert.equal(KV.shouldShowAssignmentInPeriod(bokslut, '2026-08', TODAY), false);
});
