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
    assert.match(block, /underlag för din egen analys/);
    assert.match(block, /ROT\/RUT/);
    assert.match(block, /Felaktiga underlag/);
    assert.doesNotMatch(block, /Sårbarheter:/);
    assert.match(block, /TF-LUCKA/);
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

  it('lyfter TF-hot till granskning när tjänsten saknar TF-täckning', () => {
    const existing = {
      tjanstebeskrivning: 'ROT/RUT.',
      hot: [{ typ: 'PT', titel: 'Felaktiga underlag', beskrivning: 'Oriktiga kvitton.' }]
    };
    const generated = {
      hot: [
        { typ: 'PT', titel: 'Felaktiga underlag', beskrivning: 'Oriktiga kvitton.' },
        { typ: 'TF', titel: 'Medel till terrorgrupp', beskrivning: 'ROT/RUT kan dölja överföringar.' }
      ]
    };
    const poster = Ai.ensureTfCoveragePosters(existing, generated, []);
    assert.equal(poster.length, 1);
    assert.equal(poster[0].falt, 'hot');
    assert.equal(poster[0].andra, true);
    assert.equal(poster[0].forslag.some((h) => h.typ === 'TF'), true);
    assert.match(poster[0].forslag.map((h) => h.titel).join(' '), /Felaktiga underlag/);
    assert.match(Ai.REVIEW_PROMPT_RULES, /TF-LUCKA/);
  });

  it('döljer förslag som inte ändrar något', () => {
    const sameList = [
      { kategori: 'Verksamhet', titel: 'Begränsad personalstyrka', beskrivning: 'Endast en anställd kan begränsa kontrollen.' }
    ];
    assert.equal(Ai.sameForslag('sarbarheter', sameList, sameList), true);
    assert.equal(Ai.classifyAndring('sarbarheter', sameList, sameList, true).key, 'ingen');
    const host = { hidden: true, innerHTML: '' };
    Ai.renderReview(host, [{
      falt: 'sarbarheter',
      etikett: 'Sårbarheter',
      kommentar: 'AI har ett ändringsförslag för det här fältet.',
      andra: true,
      forslag: sameList
    }], { befintligt: { sarbarheter: sameList } });
    assert.equal(host.hidden, true);
    assert.equal(host.innerHTML, '');

    const kept = Ai.normalizeGranskning({
      poster: [{
        falt: 'sarbarheter',
        kommentar: 'AI har ett ändringsförslag för det här fältet.',
        andra: true,
        forslag: sameList
      }]
    }, 'tjanst', { sarbarheter: sameList });
    assert.equal(kept.length, 1);
    assert.equal(kept[0].andra, false);
    assert.equal(
      Ai.fallbackPosters('tjanst', { sarbarheter: sameList }, { sarbarheter: sameList }).length,
      0
    );
  });

  it('skickar med åtgärd i övrig riskfaktor', () => {
    const befintligt = { beskrivning: 'Kontanter.', atgard: 'Stickprov.' };
    assert.deepEqual(Ai.filledOvrigKeys(befintligt), ['beskrivning', 'atgard']);
    assert.equal(Ai.hasExistingOvrigContent({ ptTfRelevans: 'PT' }), false);
    assert.equal(Ai.hasExistingOvrigContent(befintligt), true);
    assert.match(Ai.formatOvrigExistingBlock(befintligt), /Stickprov/);
    assert.match(Ai.formatOvrigExistingBlock(befintligt), /underlag för din egen analys/);
    assert.match(Ai.REVIEW_PROMPT_RULES, /ANALYSLÄGE/);
    assert.match(Ai.REVIEW_PROMPT_RULES, /omfattande AML-analys/);
    assert.doesNotMatch(Ai.REVIEW_PROMPT_RULES, /GRANSKNINGSLÄGE/);
  });

  it('lyfter AI:s kompletta förslag till analyskort när text redan finns', () => {
    const existing = {
      tjanstebeskrivning: 'Kort text.',
      sannolikhet: 3,
      konsekvens: 3,
      hot: [{ typ: 'PT', titel: 'Felaktiga underlag', beskrivning: 'Kvitton.' }]
    };
    const generated = {
      tjanstebeskrivning: 'Längre analys av ROT/RUT och den inneboende risken i administration av skattereduktion.',
      sannolikhet: 4,
      konsekvens: 4,
      hot: [
        { typ: 'PT', titel: 'Oriktiga underlag', beskrivning: 'Kunden lämnar felaktiga underlag.' },
        { typ: 'TF', titel: 'Medel till terrorgrupp', beskrivning: 'ROT kan dölja överföringar.' }
      ]
    };
    const poster = Ai.ensureAnalysisPosters('tjanst', existing, generated, []);
    assert.deepEqual(poster.map((p) => p.falt).sort(), ['hot', 'sxk', 'tjanstebeskrivning']);
    const hot = poster.find((p) => p.falt === 'hot');
    assert.equal(hot.andra, true);
    assert.equal(hot.forslag.length, 2);
    assert.equal(hot.forslag.some((h) => h.typ === 'TF'), true);
    assert.equal(poster.find((p) => p.falt === 'tjanstebeskrivning').forslag, generated.tjanstebeskrivning);
  });

  it('använder huvudfältens kompletta analys även om modellen skickade en kortare poster', () => {
    const existing = { tjanstebeskrivning: 'Kort.' };
    const generated = { tjanstebeskrivning: 'Komplett egen analys av tjänsten och den inneboende risken.' };
    const poster = Ai.ensureAnalysisPosters('tjanst', existing, generated, [{
      falt: 'tjanstebeskrivning',
      kommentar: 'Beskrivningen saknar inneboende risk.',
      andra: true,
      forslag: 'Lite längre mening.'
    }]);
    assert.equal(poster.length, 1);
    assert.equal(poster[0].forslag, generated.tjanstebeskrivning);
    assert.match(poster[0].kommentar, /inneboende risk/);
  });

  it('hoppar över analyskort när AI:s förslag är identiskt med nuvarande text', () => {
    const same = 'Samma beskrivning.';
    assert.equal(
      Ai.ensureAnalysisPosters('ovrig', { beskrivning: same }, { beskrivning: same }, []).length,
      0
    );
  });

  it('behåller AI:s kompletta hotlista och lägger TF där i stället för att återgå till gamla hot', () => {
    const existing = {
      tjanstebeskrivning: 'ROT/RUT.',
      hot: [{ typ: 'PT', titel: 'Felaktiga underlag', beskrivning: 'Oriktiga kvitton.' }]
    };
    const generated = {
      hot: [
        { typ: 'PT', titel: 'Oriktiga ROT-underlag', beskrivning: 'Ny analys.' },
        { typ: 'TF', titel: 'Medel till terrorgrupp', beskrivning: 'Döljer överföringar.' }
      ]
    };
    const poster = Ai.ensureTfCoveragePosters(existing, generated, [{
      falt: 'hot',
      andra: true,
      forslag: [{ typ: 'PT', titel: 'Oriktiga ROT-underlag', beskrivning: 'Ny analys.' }]
    }]);
    const titles = poster[0].forslag.map((h) => h.titel).join(' ');
    assert.match(titles, /Oriktiga ROT-underlag/);
    assert.match(titles, /Medel till terrorgrupp/);
    assert.doesNotMatch(titles, /Felaktiga underlag/);
  });

  it('visar rubriken för egen analys i korten', () => {
    const host = { hidden: true, innerHTML: '' };
    Ai.renderReview(host, [{
      falt: 'beskrivning',
      etikett: 'Beskrivning och inneboende risk',
      kommentar: 'Ny analys kompletterar luckor.',
      andra: true,
      forslag: 'Komplett AI-förslag.'
    }], { befintligt: { beskrivning: 'Kort text.' } });
    assert.match(host.innerHTML, /AI:s egen analys/);
    assert.match(host.innerHTML, /kompletta egna förslag/);
  });
});
