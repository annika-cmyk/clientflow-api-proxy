/**
 * Lager C — Kundresa: 4-stegs kunduppläggning (analyskorts-popup).
 * Steg pekar in i befintliga kundkort-ytor. VH-krav gäller AB (inte EF/fysisk person).
 */

'use strict';

const Kundformular = require('./kundformular');

const KUNDRESA_VERSION = 2;

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

/**
 * Fyra steg för Nytt lead / kunduppläggning.
 * 1 Företag & personer (BV + ledamöter/VH + PEP)
 * 2 Beskrivning & frågor
 * 3 Redovisning & tjänster
 * 4 KYC – förhandsgranska & skicka
 */
const KUNDRESA_STEPS = [
  {
    id: 1,
    key: 'foretag_personer',
    icon: 'fa-building',
    title: 'Företag & personer',
    desc: 'Uppgifter från Bolagsverket, befattningshavare (ledamöter/ombud), verklig huvudman (AB) och PEP/sanktionsscreening.',
    tab: 'foretagsinformation',
    focus: 'foretag_personer',
    /** Stabila DOM-id:n som mount reparentar in i popupen (samma noder som på kundkortet). */
    cardIds: ['bolagsverket-card', 'roller-card'],
    linkLabel: 'Öppna företag & personer',
    checklist: [
      'Kontrollera Bolagsverket-uppgifter',
      'Lägg till ledamöter/ombud (telefon & e-post)',
      'Ange verklig huvudman med kontaktuppgifter (gäller AB)',
      'Screena företag och personer (PEP & sanktioner)'
    ]
  },
  {
    id: 2,
    key: 'beskrivning_fragor',
    icon: 'fa-align-left',
    title: 'Beskrivning & frågor',
    desc: 'Beskrivning av kunden samt frågor om ägare, pengarnas ursprung, handel, kontanter och krypto.',
    tab: 'kycformular',
    focus: 'beskrivning_fragor',
    cardIds: ['beskrivning-card', 'kycformular-content'],
    linkLabel: 'Öppna beskrivning & frågor',
    checklist: [
      'Fyll i verksamhet, kostnader, intäkter och bokföring',
      'Svara på frågor om noterat bolag och utländska ägare',
      'Ange pengarnas ursprung, anställda och årsomsättning',
      'Svara om internationell handel, kontanter och krypto'
    ]
  },
  {
    id: 3,
    key: 'redovisning_tjanster',
    icon: 'fa-calculator',
    title: 'Redovisning & tjänster',
    desc: 'Redovisningsuppgifter och vilka tjänster kunden vill anlita (välj/avvälj).',
    tab: 'foretagsinformation',
    focus: 'redovisning_tjanster',
    cardIds: ['redovisning-card', 'nykund-tjanster-card'],
    linkLabel: 'Öppna redovisning & tjänster',
    checklist: [
      'Fyll i redovisningsmetod, momsperiod och räkenskapsår',
      'Ange bokföringsprogram, bank och omsättning',
      'Välj eller avvälj tjänster från byråns katalog'
    ]
  },
  {
    id: 4,
    key: 'kyc_skicka',
    icon: 'fa-paper-plane',
    title: 'KYC – skicka till kund',
    desc: 'Granska vad kunden får svara på och skicka formulärlänken.',
    tab: 'kycformular',
    focus: 'kyc_skicka',
    cardIds: ['kycformular-content'],
    linkLabel: 'Granska & skicka KYC',
    checklist: [
      'Välj mottagare med e-post',
      'Granska vad kunden får svara på',
      'Skicka formulärlänk till kund'
    ]
  }
];

/** @param {string|number} focusOrKeyOrId */
function cardIdsForKundresaStep(focusOrKeyOrId) {
  const key = String(focusOrKeyOrId || '');
  const step = KUNDRESA_STEPS.find((s) =>
    s.key === key || s.focus === key || String(s.id) === key
  ) || null;
  return Array.isArray(step?.cardIds) ? step.cardIds.slice() : [];
}

function trimStr(value) {
  return value == null ? '' : String(value).trim();
}

