const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  BYRA_PROFIL_FIELDS,
  BYRA_PROFIL_SECTIONS,
  HOGRISK_NONE_LABEL,
  unansweredKeys,
  isProfilComplete,
  isFieldRequired,
  mapProfilFromAirtable,
  airtableEnsureSpecs,
  airtableTypeForField,
  formatProfilPromptBlock,
  toTextOrNull,
  toNumberOrNull,
  isBlankWriteValue,
  sanitizeAirtablePatchFields,
  buildProfilAirtableFields,
  textStoredAirtableNames,
  fieldsNeedingTextConversion,
  selectChoicesByAirtableName,
  missingSelectChoices,
  mergedSelectChoiceOptions,
  parseBolagsformer,
  formatBolagsformer,
  matchBolagsform,
  CHOICE_BOLAGSFORMER,
  isHogriskAnswered,
  isAnsweredValue
} = require('./byra-profil-fields');

function sampleValue(field) {
  if (field.type === 'number' || field.type === 'percent') return 1;
  if (field.type === 'bolagsformer') return 'AB: 3';
  if (field.key === 'branscherKundstock') return HOGRISK_NONE_LABEL;
  if ((field.type === 'select' || field.type === 'multiselect') && Array.isArray(field.choices) && field.choices.length) {
    return field.choices[0];
  }
  return 'Ja';
}

