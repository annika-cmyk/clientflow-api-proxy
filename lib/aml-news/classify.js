const { CATEGORIES, SEVERITIES, emptyClassification, CLASSIFICATION_SCHEMA } = require('./schema');

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

function isValidClassification(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (!CATEGORIES.includes(raw.category)) return false;
  if (!SEVERITIES.includes(raw.severity)) return false;
  if (typeof raw.summary_sv !== 'string' || raw.summary_sv.trim().length < 20) return false;
  return true;
}

function buildClassificationPrompt(item) {
  return [
    'Klassificera denna AML/PTL-nyhet för svenska redovisningsbyråer.',
    'Svara ENDAST med giltig JSON enligt schemat. Ingen text utanför JSON.',
    'summary_sv ska vara en kort svensk sammanfattning med egna ord – inte nära parafras av källtexten.',
    'Sammanfattningen ersätter aldrig källan; den visas alltid tillsammans med länk.',
    '',
    `Källa: ${item.source}`,
    `Titel: ${item.title}`,
    `URL: ${item.source_url}`,
    `Publicerad: ${item.published_at || 'okänt'}`,
    `Text: ${String(item.raw_content || '').slice(0, 2500)}`,
    '',
    'JSON-schema:',
    JSON.stringify(CLASSIFICATION_SCHEMA)
  ].join('\n');
}

const CLASSIFY_INSTRUCTIONS =
  'Du klassificerar AML-nyheter för svenska redovisningsbyråer. Svara endast med giltig JSON enligt schemat. Ingen markdown.';

function heuristicClassify(item) {
  const hay = `${item.title || ''} ${item.raw_content || ''}`;
  let category = 'ovrigt';
  let severity = 'informativ';
  if (/2016\/1675|high-risk|högrisk|hogrisk|grey list|black list|call for action|increased monitoring|micar|mica\b/i.test(hay)) {
    category = 'hogriskstater';
    severity = /add|added|inför|krav|countermeasure/i.test(hay) ? 'kraver_atgard' : 'informativ';
  } else if (/ongoing monitoring|kundk[aä]nnedom|kyc|business-wide|bwra/i.test(hay)) {
    category = 'kundkannedom';
  } else if (/reporting suspicion|misstanke|sar\b/i.test(hay)) {
    category = 'rapporteringsrutiner';
    severity = 'kraver_atgard';
  } else if (/enforcing|lag|förordning|forordning|directive|delegated|riktlinje|guideline/i.test(hay)) {
    category = 'lagandring';
  } else if (/bygg|restaurang|jord|skog|bransch/i.test(hay)) {
    category = 'branschspecifik';
  }
  const summary = String(item.raw_content || item.title || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  return normalizeClassification({
    category,
    severity,
    summary_sv: summary.length >= 20 ? summary : `${item.title}. Se källan för detaljer och bedöm om byrån behöver agera.`,
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
  if (!isValidClassification(normalized)) {
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
  CLASSIFY_INSTRUCTIONS
};
