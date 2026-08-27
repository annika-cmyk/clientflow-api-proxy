/**
 * KYC-status på kundkortet: när "utanför ClientFlow" visas
 * och när status/datum slås ihop med Inleed-rutan.
 */
(function (global) {
  function normalizeStatus(status) {
    return String(status || '').trim();
  }

  function effectiveKycStatus(kyc) {
    const status = normalizeStatus(kyc?.status);
    if (status === 'Signerat') return 'Signerat';
    if (status === 'Skickat till kund') return 'Skickat till kund';
    if (String(kyc?.signeringsdatum || '').trim()) return 'Signerat';
    if (String(kyc?.inleedDokumentId || '').trim() || String(kyc?.utskickningsdatum || '').trim()) {
      return 'Skickat till kund';
    }
    return status || 'Sparat';
  }

  function hasSentIndicators(kyc) {
    return effectiveKycStatus(kyc) === 'Skickat till kund' || effectiveKycStatus(kyc) === 'Signerat';
  }

  function shouldShowKycUtanforOption({ utanfor, status, hasInleed, kyc } = {}) {
    if (utanfor) return true;
    const st = normalizeStatus(kyc ? effectiveKycStatus(kyc) : status);
    if (st === 'Signerat' || st === 'Skickat till kund') return false;
    if (hasInleed) return false;
    return true;
  }

  function shouldShowKycInleedBox({ utanfor, status, hasInleed, kyc } = {}) {
    if (utanfor) return false;
    const st = normalizeStatus(kyc ? effectiveKycStatus(kyc) : status);
    return !!(hasInleed || st === 'Skickat till kund' || st === 'Signerat');
  }

  function shouldShowSeparateKycStatusBanner({ utanfor, showInleed } = {}) {
    if (utanfor) return true;
    return !showInleed;
  }

  function kycInleedBoxStatus({ status, signedDate, kyc } = {}) {
    const st = normalizeStatus(kyc ? effectiveKycStatus(kyc) : status);
    const date = String(signedDate || '').trim();
    if (st === 'Signerat') return date ? `Signerat ${date}.` : 'Signerat.';
    if (st === 'Skickat till kund') return 'Utskickat och väntar signering.';
    return '';
  }

  function kycDateIso(raw) {
    const s = String(raw == null ? '' : raw).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function defaultKycUtanforDate(existing, checked, todayIso) {
    const have = kycDateIso(existing);
    if (!checked) return have;
    return have || kycDateIso(todayIso);
  }

  function utanforBannerText(noun, dateIso) {
    const d = kycDateIso(dateIso);
    return d
      ? `${noun} finns utanför ClientFlow. Utförd ${d}.`
      : `${noun} finns utanför ClientFlow.`;
  }

  function kycUtanforBannerText(dateIso) {
    return utanforBannerText('KYC-formulär', dateIso);
  }

  function uppdragsavtalUtanforBannerText(dateIso) {
    return utanforBannerText('Uppdragsavtalet', dateIso);
  }

  const api = {
    normalizeStatus,
    effectiveKycStatus,
    hasSentIndicators,
    shouldShowKycUtanforOption,
    shouldShowKycInleedBox,
    shouldShowSeparateKycStatusBanner,
    kycInleedBoxStatus,
    kycDateIso,
    defaultKycUtanforDate,
    utanforBannerText,
    kycUtanforBannerText,
    uppdragsavtalUtanforBannerText
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.KycStatusUi = api;
})(typeof window !== 'undefined' ? window : globalThis);
