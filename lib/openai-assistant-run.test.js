const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveAssistantVectorStoreId,
  resolveByraAnalysVectorStoreId,
  isResponsesConversationId,
  buildResponsesPayload,
  extractResponsesText,
  conversationIdFromResponse,
  DEFAULT_PTL_INSTRUCTIONS,
  BYRA_ANALYS_KUNSKAPSBAS_RULES
} = require('./openai-assistant-run');

describe('openai-assistant-run (Responses API)', () => {
  it('kopplar inte file_search när vector-id saknas', () => {
    assert.equal(resolveAssistantVectorStoreId(undefined), null);
    const body = buildResponsesPayload({
      instructions: 'Svara med JSON.',
      input: 'Hej',
      vectorStoreId: undefined,
      temperature: 0
    });
    assert.equal(body.model, 'gpt-4o');
    assert.equal(body.instructions, 'Svara med JSON.');
    assert.equal(body.input, 'Hej');
    assert.equal(body.tools, undefined);
    assert.equal(body.conversation, undefined);
    assert.equal(body.temperature, 0);
  });

  it('kopplar file_search bara när ett vector-id skickas med', () => {
    const body = buildResponsesPayload({
      input: 'Sök',
      vectorStoreId: ' vs_abc ',
      temperature: 0.2
    });
    assert.deepEqual(body.tools, [{ type: 'file_search', vector_store_ids: ['vs_abc'] }]);
    assert.equal(body.instructions, DEFAULT_PTL_INSTRUCTIONS);
  });

  it('återanvänder bara conv_-id, inte gamla thread_-id', () => {
    assert.equal(isResponsesConversationId('conv_abc123'), true);
    assert.equal(isResponsesConversationId('conv_abc-123_x'), true);
    assert.equal(isResponsesConversationId('thread_abc123'), false);
    const withConv = buildResponsesPayload({ input: 'x', conversationId: 'conv_abc123', temperature: 0 });
    assert.equal(withConv.conversation, 'conv_abc123');
    const legacy = buildResponsesPayload({ input: 'x', conversationId: 'thread_abc123', temperature: 0 });
    assert.equal(legacy.conversation, undefined);
  });

  it('läser textsvar från output_text eller output-meddelanden', () => {
    assert.equal(extractResponsesText({ output_text: '  Hej  ' }), 'Hej');
    assert.equal(extractResponsesText({
      output: [
        { type: 'file_search_call', id: 'fs1' },
        { type: 'message', content: [{ type: 'output_text', text: 'JSON-svar' }] }
      ]
    }), 'JSON-svar');
    assert.equal(conversationIdFromResponse({ conversation: { id: 'conv_xyz1' } }), 'conv_xyz1');
    assert.equal(conversationIdFromResponse({ conversation: 'conv_plain1' }), 'conv_plain1');
    assert.equal(conversationIdFromResponse({ conversation: 'thread_old' }), null);
  });

  it('väljer kunskapsbas för tjänst- och övrig-analys i rätt ordning', () => {
    const prev = {
      TJANST: process.env.OPENAI_VECTOR_STORE_ID_TJANST,
      S4: process.env.OPENAI_VECTOR_STORE_ID_BYRA_S4,
      DEFAULT: process.env.OPENAI_VECTOR_STORE_ID
    };
    const restore = () => {
      if (prev.TJANST == null) delete process.env.OPENAI_VECTOR_STORE_ID_TJANST;
      else process.env.OPENAI_VECTOR_STORE_ID_TJANST = prev.TJANST;
      if (prev.S4 == null) delete process.env.OPENAI_VECTOR_STORE_ID_BYRA_S4;
      else process.env.OPENAI_VECTOR_STORE_ID_BYRA_S4 = prev.S4;
      if (prev.DEFAULT == null) delete process.env.OPENAI_VECTOR_STORE_ID;
      else process.env.OPENAI_VECTOR_STORE_ID = prev.DEFAULT;
    };
    try {
      delete process.env.OPENAI_VECTOR_STORE_ID_TJANST;
      delete process.env.OPENAI_VECTOR_STORE_ID_BYRA_S4;
      delete process.env.OPENAI_VECTOR_STORE_ID;
      assert.equal(resolveByraAnalysVectorStoreId(), null);

      process.env.OPENAI_VECTOR_STORE_ID = 'vs_default';
      assert.equal(resolveByraAnalysVectorStoreId(), 'vs_default');

      process.env.OPENAI_VECTOR_STORE_ID_BYRA_S4 = 'vs_s4';
      assert.equal(resolveByraAnalysVectorStoreId(), 'vs_s4');

      process.env.OPENAI_VECTOR_STORE_ID_TJANST = ' vs_tjanst ';
      assert.equal(resolveByraAnalysVectorStoreId(), 'vs_tjanst');
    } finally {
      restore();
    }
    assert.match(BYRA_ANALYS_KUNSKAPSBAS_RULES, /file_search/);
    assert.match(BYRA_ANALYS_KUNSKAPSBAS_RULES, /inte en beskrivning av den här byrån/);
  });
});
