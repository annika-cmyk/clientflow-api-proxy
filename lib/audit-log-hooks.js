'use strict';

const auditLog = require('./audit-log');

function riskValue(fields) {
  const f = fields || {};
  return String(f.Riskniva || f['Risknivå'] || f['sammanlagd risk'] || '').trim();
}

function sxkSnapshot(fields) {
  const f = fields || {};
  return auditLog.parseSxK(f['Riskpoäng'] || f.Riskpoang || f.Samspelsexempel);
}

function sameJson(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return a === b;
  }
}

async function logCustomerCreated({ write, actor, byraId, customerId, fields }) {
  if (!write || !customerId) return null;
  if (!auditLog.customerRiskEmpty(fields)) return null;
  return write({
    actionType: 'risknivå_ej_satt_vid_skapande',
    entityType: 'kund',
    entityId: customerId,
    actor: actor || auditLog.SYSTEM_ACTORS.system,
    byraId,
    fieldChanged: 'Riskniva',
    valueBefore: null,
    valueAfter: null,
    metadata: {
      entitetNamn: (fields && (fields.Namn || fields['Företagsnamn'])) || '',
      utlösandeHändelse: 'kund_skapad'
    }
  });
}

async function logCustomerRiskChange({ write, actor, byraId, customerId, before, after, motivering, trigger }) {
  if (!write) return null;
  const prev = riskValue(before);
  const next = riskValue(after);
  if (prev === next) return null;
  return write({
    actionType: 'risknivå_ändrad',
    entityType: 'kund',
    entityId: customerId,
    actor,
    byraId,
    fieldChanged: 'Riskniva',
    valueBefore: prev || null,
    valueAfter: next || null,
    motivering: motivering || (after && after['Byrans riskbedomning']) || 'Manuell ändring utan motivering',
    metadata: {
      entitetNamn: (after && (after.Namn || after['Företagsnamn'])) || (before && before.Namn) || '',
      tidigareSXK: { nivå: prev },
      nyaSXK: { nivå: next },
      utlösandeHändelse: trigger || 'manuell_ändring'
    }
  }, { allowEmptyMotivering: true });
}

async function logSxkChange({ write, actor, byraId, entityType, entityId, before, after, namn, trigger }) {
  if (!write) return null;
  const prev = sxkSnapshot(before);
  const next = sxkSnapshot(after);
  const prevLevel = (before && (before.Riskbedömning || before.Riskbedomning)) || (prev && prev.nivå) || '';
  const nextLevel = (after && (after.Riskbedömning || after.Riskbedomning)) || (next && next.nivå) || '';
  if (sameJson(prev, next) && String(prevLevel) === String(nextLevel)) return null;
  return write({
    actionType: 'risknivå_ändrad',
    entityType,
    entityId,
    actor,
    byraId,
    fieldChanged: 'Riskpoäng',
    valueBefore: prev,
    valueAfter: next,
    motivering: (after && (after['Beskrivning av riskfaktor'] || after.Beskrivning || after['Tjänstebeskrivning'])) || 'S×K-ändring',
    metadata: {
      entitetNamn: namn || '',
      tidigareSXK: prev || { nivå: prevLevel },
      nyaSXK: next || { nivå: nextLevel },
      utlösandeHändelse: trigger || 'manuell_ändring'
    }
  }, { allowEmptyMotivering: true });
}

async function logAiGenerated({ write, actor, byraId, entityType, entityId, fieldChanged, aiOutputRaw, extra }) {
  if (!write) return null;
  return write({
    actionType: 'ai_innehåll_genererat',
    entityType,
    entityId,
    actor: actor || auditLog.SYSTEM_ACTORS.openai,
    byraId,
    fieldChanged,
    valueAfter: aiOutputRaw,
    metadata: {
      promptVersion: process.env.OPENAI_ASSISTANT_ID || '',
      modellNamn: 'OpenAI Assistant',
      faltSomGenererades: fieldChanged,
      aiOutputRaw,
      sparadText: '',
      ...(extra || {})
    }
  });
}

async function logAiSaved({ service, generatedId, sparadText, actor }) {
  if (!service || !generatedId) return null;
  try {
    return await service.insertAiSaved({ generatedId, sparadText, actor });
  } catch (err) {
    console.warn('audit-log ai saved:', err.message);
    return null;
  }
}

async function logArVersion({ write, actor, byraId, entityId, fromCount, toCount, trigger, filename }) {
  if (!write) return null;
  return write({
    actionType: 'ar_version_skapad',
    entityType: 'ar_dokument',
    entityId,
    actor,
    byraId,
    fieldChanged: 'Dokumentation PDF-filer',
    valueBefore: fromCount,
    valueAfter: toCount,
    metadata: {
      versionFrån: fromCount,
      versionTill: toCount,
      trigger: trigger || 'export_pdf',
      filename: filename || '',
      diffSammanfattning: 'Ny exporterad version av allmän riskbedömning/policy'
    }
  });
}

