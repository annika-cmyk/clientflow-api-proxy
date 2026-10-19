const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMoteslankar, slugify, PRIORITY_LABELS } = require('./moteslankar');

describe('moteslankar', () => {
  it('slugify normaliserar svenska tecken', () => {
    assert.equal(slugify('Konsulttimmen'), 'konsulttimmen');
    assert.equal(slugify('Snabbmöte 15-30'), 'snabbmote-15-30');
  });

  it('PRIORITY_LABELS täcker 1–4', () => {
    assert.equal(PRIORITY_LABELS[1], 'Låg');
    assert.equal(PRIORITY_LABELS[4], 'Högsta');
  });

  it('createMoteslankar registerRoutes lägger upp endpoints', () => {
    const routes = [];
    const app = {
      get: (path) => routes.push(['GET', path]),
      post: (path) => routes.push(['POST', path]),
      patch: (path) => routes.push(['PATCH', path]),
      delete: (path) => routes.push(['DELETE', path])
    };
    const api = createMoteslankar({
      authenticateToken: (req, res, next) => next(),
      getAirtableUser: async () => ({ email: 'a@b.se', byraId: 'rec1' })
    });
    api.registerRoutes(app);
    const paths = routes.map((r) => r[1]);
    assert.ok(paths.includes('/api/motesbokning/links'));
    assert.ok(paths.includes('/api/motesbokning/public/link/:slug'));
    assert.ok(paths.includes('/api/motesbokning/public/share/:token'));
    assert.ok(paths.includes('/api/motesbokning/links/:id/share'));
    assert.ok(paths.includes('/api/motesbokning/links/:id/availability'));
    assert.ok(paths.includes('/api/setup/airtable-moteslankar'));
    assert.ok(paths.includes('/api/motesbokning/public/link/:slug/book'));
  });
});
