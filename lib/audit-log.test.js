const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createMemoryStore,
  createAuditLogService,
  createAuditEntry,
  wordDiffPercent,
  requiresAiReview,
  isRiskUnsetOverdue,
  customerRiskEmpty,
  buildAiSavedEntry,
  groupAiReviewItems,
  AI_REVIEW_DIFF_THRESHOLD,
  RISK_UNSET_HOURS,
  SYSTEM_ACTORS
} = require('./audit-log');

describe('audit-log', () => {
  it('blockerar UPDATE och DELETE via applikationslagret', async () => {
    const store = createMemoryStore();
    const svc = createAuditLogService(store);
    await svc.insert({
      actionType: 'screening_utförd',
      entityType: 'kund',
      entityId: 'rec1',
      actor: SYSTEM_ACTORS.dilisense,
      byraId: '12'
    });
    assert.throws(() => svc.update({}), /append-only/);
    assert.throws(() => svc.delete('log_1'), /append-only/);
    assert.throws(() => store.update({}), /append-only/);
    assert.throws(() => store.delete('log_1'), /append-only/);
    assert.equal(svc.update, store.update);
    assert.equal(Object.keys(svc).includes('update'), true);
    const listed = await svc.list({ byraId: '12' });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].actionType, 'screening_utförd');
  });

  it('flaggar risknivå_ej_satt_vid_skapande efter 48 timmar om fältet fortfarande är tomt', async () => {
    const createdAt = new Date('2026-08-19T10:00:00.000Z');
    const now = new Date('2026-08-21T11:00:00.000Z');
    const svc = createAuditLogService(createMemoryStore());
    const row = await svc.insert({
      actionType: 'risknivå_ej_satt_vid_skapande',
      entityType: 'kund',
      entityId: 'recKund',
      actor: SYSTEM_ACTORS.system,
      byraId: '7',
      metadata: { entitetNamn: 'Test AB' }
    }, { now: createdAt });
    assert.equal(row.actionType, 'risknivå_ej_satt_vid_skapande');
    assert.equal(customerRiskEmpty({ Namn: 'Test AB' }), true);
    assert.equal(isRiskUnsetOverdue(row, {
      now,
      riskStillEmpty: true,
      hours: RISK_UNSET_HOURS
    }), true);
    assert.equal(isRiskUnsetOverdue(row, {
      now: new Date('2026-08-20T09:00:00.000Z'),
      riskStillEmpty: true
    }), false);
    assert.equal(isRiskUnsetOverdue(row, { now, riskStillEmpty: false }), false);
  });

  it('beräknar diffProcent och sätter kräverGranskning vid tröskelvärdet', () => {
    const raw = 'Kunden bedöms ha normal risk utifrån verksamhet och ägarstruktur.';
    const almostSame = 'Kunden bedöms ha normal risk utifrån verksamhet och ägarstruktur';
    const rewritten = 'Vi bedömer förhöjd risk. Kunden har komplex ägarstruktur och flera högriskindikatorer som kräver skärpt kontroll.';
    const low = wordDiffPercent(raw, almostSame);
    const high = wordDiffPercent(raw, rewritten);
    assert.ok(low < AI_REVIEW_DIFF_THRESHOLD, 'nästan identisk text ska ligga under tröskeln');
    assert.ok(high >= AI_REVIEW_DIFF_THRESHOLD, 'omskriven text ska ligga över tröskeln');
    assert.equal(requiresAiReview(low), true);
    assert.equal(requiresAiReview(high), false);
    assert.equal(requiresAiReview(14.9, 15), true);
    assert.equal(requiresAiReview(15, 15), false);
  });

  it('låter ai_innehåll_sparat peka tillbaka till ai_innehåll_genererat', async () => {
    const svc = createAuditLogService(createMemoryStore());
    const generated = await svc.insertAiGenerated({
      entityType: 'kund',
      entityId: 'recKund',
      fieldChanged: 'Byrans riskbedomning',
      byraId: '7',
      aiOutputRaw: 'AI-förslag om normal risk.'
    });
    assert.equal(generated.actionType, 'ai_innehåll_genererat');
    assert.equal(generated.metadata.aiOutputRaw, 'AI-förslag om normal risk.');
    assert.equal(generated.metadata.sparadText, '');
    const saved = await svc.insertAiSaved({
      generatedId: generated.id,
      sparadText: 'AI-förslag om normal risk.',
      actor: { actorId: 'usr1', actorName: 'Anna Ledare' }
    });
    assert.equal(saved.actionType, 'ai_innehåll_sparat');
    assert.equal(saved.relatedLogId, generated.id);
    assert.equal(saved.metadata.relatedLogId, generated.id);
    assert.equal(saved.requiresReview, true);
    const linked = await svc.getById(saved.relatedLogId);
    assert.equal(linked.id, generated.id);
    assert.equal(linked.actionType, 'ai_innehåll_genererat');
  });

  it('kräver motivering för risknivå-ändring och döljer godkända AI-granskningar', () => {
    assert.throws(() => createAuditEntry({
      actionType: 'risknivå_ändrad',
      entityType: 'kund',
      entityId: 'x',
      actor: { actorId: 'u', actorName: 'U' }
    }), /Motivering/);
    const pending = {
      id: 'save1',
      actionType: 'ai_innehåll_sparat',
      requiresReview: true,
      metadata: { kraverGranskning: true }
    };
    const approved = {
      id: 'ok1',
      actionType: 'ai_innehåll_godkänt_oredigerat',
      relatedLogId: 'save1'
    };
    assert.equal(groupAiReviewItems([pending]).length, 1);
    assert.equal(groupAiReviewItems([pending, approved]).length, 0);
    const built = buildAiSavedEntry({
      generated: {
        id: 'gen1',
        actionType: 'ai_innehåll_genererat',
        entityType: 'tjanst',
        entityId: 't1',
        fieldChanged: 'Beskrivning',
        actorId: 'system:openai',
        actorName: 'AI (OpenAI)',
        byraId: '1',
        metadata: { aiOutputRaw: 'hej hej hej' }
      },
      sparadText: 'hej hej hej'
    });
    assert.equal(built.relatedLogId, 'gen1');
    assert.equal(built.requiresReview, true);
  });
});
