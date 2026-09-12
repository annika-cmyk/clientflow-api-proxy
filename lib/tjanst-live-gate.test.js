'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Mallar = require('../public/js/tjanst-utforande-mallar');
const Gate = require('./tjanst-live-gate');
const ByraResa = require('./byra-resa');

function readyRisk(namn) {
  return {
    id: 'rec1',
    fields: {
      Aktuell: true,
      'Task Name': namn,
      'Riskpoäng': JSON.stringify({
        sannolikhet: 2,
        konsekvens: 3,
        sannolikhetEfter: 1,
        konsekvensEfter: 2
      }),
      'Tjänstespecifika åtgärder': JSON.stringify([{ titel: 'Kontrollera underlag' }])
    }
  };
}

describe('tjanst-live-gate', () => {
  it('startar egna tjänster som inaktiva utkast', () => {
    const added = Mallar.addCustomService(Mallar.emptyState(), 'Specialkonsult');
    assert.equal(added.state.tjanster[added.id].aktiv, false);
  });

  it('blockerar aktivering utan mini-analys', () => {
    const added = Mallar.addCustomService(Mallar.emptyState(), 'Specialkonsult');
    const prev = Mallar.parseState(JSON.stringify(added.state));
    const next = Mallar.upsertEntry(Mallar.parseState(JSON.stringify(added.state)), added.id, { aktiv: true });
    const blocked = Gate.findBlockedCustomActivation(prev, next, []);
    assert.ok(blocked);
    assert.equal(blocked.code, 'tjanst_mini_analys_saknas');
  });

  it('tillåter aktivering när aktuell mini-analys är klar', () => {
    const added = Mallar.addCustomService(Mallar.emptyState(), 'Specialkonsult');
    const prev = Mallar.parseState(JSON.stringify(added.state));
    const next = Mallar.upsertEntry(Mallar.parseState(JSON.stringify(added.state)), added.id, { aktiv: true });
    const blocked = Gate.findBlockedCustomActivation(prev, next, [readyRisk('Specialkonsult')]);
    assert.equal(blocked, null);
  });

  it('kräver aktuell (inte bara utkast) riskpost', () => {
    const added = Mallar.addCustomService(Mallar.emptyState(), 'Specialkonsult');
    const prev = Mallar.parseState(JSON.stringify(added.state));
    const next = Mallar.upsertEntry(Mallar.parseState(JSON.stringify(added.state)), added.id, { aktiv: true });
    const draft = readyRisk('Specialkonsult');
    draft.fields.Aktuell = false;
    const blocked = Gate.findBlockedCustomActivation(prev, next, [draft]);
    assert.ok(blocked);
    assert.equal(blocked.code, 'tjanst_analys_ej_aktuell');
  });

  it('bedömer ofullständig analys som inte live-ready', () => {
    const assessed = Gate.assessLiveReady({
      Aktuell: true,
      'Riskpoäng': JSON.stringify({ sannolikhet: 2, konsekvens: 2 }),
      'Tjänstespecifika åtgärder': '[]'
    });
    assert.equal(assessed.ok, false);
    assert.ok(assessed.missing.some((m) => /åtgärd|residual/i.test(m)));
  });

  it('loggar risk_events och sätter arDeltaPending i byråresa', () => {
    let state = ByraResa.buildByraResaState({});
    state = ByraResa.appendRiskEvent(state, Gate.buildRiskEvent({
      type: 'tjanst_aktiverad',
      refId: 'custom:1',
      namn: 'Specialkonsult',
      by: 'test@example.com',
      arInvalidated: true
    }));
    assert.equal(state.arDeltaPending, true);
    assert.equal(state.riskEvents.length, 1);
    assert.equal(state.riskEvents[0].type, 'tjanst_aktiverad');
    const roundtrip = ByraResa.parseByraResaState(ByraResa.serializeByraResaState(state));
    assert.equal(roundtrip.arDeltaPending, true);
    assert.equal(roundtrip.riskEvents[0].namn, 'Specialkonsult');
  });

  it('UI och API nämner live-gate för egna tjänster', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(js, /assessCustomTjanstLiveReady/);
    assert.match(js, /tjanst-mall-draft-badge/);
    assert.match(js, /Egna tjänster kräver minst en åtgärd/);
    assert.match(css, /\.tjanst-mall-draft-badge/);
    assert.match(index, /TjanstLiveGate/);
    assert.match(index, /findBlockedCustomActivation/);
    assert.match(index, /tjanst_aktiverad/);
    assert.match(index, /appendRiskEvent/);
  });
});
