const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const NavStatus = require('./nav-status');

describe('nav-status', () => {
  it('mappar byrå-resa-steg till meny-sidor', () => {
    const map = NavStatus.stepPageMap();
    assert.equal(map['kundrisker-mm'], 3);
    assert.equal(map['riskbedomning-byra'], 2);
    assert.equal(map['ovriga-riskfaktorer'], 4);
    assert.equal(NavStatus.pageIdFromHref('kundrisker-mm.html'), 'kundrisker-mm');
  });

  it('detekterar utländsk skatterättslig hemvist från KYC och kundfält', () => {
    assert.equal(NavStatus.hasForeignTaxResidence({
      skatterattslig_hemvist_foretag: 'Norge'
    }), true);
    assert.equal(NavStatus.hasForeignTaxResidence({
      huvudman: [{ namn: 'A', skatterattslig_hemvist: 'Danmark' }]
    }), true);
    assert.equal(NavStatus.hasForeignTaxResidence({
      'KYC-formular (JSON)': JSON.stringify({
        skatterattslig_hemvist_foretag: 'Sverige',
        foretradare: [{ namn: 'B', skatterattslig_hemvist: 'Finland' }]
      })
    }), true);
    assert.equal(NavStatus.hasForeignTaxResidence({
      'Skatterättslig hemvist': ['Sverige', 'Tyskland']
    }), true);
    assert.equal(NavStatus.hasForeignTaxResidence({
      skatterattslig_hemvist_foretag: 'Sverige',
      huvudman: [{ namn: 'A', skatterattslig_hemvist: 'Sverige' }]
    }), false);
  });

  it('flaggar Vilka är våra kunder när kund har utländsk hemvist utan deklarerad risk', () => {
    const alert = NavStatus.ruleForeignTaxResidenceMismatch({
      profil: { utlandskaAgare: 'Nej' },
      riskRecords: [
        { id: 'r1', fields: { Riskfaktor: 'Kunder med utländska huvudmän', Aktuell: false } }
      ],
      kundRecords: [
        {
          id: 'c1',
          fields: {
            Namn: 'Nord AB',
            'KYC-formular (JSON)': JSON.stringify({
              huvudman: [{ namn: 'Eva', skatterattslig_hemvist: 'Norge' }]
            })
          }
        }
      ]
    });
    assert.ok(alert);
    assert.equal(alert.id, 'foreign-tax-residence');
    assert.equal(alert.pageId, 'kundrisker-mm');
    assert.equal(alert.count, 1);
    assert.match(alert.message, /Nord AB/);
  });

  it('larmar inte när riskfaktorn är aktuell eller enkäten säger Ja', () => {
    const kundRecords = [
      {
        fields: {
          Namn: 'X',
          'KYC-formular (JSON)': JSON.stringify({
            skatterattslig_hemvist_foretag: 'Estland'
          })
        }
      }
    ];
    assert.equal(NavStatus.ruleForeignTaxResidenceMismatch({
      kundRecords,
      profil: { utlandskaAgare: 'Nej' },
      riskRecords: [
        { fields: { Riskfaktor: 'Kunder med utländska huvudmän', Aktuell: true } }
      ]
    }), null);
    assert.equal(NavStatus.ruleForeignTaxResidenceMismatch({
      kundRecords,
      profil: { utlandskaAgare: 'Ja' },
      riskRecords: []
    }), null);
    assert.equal(NavStatus.ruleForeignTaxResidenceMismatch({
      kundRecords: [],
      profil: { utlandskaAgare: 'Nej' },
      riskRecords: []
    }), null);
  });

  it('sätter attention över complete på kundrisker-mm', () => {
    const built = NavStatus.buildNavStatus({
      steps: { 2: true, 3: true, 4: false },
      profil: { utlandskaAgare: 'Nej' },
      riskRecords: [],
      kundRecords: [
        {
          fields: {
            Namn: 'Y',
            'KYC-formular (JSON)': JSON.stringify({
              huvudman: [{ skatterattslig_hemvist: 'Polen' }]
            })
          }
        }
      ]
    });
    assert.equal(built.pages['riskbedomning-byra'].status, 'complete');
    assert.equal(built.pages['kundrisker-mm'].status, 'attention');
    assert.equal(built.pages['kundrisker-mm'].complete, true);
    assert.equal(built.pages['ovriga-riskfaktorer'].status, 'neutral');
    assert.equal(built.alerts.length, 1);
    assert.equal(built.progress.done, 2);
  });


  it('flaggar Vilka är våra kunder vid PEP-kund utan katalogpost', () => {
    const kycField = 'KYC-formular (JSON)';
    const alert = NavStatus.ruleKundattributUtanKatalogpost({
      riskRecords: [
        { id: 'r1', fields: { Riskfaktor: 'PEP eller RCA', Aktuell: false } }
      ],
      kundRecords: [
        {
          id: 'c1',
          fields: {
            Namn: 'Politex AB',
            [kycField]: JSON.stringify({ pep: 'Ja' })
          }
        }
      ]
    });
    assert.ok(alert);
    assert.equal(alert.id, 'kundattribut_utan_katalogpost');
    assert.equal(alert.eventType, 'kundattribut_utan_katalogpost');
    assert.equal(alert.attribute, 'pep');
    assert.equal(alert.pageId, 'kundrisker-mm');
    assert.equal(alert.count, 1);
    assert.match(alert.message, /Politex AB/);
  });

  it('larmar inte om aktuell PEP-analys finns i katalogen', () => {
    const kycField = 'KYC-formular (JSON)';
    const kundRecords = [
      {
        fields: {
          Namn: 'Z',
          [kycField]: JSON.stringify({ pep: 'Ja' })
        }
      }
    ];
    assert.equal(NavStatus.ruleKundattributUtanKatalogpost({
      kundRecords,
      riskRecords: [
        { fields: { Riskfaktor: 'Politiskt utsatta personer (PEP) bland kunder', Aktuell: true } }
      ]
    }), null);
    assert.equal(NavStatus.ruleKundattributUtanKatalogpost({
      kundRecords: [],
      riskRecords: []
    }), null);
  });

  it('detekterar PEP via kontaktpersoner även utan KYC-svar', () => {
    assert.equal(NavStatus.hasPepAttribute({
      Kontaktpersoner: JSON.stringify([
        { namn: 'Ada', pepMarkerad: true }
      ])
    }), true);
    assert.equal(NavStatus.hasPepAttribute({
      Kontaktpersoner: JSON.stringify([
        { namn: 'Bo', pepMarkerad: false }
      ])
    }), false);
    assert.equal(NavStatus.isPepRiskLabel('PEP eller RCA'), true);
    assert.equal(NavStatus.isPepRiskLabel('Kontanthantering'), false);
  });

    it('har sidomeny-hooks och API-referens i koden', () => {
    const components = fs.readFileSync(path.join(__dirname, '../public/js/components.js'), 'utf8');
    const styles = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../public/kundrisker-mm.html'), 'utf8');
    assert.match(components, /initNavStatus|\/api\/nav-status/);
    assert.match(styles, /nav-status-icon/);
    assert.match(html, /nav-status-alert|kundrisker-nav-alert/);
  });
});
