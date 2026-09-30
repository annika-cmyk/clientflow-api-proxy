'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  canonicalize,
  sameForm,
  extractFormsFromText,
  extractFormsFromRecord,
  isBolagsformRecord,
  suggestedRecordIds,
  mergeLinkedIds,
  linkedIdsChanged,
  suggestedFactorLabels,
  mergedBolagsformRiskfaktorName,
  customerBolagsform
} = require('./bolagsform-styrning');

const bolagRecs = [
  {
    id: 'recAb01',
    fields: {
      Riskfaktor: 'Kunder med bolagsform Aktiebolag',
      Beskrivning: 'Byråprofilen anger bolagsformen Aktiebolag i kundstocken.',
      'Typ av riskfaktor': 'Riskfaktorer kopplat till kund'
    }
  },
  {
    id: 'recEf01',
    fields: {
      Riskfaktor: 'Kunder med bolagsform Enskild firma',
      Beskrivning: 'Byråprofilen anger bolagsformen Enskild firma i kundstocken.',
      'Typ av riskfaktor': 'Riskfaktorer kopplat till kund'
    }
  },
  {
    id: 'recMerged01',
    fields: {
      Riskfaktor: 'Enskild firma · 57; Aktiebolag · 46',
      Beskrivning:
        '• Kunder med bolagsform Enskild firma — Byråprofilen anger bolagsformen Enskild firma\n' +
        '• Kunder med bolagsform Aktiebolag — Byråprofilen anger bolagsformen Aktiebolag',
      'Typ av riskfaktor': 'Riskfaktorer kopplat till kund'
    }
  },
  {
    id: 'recMergedNamed01',
    fields: {
      Riskfaktor: 'Kunder med bolagsformerna Enskild firma, Aktiebolag',
      'Typ av riskfaktor': 'Riskfaktorer kopplat till kund'
    }
  },
  {
    id: 'recKont01',
    fields: {
      Riskfaktor: 'Kunder med mycket kontanta transaktioner',
      'Typ av riskfaktor': 'Riskfaktorer kopplat till kund'
    }
  },
  {
    id: 'recGeo01',
    fields: {
      Riskfaktor: 'Kunder med bolagsform Aktiebolag',
      'Typ av riskfaktor': 'Geografisk riskfaktorer - här finns byråns kunder'
    }
  }
];

describe('bolagsform-styrning', () => {
  it('normaliserar AB och Aktiebolag till samma form', () => {
    assert.equal(canonicalize('AB').key, 'aktiebolag');
    assert.equal(canonicalize('Aktiebolag').key, 'aktiebolag');
    assert.equal(canonicalize('Privat aktiebolag').key, 'aktiebolag');
    assert.equal(sameForm('AB', 'Aktiebolag'), true);
    assert.equal(sameForm('EF', 'Enskild firma'), true);
    assert.equal(sameForm('HB', 'Handelsbolag'), true);
    assert.equal(sameForm('Aktiebolag', 'Enskild firma'), false);
  });

  it('extraherar bolagsformer från riskfaktornamn och beskrivning', () => {
    assert.deepEqual(extractFormsFromText('Kunder med bolagsform Aktiebolag'), ['Aktiebolag']);
    assert.deepEqual(
      extractFormsFromText('Kunder med bolagsformerna Enskild firma, Aktiebolag'),
      ['Enskild firma', 'Aktiebolag']
    );
    assert.ok(extractFormsFromRecord(bolagRecs[2]).includes('Aktiebolag'));
    assert.ok(extractFormsFromRecord(bolagRecs[2]).includes('Enskild firma'));
  });

  it('identifierar bara kundresidual med bolagsform-signal', () => {
    assert.equal(isBolagsformRecord(bolagRecs[0]), true);
    assert.equal(isBolagsformRecord(bolagRecs[4]), false);
    assert.equal(isBolagsformRecord(bolagRecs[5]), false);
  });

  it('lägger till matching bolagsform-risk när kund är AB', () => {
    const next = mergeLinkedIds(['recKont01'], bolagRecs, 'AB');
    assert.ok(next.includes('recKont01'));
    assert.ok(next.includes('recAb01'));
    assert.ok(next.includes('recMerged01'));
    assert.ok(next.includes('recMergedNamed01'));
    assert.ok(!next.includes('recEf01'));
  });

  it('tar bort steered id när bolagsform inte matchar', () => {
    const next = mergeLinkedIds(['recAb01', 'recKont01'], bolagRecs, 'Enskild firma');
    assert.deepEqual(next.sort(), ['recEf01', 'recKont01', 'recMerged01', 'recMergedNamed01'].sort());
  });

  it('suggestedRecordIds är tom utan bolagsform', () => {
    assert.deepEqual(suggestedRecordIds(bolagRecs, ''), []);
    assert.deepEqual(suggestedRecordIds(bolagRecs, { Bolagsform: '' }), []);
  });

  it('läser bolagsform från kundfält eller KYC', () => {
    assert.equal(customerBolagsform({ Bolagsform: 'Aktiebolag' }), 'Aktiebolag');
    assert.equal(
      customerBolagsform({ 'KYC-formular (JSON)': JSON.stringify({ bolagsform: 'HB' }) }),
      'HB'
    );
  });

  it('suggestedFactorLabels listar matchande namn', () => {
    const labels = suggestedFactorLabels(bolagRecs, 'Aktiebolag');
    assert.ok(labels.includes('Kunder med bolagsform Aktiebolag'));
    assert.ok(labels.includes('Kunder med bolagsformerna Enskild firma, Aktiebolag'));
  });

  it('mergedBolagsformRiskfaktorName bygger tydligt namn', () => {
    assert.equal(mergedBolagsformRiskfaktorName(['AB']), 'Kunder med bolagsform Aktiebolag');
    assert.equal(
      mergedBolagsformRiskfaktorName(['Enskild firma', 'AB']),
      'Kunder med bolagsformerna Enskild firma, Aktiebolag'
    );
  });

  it('linkedIdsChanged upptäcker skillnad', () => {
    assert.equal(linkedIdsChanged(['a'], ['a']), false);
    assert.equal(linkedIdsChanged(['a'], ['a', 'b']), true);
  });

  it('kundkort och html laddar bolagsform-styrning', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(html, /bolagsform-styrning\.js/);
    assert.match(js, /BolagsformStyrning/);
    assert.match(js, /_mergeSteeredBolagsformIds|_applyBolagsformChecks|_maybeSteerBolagsform/);
    assert.match(index, /bolagsformStyrning|maybePatchBolagsformRisk/);
  });
});
