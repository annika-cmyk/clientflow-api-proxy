'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOvrigRetrievalQueries,
  formatKallaUtdragBlock,
  buildOvrigRepairPrompt,
  looksLikeModelRefusal,
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

  it('bygger mjuk repair-prompt som legitim PVML-dokumentation', () => {
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
    assert.match(prompt, /legitim compliance-dokumentation/i);
    assert.match(prompt, /PVML/);
    assert.match(prompt, /FATF-rapport/);
    assert.match(prompt, /Shopify/);
    assert.match(prompt, /ENDAST med ett giltigt JSON-objekt/);
    assert.doesNotMatch(prompt, /BEFINTLIGT INNEHÅLL/);
    assert.doesNotMatch(prompt, /FÅR INTE ÅTERANVÄNDAS/);
  });

  it('känner igen modellvägran vs JSON', () => {
    assert.equal(looksLikeModelRefusal("I'm sorry, I can't help with that."), true);
    assert.equal(looksLikeModelRefusal('Jag kan inte hjälpa till med det.'), true);
    assert.equal(looksLikeModelRefusal('{"beskrivning":"ok"}'), false);
    assert.equal(looksLikeModelRefusal(''), true);
  });
});
