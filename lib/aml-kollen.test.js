const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseBankStatement,
  parseSie,
  buildMatches,
  computeGrossMarginFromSie,
  validateAmlKollenUploadInputs,
  detectSignals,
  analyzeAmlKollenOnce,
} = require('./aml-kollen');

describe('aml-kollen: bank statement parsing', () => {
  it('parsar semikolon-CSV med datum/text/belopp', async () => {
    const csv = Buffer.from('Datum;Text;Belopp\n2026-08-01;Swish 070...;1000,00\n2026-08-02;Kortköp ICA;-123,45\n', 'utf8');
    const r = await parseBankStatement(csv, 'kontoutdrag.csv');
    assert.equal(r.ok, true);
    assert.equal(r.transactions.length, 2);
    assert.equal(r.transactions[0].date, '2026-08-01');
    assert.equal(r.transactions[0].amount, 1000);
    assert.equal(r.transactions[1].amount, -123.45);
  });

  it('parsar CSV även utan header (fallback)', async () => {
    const csv = Buffer.from('2026-01-01;Text;500\n2026-01-02;Text2;-20\n', 'utf8');
    const r = await parseBankStatement(csv, 'export.txt');
    assert.equal(r.ok, true);
    assert.equal(r.transactions.length, 2);
  });
});

describe('aml-kollen: SIE parsing + matching', () => {
  it('parsar SIE4 och hittar 19xx-transaktioner', () => {
    const fixture = path.join(__dirname, '..', 'node_modules', 'sie-reader', 'test', 'test.SI');
    const buf = fs.readFileSync(fixture);
    const r = parseSie(buf, 'test.SI');
    assert.equal(r.ok, true);
    assert.ok(r.bankLedgerTransactions.length > 0);
    assert.ok(r.bankLedgerTransactions.some((t) => t.konto === '1930'));
  });

  it('matchar bank och sie på belopp+datum', () => {
    const bank = [
      { id: 'b1', date: '2026-01-05', text: 'Inbetalning kund', amount: 11025.00 },
      { id: 'b2', date: '2026-01-13', text: 'Utbetalning leverantör', amount: -4000.00 },
    ];
    const ledger = [
      { id: 'l1', date: '2026-01-05', text: 'Inbetalningsjournal', amount: 11025.00 },
      { id: 'l2', date: '2026-01-13', text: 'Utbetalningsjournal', amount: -4000.00 },
    ];
    const m = buildMatches(bank, ledger, { maxDayDiff: 3 });
    assert.equal(m.matches.length, 2);
    assert.equal(m.bankUnmatched.length, 0);
    assert.equal(m.ledgerUnmatched.length, 0);
  });

  it('beräknar bruttovinstmarginal om 30xx/40xx finns', () => {
    const lines = [
      { konto: '3010', amount: -100000 },
      { konto: '4010', amount: 60000 },
    ];
    const r = computeGrossMarginFromSie(lines);
    assert.equal(r.ok, true);
    assert.ok(r.marginPercent > 30 && r.marginPercent < 50);
  });
});



describe('aml-kollen: minst en källa krävs', () => {
  it('avvisar när varken kontoutdrag eller SIE anges', () => {
    const r = validateAmlKollenUploadInputs({});
    assert.equal(r.ok, false);
    assert.match(r.error, /minst en/i);
  });

  it('godkänner enbart kontoutdrag', () => {
    const r = validateAmlKollenUploadInputs({
      bankFilename: 'bank.csv',
      bankFileBase64: 'YWJj',
    });
    assert.equal(r.ok, true);
    assert.equal(r.hasBank, true);
    assert.equal(r.hasSie, false);
  });

  it('godkänner enbart SIE', () => {
    const r = validateAmlKollenUploadInputs({
      sieFilename: 'bok.se',
      sieFileBase64: 'YWJj',
    });
    assert.equal(r.ok, true);
    assert.equal(r.hasBank, false);
    assert.equal(r.hasSie, true);
  });

  it('flaggar inte bank↔SIE-matchning när only one source', () => {
    const bank = [{ id: 'b1', date: '2026-01-05', text: 'Swish', amount: 1000 }];
    const ledger = [{ id: 'l1', date: '2026-01-05', text: 'Bank', amount: 2000, konto: '1930' }];
    const matchResult = {
      matches: [],
      bankUnmatched: bank,
      ledgerUnmatched: ledger,
    };
    const both = detectSignals({ bankTxs: bank, ledgerTxs: ledger, matchResult, bothSources: true });
    const one = detectSignals({ bankTxs: bank, ledgerTxs: ledger, matchResult, bothSources: false });
    assert.ok(both.some((s) => s.id === 'bank_without_ledger'));
    assert.ok(both.some((s) => s.id === 'ledger_without_bank'));
    assert.equal(one.some((s) => s.id === 'bank_without_ledger'), false);
    assert.equal(one.some((s) => s.id === 'ledger_without_bank'), false);
  });

  it('analyserar kontoutdrag-only utan SIE', async () => {
    const csv = Buffer.from('Datum;Text;Belopp\n2026-08-01;Swish 070...;1000,00\n2026-08-02;Kortköp ICA;-123,45\n', 'utf8');
    const r = await analyzeAmlKollenOnce({
      customer: { fields: {} },
      bankStatement: { buffer: csv, filename: 'kontoutdrag.csv' },
      sieFile: null,
      relatedPartyNames: [],
    });
    assert.equal(r.ok, true);
    assert.equal(r.run.inputs.sources.bank, true);
    assert.equal(r.run.inputs.sources.sie, false);
    assert.equal(r.run.inputs.sieFilename, null);
    assert.ok((r.run.data.warnings || []).some((w) => w.kind === 'single_source'));
    assert.equal(r.run.signals.some((s) => s.id === 'bank_without_ledger'), false);
  });

  it('analyserar SIE-only utan kontoutdrag', async () => {
    const fixture = path.join(__dirname, '..', 'node_modules', 'sie-reader', 'test', 'test.SI');
    const buf = fs.readFileSync(fixture);
    const r = await analyzeAmlKollenOnce({
      customer: { fields: {} },
      bankStatement: null,
      sieFile: { buffer: buf, filename: 'test.SI' },
      relatedPartyNames: [],
    });
    assert.equal(r.ok, true);
    assert.equal(r.run.inputs.sources.bank, false);
    assert.equal(r.run.inputs.sources.sie, true);
    assert.equal(r.run.inputs.bankFilename, null);
    assert.ok((r.run.data.warnings || []).some((w) => w.kind === 'single_source'));
    assert.equal(r.run.signals.some((s) => s.id === 'ledger_without_bank'), false);
  });

  it('avvisar analyze när ingen källa finns', async () => {
    const r = await analyzeAmlKollenOnce({
      customer: { fields: {} },
      bankStatement: null,
      sieFile: null,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /minst en/i);
  });
});
