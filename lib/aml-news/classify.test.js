const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyItem, normalizeClassification, isValidClassification, buildClassificationPrompt, heuristicClassify } = require('./classify');

describe('classify (layer 2)', () => {
  it('normaliserar ogiltig kategori till ovrigt', () => {
    const out = normalizeClassification({ category: 'nope', severity: 'informativ', summary_sv: 'x', affected_industries: ['Bygg', null], affected_geography: ['SE'] });
    assert.equal(out.category, 'ovrigt');
    assert.deepEqual(out.affected_industries, ['bygg']);
    assert.deepEqual(out.affected_geography, ['se']);
  });

  it('kräver sammanfattning på minst 20 tecken', () => {
    assert.equal(isValidClassification({
      category: 'lagandring',
      severity: 'informativ',
      summary_sv: 'för kort',
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
    assert.match(buildClassificationPrompt(item), /2016\/1675/);
  });

  it('ger Skatteverket och Finanspolisen en kategori även utan träff i texten', () => {
    const skv = heuristicClassify({ source: 'skatteverket', title: 'Ny vägledning från myndigheten om kontroll', raw_content: 'Ny vägledning från myndigheten om kontroll.' });
    assert.equal(skv.category, 'lagandring');
    const fipo = heuristicClassify({ source: 'finanspolisen', title: 'Ny information från myndigheten till byråer', raw_content: 'Ny information från myndigheten till byråer.' });
    assert.equal(fipo.category, 'rapporteringsrutiner');
  });
});