function parseKontaktPersoner(fields = {}) {
  const raw = fields['Kontaktpersoner'] || fields['Befattningshavare'] || '';
  if (!raw) return [];
  const s = String(raw).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }
  return s.split('\n').map((r) => r.trim()).filter(Boolean).map((r) => {
    const match = r.match(/^(.+?)\s*\((.+)\)$/);
    return match
      ? { namn: match[1].trim(), roller: [match[2].trim()] }
      : { namn: r, roller: [] };
  });
}

function personRoller(p) {
  if (!p) return [];
  if (Array.isArray(p.roller)) return p.roller.map((r) => String(r || '').trim()).filter(Boolean);
  if (p.roll) return [String(p.roll).trim()].filter(Boolean);
  return [];
}

function hasVhRole(p) {
  return personRoller(p).some((r) => /verklig\s+huvudman/i.test(r));
}

/** VH-personer från Kontaktpersoner (samma källa som personlistans «Verklig huvudman»-chip). */
function vhRegisterFromFields(fields = {}) {
  return parseKontaktPersoner(fields)
    .filter(hasVhRole)
    .map((p) => ({
      namn: trimStr(p && p.namn),
      personnr: trimStr(p && (p.personnr || p.personnummer)),
      hemvist: trimStr(p && (p.hemvist || p.hemland || p.skatterattslig_hemvist))
    }))
    .filter((p) => p.namn);
}

function hasContactDetails(p) {
  const epost = trimStr(p && p.epost);
  const telefon = trimStr(p && (p.telefon || p.telefonnr || p.phone));
  return !!(epost && telefon);
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

function hasBeskrivning(fields = {}) {
  const f = fields || {};
  const keys = ['Verksamhet', 'Kostnader', 'Intäkterna', 'Bokföring beskrivning', 'Beskrivning av kunden'];
  return keys.some((k) => trimStr(f[k]).length >= 3);
}

function hasKycFragor(kyc = {}) {
  const k = kyc || {};
  const answered = (v) => {
    const s = trimStr(v);
    return s && s !== 'Välj...' && s !== '—';
  };
  let n = 0;
  if (answered(k.kapitalUrsprung) || answered(k.kapital_ursprung)) n += 1;
  if (answered(k.anstallda)) n += 1;
  if (answered(k.omsattning)) n += 1;
  if (answered(k.internationellHandel) || answered(k.internationell)) n += 1;
  if (answered(k.kontanter)) n += 1;
  if (answered(k.kryptovaluta)) n += 1;
  if (answered(k.vh_noterat_bolag) || k.vh_noterat_bolag === true || k.vh_noterat_bolag === false) n += 1;
  if (answered(k.vh_utlandska_agare)) n += 1;
  return n >= 3;
}

function hasRedovisning(fields = {}) {
  const f = fields || {};
  const keys = ['Redovisningsmetod', 'Redovisningsperiod', 'Räkenskapsår', 'Bokforingsprogram', 'Bokföringsprogram', 'Bank', 'Omsättning'];
  return keys.filter((k) => trimStr(f[k])).length >= 2;
}

function hasValdaTjanster(fields = {}) {
  const raw = fields['Kundens utvalda tjänster'];
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'string') return trimStr(raw).length > 0;
  return false;
}

/**
 * Delstatus för steg 2 (footer «Kvar: …» för tomma beskrivningsfält).
 * @returns {{ remaining: string[], remainingLabel: string, emptyFieldCount: number }}
 */
function assessStep2Substatus(fields = {}) {
  const f = fields || {};
  const defs = [
    { keys: ['Verksamhet', 'Beskrivning av kunden'], label: 'verksamhet' },
    { keys: ['Kostnader'], label: 'kostnader' },
    { keys: ['Intäkterna'], label: 'intäkter' },
    { keys: ['Bokföring beskrivning'], label: 'bokföring' }
  ];
  const remaining = [];
  defs.forEach((d) => {
    const filled = d.keys.some((k) => trimStr(f[k]).length >= 3);
    if (!filled) remaining.push(d.label);
  });
  return {
    remaining,
    remainingLabel: remaining.length ? `Kvar: ${remaining.join(', ')}` : '',
    emptyFieldCount: remaining.length
  };
}

