/**
 * Mejl-sidfot / HTML-signatur.
 * Fyra dispositionsmallar. Tomma fält renderas inte.
 * All text (namn, etiketter, länkar) är svart — logotypbilder behåller egna färger.
 */
const LAYOUTS = [
  'text-left-portrait-right',
  'portrait-left-text-right',
  'stacked-centered',
  'compact-inline'
];

/** Enhetlig textfärg för sidfot (preview + utgående mejl). */
const TEXT_COLOR = '#000000';

const DEFAULT_SETTINGS = {
  layout: 'text-left-portrait-right',
  name: '',
  title: '',
  phone: '',
  email: '',
  address: '',
  website: '',
  freeText: '',
  disclaimer: '',
  image1Url: '',
  image1DataUrl: '',
  image2Url: '',
  image2DataUrl: '',
  accentColor: TEXT_COLOR
};

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const layout = LAYOUTS.includes(src.layout) ? src.layout : DEFAULT_SETTINGS.layout;
  const out = { ...DEFAULT_SETTINGS, ...src, layout };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof DEFAULT_SETTINGS[key] === 'string' && out[key] != null) {
      out[key] = String(out[key]).trim();
    }
  }
  if (!LAYOUTS.includes(out.layout)) out.layout = DEFAULT_SETTINGS.layout;
  // Sidfotstext ska alltid vara svart (äldre sparade accentfärger ignoreras).
  out.accentColor = TEXT_COLOR;
  return out;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkifyWebsite(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function pickImage(settings, which) {
  const dataKey = which === 1 ? 'image1DataUrl' : 'image2DataUrl';
  const urlKey = which === 1 ? 'image1Url' : 'image2Url';
  return String(settings[dataKey] || settings[urlKey] || '').trim();
}

function contactLinesHtml(settings) {
  const rows = [];
  if (settings.name) {
    rows.push(
      `<div style="font-size:18px;font-weight:700;color:${TEXT_COLOR};line-height:1.3;margin:0 0 2px 0;">${escapeHtml(settings.name)}</div>`
    );
  }
  if (settings.title) {
    rows.push(
      `<div style="font-size:13px;font-weight:700;color:${TEXT_COLOR};margin:0 0 8px 0;">${escapeHtml(settings.title)}</div>`
    );
  }
  if (settings.phone) {
    rows.push(
      `<div style="font-size:13px;color:${TEXT_COLOR};margin:0 0 2px 0;"><strong>Telefon:</strong> ${escapeHtml(settings.phone)}</div>`
    );
  }
  if (settings.email) {
    rows.push(
      `<div style="font-size:13px;color:${TEXT_COLOR};margin:0 0 2px 0;"><strong>E-post:</strong> <a href="mailto:${escapeHtml(settings.email)}" style="color:${TEXT_COLOR};text-decoration:none;">${escapeHtml(settings.email)}</a></div>`
    );
  }
  if (settings.address) {
    rows.push(
      `<div style="font-size:13px;color:${TEXT_COLOR};margin:0 0 2px 0;">${escapeHtml(settings.address)}</div>`
    );
  }
  if (settings.website) {
    const href = linkifyWebsite(settings.website);
    const label = settings.website.replace(/^https?:\/\//i, '');
    rows.push(
      `<div style="font-size:13px;margin:0 0 2px 0;"><a href="${escapeHtml(href)}" style="color:${TEXT_COLOR};text-decoration:none;">${escapeHtml(label)}</a></div>`
    );
  }
  if (settings.freeText) {
    const free = escapeHtml(settings.freeText).replace(/\n/g, '<br />');
    rows.push(`<div style="font-size:13px;color:${TEXT_COLOR};margin:10px 0 0 0;line-height:1.45;">${free}</div>`);
  }
  return rows.join('');
}

function imgTag(src, opts = {}) {
  if (!src) return '';
  const size = opts.size || 88;
  const round = opts.round !== false;
  const style = [
    `width:${size}px`,
    `height:${size}px`,
    'object-fit:cover',
    'display:block',
    round ? 'border-radius:50%' : 'border-radius:6px'
  ].join(';');
  return `<img src="${escapeHtml(src)}" alt="" width="${size}" height="${size}" style="${style}" />`;
}

function logoTag(src) {
  if (!src) return '';
  return `<img src="${escapeHtml(src)}" alt="" style="max-height:36px;max-width:120px;display:block;object-fit:contain;" />`;
}

function disclaimerHtml(settings) {
  if (!settings.disclaimer) return '';
  const text = escapeHtml(settings.disclaimer).replace(/\n/g, '<br />');
  return `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #d1d5db;font-size:11px;color:${TEXT_COLOR};line-height:1.4;">${text}</div>`;
}

function renderSignatureHtml(rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const portrait = pickImage(settings, 1);
  const logo = pickImage(settings, 2);
  const contact = contactLinesHtml(settings);
  const hasContent = !!(contact || portrait || logo || settings.disclaimer);
  if (!hasContent) return '';
  const disc = disclaimerHtml(settings);
  const layout = settings.layout;

  if (layout === 'portrait-left-text-right') {
    return `<div style="font-family:Arial,Helvetica,sans-serif;margin-top:20px;padding-top:14px;border-top:1px solid #374151;color:${TEXT_COLOR};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      ${portrait ? `<td style="vertical-align:middle;padding-right:16px;">${imgTag(portrait)}</td>` : ''}
      <td style="vertical-align:middle;">${contact}${logo ? `<div style="margin-top:10px;">${logoTag(logo)}</div>` : ''}</td>
    </tr>
  </table>
  ${disc}
</div>`;
  }

  if (layout === 'stacked-centered') {
    return `<div style="font-family:Arial,Helvetica,sans-serif;margin-top:20px;padding-top:14px;border-top:1px solid #374151;text-align:center;color:${TEXT_COLOR};">
  ${portrait ? `<div style="display:inline-block;margin:0 0 12px 0;">${imgTag(portrait, { size: 96 })}</div>` : ''}
  <div style="text-align:center;">${contact}</div>
  ${logo ? `<div style="margin-top:12px;display:inline-block;">${logoTag(logo)}</div>` : ''}
  ${disc}
</div>`;
  }

  if (layout === 'compact-inline') {
    const bits = [];
    if (settings.name) bits.push(`<strong style="color:${TEXT_COLOR};">${escapeHtml(settings.name)}</strong>`);
    if (settings.title) bits.push(escapeHtml(settings.title));
    if (settings.phone) bits.push(escapeHtml(settings.phone));
    if (settings.email) {
      bits.push(
        `<a href="mailto:${escapeHtml(settings.email)}" style="color:${TEXT_COLOR};text-decoration:none;">${escapeHtml(settings.email)}</a>`
      );
    }
    if (settings.website) {
      const href = linkifyWebsite(settings.website);
      bits.push(
        `<a href="${escapeHtml(href)}" style="color:${TEXT_COLOR};text-decoration:none;">${escapeHtml(settings.website.replace(/^https?:\/\//i, ''))}</a>`
      );
    }
    return `<div style="font-family:Arial,Helvetica,sans-serif;margin-top:16px;padding-top:10px;border-top:1px solid #374151;font-size:12px;color:${TEXT_COLOR};line-height:1.5;">
  ${portrait ? `<span style="display:inline-block;vertical-align:middle;margin-right:10px;">${imgTag(portrait, { size: 40 })}</span>` : ''}
  <span style="vertical-align:middle;">${bits.join(' · ')}</span>
  ${settings.freeText ? `<div style="margin-top:6px;">${escapeHtml(settings.freeText).replace(/\n/g, '<br />')}</div>` : ''}
  ${settings.address ? `<div style="margin-top:4px;color:${TEXT_COLOR};">${escapeHtml(settings.address)}</div>` : ''}
  ${logo ? `<div style="margin-top:8px;">${logoTag(logo)}</div>` : ''}
  ${disc}
</div>`;
  }

  return `<div style="font-family:Arial,Helvetica,sans-serif;margin-top:20px;padding-top:14px;border-top:1px solid #374151;color:${TEXT_COLOR};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td style="vertical-align:middle;padding-right:18px;">${contact}${logo ? `<div style="margin-top:10px;">${logoTag(logo)}</div>` : ''}</td>
      ${portrait ? `<td style="vertical-align:middle;">${imgTag(portrait)}</td>` : ''}
    </tr>
  </table>
  ${disc}
</div>`;
}

function plainTextSignature(rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const lines = [];
  if (settings.name) lines.push(settings.name);
  if (settings.title) lines.push(settings.title);
  if (settings.phone) lines.push(`Telefon: ${settings.phone}`);
  if (settings.email) lines.push(`E-post: ${settings.email}`);
  if (settings.address) lines.push(settings.address);
  if (settings.website) lines.push(settings.website);
  if (settings.freeText) lines.push(settings.freeText);
  if (settings.disclaimer) lines.push(settings.disclaimer);
  return lines.join('\n');
}

module.exports = {
  LAYOUTS,
  DEFAULT_SETTINGS,
  TEXT_COLOR,
  normalizeSettings,
  renderSignatureHtml,
  plainTextSignature,
  escapeHtml
};
