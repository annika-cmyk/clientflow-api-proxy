const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compileIdentifieradeRisker, referralIdentifieradeRisker, isIdentifieradeCompiledDump, mapOvrigRiskRecord } = require('./identifierade-risker');

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
        assert.match(text, /\*\*Tjänstebeskrivning och inneboende risk:\*\* Byrån hanterar ROT\/RUT-avdrag/);
        assert.match(text, /\*\*Hot:\*\* PT-hot: Fiktiva ansökningar: Kunder kan lämna felaktiga underlag/);
        assert.match(text, /\*\*Sårbarhet:\*\* Beroende av att kunden lämnar korrekta underlag/);
        assert.match(text, /\*\*Inneboende risk:\*\* Normal/);
        assert.match(text, /\*\*Fördjupad riskanalys och residualrisk\*\*/);
        assert.match(text, /\*\*Åtgärd:\*\* Granska fakturor mot utfört arbete/);
        assert.doesNotMatch(text, /AI-förslag|Länsstyrelsen/);
    });

    it('skriver inneboende risk i huvudavsnittet och residualrisk i eget avsnitt', () => {
        const text = compileIdentifieradeRisker({
            tjanster: [{
                namn: 'ROT/RUT-hantering',
                sannolikhet: 4,
                konsekvens: 4,
                sannolikhetEfter: 2,
                konsekvensEfter: 3,
                atgard: 'Stickprov på underlag.'
            }],
            ovriga: []
        });
        const residualAt = text.indexOf('**Fördjupad riskanalys och residualrisk**');
        assert.match(text.slice(0, residualAt), /\*\*Inneboende risk:\*\* Hög \(S×K 16\)/);
        assert.doesNotMatch(text.slice(0, residualAt), /Stickprov|Residualrisk/);
        assert.match(text.slice(residualAt), /\*\*Residualrisk:\*\* Normal \(S×K 6\)/);
        assert.match(text.slice(residualAt), /\*\*Åtgärd:\*\* Stickprov på underlag/);
    });

    it('lägger övriga riskfaktorer efter tjänsterna och flyttar åtgärd till residualavsnittet', () => {
        const text = compileIdentifieradeRisker({
            tjanster: [{ namn: 'Bokslut', beskrivning: 'Årsbokslut.' }],
            ovriga: [
                mapOvrigRiskRecord({
                    fields: {
                        'Typ av riskfaktor': 'Kunder',
                        Riskfaktor: 'Kontantintensiva kunder',
                        Beskrivning: 'Kontanter ökar risken för oredovisade intäkter.',
                        Åtgärd: 'Fråga om kassahantering.',
                        Riskbedömning: 'Förhöjd',
                        'PT/TF-relevans': 'TF'
                    }
                })
            ]
        });
        const ovrigaAt = text.indexOf('**Övriga riskfaktorer**');
        const residualAt = text.indexOf('**Fördjupad riskanalys och residualrisk**');
        assert.ok(ovrigaAt >= 0 && residualAt > ovrigaAt);
        const ovrigaSection = text.slice(ovrigaAt, residualAt);
        assert.match(ovrigaSection, /\*\*Kunder: Kontantintensiva kunder\*\* \[TF\]/);
        assert.match(ovrigaSection, /\*\*Beskrivning och inneboende risk:\*\* Kontanter ökar risken/);
        assert.match(ovrigaSection, /\*\*Inneboende risk:\*\* Förhöjd/);
        assert.doesNotMatch(ovrigaSection, /Åtgärd/);
        assert.match(text.slice(residualAt), /\*\*Åtgärd:\*\* Fråga om kassahantering/);
        assert.match(text.slice(residualAt), /Kontantintensiva kunder/);
        const tjanstAt = text.indexOf('Tjänst: Bokslut');
        assert.ok(tjanstAt >= 0 && ovrigaAt > tjanstAt);
    });

    it('tomt underlag ger tydlig hänvisning', () => {
        assert.match(
            compileIdentifieradeRisker({ tjanster: [], ovriga: [] }),
            /Byråns tjänster och Övriga riskfaktorer/
        );
    });
});

describe('referralIdentifieradeRisker', () => {
    it('hänvisar till källsidorna utan att dumpa tjänsttexter', () => {
        const text = referralIdentifieradeRisker();
        assert.match(text, /Byråns tjänster/);
        assert.match(text, /Övriga riskfaktorer/);
        assert.match(text, /Dokumentationen/);
        assert.match(text, /PDF/);
        assert.doesNotMatch(text, /Tjänstebeskrivning|ROT\/RUT|\*\*Tjänst:/);
        assert.equal(isIdentifieradeCompiledDump(text), false);
    });

    it('känner igen kompilerad dump från tjänstesidorna', () => {
        const dump = compileIdentifieradeRisker({
            tjanster: [{ namn: 'Bokslut', tjanstebeskrivning: 'Årsbokslut.' }],
            ovriga: []
        });
        assert.equal(isIdentifieradeCompiledDump(dump), true);
        assert.equal(isIdentifieradeCompiledDump(''), false);
    });
});

describe('allmän riskbedömning HTML', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/allman-riskbedomning-byra.html'), 'utf8');

    it('sektion 4 är en hänvisning utan tom value-ruta', () => {
        const start = html.indexOf('data-field-id="fld-identifierade-risker"');
        const end = html.indexOf('data-field-id="fld-riskreducerande"');
        const card = html.slice(start, end);
        assert.match(card, /4\. Identifierade Risker och Sårbarheter/);
        assert.match(card, /riskbedomning-byra\.html/);
        assert.match(card, /ovriga-riskfaktorer\.html/);
        assert.match(card, /dokumentation\.html/);
        assert.match(card, /id="identifierade-risker-live"/);
        assert.doesNotMatch(card, /byra-card-value/);
    });

    it('riskaptit är ett kort utan extra tom visningsruta', () => {
        const start = html.indexOf('data-field-id="fld-riskaptit-policy"');
        const end = html.indexOf('data-field-id="fld-uppdaterad-datum"');
        const card = html.slice(start, end);
        assert.match(card, /9\. Riskaptit/);
        assert.match(card, /id="fld-riskaptit-policy"/);
        assert.doesNotMatch(card, /fld-riskaptit-policy-view/);
        assert.doesNotMatch(card, /byra-card-value/);
        assert.equal((card.match(/byra-card-view/g) || []).length, 1);
    });
});
