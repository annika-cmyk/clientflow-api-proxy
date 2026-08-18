const { test } = require('node:test');
const assert = require('node:assert/strict');
const CS = require('../public/js/company-status.js');

const NOW = '2026-08-18T07:00:00.000Z';

function activeAb() {
    return {
        organisationsidentitet: { identitetsbeteckning: '5567223705' },
        organisationsnamn: {
            organisationsnamnLista: [{ namn: 'Cykelbolaget AB' }]
        },
        organisationsform: { kod: 'AB', klartext: 'Aktiebolag' },
        juridiskForm: { kod: '49', klartext: 'Övriga aktiebolag' },
        verksamOrganisation: { kod: 'JA', dataproducent: 'SCB' },
        avregistreradOrganisation: {
            fel: { typ: 'SAKNAS', felBeskrivning: 'Finns inte' },
            dataproducent: 'Bolagsverket'
        },
        avregistreringsorsak: {
            fel: { typ: 'SAKNAS', felBeskrivning: 'Finns inte' },
            dataproducent: 'Bolagsverket'
        },
        pagaendeAvvecklingsEllerOmstruktureringsforfarande: {
            fel: { typ: 'SAKNAS' },
            pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista: []
        },
        organisationsdatum: { registreringsdatum: '2000-01-23' },
        verksamhetsbeskrivning: { beskrivning: 'Handel med cyklar' },
        postadressOrganisation: {
            postadress: { utdelningsadress: 'Jobbstigen 2', postnummer: '12345', postort: 'Grönköping' }
        },
        naringsgrenOrganisation: {
            sni: [{ kod: '47610', klartext: 'Specialiserad butikshandel med böcker' }]
        },
        reklamsparr: { kod: 'NEJ' }
    };
}

test('active company maps to ACTIVE and is not critical', () => {
    const snap = CS.normalizeOrganisation(activeAb(), NOW);
    assert.equal(snap.company_status, 'ACTIVE');
    assert.equal(snap.company_status_label, 'Aktiv');
    assert.equal(snap.has_critical_company_event, false);
    assert.equal(snap.name, 'Cykelbolaget AB');
    assert.equal(snap.address, 'Jobbstigen 2, 12345, Grönköping');
    assert.equal(snap.sni_primary.kod, '47610');
    assert.equal(snap.verksam_organisation, 'JA');
    assert.match(snap.verksam_organisation_note, /F-skatt/);
});

test('fel-only avregistrering is not treated as deregistered', () => {
    const org = activeAb();
    const derived = CS.deriveCompanyStatus(org);
    assert.equal(derived.is_deregistered, false);
    assert.equal(derived.company_status, 'ACTIVE');
});

test('SCB verksam=NEJ without deregistration is INACTIVE', () => {
    const org = activeAb();
    org.verksamOrganisation = { kod: 'NEJ' };
    const snap = CS.normalizeOrganisation(org, NOW);
    assert.equal(snap.company_status, 'INACTIVE');
    assert.equal(snap.has_critical_company_event, false);
});

test('ongoing konkurs is BANKRUPTCY and critical', () => {
    const org = activeAb();
    org.pagaendeAvvecklingsEllerOmstruktureringsforfarande = {
        pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista: [
            { kod: 'KK', klartext: 'Konkurs', fromDatum: '2024-01-26' }
        ]
    };
    const snap = CS.normalizeOrganisation(org, NOW);
    assert.equal(snap.company_status, 'BANKRUPTCY');
    assert.equal(snap.has_critical_company_event, true);
    assert.equal(snap.warning_title, 'Konkurs');
    assert.equal(snap.ongoing_events[0].kind, 'BANKRUPTCY');
});

