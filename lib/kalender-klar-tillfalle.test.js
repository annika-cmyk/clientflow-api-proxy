const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  });
});
