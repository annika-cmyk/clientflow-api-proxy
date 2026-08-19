function extractFirstJsonObject(text) {
  if (!text) return null;
  const start = String(text).indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return String(text).slice(start, i + 1);
    }
  }
  return null;
}

function stripCodeFences(text) {
  if (!text) return '';
  let t = String(text).replace(/^\uFEFF/, '').trim();
  if (/^```/m.test(t)) {
    t = t.replace(/```[a-zA-Z0-9_-]*\s*/g, '```');
    t = t.replace(/^```/g, '').replace(/```$/g, '').trim();
  }
  return t.trim();
}

function parseAssistantJson(rawText) {
  const cleaned = stripCodeFences(rawText);
  const jsonCandidate = extractFirstJsonObject(cleaned) || extractFirstJsonObject(rawText) || cleaned || rawText || '';
  try {
    return JSON.parse(jsonCandidate);
  } catch (e) {
    const preview = String(jsonCandidate).slice(0, 180);
    const err = new Error(`Kunde inte tolka AI-svar som JSON. Förhandsvisning: ${preview}${String(jsonCandidate).length > 180 ? '…' : ''}`);
    err.cause = e;
    throw err;
  }
}

module.exports = { extractFirstJsonObject, stripCodeFences, parseAssistantJson };
