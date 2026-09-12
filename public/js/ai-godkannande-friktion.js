/**
 * Riskbaserad friktion vid godkännande av AI-förslag (arkitektur P5 / B4).
 *
 * Låg/Normal/Förhöjd: ett klick inom samma tjänstmodal är OK.
 * Hög/Oacceptabel: kräver att texten ändrats eller att en tilläggskommentar skrivits.
 * Bulk över flera tjänster i listvyn: inte tillåtet i v1.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./risk-skala'),
      require('../../lib/audit-log')
    );
  } else {
    root.AiGodkannandeFriktion = factory(root.RiskSkala, root.AuditLog || {});
  }
}(typeof window !== 'undefined' ? window : globalThis, function (RiskSkala, AuditLog) {
  'use strict';

  var MIN_TILLAGG_LENGTH = 20;
  var DEFAULT_DIFF_THRESHOLD = (AuditLog && AuditLog.AI_REVIEW_DIFF_THRESHOLD) || 15;

  function normalizeLevel(level) {
    if (RiskSkala && typeof RiskSkala.normalizeRiskKey === 'function') {
      return RiskSkala.normalizeRiskKey(level) || '';
    }
    return String(level || '').trim();
  }

  function isHighFrictionLevel(level) {
    var key = normalizeLevel(level);
    if (RiskSkala && typeof RiskSkala.isHighOrAbove === 'function') {
      return RiskSkala.isHighOrAbove(key);
    }
    return key === 'Hög' || key === 'Oacceptabel' || key === 'Hog';
  }

  function trimText(value) {
    return String(value == null ? '' : value).trim();
  }

  function wordDiffPercent(original, current) {
    if (AuditLog && typeof AuditLog.wordDiffPercent === 'function') {
      return AuditLog.wordDiffPercent(original, current);
    }
    return 0;
  }

  /**
   * @param {{
   *   riskLevel?: string,
   *   aiOriginalText?: string,
   *   currentText?: string,
   *   tillagg?: string,
   *   diffThreshold?: number
   * }} input
   */
  function assessAiAcceptFriction(input) {
    input = input || {};
    var highRisk = isHighFrictionLevel(input.riskLevel);
    var original = trimText(input.aiOriginalText);
    var current = trimText(input.currentText);
    var tillagg = trimText(input.tillagg);
    var threshold = input.diffThreshold != null
      ? Number(input.diffThreshold)
      : DEFAULT_DIFF_THRESHOLD;
    var diffPercent = wordDiffPercent(original, current);

    if (!highRisk) {
      return {
        allowed: true,
        friction: 'none',
        highRisk: false,
        diffPercent: diffPercent,
        reason: 'Lågrisk: ett klick inom samma tjänstmodal räcker.'
      };
    }

    var editedEnough = Number(diffPercent) >= Number(threshold);
    var hasTillagg = tillagg.length >= MIN_TILLAGG_LENGTH;

    if (editedEnough || hasTillagg) {
      return {
        allowed: true,
        friction: 'edit_required',
        highRisk: true,
        diffPercent: diffPercent,
        reason: editedEnough
          ? 'Högrisk: texten är ändrad tillräckligt jämfört med AI-förslaget.'
          : 'Högrisk: tilläggskommentar godkänner förslaget.'
      };
    }

    return {
      allowed: false,
      friction: 'edit_required',
      highRisk: true,
      diffPercent: diffPercent,
      code: 'ai_hogrisk_redigering_kravs',
      reason: 'Vid Hög/Oacceptabel risk måste AI-förslaget redigeras (eller en tilläggskommentar skrivas) innan det kan godtas.'
    };
  }

  function canBulkAcceptAcrossServices() {
    return false;
  }

  function assertBulkWithinSingleService(serviceIds) {
    var ids = Array.isArray(serviceIds)
      ? Array.from(new Set(serviceIds.map(function (id) {
        return String(id || '').trim();
      }).filter(Boolean)))
      : [];
    if (ids.length <= 1) {
      return { ok: true, serviceCount: ids.length };
    }
    return {
      ok: false,
      serviceCount: ids.length,
      code: 'ai_bulk_over_tjanster_ej_tillatet',
      error: 'Bulk-godkännande av AI-förslag över flera tjänster är inte tillåtet i v1.'
    };
  }

  return {
    MIN_TILLAGG_LENGTH: MIN_TILLAGG_LENGTH,
    DEFAULT_DIFF_THRESHOLD: DEFAULT_DIFF_THRESHOLD,
    normalizeLevel: normalizeLevel,
    isHighFrictionLevel: isHighFrictionLevel,
    assessAiAcceptFriction: assessAiAcceptFriction,
    canBulkAcceptAcrossServices: canBulkAcceptAcrossServices,
    assertBulkWithinSingleService: assertBulkWithinSingleService
  };
}));
