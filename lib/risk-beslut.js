/**
 * Riskbedömning & beslut — gemensam stegstatus, statuskonstanter och behörighet.
 * Används av popup-sidomeny, footer «Kvar:», tidslinje och server-gates.
 */

'use strict';

const STATUS = {
  DRAFT: 'Utkast',
  WAITING: 'Väntar på granskning',
  NEEDS_FIX: 'Behöver komplettering',
  APPROVED: 'Godkänd',
  REJECTED: 'Avslagen',
  REASSESS: 'Behöver omprövas'
};

const STATUS_VALUES = Object.values(STATUS);

const STEPS = [
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

const FIELD_STATUS = 'Riskbeslut status';
const FIELD_REVIEWER = 'Riskbeslut granskare';
const FIELD_PREPARED_BY = 'Riskbeslut förberedd av';
const FIELD_LOG = 'Riskbeslut logg';
const FIELD_VERSION = 'Riskbeslut version';
const FIELD_PDF = 'Riskbeslut PDF';
const FIELD_NEXT_FOLLOWUP = 'Nästa uppföljning';
const FIELD_CAN_APPROVE = 'Får godkänna riskbedömning';
const FIELD_REQUIRE_OTHER = 'Kräv att en annan person godkänner';

const REQUIRE_OTHER = {
  NEVER: 'Aldrig',
  HIGH: 'Vid Hög och Oacceptabel',
  ALWAYS: 'Alltid'
};

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function normalizeStatus(raw) {
  const s = trimStr(raw);
  if (!s) return STATUS.DRAFT;
  const hit = STATUS_VALUES.find((v) => v.toLowerCase() === s.toLowerCase());
  return hit || STATUS.DRAFT;
}

function parseLog(raw) {
  if (Array.isArray(raw)) return raw.slice();
  const s = trimStr(raw);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function serializeLog(entries) {
  return JSON.stringify(Array.isArray(entries) ? entries : []);
}

/**
 * Append-only: returnerar ny JSON-sträng. Överskriver aldrig befintliga poster.
 */
function appendLog(existingRaw, entry) {
  const list = parseLog(existingRaw);
  const row = {
    at: entry?.at || new Date().toISOString(),
    event: trimStr(entry?.event || entry?.händelse || entry?.handelse),
    userId: trimStr(entry?.userId || ''),
    userName: trimStr(entry?.userName || entry?.person || ''),
    comment: trimStr(entry?.comment || entry?.kommentar || '')
  };
  list.push(row);
  return serializeLog(list);
}

function readDecision(fields = {}) {
  const f = fields || {};
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

function legacyApproved(fields = {}) {
  const f = fields || {};
  if (trimStr(f['Kundens riskbedömning godkänd'])) return true;
  if (trimStr(f['Riskbedömning utförd datum']) && trimStr(f.Riskniva || f['sammanlagd risk'])) {
    return true;
  }
  return false;
}

function isApproved(fields = {}) {
  const d = readDecision(fields);
  if (d.status === STATUS.APPROVED) return true;
  // Under migrering: legacy räknas tills status satts
  if (!trimStr(fields[FIELD_STATUS]) && legacyApproved(fields)) return true;
  return false;
}

function parseReviewJson(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  const s = trimStr(raw);
  if (!s) return { pending: [] };
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return { pending: parsed };
    if (parsed && typeof parsed === 'object') {
      const pending = Array.isArray(parsed.pending) ? parsed.pending : [];
      return { ...parsed, pending };
    }
  } catch (_) { /* ignore */ }
  return { pending: [] };
}

function pendingReviewCount(fields = {}) {
  const f = fields || {};
  if (trimStr(f['Riskprofil status']) === 'behöver_granskas') {
    const data = parseReviewJson(f['Riskfaktor granskning (JSON)']);
    return Math.max(1, (data.pending || []).length);
  }
  const data = parseReviewJson(f['Riskfaktor granskning (JSON)']);
  return (data.pending || []).length;
}

function hasBedomdRisk(fields = {}) {
  return !!trimStr(fields.Riskniva || fields['sammanlagd risk'] || '');
}

function hasMotivering(fields = {}) {
  return !!trimStr(fields['Byrans riskbedomning'] || fields.Motivering || '');
}

function byranHarComplete(fields = {}) {
  const raw = fields['Byrån har'];
  const list = Array.isArray(raw)
    ? raw.map((x) => trimStr(x))
    : String(raw || '').split(/[,;]/).map((x) => trimStr(x)).filter(Boolean);
  const need = [
    'Kapacitet att ta emot kunden',
    'Kundkännedom har uppnåtts',
    'Kunden bedöms som seriös',
    'Kunskap nog att hjälpa kunden'
  ];
  const missing = need.filter((n) => !list.some((x) => x === n || x.toLowerCase() === n.toLowerCase()));
  return { complete: missing.length === 0, missing, checked: list };
}

function needsAvvikelseMotivering(fields = {}) {
  const assessed = trimStr(fields.Riskniva || fields['sammanlagd risk']);
  const proposed = trimStr(fields['Kund föreslagen nivå']);
  if (!assessed || !proposed) return false;
  if (assessed.toLowerCase() === proposed.toLowerCase()) return false;
  return !trimStr(fields['Kund avvikelse motivering']);
}

/**
 * @returns {{
 *   steps: Array<{id,key,title,desc,state,label,locked,remaining:string[]}>,
 *   activeHint: string,
 *   remainingFooter: string,
 *   decision: object,
 *   canOpenAvtal: boolean
 * }}
 */
function computeStepStatuses(ctx = {}) {
  const fields = ctx.fields || {};
  const decision = readDecision(fields);
  const status = decision.status;
  const reviewPending = pendingReviewCount(fields);
  const catalogDirty = trimStr(fields['Riskprofil status']) === 'behöver_omprofilering';
  const bedomd = hasBedomdRisk(fields);
  const motivering = hasMotivering(fields);
  const byran = byranHarComplete(fields);
  const avvikelseMissing = needsAvvikelseMotivering(fields);
  const approved = status === STATUS.APPROVED || (!trimStr(fields[FIELD_STATUS]) && legacyApproved(fields));
  const rejected = status === STATUS.REJECTED;
  const waiting = status === STATUS.WAITING;
  const needsFix = status === STATUS.NEEDS_FIX;
  const reassessment = status === STATUS.REASSESS;
  const lockedAfterSend = waiting || approved || rejected;

  const step1Remaining = [];
  if (reviewPending > 0) step1Remaining.push(`granska ${reviewPending} faktor${reviewPending === 1 ? '' : 'er'}`);
  if (catalogDirty) step1Remaining.push('kataloguppdatering');

  const step2Remaining = [];
  if (!bedomd) step2Remaining.push('bedömd risk');
  if (!motivering) step2Remaining.push('motivering');
  if (avvikelseMissing) step2Remaining.push('avvikelsemotivering');
  if (!byran.complete) {
    step2Remaining.push(
      byran.missing.length === 1
        ? '1 bedömningspunkt'
        : `${byran.missing.length} bedömningspunkter`
    );
  }

  const step1Done = step1Remaining.length === 0;
  const step2Done = step2Remaining.length === 0 && step1Done;

  function stateFor(id) {
    if (id === 4) {
      if (approved) return waiting || needsFix ? 'pending' : 'current';
      if (rejected) return 'locked';
      return 'locked';
    }
    if (id === 3) {
      if (approved) return 'done';
      if (rejected) return 'done';
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
    // id === 1
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
        const d = trimStr(fields['Kundens riskbedömning godkänd']).slice(0, 10);
        return d ? `Godkänd ${d}` : 'Godkänd';
      }
      if (rejected) return 'Avslagen';
      if (waiting) return ctx.isReviewer ? 'Väntar på dig' : 'Väntar på granskning';
      if (needsFix) return 'Behöver komplettering';
      if (state === 'current') return 'Redo för granskning';
      return '–';
    }
    if (id === 2) {
      if (state === 'done') return 'Klart';
      if (step2Remaining.length) return `${step2Remaining.length} sak${step2Remaining.length === 1 ? '' : 'er'} kvar`;
      return 'Ej påbörjad';
    }
    if (state === 'done') return 'Klart';
    if (step1Remaining.length) {
      return step1Remaining[0].replace(/^granska /, '') + (step1Remaining[0].startsWith('granska') ? ' att granska' : '');
    }
    return 'Ej påbörjad';
  }

  const steps = STEPS.map((s) => {
    const state = stateFor(s.id);
    const remaining = s.id === 1 ? step1Remaining : (s.id === 2 ? step2Remaining : []);
    return {
      ...s,
      state,
      label: labelFor(s.id, state),
      locked: s.id === 4 && !approved,
      remaining
    };
  });

  let remainingFooter = '';
  const active = steps.find((s) => s.state === 'current' || s.state === 'attention') || steps[0];
  if (active.id === 1 && step1Remaining.length) {
    remainingFooter = `Kvar: ${step1Remaining.join(', ')}`;
  } else if (active.id === 2 && step2Remaining.length) {
    remainingFooter = `Kvar: ${step2Remaining.join(', ')}`;
  } else if (active.id === 3 && waiting) {
    remainingFooter = ctx.isReviewer ? 'Väntar på ditt beslut' : 'Väntar på granskare';
  }

  if (reassessment) {
    remainingFooter = 'Behöver omprövas';
  }

  return {
    steps,
    activeHint: remainingFooter,
    remainingFooter,
    decision: { ...decision, status: approved && !trimStr(fields[FIELD_STATUS]) ? STATUS.APPROVED : status },
    canOpenAvtal: approved,
    step1Done,
    step2Done,
    reviewPending,
    catalogDirty,
    lockedAfterSend,
    byranHar: byran
  };
}

/**
 * Får användaren godkänna riskbedömning?
 * ClientFlowAdmin får aldrig godkänna kundrisk.
 */
function canApproveRisk(user = {}, byraSettings = {}, opts = {}) {
  const role = trimStr(user.role || user.Role || '');
  if (/clientflowadmin/i.test(role)) return false;
  const flag = user.canApproveRisk;
  if (flag === true || flag === 'Ja' || flag === 1 || flag === '1') return true;
  if (flag === false || flag === 'Nej' || flag === 0 || flag === '0') return false;
  // Default: Ledare på, Anställd av
  return /ledare/i.test(role);
}

/**
 * Får «Mig själv» visas för vald residualnivå?
 */
function allowSelfReview(byraSettings = {}, residualNiva = '') {
  const setting = trimStr(byraSettings.requireOtherApprover || byraSettings[FIELD_REQUIRE_OTHER] || REQUIRE_OTHER.NEVER);
  if (!setting || setting === REQUIRE_OTHER.NEVER || /^aldrig$/i.test(setting)) return true;
  if (setting === REQUIRE_OTHER.ALWAYS || /^alltid$/i.test(setting)) return false;
  const niva = trimStr(residualNiva).toLowerCase();
  if (setting === REQUIRE_OTHER.HIGH || /hög|hog|oacceptabel/i.test(setting)) {
    return !(niva === 'hög' || niva === 'hog' || niva === 'oacceptabel');
  }
  return true;
}

function defaultCanApproveForRole(role) {
  const r = trimStr(role);
  if (/clientflowadmin/i.test(r)) return false;
  if (/ledare/i.test(r)) return true;
  return false;
}

/**
 * Migrering: bygg fältpatch för kund med legacy-godkännande.
 * Idempotent — hoppar över om Riskbeslut status redan satt.
 */
function migrationPatchForCustomer(fields = {}) {
  const f = fields || {};
  if (trimStr(f[FIELD_STATUS])) {
    return { needed: false, fields: null };
  }
  if (!legacyApproved(f)) {
    return { needed: false, fields: null };
  }
  const datum = trimStr(f['Kundens riskbedömning godkänd'] || f['Riskbedömning utförd datum']).slice(0, 10)
    || new Date().toISOString().slice(0, 10);
  const log = appendLog('[]', {
    at: datum,
    event: 'Migrerad från tidigare godkännande',
    userName: 'okänd',
    comment: ''
  });
  return {
    needed: true,
    fields: {
      [FIELD_STATUS]: STATUS.APPROVED,
      [FIELD_VERSION]: 1,
      [FIELD_LOG]: log
    }
  };
}

module.exports = {
  STATUS,
  STATUS_VALUES,
  STEPS,
  FIELD_STATUS,
  FIELD_REVIEWER,
  FIELD_PREPARED_BY,
  FIELD_LOG,
  FIELD_VERSION,
  FIELD_PDF,
  FIELD_NEXT_FOLLOWUP,
  FIELD_CAN_APPROVE,
  FIELD_REQUIRE_OTHER,
  REQUIRE_OTHER,
  normalizeStatus,
  parseLog,
  serializeLog,
  appendLog,
  readDecision,
  legacyApproved,
  isApproved,
  pendingReviewCount,
  byranHarComplete,
  computeStepStatuses,
  canApproveRisk,
  allowSelfReview,
  defaultCanApproveForRole,
  migrationPatchForCustomer
};
