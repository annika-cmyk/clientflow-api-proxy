const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertSignatureFitsAirtable,
  mapAirtableSaveError,
  MAX_IMAGE_DATA_URL,
  SAFE_PAYLOAD_MAX
} = require('./signature-store');

test('assertSignatureFitsAirtable accepterar små data-URL:er', () => {
  const small = `data:image/jpeg;base64,${'a'.repeat(1000)}`;
  const { length } = assertSignatureFitsAirtable({
    name: 'Annika',
    image1DataUrl: small,
    image2DataUrl: small
  });
  assert.ok(length < SAFE_PAYLOAD_MAX);
});

test('assertSignatureFitsAirtable kastar för för stor Bild 1 (rå telefonbild)', () => {
  // ~246k data-URL som den bifogade profilbilden ger utan komprimering
  const huge = `data:image/jpeg;base64,${'x'.repeat(200000)}`;
  assert.throws(
    () => assertSignatureFitsAirtable({ image1DataUrl: huge }),
    (err) => err.code === 'IMAGE_TOO_LARGE' && /Bild 1/.test(err.message)
  );
});

test('assertSignatureFitsAirtable kastar när total payload > Airtable-gräns', () => {
  const mid = `data:image/jpeg;base64,${'y'.repeat(MAX_IMAGE_DATA_URL - 40)}`;
  // Två bilder nära per-bild-max + stor fritext → över SAFE_PAYLOAD_MAX
  assert.throws(
    () =>
      assertSignatureFitsAirtable({
        name: 'Annika Rydén',
        title: 'Auktoriserad redovisningskonsult',
        phone: '070-246 29 21',
        email: 'annika@rydenredovisning.se',
        address: 'Ljungby',
        website: 'https://example.com',
        freeText: 'x'.repeat(8000),
        disclaimer: 'y'.repeat(8000),
        image1DataUrl: mid,
        image2DataUrl: mid
      }),
    (err) => err.code === 'SIGNATURE_TOO_LARGE' && /för stor/i.test(err.message)
  );
});

test('mapAirtableSaveError översätter axios 422 till svensk text', () => {
  const axiosLike = {
    message: 'Request failed with status code 422',
    response: {
      status: 422,
      data: { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: 'Value is too long' } }
    }
  };
  const mapped = mapAirtableSaveError(axiosLike);
  assert.equal(mapped.code, 'SIGNATURE_TOO_LARGE');
  assert.match(mapped.message, /för stora/i);
  assert.doesNotMatch(mapped.message, /Request failed/i);
});

test('mapAirtableSaveError översätter generisk axios-status', () => {
  const axiosLike = {
    message: 'Request failed with status code 500',
    response: { status: 500, data: {} }
  };
  const mapped = mapAirtableSaveError(axiosLike);
  assert.match(mapped.message, /Kunde inte spara sidfoten/);
  assert.doesNotMatch(mapped.message, /Request failed/i);
});