/**
 * Delstatus för steg 3 (footer «Kvar: …» för tomma redovisningsfält / tjänster).
 * @returns {{ remaining: string[], remainingLabel: string, emptyFieldCount: number, hasTjanster: boolean }}
 */
function assessStep3Substatus(fields = {}) {
  const f = fields || {};
  const defs = [
    { keys: ['Redovisningsmetod'], label: 'redovisningsmetod' },
    { keys: ['Redovisningsperiod'], label: 'momsperiod' },
    { keys: ['Räkenskapsår'], label: 'räkenskapsår' },
    { keys: ['Bokforingsprogram', 'Bokföringsprogram'], label: 'bokföringsprogram' },
    { keys: ['Bank'], label: 'bank' },
    { keys: ['Omsättning'], label: 'omsättning' }
  ];
  const remaining = [];
  defs.forEach((d) => {
    const filled = d.keys.some((k) => trimStr(f[k]));
    if (!filled) remaining.push(d.label);
  });
  const emptyFieldCount = remaining.length;
  const tjansterOk = hasValdaTjanster(f);
  if (!tjansterOk) remaining.push('välj minst en tjänst');
  const remainingLabel = remaining.length
    ? `Kvar: ${remaining.join(' · ')}`
    : '';
  return {
    remaining,
    remainingLabel,
    emptyFieldCount,
    hasTjanster: tjansterOk
  };
}

function kycInviteOrSigned(fields = {}, kyc = {}) {
  return assessStep4KycStatus(fields, kyc).done;
}

/** Steg 4-status: Ej påbörjat → Skickat → Besvarat (aldrig «Klart» före utskick). */
function assessStep4KycStatus(fields = {}, kyc = {}) {
  const f = fields || {};
  const k = kyc || {};
  const status = trimStr(k.status || f['KYC status'] || '');
  const sentAt = trimStr(k.inviteSentAt || k.utskickningsdatum || f['KYC skickad datum'] || f['KYC invite skickad']).slice(0, 10);
  const answeredAt = trimStr(k.customerAnsweredAt || '').slice(0, 10);
  const signedAt = trimStr(k.signeringsdatum || '').slice(0, 10);

  if (f['KYC-formulär utanför ClientFlow'] === true || f['KYC-formulär utanför ClientFlow'] === 'Ja') {
    const utenforDatum = trimStr(f['KYC UTFÖRD DATUM']).slice(0, 10);
    if (utenforDatum) {
      return { phase: 'besvarat', done: true, label: 'Besvarat', sentAt: utenforDatum, answeredAt: utenforDatum, signedAt: '' };
    }
  }
  if (/signerat/i.test(status) || signedAt) {
    return { phase: 'signerat', done: true, label: 'Signerat', sentAt, answeredAt: answeredAt || signedAt, signedAt };
  }
  if (/besvarat/i.test(status) || answeredAt || k.answeredByCustomer === true) {
    return { phase: 'besvarat', done: true, label: 'Besvarat', sentAt, answeredAt, signedAt: '' };
  }
  if (
    /skickat|invite|länk|ifyllnad/i.test(status)
    || trimStr(k.inviteToken)
    || trimStr(k.inviteUrl || k.kundInviteUrl)
    || sentAt
    || trimStr(k.inleedDokumentId)
  ) {
    return { phase: 'skickat', done: true, label: 'Skickat', sentAt, answeredAt: '', signedAt: '' };
  }
  return { phase: 'pending', done: false, label: STEP_STATUS_LABEL.pending, sentAt: '', answeredAt: '', signedAt: '' };
}

/** Blockers för skicka från steg 4 (ändrar inte VH-gaten). */
function assessStep4SendReadiness(fields = {}, opts = {}) {
  const f = fields || {};
  const bolagsform = opts.bolagsform || f.Bolagsform || '';
  const vhGate = opts.vhGate || assessVhHardGate(opts.form, { bolagsform });
  const personer = parseKontaktPersoner(f);
  const withEmail = personer.filter((p) => trimStr(p && p.epost));
  const blockers = [];
  if (!withEmail.length) blockers.push('Mottagare saknar e-post');
  if (vhGate && vhGate.relevant !== false && vhGate.value !== 'Ja' && !vhGate.complete) {
    blockers.push('VH ej bekräftad i steg 1');
  }
  const vhs = withEmail.filter(hasVhRole);
  return {
    canSend: blockers.length === 0,
    blockers,
    recipients: withEmail,
    defaultRecipient: vhs[0] || withEmail[0] || null
  };
}

