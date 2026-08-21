'use strict';

/**
 * Bygg payload till OpenAI Assistants runs.
 *
 * Vector store / file_search kopplas BARA när ett id skickas med.
 * Saknas id: tool_choice=none så assistentens egna file_search inte körs
 * (det är den stora tokenkostnaden).
 */
function resolveAssistantVectorStoreId(raw) {
  if (raw == null) return null;
  const id = String(raw).trim();
  return id || null;
}

function buildAssistantRunPayload({ assistantId, instructions, vectorStoreId } = {}) {
  const body = { assistant_id: assistantId };
  const instr = instructions == null ? '' : String(instructions).trim();
  if (instr) body.instructions = instr;

  const vs = resolveAssistantVectorStoreId(vectorStoreId);
  if (vs) {
    body.tools = [{ type: 'file_search' }];
    body.tool_resources = { file_search: { vector_store_ids: [vs] } };
  } else {
    body.tool_choice = 'none';
  }
  return body;
}

module.exports = {
  resolveAssistantVectorStoreId,
  buildAssistantRunPayload
};