describe('byra-profil-fields', () => {
  it('har tio sektioner med fieldKeys', () => {
    assert.equal(BYRA_PROFIL_SECTIONS.length, 10);
    const ids = BYRA_PROFIL_SECTIONS.map((s) => s.id);
    assert.deepEqual(ids, [
      'intern',
      'kundstock',
      'distribution',
      'tjanster',
      'geografi',
      'historik',
      'beroende',
      'hogrisktjanster',
      'kundintro',
      'outsourcing'
    ]);
    BYRA_PROFIL_SECTIONS.forEach((s) => {
      assert.ok(Array.isArray(s.fieldKeys) && s.fieldKeys.length > 0, s.id);
    });
  });

  it('kräver alla obligatoriska fält för komplett profil', () => {
    assert.equal(isProfilComplete({}), false);
    const full = Object.fromEntries(BYRA_PROFIL_FIELDS.map((f) => [f.key, sampleValue(f)]));
    assert.equal(unansweredKeys(full).length, 0);
    assert.equal(isProfilComplete(full), true);
  });

  it('kräver Annat-text endast när Annat är valt', () => {
    const base = Object.fromEntries(BYRA_PROFIL_FIELDS.map((f) => [f.key, sampleValue(f)]));
    base.bokforingssystem = 'Fortnox';
    base.bokforingssystemAnnat = '';
    assert.equal(isFieldRequired(BYRA_PROFIL_FIELDS.find((f) => f.key === 'bokforingssystemAnnat'), base), false);
    assert.ok(!unansweredKeys(base).includes('bokforingssystemAnnat'));

    base.bokforingssystem = 'Annat';
    assert.equal(isFieldRequired(BYRA_PROFIL_FIELDS.find((f) => f.key === 'bokforingssystemAnnat'), base), true);
    assert.ok(unansweredKeys(base).includes('bokforingssystemAnnat'));

    base.bokforingssystemAnnat = 'Eget system';
    assert.ok(!unansweredKeys(base).includes('bokforingssystemAnnat'));
    assert.equal(isProfilComplete(base), true);

    base.bokforingssystem = 'Fortnox, Annat';
    base.bokforingssystemAnnat = '';
    assert.equal(isFieldRequired(BYRA_PROFIL_FIELDS.find((f) => f.key === 'bokforingssystemAnnat'), base), true);
    assert.ok(unansweredKeys(base).includes('bokforingssystemAnnat'));
    base.bokforingssystemAnnat = 'Eget system';
    assert.ok(!unansweredKeys(base).includes('bokforingssystemAnnat'));
  });

  it('mappar Airtable och skapar ensure-specs för IT-systemkolumner', () => {
    const mapped = mapProfilFromAirtable({
      'Antal kontor': 2,
      Bokföringssystem: 'Fortnox',
      Bokslutssystem: 'Capego',
      Kundhanteringssystem: 'ClientFlow'
    });
    assert.equal(mapped.antalKontor, 2);
    assert.equal(mapped.bokforingssystem, 'Fortnox');
    assert.equal(mapped.bokslutssystem, 'Capego');
    assert.equal(mapped.kundhanteringssystem, 'ClientFlow');
    const mappedMulti = mapProfilFromAirtable({
      Bokföringssystem: ['Fortnox', 'Visma']
    });
    assert.equal(mappedMulti.bokforingssystem, 'Fortnox, Visma');
    const mappedLegacy = mapProfilFromAirtable({
      'Bokföringssystem (singleSelect-legacy)': 'Fortnox'
    });
    assert.equal(mappedLegacy.bokforingssystem, 'Fortnox');
    const specs = airtableEnsureSpecs();
    assert.ok(specs.some((s) => s.name === 'Antal kontor'));
    assert.ok(specs.some((s) => s.name === 'Bokföringssystem' && s.type === 'singleLineText'));
    assert.ok(specs.some((s) => s.name === 'Bokslutssystem'));
    assert.ok(specs.some((s) => s.name === 'Kundhanteringssystem'));
    assert.ok(specs.some((s) => s.name === 'Bokföringssystem annat' && s.type === 'singleLineText'));
    assert.ok(!specs.some((s) => s.name === 'Antal anställda'));
  });

  it('formaterar promptblock', () => {
    const block = formatProfilPromptBlock({
      antalAnstallda: 3,
      branscherKundstock: HOGRISK_NONE_LABEL,
      bokforingssystem: 'Fortnox'
    });
    assert.match(block, /Antal anställda: 3/);
    assert.match(block, /Inga högriskbranscher/);
    assert.match(block, /Bokföringssystem: Fortnox/);
    assert.doesNotMatch(block, /Bokföringssystem \(annat\)/);
  });

  it('rensar tomma select-värden till null innan Airtable-skrivning', () => {
    assert.equal(toTextOrNull(''), null);
    assert.equal(toTextOrNull('   '), null);
    assert.equal(toTextOrNull('Välj...'), null);
    assert.equal(toTextOrNull('Välj'), null);
    assert.equal(toTextOrNull('Ja'), 'Ja');
    assert.equal(toTextOrNull(['Fortnox', 'Visma']), 'Fortnox, Visma');
    assert.equal(toTextOrNull(['', '  ']), null);
    assert.equal(toNumberOrNull(''), null);
    assert.equal(toNumberOrNull('12,5'), 12.5);
    assert.equal(isBlankWriteValue('Välj...'), true);
    assert.deepEqual(sanitizeAirtablePatchFields({
      Leveranssätt: '',
      'BankID-krav': 'Välj...',
      'PEP-kunder': 'Ja',
      'Default faktureringsperiod': '   '
    }), {
      Leveranssätt: null,
      'BankID-krav': null,
      'PEP-kunder': 'Ja',
      'Default faktureringsperiod': null
    });
  });

  it('mappar hela byråprofilen inkl. befintliga fält och flerval', () => {
    const built = buildProfilAirtableFields({
      leveranssatt: '',
      branscherKundstock: ['Bygg', 'Restaurang'],
      bokforingssystem: ['Fortnox', 'Visma'],
      bokforingssystemAnnat: '',
      auktoriseradeKonsulter: 'Ja',
      andelHogriskbransch: '10',
      antalKunder: '8',
      vanligasteBolagsformer: 'AB: 4, Enskild firma: 2'
    });
    assert.deepEqual(built.errors, []);
    assert.equal(built.fields['Leveranssätt'], null);
    assert.equal(built.fields['Branscher i kundstocken'], 'Bygg, Restaurang');
    assert.equal(built.fields.Bokföringssystem, 'Fortnox, Visma');
    assert.equal(built.fields['Bokföringssystem annat'], null);
    assert.equal(built.fields['Auktoriserade konsulter'], 'Ja');
    assert.equal(built.fields['Andel kunder i högriskbransch'], 10);
    assert.equal(built.fields['Antal kunder'], 8);
    assert.equal(built.fields['Vanligaste bolagsformer'], 'AB: 4, Enskild firma: 2');

    const badPct = buildProfilAirtableFields({ andelHogriskbransch: 140 });
    assert.match(badPct.errors[0], /mellan 0 och 100/);
  });

  it('skapar select som singleSelect och flerval som text', () => {
    const specs = airtableEnsureSpecs();
    const byName = Object.fromEntries(specs.map((s) => [s.name, s]));
    assert.equal(byName['Auktoriserade konsulter'].type, 'singleSelect');
    assert.deepEqual(byName['Auktoriserade konsulter'].options.choices.map((c) => c.name), ['Ja', 'Nej']);
    assert.equal(byName.Bokföringssystem.type, 'singleLineText');
    assert.equal(byName.Bokslutssystem.type, 'singleLineText');
    assert.equal(byName.Kundhanteringssystem.type, 'singleLineText');
    assert.equal(airtableTypeForField(BYRA_PROFIL_FIELDS.find((f) => f.key === 'branscherKundstock')), 'singleLineText');
    assert.equal(airtableTypeForField(BYRA_PROFIL_FIELDS.find((f) => f.key === 'vanligasteBolagsformer')), 'multilineText');
    assert.equal(airtableTypeForField(BYRA_PROFIL_FIELDS.find((f) => f.key === 'leveranssatt')), 'singleSelect');

    const selectFields = BYRA_PROFIL_FIELDS.filter((f) => f.type === 'select');
    assert.ok(selectFields.length > 10);
    selectFields.forEach((f) => {
      assert.ok(Array.isArray(f.choices) && f.choices.length, f.key);
      assert.ok(!f.choices.includes(''), f.key);
      assert.ok(!f.choices.includes('Delvis'), f.key);
    });
  });

  it('identifierar live-fält som måste konverteras från select till text', () => {
    const live = [
      { name: 'Bokföringssystem', type: 'singleSelect', options: { choices: [{ name: 'Fortnox' }] } },
      { name: 'Bokslutssystem', type: 'singleSelect' },
      { name: 'Kundhanteringssystem', type: 'multipleSelects' },
      { name: 'Branscher i kundstocken', type: 'multilineText' },
      { name: 'Leveranssätt', type: 'singleSelect', options: { choices: [{ name: 'På plats' }, { name: 'Distans' }] } },
      { name: 'Vanligaste bolagsformer', type: 'multilineText' },
      { name: 'Bokföringssystem (legacy select)', type: 'singleSelect' }
    ];
    assert.deepEqual(
      fieldsNeedingTextConversion(live).map((f) => f.name),
      ['Bokföringssystem', 'Bokslutssystem', 'Kundhanteringssystem']
    );
    assert.ok(textStoredAirtableNames().includes('Branscher i kundstocken'));
    assert.ok(textStoredAirtableNames().includes('Bokföringssystem'));
    assert.ok(!textStoredAirtableNames().includes('Leveranssätt'));

    const leverans = live.find((f) => f.name === 'Leveranssätt');
    const needed = selectChoicesByAirtableName().get('Leveranssätt');
    assert.deepEqual(missingSelectChoices(leverans, needed), ['Blandat']);
    const merged = mergedSelectChoiceOptions(leverans, needed);
    assert.deepEqual(merged.map((c) => c.name), ['På plats', 'Distans', 'Blandat']);
  });

  it('tolkar bolagsformer från flerval med antal och äldre fritext', () => {
    assert.ok(CHOICE_BOLAGSFORMER.includes('Bostadsrättsförening (BRF)'));
    assert.ok(CHOICE_BOLAGSFORMER.includes('Ideell förening'));
    assert.equal(matchBolagsform('en brf'), 'Bostadsrättsförening (BRF)');
    assert.equal(matchBolagsform('idiell förening'), 'Ideell förening');
    assert.deepEqual(
      parseBolagsformer('AB, enskild firma, en brf och en idiell förening'),
      [
        { form: 'AB', count: '' },
        { form: 'Enskild firma', count: '' },
        { form: 'Bostadsrättsförening (BRF)', count: '' },
        { form: 'Ideell förening', count: '' }
      ]
    );
    assert.deepEqual(parseBolagsformer('AB: 10, HB: 2'), [
      { form: 'AB', count: '10' },
      { form: 'HB', count: '2' }
    ]);
    assert.equal(formatBolagsformer([
      { form: 'AB', count: '10' },
      { form: 'Enskild firma', count: '3' }
    ]), 'AB: 10, Enskild firma: 3');
    const field = BYRA_PROFIL_FIELDS.find((f) => f.key === 'vanligasteBolagsformer');
    assert.equal(field.type, 'bolagsformer');
    assert.equal(airtableTypeForField(field), 'multilineText');
  });

  it('kräver antal för högriskbranscher utom Inga högriskbranscher', () => {
    const field = BYRA_PROFIL_FIELDS.find((f) => f.key === 'branscherKundstock');
    assert.equal(isHogriskAnswered('Inga högriskbranscher'), true);
    assert.equal(isHogriskAnswered('Bygg, Restaurang'), false);
    assert.equal(isHogriskAnswered('Bygg: 8, Restaurang: 3'), true);
    assert.equal(isAnsweredValue('Bygg: 8, Restaurang: 3', field), true);
    assert.equal(isAnsweredValue('Bygg, Restaurang', field), false);
    assert.ok(!BYRA_PROFIL_FIELDS.some((f) => (f.choices || []).includes('Delvis')));
    assert.match(field.question, /antal/);
  });

  it('räknar near misses även som avböjda uppdrag när risken inte kunde hanteras', () => {
    const field = BYRA_PROFIL_FIELDS.find((f) => f.key === 'nearMisses');
    const detalj = BYRA_PROFIL_FIELDS.find((f) => f.key === 'nearMissesDetalj');
    assert.match(field.question, /tackat nej/);
    assert.match(field.question, /risk/);
    assert.match(field.hint, /uppdrag/);
    assert.match(detalj.question, /risken inte kunde hanteras/);
    assert.match(formatProfilPromptBlock({ nearMisses: 'Ja' }), /misstanke eller risk/);
  });
});
