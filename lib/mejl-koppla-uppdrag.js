/**
 * Hjälpare för mejl → koppla till uppdrag (enstaka/engång).
 */
function buildEngangUppdragPayload({ customerId, namn, ansvarig, klientansvarig, deadline, today }) {
  const name = String(namn || '').trim();
  const ans = String(ansvarig || '').trim();
  const klient = String(klientansvarig || '').trim();
  const dl = String(deadline || '').trim();
  const day = String(today || '').trim();
  if (!customerId) throw new Error('customerId saknas');
  if (!name) throw new Error('Ange ett namn på uppdraget (t.ex. Lön).');
  if (!klient) throw new Error('Välj klientansvarig.');
  if (!ans) throw new Error('Välj handläggare.');
  if (!dl) throw new Error('Ange deadline.');
  if (!day) throw new Error('Startdatum saknas');
  return {
    customerId,
    typ: 'Eget uppdrag',
    fields: {
      Namn: name,
      Ansvarig: ans,
      Klientansvarig: klient,
      Frekvens: 'Engång',
      Startdatum: day,
      'Nästa deadline': dl,
      Status: 'Aktiv'
    }
  };
}

module.exports = { buildEngangUppdragPayload };
