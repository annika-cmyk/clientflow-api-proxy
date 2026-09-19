const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mejlDeepLink,
  extractMejlLink,
  appendMejlLink,
  stripMejlLinkLine
} = require('./mejl-link');

describe('mejl-link', () => {
  it('bygger djuplänk med message id', () => {
    assert.equal(mejlDeepLink('18abc'), 'mejl.html?messageId=18abc');
    assert.equal(mejlDeepLink('a/b c'), 'mejl.html?messageId=a%2Fb%20c');
    assert.equal(mejlDeepLink(''), '');
    assert.equal(mejlDeepLink('shared:rec1'), '');
  });

  it('hittar länken och lägger den på egen rad', () => {
    const url = mejlDeepLink('18abc');
    const notes = appendMejlLink('Uppgift från mejl: Moms\n\nSkicka underlag', url);
    assert.match(notes, /Moms/);
    assert.match(notes, /Skicka underlag/);
    assert.equal(extractMejlLink(notes), url);
    assert.equal(appendMejlLink(notes, url), notes);
  });

  it('kan lyfta ut länken så ämnet blir kvar', () => {
    const url = 'mejl.html?messageId=18abc';
    const text = 'Fråga om bokslut\n' + url;
    assert.equal(stripMejlLinkLine(text, url), 'Fråga om bokslut');
    assert.equal(extractMejlLink(text), url);
  });
});
