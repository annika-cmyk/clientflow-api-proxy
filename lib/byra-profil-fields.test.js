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
  coerceLegacyTextNumberValue,
  LEGACY_TEXT_NUMBER_AIRTABLE_FIELDS,
  buildProfilAirtableFields,
  textStoredAirtableNames,
  fieldsNeedingTextConversion,
  selectChoicesByAirtableName,
  extraSelectChoicesFromAirtableFields,
  selectChoicesNeededByAirtableName,
  missingSelectChoices,
  mergedSelectChoiceOptions,
  parseBolagsformer,
  formatBolagsformer,
  matchBolagsform,
  CHOICE_BOLAGSFORMER,
  CHOICE_LEVERANS,
  CHOICE_KUNDINTRO,
  isHogriskAnswered,
  isAnsweredValue,
  buildKunderEnkatSummary,
  KUNDER_PAGE_PROFIL_SECTION_IDS,
  formatProfilDisplayValue,
  normalizeLeveranssatt,
  isLeveransEndastDistans,
  isLeveransBlandad,
  isLeveransMedDistans,
  isLeveransFramstFysiskt,
  extractRejectedSelectOption,
  leveranssattForExistingChoices,
  adaptSelectWritesToExistingChoices,
  parseBetalningsmonster,
  normalizeBetalningsmonsterValue,
  CHOICE_BETALNINGSMONSTER
} = require('./byra-profil-fields');

function sampleValue(field) {
  if (field.type === 'number' || field.type === 'percent') return 1;
  if (field.type === 'bolagsformer') return 'AB: 3';
  if (field.type === 'branscher' || field.key === 'kundernasBranscher') return 'Bygg och anläggning: 5';
  if (field.type === 'hogrisk-branscher' || field.key === 'branscherKundstock') return HOGRISK_NONE_LABEL;
  if ((field.type === 'select' || field.type === 'multiselect') && Array.isArray(field.choices) && field.choices.length) {
    return field.choices[0];
  }
  return 'Ja';
}