/**
 * Steg 1 komplett: BV-data + screening, och för AB minst en VH med kontaktuppgifter.
 */
function step1Complete(fields = {}, { bolagsform } = {}) {
  if (!hasBolagsverketData(fields)) return false;
  if (!hasRecentEntityScreening(fields)) return false;
  const form = bolagsform || fields.Bolagsform || '';
  if (!Kundformular.vhIsRelevant(form)) return true;
  const personer = parseKontaktPersoner(fields);
  const vhs = personer.filter(hasVhRole);
  if (!vhs.length) return false;
  return vhs.every(hasContactDetails);
}

/**
 * Delstatus för steg 1 (checklist + footer «Kvar: …»).
 * @returns {{ items: Array, remaining: string[], remainingLabel: string, attentionCount: number }}
 */
function assessStep1Substatus(fields = {}, opts = {}) {
  const form = opts.bolagsform || fields.Bolagsform || '';
  const vhRelevant = Kundformular.vhIsRelevant(form);
  const personer = parseKontaktPersoner(fields);
  const vhs = personer.filter(hasVhRole);
  const vhGate = opts.vhGate || null;
  const byraVal = opts.byraVhBekraftelse
    || (vhGate && vhGate.source === 'byra' ? vhGate.value : '')
    || '';

  const bvOk = hasBolagsverketData(fields);
  const screenOk = hasRecentEntityScreening(fields, { today: opts.today });
  const screenDatum = entityScreeningDatum(fields);

  let personerStatus = 'pending';
  let personerDetail = personer.length
    ? `${personer.length} ${personer.length === 1 ? 'person' : 'personer'}`
    : 'Lägg till personer';
  const remaining = [];

  if (vhRelevant) {
    if (!vhs.length) {
      personerStatus = 'attention';
      personerDetail = 'VH saknas';
      remaining.push('lägg till verklig huvudman');
    } else {
      const missingPhone = vhs.filter((p) => !trimStr(p.telefon || p.telefonnr || p.phone));
      const missingEmail = vhs.filter((p) => !trimStr(p.epost));
      if (missingPhone.length || missingEmail.length) {
        personerStatus = 'attention';
        const parts = [];
        if (missingPhone.length) parts.push('Telefon saknas för VH');
        if (missingEmail.length) parts.push('E-post saknas för VH');
        personerDetail = parts.join(' · ');
        if (missingPhone.length) remaining.push('telefon för verklig huvudman');
        if (missingEmail.length) remaining.push('e-post för verklig huvudman');
      } else {
        personerStatus = 'done';
        personerDetail = `${personer.length} ${personer.length === 1 ? 'person' : 'personer'}`;
      }
    }
  } else if (personer.length) {
    personerStatus = 'done';
  }

  let vhStatus = 'pending';
  let vhDetail = vhRelevant ? 'Bekräfta mot registret' : 'Ej aktuell';
  if (!vhRelevant) {
    vhStatus = 'done';
    vhDetail = 'Ej aktuell för bolagsformen';
  } else if (byraVal === 'Ja' || (vhGate && vhGate.complete)) {
    vhStatus = 'done';
    vhDetail = 'Bekräftad mot registret';
  } else if (byraVal === 'Osaker' || byraVal === 'Nej' || (vhGate && vhGate.blocked)) {
    vhStatus = 'attention';
    vhDetail = byraVal === 'Nej' ? 'Markerad Nej' : 'Osäker — utred';
    remaining.push('bekräfta verklig huvudman');
  } else {
    remaining.push('bekräfta verklig huvudman');
  }

  let screenStatus = screenOk ? 'done' : 'attention';
  let screenDetail = screenOk
    ? (screenDatum ? `Ingen träff · ${screenDatum.slice(0, 10)}` : 'Screenad')
    : 'Ej screenad';
  if (!screenOk) remaining.push('screena företaget');

  const items = [
    {
      key: 'bolagsverket',
      anchor: 'bv',
      title: 'Bolagsverket',
      status: bvOk ? 'done' : 'attention',
      detail: bvOk ? 'Hämtat' : 'Hämtas / fylls i'
    },
    {
      key: 'personer',
      anchor: 'personer',
      title: 'Personer',
      status: personerStatus,
      detail: personerDetail
    },
    {
      key: 'vh',
      anchor: 'vh',
      title: 'Verklig huvudman',
      status: vhStatus,
      detail: vhDetail,
      hidden: !vhRelevant
    },
    {
      key: 'screening',
      anchor: 'screening',
      title: 'Screening',
      status: screenStatus,
      detail: screenDetail
    }
  ];

  if (!bvOk) remaining.unshift('hämta Bolagsverket-uppgifter');

  const visible = items.filter((it) => !it.hidden);
  const attentionCount = visible.filter((it) => it.status === 'attention' || it.status === 'pending').length;
  const remainingLabel = remaining.length
    ? `Kvar: ${remaining.join(' · ')}`
    : '';

  return {
    items: visible,
    remaining,
    remainingLabel,
    attentionCount
  };
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
  const formBolagsform = bolagsform || fields.Bolagsform || kyc.bolagsform || '';

  const step4 = assessStep4KycStatus(fields, kyc);
  return {
    1: step1Complete(fields, { bolagsform: formBolagsform }) && (gate.complete === true || gate.relevant === false),
    2: hasBeskrivning(fields) && hasKycFragor(kyc),
    3: hasRedovisning(fields) && hasValdaTjanster(fields),
    4: step4.done || kycSignedOrUtanfor(fields, kyc)
  };
}

