/**
 * Samarbete-frågor: offentlig (i mejl) vs BankID-skyddad.
 *
 * Encoding i Titel (en rad per fråga):
 *   "1. Kontoutdrag [fil obligatorisk]"
 *   "2. [bankid] Personuppgifter för huvudman"
 *   "3. [bankid] Ägarförhållanden [fil obligatorisk]"
 */

const FILE_MARKER = '[fil obligatorisk]';
const BANKID_MARKER = '[bankid]';

function stripLeadingNumber(line) {
  return String(line || '').replace(/^\d+\.\s*/, '').trim();
}

/**
 * @param {string} title
 * @returns {Array<{ index: number, text: string, fileRequired: boolean, requiresBankId: boolean }>}
 */
function parseQuestions(title) {
  const raw = String(title || '').trim();
  if (!raw) return [];
  const lines = raw.split('\n').map((s) => stripLeadingNumber(s)).filter(Boolean);
  return lines.map((line, index) => {
    let text = line;
    let fileRequired = false;
    let requiresBankId = false;
    if (/\s*\[fil obligatorisk\]\s*$/i.test(text)) {
      fileRequired = true;
      text = text.replace(/\s*\[fil obligatorisk\]\s*$/i, '').trim();
    }
    if (/^\[bankid\]\s*/i.test(text)) {
      requiresBankId = true;
      text = text.replace(/^\[bankid\]\s*/i, '').trim();
    } else if (/\s*\[bankid\]\s*$/i.test(text)) {
      requiresBankId = true;
      text = text.replace(/\s*\[bankid\]\s*$/i, '').trim();
    }
    return { index, text, fileRequired, requiresBankId };
  });
}

/**
 * @param {Array<{ text: string, fileRequired?: boolean, requiresBankId?: boolean }>} items
 */
function encodeQuestions(items) {
  const list = Array.isArray(items) ? items : [];
  const lines = list
    .map((it) => {
      const text = String((it && it.text) || '').trim();
      if (!text) return '';
      const bankid = it && it.requiresBankId ? `${BANKID_MARKER} ` : '';
      const file = it && it.fileRequired ? ` ${FILE_MARKER}` : '';
      return `${bankid}${text}${file}`;
    })
    .filter(Boolean);
  if (lines.length === 1) return lines[0];
  return lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
}

function splitPublicAndBankId(questions) {
  const all = Array.isArray(questions) ? questions : [];
  return {
    publicQuestions: all.filter((q) => !q.requiresBankId),
    bankIdQuestions: all.filter((q) => q.requiresBankId)
  };
}

/**
 * HTML-block till mejl: offentliga frågor i klartext, BankID bara som teaser.
 */
function buildEmailQuestionBlocks(title, escapeHtml) {
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
  const questions = parseQuestions(title);
  const { publicQuestions, bankIdQuestions } = splitPublicAndBankId(questions);

  const publicLines = publicQuestions.map((q, i) => {
    const n = publicQuestions.length > 1 ? `${i + 1}. ` : '';
    const file = q.fileRequired ? ' (fil krävs)' : '';
    return esc(`${n}${q.text}${file}`);
  });

  let html = '';
  if (publicLines.length) {
    html += `<p style="margin:0 0 16px 0; font-size:0.9rem; color:#64748b; background:#f8fafc; padding:12px 16px; border-radius:8px; line-height:1.6;">${publicLines.join('<br />')}</p>`;
  }
  if (bankIdQuestions.length) {
    const n = bankIdQuestions.length;
    const label = n === 1
      ? '1 fråga kräver identifiering med BankID'
      : `${n} frågor kräver identifiering med BankID`;
    html += `<p style="margin:0 0 24px 0; font-size:0.9rem; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; padding:12px 16px; border-radius:8px; line-height:1.5;">
      <strong style="display:block; margin-bottom:4px;">${esc(label)}</strong>
      Dessa frågor visas först när du öppnar länken och identifierar dig med BankID. Då vet byrån säkert att det är du som svarat.
    </p>`;
  }
  if (!html && String(title || '').trim()) {
    // Fallback: visa hela titeln om parsing av någon anledning blir tom
    const fallback = String(title).split('\n').map((l) => esc(l.trim())).filter(Boolean).join('<br />');
    html = `<p style="margin:0 0 24px 0; font-size:0.9rem; color:#64748b; background:#f8fafc; padding:12px 16px; border-radius:8px; line-height:1.6;">${fallback}</p>`;
  }
  return {
    html,
    publicCount: publicQuestions.length,
    bankIdCount: bankIdQuestions.length,
    questions
  };
}

/**
 * För offentlig API: dölj BankID-frågetext tills session finns.
 */
function questionsForPublicApi(questions, bankIdVerified) {
  return (questions || []).map((q) => {
    if (!q.requiresBankId || bankIdVerified) {
      return {
        index: q.index,
        text: q.text,
        fileRequired: !!q.fileRequired,
        requiresBankId: !!q.requiresBankId,
        locked: false
      };
    }
    return {
      index: q.index,
      text: 'Skyddad fråga – identifiera dig med BankID för att se och besvara',
      fileRequired: !!q.fileRequired,
      requiresBankId: true,
      locked: true
    };
  });
}

module.exports = {
  FILE_MARKER,
  BANKID_MARKER,
  parseQuestions,
  encodeQuestions,
  splitPublicAndBankId,
  buildEmailQuestionBlocks,
  questionsForPublicApi
};
