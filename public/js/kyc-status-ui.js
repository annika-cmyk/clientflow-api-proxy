/**
 * KYC-status på kundkortet: när "utanför ClientFlow" visas
 * och när status/datum slås ihop med Inleed-rutan.
 */
(function (global) {
  function normalizeStatus(status) {
    return String(status || '').trim();
  }

  function shouldShowKycUtanforOption({ utanfor, status, hasInleed } = {}) {
    if (utanfor) return true;
    const st = normalizeStatus(status);
    if (st === 'Signerat' || st === 'Skickat till kund') return false;
    if (hasInleed) return false;
    return true;
  }

  function shouldShowKycInleedBox({ utanfor, status, hasInleed } = {}) {
    if (utanfor) return false;
    const st = normalizeStatus(status);
    return !!(hasInleed || st === 'Skickat till kund' || st === 'Signerat');
  }

  function shouldShowSeparateKycStatusBanner({ utanfor, showInleed } = {}) {
    if (utanfor) return true;
    return !showInleed;
  }

  function kycInleedBoxStatus({ status, signedDate } = {}) {
    const st = normalizeStatus(status);
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
