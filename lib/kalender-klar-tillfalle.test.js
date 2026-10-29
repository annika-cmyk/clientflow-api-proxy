const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SB = require('../public/js/kalender-schedule-blocks.js');

const root = path.join(__dirname, '..');

describe('kalender klar tillfälle behålls i rutnätet', () => {
  it('klarmarkerar tillfälle med mode=complete i stället för remove', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/kalender.js'), 'utf8');
    assert.match(js, /function klarTillfalle/);
    assert.match(js, /mode:\s*'complete'/);
    // Tillfälle ska inte längre raderas från kalendern vid klarmarkering
    const fnStart = js.indexOf('async function klarTillfalle');
    const fnEnd = js.indexOf('\n  async function', fnStart + 1);
    const body = js.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 2500);
    assert.match(body, /mode:\s*'complete'/);
    assert.doesNotMatch(body, /mode:\s*'remove'/);
    assert.match(js, /blockDone/);
    assert.match(js, /showDone\s*=\s*true/);
  });

  it('API tillåter schedule mode=complete utan start/end', () => {
    const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    assert.match(index, /modeRaw === 'complete'/);
    assert.match(index, /modeNeedsNoTimes/);
    assert.match(index, /complete-all/);
  });

  it('ett tillfälle klar → körning Klar först när alla block är done', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/kalender.js'), 'utf8');
    const fnStart = js.indexOf('async function klarTillfalle');
    const fnEnd = js.indexOf('\n  async function', fnStart + 1);
    const body = js.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 3500);
    // Får inte sätta körning Klar innan alla tillfällen är klara
    assert.match(body, /allBlocksDone/);
    assert.match(body, /everyDone/);
    assert.match(body, /patchRunStatusKlar/);
    // Körningsstatus läses från runRec — inte ev.status (tillfällets Klar)
    assert.match(body, /ev\.runRec\?\.fields\?\.\s*Status/);
  });

  it('multi-block samma körning: markera ett → bara ett klar', () => {
    const blocks = [
      { id: 'b1', start: '2026-10-29T10:15:00', end: '2026-10-29T11:15:00' },
      { id: 'b2', start: '2026-10-29T12:00:00', end: '2026-10-29T13:00:00' }
    ];
    const next = SB.applyMutation(blocks, { mode: 'complete', blockId: 'b1' });
    const expanded = SB.expandScheduleInstances([{
      key: 'run1',
      status: 'Pågående',
      scheduleBlocks: next
    }]);
    assert.equal(expanded.filter((e) => e.status === 'Klar').length, 1);
    assert.equal(expanded.filter((e) => e.status !== 'Klar').length, 1);
    assert.equal(SB.allBlocksDone(next), false);

    const last = SB.applyMutation(next, { mode: 'complete', blockId: 'b2' });
    assert.equal(SB.allBlocksDone(last), true);
  });
});
