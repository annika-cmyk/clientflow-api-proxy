/**
 * Bestäm nästa steg när Airtable nekar create/update p.g.a. saknade select-val.
 * Används när t.ex. Uppdragskörningar.Typ saknar «Eget uppdrag».
 */
function isSelectOptionWriteError(msg) {
  const m = String(msg || '');
  return (
    /insufficient permissions to create new select option|INVALID_MULTIPLE_CHOICE|cannot create new select|create new select option|select option/i.test(
      m
    ) ||
    /INVALID_(?:CELL|MULTIPLE)_VALUE/i.test(m) ||
    /Cannot parse value for field/i.test(m)
  );
}

/**
 * @param {{ message: string, usedTypecast: boolean, fields: Record<string, unknown> }} input
 * @returns {{ action: 'retry_typecast' | 'drop_field' | 'fail', field?: string }}
 */
function nextSelectWriteFallback({ message, usedTypecast, fields }) {
  if (!isSelectOptionWriteError(message)) return { action: 'fail' };
  if (!usedTypecast) return { action: 'retry_typecast' };
  const payload = fields || {};
  for (const field of ['Typ', 'Status', 'Frekvens']) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      return { action: 'drop_field', field };
    }
  }
  return { action: 'fail' };
}

module.exports = { isSelectOptionWriteError, nextSelectWriteFallback };
