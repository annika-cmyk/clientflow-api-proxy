const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { compileIdentifieradeRisker, mapOvrigRiskRecord } = require('./identifierade-risker');

describe('compileIdentifieradeRisker', () => {
    it('bygger Tjänst-block från byråns tjänster', () => {
        const text = compileIdentifieradeRisker({
            tjanster: [{
                namn: 'ROT/RUT-hantering',
                tjanstebeskrivning: 'Byrån hanterar ROT/RUT-avdrag för sina kunder.',
                hot: [{ titel: 'Fiktiva ansökningar', beskrivning: 'Kunder kan lämna felaktiga underlag.' }],
                sarbarheter: [{ beskrivning: 'Beroende av att kunden lämnar korrekta underlag.' }],
                riskbedomning: 'Medel',
                atgard: 'Granska fakturor mot utfört arbete.'
            }],
            ovriga: []
        });
        assert.match(text, /\*\*Tjänst: ROT\/RUT-hantering\*\*/);
        assert.match(text, /Byrån hanterar ROT\/RUT-avdrag/);
        assert.match(text, /\*\*Hot:\*\* Fiktiva ansökningar: Kunder kan lämna felaktiga underlag/);
        assert.match(text, /\*\*Sårbarhet:\*\* Beroende av att kunden lämnar korrekta underlag/);
        assert.match(text, /\*\*Risknivå och åtgärder:\*\* Medel/);
        assert.doesNotMatch(text, /AI-förslag|Länsstyrelsen/);
    });

    it('lägger övriga riskfaktorer efter tjänsterna', () => {
        const text = compileIdentifieradeRisker({
            tjanster: [{ namn: 'Bokslut', beskrivning: 'Årsbokslut.' }],
            ovriga: [
                mapOvrigRiskRecord({
                    fields: {
                        'Typ av riskfaktor': 'Kunder',
                        Riskfaktor: 'Kontantintensiva kunder',
                        Beskrivning: 'Kontanter ökar risken för oredovisade intäkter.',
                        Åtgärd: 'Fråga om kassahantering.',
                        Riskbedömning: 'Förhöjd'
                    }
                })
            ]
        });
        assert.match(text, /\*\*Övriga riskfaktorer\*\*/);
        assert.match(text, /\*\*Kunder: Kontantintensiva kunder\*\*/);
        assert.match(text, /Kontanter ökar risken/);
        const tjanstAt = text.indexOf('Tjänst: Bokslut');
        const ovrigAt = text.indexOf('Kontantintensiva kunder');
        assert.ok(tjanstAt >= 0 && ovrigAt > tjanstAt);
    });

    it('tomt underlag ger tydlig hänvisning', () => {
        assert.match(
            compileIdentifieradeRisker({ tjanster: [], ovriga: [] }),
            /Byråns tjänster och Övriga riskfaktorer/
        );
    });
});
