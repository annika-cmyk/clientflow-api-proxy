const crypto = require('crypto');

function contentHash(item) {
  const src = String(item.source || '').trim().toLowerCase();
  const url = String(item.source_url || '').trim().toLowerCase();
  const title = String(item.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const raw = String(item.raw_content || '').trim().slice(0, 2000);
  return crypto.createHash('sha256').update(`${src}\n${url}\n${title}\n${raw}`).digest('hex');
}

module.exports = { contentHash };
