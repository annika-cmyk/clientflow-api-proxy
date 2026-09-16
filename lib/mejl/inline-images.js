'use strict';

/**
 * Gör mejl-HTML säker för Gmail: byt data:image-URL:er mot cid:-referenser
 * så bilder kan skickas som inline MIME-delar (Gmail strippar ofta data-URL:er).
 */

function parseDataImageUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(raw);
  if (!m) return null;
  return {
    contentType: m[1].toLowerCase(),
    dataBase64: m[2].replace(/\s+/g, '')
  };
}

/**
 * @param {string} html
 * @returns {{ html: string, inlineImages: Array<{cid:string,contentType:string,dataBase64:string}> }}
 */
function rewriteDataImagesToCid(html) {
  const src = String(html || '');
  if (!src.includes('data:image')) {
    return { html: src, inlineImages: [] };
  }
  const inlineImages = [];
  let n = 0;
  const rewritten = src.replace(
    /(<img\b[^>]*?\bsrc=")(data:image\/[^"]+)(")/gi,
    (full, pre, dataUrl, post) => {
      const parsed = parseDataImageUrl(dataUrl);
      if (!parsed || !parsed.dataBase64) return full;
      n += 1;
      const cid = `cf-sig-${n}@clientflow.local`;
      inlineImages.push({
        cid,
        contentType: parsed.contentType,
        dataBase64: parsed.dataBase64
      });
      return `${pre}cid:${cid}${post}`;
    }
  );
  return { html: rewritten, inlineImages };
}

module.exports = {
  parseDataImageUrl,
  rewriteDataImagesToCid
};
