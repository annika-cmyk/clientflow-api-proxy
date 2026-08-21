const { CATEGORIES, SEVERITIES, emptyClassification, CLASSIFICATION_SCHEMA } = require('./schema');
const { clipSentences } = require('./sources/html');

function cleanList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v) => (v == null ? '' : String(v).trim().toLowerCase().replace(/\s+/g, '_')))
    .filter(Boolean);
}

function normalizeClassification(raw) {
  const base = emptyClassification();
  const src = raw && typeof raw === 'object' ? raw : {};
  const category = CATEGORIES.includes(src.category) ? src.category : 'ovrigt';
  const severity = SEVERITIES.includes(src.severity) ? src.severity : 'informativ';
  const summary = String(src.summary_sv || '').replace(/\s+/g, ' ').trim();
  return {
    category,
    severity,
    summary_sv: summary,
    affected_industries: cleanList(src.affected_industries),
    affected_geography: cleanList(src.affected_geography)
  };
}

function isValidClassification(raw, item) {
  if (!raw || typeof raw !== 'object') return false;
  if (!CATEGORIES.includes(raw.category)) return false;
  if (!SEVERITIES.includes(raw.severity)) return false;
  if (typeof raw.summary_sv !== 'string' || raw.summary_sv.trim().length < 60) return false;
  if (item && isThinSummary({ title: item.title, summary_sv: raw.summary_sv })) return false;
  if (item && item.raw_content && isSourceExcerpt({
    title: item.title,
    summary_sv: raw.summary_sv,
    raw_content: item.raw_content
  })) return false;
  return true;
}

function buildClassificationPrompt(item) {
  return [
    'Läs artikeln och skriv en sammanfattning till användare i ClientFlow.',
    'Målgruppen är personal på små och medelstora svenska redovisningsbyråer: redovisningskonsulter, byråledare och centralt funktionsansvariga.',
    'Svara ENDAST med giltig JSON enligt schemat. Ingen text utanför JSON.',
    '',
    'Krav på summary_sv:',
    '- 2–4 korta meningar på begriplig svenska (cirka 350–700 tecken).',
    '- Egna ord. Kopiera inte rubrik, ingress eller menytext.',
    '- Förklara vad som hänt och vad det kan betyda för byråns PTL-arbete (kundkännedom, riskbedömning, uppdrag, rapportering).',
    '- Tilltala med "ni" eller "byrån". Skriv inte som om läsaren är revisor, om det inte uttryckligen gäller revisorsplikt.',
    '- Ingen EU-jargong utan vanlig förklaring. Inga uppmaningar att "klicka här".',
    '- Om nyheten knappt rör en redovisningsbyrå: säg det tydligt och kort.',
    '- Sammanfattningen ersätter inte källan; länken visas alltid.',
    '',
    `Källa: ${item.source}`,
    `Titel: ${item.title}`,
    `URL: ${item.source_url}`,
    `Publicerad: ${item.published_at || 'okänt'}`,
    `Artikeltext: ${String(item.raw_content || '').slice(0, 4000)}`,
    '',
    'JSON-schema:',
    JSON.stringify(CLASSIFICATION_SCHEMA)
  ].join('\n');
}

const CLASSIFY_INSTRUCTIONS =
  'Du skriver AML/PTL-sammanfattningar för ClientFlow, riktade till små svenska redovisningsbyråer. Svara endast med giltig JSON. Ingen markdown.';

const SOURCE_CATEGORY = {
  finanspolisen: 'rapporteringsrutiner',
  skatteverket: 'lagandring',
  srf: 'branschspecifik',
  revisorsinspektionen: 'lagandring',
  lansstyrelsen: 'lagandring',
  samordningsfunktionen: 'lagandring',
  ekobrottsmyndigheten: 'rapporteringsrutiner',
  eurlex: 'hogriskstater',
  fatf: 'hogriskstater',
  amla: 'lagandring'
};

