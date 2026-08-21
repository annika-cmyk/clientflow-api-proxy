/**
 * Delad logik för om KYC, riskbedömning och uppdragsavtal är "klara"
 * (samma regler som kundkortets flikindikatorer).
 */
(function (global) {
    function fieldIsChecked(fields, fieldName) {
        const v = fields?.[fieldName];
        return v === true || v === 1 || v === 'true' || v === 'Ja' || v === 'checked';
    }

    function parseKycFromFields(fields) {
        if (!fields) return {};
        const raw = fields['KYC-formular (JSON)'] || '';
        if (!raw) return {};
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function isRiskbedomningKlar(fields) {
        if (global.KundRiskprofil && typeof global.KundRiskprofil.isPublicerbar === 'function') {
            return global.KundRiskprofil.isPublicerbar(fields);
        }
        if (!fields) return false;
        const manual = fields['Flik klar - Riskbedömning'];
        if (manual === true) return true;
        if (manual === false) return false;
        const inneboende = (fields['Kund inneboende riskprofil'] || '').toString().trim();
        const residual = (fields['Riskniva'] || fields['sammanlagd risk'] || '').toString().trim();
        return !!(inneboende && residual);
    }

    function isKycFormularKlar(fields, savedKyc) {
        if (!fields) return false;
        const manual = fields['Flik klar - KYC-formulär'];
        if (manual === true) return true;
        if (manual === false) return false;
        if (fieldIsChecked(fields, 'KYC-formulär utanför ClientFlow')) return true;
        const kyc = savedKyc || parseKycFromFields(fields);
        if (kyc?.utanforClientFlow === true) return true;
        const status = (kyc?.status || '').toString().trim();
        if (status === 'Signerat') return true;
        return !!(fields['KYC UTFÖRD DATUM']);
    }

    function isUppdragsavtalKlar(customerFields, avtalStatus) {
        if (fieldIsChecked(customerFields, 'Uppdragsavtal utanför ClientFlow')) return true;
        return (avtalStatus || '').toString().trim() === 'Signerat';
    }

    function isKundlistaComplianceKlar(fields, avtalStatus) {
        const kyc = parseKycFromFields(fields);
        return isRiskbedomningKlar(fields)
            && isKycFormularKlar(fields, kyc)
            && isUppdragsavtalKlar(fields, avtalStatus);
    }

    function kundlistaStatusIconHtml(klar) {
        if (klar) {
            return '<span class="kundlista-row-icon kundlista-row-icon--ok" title="KYC, riskbedömning och uppdragsavtal klara">' +
                '<i class="fas fa-check-circle" aria-hidden="true"></i></span>';
        }
        return '<span class="kundlista-row-icon kundlista-row-icon--warn" title="KYC, riskbedömning eller uppdragsavtal saknas">' +
            '<i class="fas fa-exclamation-circle" aria-hidden="true"></i></span>';
    }

    global.KundCompliance = {
        fieldIsChecked,
        parseKycFromFields,
        isRiskbedomningKlar,
        isKycFormularKlar,
        isUppdragsavtalKlar,
        isKundlistaComplianceKlar,
        kundlistaStatusIconHtml
    };
})(typeof window !== 'undefined' ? window : global);
