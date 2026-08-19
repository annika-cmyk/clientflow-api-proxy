const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDokumentationList,
  stripBase64FromList,
  normalizeExportType,
  exportTypeLabel,
  formatExportStamp,
  formatExportDateIso,
  buildExportFilename,
  buildExportDisplayFilename,
  sortDokumentationList,
  addExportToList,
  mergeAttachmentsIntoList,
  toPublicListItem,
  buildExportEntry,
  MAX_SAVED_EXPORTS
} = require('./dokumentation-export');

describe('dokumentation-export', () => {
  it('parsar JSON-lista och hoppar över skräp', () => {
    assert.deepEqual(parseDokumentationList(''), []);
    assert.deepEqual(parseDokumentationList('not-json'), []);
    assert.deepEqual(parseDokumentationList(JSON.stringify([
      { filename: 'a.pdf', exportedAt: '2026-03-19T10:00:00.000Z' },
      null,
      'x'
    ])), [
      { filename: 'a.pdf', exportedAt: '2026-03-19T10:00:00.000Z' }
    ]);
  });

  it('tar bort base64 så Airtable-fältet inte sprängs', () => {
    const stripped = stripBase64FromList([
      { filename: 'a.pdf', base64: 'AAAA', attachmentId: 'attX' }
    ]);
    assert.equal(stripped.length, 1);
    assert.equal(stripped[0].filename, 'a.pdf');
    assert.equal(stripped[0].attachmentId, 'attX');
    assert.equal(stripped[0].base64, undefined);
  });

  it('normaliserar dokumenttyp till risk + policy som default', () => {
    assert.equal(normalizeExportType('policy'), 'policy');
    assert.equal(normalizeExportType('okand'), 'risk_och_policy');
    assert.match(exportTypeLabel('riskbedomning'), /riskbedömning/i);
    assert.match(exportTypeLabel('policy'), /policy/i);
  });

  it('formaterar datumstämpel på svenska tid', () => {
    const stamp = formatExportStamp('2026-08-19T15:07:00.000Z');
    assert.match(stamp, /19 augusti 2026/);
    assert.match(stamp, /17:07/);
    assert.equal(formatExportDateIso('2026-08-19T15:07:00.000Z'), '2026-08-19');
  });

  it('bygger filnamn med typ, byrå och datum', () => {
    const name = buildExportFilename({
      type: 'risk_och_policy',
      byraNamn: 'Byrå & Co',
      exportedAt: '2026-08-19T15:07:00.000Z'
    });
    assert.equal(name, 'Allman-riskbedomning-och-rutiner-Byrå-Co-2026-08-19.pdf');
    assert.match(buildExportDisplayFilename({
      type: 'policy',
      exportedAt: '2026-08-19T15:07:00.000Z'
    }), /Byråpolicy.*19 augusti 2026 17:07/);
  });

  it('sorterar nyast först och kapar listan', () => {
    const sorted = sortDokumentationList([
      { filename: 'old.pdf', exportedAt: '2024-01-01T00:00:00.000Z' },
      { filename: 'new.pdf', exportedAt: '2026-08-19T12:00:00.000Z' }
    ]);
    assert.equal(sorted[0].filename, 'new.pdf');
    const many = Array.from({ length: MAX_SAVED_EXPORTS + 5 }, (_, i) => ({
      filename: `${i}.pdf`,
      exportedAt: new Date(2026, 0, i + 1).toISOString()
    }));
    assert.equal(addExportToList(many, { filename: 'fresh.pdf', exportedAt: '2027-01-01T00:00:00.000Z' }).length, MAX_SAVED_EXPORTS);
  });

  it('kopplar Airtable-bilagor till historikrader', () => {
    const merged = mergeAttachmentsIntoList(
      [
        {
          filename: 'Allman-riskbedomning-och-rutiner-Test-2026-08-19.pdf',
          exportedAt: '2026-08-19T15:07:00.000Z',
          type: 'risk_och_policy',
          attachmentId: 'attAAA1111111111'
        }
      ],
      [
        {
          id: 'attAAA1111111111',
          filename: 'Allman-riskbedomning-och-rutiner-Test-2026-08-19.pdf',
          url: 'https://example.test/a.pdf',
          size: 1200
        }
      ]
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].attachmentId, 'attAAA1111111111');
    assert.equal(merged[0].type, 'risk_och_policy');
    const pub = toPublicListItem(merged[0]);
    assert.match(pub.title, /riskbedömning/i);
    assert.match(pub.stamp, /19 augusti 2026 17:07/);
    assert.equal(pub.base64, undefined);
  });

  it('visar bilaga även utan metadata och behåller metadata utan fil', () => {
    const merged = mergeAttachmentsIntoList(
      [{ filename: 'saknas.pdf', exportedAt: '2025-01-02T10:00:00.000Z', type: 'policy' }],
      [{ id: 'attBBB2222222222', filename: 'ny.pdf', createdTime: '2026-02-01T08:00:00.000Z' }]
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0].attachmentId, 'attBBB2222222222');
    assert.equal(merged[1].filename, 'saknas.pdf');
    assert.equal(merged[1].type, 'policy');
  });

  it('bygger en historikrad utan filinnehåll', () => {
    const entry = buildExportEntry({
      type: 'riskbedomning',
      byraNamn: 'Demo',
      exportedAt: '2026-08-19T15:07:00.000Z',
      attachmentId: 'attCCC3333333333'
    });
    assert.equal(entry.attachmentId, 'attCCC3333333333');
    assert.equal(entry.type, 'riskbedomning');
    assert.equal(entry.base64, undefined);
    assert.match(entry.filename, /Allman-riskbedomning-Demo-2026-08-19\.pdf/);
  });
});
