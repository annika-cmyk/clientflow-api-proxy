/**
 * KYC-status på kundkortet: när "utanför ClientFlow" visas
 * och när status/datum slås ihop med Inleed-rutan.
 */
(function (global) {
  const STATUS_FILL_PENDING = 'Skickat för ifyllnad';
  const STATUS_ANSWERED = 'Besvarat av kund';
  const STATUS_SENT_SIGN = 'Skickat till kund';
  const STATUS_SIGNED = 'Signerat';
  const STATUS_SAVED = 'Sparat';

  function normalizeStatus(status) {
    return String(status || '').trim();
  }

  function effectiveKycStatus(kyc) {
    const status = normalizeStatus(kyc?.status);
    if (status === STATUS_SIGNED) return STATUS_SIGNED;
    if (status === STATUS_SENT_SIGN) return STATUS_SENT_SIGN;
    if (String(kyc?.signeringsdatum || '').trim()) return STATUS_SIGNED;
    if (String(kyc?.inleedDokumentId || '').trim() || String(kyc?.utskickningsdatum || '').trim()) {
      return STATUS_SENT_SIGN;
    }
    if (status === STATUS_ANSWERED || kyc?.customerAnsweredAt) return STATUS_ANSWERED;
    if (status === STATUS_FILL_PENDING || (String(kyc?.inviteToken || '').trim() && !kyc?.customerAnsweredAt)) {
      return STATUS_FILL_PENDING;
    }
    return status || STATUS_SAVED;
  }

  function hasSentIndicators(kyc) {
    const st = effectiveKycStatus(kyc);
    return st === STATUS_SENT_SIGN || st === STATUS_SIGNED;
  }

  function shouldShowKycUtanforOption({ utanfor, status, hasInleed, kyc } = {}) {
    if (utanfor) return true;
    const st = normalizeStatus(kyc ? effectiveKycStatus(kyc) : status);
    if (
      st === STATUS_SIGNED
      || st === STATUS_SENT_SIGN
      || st === STATUS_FILL_PENDING
      || st === STATUS_ANSWERED
    ) return false;
    if (hasInleed) return false;
    return true;
  }

  function shouldShowKycInleedBox({ utanfor, status, hasInleed, kyc } = {}) {
    if (utanfor) return false;
    const st = normalizeStatus(kyc ? effectiveKycStatus(kyc) : status);
    return !!(hasInleed || st === STATUS_SENT_SIGN || st === STATUS_SIGNED);
  }

  function shouldShowSeparateKycStatusBanner({ utanfor, showInleed } = {}) {
    if (utanfor) return true;
    return !showInleed;
  }

  function kycInleedBoxStatus({ status, signedDate, kyc } = {}) {
    const st = normalizeStatus(kyc ? effectiveKycStatus(kyc) : status);
    const date = String(signedDate || '').trim();
    if (st === STATUS_SIGNED) return date ? `Signerat ${date}.` : 'Signerat.';
    if (st === STATUS_SENT_SIGN) return 'Utskickat och väntar signering.';
    return '';
  }

  function kycFillBannerText(status, kyc) {
    const st = normalizeStatus(kyc ? effectiveKycStatus(kyc) : status);
    if (st === STATUS_FILL_PENDING) {
      return 'KYC-formuläret skickat till kund för ifyllnad. När kunden svarat skapas PDF och skickas till Inleed för BankID.';
    }
    if (st === STATUS_ANSWERED) {
      return 'Kunden har besvarat KYC-formuläret. PDF skickas/skickades till Inleed för BankID-signering.';
    }
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
    STATUS_FILL_PENDING,
    STATUS_ANSWERED,
    STATUS_SENT_SIGN,
    STATUS_SIGNED,
    STATUS_SAVED,
    normalizeStatus,
    effectiveKycStatus,
    hasSentIndicators,
    shouldShowKycUtanforOption,
    shouldShowKycInleedBox,
    shouldShowSeparateKycStatusBanner,
    kycInleedBoxStatus,
    kycFillBannerText,
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
