const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TjanstUtforandeMallar = require('../public/js/tjanst-utforande-mallar');
const TAK = require('./tjanst-aktiv-kundkoppling');

describe('tjanst-aktiv-kundkoppling', () => {
  it('hittar inaktiveringar mellan två utförandetillstånd', () => {
    let prev = TjanstUtforandeMallar.emptyState();
    prev = TjanstUtforandeMallar.upsertEntry(prev, 'bokslut', { aktiv: true, namn: 'Bokslut' });
    prev = TjanstUtforandeMallar.upsertEntry(prev, 'rot-rut', { aktiv: true });
    // Djupkopia: upsertEntry delar tjanster-objekt via parseState
    const prevSnap = JSON.parse(JSON.stringify(prev));
    const next = TjanstUtforandeMallar.upsertEntry(prev, 'bokslut', { aktiv: false });
    const deactivated = TAK.findDeactivations(prevSnap, next);
    assert.equal(deactivated.length, 1);
    assert.equal(deactivated[0].mallId, 'bokslut');
    assert.equal(deactivated[0].namn, 'Bokslut');
  });

  it('räknar kunder via matchande riskposter', () => {
    const risks = [
      { id: 'recBok1', fields: { 'Task Name': 'Bokslut' } },
      { id: 'recBok2', fields: { 'Task Name': 'Bokslut' } },
      { id: 'recMoms', fields: { 'Task Name': 'Momsredovisning' } }
    ];
    const counts = { recBok1: 2, recBok2: 1, recMoms: 5 };
    assert.equal(TAK.kundCountForNamn('Bokslut', risks, counts), 3);
    assert.equal(TAK.kundCountForNamn('Momsredovisning', risks, counts), 5);
    assert.equal(TAK.kundCountForNamn('Lönehantering', risks, counts), 0);
  });

  it('blockerar inaktivering när kunder är kopplade', () => {
    let prev = TjanstUtforandeMallar.emptyState();
    prev = TjanstUtforandeMallar.upsertEntry(prev, 'bokslut', { aktiv: true, namn: 'Bokslut' });
    const prevSnap = JSON.parse(JSON.stringify(prev));
    const next = TjanstUtforandeMallar.upsertEntry(prev, 'bokslut', { aktiv: false });
    const blocked = TAK.findBlockedDeactivation(
      prevSnap,
      next,
      [{ id: 'recBok1', fields: { 'Task Name': 'Bokslut' } }],
      { recBok1: 2 }
    );
    assert.ok(blocked);
    assert.equal(blocked.kundCount, 2);
    assert.match(blocked.message, /2 kunder/);
  });

  it('tillåter inaktivering utan kundkoppling', () => {
    let prev = TjanstUtforandeMallar.emptyState();
    prev = TjanstUtforandeMallar.upsertEntry(prev, 'bokslut', { aktiv: true, namn: 'Bokslut' });
    const next = TjanstUtforandeMallar.upsertEntry(prev, 'bokslut', { aktiv: false });
    assert.equal(
      TAK.findBlockedDeactivation(prev, next, [{ id: 'recBok1', fields: { 'Task Name': 'Bokslut' } }], {}),
      null
    );
  });

  it('markerar valbara kundtjänster utifrån aktiv utförande + Aktuell', () => {
    let state = TjanstUtforandeMallar.emptyState();
    state = TjanstUtforandeMallar.upsertEntry(state, 'bokslut', { aktiv: true, namn: 'Bokslut' });
    state = TjanstUtforandeMallar.upsertEntry(state, 'rot-rut', { aktiv: false });

    assert.equal(
      TAK.isSelectableForKund({ namn: 'Bokslut', aktuell: true }, state),
      true
    );
    assert.equal(
      TAK.isSelectableForKund({ namn: 'ROT/RUT', aktuell: true }, state),
      false
    );
    assert.equal(
      TAK.isSelectableForKund({ namn: 'Bokslut', aktuell: false }, state),
      false
    );
  });

  it('faller tillbaka till Aktuell när utförandekatalogen är tom', () => {
    const empty = TjanstUtforandeMallar.emptyState();
    assert.equal(
      TAK.isSelectableForKund({ namn: 'Bokslut', aktuell: true }, empty),
      true
    );
    assert.equal(
      TAK.isSelectableForKund({ namn: 'Bokslut', aktuell: false }, empty),
      false
    );
  });

  it('döljer inaktiva även när ingen tjänst är aktiv just nu', () => {
    let state = TjanstUtforandeMallar.emptyState();
    state = TjanstUtforandeMallar.upsertEntry(state, 'bokslut', { aktiv: false, namn: 'Bokslut' });
    assert.equal(
      TAK.isSelectableForKund({ namn: 'Bokslut', aktuell: true }, state),
      false
    );
  });

  it('berikar byråtjänster med aktiv-flagga', () => {
    let state = TjanstUtforandeMallar.emptyState();
    state = TjanstUtforandeMallar.upsertEntry(state, 'bokslut', { aktiv: true, namn: 'Bokslut' });
    const enriched = TAK.enrichTjansterWithAktiv(
      [
        { id: 'rec1', namn: 'Bokslut', aktuell: true },
        { id: 'rec2', namn: 'Momsredovisning', aktuell: true }
      ],
      state
    );
    assert.equal(enriched[0].aktiv, true);
    assert.equal(enriched[1].aktiv, false);
  });
});