/**
 * Alla fyra steg visas alltid. VH-kravet ligger i steg 1 (completion + gate), inte som eget steg.
 */
function visibleKundresaSteps() {
  return KUNDRESA_STEPS.slice();
}

/**
 * Bygg stegstatusrad. Steg efter VH-gate (id > 1) markeras gated när blocked.
 */
function resolveKundresaSteps(ctx = {}) {
  const fields = ctx.fields || {};
  const form = ctx.form;
  const kyc = ctx.kyc || {};
  const bolagsform = ctx.bolagsform || fields.Bolagsform || kyc.bolagsform || '';
  const vhGate = assessVhHardGate(form, { bolagsform });
  const doneMap = stepCompletion({ fields, form, kyc, bolagsform, vhGate });
  const template = visibleKundresaSteps(bolagsform);

  const step1Sub = assessStep1Substatus(fields, {
    bolagsform,
    vhGate,
    byraVhBekraftelse: Kundformular.parseForm(form).byraVhBekraftelse || ''
  });

  let foundNext = false;
  return template.map((step, index) => {
    const done = !!doneMap[step.id];
    const gatedByVh = vhGate.blocked && step.id > 1;
    const cardIds = Array.isArray(step.cardIds) ? step.cardIds.slice() : [];

    let status = STEP_STATUS.PENDING;
    let label = STEP_STATUS_LABEL.pending;

    if (gatedByVh) {
      status = STEP_STATUS.GATED;
      label = STEP_STATUS_LABEL.gated;
    } else if (step.id === 1 && vhGate.blocked) {
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

    // Steg 1: mer konkret status («1 sak kvar») när delchecklistan har luckor
    if (step.id === 1 && !done && step1Sub.attentionCount > 0) {
      if (status !== STEP_STATUS.GATED) {
        status = status === STEP_STATUS.NEXT ? STEP_STATUS.NEXT : STEP_STATUS.ATTENTION;
      }
      const n = step1Sub.attentionCount;
      label = n === 1 ? '1 sak kvar' : `${n} saker kvar`;
    }

    // Steg 2: «N fält kvar» när beskrivningsfält saknas
    if (step.id === 2 && !done && !gatedByVh) {
      const step2Sub = assessStep2Substatus(fields);
      const n = step2Sub.emptyFieldCount;
      if (n > 0) {
        if (status !== STEP_STATUS.GATED) {
          status = status === STEP_STATUS.NEXT ? STEP_STATUS.NEXT : STEP_STATUS.ATTENTION;
        }
        label = n === 1 ? '1 fält kvar' : `${n} fält kvar`;
      }
    }

    // Steg 3: «N saker kvar» när redovisningsfält eller tjänster saknas
    if (step.id === 3 && !done && !gatedByVh) {
      const step3Sub = assessStep3Substatus(fields);
      const n = step3Sub.remaining.length;
      if (n > 0) {
        if (status !== STEP_STATUS.GATED) {
          status = status === STEP_STATUS.NEXT ? STEP_STATUS.NEXT : STEP_STATUS.ATTENTION;
        }
        label = n === 1 ? '1 sak kvar' : `${n} saker kvar`;
      }
    }

    let step4Meta = null;
    if (step.id === 4 && !gatedByVh) {
      step4Meta = assessStep4KycStatus(fields, kyc);
      if (step4Meta.done) {
        status = STEP_STATUS.DONE;
        label = step4Meta.label;
      } else if (status === STEP_STATUS.DONE) {
        status = foundNext ? STEP_STATUS.PENDING : STEP_STATUS.NEXT;
        if (!foundNext) foundNext = true;
        label = status === STEP_STATUS.NEXT ? STEP_STATUS_LABEL.next : STEP_STATUS_LABEL.pending;
      }
    }

    return {
      id: step.id,
      number: index + 1,
      key: step.key,
      icon: step.icon,
      title: step.title,
      desc: step.desc,
      tab: step.tab || '',
      focus: step.focus || '',
      cardIds,
      linkLabel: step.linkLabel,
      checklist: Array.isArray(step.checklist) ? step.checklist.slice() : [],
      status,
      label,
      done,
      gated: gatedByVh,
      comingSoonBankId: !!step.comingSoonBankId,
      attention: status === STEP_STATUS.ATTENTION || (step.id === 1 && step1Sub.attentionCount > 0 && !done),
      step4: step4Meta || undefined
    };
  });
}

/**
 * Jämför byråns VH-bekräftelse med kundens intygande i formuläret.
 * Register = kontaktpersoner med roll Verklig huvudman (samma som personlistan);
 * fallback till kundens formulärsvar om kontaktlistan saknar VH.
 */
function assessVhAlignment(form, opts = {}) {
  const parsed = Kundformular.parseForm(form);
  const bolagsform = opts.bolagsform || '';
  const relevant = Kundformular.vhIsRelevant
    ? Kundformular.vhIsRelevant(bolagsform)
    : true;
  if (!relevant) {
    return {
      relevant: false,
      status: 'n/a',
      message: 'VH är inte aktuell för denna bolagsform.',
      byra: '',
      kund: '',
      register: []
    };
  }
  const byra = Kundformular.normalizeVhBekraftelse(parsed.byraVhBekraftelse);
  const kund = Kundformular.normalizeVhBekraftelse(parsed.answers?.vh_bekraftelse);
  const fromKontakt = vhRegisterFromFields(opts.fields || {});
  const fromForm = (Array.isArray(parsed.answers?.huvudman) ? parsed.answers.huvudman : [])
    .map((p) => ({
      namn: trimStr(p && p.namn),
      personnr: trimStr(p && (p.personnr || p.personnummer)),
      hemvist: trimStr(p && (p.hemvist || p.hemland))
    }))
    .filter((p) => p.namn);
  const register = fromKontakt.length ? fromKontakt : fromForm;

  if (!byra && !kund) {
    return {
      relevant: true,
      status: 'pending',
      message: 'Väntar på byråns bekräftelse mot registret.',
      byra,
      kund,
      register
    };
  }
  if (byra && kund && byra === kund) {
    return {
      relevant: true,
      status: 'match',
      message: byra === 'Ja'
        ? 'Byrå och kund intygar samma bild som registret (Ja).'
        : `Byrå och kund är överens (${byra === 'Osaker' ? 'Osäker' : byra}) — utred innan ni går vidare.`,
      byra,
      kund,
      register
    };
  }
  if (byra && kund && byra !== kund) {
    return {
      relevant: true,
      status: 'mismatch',
      message: `Avvikelse: byrån svarade ${byra === 'Osaker' ? 'Osäker' : byra}, kunden ${kund === 'Osaker' ? 'Osäker' : kund}.`,
      byra,
      kund,
      register
    };
  }
  if (byra && !kund) {
    return {
      relevant: true,
      status: 'byra_only',
      message: byra === 'Ja'
        ? 'Byrån har bekräftat registret. Kundens intygande kommer i KYC-formuläret.'
        : `Byrån markerade ${byra === 'Osaker' ? 'Osäker' : byra}. Kundens svar saknas ännu.`,
      byra,
      kund,
      register
    };
  }
  return {
    relevant: true,
    status: 'kund_only',
    message: `Kunden svarade ${kund === 'Osaker' ? 'Osäker' : kund} — byrån behöver bekräfta mot registret i steg 1.`,
    byra,
    kund,
    register
  };
}

function buildKundresaSummary(ctx = {}) {
  const steps = resolveKundresaSteps(ctx);
  const bolagsform = ctx.bolagsform || ctx.fields?.Bolagsform || ctx.kyc?.bolagsform || '';
  const vhGate = assessVhHardGate(ctx.form, { bolagsform });
  const vhAlignment = assessVhAlignment(ctx.form, { bolagsform, fields: ctx.fields || {} });
  const parsed = Kundformular.parseForm(ctx.form);
  const completed = steps.filter((s) => s.done).length;
  const next = steps.find((s) => s.status === STEP_STATUS.NEXT || s.status === STEP_STATUS.ATTENTION) || null;
  const step1Substatus = assessStep1Substatus(ctx.fields || {}, {
    bolagsform,
    vhGate,
    byraVhBekraftelse: parsed.byraVhBekraftelse || '',
    today: ctx.today
  });
  const step2Substatus = assessStep2Substatus(ctx.fields || {});
  const step3Substatus = assessStep3Substatus(ctx.fields || {});
  return {
    version: KUNDRESA_VERSION,
    steps,
    completed,
    total: steps.length,
    progressLabel: `${completed} av ${steps.length} steg`,
    nextStepId: next ? next.id : null,
    vhGate,
    vhAlignment,
    blocked: !!vhGate.blocked,
    byraVhBekraftelse: parsed.byraVhBekraftelse || '',
    byraVhNote: parsed.byraVhNote || '',
    vhRegister: vhAlignment.register || [],
    vhRelevant: Kundformular.vhIsRelevant(bolagsform),
    step1Substatus,
    step2Substatus,
    step3Substatus,
    step4Status: assessStep4KycStatus(ctx.fields || {}, ctx.kyc || {}),
    step4Send: assessStep4SendReadiness(ctx.fields || {}, {
      bolagsform,
      vhGate,
      form: ctx.form
    })
  };
}

/** Server-gate: actions som inte får köras medan VH-gate är aktiv. */
const VH_BLOCKED_ACTIONS = new Set([
  'mark_sent',
  'sync_to_kyc',
  'mark_signed',
  'kyc_skicka_for_signering',
  'kyc_skicka_till_kund',
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
  cardIdsForKundresaStep,
  VH_BLOCKED_ACTIONS,
  hasBolagsverketData,
  hasRecentEntityScreening,
  hasBeskrivning,
  hasKycFragor,
  hasRedovisning,
  hasValdaTjanster,
  step1Complete,
  assessStep1Substatus,
  assessStep2Substatus,
  assessStep3Substatus,
  residualComplete,
  kycSignedOrUtanfor,
  kycInviteOrSigned,
  assessStep4KycStatus,
  assessStep4SendReadiness,
  effectiveVhBekraftelse,
  assessVhHardGate,
  assessVhAlignment,
  stepCompletion,
  visibleKundresaSteps,
  resolveKundresaSteps,
  buildKundresaSummary,
  assertVhAllowsAction,
  parseKontaktPersoner,
  vhRegisterFromFields,
  hasVhRole
};
