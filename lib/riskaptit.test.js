const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const RiskSkala = require('../public/js/risk-skala');
const Riskaptit = require('./riskaptit');
const {
  createMemoryStore,
  createAuditLogService,
  ACTION_TYPES
} = require('./audit-log');

describe('riskaptit', () => {
  it('sätter Kräver_beslut automatiskt när residual-S×K hamnar i Hög-bandet', () => {
    assert.equal(RiskSkala.beraknaRiskniva(4, 4), 'Hög');
    const hog = Riskaptit.evaluateCustomer({
      Riskniva: RiskSkala.beraknaRiskniva(4, 4)
    });
    assert.equal(hog.niva, 'Hög');
    assert.equal(hog.status, 'Kräver_beslut');
    assert.equal(hog.showBanner, true);

    const fromScore = Riskaptit.evaluateCustomer({
      Riskpoäng: JSON.stringify({ sannolikhet: 4, konsekvens: 5, sannolikhetEfter: 4, konsekvensEfter: 4 })
    });
    assert.equal(fromScore.niva, 'Hög');
    assert.equal(fromScore.status, 'Kräver_beslut');
  });

  it('sätter Överskriden vid Oacceptabel residualnivå', () => {
    assert.equal(RiskSkala.beraknaRiskniva(5, 5), 'Oacceptabel');
    const ev = Riskaptit.evaluateCustomer({ Riskniva: 'Oacceptabel' });
    assert.equal(ev.status, 'Överskriden');
  });

  it('avvisar registrerat beslut utan motivering', () => {
    const missing = Riskaptit.validateBeslut({
      utfall: 'Fortsätter_med_skärpta_åtgärder',
      motivering: ''
    });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /Motivering/);

    const short = Riskaptit.validateBeslut({
      utfall: 'Fortsätter_med_skärpta_åtgärder',
      motivering: 'för kort'
    });
    assert.equal(short.ok, false);

    const ok = Riskaptit.registerBeslut({
      fields: { Riskniva: 'Hög' },
      utfall: 'Fortsätter_med_skärpta_åtgärder',
      motivering: 'Kunden fortsätter med skärpt uppföljning och årlig omprövning.',
      actor: 'annika@example.com',
      nowIso: '2026-08-21'
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.status, 'Inom_aptit');
    assert.equal(ok.writeFields['Riskaptit beslut utfall'], 'Fortsätter_med_skärpta_åtgärder');
  });

  it('kräver nytt beslut när risknivån förvärras utan att radera historiken', () => {
    const first = Riskaptit.registerBeslut({
      fields: { Riskniva: 'Hög' },
      utfall: 'Fortsätter_med_skärpta_åtgärder',
      motivering: 'Fortsätter med skärpta åtgärder efter genomgång av ägarstruktur.',
      actor: 'annika@example.com',
      nowIso: '2026-08-01'
    });
    assert.equal(first.status, 'Inom_aptit');

    const afterWorse = Object.assign({}, first.writeFields, { Riskniva: 'Oacceptabel' });
    const ev = Riskaptit.evaluateCustomer(afterWorse);
    assert.equal(ev.status, 'Överskriden');
    assert.equal(ev.hasDecision, true);
    assert.equal(ev.hasValidDecision, false);
    assert.equal(afterWorse['Riskaptit beslut utfall'], 'Fortsätter_med_skärpta_åtgärder');

    const second = Riskaptit.registerBeslut({
      fields: afterWorse,
      utfall: 'Avslutas',
      motivering: 'Ny sanktionsträff och oacceptabel residualrisk. Affärsförbindelsen avslutas.',
      actor: 'annika@example.com',
      nowIso: '2026-08-21'
    });
    assert.equal(second.ok, true);
    const historik = JSON.parse(second.writeFields['Riskaptit historik']);
    assert.equal(historik.length, 1);
    assert.equal(historik[0].utfall, 'Fortsätter_med_skärpta_åtgärder');
    assert.equal(second.writeFields['Riskaptit beslut utfall'], 'Avslutas');
  });

  it('skriver riskaptit-ändringar till audit_log', async () => {
    const store = createMemoryStore();
    const svc = createAuditLogService(store);
    const statusRow = await svc.insert({
      actionType: 'riskaptit_status_ändrad',
      entityType: 'kund',
      entityId: 'recKund1',
      actor: { actorId: 'u1', actorName: 'Annika' },
      byraId: '12',
      fieldChanged: 'Riskaptit status',
      valueBefore: 'Inom_aptit',
      valueAfter: 'Kräver_beslut',
      motivering: 'Residualrisk Hög',
      metadata: { niva: 'Hög' }
    });
    const beslutRow = await svc.insert({
      actionType: 'riskaptit_beslut_registrerat',
      entityType: 'kund',
      entityId: 'recKund1',
      actor: { actorId: 'u1', actorName: 'Annika' },
      byraId: '12',
      fieldChanged: 'Riskaptit beslut utfall',
      valueAfter: 'Fortsätter_med_skärpta_åtgärder',
      motivering: 'Kunden fortsätter med skärpta åtgärder efter styrelsebeslut.'
    });
    assert.equal(statusRow.actionType, 'riskaptit_status_ändrad');
    assert.equal(beslutRow.actionType, 'riskaptit_beslut_registrerat');
    const listed = await svc.list({ entityId: 'recKund1' });
    assert.equal(listed.length, 2);
    assert.ok(ACTION_TYPES.includes('riskaptit_status_ändrad'));
    assert.ok(ACTION_TYPES.includes('riskaptit_beslut_registrerat'));
  });

  it('går tillbaka till Inom_aptit när risken förbättras under Hög och behåller beslutet', () => {
    const decided = Riskaptit.registerBeslut({
      fields: { Riskniva: 'Hög' },
      utfall: 'Fortsätter_med_skärpta_åtgärder',
      motivering: 'Fortsätter med skärpta åtgärder och tätare uppföljning.',
      actor: 'annika@example.com',
      nowIso: '2026-08-01'
    });
    const improved = Object.assign({}, decided.writeFields, { Riskniva: 'Normal' });
    const ev = Riskaptit.evaluateCustomer(improved);
    assert.equal(ev.status, 'Inom_aptit');
    assert.equal(improved['Riskaptit beslut utfall'], 'Fortsätter_med_skärpta_åtgärder');
    assert.equal(ev.historik.length, 0);
  });

  it('läser kanoniskt Riskniva före legacy sammanlagd risk', () => {
    const ev = Riskaptit.evaluateCustomer({
      Riskniva: 'Hög',
      'sammanlagd risk': 'Lag'
    });
    assert.equal(ev.niva, 'Hög');
    assert.equal(ev.status, 'Kräver_beslut');
  });

  it('policytexten speglar samma S×K-band som beraknaRiskniva', () => {
    const text = Riskaptit.policyText();
    const hogBand = Riskaptit.sxkBands().find((b) => b.label === 'Hög');
    const oaccBand = Riskaptit.sxkBands().find((b) => b.label === 'Oacceptabel');
    assert.equal(RiskSkala.beraknaRiskniva(4, 4), 'Hög');
    assert.equal(hogBand.from <= 16 && hogBand.to >= 16, true);
    assert.equal(RiskSkala.beraknaRiskniva(5, 5), 'Oacceptabel');
    assert.match(text, new RegExp('Hög: S×K ' + hogBand.from + '–' + hogBand.to));
    assert.match(text, new RegExp('Oacceptabel: S×K ' + oaccBand.from + '–' + oaccBand.to));
    assert.match(text, /beraknaRiskniva/);
    assert.doesNotMatch(text, /rec[A-Za-z0-9]{10,}/);
  });
});
