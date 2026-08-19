function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TIER_SV = { high: 'Hög relevans', medium: 'Medium relevans' };
const SEV_SV = { kraver_atgard: 'Kräver åtgärd', informativ: 'Informativ' };

function itemLink(item) {
  return item.source_url || item.sourceUrl || '';
}

function itemSummary(item) {
  return item.summary_sv || item.summary || '';
}

function buildDigestEmail({ byraNamn, toName, items, feedUrl }) {
  const safeName = escapeHtml(toName || 'kollega');
  const safeByra = escapeHtml(byraNamn || 'er byrå');
  const rows = items || [];
  const listHtml = rows.map((it) => {
    const reasons = (it.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    return `
    <div style="margin:0 0 14px 0; padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
      <div style="font-size:0.75rem; color:#64748b; margin-bottom:4px;">${escapeHtml(TIER_SV[it.relevance_tier] || it.relevanceTier || '')} · ${escapeHtml(SEV_SV[it.severity] || it.severity || '')}</div>
      <div style="font-weight:600; color:#0f172a; margin-bottom:6px;">${escapeHtml(it.title)}</div>
      <div style="font-size:0.9rem; color:#334155; margin-bottom:8px;">${escapeHtml(itemSummary(it))}</div>
      ${reasons ? `<ul style="margin:0 0 8px 18px; padding:0; font-size:0.82rem; color:#475569;">${reasons}</ul>` : ''}
      <a href="${escapeHtml(itemLink(it))}" style="font-size:0.85rem; color:#6366f1; font-weight:600;">Öppna källa</a>
    </div>`;
  }).join('');

  const feedLine = feedUrl
    ? `<p style="margin:18px 0 0; font-size:0.9rem;"><a href="${escapeHtml(feedUrl)}" style="color:#6366f1; font-weight:600;">Öppna AML-nyheter i ClientFlow</a></p>`
    : '';

  const subject = `AML-nyheter för ${byraNamn || 'byrån'} – veckans urval`;
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif; background:#f0f4ff; color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f4ff;">
    <tr><td style="padding:32px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.08); overflow:hidden;">
        <tr><td style="padding:28px;">
          <p style="margin:0 0 10px 0; font-size:1rem; line-height:1.5; color:#334155;">Hej ${safeName},</p>
          <p style="margin:0 0 18px 0; font-size:1rem; line-height:1.5; color:#475569;">Här är veckans AML/PTL-nyheter som matchar byråprofilen för ${safeByra}. Sammanfattningarna är omskrivna och ersätter inte källan.</p>
          ${listHtml}
          ${feedLine}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `Hej ${toName || 'kollega'},`,
    '',
    `Veckans AML/PTL-nyheter för ${byraNamn || 'byrån'}:`,
    '',
    ...rows.map((it) => {
      const why = (it.reasons || []).map((r) => `  - ${r}`).join('\n');
      return `${it.title}\n${itemSummary(it)}\n${itemLink(it)}${why ? `\nVarför: \n${why}` : ''}`;
    }),
    feedUrl ? `\nÖppna i ClientFlow: ${feedUrl}` : ''
  ].filter(Boolean).join('\n\n');

  return { subject, html, text };
}

module.exports = { escapeHtml, buildDigestEmail };
