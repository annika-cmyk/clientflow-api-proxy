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
        assert.match(text, /\*\*Tjänsten:\*\* Byrån hanterar ROT\/RUT-avdrag/);
        assert.match(text, /\*\*PT\/TF:\*\* PT/);
        assert.match(text, /\*\*Hot och modus:\*\* PT-hot: Fiktiva ansökningar: Kunder kan lämna felaktiga underlag/);
        assert.match(text, /\*\*Sårbarheter:\*\* Beroende av att kunden lämnar korrekta underlag/);
        assert.match(text, /\*\*Inneboende risk:\*\* Normal/);
        assert.match(text, /\*\*Fördjupad riskanalys och residualrisk\*\*/);
        assert.match(text, /\*\*Riskreducerande åtgärder:\*\* Granska fakturor mot utfört arbete/);
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
        assert.match(text.slice(0, residualAt), /\*\*Sannolikhet:\*\* 4/);
        assert.match(text.slice(0, residualAt), /\*\*S×K:\*\* 16/);
        assert.match(text.slice(0, residualAt), /\*\*Inneboende risk:\*\* Hög/);
        assert.doesNotMatch(text.slice(0, residualAt), /Stickprov|Residualrisk/);
        assert.match(text.slice(residualAt), /\*\*Sannolikhet:\*\* 2/);
        assert.match(text.slice(residualAt), /\*\*Residualrisk:\*\* Normal/);
        assert.match(text.slice(residualAt), /\*\*Riskreducerande åtgärder:\*\* Stickprov på underlag/);
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
        assert.match(ovrigaSection, /\*\*Riskfaktorer kopplat till kund: Kontantintensiva kunder\*\* \[TF\]/);
        assert.match(ovrigaSection, /\*\*PT\/TF:\*\* TF/);
        assert.match(ovrigaSection, /\*\*Beskrivning:\*\* Kontanter ökar risken/);
        assert.match(ovrigaSection, /\*\*Inneboende risk:\*\* Förhöjd/);
        assert.doesNotMatch(ovrigaSection, /Åtgärd/);
        assert.match(text.slice(residualAt), /\*\*Riskreducerande åtgärder:\*\* Fråga om kassahantering/);
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

describe('kategorigruppering i AR-exporten', () => {
    it('grupperar Via ombud med Distributionskanaler i både inneboende och residual', () => {
        const text = compileIdentifieradeRisker({
            tjanster: [],
            ovriga: [
                {
                    typ: 'Distributionskanaler',
                    namn: 'Distanskund',
                    beskrivning: 'Kunden träffas inte fysiskt.',
                    atgard: 'Video och ID-kontroll.',
                    sannolikhetEfter: 2,
                    konsekvensEfter: 2
                },
                {
                    typ: 'Distrubutionskanaler',
                    namn: 'Via ombud',
                    beskrivning: 'Kontakt går via ombud.',
                    atgard: 'Kontrollera ombudets uppdrag.',
                    sannolikhetEfter: 2,
                    konsekvensEfter: 3
                },
                {
                    typ: 'Riskfaktorer kopplat till kund',
                    namn: 'Privatkunder',
                    beskrivning: 'Privatpersoner.',
                    atgard: 'KYC.',
                    sannolikhetEfter: 1,
                    konsekvensEfter: 2
                }
            ]
        });
        const residualAt = text.indexOf('**Fördjupad riskanalys och residualrisk**');
        const inherent = text.slice(0, residualAt);
        const residual = text.slice(residualAt);
        const distHeading = /\*\*Distrubutionskanaler - såhär möter vi våra kunder\*\*/;
        assert.match(inherent, distHeading);
        assert.match(residual, distHeading);
        assert.doesNotMatch(text, /\*\*Distributionskanaler\*\*/);
        const inherentDist = inherent.indexOf('**Distrubutionskanaler - såhär möter vi våra kunder**');
        const inherentKund = inherent.indexOf('**Riskfaktorer kopplat till kund**');
        const residualDist = residual.indexOf('**Distrubutionskanaler - såhär möter vi våra kunder**');
        const residualKund = residual.indexOf('**Riskfaktorer kopplat till kund**');
        assert.ok(inherentDist >= 0 && inherentKund >= 0);
        assert.ok(residualDist >= 0 && residualKund >= 0);
        const inherentDistEnd = inherentKund > inherentDist ? inherentKund : inherent.length;
        const residualDistEnd = residualKund > residualDist ? residualKund : residual.length;
        const inherentDistBlock = inherent.slice(inherentDist, inherentDistEnd);
        const residualDistBlock = residual.slice(residualDist, residualDistEnd);
        assert.match(inherentDistBlock, /Via ombud/);
        assert.match(inherentDistBlock, /Distanskund/);
        assert.match(residualDistBlock, /Via ombud/);
        assert.match(residualDistBlock, /Distanskund/);
        assert.doesNotMatch(inherentDistBlock, /Privatkunder/);
    });
});

