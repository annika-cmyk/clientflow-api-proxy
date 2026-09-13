/**
 * Lager C — Kundresa (fas 2 embryo): sex steg som pekar in i befintliga kundkort-ytor.
 * Statusmotor / koordinator — inte en låst wizard. BankID-signering är comingSoon.
 */

'use strict';

const Kundformular = require('./kundformular');

const KUNDRESA_VERSION = 1;

const STEP_STATUS = {
  DONE: 'done',
  NEXT: 'next',
  ATTENTION: 'attention',
  PENDING: 'pending',
  GATED: 'gated',
  SOON: 'soon'
};

const STEP_STATUS_LABEL = {
  done: 'Klart',
  next: 'Nästa steg',
  attention: 'Kräver uppmärksamhet',
  pending: 'Ej påbörjat',
  gated: 'Blockerad',
  soon: 'Kommer snart'
};

/** Sex steg enligt arkitektur fas 2 (3 kap PTL). */
const KUNDRESA_STEPS = [
  {
    id: 1,
    key: 'sok_hamta',
    icon: 'fa-building',
    title: 'Sök och hämta',
    desc: 'Org.nr → Bolagsverket: företagsuppgifter, styrelse och registrerad VH-lista.',
    tab: 'foretagsinformation',
    linkLabel: 'Öppna företagsinformation'
  },
  {
    id: 2,
    key: 'vh_ombud',
    icon: 'fa-user-check',
    title: 'Verifiera VH och ombud',
    desc: 'Aktiv bekräftelse Ja/Osäker/Nej. Osäker/Nej blockerar resan tills utredning är klar.',
    tab: 'kundformular',
    linkLabel: 'Öppna VH-bekräftelse'
  },
  {
    id: 3,
    key: 'screening',
    icon: 'fa-shield-halved',
    title: 'Screening',
    desc: 'PEP- och sanktionsscreening (Dilisense) av företag, VH och ombud.',
    tab: 'foretagsinformation',
    linkLabel: 'Öppna screening'
  },
  {
    id: 4,
    key: 'kundformular',
    icon: 'fa-file-lines',
    title: 'Kundformulär',
    desc: 'Skicka neutralt kundformulär med villkorade frågor. BankID-signering kommer senare.',
    tab: 'kundformular',
    linkLabel: 'Öppna kundformulär'
  },
  {
    id: 5,
    key: 'riskprofil',
    icon: 'fa-chart-line',
    title: 'Riskprofil',
    desc: 'Bedöm residual riskprofil utifrån katalog och insamlade uppgifter.',
    tab: 'ovrigkyc',
    linkLabel: 'Öppna riskbedömning'
  },
  {
    id: 6,
    key: 'godkannande',
    icon: 'fa-stamp',
    title: 'Godkännande',
    desc: 'DD-beslut och KYC. BankID-signering av kundhandlingar är inte live ännu.',
    tab: 'kycformular',
    linkLabel: 'Öppna KYC-formulär',
    comingSoonBankId: true
  }
];

function trimStr(value) {
  return value == null ? '' : String(value).trim();
}

function hasBolagsverketData(fields = {}) {
  const f = fields || {};
  if (trimStr(f['Bolagsverket uppdaterad'])) return true;
  if (trimStr(f.Orgnr || f.orgnr) && (trimStr(f.Namn) || trimStr(f.Verksamhet) || trimStr(f['Verksamhetsbeskrivning']))) {
    return true;
  }
  return false;
}

function entityScreeningDatum(fields = {}) {
  const f = fields || {};
  return trimStr(f['Entity screening datum'] || f['PEP entity screening datum'] || '');
}

