const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Atgard = require('../public/js/atgard-konkret');

describe('atgard-konkret', () => {
  it('nekar vaga avsikter som Inför striktare krav', () => {
    const check = Atgard.assessAtgard({
      titel: 'Öka dokumentationskrav',
      beskrivning: 'Inför striktare krav på dokumentation för alla transaktioner som ingår i bokslutet.'
    });
    assert.equal(check.ok, false);
    assert.match(check.error, /för vag/);
  });

  it('nekar bör/se över/förbättra utan hur det görs', () => {
    assert.equal(Atgard.assessAtgard({ beskrivning: 'Byrån bör stärka kontrollen av underlag.' }).ok, false);
    assert.equal(Atgard.assessAtgard({ beskrivning: 'Se över rutinerna för ROT och RUT-hantering.' }).ok, false);
    assert.equal(Atgard.assessAtgard({ beskrivning: 'Förbättra dokumentationen kring bokslutet.' }).ok, false);
  });

  it('godkänner införd åtgärd med vad och var', () => {
    const check = Atgard.assessAtgard({
      titel: 'Dokumentation i bokslut',
      beskrivning: 'Underlag för alla transaktioner dokumenteras i bokslutsprogrammet.'
    });
    assert.equal(check.ok, true);
    assert.equal(check.kind, 'inford');
  });

  it('godkänner konkret praktik med vem', () => {
    const check = Atgard.assessAtgard({
      beskrivning: 'Stickprov på ROT-underlag görs av klientansvarig varje kvartal.'
    });
    assert.equal(check.ok, true);
  });

  it('godkänner vanlig praktik utan passiv form', () => {
    assert.equal(Atgard.assessAtgard({
      titel: 'Regelbunden kapitalövervakning',
      beskrivning: 'Våra bokföringsprogram innehåller funktioner för automatisk övervakning av företagets kapitalnivåer för att tidigt identifiera behovet av kontrollbalansräkning.'
    }).ok, true);
    assert.equal(Atgard.assessAtgard({
      titel: 'Utbildning för styrelsen',
      beskrivning: 'Vi informerar alltid nya kunder och styrelsemedlemmar om deras ansvar och vikten av att upprätta kontrollbalansräkning.'
    }).ok, true);
    assert.equal(Atgard.assessAtgard({
      titel: 'Dokumentationsgranskning',
      beskrivning: 'Granska företagets finansiella dokumentation för att säkerställa korrekthet och fullständighet.'
    }).ok, true);
  });

  it('godkänner tydligt planerad åtgärd med datum och var', () => {
    const check = Atgard.assessAtgard({
      beskrivning: 'Från 1 oktober 2026 dokumenteras alla ROT-underlag i Fortnox. Ansvarig: klientansvarig.'
    });
    assert.equal(check.ok, true);
    assert.match(check.kind, /inford|planerad/);
  });

  it('nekar plan utan vad som faktiskt ska göras', () => {
    const check = Atgard.assessAtgard({
      beskrivning: 'Åtgärden är planerad och ska införas senast 2026.'
    });
    assert.equal(check.ok, false);
  });

  it('godkänner utkast med vaga åtgärder', () => {
    const check = Atgard.validateAtgarder([
      { titel: 'Öka dokumentationskrav', beskrivning: 'Inför striktare krav på dokumentation.' }
    ], { asDraft: true });
    assert.equal(check.ok, true);
    assert.equal(check.draft, true);
  });

  it('validateAtgarder pekar ut den vaga raden', () => {
    const check = Atgard.validateAtgarder([
      { titel: 'Bankavstämning', beskrivning: 'Fakturor stäms av mot bankutdrag i Fortnox varje månad.' },
      { titel: 'Öka dokumentationskrav', beskrivning: 'Inför striktare krav på dokumentation för bokslutet.' }
    ]);
    assert.equal(check.ok, false);
    assert.equal(check.index, 1);
  });

  it('validateAtgardText krävs för övriga riskfaktorer', () => {
    assert.equal(Atgard.validateAtgardText('', { required: true }).ok, false);
    assert.equal(Atgard.validateAtgardText('Underlag för alla transaktioner dokumenteras i bokslutsprogrammet.').ok, true);
  });

  it('sidorna laddar kontrollen och visar exempeltext', () => {
    const tjanst = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const ovrig = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    assert.match(tjanst, /atgard-konkret\.js/);
    assert.match(ovrig, /atgard-konkret\.js/);
    assert.match(tjanst, /införda eller tydligt planerade/);
    assert.match(ovrig, /dokumenteras i bokslutsprogrammet/);
  });
});
