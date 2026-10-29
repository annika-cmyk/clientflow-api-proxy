const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SB = require('../public/js/kalender-schedule-blocks.js');

const root = path.join(__dirname, '..');

describe('kalender ångra klarmarkering', () => {
  it('UI har Ångra klarmarkering för tillfälle och hela körningen', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/kalender.js'), 'utf8');
    assert.match(js, /function angraKlarTillfalle/);
    assert.match(js, /function angraKlarHela/);
    assert.match(js, /data-angra-klar-tillfalle/);
    assert.match(js, /data-angra-klar-hela/);
    assert.match(js, /Ångra klarmarkering/);
    assert.match(js, /mode:\s*'uncomplete'/);
    assert.match(js, /mode:\s*'uncomplete-all'/);
  });

  it('ångra tillfälle öppnar körning när inte alla block är klara', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/kalender.js'), 'utf8');
    const fnStart = js.indexOf('async function angraKlarTillfalle');
    assert.ok(fnStart > 0);
    const fnEnd = js.indexOf('\n  async function', fnStart + 1);
    const body = js.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 3500);
    assert.match(body, /allBlocksDone/);
    assert.match(body, /everyDone/);
    assert.match(body, /Pågående/);
    assert.match(body, /patchRunStatus/);
    assert.doesNotMatch(body, /confirm\(/);
  });

  it('API tillåter schedule mode=uncomplete utan start/end', () => {
    const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    assert.match(index, /modeRaw === 'uncomplete'/);
    assert.match(index, /uncomplete-all/);
    assert.match(index, /modeNeedsNoTimes/);
  });

  it('ångra sista/enda klara tillfället → körning ska kunna öppnas', () => {
    const blocks = [
      { id: 'b1', start: '2026-10-29T12:00:00', end: '2026-10-29T13:00:00', done: true },
      { id: 'b2', start: '2026-10-30T10:15:00', end: '2026-10-30T11:15:00', done: true }
    ];
    assert.equal(SB.allBlocksDone(blocks), true);
    const afterOne = SB.applyMutation(blocks, { mode: 'uncomplete', blockId: 'b1' });
    assert.equal(SB.allBlocksDone(afterOne), false);
    const expanded = SB.expandScheduleInstances([{
      key: 'run1',
      status: 'Pågående',
      scheduleBlocks: afterOne
    }]);
    assert.equal(expanded.find((e) => e.blockId === 'b1').status, 'Pågående');
    assert.equal(expanded.find((e) => e.blockId === 'b2').status, 'Klar');
  });

  it('ångra hela rensar done och lämnar inga Klar-instanser', () => {
    const blocks = [
      { id: 'b1', start: '2026-10-29T12:00:00', end: '2026-10-29T13:00:00', done: true },
      { id: 'b2', start: '2026-10-30T10:15:00', end: '2026-10-30T11:15:00', done: true }
    ];
    const next = SB.applyMutation(blocks, { mode: 'uncomplete-all' });
    const expanded = SB.expandScheduleInstances([{
      key: 'run1',
      status: 'Pågående',
      scheduleBlocks: next
    }]);
    assert.ok(expanded.every((e) => e.status !== 'Klar' && e.blockDone === false));
  });
});
