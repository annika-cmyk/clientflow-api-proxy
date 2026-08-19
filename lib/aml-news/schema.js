/**
 * Datamodell för AML/PTL-nyheter (motsvarar migration).
 * ClientFlow lagrar i Airtable-tabellen AML-nyheter, inte Laravel/Postgres.
 */

const CATEGORIES = [
  'kundkannedom',
  'hogriskstater',
  'rapporteringsrutiner',
  'lagandring',
  'branschspecifik',
  'ovrigt'
];

const SEVERITIES = ['informativ', 'kraver_atgard'];
const RELEVANCE_TIERS = ['low', 'medium', 'high'];

const NEWS_TABLE = 'AML-nyheter';
const DIGEST_FIELD = 'AML-nyheter digest skickad';

const NEWS_FIELDS = [
  { name: 'source', type: 'singleLineText' },
  { name: 'source_url', type: 'singleLineText' },
  { name: 'title', type: 'singleLineText' },
  { name: 'published_at', type: 'singleLineText' },
  { name: 'raw_content', type: 'multilineText' },
  { name: 'fetched_at', type: 'singleLineText' },
  { name: 'content_hash', type: 'singleLineText' },
  { name: 'category', type: 'singleLineText' },
  { name: 'severity', type: 'singleLineText' },
  { name: 'summary_sv', type: 'multilineText' },
  { name: 'affected_industries', type: 'multilineText' },
  { name: 'affected_geography', type: 'multilineText' },
  { name: 'classified_at', type: 'singleLineText' },
  { name: 'classification_json', type: 'multilineText' }
];

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'severity', 'summary_sv', 'affected_industries', 'affected_geography'],
  properties: {
    category: { type: 'string', enum: CATEGORIES },
    severity: { type: 'string', enum: SEVERITIES },
    summary_sv: { type: 'string' },
    affected_industries: { type: 'array', items: { type: ['string', 'null'] } },
    affected_geography: { type: 'array', items: { type: ['string', 'null'] } }
  }
};

const CATEGORY_LABELS_SV = {
  kundkannedom: 'Kundkännedom',
  hogriskstater: 'Högriskstater',
  rapporteringsrutiner: 'Rapporteringsrutiner',
  lagandring: 'Lagändring',
  branschspecifik: 'Branschspecifik',
  ovrigt: 'Övrigt'
};

const SEVERITY_LABELS_SV = {
  informativ: 'Informativ',
  kraver_atgard: 'Kräver åtgärd'
};

const TIER_LABELS_SV = {
  low: 'Låg',
  medium: 'Medium',
  high: 'Hög'
};

const SOURCE_LABELS_SV = {
  amla: 'AMLA',
  eurlex: 'EUR-Lex',
  fatf: 'FATF',
  lansstyrelsen: 'Länsstyrelsen',
  finanspolisen: 'Finanspolisen',
  samordningsfunktionen: 'Samordningsfunktionen',
  revisorsinspektionen: 'Revisorsinspektionen',
  srf: 'SRF Konsulterna',
  skatteverket: 'Skatteverket',
  ekobrottsmyndigheten: 'Ekobrottsmyndigheten'
};

function emptyClassification() {
  return {
    category: 'ovrigt',
    severity: 'informativ',
    summary_sv: '',
    affected_industries: [],
    affected_geography: []
  };
}

module.exports = {
  CATEGORIES,
  SEVERITIES,
  RELEVANCE_TIERS,
  NEWS_TABLE,
  DIGEST_FIELD,
  NEWS_FIELDS,
  CLASSIFICATION_SCHEMA,
  CATEGORY_LABELS_SV,
  SEVERITY_LABELS_SV,
  TIER_LABELS_SV,
  SOURCE_LABELS_SV,
  emptyClassification
};
