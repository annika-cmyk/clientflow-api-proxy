'use strict';

/**
 * Kundkortets resa: Uppläggning → Väntar på kund → Riskbedömning → Avtal → Aktiv kund.
 * Använder befintliga statusfält (kundresa, KYC, Riskniva/godkännande, uppdragsavtal).
 */

const RiskBeslut = require('./risk-beslut');

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function fieldChecked(fields, name) {
  const v = fields && fields[name];
  return v === true || v === 'Ja' || v === 'ja' || v === 1 || v === '1';
}

function kycStatusPhase(fields = {}, kyc = {}) {
  const f = fields || {};
  const k = kyc || {};
  if (fieldChecked(f, 'KYC-formulär utanför ClientFlow') || k.utanforClientFlow === true) {
    return trimStr(f['KYC UTFÖRD DATUM']) ? 'besvarat' : 'ej';
  }
  const status = trimStr(k.status || f['KYC status'] || '');
  if (/signerat/i.test(status) || trimStr(k.signeringsdatum)) return 'signerat';
  if (/besvarat/i.test(status) || trimStr(k.customerAnsweredAt)) return 'besvarat';
  if (
    /skickat|ifyllnad|invite|länk/i.test(status)
    || k.inviteToken
    || trimStr(k.inviteSentAt || k.utskickningsdatum || f['KYC skickad datum'])
  ) {
    return 'skickat';
  }
  return 'ej';
}

function upplaggningDone(kundresa) {
  if (!kundresa) return false;
  if (kundresa.complete === true || kundresa.allDone === true) return true;
  const steps = Array.isArray(kundresa.steps) ? kundresa.steps : [];
  if (!steps.length) return false;
  return steps.every((s) => s.done === true || s.status === 'done' || s.status === 'klar');
}

function riskApproved(fields = {}) {
  return RiskBeslut.isApproved(fields || {});
}

function hasBedomdRisk(fields = {}) {
  return !!trimStr(fields.Riskniva || fields['sammanlagd risk'] || '');
}

function avtalKlar(avtalFields = {}, customerFields = {}) {
  if (fieldChecked(customerFields, 'Uppdragsavtal utanför ClientFlow')) return true;
  const status = trimStr(avtalFields.Avtalsstatus || avtalFields.Status || '');
  return status === 'Signerat';
}

/**
 * @returns {{
 *   stages: Array<{id:string,label:string,state:'done'|'current'|'pending'|'blocked'}>,
 *   currentId: string,
 *   kycPhase: string,
 *   canOpenRisk: boolean,
 *   riskBridgeLabel: string,
 *   chainSentence: string
 * }}
 */
function buildTimeline(ctx = {}) {
  const fields = ctx.fields || {};
  const kyc = ctx.kyc || {};
  const kundresa = ctx.kundresa || null;
  const avtalFields = ctx.avtalFields || {};

  const kycPhase = kycStatusPhase(fields, kyc);
  const upDone = upplaggningDone(kundresa) || kycPhase !== 'ej';
  const kycAnswered = kycPhase === 'besvarat' || kycPhase === 'signerat';
  const kycWaiting = kycPhase === 'skickat';
  const riskOk = riskApproved(fields);
  const riskStarted = hasBedomdRisk(fields) || riskOk;
  const avtalOk = avtalKlar(avtalFields, fields);

  let currentId = 'upplaggning';
  if (avtalOk && riskOk) currentId = 'aktiv';
  else if (riskOk) currentId = 'avtal';
  else if (kycAnswered) currentId = 'risk';
  else if (kycWaiting || upDone) currentId = 'vantar';
  else currentId = 'upplaggning';

  const order = ['upplaggning', 'vantar', 'risk', 'avtal', 'aktiv'];
  const labels = {
    upplaggning: 'Uppläggning',
    vantar: 'Väntar på kund',
    risk: 'Riskbedömning',
    avtal: 'Avtal',
    aktiv: 'Aktiv kund'
  };
  const doneFlags = {
    upplaggning: upDone || kycWaiting || kycAnswered || riskOk || avtalOk,
    vantar: kycAnswered || riskOk || avtalOk,
    risk: riskOk || avtalOk,
    avtal: avtalOk,
    aktiv: avtalOk && riskOk
  };

  const stages = order.map((id) => {
    let state = 'pending';
    if (doneFlags[id] && id !== currentId) state = 'done';
    else if (id === currentId) state = 'current';
    else if (id === 'risk' && kycWaiting) state = 'blocked';
    else if (id === 'avtal' && !riskOk) state = 'blocked';
    else if (id === 'aktiv' && !avtalOk) state = 'blocked';
    return { id, label: labels[id], state };
  });

  // Markera klara steg före current som done
  const curIdx = order.indexOf(currentId);
  stages.forEach((s, i) => {
    if (i < curIdx) s.state = 'done';
    if (i === curIdx && s.state !== 'done') s.state = 'current';
  });
  if (currentId === 'aktiv') {
    stages.forEach((s) => { s.state = 'done'; });
    stages[stages.length - 1].state = 'current';
  }

  const canOpenRisk = kycAnswered;
  return {
    stages,
    currentId,
    kycPhase,
    canOpenRisk,
    riskStarted,
    riskOk,
    riskBridgeLabel: canOpenRisk
      ? (riskOk ? 'Öppna riskbedömning & beslut' : 'Fortsätt till riskbedömning')
      : '',
    // Risksteget är klickbart när uppläggning är klar (även om KYC ej signerat → preliminär)
    canClickRisk: upDone || kycAnswered || kycWaiting,
    riskStepStatuses: RiskBeslut.computeStepStatuses({ fields }),
    chainSentence: 'Kunden lämnar uppgifter → byrån bedömer risken → beslut → avtal.',
    nextAfterSend:
      'När kunden svarat (Besvarat/Signerat) fortsätter ni med Riskbedömning & beslut — separat från uppläggningen. Kunden ser aldrig riskbedömningen.'
  };
}

module.exports = {
  kycStatusPhase,
  upplaggningDone,
  riskApproved,
  hasBedomdRisk,
  avtalKlar,
  buildTimeline
};
