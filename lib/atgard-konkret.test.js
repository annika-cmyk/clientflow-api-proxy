const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const Atgard = require('../public/js/atgard-konkret');

describe('atgard-konkret', () => {
  it('AI-reglerna förbjuder vaga avsikter och kräver praktik eller plan', () => {
    assert.match(Atgard.AI_RULES, /FÖRBJUDET/);
    assert.match(Atgard.AI_RULES, /Inför striktare krav/);
    assert.match(Atgard.AI_RULES, /Förbättra dokumentationen/);
    assert.match(Atgard.AI_RULES, /bör stärka/);
    assert.match(Atgard.AI_RULES, /VAR det dokumenteras/);
    assert.match(Atgard.AI_RULES, /när, vem, var/i);
  });

  it('förbjuder orimlig totalgranskning och kräver riskbaserade stickprov', () => {
    assert.match(Atgard.AI_RULES, /PROPORTIONERLIGA KONTROLLER/);
    assert.match(Atgard.AI_RULES, /granskar alla transaktioner/);
    assert.match(Atgard.AI_RULES, /vid varje transaktion/);
    assert.match(Atgard.AI_RULES, /1000 kr/);
    assert.match(Atgard.AI_RULES, /stickprov/i);
    assert.match(Atgard.AI_RULES, /Hitta inte på/);
  });

  it('kräver pedagogik och förbjuder svagare förkortningar av bra åtgärdstext', () => {
    assert.match(Atgard.AI_RULES, /PEDAGOGIK OCH BEVARA DETALJ/);
    assert.match(Atgard.AI_RULES, /nyanställda/);
    assert.match(Atgard.AI_RULES, /AML för dummies/);
    assert.match(Atgard.AI_RULES, /expandera/i);
    assert.match(Atgard.AI_RULES, /ALDRIG en kortare/);
  });

  it('exporterar inte spar-kontroll', () => {
    assert.equal(Atgard.validateAtgarder, undefined);
    assert.equal(Atgard.validateAtgardText, undefined);
    assert.equal(Atgard.assessAtgard, undefined);
    assert.equal(Atgard.SAVE_ERROR, undefined);
  });

  it('AI-prompten i servern använder reglerna, utan att blockera sparande', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /AtgardKonkret\.AI_RULES/);
    assert.equal(index.includes('rejectVagueTjanstAtgarder'), false);
    assert.equal(index.includes('rejectVagueOvrigAtgard'), false);
    assert.equal(index.includes('validateAtgarder'), false);
    assert.equal(index.includes('validateAtgardText'), false);
  });

  it('sidorna laddar inte kontrollen och blockerar inte sparande', () => {
    const tjanstHtml = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const ovrigHtml = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const tjanstJs = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const ovrigJs = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.doesNotMatch(tjanstHtml, /atgard-konkret\.js/);
    assert.doesNotMatch(ovrigHtml, /atgard-konkret\.js/);
    assert.doesNotMatch(tjanstHtml, /atgard-konkret-warn/);
    assert.doesNotMatch(ovrigHtml, /atgard-konkret-warn/);
    assert.doesNotMatch(tjanstJs, /AtgardKonkret|paintAtgardKonkret|validateAtgarder|is-vague/);
    assert.doesNotMatch(ovrigJs, /AtgardKonkret|paintAtgardKonkret|validateAtgardText|is-vague/);
  });
});
