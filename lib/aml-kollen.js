/**
 * AML-kollen (engångskörning) för ClientFlow.
 *
 * OBS: Kontrollpunkterna här bygger på samma koncept som Miniboks AML-kollen (signalbaserad logik),
 * men är anpassade till engångsunderlag (kontoutdrag och/eller SIE) och implementerade separat i denna kodbas.
 */
const crypto = require('node:crypto');
const pdfParse = require('pdf-parse');
const sieReader = require('sie-reader');
const { fetchGrossMarginPercentBySni } = require('./scb-pxweb');

function toDateOnly(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // YYYYMMDD
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  // YYYY/MM/DD
  const iso2 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (iso2) return `${iso2[1]}-${iso2[2]}-${iso2[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return '';
}

function parseAmount(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = s
    .replace(/\s+/g, '')
    .replace(/\u00a0/g, '')
    .replace(/kr|sek/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // 1.234,00 → 1234,00
    .replace(/,(?=\d{2}(\D|$))/g, '.') // 1234,00 → 1234.00
    .replace(/[()]/g, '');
  const sign = /\(.*\)/.test(s) ? -1 : 1;
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const num = Number(m[0]);
  if (!Number.isFinite(num)) return null;
  return sign * num;
}

function tokenizeText(raw) {
  const t = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!t) return [];
  return t.split(/\s+/).filter(Boolean);
}

function jaccard(a, b) {
  const sa = new Set(a || []);
  const sb = new Set(b || []);
  if (!sa.size && !sb.size) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function csvSplitLine(line, delimiter) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQ && next === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (!inQ && ch === delimiter) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => String(s || '').trim());
}

function guessDelimiter(sampleLine) {
  const s = String(sampleLine || '');
  const semi = (s.match(/;/g) || []).length;
  const comma = (s.match(/,/g) || []).length;
  const tab = (s.match(/\t/g) || []).length;
  if (tab > semi && tab > comma) return '\t';
  if (semi >= comma) return ';';
  return ',';
}

function mapCsvColumns(headers) {
  const cols = (headers || []).map((h) => String(h || '').trim().toLowerCase());
  const idx = (re) => cols.findIndex((c) => re.test(c));
  const dateIdx = idx(/datum|bokf|booking|date|valuta/);
  const textIdx = idx(/text|referen|meddel|beskriv|info|motpart|name|betal/);
  const amountIdx = idx(/(^|[^a-z])belopp([^a-z]|$)|amount|summa(?!r)|total/);
  const debitIdx = idx(/debet|uttag|withdraw|ut /);
  const creditIdx = idx(/kredit|insatt|insättning|deposit|in /);
  return { dateIdx, textIdx, amountIdx, debitIdx, creditIdx };
}

function parseBankCsv(buffer, filename) {
  // Många svenska bankexporter är Windows-1252/latin1; prova utf8 först, fallback om det ser trasigt ut.
  let text = buffer.toString('utf8');
  if (text.includes('�')) {
    const latin = buffer.toString('latin1');
    if (!latin.includes('�')) text = latin;
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: 'CSV-filen är tom.' };
  const delim = guessDelimiter(lines[0]);
  const header = csvSplitLine(lines[0], delim);
  const { dateIdx, textIdx, amountIdx, debitIdx, creditIdx } = mapCsvColumns(header);
  const hasHeader = dateIdx !== -1 && (amountIdx !== -1 || debitIdx !== -1 || creditIdx !== -1);

  const startAt = hasHeader ? 1 : 0;
  const txs = [];
  const errors = [];
  for (let i = startAt; i < lines.length; i++) {
    const row = csvSplitLine(lines[i], delim);
    const dateRaw = row[dateIdx !== -1 ? dateIdx : 0] || '';
    const textRaw = row[textIdx !== -1 ? textIdx : 1] || '';
    const date = toDateOnly(dateRaw);
    let amount = null;
    if (amountIdx !== -1) {
      const amountRaw = row[amountIdx] || '';
      amount = parseAmount(amountRaw);
    } else if (debitIdx !== -1 || creditIdx !== -1) {
      const debit = parseAmount(row[debitIdx] || '');
      const credit = parseAmount(row[creditIdx] || '');
      if (debit != null || credit != null) amount = (credit || 0) - (debit || 0);
    } else {
      const amountRaw = row[row.length - 1] || '';
      amount = parseAmount(amountRaw);
    }
    if (!date || amount == null) {
      errors.push({ row: i + 1, dateRaw });
      continue;
    }
    txs.push({
      id: `bank:${txs.length + 1}`,
      date,
      text: String(textRaw || '').trim(),
      amount,
      source: { filename, row: i + 1 },
    });
  }
  if (!txs.length) {
    return { ok: false, error: 'Kunde inte läsa några transaktioner från CSV-filen. Kontrollera att den innehåller datum och belopp.' };
  }
  return { ok: true, transactions: txs, warnings: errors.length ? [{ kind: 'rows_skipped', count: errors.length }] : [] };
}

async function parseBankPdf(buffer, filename) {
  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch (e) {
    return { ok: false, error: 'PDF-filen kunde inte tolkas. Prova att exportera kontoutdrag som CSV från banken.' };
  }
  const text = String(parsed?.text || '').replace(/\u00a0/g, ' ');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const txs = [];
  // Best-effort: look for "YYYY-MM-DD ... amount"
  const re = /^(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\s+(.+?)\s+(-?\d[\d\s.,]+)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const date = toDateOnly(m[1]);
    const amount = parseAmount(m[3]);
    if (!date || amount == null) continue;
    txs.push({
      id: `bank:${txs.length + 1}`,
      date,
      text: String(m[2] || '').trim(),
      amount,
      source: { filename, kind: 'pdf-line' },
    });
  }
  if (!txs.length) {
    return { ok: false, error: 'PDF-kontoutdraget kunde inte parsas till transaktioner. Exportera helst som CSV från banken.' };
  }
  return { ok: true, transactions: txs, warnings: [{ kind: 'pdf_best_effort', message: 'PDF-parsning är best-effort. Verifiera utfallet mot underlaget.' }] };
}

async function parseBankStatement(buffer, filename) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseBankCsv(buffer, filename);
  if (lower.endsWith('.pdf')) return await parseBankPdf(buffer, filename);
  // Try CSV anyway (många banker exporterar som .xls men är tab-separerad text)
  const csvTry = parseBankCsv(buffer, filename);
  if (csvTry.ok) return csvTry;
  return { ok: false, error: 'Kontoutdraget måste vara CSV eller PDF.' };
}

function parseSie(buffer, filename) {
  let sieFile;
  try {
    sieFile = sieReader.readBuffer(buffer);
  } catch (e) {
    return { ok: false, error: 'SIE-filen kunde inte parsas. Kontrollera att det är en SIE4-export och att filen inte är skadad.' };
  }
  const vers = sieFile.list('ver') || [];
  const kontoIndex = new Map();
  (sieFile.list('konto') || []).forEach((k) => {
    const nr = String(k.kontonr || '').trim();
    const name = String(k.kontonamn || '').trim();
    if (nr) kontoIndex.set(nr, name);
  });

  const ledger = [];
  const all = [];
  vers.forEach((ver) => {
    const verDate = toDateOnly(ver.verdatum || ver.datum || '');
    const verText = String(ver.vertext || ver.text || '').trim();
    const posters = Array.isArray(ver.poster) ? ver.poster : [];
    posters.forEach((p) => {
      const konto = String(p.kontonr || '').trim();
      const belopp = parseAmount(p.belopp);
      const rowText = String(p.text || p.transtext || '').trim();
      const rowDate = toDateOnly(p.transdatum || p.datum || verDate || '');
      const item = {
        id: `sie:${all.length + 1}`,
        date: rowDate || verDate,
        text: [verText, rowText].filter(Boolean).join(' · ').trim(),
        amount: belopp == null ? null : belopp,
        konto,
        kontoNamn: kontoIndex.get(konto) || '',
        voucher: {
          serie: String(ver.serie || '').trim(),
          vernr: String(ver.vernr || '').trim(),
        },
        source: { filename },
      };
      all.push(item);
      if (konto && konto.startsWith('19')) {
        // Bankkonton i BAS ligger oftast i 19xx; vi använder dessa för matchning mot kontoutdrag.
        ledger.push(item);
      }
    });
  });

  const usable = ledger.filter((t) => t.date && t.amount != null);
  if (!usable.length) {
    return { ok: false, error: 'SIE-filen innehåller inga transaktioner på 19xx-konton med datum och belopp (kräver normalt SIE4).' };
  }

  const years = new Set();
  usable.forEach((t) => { if (t.date) years.add(t.date.slice(0, 4)); });
  const year = [...years].sort().slice(-1)[0] || '';
  return { ok: true, bankLedgerTransactions: usable, allTransactions: all, fiscalYearHint: year };
}

function dateDiffDays(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

function buildMatches(bankTxs, ledgerTxs, { maxDayDiff = 3 } = {}) {
  const bank = bankTxs || [];
  const ledger = ledgerTxs || [];
  const usedBank = new Set();
  const usedLedger = new Set();
  const matches = [];

  const ledgerByAmount = new Map();
  ledger.forEach((t, idx) => {
    const key = t.amount != null ? t.amount.toFixed(2) : '';
    if (!key) return;
    const arr = ledgerByAmount.get(key) || [];
    arr.push({ t, idx });
    ledgerByAmount.set(key, arr);
  });

  const pairs = [];
  bank.forEach((bt, bankIdx) => {
    const key = bt.amount != null ? bt.amount.toFixed(2) : '';
    const candidates = (key && ledgerByAmount.get(key)) ? ledgerByAmount.get(key) : [];
    if (!candidates.length) return;
    const bTok = tokenizeText(bt.text);
    for (const c of candidates) {
      const lt = c.t;
      const dd = Math.abs(dateDiffDays(bt.date, lt.date));
      if (dd > maxDayDiff) continue;
      const sim = jaccard(bTok, tokenizeText(lt.text));
      const score = (1.0 - (dd / (maxDayDiff + 0.001))) + (sim * 0.6);
      pairs.push({ bankIdx, ledgerIdx: c.idx, bt, lt, dd, sim, score });
    }
  });
  pairs.sort((a, b) => (
    b.score - a.score
    || a.dd - b.dd
    || b.sim - a.sim
    || String(a.bt.id).localeCompare(String(b.bt.id))
    || String(a.lt.id).localeCompare(String(b.lt.id))
  ));
  for (const p of pairs) {
    if (usedBank.has(p.bankIdx) || usedLedger.has(p.ledgerIdx)) continue;
    usedBank.add(p.bankIdx);
    usedLedger.add(p.ledgerIdx);
    matches.push({
      bankTxId: p.bt.id,
      ledgerTxId: p.lt.id,
      amount: p.bt.amount,
      bankDate: p.bt.date,
      ledgerDate: p.lt.date,
      dateDiffDays: p.dd,
      textSimilarity: Number(p.sim.toFixed(3)),
    });
  }

  const matchedBank = new Set(matches.map((m) => m.bankTxId));
  const matchedLedger = new Set(matches.map((m) => m.ledgerTxId));
  return {
    matches,
    bankUnmatched: bank.filter((t) => !matchedBank.has(t.id)),
    ledgerUnmatched: ledger.filter((t) => !matchedLedger.has(t.id)),
  };
}

function computeGrossMarginFromSie(allSieTransactions) {
  const lines = (Array.isArray(allSieTransactions) ? allSieTransactions : []).filter((t) => t && t.konto && t.amount != null);
  // BAS: 30xx-39xx intäkter; 40xx-49xx varukostnad. SIE-beloppets tecken varierar per system;
  // vi använder absolut nivå per kontoklass och gör netto på belopp.
  let revenue = 0;
  let cogs = 0;
  for (const t of lines) {
    const konto = String(t.konto || '');
    const first2 = konto.slice(0, 2);
    if (first2 >= '30' && first2 <= '39') revenue += -t.amount; // intäkter brukar vara kredit (neg i SIE)
    if (first2 >= '40' && first2 <= '49') cogs += t.amount; // kostnader brukar vara debet (pos i SIE)
  }
  if (!(revenue > 0)) return { ok: false, error: 'Kunde inte beräkna brutto: intäktskonton (30xx-39xx) saknas eller är 0.' };
  const gross = revenue - Math.abs(cogs);
  const margin = (gross / revenue) * 100;
  return { ok: true, revenue, cogs: Math.abs(cogs), gross, marginPercent: margin };
}

function compactBankTx(t) {
  return {
    id: t?.id,
    date: t?.date,
    amount: t?.amount,
    text: t?.text || '',
  };
}

function compactLedgerTx(t) {
  return {
    id: t?.id,
    date: t?.date,
    amount: t?.amount,
    text: t?.text || '',
    konto: t?.konto || '',
    kontoNamn: t?.kontoNamn || '',
    voucher: t?.voucher || null,
  };
}

function counterpartyKeyFromText(text) {
  const raw = String(text || '').toLowerCase();
  if (!raw) return '';
  const cleaned = raw
    .replace(/\b(sw|swish|bg|bankgiro|pg|plusgiro|kortk[öo]p|autogiro|overfor|överför|betalning|insatt|insättning|uttag|inbetalning|utbetalning)\b/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\u00e5\u00e4\u00f60-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.split(' ').slice(0, 3).join(' ');
}

function detectSignals({
  bankTxs,
  ledgerTxs,
  matchResult,
  customerBusinessText,
  relatedPartyNames,
  grossMargin,
  scbGrossMargin,
  bothSources = true,
}) {
  const signals = [];
  const bankUnmatched = matchResult?.bankUnmatched || [];
  const ledgerUnmatched = matchResult?.ledgerUnmatched || [];

  // Matchningssignaler bank↔SIE kräver båda underlagen; annars blir "utan match" meningslös.
  if (bothSources && ledgerUnmatched.length) {
    signals.push({
      id: 'ledger_without_bank',
      title: 'Bokförda bankposter utan matchande banktransaktion',
      severity: ledgerUnmatched.length >= 10 ? 4 : 3,
      why: `Hittade ${ledgerUnmatched.length} bokförda 19xx-poster utan match i kontoutdraget.`,
      evidence: { ledgerTransactions: ledgerUnmatched.slice(0, 50).map(compactLedgerTx) },
    });
  }
  if (bothSources && bankUnmatched.length) {
    signals.push({
      id: 'bank_without_ledger',
      title: 'Banktransaktioner utan matchande bokförd post',
      severity: bankUnmatched.length >= 10 ? 4 : 3,
      why: `Hittade ${bankUnmatched.length} banktransaktioner utan match i SIE:s 19xx-poster.`,
      evidence: { bankTransactions: bankUnmatched.slice(0, 50).map(compactBankTx) },
    });
  }

  const round = (bankTxs || []).filter((t) => {
    const abs = Math.abs(Number(t.amount || 0));
    const cents = Math.round(abs * 100) % 100;
    return cents === 0 && abs >= 1000;
  });
  if (round.length >= 10) {
    signals.push({
      id: 'round_amounts',
      title: 'Många runda belopp',
      severity: 2,
      why: `Hittade ${round.length} transaktioner med runda belopp (hela kronor, ≥ 1 000 kr).`,
      evidence: { bankTransactions: round.slice(0, 50).map(compactBankTx) },
    });
  }

  const swish = (bankTxs || []).filter((t) => /swish/i.test(String(t.text || '')));
  if (swish.length >= 10) {
    signals.push({
      id: 'swish_pattern',
      title: 'Swish-mönster',
      severity: 2,
      why: `Hittade ${swish.length} Swish-transaktioner i perioden.`,
      evidence: { bankTransactions: swish.slice(0, 50).map(compactBankTx) },
    });
  }

  // Många unika motparter (best-effort från referenstext)
  const cpMap = new Map();
  (bankTxs || []).forEach((t) => {
    const key = counterpartyKeyFromText(t.text);
    if (!key) return;
    const arr = cpMap.get(key) || [];
    arr.push(t);
    cpMap.set(key, arr);
  });
  const uniqueCounterparties = cpMap.size;
  if (uniqueCounterparties >= 80) {
    const oneOff = [...cpMap.entries()].filter(([, list]) => (list || []).length === 1);
    const sample = oneOff
      .map(([, list]) => list[0])
      .filter(Boolean)
      .sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)))
      .slice(0, 25);
    signals.push({
      id: 'many_unique_counterparties',
      title: 'Många unika motparter (best-effort)',
      severity: 2,
      why: `Hittade cirka ${uniqueCounterparties} unika motparter i kontoutdraget baserat på referenstext. Många engångsmotparter kan motivera extra kontroll.`,
      evidence: {
        uniqueCounterparties,
        oneOffCount: oneOff.length,
        examples: sample.map(compactBankTx),
      },
    });
  }

  // Strukturering (best-effort): många delbetalningar samma dag med liknande belopp/texter.
  const structCandidates = (bankTxs || []).filter((t) => Math.abs(Number(t.amount || 0)) > 0);
  const byDay = new Map();
  structCandidates.forEach((t) => {
    const day = String(t.date || '').slice(0, 10);
    if (!day) return;
    const arr = byDay.get(day) || [];
    arr.push(t);
    byDay.set(day, arr);
  });
  const structHits = [];
  for (const [day, list] of byDay.entries()) {
    const incoming = list.filter((t) => Number(t.amount || 0) > 0);
    if (incoming.length < 5) continue;
    const small = incoming.filter((t) => {
      const a = Number(t.amount || 0);
      return a >= 2000 && a <= 10000;
    });
    if (small.length < 5) continue;
    const sum = small.reduce((acc, t) => acc + Number(t.amount || 0), 0);
    if (sum >= 40000) {
      structHits.push({ day, txs: small, sum });
    }
  }
  if (structHits.length) {
    const top = structHits.sort((a, b) => b.sum - a.sum)[0];
    signals.push({
      id: 'structuring',
      title: 'Möjlig strukturering (många delbelopp)',
      severity: 3,
      why: `Hittade ${top.txs.length} inkommande transaktioner ${top.day} med belopp 2 000–10 000 kr (summa ${top.sum.toFixed(0)} kr).`,
      evidence: { day: top.day, sum: top.sum, bankTransactions: top.txs.slice(0, 50).map(compactBankTx) },
    });
  }

  // Snabb vidareförmedling (in-and-out) per dag: stora in- och utflöden nära varandra.
  const flowDays = [];
  for (const [day, list] of byDay.entries()) {
    const inflow = list.filter((t) => Number(t.amount || 0) > 0).reduce((a, t) => a + Number(t.amount || 0), 0);
    const outflow = list.filter((t) => Number(t.amount || 0) < 0).reduce((a, t) => a + Math.abs(Number(t.amount || 0)), 0);
    if (inflow >= 50000 && outflow >= 50000) {
      const ratio = Math.min(inflow, outflow) / Math.max(inflow, outflow);
      if (ratio >= 0.85) flowDays.push({ day, inflow, outflow, list });
    }
  }
  if (flowDays.length) {
    const top = flowDays.sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow))[0];
    signals.push({
      id: 'in_and_out',
      title: 'Snabb vidareförmedling (in-and-out)',
      severity: 3,
      why: `Dag ${top.day}: in ${top.inflow.toFixed(0)} kr och ut ${top.outflow.toFixed(0)} kr (best-effort).`,
      evidence: {
        day: top.day,
        inflow: top.inflow,
        outflow: top.outflow,
        bankTransactions: (top.list || []).slice(0, 80).map(compactBankTx),
      },
    });
  }

  const related = (relatedPartyNames || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (related.length) {
    const hits = (bankTxs || []).filter((t) => {
      const text = String(t.text || '').toLowerCase();
      return related.some((n) => text.includes(String(n).toLowerCase()));
    });
    if (hits.length) {
      signals.push({
        id: 'related_parties',
        title: 'Överföringar med möjliga närstående',
        severity: 3,
        why: `Hittade ${hits.length} transaktioner som matchar angivna/identifierade närstående namn.`,
        evidence: {
          relatedPartyNames: related.slice(0, 30),
          bankTransactions: hits.slice(0, 50).map(compactBankTx),
        },
      });
    }
  }

  const biz = String(customerBusinessText || '').trim().toLowerCase();
  if (biz) {
    const risky = (bankTxs || []).filter((t) => {
      const text = String(t.text || '').toLowerCase();
      // mycket enkel heuristik: matcha mot vissa typiska “avvikande” nyckelord
      const suspicious = /(casino|bet|crypto|krypto|bitcoin|revolut|wise|western union|moneygram|kontant|cash|vape|cbd)/i.test(text);
      if (!suspicious) return false;
      // men om kundens verksamhet redan nämner t.ex. “krypto” vill vi inte flagga direkt
      return !biz.includes('krypto') && !biz.includes('casino');
    });
    if (risky.length) {
      signals.push({
        id: 'business_mismatch',
        title: 'Transaktioner som kan avvika från verksamhetsbeskrivningen',
        severity: 3,
        why: `Hittade ${risky.length} transaktioner med nyckelord som ofta avviker (best-effort).`,
        evidence: { bankTransactions: risky.slice(0, 50).map(compactBankTx) },
      });
    }
  }

  if (grossMargin?.ok && scbGrossMargin?.ok) {
    const diff = Math.abs(grossMargin.marginPercent - scbGrossMargin.value);
    if (diff >= 15) {
      signals.push({
        id: 'gross_margin_vs_scb',
        title: 'Bruttovinstmarginal avviker från SCB:s branschnyckeltal',
        severity: diff >= 30 ? 4 : 3,
        why: `Beräknad bruttovinstmarginal ${grossMargin.marginPercent.toFixed(1)}% jämfört med SCB median ${scbGrossMargin.value.toFixed(1)}% (${scbGrossMargin.ref.sniGroup}, ${scbGrossMargin.ref.year}).`,
        evidence: {
          grossMargin: {
            revenue: grossMargin.revenue,
            cogs: grossMargin.cogs,
            marginPercent: Number(grossMargin.marginPercent.toFixed(2)),
          },
          scb: { ...scbGrossMargin.ref, value: scbGrossMargin.value },
        },
      });
    }
  }

  return signals;
}

function minMaxDate(txs) {
  const dates = (txs || []).map((t) => String(t.date || '')).filter(Boolean).sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : { start: '', end: '' };
}

function daysBetweenInclusive(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.abs(Math.round((b - a) / (24 * 60 * 60 * 1000))) + 1;
}

function validateParsedRanges({ bankRange, ledgerRange }) {
  const warnings = [];
  const today = new Date().toISOString().slice(0, 10);
  const end = bankRange.end || ledgerRange.end || '';
  const start = bankRange.start || ledgerRange.start || '';
  if (!start || !end) return { ok: false, error: 'Kunde inte fastställa datumintervall från underlaget.' };

  const spanDays = daysBetweenInclusive(start, end);
  if (spanDays === Infinity) return { ok: false, error: 'Datum i underlaget kunde inte tolkas.' };
  if (spanDays > 366 * 3) return { ok: false, error: `Orimligt datumintervall (${spanDays} dagar). Kontrollera att kontoutdrag/SIE avser samma period.` };
  if (end > today) warnings.push({ kind: 'future_dates', message: `Underlaget innehåller datum i framtiden (senast ${end}). Kontrollera exporten.` });

  if (bankRange.start && ledgerRange.start) {
    const overlapStart = bankRange.start > ledgerRange.start ? bankRange.start : ledgerRange.start;
    const overlapEnd = bankRange.end < ledgerRange.end ? bankRange.end : ledgerRange.end;
    if (overlapStart && overlapEnd && overlapStart > overlapEnd) {
      warnings.push({ kind: 'no_overlap', message: 'Kontoutdragets datumintervall överlappar inte SIE:s 19xx-transaktioner. Matchning kan bli missvisande.' });
    }
  }
  return { ok: true, warnings, dateRange: { start, end } };
}

function validateAmlKollenUploadInputs({
  bankFilename,
  bankFileBase64,
  sieFilename,
  sieFileBase64,
} = {}) {
  const hasBank = !!(String(bankFileBase64 || '').trim() && String(bankFilename || '').trim());
  const hasSie = !!(String(sieFileBase64 || '').trim() && String(sieFilename || '').trim());
  if (!hasBank && !hasSie) {
    return {
      ok: false,
      error: 'Ladda upp kontoutdrag eller SIE-fil (minst en krävs).',
      hasBank: false,
      hasSie: false,
    };
  }
  return { ok: true, hasBank, hasSie };
}

async function analyzeAmlKollenOnce({
  customer,
  bankStatement,
  sieFile,
  relatedPartyNames,
  maxTxStore = 800,
} = {}) {
  const runId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const hasBank = !!(bankStatement?.buffer != null && String(bankStatement?.filename || '').trim());
  const hasSie = !!(sieFile?.buffer != null && String(sieFile?.filename || '').trim());
  if (!hasBank && !hasSie) {
    return { ok: false, error: 'Ladda upp kontoutdrag eller SIE-fil (minst en krävs).' };
  }
  const bothSources = hasBank && hasSie;

  let bankParsed = { ok: true, transactions: [], warnings: [] };
  let sieParsed = {
    ok: true,
    bankLedgerTransactions: [],
    allTransactions: [],
    fiscalYearHint: '',
  };

  if (hasBank) {
    bankParsed = await parseBankStatement(bankStatement.buffer, bankStatement.filename);
    if (!bankParsed.ok) return { ok: false, error: bankParsed.error };
  }
  if (hasSie) {
    sieParsed = parseSie(sieFile.buffer, sieFile.filename);
    if (!sieParsed.ok) return { ok: false, error: sieParsed.error };
  }

  const bankTxs = (bankParsed.transactions || []).slice(0, maxTxStore);
  const ledgerTxs = (sieParsed.bankLedgerTransactions || []).slice(0, maxTxStore);

  const bankRange = minMaxDate(bankTxs);
  const ledgerRange = minMaxDate(ledgerTxs);
  const rangeCheck = validateParsedRanges({ bankRange, ledgerRange });
  if (!rangeCheck.ok) return { ok: false, error: rangeCheck.error };

  const matchResult = bothSources
    ? buildMatches(bankTxs, ledgerTxs, { maxDayDiff: 3 })
    : { matches: [], bankUnmatched: [], ledgerUnmatched: [] };

  const sourceWarnings = [];
  if (!bothSources) {
    if (hasBank) {
      sourceWarnings.push({
        kind: 'single_source',
        message: 'Endast kontoutdrag uppladdat — matchning mot bokföring och SIE-baserade signaler hoppas över.',
      });
    } else {
      sourceWarnings.push({
        kind: 'single_source',
        message: 'Endast SIE uppladdat — bankbaserade signaler och matchning mot kontoutdrag hoppas över.',
      });
    }
  }

  const businessText = String(customer?.fields?.['Beskrivning av kunden']
    || customer?.fields?.Verksamhet
    || customer?.fields?.['Verksamhetsbeskrivning']
    || '').trim();

  const sniRaw = customer?.fields?.['SNI kod'] || customer?.fields?.['SNI-koder'] || '';
  const sniCode = String(sniRaw).replace(/[^\d]/g, '').slice(0, 5);
  const fiscalYear = sieParsed.fiscalYearHint || '';

  const grossMargin = hasSie
    ? computeGrossMarginFromSie(sieParsed.allTransactions)
    : { ok: false, error: 'SIE saknas' };
  let scbGrossMargin = { ok: false, value: null, error: 'Ej hämtad', ref: null };
  if (grossMargin.ok && sniCode) {
    try {
      scbGrossMargin = await fetchGrossMarginPercentBySni({ sniCode, year: fiscalYear || new Date().getFullYear() - 1 });
    } catch (e) {
      scbGrossMargin = { ok: false, value: null, error: e.message || 'SCB misslyckades', ref: null };
    }
  }

  const signals = detectSignals({
    bankTxs,
    ledgerTxs,
    matchResult,
    customerBusinessText: businessText,
    relatedPartyNames,
    grossMargin,
    scbGrossMargin,
    bothSources,
  });

  const range = rangeCheck.dateRange;

  return {
    ok: true,
    run: {
      id: runId,
      createdAt,
      inputs: {
        bankFilename: hasBank ? bankStatement.filename : null,
        sieFilename: hasSie ? sieFile.filename : null,
        relatedPartyNames: (relatedPartyNames || []).map((n) => String(n || '').trim()).filter(Boolean).slice(0, 50),
        sources: { bank: hasBank, sie: hasSie },
      },
      dateRange: range,
      counts: {
        bankTransactions: bankTxs.length,
        sieBankTransactions: ledgerTxs.length,
        matches: matchResult.matches.length,
        bankUnmatched: matchResult.bankUnmatched.length,
        ledgerUnmatched: matchResult.ledgerUnmatched.length,
        signals: signals.length,
      },
      scb: scbGrossMargin.ok ? scbGrossMargin.ref : null,
      grossMargin: grossMargin.ok ? {
        revenue: grossMargin.revenue,
        cogs: grossMargin.cogs,
        marginPercent: Number(grossMargin.marginPercent.toFixed(2)),
      } : null,
      signals,
      data: {
        matches: matchResult.matches.slice(0, 500),
        bankUnmatched: matchResult.bankUnmatched.slice(0, 200).map(compactBankTx),
        ledgerUnmatched: matchResult.ledgerUnmatched.slice(0, 200).map(compactLedgerTx),
        warnings: [
          ...sourceWarnings,
          ...(bankParsed.warnings || []),
          ...(rangeCheck.warnings || []),
        ],
        sieFiscalYearHint: fiscalYear || null,
      },
    },
  };
}

module.exports = {
  toDateOnly,
  parseAmount,
  parseBankStatement,
  parseSie,
  buildMatches,
  computeGrossMarginFromSie,
  validateAmlKollenUploadInputs,
  detectSignals,
  analyzeAmlKollenOnce,
};