describe('byra-profil-fields', () => {

  it('kundIntroduktion har rekommendation via kunder och personligt nätverkande', () => {
    const field = BYRA_PROFIL_FIELDS.find((f) => f.key === 'kundIntroduktion');
    assert.equal(field.type, 'select');
    assert.deepEqual(field.choices, CHOICE_KUNDINTRO);
    assert.ok(CHOICE_KUNDINTRO.includes('Rekommendation via befintliga kunder'));
    assert.ok(CHOICE_KUNDINTRO.includes('Via personligt nätverkande'));
    const needed = selectChoicesByAirtableName().get('Kundens ursprung introduktion');
    assert.deepEqual(needed, CHOICE_KUNDINTRO);
  });

  it('synkar egna select-alternativ in i needed choices vid sparning', () => {
    const extras = extraSelectChoicesFromAirtableFields({
      'Kundens ursprung introduktion': 'Mässor och branschevent',
      'Leveranssätt': CHOICE_LEVERANS[0],
      'Andel nystartade bolag': 10
    });
    assert.deepEqual(extras.get('Kundens ursprung introduktion'), ['Mässor och branschevent']);
    assert.equal(extras.has('Leveranssätt'), false);

    const needed = selectChoicesNeededByAirtableName(BYRA_PROFIL_FIELDS, extras);
    assert.ok(needed.get('Kundens ursprung introduktion').includes('Mässor och branschevent'));
    assert.ok(needed.get('Kundens ursprung introduktion').includes('Egen marknadsföring'));
  });

  it('betalningsmonster är flerval med egna alternativ', () => {
    const field = BYRA_PROFIL_FIELDS.find((f) => f.key === 'betalningsmonster');
    assert.equal(field.type, 'multiselect');
    assert.equal(field.allowCustom, true);
    assert.deepEqual(field.choices, CHOICE_BETALNINGSMONSTER);
  });

  it('tolkar äldre fritext-svar för betalningsmönster', () => {
    assert.deepEqual(parseBetalningsmonster('Faktura och Swish är vanligast.'), ['Faktura', 'Swish']);
    assert.equal(
      normalizeBetalningsmonsterValue('Kontant och Swish i butik, faktura i övrigt'),
      'Kontant, Faktura, Swish'
    );
    assert.deepEqual(parseBetalningsmonster('Faktura, Swish, PayPal'), ['Faktura', 'Swish', 'PayPal']);
    assert.deepEqual(parseBetalningsmonster('Kryptovaluta'), ['Kryptovaluta']);
  });

  it('mappar Airtable-fritext till normaliserad lista', () => {
    const mapped = mapProfilFromAirtable({ 'Betalningsmönster': 'Faktura och Swish är vanligast.' });
    assert.equal(mapped.betalningsmonster, 'Faktura, Swish');
    const field = BYRA_PROFIL_FIELDS.find((f) => f.key === 'betalningsmonster');
    assert.equal(formatProfilDisplayValue(field, mapped.betalningsmonster), 'Faktura · Swish');
  });

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

  it('kräver antal-följdfråga när Ja väljs för högrisktjänster och kundfrågor', () => {
    const base = Object.fromEntries(BYRA_PROFIL_FIELDS.map((f) => [f.key, sampleValue(f)]));
    base.bolagsbildningAtKund = 'Ja';
    base.bolagsbildningAtKundAntal = '';
    assert.equal(
      isFieldRequired(BYRA_PROFIL_FIELDS.find((f) => f.key === 'bolagsbildningAtKundAntal'), base),
      true
    );
    assert.ok(unansweredKeys(base).includes('bolagsbildningAtKundAntal'));

    base.bolagsbildningAtKund = 'Nej';
    assert.equal(
      isFieldRequired(BYRA_PROFIL_FIELDS.find((f) => f.key === 'bolagsbildningAtKundAntal'), base),
      false
    );
    assert.ok(!unansweredKeys(base).includes('bolagsbildningAtKundAntal'));

    base.pepKunder = 'Ja';
    base.pepKunderAntal = '';
    assert.ok(unansweredKeys(base).includes('pepKunderAntal'));
    base.pepKunderAntal = 2;
    assert.ok(!unansweredKeys(base).includes('pepKunderAntal'));

    const antalKeys = BYRA_PROFIL_FIELDS.filter(
      (f) => f.requiredWhen && f.requiredWhen.equals === 'Ja' && f.type === 'number'
    ).map((f) => f.key);
    assert.ok(antalKeys.includes('bolagsbildningAtKundAntal'));
    assert.ok(antalKeys.includes('komplexaAgarstrukturerAntal'));
    assert.ok(antalKeys.length >= 9);
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

  it('skriver Antal anställda som text (Airtable singleLineText)', () => {
    assert.ok(LEGACY_TEXT_NUMBER_AIRTABLE_FIELDS.has('Antal anställda'));
    assert.equal(coerceLegacyTextNumberValue('Antal anställda', 1), '1');
    assert.equal(coerceLegacyTextNumberValue('Antal anställda', 0), '0');
    assert.equal(coerceLegacyTextNumberValue('Antal anställda', null), null);
    assert.equal(coerceLegacyTextNumberValue('Antal kunder', 8), 8);

    const built = buildProfilAirtableFields({ antalAnstallda: 1, omsattning: '1000000' });
    assert.deepEqual(built.errors, []);
    assert.equal(built.fields['Antal anställda'], '1');
    assert.equal(typeof built.fields['Antal anställda'], 'string');
    assert.equal(built.fields.Omsättning, '1000000');

    assert.deepEqual(sanitizeAirtablePatchFields({
      'Antal anställda': 1,
      'Antal kundföretag': 100,
      Omsättning: 500000,
      'Antal kunder': 8
    }), {
      'Antal anställda': '1',
      'Antal kundföretag': '100',
      Omsättning: '500000',
      'Antal kunder': 8
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
    assert.equal(airtableTypeForField(BYRA_PROFIL_FIELDS.find((f) => f.key === 'branscherKundstock')), 'multilineText');
    assert.equal(airtableTypeForField(BYRA_PROFIL_FIELDS.find((f) => f.key === 'kundernasBranscher')), 'multilineText');
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
    assert.deepEqual(missingSelectChoices(leverans, needed), CHOICE_LEVERANS.slice());
    const merged = mergedSelectChoiceOptions(leverans, needed);
    assert.deepEqual(
      merged.map((c) => c.name),
      ['På plats', 'Distans'].concat(CHOICE_LEVERANS)
    );
  });

  it('normaliserar äldre leveranssätt till beskrivande val', () => {
    assert.equal(CHOICE_LEVERANS.length, 5);
    assert.equal(normalizeLeveranssatt('Distans'), 'Vi träffar kunder endast på distans');
    assert.equal(
      normalizeLeveranssatt('På plats'),
      'Vi träffar kunder nästan uteslutande fysiskt – t.ex. överlämning av material'
    );
    assert.equal(
      normalizeLeveranssatt('Blandat'),
      'Vi träffar kunder både fysiskt ibland och digitalt regelbundet'
    );
    assert.equal(
      normalizeLeveranssatt('Onboarding fysiskt, därefter främst distans'),
      'Onboarding fysiskt, därefter främst distans'
    );
    assert.equal(isLeveransEndastDistans('Distans'), true);
    assert.equal(isLeveransEndastDistans('Vi träffar kunder endast på distans'), true);
    assert.equal(isLeveransFramstFysiskt('På plats'), true);
    assert.equal(isLeveransBlandad('Blandat'), true);
    assert.equal(isLeveransBlandad('Blandad modell – varierar kraftigt mellan kunder'), true);
    assert.equal(isLeveransBlandad('Onboarding fysiskt, därefter främst distans'), true);
    assert.equal(isLeveransMedDistans('Distans'), true);
    assert.equal(isLeveransMedDistans('På plats'), false);
  });

  it('mappar och skriver leveranssätt med legacy-kompatibilitet', () => {
    const mapped = mapProfilFromAirtable({ Leveranssätt: 'Distans' });
    assert.equal(mapped.leveranssatt, 'Vi träffar kunder endast på distans');
    const built = buildProfilAirtableFields({ leveranssatt: 'Blandat' });
    assert.equal(
      built.fields['Leveranssätt'],
      'Vi träffar kunder både fysiskt ibland och digitalt regelbundet'
    );
  });

  it('plockar ut nekade select-val trots dubbla citationstecken från Airtable', () => {
    assert.equal(
      extractRejectedSelectOption(
        'Insufficient permissions to create new select option ""Vi träffar kunder både fysiskt ibland och digitalt regelbundet""'
      ),
      'Vi träffar kunder både fysiskt ibland och digitalt regelbundet'
    );
    assert.equal(
      extractRejectedSelectOption('Insufficient permissions to create new select option "Förhöjd"'),
      'Förhöjd'
    );
    assert.equal(extractRejectedSelectOption('Other error'), null);
  });

  it('skriver Distans/På plats/Blandat när Airtable saknar de beskrivande valen', () => {
    assert.equal(
      leveranssattForExistingChoices('Vi träffar kunder både fysiskt ibland och digitalt regelbundet', [
        'På plats',
        'Distans',
        'Blandat'
      ]),
      'Blandat'
    );
    assert.equal(
      leveranssattForExistingChoices('Distans', ['På plats', 'Distans', 'Blandat']),
      'Distans'
    );
    assert.equal(
      leveranssattForExistingChoices('Vi träffar kunder endast på distans', CHOICE_LEVERANS),
      'Vi träffar kunder endast på distans'
    );
    const adapted = adaptSelectWritesToExistingChoices(
      {
        Leveranssätt: 'Vi träffar kunder både fysiskt ibland och digitalt regelbundet',
        'Antal kunder': 12
      },
      {
        fields: [
          {
            name: 'Leveranssätt',
            type: 'singleSelect',
            options: { choices: [{ name: 'På plats' }, { name: 'Distans' }, { name: 'Blandat' }] }
          }
        ]
      }
    );
    assert.equal(adapted['Leveranssätt'], 'Blandat');
    assert.equal(adapted['Antal kunder'], 12);
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
    assert.equal(field.type, 'hogrisk-branscher');
    assert.match(field.question, /högriskbranscher/i);
    const kundBransch = BYRA_PROFIL_FIELDS.find((f) => f.key === 'kundernasBranscher');
    assert.ok(kundBransch);
    assert.equal(kundBransch.type, 'branscher');
    assert.equal(isAnsweredValue('Bygg och anläggning: 5', kundBransch), true);
    assert.equal(isAnsweredValue('Bygg och anläggning', kundBransch), false);
  });

  it('kräver följdfält bara när föräldrasvaret är Ja', () => {
    const base = Object.fromEntries(BYRA_PROFIL_FIELDS.map((f) => [f.key, sampleValue(f)]));
    base.outsourcingUnderleverantorer = 'Nej';
    base.outsourcingUnderleverantorerDetalj = '';
    base.nearMisses = 'Nej';
    base.nearMissesDetalj = '';
    base.lanstyrelsenAnmarkningar = 'Nej';
    base.lanstyrelsenAnmarkningarDetalj = '';
    base.storaKundberoenden = 'Nej';
    base.storaKundberoendenAndel = '';
    base.betalningsuppdrag = 'Nej';
    base.betalningsuppdragAntal = '';
    base.kunderIUtsattaOmraden = 'Nej';
    base.kunderIUtsattaOmradenAntal = '';
    assert.equal(isFieldRequired(BYRA_PROFIL_FIELDS.find((f) => f.key === 'outsourcingUnderleverantorerDetalj'), base), false);
    assert.ok(!unansweredKeys(base).includes('outsourcingUnderleverantorerDetalj'));
    assert.ok(!unansweredKeys(base).includes('nearMissesDetalj'));
    assert.ok(!unansweredKeys(base).includes('storaKundberoendenAndel'));
    assert.ok(!unansweredKeys(base).includes('betalningsuppdragAntal'));
    assert.ok(!unansweredKeys(base).includes('kunderIUtsattaOmradenAntal'));
    base.outsourcingUnderleverantorer = 'Ja';
    assert.ok(unansweredKeys(base).includes('outsourcingUnderleverantorerDetalj'));
    base.outsourcingUnderleverantorerDetalj = 'Bokföring i Polen';
    assert.ok(!unansweredKeys(base).includes('outsourcingUnderleverantorerDetalj'));
    base.betalningsuppdrag = 'Ja';
    assert.ok(unansweredKeys(base).includes('betalningsuppdragAntal'));
    base.betalningsuppdragAntal = 12;
    assert.ok(!unansweredKeys(base).includes('betalningsuppdragAntal'));
    base.kunderIUtsattaOmraden = 'Ja';
    assert.ok(unansweredKeys(base).includes('kunderIUtsattaOmradenAntal'));
    base.kunderIUtsattaOmradenAntal = 4;
    assert.ok(!unansweredKeys(base).includes('kunderIUtsattaOmradenAntal'));
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

describe('kunder enkät-sammanfattning', () => {
  it('inkluderar kundstock, geografi och kundintro', () => {
    assert.deepEqual(KUNDER_PAGE_PROFIL_SECTION_IDS, ['kundstock', 'geografi', 'kundintro']);
  });

  it('returnerar tom sammanfattning utan svar', () => {
    const summary = buildKunderEnkatSummary({});
    assert.equal(summary.hasAnswers, false);
    assert.equal(summary.groups.length, 0);
    assert.match(summary.enkateHref, /section=kundstock/);
    assert.equal(summary.analysisHref, 'kundrisker-mm.html');
  });

  it('visar ifyllda kundstock-svar och slår ihop antal', () => {
    const summary = buildKunderEnkatSummary({
      antalKunder: 42,
      vanligasteBolagsformer: 'AB: 30, Enskild firma: 12',
      kundernasBranscher: 'Bygg: 10, Restaurang: 5',
      branscherKundstock: 'Inga högriskbranscher',
      pepKunder: 'Ja',
      pepKunderAntal: 2,
      geografiskMarknad: 'Sverige',
      andelNystartadeBolag: 15
    });
    assert.equal(summary.hasAnswers, true);
    const kundstock = summary.groups.find((g) => g.id === 'kundstock');
    assert.ok(kundstock);
    const pep = kundstock.items.find((i) => i.key === 'pepKunder');
    assert.ok(pep);
    assert.equal(pep.display, 'Ja · ca 2');
    assert.ok(!kundstock.items.some((i) => i.key === 'pepKunderAntal'));
    const br = kundstock.items.find((i) => i.key === 'kundernasBranscher');
    assert.ok(br);
    assert.match(br.display, /Bygg/);
    const geo = summary.groups.find((g) => g.id === 'geografi');
    assert.ok(geo && geo.items.some((i) => i.key === 'geografiskMarknad'));
    const intro = summary.groups.find((g) => g.id === 'kundintro');
    assert.ok(intro);
    const nyst = intro.items.find((i) => i.key === 'andelNystartadeBolag');
    assert.equal(nyst.display, '15 %');
  });

  it('formaterar bolagsformer med mittpunkt', () => {
    const field = BYRA_PROFIL_FIELDS.find((f) => f.key === 'vanligasteBolagsformer');
    assert.equal(formatProfilDisplayValue(field, 'AB: 3, HB: 1'), 'AB · 3, HB · 1');
  });
});
