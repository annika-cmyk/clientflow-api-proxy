/**
 * Meny-/sidostatus för byråns riskbedömningsresa.
 * - complete: steg i byrå-resa markerat klart
 * - attention: mismatch-regler (t.ex. kunddata vs deklarerad risk)
 * - neutral: ingen signal
 *
 * Attention override:ar alltid complete.
 */

const ByraResa = require('./byra-resa');
const KycHuvudman = require('../public/js/kyc-huvudman');
const ByraProfilFields = require('./byra-profil-fields');

const STATUS = {
  COMPLETE: 'complete',
  ATTENTION: 'attention',
  NEUTRAL: 'neutral'
};

function pageIdFromHref(href) {
  return String(href || '')
    .trim()
    .replace(/\.html$/i, '')
    .replace(/^\//, '');
}

function stepPageMap(steps = ByraResa.RESA_STEPS) {
  const map = {};
  (steps || []).forEach((s) => {
    const pageId = pageIdFromHref(s && s.href);
    if (pageId) map[pageId] = s.id;
  });
  return map;
}

function parseKyc(fields) {
  const raw = fields && fields['KYC-formular (JSON)'];
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(String(raw)) || {};
  } catch (_) {
    return {};
  }
}

function asHemvistLabels(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  return String(value)
    .split(/[,;|]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function looksLikeKycObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return !!(
    obj.huvudman
    || obj.foretradare
    || obj.skatterattslig_hemvist_foretag
    || obj.skatterattslig_hemvist_foretradare
    || obj.verkligaHuvudman
  );
}

/** Företag, huvudmän, företrädare eller kundkort-fält. */
function hasForeignTaxResidence(fieldsOrKyc) {
  const src = fieldsOrKyc && typeof fieldsOrKyc === 'object' ? fieldsOrKyc : {};
  const fromJson = parseKyc(src);
  const kyc = Object.keys(fromJson).length ? fromJson : (looksLikeKycObject(src) ? src : {});

  if (KycHuvudman.isForeignHemvist(kyc.skatterattslig_hemvist_foretag)) return true;
  if (KycHuvudman.hasForeignFromKyc(kyc)) return true;

  return asHemvistLabels(src['Skatterättslig hemvist']).some((label) => KycHuvudman.isForeignHemvist(label));
}

function riskfaktorNamn(rec) {
  const f = (rec && rec.fields) || rec || {};
  return String(f.Riskfaktor || f.namn || f.name || '').trim();
}

function isAktuellRisk(rec) {
  const f = (rec && rec.fields) || rec || {};
  return f.Aktuell === true || f.aktuell === true;
}

/** Aktiv byrå-riskfaktor för utländsk skatterättslig hemvist / UBO. */
function hasActiveForeignHemvistRiskFactor(riskRecords) {
  return (riskRecords || []).some((rec) => {
    if (!isAktuellRisk(rec)) return false;
    return KycHuvudman.isUboFlagLabel(riskfaktorNamn(rec));
  });
}

function profilAcknowledgesForeignOwners(profil) {
  return ByraProfilFields.valueIncludesChoice((profil || {}).utlandskaAgare, 'Ja');
}

/**
 * Regel: kunder med utländsk skatterättslig hemvist finns,
 * men byrån har inte markerat riskfaktorn och inte sagt Ja i enkäten.
 */
function ruleForeignTaxResidenceMismatch({ kundRecords, riskRecords, profil } = {}) {
  const withForeign = (kundRecords || []).filter((rec) => hasForeignTaxResidence(rec.fields || rec));
  if (!withForeign.length) return null;

  const hasRisk = hasActiveForeignHemvistRiskFactor(riskRecords);
  const enkätJa = profilAcknowledgesForeignOwners(profil);
  if (hasRisk || enkätJa) return null;

  const examples = withForeign.slice(0, 3).map((rec) => {
    const f = rec.fields || rec;
    return String(f.Namn || f.name || rec.id || 'Kund').trim();
  }).filter(Boolean);

  const count = withForeign.length;
  const exampleText = examples.length
    ? ` Exempel: ${examples.join(', ')}${count > examples.length ? '…' : ''}.`
    : '';

  return {
    id: 'foreign-tax-residence',
    pageId: 'kundrisker-mm',
    title: 'Utländsk skatterättslig hemvist behöver hanteras',
    message:
      `${count === 1 ? 'En kund har' : `${count} kunder har`} skatterättslig hemvist i annat land, ` +
      `men byrån har inte angett riskfaktorn «Kunder med utländska huvudmän» (och inte heller svarat Ja om utländska ägare i byråprofilen).` +
      exampleText +
      ` Uppdatera riskbilden under Vilka är våra kunder, och stäm av enkätsvaret vid behov.`,
    href: 'kundrisker-mm.html',
    count,
    examples
  };
}

/** Utbyggbar lista – lägg till fler mismatch-regler här. */
const ATTENTION_RULES = [
  ruleForeignTaxResidenceMismatch
];

function evaluateAttentionRules(ctx) {
  const alerts = [];
  ATTENTION_RULES.forEach((rule) => {
    try {
      const hit = rule(ctx);
      if (hit) alerts.push(hit);
    } catch (_) {
      /* ignore broken rule */
    }
  });
  return alerts;
}

/**
 * Bygg status per meny-sida.
 * @param {{ steps?: object, kundRecords?: array, riskRecords?: array, profil?: object }} input
 */
function buildNavStatus(input = {}) {
  const steps = (input.steps && typeof input.steps === 'object') ? input.steps : {};
  const pageSteps = stepPageMap();
  const alerts = evaluateAttentionRules(input);
  const alertsByPage = {};
  alerts.forEach((a) => {
    if (!a || !a.pageId) return;
    if (!alertsByPage[a.pageId]) alertsByPage[a.pageId] = [];
    alertsByPage[a.pageId].push(a);
  });

  const pages = {};
  Object.keys(pageSteps).forEach((pageId) => {
    const stepId = pageSteps[pageId];
    const complete = !!(steps[stepId] || steps[String(stepId)]);
    const pageAlerts = alertsByPage[pageId] || [];
    let status = STATUS.NEUTRAL;
    if (pageAlerts.length) status = STATUS.ATTENTION;
    else if (complete) status = STATUS.COMPLETE;
    pages[pageId] = {
      pageId,
      status,
      complete,
      stepId,
      alerts: pageAlerts
    };
  });

  Object.keys(alertsByPage).forEach((pageId) => {
    if (pages[pageId]) return;
    pages[pageId] = {
      pageId,
      status: STATUS.ATTENTION,
      complete: false,
      stepId: null,
      alerts: alertsByPage[pageId]
    };
  });

  return {
    pages,
    alerts,
    progress: typeof ByraResa.countCompletedSteps === 'function'
      ? ByraResa.countCompletedSteps(steps)
      : { done: 0, total: ByraResa.RESA_STEPS.length }
  };
}

module.exports = {
  STATUS,
  pageIdFromHref,
  stepPageMap,
  parseKyc,
  hasForeignTaxResidence,
  hasActiveForeignHemvistRiskFactor,
  profilAcknowledgesForeignOwners,
  ruleForeignTaxResidenceMismatch,
  evaluateAttentionRules,
  ATTENTION_RULES,
  buildNavStatus
};
