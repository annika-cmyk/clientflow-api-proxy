/**
 * Regler för byråns tjänstekatalog (utförande aktiv/inaktiv) kopplat till kunder.
 * - En tjänst med kunder får inte inaktiveras.
 * - På kundens riskbedömning visas bara aktiva katalogtjänster.
 */
const TjanstUtforandeMallar = require('../public/js/tjanst-utforande-mallar');

function entryNamn(mallId, entry) {
  const e = entry || {};
  if (e.namn) return String(e.namn).trim();
  const template = TjanstUtforandeMallar.templateById(mallId);
  if (template && template.name) return String(template.name).trim();
  return '';
}

function namesMatch(a, b) {
  if (TjanstUtforandeMallar.tjanstNamesMatch) {
    return TjanstUtforandeMallar.tjanstNamesMatch(a, b);
  }
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/**
 * Djupkopia så jämförelser inte påverkas av delade tjanster-objekt från parseState.
 */
function cloneState(state) {
  return TjanstUtforandeMallar.parseState(JSON.stringify(
    TjanstUtforandeMallar.parseState(state)
  ));
}

/**
 * Hitta utförande-poster som går från aktiv → inaktiv.
 */
function findDeactivations(prevState, nextState) {
  const prev = cloneState(prevState);
  const next = cloneState(nextState);
  const mallIds = new Set([
    ...Object.keys(prev.tjanster || {}),
    ...Object.keys(next.tjanster || {})
  ]);
  const out = [];
  for (const mallId of mallIds) {
    const before = prev.tjanster[mallId] || TjanstUtforandeMallar.emptyEntry(mallId);
    const after = next.tjanster[mallId] || TjanstUtforandeMallar.emptyEntry(mallId);
    if (before.aktiv && !after.aktiv) {
      out.push({
        mallId,
        namn: entryNamn(mallId, after.namn ? after : before)
      });
    }
  }
  return out;
}

/**
 * Riskassessment-poster vars Task Name matchar tjänstnamnet.
 */
function matchingRiskRecords(namn, riskRecords) {
  const wanted = String(namn || '').trim();
  if (!wanted) return [];
  return (Array.isArray(riskRecords) ? riskRecords : []).filter((rec) => {
    const task = (rec && rec.fields && rec.fields['Task Name'])
      || (rec && rec.namn)
      || '';
    return namesMatch(task, wanted);
  });
}

/**
 * Antal kunder kopplade till tjänsten via Kundens utvalda tjänster (record-id).
 * kundAntalMaps.tjanster är id → antal.
 */
function kundCountForNamn(namn, riskRecords, kundAntalTjanster) {
  const map = kundAntalTjanster || {};
  let total = 0;
  const seen = new Set();
  for (const rec of matchingRiskRecords(namn, riskRecords)) {
    const id = rec && rec.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    total += Number(map[id]) || 0;
  }
  return total;
}

/**
 * Första inaktivering som blockeras av kundkoppling, eller null.
 */
function findBlockedDeactivation(prevState, nextState, riskRecords, kundAntalTjanster) {
  for (const item of findDeactivations(prevState, nextState)) {
    const count = kundCountForNamn(item.namn, riskRecords, kundAntalTjanster);
    if (count > 0) {
      return {
        ...item,
        kundCount: count,
        message: count === 1
          ? `Kan inte inaktivera «${item.namn}»: 1 kund har tjänsten. Ta bort den från kunden först.`
          : `Kan inte inaktivera «${item.namn}»: ${count} kunder har tjänsten. Ta bort den från kunderna först.`
      };
    }
  }
  return null;
}

/**
 * Är tjänstnamnet aktivt i byråns utförandekatalog?
 * Saknas utförandepost → false (ej bekräftad i katalogen).
 */
function isUtforandeAktiv(namn, utforandeState) {
  const hit = TjanstUtforandeMallar.findEntryForNamn(utforandeState, namn);
  return !!(hit && hit.entry && hit.entry.aktiv);
}

/**
 * Har byrån minst en aktiv tjänst i utförandekatalogen?
 */
function hasAnyAktivUtforande(utforandeState) {
  const state = TjanstUtforandeMallar.parseState(utforandeState);
  return Object.values(state.tjanster || {}).some((e) => e && e.aktiv);
}

/**
 * Har byrån sparat något i utförandekatalogen (aktiva eller inaktiva)?
 */
function hasUtforandeCatalog(utforandeState) {
  const state = TjanstUtforandeMallar.parseState(utforandeState);
  return Object.keys(state.tjanster || {}).length > 0;
}

/**
 * Valbar på kundens riskbedömning: måste vara Aktuell i riskposten,
 * och om byrån använder utförandekatalogen även aktiv där.
 * Tom utförandekatalog (äldre byråer) → bara Aktuell.
 */
function isSelectableForKund(tjanst, utforandeState) {
  if (!tjanst || tjanst.aktuell !== true) return false;
  if (!hasUtforandeCatalog(utforandeState)) return true;
  return isUtforandeAktiv(tjanst.namn || tjanst.title, utforandeState);
}

/**
 * Berika katalogposter med aktiv från utförande.
 */
function enrichTjansterWithAktiv(tjanster, utforandeState) {
  return (Array.isArray(tjanster) ? tjanster : []).map((t) => ({
    ...t,
    aktiv: isUtforandeAktiv(t && (t.namn || t.title), utforandeState)
  }));
}

module.exports = {
  entryNamn,
  namesMatch,
  cloneState,
  findDeactivations,
  matchingRiskRecords,
  kundCountForNamn,
  findBlockedDeactivation,
  isUtforandeAktiv,
  hasAnyAktivUtforande,
  hasUtforandeCatalog,
  isSelectableForKund,
  enrichTjansterWithAktiv
};
