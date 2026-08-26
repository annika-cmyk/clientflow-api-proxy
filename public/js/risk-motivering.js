/**
 * Validering och export av motivering till S/K för allmän riskbedömning (tjänster + övriga riskfaktorer).
 */
(function (global) {
    function skala() {
        return global.RiskSkala
            || (typeof require !== 'undefined' ? require('./risk-skala') : null);
    }
    var MIN_MOTIVERING_LENGTH = 50;
    var DECISION_KEYWORDS = /beslut|riskaptit|ställningstagande|stallningstagande|ställning taget|godkänd|godkand|accepterad|accepterat/i;

    function trimMotivering(value) {
        return String(value == null ? '' : value).trim();
    }

    function requiresMotivering(level) {
        var RS = skala();
        return !!(RS && RS.isElevatedOrAbove(level));
    }

    function requiresDecisionReference(level) {
        var RS = skala();
        return !!(RS && RS.isHighOrAbove(level));
    }

    function hasDecisionReference(text) {
        return DECISION_KEYWORDS.test(trimMotivering(text));
    }

    function readMotivering(rawPoang) {
        var poang = rawPoang;
        if (typeof rawPoang === 'string') {
            var RS = skala();
            poang = RS && RS.parseRiskPoang
                ? RS.parseRiskPoang(rawPoang)
                : null;
        }
        var p = poang || {};
        return {
            motivering_inneboende_risk: trimMotivering(
                p.motivering_inneboende_risk ?? p.motiveringInneboende ?? p.inneboendeMotivering
            ),
            motivering_residual_risk: trimMotivering(
                p.motivering_residual_risk ?? p.motiveringResidual ?? p.residualMotivering
            ),
            kraver_uppdaterad_motivering: p.kraver_uppdaterad_motivering === true
                || p.kraverUppdateradMotivering === true
        };
    }

    function motiveringLengthOk(text) {
        return trimMotivering(text).length >= MIN_MOTIVERING_LENGTH;
    }

    function assessMotivering(poang, opts) {
        opts = opts || {};
        var RS = skala();
        var inherent = (RS && RS.assessRisk(poang && poang.sannolikhet, poang && poang.konsekvens)) || {};
        var residual = (RS && RS.assessRisk(poang && poang.sannolikhetEfter, poang && poang.konsekvensEfter)) || {};
        var mot = readMotivering(poang);
        var inneboendeNeeds = requiresMotivering(inherent.level);
        var residualNeeds = requiresMotivering(residual.level);
        var inneboendeOk = !inneboendeNeeds || motiveringLengthOk(mot.motivering_inneboende_risk);
        var residualOk = !residualNeeds || motiveringLengthOk(mot.motivering_residual_risk);
        var residualNeedsDecision = requiresDecisionReference(residual.level);
        var residualDecisionOk = !residualNeedsDecision
            || (residualOk && hasDecisionReference(mot.motivering_residual_risk));
        return {
            inherentLevel: inherent.level || '',
            residualLevel: residual.level || '',
            motivering_inneboende_risk: mot.motivering_inneboende_risk,
            motivering_residual_risk: mot.motivering_residual_risk,
            kraver_uppdaterad_motivering: mot.kraver_uppdaterad_motivering,
            inneboendeNeedsMotivering: inneboendeNeeds,
            residualNeedsMotivering: residualNeeds,
            inneboendeOk: inneboendeOk,
            residualOk: residualOk,
            residualNeedsDecision: residualNeedsDecision,
            residualDecisionOk: residualDecisionOk,
            complete: inneboendeOk && residualOk && residualDecisionOk
        };
    }

    function validatePoangMotivering(poang, opts) {
        opts = opts || {};
        if (opts.asDraft) return { ok: true, errors: [], warnings: [] };
        var status = assessMotivering(poang || {}, opts);
        var errors = [];
        if (status.inneboendeNeedsMotivering && !status.inneboendeOk) {
            errors.push({
                field: 'motivering_inneboende_risk',
                code: 'motivering_inneboende_kravs',
                error: 'Motivering av inneboende risk krävs (minst ' + MIN_MOTIVERING_LENGTH
                    + ' tecken) när risknivån är Förhöjd, Hög eller Oacceptabel.'
            });
        }
        if (status.residualNeedsMotivering && !status.residualOk) {
            errors.push({
                field: 'motivering_residual_risk',
                code: 'motivering_residual_kravs',
                error: 'Motivering av residualrisk krävs (minst ' + MIN_MOTIVERING_LENGTH
                    + ' tecken) när residualrisken är Förhöjd, Hög eller Oacceptabel.'
            });
        } else if (status.residualNeedsDecision && !status.residualDecisionOk) {
            errors.push({
                field: 'motivering_residual_risk',
                code: 'riskaptit_beslut_kravs',
                error: 'Residualrisk Hög eller Oacceptabel kräver att motiveringen hänvisar till riskaptit eller fattat beslut.'
            });
        }
        return { ok: errors.length === 0, errors: errors, warnings: [], status: status };
    }

    function mergeRiskPoang(existingRaw, incomingRaw) {
        var RS = skala();
        var existing = (RS && RS.parseRiskPoang(existingRaw)) || {};
        var incoming = (RS && RS.parseRiskPoang(incomingRaw)) || {};
        if (typeof incomingRaw === 'object' && incomingRaw && !Array.isArray(incomingRaw)) {
            incoming = Object.assign({}, incoming, incomingRaw);
        }
        return Object.assign({}, existing, incoming);
    }

    function validateFieldsMotivering(fields, opts) {
        opts = opts || {};
        var f = fields || {};
        var poang = mergeRiskPoang(f['Riskpoäng'] || f.Riskpoang || f.Samspelsexempel, opts.incomingPoang);
        return validatePoangMotivering(poang, opts);
    }

    function migrationFlagForPoang(poang) {
        var status = assessMotivering(poang || {});
        if (status.complete && !status.kraver_uppdaterad_motivering) return false;
        return (status.inneboendeNeedsMotivering && !status.inneboendeOk)
            || (status.residualNeedsMotivering && !status.residualOk)
            || (status.residualNeedsDecision && !status.residualDecisionOk);
    }

    function formatInherentRiskLine(item) {
        var RS = skala();
        var inherent = (RS && RS.assessRisk(item && item.sannolikhet, item && item.konsekvens)) || {};
        if (!inherent.level && item && item.riskbedomning) {
            return '**Inneboende risk:** ' + (RS ? RS.riskLabelSv(item.riskbedomning) : item.riskbedomning);
        }
        if (!inherent.level) return '';
        var parts = [];
        if (inherent.sannolikhet != null) parts.push('**Sannolikhet:** ' + inherent.sannolikhet);
        if (inherent.konsekvens != null) parts.push('**Konsekvens:** ' + inherent.konsekvens);
        if (inherent.product != null) parts.push('**S×K:** ' + inherent.product);
        parts.push('**Inneboende risk:** ' + inherent.level);
        return parts.join(' | ');
    }

    function formatResidualRiskLine(item) {
        var RS = skala();
        var residual = (RS && RS.assessRisk(item && item.sannolikhetEfter, item && item.konsekvensEfter)) || {};
        if (!residual.level) return '';
        var parts = [];
        if (residual.sannolikhet != null) parts.push('**Sannolikhet:** ' + residual.sannolikhet);
        if (residual.konsekvens != null) parts.push('**Konsekvens:** ' + residual.konsekvens);
        if (residual.product != null) parts.push('**S×K:** ' + residual.product);
        parts.push('**Residualrisk:** ' + residual.level);
        return parts.join(' | ');
    }

    function collectExportWarnings(items) {
        var list = Array.isArray(items) ? items : [];
        var warnings = [];
        list.forEach(function (item) {
            var poang = Object.assign({}, item || {}, readMotivering(item));
            var status = assessMotivering(poang);
            if (status.complete) return;
            var label = trimMotivering(item && (item.namn || item.title || item.Riskfaktor));
            if (!label) label = 'Okänd post';
            if (status.inneboendeNeedsMotivering && !status.inneboendeOk) {
                warnings.push(label + ': motivering av inneboende risk saknas eller är för kort.');
            }
            if (status.residualNeedsMotivering && !status.residualOk) {
                warnings.push(label + ': motivering av residualrisk saknas eller är för kort.');
            } else if (status.residualNeedsDecision && !status.residualDecisionOk) {
                warnings.push(label + ': residualrisk Hög/Oacceptabel utan hänvisning till riskaptitbeslut.');
            }
        });
        return warnings;
    }

    function exportWarningBanner(warnings) {
        var list = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
        if (!list.length) return '';
        return [
            '**⚠ Varning — ofullständig riskmotivering**',
            '',
            'Följande poster har Förhöjd/Hög/Oacceptabel risk men saknar tillräcklig motivering:',
            '',
            list.map(function (w) { return '- ' + w; }).join('\n'),
            '',
            'Komplettera motiveringarna på Byråns tjänster och Övriga riskfaktorer innan tillsyn.'
        ].join('\n');
    }

    var api = {
        MIN_MOTIVERING_LENGTH: MIN_MOTIVERING_LENGTH,
        trimMotivering: trimMotivering,
        requiresMotivering: requiresMotivering,
        requiresDecisionReference: requiresDecisionReference,
        hasDecisionReference: hasDecisionReference,
        readMotivering: readMotivering,
        motiveringLengthOk: motiveringLengthOk,
        assessMotivering: assessMotivering,
        validatePoangMotivering: validatePoangMotivering,
        mergeRiskPoang: mergeRiskPoang,
        validateFieldsMotivering: validateFieldsMotivering,
        migrationFlagForPoang: migrationFlagForPoang,
        formatInherentRiskLine: formatInherentRiskLine,
        formatResidualRiskLine: formatResidualRiskLine,
        collectExportWarnings: collectExportWarnings,
        exportWarningBanner: exportWarningBanner
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.RiskMotivering = api;
})(typeof window !== 'undefined' ? window : globalThis);
