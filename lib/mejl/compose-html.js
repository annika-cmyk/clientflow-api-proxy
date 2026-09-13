/**
 * Bygger HTML/text för utgående mejl: offentlig del, BankID-länk, Samarbete-länk, sidfot.
 */
const signature = require('./signature');
const samarbeteFragor = require('../samarbete-fragor');

function escapeHtml(s) {
  return signature.escapeHtml(s);
}

function textToHtmlParagraphs(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw
    .split(/\n{2,}/)
    .map((block) => {
      const inner = escapeHtml(block).replace(/\n/g, '<br />');
      return `<p style="margin:0 0 12px 0;line-height:1.55;color:#1f2937;">${inner}</p>`;
    })
    .join('');
}

function bankIdWallBlock(protectedUrl, opts = {}) {
  const url = String(protectedUrl || '').trim();
  if (!url) return '';
  const fileCount = Number(opts.fileCount || 0);
  const hasText = !!opts.hasText;
  let detail = 'Öppna länken och legitimera dig med BankID för att se det skyddade innehållet.';
  if (hasText && fileCount > 0) {
    detail = `Skyddad text och ${fileCount} fil${fileCount === 1 ? '' : 'er'} kräver BankID.`;
  } else if (fileCount > 0) {
    detail = `${fileCount} skyddad${fileCount === 1 ? '' : 'e'} fil${fileCount === 1 ? '' : 'er'} kräver BankID.`;
  } else if (hasText) {
    detail = 'En del av meddelandet är skyddad och kräver BankID.';
  }
  return `<div style="margin:16px 0;padding:14px 16px;border:1px solid #99f6e4;background:#f0fdfa;border-radius:8px;">
  <p style="margin:0 0 8px 0;font-size:14px;color:#0f766e;font-weight:700;">BankID-skyddat innehåll</p>
  <p style="margin:0 0 12px 0;font-size:13px;color:#134e4a;line-height:1.45;">${escapeHtml(detail)}</p>
  <a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">Öppna med BankID</a>
</div>`;
}

function samarbeteBlock(link, title) {
  const url = String(link || '').trim();
  if (!url) return '';
  const blocks = samarbeteFragor.buildEmailQuestionBlocks(title || '', escapeHtml);
  return `${blocks.html || ''}
<div style="margin:8px 0 16px 0;">
  <a href="${escapeHtml(url)}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">Lämna svar / underlag</a>
</div>`;
}

function buildOutgoingHtml(opts = {}) {
  const publicHtml = textToHtmlParagraphs(opts.publicText || '');
  const wall = bankIdWallBlock(opts.protectedUrl, {
    hasText: opts.protectedHasText,
    fileCount: opts.protectedFileCount
  });
  const sam = samarbeteBlock(opts.samarbeteUrl, opts.samarbeteTitle);
  const sig = signature.renderSignatureHtml(opts.signatureSettings || {});
  const parts = [publicHtml, wall, sam, sig].filter(Boolean);
  if (!parts.length) return '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;">${parts.join('\n')}</div>`;
}

function buildOutgoingText(opts = {}) {
  const lines = [];
  if (opts.publicText) lines.push(String(opts.publicText).trim());
  if (opts.protectedUrl) {
    lines.push('');
    lines.push('BankID-skyddat innehåll:');
    lines.push(String(opts.protectedUrl));
  }
  if (opts.samarbeteUrl) {
    lines.push('');
    lines.push('Lämna svar / underlag:');
    lines.push(String(opts.samarbeteUrl));
  }
  const sig = signature.plainTextSignature(opts.signatureSettings || {});
  if (sig) {
    lines.push('');
    lines.push('--');
    lines.push(sig);
  }
  return lines.join('\n').trim();
}

module.exports = {
  buildOutgoingHtml,
  buildOutgoingText,
  bankIdWallBlock,
  samarbeteBlock,
  textToHtmlParagraphs
};