function normalizeComparable(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isSourceExcerpt(item) {
  const summary = normalizeComparable(item && (item.summary_sv || item.summary));
  const raw = normalizeComparable(item && item.raw_content);
  if (!summary) return true;
  if (!raw || raw.length < 40) return false;
  const head = summary.slice(0, Math.min(90, summary.length));
  if (head.length >= 40 && raw.includes(head)) return true;
  const rawHead = raw.slice(0, Math.min(90, raw.length));
  return rawHead.length >= 40 && summary.includes(rawHead);
}

function needsAiSummary(item) {
  if (!item) return true;
  if (item.classified_at && !isThinSummary(item) && !isSourceExcerpt(item)) return false;
  return true;
}

function isThinSummary(item) {
  const title = normalizeComparable(item && item.title);
  const summary = normalizeComparable(item && (item.summary_sv || item.summary));
  if (!summary) return true;
  if (summary.length < 40) return true;
  if (!title) return false;
  if (summary === title) return true;
  if (title.startsWith(summary) || summary.startsWith(title)) {
    return Math.abs(summary.length - title.length) < 40;
  }
  return false;
}

function excerptSummary(item, max = 800) {
  const title = String(item.title || '').replace(/\s+/g, ' ').trim();
  let body = String(item.raw_content || '').replace(/\s+/g, ' ').trim();
  if (body && title && normalizeComparable(body).startsWith(normalizeComparable(title))) {
    body = body.slice(title.length).replace(/^[\s.:–—-]+/, '').trim();
  }
  if (!body || isThinSummary({ title, summary_sv: body })) {
    return title
      ? `${title}. Öppna källan för hela artikeln och bedöm om byrån behöver agera.`
      : 'Se källan för detaljer och bedöm om byrån behöver agera.';
  }
  return clipSentences(body, max);
}

function heuristicClassify(item) {
  const hay = `${item.title || ''} ${item.raw_content || ''}`;
  let category = SOURCE_CATEGORY[item.source] || 'ovrigt';
  let severity = 'informativ';
  if (/2016\/1675|high-risk|högrisk|hogrisk|grey list|black list|call for action|increased monitoring|micar|mica\b/i.test(hay)) {
    category = 'hogriskstater';
    severity = /add|added|inför|krav|countermeasure/i.test(hay) ? 'kraver_atgard' : 'informativ';
  } else if (/omv[aä]rldsbevak|nationell riskbed|national risk assessment/i.test(hay)) {
    category = 'lagandring';
  } else if (/ongoing monitoring|kundk[aä]nnedom|kyc|business-wide|bwra/i.test(hay)) {
    category = 'kundkannedom';
  } else if (/reporting suspicion|misstanke|sar\b|finanspolis/i.test(hay)) {
    category = 'rapporteringsrutiner';
    severity = 'kraver_atgard';
  } else if (/enforcing|lag|förordning|forordning|directive|delegated|riktlinje|guideline|skatteverk/i.test(hay)) {
    category = 'lagandring';
  } else if (/bygg|restaurang|jord|skog|bransch|srf/i.test(hay)) {
    category = 'branschspecifik';
  }
  const summary = excerptSummary(item, 800);
  return normalizeClassification({
    category,
    severity,
    summary_sv: summary,
    affected_industries: [],
    affected_geography: category === 'hogriskstater' ? [] : ['se']
  });
}

async function classifyItem(item, opts = {}) {
  if (typeof opts.completeJson !== 'function') {
    throw new Error('classifyItem kräver completeJson (en enda LLM-anrop, ingen agentloop)');
  }
  const raw = await opts.completeJson({
    prompt: buildClassificationPrompt(item),
    instructions: CLASSIFY_INSTRUCTIONS,
    schema: CLASSIFICATION_SCHEMA
  });
  const normalized = normalizeClassification(raw);
  if (!isValidClassification(normalized, item)) {
    throw new Error('Ogiltig klassificering från LLM');
  }
  return {
    ...normalized,
    classified_at: opts.classifiedAt || new Date().toISOString()
  };
}

module.exports = {
  normalizeClassification,
  isValidClassification,
  buildClassificationPrompt,
  classifyItem,
  heuristicClassify,
  isThinSummary,
  isSourceExcerpt,
  needsAiSummary,
  excerptSummary,
  CLASSIFY_INSTRUCTIONS
};