describe('PT/TF i dokumentet', () => {
    it('märker tjänst med både PT- och TF-hot som PT/TF', () => {
        const text = compileIdentifieradeRisker({
            tjanster: [{
                namn: 'Internationella betalningar',
                hot: [
                    { typ: 'PT', titel: 'Strukturering', beskrivning: 'Delade belopp kan dölja ursprung.' },
                    { typ: 'TF', titel: 'Medel till högriskland', beskrivning: 'Utlandsbetalning kan finansiera terrorism.' }
                ]
            }],
            ovriga: []
        });
        assert.match(text, /\*\*Tjänst: Internationella betalningar\*\* \[PT\/TF\]/);
        assert.match(text, /\*\*PT\/TF:\*\* Båda — penningtvätt och finansiering av terrorism/);
        assert.match(text, /PT-hot: Strukturering/);
        assert.match(text, /TF-hot: Medel till högriskland/);
    });

    it('märker ett Båda-hot som PT/TF-hot', () => {
        const text = compileIdentifieradeRisker({
            tjanster: [{
                namn: 'Kundreskontra',
                hot: [{ typ: 'Båda', titel: 'Falsk faktura', beskrivning: 'Kan dölja både PT och TF.' }]
            }],
            ovriga: []
        });
        assert.match(text, /\[PT\/TF\]/);
        assert.match(text, /PT\/TF-hot: Falsk faktura/);
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

    it('sektion 3 är analys av tjänster utan källtext och sektion 4 identifierade risker', () => {
        const start3 = html.indexOf('data-field-id="fld-identifierade-risker"');
        const end3 = html.indexOf('data-card-id="fld-identifierade-nya"');
        const card3 = html.slice(start3, end3);
        assert.match(card3, /3\. Analys av våra produkter och tjänster/);
        assert.doesNotMatch(card3, /4\. Analys av våra produkter och tjänster/);
        assert.doesNotMatch(card3, /Underlaget kommer från/);
        assert.doesNotMatch(card3, /Stapeldiagram/);
        assert.doesNotMatch(card3, /riskbedomning-byra\.html/);
        assert.match(card3, /id="identifierade-risker-live"/);

        const start4 = html.indexOf('data-card-id="fld-identifierade-nya"');
        const end4 = html.indexOf('data-field-id="fld-riskreducerande"');
        const card4 = html.slice(start4, end4);
        assert.match(card4, /4\. Identifierade risker och sårbarheter/);
        assert.match(html, /5\. Riskreducerande Åtgärder och Rutiner/);
        assert.match(html, /9\. Riskaptit/);
        assert.doesNotMatch(html, /10\. Riskaptit/);
    });

    it('riskaptit mappas till Byråer-fältet 9. Riskaptit', () => {
        const js = fs.readFileSync(path.join(__dirname, '../public/js/allman-riskbedomning-byra.js'), 'utf8');
        assert.match(js, /id:\s*'fld-riskaptit-policy',\s*airtable:\s*'9\. Riskaptit'/);
        assert.match(js, /Riskaptit\.policyText/);
        assert.match(js, /only:\s*'tjanster'/);
        assert.match(js, /only:\s*'verksamhet'/);
        assert.match(js, /renderGeografi/);
        assert.match(js, /renderPieChart/);
        assert.match(js, /renderBarChartHtml/);
        assert.match(js, /renderFlaggorBarChart/);
        assert.match(js, /_arIdentifieradeSource/);
        assert.match(js, /Kunder per varningsflagga/);
        assert.match(js, /ar-bar-chart--flaggor/);
        assert.match(js, /\/api\/statistik-riskbedomning/);
        const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
        assert.match(css, /\.ar-bar-chart--flaggor \.ar-bar-row\s*\{[^}]*minmax\(22rem, 1fr\) minmax\(4\.5rem, 8\.5rem\)/);
    });

    it('riskaptit är ett redigerbart kort med penna och textarea', () => {
        const start = html.indexOf('data-field-id="fld-riskaptit-policy"');
        const end = html.indexOf('data-field-id="fld-uppdaterad-datum"');
        const card = html.slice(start, end);
        assert.match(card, /9\. Riskaptit/);
        assert.match(card, /id="fld-riskaptit-policy"/);
        assert.match(card, /byra-card-value/);
        assert.match(card, /byra-card-edit-btn/);
        assert.match(card, /<textarea id="fld-riskaptit-policy"/);
        assert.doesNotMatch(card, /byra-card--readonly/);
        assert.doesNotMatch(card, /fld-riskaptit-policy-view/);
        assert.equal((card.match(/byra-card-view/g) || []).length, 1);
    });
});
