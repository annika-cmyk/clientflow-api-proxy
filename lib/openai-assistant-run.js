'use strict';

/**
 * OpenAI Responses API (ersätter Assistants API som stängs 26 aug 2026).
 *
 * File_search kopplas BARA när ett vector-id skickas med.
 * Chattens threadId är conversation-id (conv_...); gamla thread_-id ignoreras.
 */

const DEFAULT_PTL_INSTRUCTIONS =
  'Assistera med att skapa motiveringar för riskbedömningar av redovisningskunder. '
  + 'För kunder bedömda som högrisk, ge förslag på risksänkande åtgärder i enlighet med PTL '
  + 'och föreskrifter från Länsstyrelsen och polisen. Du ska också assistera med att göra '
  + 'redovisningsbyråernas allmänna riskbedömningar och skapa rutiner och policys.';

function resolveAssistantVectorStoreId(raw) {
  if (raw == null) return null;
  const id = String(raw).trim();
  return id || null;
}

function firstTrimmedEnv(...keys) {
  for (const key of keys) {
    const v = String(process.env[key] || '').trim();
    if (v) return v;
  }
  return null;
}

/**
 * Kunskapsbas för AI-analys av byråns tjänster och övriga riskfaktorer.
 * Dedikerad store om den finns, annars samma som sektion 4 / chatten.
 */
function resolveByraAnalysVectorStoreId() {
  return firstTrimmedEnv(
    'OPENAI_VECTOR_STORE_ID_TJANST',
    'OPENAI_VECTOR_STORE_ID_BYRA_S4',
    'OPENAI_VECTOR_STORE_ID'
  );
}

const BYRA_ANALYS_KUNSKAPSBAS_RULES = `KUNSKAPSBAS (vector store / file_search):
- Gör 1–2 sökningar efter vägledning som gäller just denna tjänst eller riskfaktor (Länsstyrelsen, FATF, Polisen, Säpo, Samordningsfunktionen, Skatteverket).
- Prioritera vägledning riktad till redovisningskonsulter och skatterådgivare — inte banksektorns AML-handböcker.
- Använd träffarna för att grunda hot, TF-typologier, åtgärder och källhänvisningar. Hitta inte på webbadresser.
- Kunskapsbasen är generell myndighetsvägledning — inte en beskrivning av den här byrån. Skriv inte in byråns namn, storlek, personal eller kapacitet i beskrivningen.
- Om sökningen inte ger relevant träff: fortsätt utifrån namnet och källistan i prompten.`;

function resolveResponsesModel(raw) {
  const fromArg = raw == null ? '' : String(raw).trim();
  if (fromArg) return fromArg;
  const fromEnv = String(process.env.OPENAI_MODEL || '').trim();
  return fromEnv || 'gpt-4o';
}

function resolveResponsesInstructions(raw) {
  const fromArg = raw == null ? '' : String(raw).trim();
  if (fromArg) return fromArg;
  const fromEnv = String(process.env.OPENAI_INSTRUCTIONS || '').trim();
  return fromEnv || DEFAULT_PTL_INSTRUCTIONS;
}

function isResponsesConversationId(raw) {
  return /^conv_[A-Za-z0-9_-]+$/.test(String(raw || '').trim());
}

function resolveResponsesTemperature(raw) {
  if (raw != null && raw !== '' && isFinite(Number(raw))) return Number(raw);
  const fromEnv = process.env.OPENAI_TEMPERATURE;
  if (fromEnv != null && String(fromEnv).trim() !== '' && isFinite(Number(fromEnv))) {
    return Number(fromEnv);
  }
  return 0.62;
}

function buildResponsesPayload({
  model,
  instructions,
  input,
  vectorStoreId,
  conversationId,
  temperature
} = {}) {
  const body = {
    model: resolveResponsesModel(model),
    instructions: resolveResponsesInstructions(instructions),
    input: input == null ? '' : String(input),
    temperature: resolveResponsesTemperature(temperature),
    store: true
  };

  const vs = resolveAssistantVectorStoreId(vectorStoreId);
  if (vs) {
    body.tools = [{ type: 'file_search', vector_store_ids: [vs] }];
  }

  const conv = String(conversationId || '').trim();
  if (isResponsesConversationId(conv)) body.conversation = conv;

  return body;
}

/** Bakåtkompatibelt namn — samma som buildResponsesPayload utan input. */
function buildAssistantRunPayload(opts = {}) {
  return buildResponsesPayload(opts);
}

function extractResponsesText(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const parts = [];
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || item.type !== 'message') continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const block of content) {
      if (!block) continue;
      if (block.type === 'output_text' || block.type === 'text') {
        if (typeof block.text === 'string') parts.push(block.text);
        else if (block.text && typeof block.text.value === 'string') parts.push(block.text.value);
      }
    }
  }
  return parts.join('\n').trim();
}

function conversationIdFromResponse(data) {
  if (!data || typeof data !== 'object') return null;
  const raw = data.conversation;
  if (typeof raw === 'string' && isResponsesConversationId(raw)) return raw.trim();
  if (raw && typeof raw.id === 'string' && isResponsesConversationId(raw.id)) return raw.id.trim();
  return null;
}

module.exports = {
  DEFAULT_PTL_INSTRUCTIONS,
  BYRA_ANALYS_KUNSKAPSBAS_RULES,
  resolveAssistantVectorStoreId,
  resolveByraAnalysVectorStoreId,
  resolveResponsesModel,
  resolveResponsesInstructions,
  resolveResponsesTemperature,
  isResponsesConversationId,
  buildResponsesPayload,
  buildAssistantRunPayload,
  extractResponsesText,
  conversationIdFromResponse
};
