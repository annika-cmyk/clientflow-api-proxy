/**
 * Kör: node --test lib/risk-skala-airtable.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const RiskSkala = require('../public/js/risk-skala');
const {
  isRiskSelectFieldName,
  planSelectChoiceMigration,
  airtableErrorMessage,
  unknownAirtableFieldName,
  dropUnknownAirtableField,
  isInvalidChoiceError,
  normalizeRiskFields,
  shouldOmitRiskSelectValue,
  missingExactRiskLabels
} = require('./risk-skala-airtable');

describe('risk-skala-airtable', () => {
  it('känner igen riskfält oavsett skiftläge', () => {
    assert.equal(isRiskSelectFieldName('Riskbedömning'), true);
    assert.equal(isRiskSelectFieldName('riskniva'), true);
    assert.equal(isRiskSelectFieldName('sammanlagd risk'), true);
    assert.equal(isRiskSelectFieldName('Kund inneboende riskprofil'), true);
    assert.equal(isRiskSelectFieldName('Kund föreslagen nivå'), true);
    assert.equal(isRiskSelectFieldName('Typ av riskfaktor'), false);
  });

  it('byter Medel/Lag/Hog till kanoniska namn och lägger till saknade', () => {
    const plan = planSelectChoiceMigration([
      { id: 'sel1', name: 'Medel', color: 'yellowLight2' },
      { id: 'sel2', name: 'Låg' },
      { id: 'sel3', name: 'Hög' },
      { id: 'sel4', name: 'Medel, Hög, Medel' }
    ], RiskSkala.labels());

    assert.equal(plan.updated, true);
    assert.deepEqual(plan.renamed, [{ from: 'Medel', to: 'Normal' }]);
    assert.deepEqual(plan.added, ['Förhöjd', 'Oacceptabel']);
    assert.deepEqual(plan.choices.map((c) => c.name), [
      'Normal',
      'Låg',
      'Hög',
      'Medel, Hög, Medel',
      'Förhöjd',
      'Oacceptabel'
    ]);
    assert.equal(plan.choices[0].id, 'sel1');
    assert.equal(plan.choices[0].color, 'yellowLight2');
  });

  it('byter Lag/Medel/Hog på kundens Riskniva', () => {
    const plan = planSelectChoiceMigration([
      { id: 'a', name: 'Lag' },
      { id: 'b', name: 'Medel' },
      { id: 'c', name: 'Hog' }
    ], RiskSkala.labels());

    assert.deepEqual(plan.renamed, [
      { from: 'Lag', to: 'Låg' },
      { from: 'Medel', to: 'Normal' },
      { from: 'Hog', to: 'Hög' }
    ]);
    assert.deepEqual(plan.added, ['Förhöjd', 'Oacceptabel']);
    assert.deepEqual(plan.choices.map((c) => c.name), [
      'Låg',
      'Normal',
      'Hög',
      'Förhöjd',
      'Oacceptabel'
    ]);
  });

  it('döper inte om om kanoniskt namn redan finns', () => {
    const plan = planSelectChoiceMigration([
      { id: 'a', name: 'Medel' },
      { id: 'b', name: 'Normal' }
    ], ['Låg', 'Normal']);

    assert.deepEqual(plan.renamed, []);
    assert.equal(plan.choices[0].name, 'Medel');
    assert.equal(plan.choices[1].name, 'Normal');
    assert.deepEqual(plan.added, ['Låg']);
  });

  it('normaliserar riskfält i payload', () => {
    const out = normalizeRiskFields({
      Riskbedömning: 'Medel',
      Riskniva: 'Hog',
      'Task Name': 'Bokföring'
    });
    assert.equal(out.Riskbedömning, 'Normal');
    assert.equal(out.Riskniva, 'Hög');
    assert.equal(out['Task Name'], 'Bokföring');
    assert.equal(shouldOmitRiskSelectValue('Riskbedömning', ''), true);
    assert.equal(shouldOmitRiskSelectValue('Task Name', ''), false);
  });

  it('saknade exakta etiketter ignorerar alias', () => {
    assert.deepEqual(missingExactRiskLabels(['Lag', 'Medel', 'Hog']), [
      'Låg',
      'Normal',
      'Förhöjd',
      'Hög',
      'Oacceptabel'
    ]);
    assert.deepEqual(missingExactRiskLabels(['Låg', 'Normal', 'Förhöjd', 'Hög', 'Oacceptabel']), []);
  });

  it('läser Airtable-fel som text', () => {
    const err = {
      message: 'Request failed with status code 422',
      response: {
        data: {
          error: {
            type: 'INVALID_MULTIPLE_CHOICE_OPTIONS',
            message: 'Insufficient permissions to create new select option ""Förhöjd""'
          }
        }
      }
    };
    assert.equal(isInvalidChoiceError(err), true);
    assert.match(airtableErrorMessage(err), /Förhöjd/);
  });

  it('plockar ut okänt Airtable-fält och tar bort det ur payload', () => {
    const err = {
      message: 'Request failed with status code 422',
      response: {
        data: {
          error: {
            type: 'UNKNOWN_FIELD_NAME',
            message: 'Unknown field name: "PT/TF-relevans"'
          }
        }
      }
    };
    assert.equal(unknownAirtableFieldName(err), 'PT/TF-relevans');
    assert.equal(unknownAirtableFieldName('Unknown field name: "Riskpoäng"'), 'Riskpoäng');
    const dropped = dropUnknownAirtableField({
      'PT/TF-relevans': 'TF',
      Riskpoäng: '{"sannolikhet":3}'
    }, 'PT/TF-relevans');
    assert.deepEqual(dropped, { Riskpoäng: '{"sannolikhet":3}' });
    assert.equal(dropUnknownAirtableField({ Riskpoäng: 'x' }, 'PT/TF-relevans'), null);
  });
});
