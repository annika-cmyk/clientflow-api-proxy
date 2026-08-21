const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Ai = require('../public/js/ai-falt-granskning');

describe('ai-falt-granskning', () => {
  it('ser ifyllda tjänstfält och formaterar dem till prompten', () => {
    const befintligt = {
      tjanstebeskrivning: 'ROT/RUT innebär administration av skattereduktion.',
      sannolikhet: 4,
      konsekvens: 4,
      hot: [{ typ: 'PT', titel: 'Felaktiga underlag', beskrivning: 'Kunden lämnar oriktiga kvitton.' }],
      sarbarheter: [],
      atgarder: []
    };
    assert.deepEqual(Ai.filledTjanstKeys(befintligt), ['tjanstebeskrivning', 'sxk', 'hot']);
    assert.equal(Ai.hasExistingTjanstContent(befintligt), true);
    assert.equal(Ai.hasExistingTjanstContent({}), false);
    const block = Ai.formatTjanstExistingBlock(befintligt);
    assert.match(block, /BEFINTLIGT INNEHÅLL/);
    assert.match(block, /ROT\/RUT/);
    assert.match(block, /Felaktiga underlag/);
    assert.doesNotMatch(block, /Sårbarheter:/);
  });

  it('normaliserar granskningsposter och förbjuder okända fält', () => {
    const poster = Ai.normalizeGranskning({
      poster: [
        {
          falt: 'tjanstebeskrivning',
          kommentar: 'Nämner byrån.',
          andra: true,
          forslag: 'ROT/RUT-hantering innebär administration av skattereduktion.'
        },
        { falt: 'okant', kommentar: 'Hoppa', andra: true, forslag: 'x' },
        { falt: 'hot', kommentar: 'Lägg källa.', andra: true, forslag: [{ typ: 'PT', titel: 'Nytt hot' }] }
      ]
    }, 'tjanst');
    assert.equal(poster.length, 2);
    assert.equal(poster[0].etikett, 'Tjänstebeskrivning och inneboende risk');
    assert.equal(poster[0].andra, true);
    assert.match(poster[0].forslag, /administration/);
    assert.equal(poster[1].falt, 'hot');
    assert.equal(poster[1].forslag[0].titel, 'Nytt hot');
  });

  it('behåller kommentar utan ändring när andra är false', () => {
    const poster = Ai.normalizeGranskning({
      poster: [{ falt: 'beskrivning', kommentar: 'Bra som den är.', andra: false, forslag: 'ska inte användas' }]
    }, 'ovrig');
    assert.equal(poster.length, 1);
    assert.equal(poster[0].andra, false);
    assert.equal(poster[0].forslag, '');
  });

  it('läser S×K-förslag från objekt eller text', () => {
    const fromObj = Ai.normalizeGranskning({
      poster: [{ falt: 'sxk', kommentar: 'Sänk något.', andra: true, forslag: { sannolikhet: 3, konsekvens: 4 } }]
    }, 'tjanst');
    assert.deepEqual(fromObj[0].forslag, { sannolikhet: 3, konsekvens: 4 });
    assert.match(Ai.formatForslagPreview('sxk', fromObj[0].forslag), /Sannolikhet 3/);

    const fromText = Ai.normalizeGranskning({
      poster: [{ falt: 'residual', kommentar: 'Efter åtgärd.', andra: true, forslag: '2 / 3' }]
    }, 'ovrig');
    assert.deepEqual(fromText[0].forslag, { sannolikhet: 2, konsekvens: 3 });
  });

  it('skiljer på ändring och tillägg mot nuvarande text', () => {
    const andra = Ai.classifyAndring('tjanstebeskrivning', 'Gammal text', 'Ny text', true);
    assert.equal(andra.key, 'andra');
    assert.match(andra.label, /Ändrar/);
    const add = Ai.classifyAndring('tjanstebeskrivning', '', 'Ny text', true);
    assert.equal(add.key, 'lagg-till');
    const listAdd = Ai.classifyAndring(
      'hot',
      [{ typ: 'PT', titel: 'Felaktiga underlag' }],
      [{ typ: 'PT', titel: 'Felaktiga underlag' }, { typ: 'TF', titel: 'Nytt TF-hot' }],
      true
    );
    assert.equal(listAdd.key, 'lagg-till');
    assert.match(listAdd.label, /faktor/);
    const none = Ai.classifyAndring('beskrivning', 'Behålls', '', false);
    assert.equal(none.key, 'ingen');
    const decorated = Ai.decoratePoster({
      falt: 'tjanstebeskrivning',
      etikett: 'Tjänstebeskrivning och inneboende risk',
      andra: true,
      forslag: 'Ny text'
    }, { tjanstebeskrivning: 'Gammal text' });
    assert.equal(decorated.nuvarande, 'Gammal text');
    assert.equal(decorated.klass.key, 'andra');
  });

  it('visar nuvarande text och redigerbart förslag i granskningskortet', () => {
    const host = { hidden: true, innerHTML: '' };
    Ai.renderReview(host, [{
      falt: 'tjanstebeskrivning',
      etikett: 'Tjänstebeskrivning och inneboende risk',
      kommentar: 'Ta bort byrån.',
      andra: true,
      forslag: 'ROT/RUT-hantering innebär administration av skattereduktion.'
    }], {
      befintligt: { tjanstebeskrivning: 'Byrån hjälper kunder med ROT/RUT.' }
    });
    assert.equal(host.hidden, false);
    assert.match(host.innerHTML, /Nuvarande/);
    assert.match(host.innerHTML, /Byrån hjälper kunder/);
    assert.match(host.innerHTML, /Ändrar nuvarande text/);
    assert.match(host.innerHTML, /data-ai-forslag/);
    assert.match(host.innerHTML, /administration av skattereduktion/);
  });

  it('läser redigerat förslag från kortet', () => {
    const textCard = {
      querySelector: (sel) => (sel === '[data-ai-forslag]' ? { value: '  Redigerad text  ' } : null),
      querySelectorAll: () => []
    };
    assert.equal(
      Ai.readEditedForslag(textCard, { falt: 'tjanstebeskrivning', forslag: 'original' }),
      'Redigerad text'
    );
    const scoreCard = {
      querySelector: (sel) => {
        if (sel === '[data-ai-s]') return { value: '2' };
        if (sel === '[data-ai-k]') return { value: '3' };
        return null;
      },
      querySelectorAll: () => []
    };
    assert.deepEqual(
      Ai.readEditedForslag(scoreCard, { falt: 'residual', forslag: { sannolikhet: 4, konsekvens: 4 } }),
      { sannolikhet: '2', konsekvens: '3' }
    );
  });

  it('skickar med åtgärd i övrig riskfaktor', () => {
    const befintligt = { beskrivning: 'Kontanter.', atgard: 'Stickprov.' };
    assert.deepEqual(Ai.filledOvrigKeys(befintligt), ['beskrivning', 'atgard']);
    assert.equal(Ai.hasExistingOvrigContent({ ptTfRelevans: 'PT' }), false);
    assert.equal(Ai.hasExistingOvrigContent(befintligt), true);
    assert.match(Ai.formatOvrigExistingBlock(befintligt), /Stickprov/);
    assert.match(Ai.REVIEW_PROMPT_RULES, /GRANSKNINGSLÄGE/);
  });
});
