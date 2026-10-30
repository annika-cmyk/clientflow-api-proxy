'use strict';

/**
 * Riskbeslut-PDF — ögonblicksbild vid Godkänn/Avslå.
 * Filnamn: Riskbeslut_<kund>_<ÅÅÅÅ-MM-DD>.pdf
 * Märkt «Internt»; inkluderar beslutslogg. KYC-bilaga läggs till av anroparen.
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(opts = {}) {
  const fields = opts.fields || {};
  const decision = opts.decision || {};
  const byraNamn = opts.byraNamn || '';
  const kundnamn = fields.Namn || fields['Företagsnamn'] || 'Kund';
  const orgnr = fields.Orgnr || fields['Organisationsnummer'] || '';
  const residual = fields.Riskniva || fields['sammanlagd risk'] || '–';
  const motivering = fields['Byrans riskbedomning'] || fields.Motivering || '';
  const status = decision.status || fields['Riskbeslut status'] || '';
  const version = decision.version || fields['Riskbeslut version'] || 1;
  const at = decision.at || new Date().toISOString().slice(0, 10);
  const actor = decision.actorName || '';
  const comment = decision.comment || '';
  const log = Array.isArray(decision.log) ? decision.log : [];

  const logRows = log.map((e) => `
    <tr>
      <td>${esc((e.at || '').toString().slice(0, 16).replace('T', ' '))}</td>
      <td>${esc(e.event || e.händelse || '')}</td>
      <td>${esc(e.userName || e.person || '')}</td>
      <td>${esc(e.comment || e.kommentar || '')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Riskbeslut – ${esc(kundnamn)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 28px 36px; font-size: 12px; line-height: 1.45; }
  .mark { display: inline-block; padding: 2px 8px; border: 1px solid #94a3b8; border-radius: 4px; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #475569; }
  h1 { font-size: 20px; margin: 12px 0 4px; }
  h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .meta { color: #475569; margin: 0 0 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 12px 0 18px; }
  .grid div strong { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  .box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 6px; margin: 8px 0; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; font-size: 11px; }
  th { color: #64748b; font-weight: 600; }
  footer { margin-top: 28px; font-size: 10px; color: #64748b; }
</style>
</head>
<body>
  <span class="mark">Internt</span>
  <h1>Riskbeslut</h1>
  <p class="meta">${esc(byraNamn)}${byraNamn ? ' · ' : ''}${esc(kundnamn)}${orgnr ? ` · ${esc(orgnr)}` : ''} · version ${esc(version)} · ${esc(at)}</p>
  <div class="grid">
    <div><strong>Beslut</strong>${esc(status)}</div>
    <div><strong>Bedömd residual</strong>${esc(residual)}</div>
    <div><strong>Beslutat av</strong>${esc(actor || '–')}</div>
    <div><strong>Nästa uppföljning</strong>${esc(fields['Nästa uppföljning'] || fields['Nästa KYC-uppföljning'] || '–')}</div>
  </div>
  ${comment ? `<h2>Kommentar</h2><div class="box">${esc(comment)}</div>` : ''}
  ${motivering ? `<h2>Motivering (ögonblicksbild)</h2><div class="box">${esc(motivering)}</div>` : ''}
  <h2>Beslutslogg</h2>
  <table>
    <thead><tr><th>Datum</th><th>Händelse</th><th>Person</th><th>Kommentar</th></tr></thead>
    <tbody>${logRows || '<tr><td colspan="4">Ingen logg</td></tr>'}</tbody>
  </table>
  <footer>Internt underlag — ingår inte i kundens KYC-PDF. KYC-bilaga bifogas vid generering.</footer>
</body>
</html>`;
}

module.exports = { buildHtml };
