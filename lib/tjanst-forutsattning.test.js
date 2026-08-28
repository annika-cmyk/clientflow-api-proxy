const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../public/js/tjanst-forutsattning');
const KundRiskprofil = require('../public/js/kund-riskprofil');

const LAGER_ATGARDER = [
  { titel: 'Automatiserad lagervärdering', beskrivning: 'Förutsätter att kunden har ett lagerhanteringssystem.', atgardTyp: T.TYP.KUNDBEROENDE },
  { titel: 'Stickprov mot underlag', beskrivning: 'Byrån granskar slumpade rader i bokslutsprogrammet.', atgardTyp: T.TYP.BYRARUTIN }
];

const LAGER_FIELDS = {
  'Task Name': 'Hantering av lager',
  'Tjänstespecifika åtgärder': JSON.stringify(LAGER_ATGARDER),
  Riskpoäng: JSON.stringify({
    sannolikhet: 4,
    konsekvens: 4,
    sannolikhetEfter: 2,
    konsekvensEfter: 2
  })
};

function lagerTjanst() {
  return { id: 'recLager', fields: LAGER_FIELDS, namn: 'Hantering av lager', atgarder: LAGER_ATGARDER };
}

describe('tjanst-forutsattning', () => {
  it('föreslår kundberoende för Automatiserad lagervärdering utan att sätta typen automatiskt', () => {
    const forslag = T.suggestAtgardTyp({
      titel: 'Automatiserad lagervärdering',
      beskrivning: 'Kräver att kunden har ett lagerhanteringssystem.'
    });
    assert.equal(forslag.typ, T.TYP.KUNDBEROENDE);
    assert.equal(T.normalizeAtgardTyp(undefined), '');
    assert.equal(T.isKundberoende({ titel: 'Automatiserad lagervärdering' }), false);
  });

  it('låter en tjänst med bara byrårutin vara opåverkad av kundfältet', () => {
    const tjanst = {
      id: 'recBok',
      namn: 'Löpande bokföring',
      atgarder: [{ titel: 'Känn kunden', atgardTyp: T.TYP.BYRARUTIN }],
      sannolikhet: 3,
      konsekvens: 3,
      sannolikhetEfter: 2,
      konsekvensEfter: 2
    };
    const state = {
      recBok: {
        forutsattningar: {
          [T.atgardKey(tjanst.atgarder[0])]: { uppfylld: 'Nej', motivering: 'skulle inte gälla' }
        }
      }
    };
    const item = T.applyToResidualItem(tjanst, state);
    assert.equal(item.residualProduct, 4);
    assert.equal(item.residualSource, 'mall');
    assert.equal(item.forutsattning.hasKundberoende, false);
    const foreslagen = KundRiskprofil.beraknaForeslagenNiva({ tjanster: [item] });
    assert.equal(foreslagen.product, 4);
    assert.equal(foreslagen.niva, 'Låg');
  });

  it('faller tillbaka till inneboende risk vid Nej tills override satts', () => {
    const tjanst = lagerTjanst();
    const key = T.atgardKey(LAGER_ATGARDER[0]);
    const utan = T.applyToResidualItem(tjanst, {
      recLager: {
        forutsattningar: { [key]: { uppfylld: 'Nej', motivering: 'Inget lagerhanteringssystem.' } }
      }
    });
    assert.equal(utan.residualSource, 'inneboende');
    assert.equal(utan.residualProduct, 16);
    assert.equal(utan.mallResidualProduct, 4);
    assert.equal(utan.forutsattning.needsOverride, true);
    assert.match(utan.forutsattning.warning, /manuell bedömning/);

    const med = T.applyToResidualItem(tjanst, {
      recLager: {
        forutsattningar: { [key]: { uppfylld: 'Nej', motivering: 'Inget lagerhanteringssystem.' } },
        override: { sannolikhetEfter: 4, konsekvensEfter: 3 }
      }
    });
    assert.equal(med.residualSource, 'override');
    assert.equal(med.residualProduct, 12);
    assert.equal(med.forutsattning.needsOverride, false);

    const foreslagen = KundRiskprofil.beraknaForeslagenNiva({ tjanster: [utan] });
    assert.equal(foreslagen.product, 16);
    assert.equal(foreslagen.niva, 'Hög');
    assert.match(foreslagen.drivandeFaktor, /Hantering av lager/);
  });

  it('flaggar True Horses lager-tjänst när Automatiserad lagervärdering är Nej', () => {
    const fields = {
      Namn: 'True Horses AB',
      'Kundens utvalda tjänster': ['recLager'],
      [T.FIELD]: JSON.stringify({
        recLager: {
          forutsattningar: {
            [T.atgardKey(LAGER_ATGARDER[0])]: {
              uppfylld: 'Nej',
              motivering: 'Inget lagerhanteringssystem, dålig ordning.'
            }
          }
        }
      })
    };
    const item = KundRiskprofil.itemsFromTjanstRecords(
      [{ id: 'recLager', fields: LAGER_FIELDS }],
      { fields }
    )[0];
    assert.equal(item.residualSource, 'inneboende');
    assert.equal(item.residualProduct, 16);
    assert.equal(item.forutsattning.status, 'nej');
    assert.match(item.forutsattning.warning, /Standardåtgärder ej uppfyllda/);

    const calc = KundRiskprofil.foreslagenFromLinkedRecords(
      fields,
      [{ id: 'recLager', fields: LAGER_FIELDS }],
      []
    );
    assert.equal(calc.product, 16);
    assert.equal(calc.niva, 'Hög');
  });

  it('kräver motivering vid Delvis eller Nej', () => {
    assert.equal(T.validateForutsattningRow({ uppfylld: 'Nej' }).ok, false);
    assert.equal(T.validateForutsattningRow({ uppfylld: 'Delvis', motivering: 'Delvis system' }).ok, true);
    assert.equal(T.validateForutsattningRow({ uppfylld: 'Ja' }).ok, true);
  });

  it('Delvis varnar men blockerar inte mallens residual', () => {
    const item = T.applyToResidualItem(lagerTjanst(), {
      recLager: {
        forutsattningar: {
          [T.atgardKey(LAGER_ATGARDER[0])]: { uppfylld: 'Delvis', motivering: 'Manuell lista.' }
        }
      }
    });
    assert.equal(item.residualProduct, 4);
    assert.equal(item.residualSource, 'mall');
    assert.equal(item.forutsattning.status, 'delvis');
    assert.match(item.forutsattning.warning, /delvis/);
  });

  it('prioriterar True Horses och riskflaggor i migreringsrapporten', () => {
    const rapport = T.buildMigreringsrapport({
      tjansterById: { recLager: lagerTjanst() },
      kunder: [
        {
          id: 'recA',
          fields: {
            Namn: 'Alfa AB',
            'Kundens utvalda tjänster': ['recLager']
          }
        },
        {
          id: 'recTH',
          fields: {
            Namn: 'True Horses AB',
            'Kundens utvalda tjänster': ['recLager'],
            'Riskhöjande faktorer övrigt': ['Bristfälliga bokföringsrutiner']
          }
        },
        {
          id: 'recB',
          fields: {
            Namn: 'Beta AB',
            'Kundens utvalda tjänster': ['recLager'],
            'Riskhöjande faktorer övrigt': ['Otydlig affärsmodell']
          }
        }
      ]
    });
    assert.equal(rapport.antal, 3);
    assert.equal(rapport.kunder[0].namn, 'True Horses AB');
    assert.equal(rapport.prioriterade.length, 2);
    assert.ok(rapport.prioriterade.some((r) => r.namn === 'Beta AB'));
    assert.equal(rapport.ovriga[0].namn, 'Alfa AB');
    assert.deepEqual(rapport.kunder[0].tjanster[0].obedomda, ['Automatiserad lagervärdering']);
  });

  it('granskningslistan föreslår typ men sätter den inte', () => {
    const lista = T.buildGranskningslista([{
      id: 'recLager',
      namn: 'Hantering av lager',
      atgarder: [{ titel: 'Automatiserad lagervärdering', beskrivning: 'Lagerhanteringssystem hos kunden.' }]
    }]);
    assert.equal(lista[0].atgarder[0].klassificerad, false);
    assert.equal(lista[0].atgarder[0].atgardTyp, '');
    assert.equal(lista[0].atgarder[0].forslagTyp, T.TYP.KUNDBEROENDE);
  });

  it('mappar redan utlästa tjänstposter utan Airtable-fields', () => {
    const mapped = {
      id: 'recLager',
      namn: 'Hantering av lager',
      atgarder: LAGER_ATGARDER,
      sannolikhet: 4,
      konsekvens: 4,
      sannolikhetEfter: 2,
      konsekvensEfter: 2
    };
    const items = KundRiskprofil.itemsFromTjanstRecords([mapped], {
      fields: {
        [T.FIELD]: JSON.stringify({
          recLager: {
            forutsattningar: {
              [T.atgardKey(LAGER_ATGARDER[0])]: { uppfylld: 'Nej', motivering: 'Inget system.' }
            }
          }
        })
      }
    });
    assert.equal(items[0].residualProduct, 16);
    assert.equal(items[0].residualSource, 'inneboende');
  });

  it('sidorna laddar modulen och kundkortet har checklistan', () => {
    const byraHtml = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const kundHtml = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    const byraJs = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const kundJs = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(byraHtml, /tjanst-forutsattning\.js/);
    assert.match(kundHtml, /tjanst-forutsattning\.js/);
    assert.match(byraJs, /atgardTyp|dyn-atgard-typ/);
    assert.match(byraJs, /uppdragsatgard/);
    assert.match(byraJs, /Kundspecifik åtgärd/);
    assert.match(byraJs, /Risksänkande åtgärd som ska kopplas till specifika uppdragskörningar/);
    assert.doesNotMatch(byraJs, /dyn-lags-ut/);
    assert.match(kundJs, /typTagClass|typTagLabel/);
    assert.match(kundJs, /forutsattning-group-title/);
    assert.match(kundJs, /tjanst-risk-pair/);
    assert.match(kundJs, /Inneboende/);
    assert.match(kundJs, /forutsattning-group-collapsed-risk/);
    assert.doesNotMatch(kundJs, /forutsattning-group-lead/);
    assert.match(kundJs, /forutsattning-nej/);
    assert.match(kundJs, /Godkänn/);
    assert.match(kundJs, /forutsattning-override/);
    assert.match(kundJs, /tjanst-forutsattning-editor/);
    assert.match(kundJs, /tjanst-risk-pair/);
    assert.match(kundJs, /Kundspecifika åtgärder/);
    assert.match(kundJs, /tjanst-kundspecifik-chip/);
    assert.match(kundJs, /_refreshForeslagnaAtgarderFromTjanster/);
    assert.match(kundJs, /_applyUppdragsatgarder/);
    assert.match(index, /tjanst-forutsattning-rapport/);
    assert.match(index, /TjanstForutsattning\.FIELD/);
    assert.match(index, /foreslagnaAtgarder/);
    assert.match(index, /itemsFromTjanstRecords/);
  });

  it('sänker beräknad föreslagen nivå när kundberoende förutsättning är ej uppfylld', () => {
    const tjanst = lagerTjanst();
    const key = T.atgardKey(LAGER_ATGARDER[0]);
    const state = {
      recLager: {
        forutsattningar: { [key]: { uppfylld: 'Nej', motivering: 'Inget lagerhanteringssystem.' } }
      }
    };
    const item = T.applyToResidualItem(tjanst, state);
    assert.equal(item.residualSource, 'inneboende');
    assert.equal(item.residualProduct, 16);
    const foreslagen = KundRiskprofil.beraknaForeslagenNiva({ tjanster: [item] });
    assert.equal(foreslagen.product, 16);
    assert.equal(foreslagen.niva, 'Hög');
    const tri = T.listKundForutsattningar([tjanst], state);
    assert.equal(tri[0].rows[0].triState, 'ej_uppfylld');
    assert.equal(T.fromTriState('ej_uppfylld'), 'Nej');
  });

  it('föreslår kompletterande åtgärd som kräver manuellt godkännande innan den sparas', () => {
    const tjanst = lagerTjanst();
    const key = T.atgardKey(LAGER_ATGARDER[0]);
    const state = {
      recLager: {
        forutsattningar: { [key]: { uppfylld: 'Nej', motivering: 'Inget lagerhanteringssystem.' } }
      }
    };
    const forslag = T.buildForeslagnaAtgarder([tjanst], state, '');
    assert.equal(forslag.length, 1);
    assert.equal(forslag[0].approved, false);
    assert.match(forslag[0].text, /manuell lagerinventering/i);
    assert.equal(T.applyApprovedAtgarder('', []), '');
    assert.doesNotMatch(T.applyApprovedAtgarder('', []), /lagerinventering/i);
    const approved = T.applyApprovedAtgarder('', [forslag[0]]);
    assert.match(approved, /manuell lagerinventering/i);
    const skipped = T.buildForeslagnaAtgarder([tjanst], state, approved);
    assert.equal(skipped.length, 0);
    const ai = KundRiskprofil.normalizeAiPayload(
      { atgarder: '- Sanktion/PEP-kontroll: kör Dilisense.' },
      { foreslagnaAtgarder: forslag }
    );
    assert.equal(ai.atgarder, '- Sanktion/PEP-kontroll: kör Dilisense.');
    assert.equal(ai.foreslagnaAtgarder[0].approved, false);
    assert.match(ai.foreslagnaAtgarder[0].text, /lagerinventering/i);
    const prompt = T.buildForutsattningPromptBlock([tjanst], state);
    assert.match(prompt, /EJ UPPFYLLD/);
    assert.match(prompt, /INTE kompletterande åtgärder/);
  });

  it('skapar uppdragsåtgärd i körningens lista när lagsUt är satt och förutsättningen är ej uppfylld', () => {
    const atgarder = [
      {
        titel: 'Kunden har ett fungerande lagerhanteringssystem',
        beskrivning: 'Förutsätter lagersystem hos kunden.',
        atgardTyp: T.TYP.KUNDBEROENDE,
        lagsUtSomUppdragsatgard: true
      }
    ];
    const tjanst = {
      id: 'recLager',
      namn: 'Hantering av lager',
      atgarder,
      sannolikhet: 4,
      konsekvens: 4,
      sannolikhetEfter: 2,
      konsekvensEfter: 2
    };
    const state = {
      recLager: {
        forutsattningar: {
          [T.atgardKey(atgarder[0])]: { uppfylld: 'Nej', motivering: 'Inget system.' }
        }
      }
    };
    const pending = T.pendingUppdragsatgarder([tjanst], state);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].text, 'Kontrollera lagerunderlag manuellt');
    assert.equal(pending[0].typ, 'Bokslut');
    const merged = T.mergeRiskAtgarderValda('["Befintlig kontroll"]', pending.map((p) => p.text));
    assert.deepEqual(merged, ['Befintlig kontroll', 'Kontrollera lagerunderlag manuellt']);
    const utanFlagga = T.pendingUppdragsatgarder([{
      ...tjanst,
      atgarder: [{ ...atgarder[0], lagsUtSomUppdragsatgard: false }]
    }], state);
    assert.equal(utanFlagga.length, 0);
  });

  it('mappar alias till de tre åtgärdstyperna och ger etiketter', () => {
    assert.equal(T.normalizeAtgardTyp('kundspecifik'), T.TYP.KUNDBEROENDE);
    assert.equal(T.normalizeAtgardTyp('kundspecifik åtgärd'), T.TYP.KUNDBEROENDE);
    assert.equal(T.normalizeAtgardTyp('uppdragsatgard'), T.TYP.UPPDRAGSATGARD);
    assert.equal(T.normalizeAtgardTyp('uppdragskörning'), T.TYP.UPPDRAGSATGARD);
    assert.equal(T.normalizeAtgardTyp('risksänkande åtgärd'), T.TYP.UPPDRAGSATGARD);
    assert.equal(T.typLabel(T.TYP.BYRARUTIN), 'Byrårutin — ingår i vårt normala arbetssätt');
    assert.equal(T.typLabel(T.TYP.KUNDBEROENDE), 'Kundspecifik åtgärd');
    assert.equal(T.typLabel(T.TYP.UPPDRAGSATGARD), 'Risksänkande åtgärd som ska kopplas till specifika uppdragskörningar');
    assert.equal(T.typTagClass(T.TYP.UPPDRAGSATGARD), 'uppdrag');
    assert.equal(T.typTagLabel(T.TYP.UPPDRAGSATGARD), 'Uppdragskörning');
    assert.equal(T.typTagLabel(T.TYP.KUNDBEROENDE), 'Kundspecifik');
    assert.equal(T.isUppdragsatgard({ atgardTyp: 'uppdragsatgard' }), true);
    assert.equal(T.isKundberoende({ atgardTyp: 'uppdragsatgard' }), false);
  });

  it('föreslår uppdragskörning när texten handlar om körning', () => {
    const forslag = T.suggestAtgardTyp({
      titel: 'Kontrollera lönespecifikation',
      beskrivning: 'Görs vid varje körning.'
    });
    assert.equal(forslag.typ, T.TYP.UPPDRAGSATGARD);
  });

  it('hämtar åtgärdsförslag från tjänstens uppdragskörningsåtgärder när kundspecifik inte görs', () => {
    const atgarder = [
      {
        titel: 'Kunden har ett fungerande lagerhanteringssystem',
        atgardTyp: T.TYP.KUNDBEROENDE
      },
      {
        titel: 'Stickprov mot lagerunderlag vid bokslut',
        beskrivning: 'Kopplas till bokslutskörningen.',
        atgardTyp: T.TYP.UPPDRAGSATGARD
      }
    ];
    const tjanst = {
      id: 'recLager',
      namn: 'Hantering av lager',
      atgarder,
      sannolikhet: 4,
      konsekvens: 4,
      sannolikhetEfter: 2,
      konsekvensEfter: 2
    };
    const state = {
      recLager: {
        forutsattningar: {
          [T.atgardKey(atgarder[0])]: { uppfylld: 'Nej', motivering: 'Inget system.' }
        }
      }
    };
    const forslag = T.buildForeslagnaAtgarder([tjanst], state, '');
    assert.equal(forslag.length, 1);
    assert.equal(forslag[0].text, 'Stickprov mot lagerunderlag vid bokslut: Kopplas till bokslutskörningen.');
    assert.equal(forslag[0].fromUppdragsatgard, true);
    assert.doesNotMatch(forslag[0].text, /lagerinventering/i);
    const evenWhenOk = T.buildForeslagnaAtgarder([tjanst], {
      recLager: {
        forutsattningar: {
          [T.atgardKey(atgarder[0])]: { uppfylld: 'Ja' }
        }
      }
    }, '');
    assert.equal(evenWhenOk.length, 1);
    assert.equal(evenWhenOk[0].fromUppdragsatgard, true);
    const onlyUppdrag = T.buildForeslagnaAtgarder([{
      id: 'recLon',
      namn: 'Lön',
      atgarder: [{ titel: 'Kontrollera lönespecifikation', atgardTyp: T.TYP.UPPDRAGSATGARD }]
    }], {}, '');
    assert.equal(onlyUppdrag.length, 1);
    assert.equal(onlyUppdrag[0].text, 'Kontrollera lönespecifikation');
  });

  it('lägger alltid ut risksänkande uppdragsåtgärd och påverkar inte residualen', () => {
    const atgarder = [
      {
        titel: 'Stickprov mot lönespecifikation',
        beskrivning: 'Kopplas till lönekörningen.',
        atgardTyp: T.TYP.UPPDRAGSATGARD
      }
    ];
    const tjanst = {
      id: 'recLon',
      namn: 'Lön',
      atgarder,
      sannolikhet: 4,
      konsekvens: 4,
      sannolikhetEfter: 2,
      konsekvensEfter: 2
    };
    const item = T.applyToResidualItem(tjanst, {});
    assert.equal(item.residualSource, 'mall');
    assert.equal(item.residualProduct, 4);
    assert.equal(item.forutsattning.hasKundberoende, false);
    const pending = T.pendingUppdragsatgarder([tjanst], {});
    assert.equal(pending.length, 1);
    assert.equal(pending[0].text, 'Stickprov mot lönespecifikation');
    assert.equal(pending[0].typ, 'Löneuppdrag');
  });
});

describe('uppdragsåtgärd från kundkort', () => {
  const kundkort = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');

  it('har knapp för att skapa uppdragsåtgärd vid Görs inte', () => {
    assert.match(kundkort, /forutsattning-uppdragsatgard-btn/);
    assert.match(kundkort, /Skapa uppdragsåtgärd/);
    assert.match(kundkort, /createUppdragsatgardFromRow/);
  });

  it('öppnar samma skapa-uppdrag-modal med förval när uppdrag saknas', () => {
    assert.match(kundkort, /preselectTyp/);
    assert.match(kundkort, /preselectRiskTexts/);
    assert.match(kundkort, /onCreated/);
    assert.match(kundkort, /Skapa uppdrag för uppdragsåtgärd/);
    assert.match(kundkort, /_showUppdragSetupModal\(\{[\s\S]*preselectTyp/);
  });
});
