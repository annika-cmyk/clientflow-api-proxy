/**
 * Browser twin of lib/risk-beslut.js — stegstatus, behörighet, logg.
 */
(function (global) {
  var STATUS = {
    DRAFT: 'Utkast',
    WAITING: 'Väntar på granskning',
    NEEDS_FIX: 'Behöver komplettering',
    APPROVED: 'Godkänd',
    REJECTED: 'Avslagen',
    REASSESS: 'Behöver omprövas'
  };
  var STATUS_VALUES = Object.keys(STATUS).map(function (k) { return STATUS[k]; });

  var STEPS = [
    {
      id: 1,
      key: 'riskfaktorer',
      title: 'Riskfaktorer',
      desc: 'Från byråns katalog. Förvalda utifrån KYC och kundkort – bekräfta eller ändra.'
    },
    {
      id: 2,
      key: 'bedomning',
      title: 'Bedömning',
      desc: 'Beräknad residual, bedömd risk, motivering och bedömningspunkter.'
    },
    {
      id: 3,
      key: 'beslut',
      title: 'Granskning & beslut',
      desc: 'Godkänn, skicka tillbaka eller avslå. Låser bedömningen och sparar riskbeslut.'
    },
    {
      id: 4,
      key: 'avtal',
      title: 'Uppdragsavtal',
      desc: 'Parter, tjänster, bilagor och BankID-signering.'
    }
  ];

  var FIELD_STATUS = 'Riskbeslut status';
  var FIELD_REVIEWER = 'Riskbeslut granskare';
  var FIELD_PREPARED_BY = 'Riskbeslut förberedd av';
  var FIELD_LOG = 'Riskbeslut logg';
  var FIELD_VERSION = 'Riskbeslut version';
  var FIELD_PDF = 'Riskbeslut PDF';
  var FIELD_NEXT_FOLLOWUP = 'Nästa uppföljning';
  var FIELD_CAN_APPROVE = 'Får godkänna riskbedömning';
  var FIELD_REQUIRE_OTHER = 'Kräv att en annan person godkänner';

  var REQUIRE_OTHER = {
    NEVER: 'Aldrig',
    HIGH: 'Vid Hög och Oacceptabel',
    ALWAYS: 'Alltid'
  };

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function normalizeStatus(raw) {
    var s = trimStr(raw);
    if (!s) return STATUS.DRAFT;
    var hit = STATUS_VALUES.find(function (v) { return v.toLowerCase() === s.toLowerCase(); });
    return hit || STATUS.DRAFT;
  }

  function parseLog(raw) {
    if (Array.isArray(raw)) return raw.slice();
    var s = trimStr(raw);
    if (!s) return [];
    try {
      var parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function serializeLog(entries) {
    return JSON.stringify(Array.isArray(entries) ? entries : []);
  }

  function appendLog(existingRaw, entry) {
    var list = parseLog(existingRaw);
    list.push({
      at: (entry && entry.at) || new Date().toISOString(),
      event: trimStr((entry && (entry.event || entry.händelse || entry.handelse)) || ''),
      userId: trimStr((entry && entry.userId) || ''),
      userName: trimStr((entry && (entry.userName || entry.person)) || ''),
      comment: trimStr((entry && (entry.comment || entry.kommentar)) || '')
    });
    return serializeLog(list);
  }

  function readDecision(fields) {
    var f = fields || {};
    return {
      status: normalizeStatus(f[FIELD_STATUS]),
      reviewerId: trimStr(f[FIELD_REVIEWER]),
      preparedById: trimStr(f[FIELD_PREPARED_BY]),
      log: parseLog(f[FIELD_LOG]),
      version: Number(f[FIELD_VERSION]) > 0 ? Number(f[FIELD_VERSION]) : 0,
      pdf: trimStr(f[FIELD_PDF]),
      nextFollowUp: trimStr(f[FIELD_NEXT_FOLLOWUP] || f['Nästa KYC-uppföljning'] || '')
    };
  }

  function legacyApproved(fields) {
    var f = fields || {};
    if (trimStr(f['Kundens riskbedömning godkänd'])) return true;
    if (trimStr(f['Riskbedömning utförd datum']) && trimStr(f.Riskniva || f['sammanlagd risk'])) return true;
    return false;
  }

  function isApproved(fields) {
    var d = readDecision(fields);
    if (d.status === STATUS.APPROVED) return true;
    if (!trimStr((fields || {})[FIELD_STATUS]) && legacyApproved(fields)) return true;
    return false;
  }

  function parseReviewJson(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    var s = trimStr(raw);
    if (!s) return { pending: [] };
    try {
      var parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return { pending: parsed };
      if (parsed && typeof parsed === 'object') {
        var pending = Array.isArray(parsed.pending) ? parsed.pending : [];
        return Object.assign({}, parsed, { pending: pending });
      }
    } catch (_) { /* ignore */ }
    return { pending: [] };
  }

  function pendingReviewCount(fields) {
    var f = fields || {};
    if (trimStr(f['Riskprofil status']) === 'behöver_granskas') {
      var data = parseReviewJson(f['Riskfaktor granskning (JSON)']);
      return Math.max(1, (data.pending || []).length);
    }
    return (parseReviewJson(f['Riskfaktor granskning (JSON)']).pending || []).length;
  }

  function hasBedomdRisk(fields) {
    return !!trimStr((fields || {}).Riskniva || (fields || {})['sammanlagd risk'] || '');
  }

  function hasMotivering(fields) {
    return !!trimStr((fields || {})['Byrans riskbedomning'] || (fields || {}).Motivering || '');
  }

  function byranHarComplete(fields) {
    var raw = (fields || {})['Byrån har'];
    var list = Array.isArray(raw)
      ? raw.map(function (x) { return trimStr(x); })
      : String(raw || '').split(/[,;]/).map(function (x) { return trimStr(x); }).filter(Boolean);
    var need = [
      'Kapacitet att ta emot kunden',
      'Kundkännedom har uppnåtts',
      'Kunden bedöms som seriös',
      'Kunskap nog att hjälpa kunden'
    ];
    var missing = need.filter(function (n) {
      return !list.some(function (x) { return x === n || x.toLowerCase() === n.toLowerCase(); });
    });
    return { complete: missing.length === 0, missing: missing, checked: list };
  }

  function needsAvvikelseMotivering(fields) {
    var f = fields || {};
    var assessed = trimStr(f.Riskniva || f['sammanlagd risk']);
    var proposed = trimStr(f['Kund föreslagen nivå']);
    if (!assessed || !proposed) return false;
    if (assessed.toLowerCase() === proposed.toLowerCase()) return false;
    return !trimStr(f['Kund avvikelse motivering']);
  }

  function computeStepStatuses(ctx) {
    ctx = ctx || {};
    var fields = ctx.fields || {};
    var decision = readDecision(fields);
    var status = decision.status;
    var reviewPending = pendingReviewCount(fields);
    var catalogDirty = trimStr(fields['Riskprofil status']) === 'behöver_omprofilering';
    var bedomd = hasBedomdRisk(fields);
    var motivering = hasMotivering(fields);
    var byran = byranHarComplete(fields);
    var avvikelseMissing = needsAvvikelseMotivering(fields);
    var approved = status === STATUS.APPROVED || (!trimStr(fields[FIELD_STATUS]) && legacyApproved(fields));
    var rejected = status === STATUS.REJECTED;
    var waiting = status === STATUS.WAITING;
    var needsFix = status === STATUS.NEEDS_FIX;
    var reassessment = status === STATUS.REASSESS;

    var step1Remaining = [];
    if (reviewPending > 0) step1Remaining.push('granska ' + reviewPending + ' faktor' + (reviewPending === 1 ? '' : 'er'));
    if (catalogDirty) step1Remaining.push('kataloguppdatering');

    var step2Remaining = [];
    if (!bedomd) step2Remaining.push('bedömd risk');
    if (!motivering) step2Remaining.push('motivering');
    if (avvikelseMissing) step2Remaining.push('avvikelsemotivering');
    if (!byran.complete) {
      step2Remaining.push(
        byran.missing.length === 1
          ? '1 bedömningspunkt'
          : byran.missing.length + ' bedömningspunkter'
      );
    }

    var step1Done = step1Remaining.length === 0;
    var step2Done = step2Remaining.length === 0 && step1Done;

    function stateFor(id) {
      if (id === 4) {
        if (approved) return 'current';
        return 'locked';
      }
      if (id === 3) {
        if (approved || rejected) return 'done';
        if (waiting) return 'current';
        if (needsFix) return 'attention';
        if (step2Done) return 'current';
        return 'pending';
      }
      if (id === 2) {
        if (approved || rejected || waiting) return 'done';
        if (!step1Done) return 'pending';
        if (step2Done) return 'done';
        return 'current';
      }
      if (approved || rejected || waiting) return 'done';
      if (step1Done) return 'done';
      if (step1Remaining.length) return 'attention';
      return 'current';
    }

    function labelFor(id, state) {
      if (id === 4) {
        if (approved) return ctx.avtalStatusLabel || 'Utkast';
        if (rejected) return 'Låst (avslagen)';
        return 'Låst tills godkänd';
      }
      if (id === 3) {
        if (approved) {
          var d = trimStr(fields['Kundens riskbedömning godkänd']).slice(0, 10);
          return d ? 'Godkänd ' + d : 'Godkänd';
        }
        if (rejected) return 'Avslagen';
        if (waiting) return ctx.isReviewer ? 'Väntar på dig' : 'Väntar på granskning';
        if (needsFix) return 'Behöver komplettering';
        if (state === 'current') return 'Redo för granskning';
        return '–';
      }
      if (id === 2) {
        if (state === 'done') return 'Klart';
        if (step2Remaining.length) return step2Remaining.length + ' sak' + (step2Remaining.length === 1 ? '' : 'er') + ' kvar';
        return 'Ej påbörjad';
      }
      if (state === 'done') return 'Klart';
      if (step1Remaining.length) {
        return step1Remaining[0].replace(/^granska /, '') + (step1Remaining[0].indexOf('granska') === 0 ? ' att granska' : '');
      }
      return 'Ej påbörjad';
    }

    var steps = STEPS.map(function (s) {
      var state = stateFor(s.id);
      return Object.assign({}, s, {
        state: state,
        status: state,
        label: labelFor(s.id, state),
        locked: s.id === 4 && !approved,
        gated: s.id === 4 && !approved,
        remaining: s.id === 1 ? step1Remaining : (s.id === 2 ? step2Remaining : []),
        number: s.id
      });
    });

    var remainingFooter = '';
    var active = steps.find(function (s) { return s.state === 'current' || s.state === 'attention'; }) || steps[0];
    if (active.id === 1 && step1Remaining.length) remainingFooter = 'Kvar: ' + step1Remaining.join(', ');
    else if (active.id === 2 && step2Remaining.length) remainingFooter = 'Kvar: ' + step2Remaining.join(', ');
    else if (active.id === 3 && waiting) remainingFooter = ctx.isReviewer ? 'Väntar på ditt beslut' : 'Väntar på granskare';
    if (reassessment) remainingFooter = 'Behöver omprövas';

    return {
      steps: steps,
      activeHint: remainingFooter,
      remainingFooter: remainingFooter,
      decision: Object.assign({}, decision, {
        status: approved && !trimStr(fields[FIELD_STATUS]) ? STATUS.APPROVED : status
      }),
      canOpenAvtal: approved,
      step1Done: step1Done,
      step2Done: step2Done,
      reviewPending: reviewPending,
      catalogDirty: catalogDirty,
      lockedAfterSend: waiting || approved || rejected,
      byranHar: byran
    };
  }

  function canApproveRisk(user) {
    user = user || {};
    var role = trimStr(user.role || user.Role || '');
    if (/clientflowadmin/i.test(role)) return false;
    var flag = user.canApproveRisk;
    if (flag === true || flag === 'Ja' || flag === 1 || flag === '1') return true;
    if (flag === false || flag === 'Nej' || flag === 0 || flag === '0') return false;
    return /ledare/i.test(role);
  }

  function allowSelfReview(byraSettings, residualNiva) {
    byraSettings = byraSettings || {};
    var setting = trimStr(byraSettings.requireOtherApprover || byraSettings[FIELD_REQUIRE_OTHER] || REQUIRE_OTHER.NEVER);
    if (!setting || setting === REQUIRE_OTHER.NEVER || /^aldrig$/i.test(setting)) return true;
    if (setting === REQUIRE_OTHER.ALWAYS || /^alltid$/i.test(setting)) return false;
    var niva = trimStr(residualNiva).toLowerCase();
    if (setting === REQUIRE_OTHER.HIGH || /hög|hog|oacceptabel/i.test(setting)) {
      return !(niva === 'hög' || niva === 'hog' || niva === 'oacceptabel');
    }
    return true;
  }

  function defaultCanApproveForRole(role) {
    var r = trimStr(role);
    if (/clientflowadmin/i.test(r)) return false;
    if (/ledare/i.test(r)) return true;
    return false;
  }

  function migrationPatchForCustomer(fields) {
    var f = fields || {};
    if (trimStr(f[FIELD_STATUS])) return { needed: false, fields: null };
    if (!legacyApproved(f)) return { needed: false, fields: null };
    var datum = trimStr(f['Kundens riskbedömning godkänd'] || f['Riskbedömning utförd datum']).slice(0, 10)
      || new Date().toISOString().slice(0, 10);
    return {
      needed: true,
      fields: {
        [FIELD_STATUS]: STATUS.APPROVED,
        [FIELD_VERSION]: 1,
        [FIELD_LOG]: appendLog('[]', {
          at: datum,
          event: 'Migrerad från tidigare godkännande',
          userName: 'okänd',
          comment: ''
        })
      }
    };
  }

  var api = {
    STATUS: STATUS,
    STATUS_VALUES: STATUS_VALUES,
    STEPS: STEPS,
    FIELD_STATUS: FIELD_STATUS,
    FIELD_REVIEWER: FIELD_REVIEWER,
    FIELD_PREPARED_BY: FIELD_PREPARED_BY,
    FIELD_LOG: FIELD_LOG,
    FIELD_VERSION: FIELD_VERSION,
    FIELD_PDF: FIELD_PDF,
    FIELD_NEXT_FOLLOWUP: FIELD_NEXT_FOLLOWUP,
    FIELD_CAN_APPROVE: FIELD_CAN_APPROVE,
    FIELD_REQUIRE_OTHER: FIELD_REQUIRE_OTHER,
    REQUIRE_OTHER: REQUIRE_OTHER,
    normalizeStatus: normalizeStatus,
    parseLog: parseLog,
    serializeLog: serializeLog,
    appendLog: appendLog,
    readDecision: readDecision,
    legacyApproved: legacyApproved,
    isApproved: isApproved,
    pendingReviewCount: pendingReviewCount,
    byranHarComplete: byranHarComplete,
    computeStepStatuses: computeStepStatuses,
    canApproveRisk: canApproveRisk,
    allowSelfReview: allowSelfReview,
    defaultCanApproveForRole: defaultCanApproveForRole,
    migrationPatchForCustomer: migrationPatchForCustomer
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.RiskBeslut = api;
})(typeof window !== 'undefined' ? window : globalThis);