async function logScreening({ write, actor, byraId, customerId, namn, hits, foundRecords, sokTyp }) {
  if (!write) return null;
  const perTraff = auditLog.mapDilisenseHits(foundRecords);
  return write({
    actionType: 'screening_utförd',
    entityType: 'kund',
    entityId: customerId,
    actor: actor || auditLog.SYSTEM_ACTORS.dilisense,
    byraId,
    fieldChanged: 'Antal träffar PEP och sanktionslistor',
    valueAfter: hits,
    metadata: {
      sokTjanst: 'Dilisense',
      sokTyp: sokTyp || 'pep',
      matchadPerson: namn || '',
      antalTraffar: hits,
      perTraff
    }
  });
}

async function logAvvikelse({ write, actor, byraId, avvikelseId, customerId, beskrivning, status, typ, orgnr }) {
  if (!write) return null;
  const reported = /finanspolisen|rapporterad till fm/i.test(String(status || ''));
  return write({
    actionType: reported ? 'avvikelse_eskalerad' : 'avvikelse_registrerad',
    entityType: 'avvikelse',
    entityId: avvikelseId,
    actor,
    byraId,
    fieldChanged: 'Status',
    valueAfter: status,
    motivering: beskrivning || typ || 'Avvikelse registrerad',
    metadata: {
      kundId: customerId || '',
      beskrivning: beskrivning || '',
      typ: typ || '',
      orgnr: orgnr || '',
      statusHistorik: [{ status: status || 'Öppen', datum: new Date().toISOString(), av: (actor && actor.actorName) || '' }],
      rapporteradTillFinanspolisen: reported,
      rapportDatum: reported ? new Date().toISOString().slice(0, 10) : null
    }
  }, { allowEmptyMotivering: true });
}

async function logAvvikelseStatus({ write, actor, byraId, avvikelseId, customerId, fromStatus, toStatus, beskrivning, rapportDatum }) {
  if (!write || String(fromStatus || '') === String(toStatus || '')) return null;
  const reported = /finanspolisen|rapporterad till fm/i.test(String(toStatus || ''));
  return write({
    actionType: reported ? 'avvikelse_eskalerad' : 'avvikelse_status_ändrad',
    entityType: 'avvikelse',
    entityId: avvikelseId,
    actor,
    byraId,
    fieldChanged: 'Status',
    valueBefore: fromStatus,
    valueAfter: toStatus,
    motivering: beskrivning || ('Statusändring till ' + toStatus),
    metadata: {
      kundId: customerId || '',
      beskrivning: beskrivning || '',
      statusHistorik: [{ status: toStatus, datum: new Date().toISOString(), av: (actor && actor.actorName) || '' }],
      rapporteradTillFinanspolisen: reported,
      rapportDatum: rapportDatum || (reported ? new Date().toISOString().slice(0, 10) : null)
    }
  }, { allowEmptyMotivering: true });
}

async function logRiskaptitStatusChange({ write, actor, byraId, customerId, beforeStatus, afterStatus, niva, pictureKey, trigger }) {
  if (!write || String(beforeStatus || '') === String(afterStatus || '')) return null;
  return write({
    actionType: 'riskaptit_status_ändrad',
    entityType: 'kund',
    entityId: customerId,
    actor,
    byraId,
    fieldChanged: 'Riskaptit status',
    valueBefore: beforeStatus || null,
    valueAfter: afterStatus || null,
    motivering: niva ? ('Sammantagen residualrisk ' + niva) : 'Riskaptitstatus uppdaterad',
    metadata: {
      niva: niva || '',
      riskbild: pictureKey || '',
      utlösandeHändelse: trigger || 'risknivå_ändrad'
    }
  }, { allowEmptyMotivering: true });
}

async function logRiskaptitBeslut({ write, actor, byraId, customerId, utfall, motivering, niva, pictureKey, previousUtfall }) {
  if (!write) return null;
  return write({
    actionType: 'riskaptit_beslut_registrerat',
    entityType: 'kund',
    entityId: customerId,
    actor,
    byraId,
    fieldChanged: 'Riskaptit beslut utfall',
    valueBefore: previousUtfall || null,
    valueAfter: utfall || null,
    motivering: motivering || '',
    metadata: {
      niva: niva || '',
      riskbild: pictureKey || '',
      utfall: utfall || ''
    }
  });
}

module.exports = {
  riskValue,
  sxkSnapshot,
  logCustomerCreated,
  logCustomerRiskChange,
  logSxkChange,
  logAiGenerated,
  logAiSaved,
  logArVersion,
  logScreening,
  logAvvikelse,
  logAvvikelseStatus,
  logRiskaptitStatusChange,
  logRiskaptitBeslut
};
