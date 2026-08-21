const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyItem, normalizeClassification, isValidClassification, buildClassificationPrompt, heuristicClassify, isThinSummary, excerptSummary, needsAiSummary, isSourceExcerpt, CLASSIFY_INSTRUCTIONS } = require('./classify');

describe('classify (layer 2)', () => {
  it('normaliserar ogiltig kategori till ovrigt', () => {
    const out = normalizeClassification({ category: 'nope', severity: 'informativ', summary_sv: 'x', affected_industries: ['Bygg', null], affected_geography: ['SE'] });
    assert.equal(out.category, 'ovrigt');
    assert.deepEqual(out.affected_industries, ['bygg']);
    assert.deepEqual(out.affected_geography, ['se']);
  });

  it('kräver sammanfattning på minst 60 tecken', () => {
    assert.equal(isValidClassification({
      category: 'lagandring',
      severity: 'informativ',
      summary_sv: 'för kort för en byråsammanfattning',
      affected_industries: [],
      affected_geography: []
    }), false);
  });

  it('gör ett enda completeJson-anrop och ingen agentloop', async () => {
    let calls = 0;
    const item = { source: 'eurlex', title: 'Amending 2016/1675', source_url: 'https://eur-lex.eu/x', raw_content: 'Russia added' };
    const out = await classifyItem(item, {
      completeJson: async () => {
        calls += 1;
        return {
          category: 'hogriskstater',
          severity: 'kraver_atgard',
          summary_sv: 'EU har uppdaterat listan över högriskländer. Kontrollera kundstocken mot den nya listan.',
          affected_industries: [],
          affected_geography: ['ru']
        };
      }
    });
    assert.equal(calls, 1);
    assert.equal(out.category, 'hogriskstater');
    const prompt = buildClassificationPrompt(item);
    assert.match(prompt, /2016\/1675/);
    assert.match(prompt, /ClientFlow/);
    assert.match(prompt, /små och medelstora svenska redovisningsbyråer/);
    assert.match(CLASSIFY_INSTRUCTIONS, /små svenska redovisningsbyråer/);
  });

  it('kräver ny AI-sammanfattning när texten bara är källans ingress', () => {
    const raw = 'Här hittar du information om vad som gäller för den som tidigare har varit auktoriserad eller godkänd revisor och vill återkomma till yrket.';
    const excerpt = {
      title: 'Återkomma till yrket',
      raw_content: raw,
      summary_sv: raw
    };
    assert.equal(isSourceExcerpt(excerpt), true);
    assert.equal(needsAiSummary(excerpt), true);
    const ai = {
      ...excerpt,
      classified_at: '2026-08-19T12:00:00.000Z',
      summary_sv: 'Det här rör främst revisorer som vill tillbaka till yrket, inte er löpande redovisning. För byrån räcker det att känna till att auktorisationskraven finns samlade hos Revisorsinspektionen.'
    };
    assert.equal(needsAiSummary(ai), false);
  });

  it('ger Skatteverket och Finanspolisen en kategori även utan träff i texten', () => {
    const skv = heuristicClassify({ source: 'skatteverket', title: 'Ny vägledning från myndigheten om kontroll', raw_content: 'Ny vägledning från myndigheten om kontroll.' });
    assert.equal(skv.category, 'lagandring');
    const fipo = heuristicClassify({ source: 'finanspolisen', title: 'Ny information från myndigheten till byråer', raw_content: 'Ny information från myndigheten till byråer.' });
    assert.equal(fipo.category, 'rapporteringsrutiner');
    const scan = heuristicClassify({
      source: 'finanspolisen',
      title: 'Omvärldsbevakning penningtvätt och finansiering av terrorism nr 2-2026',
      raw_content: 'Omvärldsbevakning penningtvätt och finansiering av terrorism nr 2-2026'
    });
    assert.equal(scan.category, 'lagandring');
  });

  it('bygger en längre sammanfattning från artikeltext i stället för att upprepa titeln', () => {
    const title = 'Återkomma till yrket';
    assert.equal(isThinSummary({ title, summary_sv: title }), true);
    const raw = 'Här hittar du information om vad som gäller för den som tidigare har varit auktoriserad eller godkänd revisor och vill återkomma till yrket. De grundläggande kraven för auktorisation gäller, men det finns undantag för den som nyligen lämnat yrket.';
    const summary = excerptSummary({ title, raw_content: raw });
    assert.ok(summary.length > 80);
    assert.notEqual(summary, title);
    const classified = heuristicClassify({ source: 'revisorsinspektionen', title, raw_content: raw });
    assert.ok(classified.summary_sv.length > 80);
    assert.notEqual(classified.summary_sv, title);
  });
});
