'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOvrigRetrievalQueries,
  formatKallaUtdragBlock,
  buildOvrigRepairPrompt,
  extractTopicTerms,
  FALLBACK_KALLOR
} = require('./ai-vector-retrieve');

describe('ai-vector-retrieve', () => {
  it('bygger ämnesqueries — inte hela «Byrån har kunder…»-meningen', () => {
    const q = buildOvrigRetrievalQueries(
      'Byrån har kunder inom högriskbranschen Smycken/antikviteter',
      'Shopify, Portugal, UK, Schweiz, styckpris 1500'
    );
    assert.ok(q.length >= 2);
    q.forEach((query) => {
      assert.doesNotMatch(query, /^Byrån har kunder/i);
      assert.match(query, /smycken|varuhandlare|penningtvätt|Samordningsfunktionen/i);
    });
  });

  it('extraherar topic-termer från smycken + Shopify-underlag', () => {
    const terms = extractTopicTerms(
      'Byrån har kunder inom högriskbranschen Smycken/antikviteter',
      'Shopify och återförsäljare i Schweiz'
    );
    assert.ok(terms.includes('smycken'));
    assert.ok(terms.includes('varuhandlare') || terms.includes('webshop'));
  });

  it('formaterar KÄLLUTDRAG-block', () => {
    const block = formatKallaUtdragBlock(FALLBACK_KALLOR.slice(0, 2));
    assert.match(block, /KÄLLUTDRAG/);
    assert.match(block, /varuhandlare/i);
    assert.match(block, /FATF-rapport/);
  });

  it('bygger kort repair-prompt utan gammalt ankare', () => {
    const prompt = buildOvrigRepairPrompt({
      riskfaktor: 'Smycken/antikviteter',
      typ: 'Bransch',
      extraUnderlag: 'Shopify, Portugal, 1500 kr',
      kallaBlock: 'KÄLLUTDRAG:\n1. NRA…',
      violations: [{ id: 'vag_kalla', message: 'Källor är för vaga' }],
      rejectedPayload: {
        beskrivning: 'högt värde',
        hot: [{ titel: 'Användning av smycken', kalla: 'FATF-rapport om penningtvätt' }]
      }
    });
    assert.match(prompt, /UNDERKÄNT OCH FÅR INTE ÅTERANVÄNDAS/);
    assert.match(prompt, /FATF-rapport/);
    assert.match(prompt, /Shopify/);
    assert.doesNotMatch(prompt, /BEFINTLIGT INNEHÅLL/);
  });
});
