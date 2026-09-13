/**
 * Tunna wrappers mot Gmail API.
 */
const axios = require('axios');

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json'
  };
}

async function getProfile(accessToken) {
  const res = await axios.get(`${GMAIL_BASE}/profile`, {
    headers: authHeaders(accessToken),
    timeout: 15000
  });
  return res.data;
}

/**
 * Gmail users.history.list – ändringar sedan startHistoryId.
 * Paginerar tills nextPageToken tar slut.
 */
async function listHistory(accessToken, { startHistoryId, historyTypes, labelId, maxResults = 100 } = {}) {
  if (!startHistoryId) {
    const err = new Error('startHistoryId saknas');
    err.code = 'MISSING_HISTORY_ID';
    throw err;
  }
  const all = [];
  let pageToken = null;
  let historyId = null;
  let pages = 0;
  do {
    const params = {
      startHistoryId: String(startHistoryId),
      maxResults: Math.min(Number(maxResults) || 100, 500)
    };
    if (labelId) params.labelId = labelId;
    if (historyTypes && historyTypes.length) params.historyTypes = historyTypes;
    if (pageToken) params.pageToken = pageToken;
    const res = await axios.get(`${GMAIL_BASE}/history`, {
      headers: authHeaders(accessToken),
      params,
      timeout: 30000
    });
    const batch = res.data.history || [];
    all.push(...batch);
    if (res.data.historyId) historyId = String(res.data.historyId);
    pageToken = res.data.nextPageToken || null;
    pages += 1;
  } while (pageToken && pages < 20);
  return {
    history: all,
    historyId,
    resultSizeEstimate: all.length
  };
}

async function listLabels(accessToken) {
  const res = await axios.get(`${GMAIL_BASE}/labels`, {
    headers: authHeaders(accessToken),
    timeout: 20000
  });
  return (res.data.labels || []).map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    messagesTotal: l.messagesTotal,
    messagesUnread: l.messagesUnread
  }));
}

async function listMessages(accessToken, { q, labelIds, maxResults = 50, pageToken } = {}) {
  const params = { maxResults: Math.min(Number(maxResults) || 50, 100) };
  if (q) params.q = q;
  if (labelIds && labelIds.length) params.labelIds = labelIds;
  if (pageToken) params.pageToken = pageToken;
  const res = await axios.get(`${GMAIL_BASE}/messages`, {
    headers: authHeaders(accessToken),
    params,
    timeout: 25000
  });
  return {
    messages: res.data.messages || [],
    nextPageToken: res.data.nextPageToken || null,
    resultSizeEstimate: res.data.resultSizeEstimate || 0
  };
}

async function getMessage(accessToken, messageId, format = 'full') {
  const res = await axios.get(`${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}`, {
    headers: authHeaders(accessToken),
    params: { format },
    timeout: 25000
  });
  return res.data;
}

function headerMap(payload) {
  const headers = (payload && payload.headers) || [];
  const map = {};
  for (const h of headers) {
    if (!h || !h.name) continue;
    map[String(h.name).toLowerCase()] = h.value || '';
  }
  return map;
}

function decodeBodyData(data) {
  if (!data) return '';
  const normalized = String(data).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function collectBodies(part, acc = { text: '', html: '' }) {
  if (!part) return acc;
  const mime = String(part.mimeType || '').toLowerCase();
  if (part.body && part.body.data) {
    const decoded = decodeBodyData(part.body.data);
    if (mime === 'text/plain' && !acc.text) acc.text = decoded;
    if (mime === 'text/html' && !acc.html) acc.html = decoded;
  }
  for (const child of part.parts || []) {
    collectBodies(child, acc);
  }
  return acc;
}


function collectAttachments(part, acc = []) {
  if (!part) return acc;
  const filename = part.filename ? String(part.filename).trim() : '';
  const attId = part.body && part.body.attachmentId;
  if (filename && attId) {
    acc.push({
      filename,
      mimeType: part.mimeType || 'application/octet-stream',
      size: Number(part.body.size) || 0,
      attachmentId: attId
    });
  }
  for (const child of part.parts || []) {
    collectAttachments(child, acc);
  }
  return acc;
}

async function getAttachment(accessToken, messageId, attachmentId) {
  const res = await axios.get(
    `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: authHeaders(accessToken), timeout: 60000 }
  );
  const data = res.data && res.data.data;
  if (!data) return Buffer.alloc(0);
  const normalized = String(data).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

function summarizeMessage(raw) {
  const headers = headerMap(raw.payload || {});
  const bodies = collectBodies(raw.payload || {});
  const attachments = collectAttachments(raw.payload || []);
  const snippet = raw.snippet || '';
  return {
    id: raw.id,
    threadId: raw.threadId,
    labelIds: raw.labelIds || [],
    internalDate: raw.internalDate ? Number(raw.internalDate) : null,
    snippet,
    subject: headers.subject || '(utan ämne)',
    from: headers.from || '',
    to: headers.to || '',
    cc: headers.cc || '',
    date: headers.date || '',
    messageIdHeader: headers['message-id'] || '',
    inReplyTo: headers['in-reply-to'] || '',
    text: bodies.text || '',
    html: bodies.html || '',
    attachments
  };
}

function buildRawMime({ from, to, subject, text, html, inReplyTo, references, threadId }) {
  const boundary = `cf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const lines = [];
  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  if (html) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(text || '');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(html);
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('');
    lines.push(text || '');
  }
  const raw = lines.join('\r\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendMessage(accessToken, { from, to, subject, text, html, inReplyTo, references, threadId, labelIds }) {
  const raw = buildRawMime({ from, to, subject, text, html, inReplyTo, references, threadId });
  const body = { raw };
  if (threadId) body.threadId = threadId;
  const res = await axios.post(`${GMAIL_BASE}/messages/send`, body, {
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
  const sentId = res.data && res.data.id;
  if (sentId && labelIds && labelIds.length) {
    try {
      await axios.post(
        `${GMAIL_BASE}/messages/${encodeURIComponent(sentId)}/modify`,
        { addLabelIds: labelIds },
        {
          headers: {
            ...authHeaders(accessToken),
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
    } catch (err) {
      console.warn('Gmail: kunde inte sätta etikett på skickat mejl:', err.message);
    }
  }
  return res.data;
}

async function createLabel(accessToken, name) {
  const res = await axios.post(
    `${GMAIL_BASE}/labels`,
    {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show'
    },
    {
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
  return res.data;
}

/** Flytta mejl till papperskorgen (Gmail users.messages.trash). */
async function trashMessage(accessToken, messageId) {
  const res = await axios.post(
    `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}/trash`,
    {},
    {
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );
  return res.data;
}

/** Ändra etiketter på ett mejl (Gmail users.messages.modify). */
async function modifyMessageLabels(accessToken, messageId, { addLabelIds = [], removeLabelIds = [] } = {}) {
  const body = {};
  if (addLabelIds && addLabelIds.length) body.addLabelIds = addLabelIds;
  if (removeLabelIds && removeLabelIds.length) body.removeLabelIds = removeLabelIds;
  if (!body.addLabelIds && !body.removeLabelIds) {
    // No-op: return current message metadata
    return getMessage(accessToken, messageId, 'metadata');
  }
  const res = await axios.post(
    `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}/modify`,
    body,
    {
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );
  return res.data;
}

module.exports = {
  getProfile,
  listHistory,
  listLabels,
  listMessages,
  getMessage,
  getAttachment,
  trashMessage,
  modifyMessageLabels,
  summarizeMessage,
  collectAttachments,
  collectBodies,
  sendMessage,
  createLabel,
  buildRawMime,
  headerMap
};
