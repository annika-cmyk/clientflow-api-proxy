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
  });

  it('totalHours summerar alla tillfällen', () => {
    const h = SB.totalHours([
      { start: '2026-10-16T08:00:00', end: '2026-10-16T12:00:00' },
      { start: '2026-10-17T08:00:00', end: '2026-10-17T14:00:00' }
    ]);
    assert.equal(h, 10);
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