test('likvidation and rekonstruktion are classified from text or code', () => {
    const liq = activeAb();
    liq.pagaendeAvvecklingsEllerOmstruktureringsforfarande = {
        pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista: [
            { kod: 'LI', klartext: 'Likvidation', fromDatum: '2025-03-01' }
        ]
    };
    assert.equal(CS.normalizeOrganisation(liq, NOW).company_status, 'LIQUIDATION');

    const rec = activeAb();
    rec.pagaendeAvvecklingsEllerOmstruktureringsforfarande = {
        pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista: [
            { kod: 'FR', klartext: 'Företagsrekonstruktion', fromDatum: '2026-02-01' }
        ]
    };
    assert.equal(CS.normalizeOrganisation(rec, NOW).company_status, 'RECONSTRUCTION');
});

test('deregistered company keeps original reason codes', () => {
    const org = activeAb();
    org.verksamOrganisation = { kod: 'NEJ' };
    org.avregistreradOrganisation = {
        avregistreringsdatum: '2023-05-05T00:00:00.000+00:00',
        dataproducent: 'Bolagsverket'
    };
    org.avregistreringsorsak = { kod: 'LIAV', klartext: 'Likvidation' };
    const snap = CS.normalizeOrganisation(org, NOW);
    assert.equal(snap.company_status, 'LIQUIDATION');
    assert.equal(snap.is_deregistered, true);
    assert.equal(snap.deregistered_at, '2023-05-05');
    assert.equal(snap.deregistered_reason_code, 'LIAV');
    assert.equal(snap.original.avregistreringsorsak.kod, 'LIAV');
});

test('SNI string from swagger example is parsed', () => {
    const list = CS.parseSniList('kod = 01120, klartext = Odling av ris');
    assert.equal(list.length, 1);
    assert.equal(list[0].kod, '01120');
    assert.equal(list[0].klartext, 'Odling av ris');
});

test('document list picks latest annual report metadata only', () => {
    const docs = CS.normalizeDocumentList([
        { dokumentId: 'old', rapporteringsperiodTom: '2023-12-31', registreringstidpunkt: '2024-06-01', filformat: 'application/zip' },
        { dokumentId: 'new', rapporteringsperiodTom: '2025-12-31', registreringstidpunkt: '2026-06-12', filformat: 'application/zip' }
    ]);
    assert.equal(docs[0].dokumentId, 'new');
    const snap = CS.attachLatestReport({}, docs);
    assert.equal(snap.latest_annual_report_dokument_id, 'new');
    assert.equal(snap.latest_annual_report_period_end, '2025-12-31');
    assert.equal(snap.latest_annual_report_registered_at, '2026-06-12');
});

test('name match ignores AB suffix and spacing', () => {
    assert.equal(CS.namesLikelyMatch('Cykelbolaget AB', 'CYKELBOLAGET  aktiebolag'), true);
    assert.equal(CS.namesLikelyMatch('Cykelbolaget AB', 'Annat Bolag AB'), false);
});

test('diff detects name, address and new annual report', () => {
    const prev = { name: 'Gammalt AB', address: 'A', organisation_form_text: 'Aktiebolag', latest_annual_report_period_end: '2024-12-31', company_status_label: 'Aktiv' };
    const next = { name: 'Nytt AB', address: 'B', organisation_form_text: 'Aktiebolag', latest_annual_report_period_end: '2025-12-31', company_status_label: 'Aktiv', sni: [] };
    const diffs = CS.diffSnapshots(prev, next, { Namn: 'Gammalt AB', Address: 'A', Bolagsform: 'Aktiebolag' });
    const keys = diffs.map((d) => d.key);
    assert.ok(keys.includes('Namn'));
    assert.ok(keys.includes('Address'));
    assert.ok(keys.includes('latest_annual_report'));
});

test('normalizeFromApiPayload reads organisationer wrapper', () => {
    const snap = CS.normalizeFromApiPayload({ organisationer: [activeAb()] }, NOW);
    assert.equal(snap.company_status, 'ACTIVE');
    assert.equal(snap.orgnr, '5567223705');
});
