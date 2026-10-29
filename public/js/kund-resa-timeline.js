/**
 * Browser twin — kundkort journey timeline.
 */
(function (global) {
  function trimStr(v) { return v == null ? '' : String(v).trim(); }
  function fieldChecked(fields, name) {
    var v = fields && fields[name];
    return v === true || v === 'Ja' || v === 'ja' || v === 1 || v === '1';
  }

  function kycStatusPhase(fields, kyc) {
    var f = fields || {};
    var k = kyc || {};
    if (fieldChecked(f, 'KYC-formulär utanför ClientFlow') || k.utanforClientFlow === true) {
      return trimStr(f['KYC UTFÖRD DATUM']) ? 'besvarat' : 'ej';
    }
    var status = trimStr(k.status || f['KYC status'] || '');
    if (/signerat/i.test(status) || trimStr(k.signeringsdatum)) return 'signerat';
    if (/besvarat/i.test(status) || trimStr(k.customerAnsweredAt)) return 'besvarat';
    if (/skickat|ifyllnad|invite|länk/i.test(status) || k.inviteToken
      || trimStr(k.inviteSentAt || k.utskickningsdatum || f['KYC skickad datum'])) {
      return 'skickat';
    }
    return 'ej';
  }

  function upplaggningDone(kundresa) {
    if (!kundresa) return false;
    if (kundresa.complete === true || kundresa.allDone === true) return true;
    var steps = Array.isArray(kundresa.steps) ? kundresa.steps : [];
    if (!steps.length) return false;
    return steps.every(function (s) {
      return s.done === true || s.status === 'done' || s.status === 'klar';
    });
  }

  function riskApproved(fields) {
    var f = fields || {};
    if (trimStr(f['Kundens riskbedömning godkänd'])) return true;
    if (trimStr(f['Riskbedömning utförd datum']) && trimStr(f.Riskniva || f['sammanlagd risk'])) return true;
    return false;
  }

  function hasBedomdRisk(fields) {
    return !!trimStr((fields || {}).Riskniva || (fields || {})['sammanlagd risk'] || '');
  }

  function avtalKlar(avtalFields, customerFields) {
    if (fieldChecked(customerFields, 'Uppdragsavtal utanför ClientFlow')) return true;
    var status = trimStr((avtalFields || {}).Avtalsstatus || (avtalFields || {}).Status || '');
    return status === 'Signerat';
  }

  function buildTimeline(ctx) {
    ctx = ctx || {};
    var fields = ctx.fields || {};
    var kyc = ctx.kyc || {};
    var kundresa = ctx.kundresa || null;
    var avtalFields = ctx.avtalFields || {};
    var kycPhase = kycStatusPhase(fields, kyc);
    var upDone = upplaggningDone(kundresa) || kycPhase !== 'ej';
    var kycAnswered = kycPhase === 'besvarat' || kycPhase === 'signerat';
    var kycWaiting = kycPhase === 'skickat';
    var riskOk = riskApproved(fields);
    var riskStarted = hasBedomdRisk(fields) || riskOk;
    var avtalOk = avtalKlar(avtalFields, fields);

    var currentId = 'upplaggning';
    if (avtalOk && riskOk) currentId = 'aktiv';
    else if (riskOk) currentId = 'avtal';
    else if (kycAnswered) currentId = 'risk';
    else if (kycWaiting || upDone) currentId = 'vantar';

    var order = ['upplaggning', 'vantar', 'risk', 'avtal', 'aktiv'];
    var labels = {
      upplaggning: 'Uppläggning',
      vantar: 'Väntar på kund',
      risk: 'Riskbedömning',
      avtal: 'Avtal',
      aktiv: 'Aktiv kund'
    };
    var curIdx = order.indexOf(currentId);
    var stages = order.map(function (id, i) {
      var state = 'pending';
      if (i < curIdx) state = 'done';
      else if (i === curIdx) state = 'current';
      else if (id === 'avtal' && !riskOk) state = 'blocked';
      else if (id === 'risk' && kycWaiting) state = 'blocked';
      return { id: id, label: labels[id], state: state };
    });
    if (currentId === 'aktiv') {
      stages.forEach(function (s) { s.state = 'done'; });
      stages[stages.length - 1].state = 'current';
    }

    return {
      stages: stages,
      currentId: currentId,
      kycPhase: kycPhase,
      canOpenRisk: kycAnswered,
      riskStarted: riskStarted,
      riskOk: riskOk,
      riskBridgeLabel: kycAnswered
        ? (riskOk ? 'Öppna riskbedömning & avtal' : 'Fortsätt till riskbedömning')
        : '',
      chainSentence: 'Kunden lämnar uppgifter → byrån bedömer risken → beslut → avtal.',
      nextAfterSend:
        'När kunden svarat (Besvarat/Signerat) fortsätter ni med Riskbedömning & avtal — separat från uppläggningen. Kunden ser aldrig riskbedömningen.'
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render(timeline) {
    var t = timeline || buildTimeline({});
    var stagesHtml = (t.stages || []).map(function (s, i) {
      return (i ? '<span class="kund-resa-tl-sep" aria-hidden="true"></span>' : '')
        + '<li class="kund-resa-tl-step is-' + esc(s.state) + '" data-stage="' + esc(s.id) + '">'
        + '<span class="kund-resa-tl-dot" aria-hidden="true">'
        + (s.state === 'done' ? '✓' : (s.state === 'current' ? '●' : '○'))
        + '</span>'
        + '<span class="kund-resa-tl-label">' + esc(s.label) + '</span>'
        + '</li>';
    }).join('');
    var bridge = t.canOpenRisk
      ? '<button type="button" class="btn btn-primary btn-sm kund-resa-tl-bridge" data-kund-resa-risk-bridge>'
        + esc(t.riskBridgeLabel) + '</button>'
      : '';
    return '<div class="kund-resa-timeline" data-kund-resa-timeline>'
      + '<p class="kund-resa-tl-chain">' + esc(t.chainSentence) + '</p>'
      + '<ol class="kund-resa-tl-list">' + stagesHtml + '</ol>'
      + (bridge ? '<div class="kund-resa-tl-actions">' + bridge + '</div>' : '')
      + '</div>';
  }

  var api = {
    kycStatusPhase: kycStatusPhase,
    upplaggningDone: upplaggningDone,
    riskApproved: riskApproved,
    hasBedomdRisk: hasBedomdRisk,
    avtalKlar: avtalKlar,
    buildTimeline: buildTimeline,
    render: render
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KundResaTimeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
