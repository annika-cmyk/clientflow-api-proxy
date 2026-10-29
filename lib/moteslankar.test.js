const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createMoteslankar,
  slugify,
  PRIORITY_LABELS,
  hostKeyFromEmail,
  normalizeHostKey,
  displayNameFromHost,
  hostPublicUrl,
  unknownFieldNamesFromError,
  withoutExtendedLinkFields,
  EXTENDED_LINK_FIELDS,
  linkSaveErrorPayload
} = require('./moteslankar');

describe('moteslankar', () => {
  it('slugify normaliserar svenska tecken', () => {
    assert.equal(slugify('Konsulttimmen'), 'konsulttimmen');
    assert.equal(slugify('Snabbmöte 15-30'), 'snabbmote-15-30');
  });

  it('hostKeyFromEmail tar lokal del', () => {
    assert.equal(hostKeyFromEmail('Annika.Ryden@byra.se'), 'annika.ryden');
    assert.equal(normalizeHostKey('Annika Ryden!'), 'annikaryden');
    assert.equal(displayNameFromHost('annika.ryden@byra.se'), 'Annika Ryden');
    assert.match(hostPublicUrl('annika.ryden'), /boka-mote\.html\?host=annika\.ryden/);
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
    assert.ok(paths.includes('/api/motesbokning/public/host/:host'));
    assert.ok(paths.includes('/api/motesbokning/public/share/:token'));
    assert.ok(paths.includes('/api/motesbokning/links/:id/share'));
    assert.ok(paths.includes('/api/motesbokning/links/:id/availability'));
    assert.ok(paths.includes('/api/setup/airtable-moteslankar'));
    assert.ok(paths.includes('/api/motesbokning/public/link/:slug/book'));
  });

  it('unknownFieldNamesFromError plockar Påminnelse 1h', () => {
    const err = {
      response: {
        status: 422,
        data: { error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "Påminnelse 1h"' } }
      }
    };
    assert.deepEqual(unknownFieldNamesFromError(err), ['Påminnelse 1h']);
  });

  it('withoutExtendedLinkFields strippar nyare fält', () => {
    const out = withoutExtendedLinkFields({
      Titel: 'Bokslut',
      'Påminnelse 1h': 'Ja',
      'Schema (JSON)': '{}',
      Standardagenda: 'x'
    });
    assert.equal(out.Titel, 'Bokslut');
    for (const key of EXTENDED_LINK_FIELDS) {
      assert.equal(Object.prototype.hasOwnProperty.call(out, key), false);
    }
  });

  it('linkSaveErrorPayload ger svensk 422-text', () => {
    const err = {
      response: {
        status: 422,
        data: { error: { message: 'Unknown field name: "Påminnelse 1h"' } }
      },
      message: 'Request failed with status code 422'
    };
    const payload = linkSaveErrorPayload(err);
    assert.equal(payload.status, 422);
    assert.match(payload.body.error, /Kunde inte spara möteslänken/);
    assert.match(payload.body.error, /Påminnelse 1h/);
  });
});