function hasRecentEntityScreening(fields = {}, { today } = {}) {
  const datum = entityScreeningDatum(fields);
  if (!datum) return false;
  const start = Date.parse(`${datum.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start)) return false;
  const end = Date.parse(`${(today || new Date().toISOString().slice(0, 10))}T00:00:00Z`);
  if (!Number.isFinite(end) || end < start) return false;
  const years = (end - start) / (365.25 * 24 * 60 * 60 * 1000);
  return years <= 1;
}

function residualComplete(fields = {}) {
  const f = fields || {};
  const residual = trimStr(
    f.Riskniva
    || f['Riskniva']
    || f['Kund residual riskprofil']
    || f['Kund residualnivå']
    || f['sammanlagd risk']
    || ''
  );
  if (!residual) return false;
  const foreslagen = trimStr(f['Kund föreslagen nivå'] || '');
  const motivering = trimStr(f['Kund avvikelse motivering'] || '');
  if (foreslagen && residual && foreslagen !== residual && !motivering) return false;
  return true;
}

function kycSignedOrUtanfor(fields = {}, kyc = {}) {
  const f = fields || {};
  if (f['KYC-formulär utanför ClientFlow'] === true || f['KYC-formulär utanför ClientFlow'] === 'Ja') {
    return !!trimStr(f['KYC UTFÖRD DATUM']);
  }
  const status = trimStr(kyc.status || f['KYC status'] || '');
  if (/signerat/i.test(status)) return true;
  if (trimStr(kyc.signeringsdatum)) return true;
  return false;
}

/**
 * Effektiv VH-bekräftelse för hard gate.
 * Byråns explicita värde vinner; annars kundens svar när formuläret är besvarat.
 */
function effectiveVhBekraftelse(form, { bolagsform } = {}) {
  const parsed = Kundformular.parseForm(form);
  const resolvedBolagsform = Kundformular.resolveBolagsform({
    bolagsform,
    fields: {},
    kyc: {}
  }) || bolagsform;
  if (!Kundformular.vhIsRelevant(resolvedBolagsform)) {
    return { relevant: false, value: '', source: 'ej_aktuell' };
  }
  const byra = Kundformular.normalizeVhBekraftelse(parsed.byraVhBekraftelse);
  if (byra) return { relevant: true, value: byra, source: 'byra' };
  const kund = parsed.answers?.vh_bekraftelse || '';
  if (Kundformular.isAnswered(parsed) && kund) {
    return { relevant: true, value: kund, source: 'kund' };
  }
  // Byrå har sparat vh i answers före utskick
  if (kund) return { relevant: true, value: kund, source: 'formular' };
  return { relevant: true, value: '', source: '' };
}

/**
 * Hård gate: Osäker/Nej stoppar fortsatta steg tills VH är Ja (eller ej aktuell).
 */
function assessVhHardGate(form, opts = {}) {
  const eff = effectiveVhBekraftelse(form, opts);
  if (!eff.relevant) {
    return {
      blocked: false,
      relevant: false,
      value: '',
      source: eff.source,
      complete: true,
      message: 'Verklig huvudman är inte aktuell för enskild firma / fysisk person.'
    };
  }
  if (eff.value === 'Osaker' || eff.value === 'Nej') {
    return {
      blocked: true,
      relevant: true,
      value: eff.value,
      source: eff.source,
      complete: false,
      message: eff.value === 'Osaker'
        ? 'VH-bekräftelse är Osäker — utred och bekräfta innan onboarding fortsätter.'
        : 'VH-bekräftelse är Nej — utred och bekräfta innan onboarding fortsätter.',
      code: 'VH_HARD_GATE'
    };
  }
  return {
    blocked: false,
    relevant: true,
    value: eff.value,
    source: eff.source,
    complete: eff.value === 'Ja',
    message: eff.value === 'Ja' ? '' : 'Bekräfta verklig huvudman (Ja) innan ni går vidare.'
  };
}

function stepCompletion(ctx) {
  const {
    fields = {},
    form = null,
    kyc = {},
    bolagsform = '',
    vhGate = null
  } = ctx;
  const gate = vhGate || assessVhHardGate(form, { bolagsform: bolagsform || fields.Bolagsform || kyc.bolagsform });
  const parsed = Kundformular.parseForm(form);
  const summary = Kundformular.summaryForUi(parsed);

  return {
    1: hasBolagsverketData(fields),
    2: gate.complete === true,
    3: hasRecentEntityScreening(fields),
    4: !!(summary.isAnswered || summary.status === 'besvarat' || summary.status === 'signerat'),
    5: residualComplete(fields),
    6: kycSignedOrUtanfor(fields, kyc)
  };
}

/**
 * Bygg stegstatusrad. Steg efter VH-gate markeras gated när blocked.
 */
function resolveKundresaSteps(ctx = {}) {
  const fields = ctx.fields || {};
  const form = ctx.form;
  const kyc = ctx.kyc || {};
  const bolagsform = ctx.bolagsform || fields.Bolagsform || kyc.bolagsform || '';
  const vhGate = assessVhHardGate(form, { bolagsform });
  const doneMap = stepCompletion({ fields, form, kyc, bolagsform, vhGate });

  let foundNext = false;
  return KUNDRESA_STEPS.map((step) => {
    const done = !!doneMap[step.id];
    const gatedByVh = vhGate.blocked && step.id > 2;

    let status = STEP_STATUS.PENDING;
    let label = STEP_STATUS_LABEL.pending;

    if (gatedByVh) {
      status = STEP_STATUS.GATED;
      label = STEP_STATUS_LABEL.gated;
    } else if (step.id === 2 && vhGate.blocked) {
      status = STEP_STATUS.ATTENTION;
      label = STEP_STATUS_LABEL.attention;
    } else if (done) {
      status = STEP_STATUS.DONE;
      label = STEP_STATUS_LABEL.done;
    } else if (!foundNext) {
      foundNext = true;
      status = STEP_STATUS.NEXT;
      label = STEP_STATUS_LABEL.next;
    }

    return {
      id: step.id,
      key: step.key,
      icon: step.icon,
      title: step.title,
      desc: step.desc,
      tab: step.tab,
      linkLabel: step.linkLabel,
      status,
      label,
      done,
      gated: gatedByVh,
      comingSoonBankId: !!step.comingSoonBankId,
      attention: status === STEP_STATUS.ATTENTION
    };
  });
}

function buildKundresaSummary(ctx = {}) {
  const steps = resolveKundresaSteps(ctx);
  const vhGate = assessVhHardGate(ctx.form, {
    bolagsform: ctx.bolagsform || ctx.fields?.Bolagsform || ctx.kyc?.bolagsform
  });
  const completed = steps.filter((s) => s.done).length;
  const next = steps.find((s) => s.status === STEP_STATUS.NEXT || s.status === STEP_STATUS.ATTENTION) || null;
  return {
    version: KUNDRESA_VERSION,
    steps,
    completed,
    total: steps.length,
    progressLabel: `${completed} av ${steps.length} steg`,
    nextStepId: next ? next.id : null,
    vhGate,
    blocked: !!vhGate.blocked,
    byraVhBekraftelse: Kundformular.parseForm(ctx.form).byraVhBekraftelse || '',
    byraVhNote: Kundformular.parseForm(ctx.form).byraVhNote || ''
  };
}

/** Server-gate: actions som inte får köras medan VH-gate är aktiv. */
const VH_BLOCKED_ACTIONS = new Set([
  'mark_sent',
  'sync_to_kyc',
  'mark_signed',
  /** KYC skickas för BankID-signering */
  'kyc_skicka_for_signering',
  /** Residual/riskprofil sparas på kundkortet */
  'save_residual'
]);

function assertVhAllowsAction(form, action, opts = {}) {
  const gate = assessVhHardGate(form, opts);
  if (!gate.blocked) return gate;
  if (!VH_BLOCKED_ACTIONS.has(String(action || ''))) return gate;
  const err = new Error(gate.message || 'VH-bekräftelse blockerar detta steg.');
  err.status = 409;
  err.code = 'VH_HARD_GATE';
  err.vhGate = gate;
  throw err;
}

module.exports = {
  KUNDRESA_VERSION,
  KUNDRESA_STEPS,
  STEP_STATUS,
  STEP_STATUS_LABEL,
  VH_BLOCKED_ACTIONS,
  hasBolagsverketData,
  hasRecentEntityScreening,
  residualComplete,
  kycSignedOrUtanfor,
  effectiveVhBekraftelse,
  assessVhHardGate,
  stepCompletion,
  resolveKundresaSteps,
  buildKundresaSummary,
  assertVhAllowsAction
};
