const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const SB = require('../public/js/kalender-schedule-blocks.js');
const KE = require('../public/js/kalender-events.js');

describe('kalender-schedule-blocks', () => {
  it('läser legacy Planerad start/slut som ett block', () => {
    const blocks = SB.parseBlocksFromFields({
      'Planerad start': '2026-10-16T09:00:00',
      'Planerad slut': '2026-10-16T12:00:00'
    });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].start, '2026-10-16T09:00:00');
    assert.equal(blocks[0].end, '2026-10-16T12:00:00');
  });

  it('läser flera block från JSON och synkar primary', () => {
    const blocks = SB.parseBlocksFromFields({
      'Planerade block (JSON)': JSON.stringify([
        { id: 'b2', start: '2026-10-17T08:00:00', end: '2026-10-17T12:00:00' },
        { id: 'b1', start: '2026-10-16T09:00:00', end: '2026-10-16T14:00:00' }
      ])
    });
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].id, 'b1');
    const fields = SB.fieldsForBlocks(blocks);
    assert.equal(fields['Planerad start'], '2026-10-16T09:00:00');
    assert.equal(fields['Planerad slut'], '2026-10-16T14:00:00');
  });

  it('add lägger till tillfälle utan att radera befintliga', () => {
    const current = [
      { id: 'b1', start: '2026-10-16T09:00:00', end: '2026-10-16T12:00:00' }
    ];
    const next = SB.applyMutation(current, {
      mode: 'add',
      start: '2026-10-17T08:00:00',
      end: '2026-10-17T13:00:00'
    });
    assert.equal(next.length, 2);
    assert.ok(next.some((b) => b.id === 'b1'));
    assert.ok(next.some((b) => b.start === '2026-10-17T08:00:00'));
  });

  it('update flyttar ett block och remove tar bort det', () => {
    const current = [
      { id: 'b1', start: '2026-10-16T09:00:00', end: '2026-10-16T12:00:00' },
      { id: 'b2', start: '2026-10-17T08:00:00', end: '2026-10-17T12:00:00' }
    ];
    const moved = SB.applyMutation(current, {
      mode: 'update',
      blockId: 'b2',
      start: '2026-10-18T10:00:00',
      end: '2026-10-18T15:00:00'
    });
    assert.equal(moved.find((b) => b.id === 'b2').start, '2026-10-18T10:00:00');
    const removed = SB.applyMutation(moved, { mode: 'remove', blockId: 'b1' });
    assert.equal(removed.length, 1);
    assert.equal(removed[0].id, 'b2');
  });

  it('remove av sista tillfället rensar Planerad start/slut utan att radera körningen', () => {
    const current = [
      { id: 'b1', start: '2026-10-30T09:15:00', end: '2026-10-30T10:15:00' }
    ];
    const empty = SB.applyMutation(current, { mode: 'remove', blockId: 'b1' });
    assert.equal(empty.length, 0);
    const fields = SB.fieldsForBlocks(empty);
    assert.equal(fields['Planerad start'], null);
    assert.equal(fields['Planerad slut'], null);
    assert.equal(fields['Planerade block (JSON)'], '[]');
    // Körningen lever kvar — bara tidblocken är borta
    const expanded = SB.expandScheduleInstances([{
      key: 'recU:2026',
      runKey: 'recU:2026',
      status: 'Planerad',
      scheduleBlocks: empty
    }]);
    assert.equal(expanded.length, 1);
    assert.equal(expanded[0].blockId, null);
    assert.equal((expanded[0].scheduleBlocks || []).length, 0);
  });

  it('expandScheduleInstances skapar en kalenderinstans per block', () => {
    const events = [{
      key: 'recU:2026',
      scheduleBlocks: [
        { id: 'b1', start: '2026-10-16T09:00:00', end: '2026-10-16T12:00:00' },
        { id: 'b2', start: '2026-10-17T08:00:00', end: '2026-10-17T12:00:00' }
      ]
    }];
    const expanded = SB.expandScheduleInstances(events);
    assert.equal(expanded.length, 2);
    assert.equal(expanded[0].key, 'recU:2026#b1');
    assert.equal(expanded[1].runKey, 'recU:2026');
    assert.equal(SB.uniqueRunEvents(expanded).length, 1);
  });

  it('complete markerar tillfälle som done utan att ta bort det', () => {
    const current = [
      { id: 'b1', start: '2026-10-16T13:45:00', end: '2026-10-16T14:45:00' },
      { id: 'b2', start: '2026-10-17T09:00:00', end: '2026-10-17T11:00:00' }
    ];
    const next = SB.applyMutation(current, { mode: 'complete', blockId: 'b1' });
    assert.equal(next.length, 2);
    assert.equal(next.find((b) => b.id === 'b1').done, true);
    assert.equal(next.find((b) => b.id === 'b2').done, undefined);
    const fields = SB.fieldsForBlocks(next);
    const parsed = JSON.parse(fields['Planerade block (JSON)']);
    assert.equal(parsed.find((b) => b.id === 'b1').done, true);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed.find((b) => b.id === 'b2'), 'done'), false);

    const expanded = SB.expandScheduleInstances([{
      key: 'recU:2026',
      status: 'Pågående',
      scheduleBlocks: next
    }]);
    const doneEv = expanded.find((e) => e.blockId === 'b1');
    const openEv = expanded.find((e) => e.blockId === 'b2');
    assert.equal(doneEv.blockDone, true);
    assert.equal(doneEv.status, 'Klar');
    assert.equal(openEv.blockDone, false);
    assert.equal(openEv.status, 'Pågående');
    assert.equal(SB.allBlocksDone(next), false);
  });

  it('markera ett tillfälle Klar påverkar inte syskon i samma körning', () => {
    // Regression: Mikael Borgström-fallet — två block, markera ett → bara det blir Klar
    const current = [
      { id: 'am', start: '2026-10-29T10:15:00', end: '2026-10-29T11:15:00' },
      { id: 'pm', start: '2026-10-29T12:00:00', end: '2026-10-29T13:00:00' }
    ];
    const afterOne = SB.applyMutation(current, { mode: 'complete', blockId: 'am' });
    assert.equal(afterOne.find((b) => b.id === 'am').done, true);
    assert.equal(!!afterOne.find((b) => b.id === 'pm').done, false);
    assert.equal(SB.allBlocksDone(afterOne), false);

    // Även om körningens Status felaktigt är Klar ska ogjort block inte visas som Klar
    const expanded = SB.expandScheduleInstances([{
      key: 'recRun:period',
      status: 'Klar',
      scheduleBlocks: afterOne
    }]);
    assert.equal(expanded.find((e) => e.blockId === 'am').status, 'Klar');
    assert.equal(expanded.find((e) => e.blockId === 'pm').status, 'Pågående');
    assert.equal(expanded.find((e) => e.blockId === 'pm').blockDone, false);

    const allDone = SB.applyMutation(afterOne, { mode: 'complete-all' });
    assert.equal(SB.allBlocksDone(allDone), true);
    const expandedAll = SB.expandScheduleInstances([{
      key: 'recRun:period',
      status: 'Klar',
      scheduleBlocks: allDone
    }]);
    assert.ok(expandedAll.every((e) => e.status === 'Klar' && e.blockDone === true));
  });

  it('instanceStatus: legacy körning Klar utan done-flaggor → alla Klar', () => {
    assert.equal(SB.instanceStatus('Klar', { id: 'b1' }, [{ id: 'b1' }, { id: 'b2' }]), 'Klar');
    assert.equal(
      SB.instanceStatus('Pågående', { id: 'b1', done: true }, [
        { id: 'b1', done: true },
        { id: 'b2' }
      ]),
      'Klar'
    );
    assert.equal(
      SB.instanceStatus('Pågående', { id: 'b2' }, [
        { id: 'b1', done: true },
        { id: 'b2' }
      ]),
      'Pågående'
    );
  });

  it('sparar och expanderar anteckning per tidblock', () => {
    const current = [
      { id: 'b1', start: '2026-10-16T10:15:00', end: '2026-10-16T11:15:00' }
    ];
    const withNote = SB.applyMutation(current, {
      mode: 'update',
      blockId: 'b1',
      note: '  mejla ut dokumenten för signering  '
    });
    assert.equal(withNote[0].note, 'mejla ut dokumenten för signering');
    assert.equal(withNote[0].start, '2026-10-16T10:15:00');
    const fields = SB.fieldsForBlocks(withNote);
    const parsed = JSON.parse(fields['Planerade block (JSON)']);
    assert.equal(parsed[0].note, 'mejla ut dokumenten för signering');

    const moved = SB.applyMutation(withNote, {
      mode: 'update',
      blockId: 'b1',
      start: '2026-10-16T09:00:00',
      end: '2026-10-16T11:15:00'
    });
    assert.equal(moved[0].note, 'mejla ut dokumenten för signering');

    const cleared = SB.applyMutation(moved, { mode: 'update', blockId: 'b1', note: '' });
    assert.equal(Object.prototype.hasOwnProperty.call(cleared[0], 'note'), false);

    const expanded = SB.expandScheduleInstances([{
      key: 'recU:2026',
      scheduleBlocks: withNote
    }]);
    assert.equal(expanded[0].blockNote, 'mejla ut dokumenten för signering');
  });

  it('totalHours summerar alla tillfällen', () => {
    const h = SB.totalHours([
      { start: '2026-10-16T08:00:00', end: '2026-10-16T12:00:00' },
      { start: '2026-10-17T08:00:00', end: '2026-10-17T14:00:00' }
    ]);
    assert.equal(h, 10);
  });

  it('klipper lång anteckning och behåller note/done vid tidsuppdatering', () => {
    assert.equal(SB.normalizeNote('x'.repeat(SB.NOTE_MAX_LEN + 50)).length, SB.NOTE_MAX_LEN);
    const current = [
      { id: 'b1', start: '2026-10-16T09:00:00', end: '2026-10-16T12:00:00', done: true, note: 'gammal' }
    ];
    const noted = SB.applyMutation(current, {
      mode: 'update',
      blockId: 'b1',
      note: 'mejla ut dokumenten för signering'
    });
    assert.equal(noted[0].done, true);
    assert.equal(noted[0].note, 'mejla ut dokumenten för signering');
    const moved = SB.applyMutation(noted, {
      mode: 'update',
      blockId: 'b1',
      start: '2026-10-16T10:00:00',
      end: '2026-10-16T13:00:00'
    });
    assert.equal(moved[0].note, 'mejla ut dokumenten för signering');
    assert.equal(moved[0].done, true);
  });

  it('döljer som valbar när uppskattad tid är fullt utlagd', () => {
    assert.equal(SB.isSelectableInPool(null, 0), true);
    assert.equal(SB.isSelectableInPool(10, 4), true);
    assert.equal(SB.isSelectableInPool(10, 10), false);
    assert.equal(SB.isSelectableInPool(10, 12), false);
    const p = SB.planningProgress(10, 4);
    assert.equal(p.remaining, 6);
    assert.equal(p.fullyPlanned, false);
    assert.match(p.label, /4\/10/);
  });
});

describe('kalender-events + flera tidblock', () => {
  it('bygger scheduleBlocks från JSON-fält', () => {
    const parent = {
      id: 'recUppdrag1',
      fields: { Typ: 'Bokslut', Kundnamn: 'Test AB' }
    };
    const run = {
      id: 'recRun1',
      fields: {
        'Uppdrag ID': 'recUppdrag1',
        Typ: 'Bokslut',
        PeriodKey: '2026',
        'Period Label': '2026',
        Deadline: '2026-10-30',
        Status: 'Planerad',
        'Planerade block (JSON)': JSON.stringify([
          { id: 'a', start: '2026-10-16T09:00:00', end: '2026-10-16T14:00:00' },
          { id: 'b', start: '2026-10-17T09:00:00', end: '2026-10-17T14:00:00' }
        ])
      }
    };
    const events = KE.buildEventsFromRuns({
      records: [parent],
      runRecords: [run],
      range: { start: '2026-10-01', end: '2026-10-31' }
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].scheduleBlocks.length, 2);
    const expanded = KE.expandScheduleInstances(events);
    assert.equal(expanded.length, 2);
  });
});
