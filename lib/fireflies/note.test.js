const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildNoteBody,
  buildNotePayload,
  buildTodosFromActions,
  extractFirefliesIdFromNotes,
  formatMeetingDate
} = require('./note');

describe('fireflies note', () => {
  it('formaterar epoch-datum', () => {
    assert.equal(formatMeetingDate(1710876789456), '2024-03-19');
  });

  it('bygger anteckning med sammanfattning och fireflies-id', () => {
    const body = buildNoteBody({
      id: 'ASxwZxCstx',
      title: 'Kickoff Acme',
      date: '2026-10-29',
      transcript_url: 'https://app.fireflies.ai/view/ASxwZxCstx',
      summary: {
        overview: 'Vi gick igenom budgeten.',
        action_items: '• Skicka offert\n• Boka uppföljning',
        shorthand_bullet: ['Budget Q1', 'Nästa steg']
      }
    });
    assert.match(body, /Kickoff Acme/);
    assert.match(body, /Vi gick igenom budgeten/);
    assert.match(body, /Skicka offert/);
    assert.match(body, /Fireflies-id: ASxwZxCstx/);
  });

  it('mappar action items till ToDo', () => {
    const todos = buildTodosFromActions({
      summary: { action_items: ['Gör X', 'Gör Y'] }
    });
    assert.equal(todos.ToDo1, 'Gör X');
    assert.equal(todos.Status1, 'Ej påbörjad');
    assert.equal(todos.ToDo2, 'Gör Y');
  });

  it('buildNotePayload sätter Mötesanteckningar', () => {
    const payload = buildNotePayload(
      {
        id: 'm1',
        title: 'Avstämning',
        date: '2026-10-29',
        summary: { overview: 'Kort' }
      },
      { namn: 'Acme AB', orgnr: '5566778899' },
      { name: 'Annika', byraId: '12' }
    );
    assert.deepEqual(payload.typAvAnteckning, ['Mötesanteckningar']);
    assert.equal(payload.foretagsnamn, 'Acme AB');
    assert.equal(payload.byraId, '12');
    assert.equal(extractFirefliesIdFromNotes(payload.notes), 'm1');
  });
});
