const { test } = require('node:test');
const assert = require('node:assert/strict');
const MomsPeriod = require('../public/js/moms-period.js');

test('monthly and quarterly use SKV auto dates', () => {
    assert.equal(MomsPeriod.usesSkvAutoDates('Varje månad'), true);
    assert.equal(MomsPeriod.usesSkvAutoDates('Varje kvartal'), true);
    assert.equal(MomsPeriod.isYearlyFreq('Varje månad'), false);
    assert.equal(MomsPeriod.isYearlyFreq('Varje kvartal'), false);
});

test('yearly VAT uses manual start and deadline', () => {
    assert.equal(MomsPeriod.usesSkvAutoDates('Årsvis'), false);
    assert.equal(MomsPeriod.usesSkvAutoDates('Årsvis med deklaration'), false);
    assert.equal(MomsPeriod.isYearlyFreq('Årsvis'), true);
    assert.equal(MomsPeriod.isYearlyFreq('Årsvis med deklaration'), true);
});
