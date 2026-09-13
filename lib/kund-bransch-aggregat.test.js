const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Aggregat = require('../public/js/kund-bransch-aggregat');

describe('kund-bransch-aggregat', () => {
  it('mappar SNI-koder till översiktsgrupper', () => {
    assert.equal(Aggregat.mapToCommonKundBransch('62100 - Dataprogrammering'), 'IT och konsultverksamhet');
    assert.equal(Aggregat.mapToCommonKundBransch('02101 - Skogsförvaltning'), 'Jordbruk och skogsbruk');
    assert.equal(Aggregat.mapToCommonKundBransch('86211 - Primärvårdsmottagningar med läkare m.m.'), 'Vård och omsorg');
    assert.equal(Aggregat.mapToCommonKundBransch('41.200 Byggande av hus'), 'Bygg och anläggning');
    assert.equal(Aggregat.mapToCommonKundBransch('SNI 56'), 'Restaurang och café');
  });

  it('behåller COMMON-etiketter oförändrade', () => {
    assert.equal(Aggregat.mapToCommonKundBransch('Bygg och anläggning'), 'Bygg och anläggning');
    assert.equal(Aggregat.mapToCommonKundBransch('IT och konsultverksamhet'), 'IT och konsultverksamhet');
  });

  it('mappar korta alias via text', () => {
    assert.equal(Aggregat.mapToCommonKundBransch('Bygg'), 'Bygg och anläggning');
    assert.equal(Aggregat.mapToCommonKundBransch('Grafisk design och visuell kommunikation'), 'Kultur, media och underhållning');
  });

  it('aggregerar räknade rader och summerar antal', () => {
    const rows = Aggregat.aggregateCountedBranscher([
      { form: '62100 - Dataprogrammering', count: '4' },
      { form: '62010 - Datakonsulter', count: '2' },
      { form: 'Bygg', count: '12' },
      { form: '02101 - Skogsförvaltning', count: '1' }
    ]);
    const byForm = Object.fromEntries(rows.map((r) => [r.form, r.count]));
    assert.equal(byForm['IT och konsultverksamhet'], '6');
    assert.equal(byForm['Bygg och anläggning'], '12');
    assert.equal(byForm['Jordbruk och skogsbruk'], '1');
  });

  it('parsar räknad lista utan att splitta på och/komma i etiketten', () => {
    const raw =
      '01133 - Odling av grönsaker (köksväxter) på friland / 01610 - Stödverksamhet avseende växtodling: 2, ' +
      '62100 - Dataprogrammering: 4, Bygg: 12';
    const rows = Aggregat.parseCountedBranschList(raw);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].count, '2');
    assert.match(rows[0].form, /01133/);
    assert.equal(rows[1].form, '62100 - Dataprogrammering');
    assert.equal(rows[1].count, '4');
    assert.equal(rows[2].form, 'Bygg');
    assert.equal(rows[2].count, '12');
  });

  it('föreslår aggregat vid många detaljerade SNI-rader', () => {
    assert.equal(
      Aggregat.shouldSuggestAggregation([
        { form: '62100 - Dataprogrammering', count: '1' },
        { form: '02101 - Skogsförvaltning', count: '1' }
      ]),
      true
    );
    assert.equal(
      Aggregat.shouldSuggestAggregation([
        { form: 'Bygg och anläggning', count: '10' },
        { form: 'IT och konsultverksamhet', count: '5' }
      ]),
      false
    );
  });

  it('räknar kunder per bucket från SNI/Bransch — inte högriskfält', () => {
    const records = [
      { fields: { Bransch: '62100 - Dataprogrammering', 'Kunden verkar i en högriskbransch': ['Kontanthandel'] } },
      { fields: { Bransch: 'Bygg' } },
      { fields: { Bransch: 'Bygg' } },
      { fields: { 'SNI kod': '86211' } }
    ];
    const rows = Aggregat.countKundBranschBuckets(records);
    const byNamn = Object.fromEntries(rows.map((r) => [r.namn, r.antal]));
    assert.equal(byNamn['IT och konsultverksamhet'], 1);
    assert.equal(byNamn['Bygg och anläggning'], 2);
    assert.equal(byNamn['Vård och omsorg'], 1);
    assert.equal(byNamn.Kontanthandel, undefined);
  });

  it('drilldownKundBransch listar under-SNI och kunder i bucket', () => {
    const records = [
      { id: 'rec1', fields: { Namn: 'Hus AB', 'SNI kod': '41200 - Byggande av bostadshus och andra byggnader' } },
      { id: 'rec2', fields: { Namn: 'Elbolaget', Bransch: '43210 - Elinstallationer' } },
      { id: 'rec3', fields: { Namn: 'IT AB', 'SNI kod': '62100 - Dataprogrammering' } },
      { id: 'rec4', fields: { Namn: 'Annan bygg', Bransch: 'Bygg och anläggning' } }
    ];
    const result = Aggregat.drilldownKundBransch(records, 'Bygg och anläggning');
    assert.equal(result.bucket, 'Bygg och anläggning');
    assert.equal(result.antalKunder, 3);
    assert.equal(result.kunder.length, 3);
    assert.ok(result.kunder.every((k) => k.id && k.namn));
    const bySni = Object.fromEntries(result.undersni.map((r) => [r.namn, r.antal]));
    assert.equal(bySni['41200 - Byggande av bostadshus och andra byggnader'], 1);
    assert.equal(bySni['43210 - Elinstallationer'], 1);
    assert.equal(bySni['Bygg och anläggning'], 1);
  });

  it('drilldownKundBransch filtrerar på under-SNI', () => {
    const records = [
      { id: 'rec1', fields: { Namn: 'Hus AB', 'SNI kod': '41200 - Byggande av bostadshus och andra byggnader' } },
      { id: 'rec2', fields: { Namn: 'Elbolaget', Bransch: '43210 - Elinstallationer' } }
    ];
    const result = Aggregat.drilldownKundBransch(records, 'Bygg', { sniFilter: '43210' });
    assert.equal(result.antalKunder, 1);
    assert.equal(result.kunder[0].namn, 'Elbolaget');
    assert.match(result.kunder[0].sni, /43210/);
  });

  it('drilldownHogriskBransch listar kunder och deras SNI', () => {
    const records = [
      {
        id: 'rec1',
        fields: {
          Namn: 'Byggare AB',
          'Kunden verkar i en högriskbransch': ['Bygg'],
          'SNI kod': '41200 - Byggande av bostadshus och andra byggnader'
        }
      },
      {
        id: 'rec2',
        fields: {
          Namn: 'Städ AB',
          'Kunden verkar i en högriskbransch': ['Städning'],
          Bransch: '81210'
        }
      }
    ];
    const result = Aggregat.drilldownHogriskBransch(records, 'Bygg');
    assert.equal(result.antalKunder, 1);
    assert.equal(result.kunder[0].namn, 'Byggare AB');
    assert.match(result.kunder[0].sni, /41200/);
    assert.equal(result.undersni[0].namn, '41200 - Byggande av bostadshus och andra byggnader');
  });
});
