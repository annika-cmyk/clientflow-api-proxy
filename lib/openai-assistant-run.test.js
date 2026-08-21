const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveAssistantVectorStoreId,
  buildAssistantRunPayload
} = require('./openai-assistant-run');

describe('openai-assistant-run', () => {
  it('kopplar inte vector store när id saknas, är tomt eller undefined', () => {
    assert.equal(resolveAssistantVectorStoreId(undefined), null);
    assert.equal(resolveAssistantVectorStoreId(null), null);
    assert.equal(resolveAssistantVectorStoreId(''), null);
    assert.equal(resolveAssistantVectorStoreId('   '), null);

    const body = buildAssistantRunPayload({
      assistantId: 'asst_test',
      instructions: 'Svara med JSON.',
      vectorStoreId: undefined
    });
    assert.equal(body.assistant_id, 'asst_test');
    assert.equal(body.instructions, 'Svara med JSON.');
    assert.equal(body.tool_choice, 'none');
    assert.equal(body.tool_resources, undefined);
    assert.equal(body.tools, undefined);
  });

  it('kopplar file_search bara när ett vector-id skickas med', () => {
    const body = buildAssistantRunPayload({
      assistantId: 'asst_test',
      vectorStoreId: ' vs_abc '
    });
    assert.deepEqual(body.tools, [{ type: 'file_search' }]);
    assert.deepEqual(body.tool_resources, {
      file_search: { vector_store_ids: ['vs_abc'] }
    });
    assert.equal(body.tool_choice, undefined);
  });
});
