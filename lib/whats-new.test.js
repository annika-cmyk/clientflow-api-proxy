const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  WHATS_NEW_ENTRIES,
  formatSvDate,
  selectWhatsNew,
  getWhatsNewPayload
} = require('./whats-new');

describe('whats-new', () => {
  it('visar max fem användarvända poster från senaste månaden', () => {
    const now = new Date('2026-08-19T18:00:00Z');
    const items = selectWhatsNew(WHATS_NEW_ENTRIES, { now, days: 30, limit: 5 });
    assert.equal(items.length, 5);
    assert.ok(items.every((item) => item.date >= '2026-07-20'));
    assert.ok(items.every((item) => item.title && item.summary && item.dateLabel));
    assert.deepEqual(items.map((item) => item.title), [
      'AML-nyheter på dashboarden',
      'KYC och uppdragsavtal via Inleed',
      'Dölj kund i listan',
      'Export av rutiner och riskbedömning i historik',
      'Tydligare uppdrag och tidsfrister'
    ]);
  });

  it('prioriterar viktigare poster framför bara nyare', () => {
    const entries = [
      { date: '2026-08-18', importance: 5, title: 'Stor', summary: 'Stor användarvänd ändring.' },
      { date: '2026-08-19', importance: 2, title: 'Liten', summary: 'Liten justering.' }
    ];
    const items = selectWhatsNew(entries, { now: new Date('2026-08-19T12:00:00Z'), days: 30, limit: 1 });
    assert.equal(items[0].title, 'Stor');
  });

  it('utelämnar poster äldre än fönstret', () => {
    const entries = [
      { date: '2026-08-19', title: 'Ny', summary: 'Ny ändring som syns.' },
      { date: '2026-06-01', title: 'Gammal', summary: 'För gammal för listan.' }
    ];
    const items = selectWhatsNew(entries, { now: new Date('2026-08-19T12:00:00Z'), days: 30, limit: 5 });
    assert.deepEqual(items.map((item) => item.title), ['Ny']);
  });

  it('formaterar svenskt datum och bygger payload', () => {
    assert.equal(formatSvDate('2026-08-19'), '19 aug.');
    const payload = getWhatsNewPayload({ now: new Date('2026-08-19T12:00:00Z') });
    assert.match(payload.intro, /intensivt utvecklingsarbete/);
    assert.match(payload.outro, /feedback/);
    assert.equal(payload.feedbackEmail, 'hej@clientflow.se');
    assert.equal(payload.items.length, 5);
  });
});
