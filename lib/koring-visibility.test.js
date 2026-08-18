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

test('open-run list hides Klar even inside the work window', () => {
    const run = {
        Typ: 'Momsredovisning',
        Startdatum: '2026-07-01',
        Deadline: '2026-08-17',
        Status: 'Klar'
    };
    assert.equal(KV.shouldShowOpenRunInPeriod(run, '2026-08', TODAY), false);
    assert.equal(KV.shouldShowOpenRunInPeriod({
        ...run,
        Status: 'Planerad'
    }, '2026-08', TODAY), true);
});

test('unfinished previous run stays visible and is overdue', () => {
    const run = {
        Typ: 'Momsredovisning',
        Startdatum: '2026-06-01',
        Deadline: '2026-07-12',
        Status: 'Planerad'
    };
    assert.equal(KV.shouldShowOpenRunInPeriod(run, '2026-08', TODAY), true);
    assert.equal(KV.runAttentionKind(run, TODAY), 'overdue');
});

test('deadline within 5 days is due-soon, not overdue', () => {
    const run = {
        Typ: 'Löneuppdrag',
        Startdatum: '2026-08-01',
        Deadline: '2026-08-20',
        Status: 'Pågående'
    };
    assert.equal(KV.isDueSoon(run, TODAY, 5), true);
    assert.equal(KV.runAttentionKind(run, TODAY), 'due-soon');
    assert.equal(KV.isDueSoon({ ...run, Deadline: '2026-08-16' }, TODAY, 5), false);
    assert.equal(KV.runAttentionKind({ ...run, Deadline: TODAY }, TODAY), 'due-soon');
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
