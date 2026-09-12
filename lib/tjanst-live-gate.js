/**
 * Gate för egna tjänster: får inte bli live (aktiv i katalogen / Aktuell)
 * förrän mini-analysen är klar — utförande, inneboende S×K, ≥1 åtgärd, residual.
 */
'use strict';

const RiskSkala = require('../public/js/risk-skala');
const RiskMotivering = require('../public/js/risk-motivering');
const TjanstUtforandeMallar = require('../public/js/tjanst-utforande-mallar');
const TjanstAktivKundkoppling = require('./tjanst-aktiv-kundkoppling');

function isCustomMallId(mallId) {
  return String(mallId || '').indexOf('custom:') === 0;
}

function parseJsonList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null || raw === '') return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function atgardCount(fields) {
  const f = fields || {};
  const list = parseJsonList(f['Tjänstespecifika åtgärder'] || f.atgarder);
  return list.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    return String(row.titel || row.title || row.namn || row.beskrivning || row.description || '').trim() !== '';
  }).length;
}

function readPoang(fields) {
  const f = fields || {};
  if (RiskSkala.readTjanstRisk) {
    return RiskSkala.readTjanstRisk(f) || {};
  }
  return RiskSkala.parseRiskPoang(f['Riskpoäng'] || f.Riskpoang || f.Samspelsexempel) || {};
}

/**
 * Är mini-analysen tillräcklig för live?
 * @returns {{ ok: boolean, missing: string[], message: string, poang: object }}
 */
function assessLiveReady(fields) {
  const f = fields || {};
  const poang = readPoang(f);
  const missing = [];

  const s = Number(poang.sannolikhet);
  const k = Number(poang.konsekvens);
  const s2 = Number(poang.sannolikhetEfter);
  const k2 = Number(poang.konsekvensEfter);
  if (!Number.isFinite(s) || s < 1) missing.push('inneboende sannolikhet');
  if (!Number.isFinite(k) || k < 1) missing.push('inneboende konsekvens');
  if (!Number.isFinite(s2) || s2 < 1) missing.push('residual sannolikhet');
  if (!Number.isFinite(k2) || k2 < 1) missing.push('residual konsekvens');

  if (atgardCount(f) < 1) missing.push('minst en åtgärd');

  const mot = RiskMotivering.validatePoangMotivering(poang, { asDraft: false });
  if (!mot.ok) {
    (mot.errors || []).forEach((err) => {
      if (err && err.error) missing.push(err.error);
      else missing.push('motivering');
    });
  }

  const ok = missing.length === 0;
  return {
    ok,
    missing,
    poang,
    message: ok
      ? ''
      : ('Egna tjänster kan aktiveras först när mini-analysen är klar. Saknas: ' + missing.slice(0, 4).join(', ')
        + (missing.length > 4 ? '…' : '') + '.')
  };
}

function findRiskForNamn(namn, riskRecords) {
  const matches = TjanstAktivKundkoppling.matchingRiskRecords(namn, riskRecords);
  if (!matches.length) return null;
  const live = matches.find((r) => r && r.fields && r.fields.Aktuell === true);
  return live || matches[0] || null;
}

function entryDisplayNamn(mallId, entry) {
  return TjanstAktivKundkoppling.entryNamn(mallId, entry);
}

/**
 * Hitta egna tjänster som går från inaktiv → aktiv.
 */
function findCustomActivations(prevState, nextState) {
  const prev = TjanstAktivKundkoppling.cloneState(prevState);
  const next = TjanstAktivKundkoppling.cloneState(nextState);
  const out = [];
  for (const mallId of Object.keys(next.tjanster || {})) {
    if (!isCustomMallId(mallId)) continue;
    const before = prev.tjanster[mallId] || TjanstUtforandeMallar.emptyEntry(mallId);
    const after = next.tjanster[mallId] || TjanstUtforandeMallar.emptyEntry(mallId);
    if (!before.aktiv && after.aktiv) {
      out.push({
        mallId,
        namn: entryDisplayNamn(mallId, after.namn ? after : before)
      });
    }
  }
  return out;
}

/**
 * Blockera aktivering av egen tjänst utan klar mini-analys.
 */
function findBlockedCustomActivation(prevState, nextState, riskRecords) {
  for (const item of findCustomActivations(prevState, nextState)) {
    const risk = findRiskForNamn(item.namn, riskRecords);
    if (!risk || !risk.fields) {
      return {
        ...item,
        code: 'tjanst_mini_analys_saknas',
        message: `Kan inte aktivera «${item.namn}»: slutför mini-analysen (inneboende risk, minst en åtgärd och residualrisk) innan tjänsten går live.`
      };
    }
    const ready = assessLiveReady(risk.fields);
    if (!ready.ok) {
      return {
        ...item,
        code: 'tjanst_mini_analys_ofullstandig',
        message: ready.message || `Kan inte aktivera «${item.namn}»: mini-analysen är ofullständig.`,
        missing: ready.missing
      };
    }
    if (risk.fields.Aktuell !== true) {
      return {
        ...item,
        code: 'tjanst_analys_ej_aktuell',
        message: `Kan inte aktivera «${item.namn}»: spara analysen som aktuell (inte bara utkast) innan tjänsten går live.`
      };
    }
  }
  return null;
}

function buildRiskEvent({ type, refId, namn, at, by, arInvalidated }) {
  return {
    type: String(type || 'tjanst_andrad'),
    refId: refId ? String(refId) : '',
    namn: namn ? String(namn) : '',
    at: at || new Date().toISOString(),
    by: by ? String(by) : '',
    arInvalidated: arInvalidated === true
  };
}

module.exports = {
  isCustomMallId,
  parseJsonList,
  atgardCount,
  assessLiveReady,
  findRiskForNamn,
  findCustomActivations,
  findBlockedCustomActivation,
  buildRiskEvent
};
