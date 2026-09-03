/**
 * Sektion 4 i allmän riskbedömning ska spegla det som redan finns
 * på Byråns tjänster och Övriga riskfaktorer — inte en separat omskriven text.
 *
 * Inneboende risk (beskrivning/hot/sårbarhet + S×K) ligger i huvudavsnitten.
 * Åtgärd + residual-S×K ligger i "Fördjupad riskanalys och residualrisk".
 */

const RiskSkala = require('../public/js/risk-skala');
const RiskMotivering = require('../public/js/risk-motivering');
const TjanstTfTackning = require('../public/js/tjanst-tf-tackning');
const RiskDimensioner = require('../public/js/risk-dimensioner');
const {
    TJANST_BESKRIVNING_LABEL,
    OVRIG_BESKRIVNING_LABEL
} = require('./inneboende-beskrivning');

function text(value) {
    return String(value == null ? '' : value).trim();
}

function riskLabel(value) {
    return RiskSkala.riskLabelSv(value) || text(value);
}

function ptTfCoverageFor(item) {
    return TjanstTfTackning.ptTfCoverage(item && item.hot, item && item.ptTfRelevans);
}

function tfTag(itemOrValue) {
    if (itemOrValue && typeof itemOrValue === 'object') {
        return TjanstTfTackning.formatPtTfMark(ptTfCoverageFor(itemOrValue));
    }
    return TjanstTfTackning.formatPtTfMark(TjanstTfTackning.ptTfCoverage([], itemOrValue));
}

function ptTfLine(item) {
    const label = TjanstTfTackning.formatPtTfDocLabel(ptTfCoverageFor(item));
    return label ? `**PT/TF:** ${label}` : '';
}

function inherentLine(item) {
    const line = RiskMotivering.formatInherentRiskLine(item);
    if (line) return line;
    const niva = riskLabel(item && item.riskbedomning);
    return niva ? `**Inneboende risk:** ${niva}` : '';
}

function inherentMotiveringLine(item) {
    const mot = RiskMotivering.readMotivering(item).motivering_inneboende_risk;
    return mot ? `**Motivering av inneboende risk:** ${mot}` : '';
}

function residualMotiveringLine(item) {
    const mot = RiskMotivering.readMotivering(item).motivering_residual_risk;
    return mot ? `**Motivering av residualrisk:** ${mot}` : '';
}

function residualLines(item) {
    const residualLine = RiskMotivering.formatResidualRiskLine(item);
    const atgard = text(item && item.atgard);
    const lines = [];
    if (atgard) lines.push(`**Riskreducerande åtgärder:** ${atgard}`, '');
    if (residualLine) lines.push(residualLine, '');
    const mot = residualMotiveringLine(item);
    if (mot) lines.push(mot, '');
    return lines;
}

function mapOvrigRiskRecord(record) {
    const f = record?.fields || record || {};
    const scored = RiskSkala.readOvrigRisk(f);
    return {
        id: record?.id || '',
        typ: text(f['Typ av riskfaktor']),
        namn: text(f.Riskfaktor || f.Namn || f.Name),
        beskrivning: text(f.Beskrivning),
        atgard: text(f['Åtgjärd'] || f['Åtgärd']),
        riskbedomning: scored.level || text(f.Riskbedömning),
        sannolikhet: scored.sannolikhet,
        konsekvens: scored.konsekvens,
        sannolikhetEfter: scored.sannolikhetEfter,
        konsekvensEfter: scored.konsekvensEfter,
        motivering_inneboende_risk: scored.motivering_inneboende_risk,
        motivering_residual_risk: scored.motivering_residual_risk,
        kraver_uppdaterad_motivering: scored.kraver_uppdaterad_motivering,
        residualrisk: scored.residualLevel,
        ptTfRelevans: scored.ptTfRelevans,
        kraverManualOversyn: scored.kraverManualOversyn,
        aktuell: f.Aktuell === true
    };
}

function joinNamedBits(items, titelKeys, descKeys) {
    return (Array.isArray(items) ? items : [])
        .map((item) => {
            const titel = titelKeys.map((k) => text(item && item[k])).find(Boolean) || '';
            const desc = descKeys.map((k) => text(item && item[k])).find(Boolean) || '';
            if (titel && desc) return `${titel}: ${desc}`;
            return titel || desc;
        })
        .filter(Boolean)
        .join(' ');
}

function formatTjanstBlock(t) {
    const namn = text(t && (t.namn || t.title));
    if (!namn) return '';
    const beskrivning = text(t && (t.tjanstebeskrivning || t.beskrivning));
    const hot = TjanstTfTackning.formatHotExport(t && t.hot);
    const sarbarhet = joinNamedBits(t && t.sarbarheter, ['titel', 'title'], ['beskrivning', 'description']);
    const lines = [`**Tjänst: ${namn}**${tfTag(t)}`, ''];
    const relevans = ptTfLine(t);
    if (relevans) lines.push(relevans, '');
    if (beskrivning) lines.push(`**${TJANST_BESKRIVNING_LABEL}:** ${beskrivning}`, '');
    if (hot) lines.push(`**Hot och modus:** ${hot}`, '');
    if (sarbarhet) lines.push(`**Sårbarheter:** ${sarbarhet}`, '');
    const niva = inherentLine(t);
    if (niva) lines.push(niva, '');
    const mot = inherentMotiveringLine(t);
    if (mot) lines.push(mot, '');
    return lines.join('\n').trim();
}

function formatTjanstResidualBlock(t) {
    const namn = text(t && (t.namn || t.title));
    if (!namn) return '';
    const extra = residualLines(t);
    if (!extra.length) return '';
    return [`**Tjänst: ${namn}**${tfTag(t)}`, '', ...extra].join('\n').trim();
}

function formatOvrigBlock(r) {
    const namn = text(r && r.namn);
    const typ = RiskDimensioner.normalizeTyp(r && r.typ);
    if (!namn && !text(r && r.beskrivning)) return '';
    const heading = typ && namn ? `**${typ}: ${namn}**` : `**${namn || typ}**`;
    const lines = [heading + tfTag(r), ''];
    const relevans = ptTfLine(r);
    if (relevans) lines.push(relevans, '');
    if (r.beskrivning) lines.push(`**${OVRIG_BESKRIVNING_LABEL}:** ${r.beskrivning}`, '');
    const niva = inherentLine(r);
    if (niva) lines.push(niva, '');
    const mot = inherentMotiveringLine(r);
    if (mot) lines.push(mot, '');
    return lines.join('\n').trim();
}

function formatOvrigResidualBlock(r) {
    const namn = text(r && r.namn);
    const typ = RiskDimensioner.normalizeTyp(r && r.typ);
    if (!namn && !text(r && r.atgard) && !r.sannolikhetEfter) return '';
    const extra = residualLines(r);
    if (!extra.length) return '';
    const heading = typ && namn ? `**${typ}: ${namn}**` : `**${namn || typ}**`;
    return [heading + tfTag(r), '', ...extra].join('\n').trim();
}

function ovrigSortKey(r) {
    const dim = RiskDimensioner.dimensionOfTyp(r && r.typ);
    if (!dim) return 50;
    const idx = RiskDimensioner.DIMENSIONS.findIndex((d) => d.id === dim.id);
    return idx === -1 ? 50 : idx;
}

function sortOvriga(ovriga) {
    return (Array.isArray(ovriga) ? ovriga : [])
        .slice()
        .sort((a, b) => ovrigSortKey(a) - ovrigSortKey(b) || text(a.namn).localeCompare(text(b.namn), 'sv'));
}

function groupedOvrigParts(ovriga, formatter) {
    const parts = [];
    RiskDimensioner.groupOvrigaByTyp(sortOvriga(ovriga)).forEach(({ typ, items }) => {
        const blocks = items.map((r) => formatter(Object.assign({}, r, { typ }))).filter(Boolean);
        if (!blocks.length) return;
        parts.push(`**${typ}**`, '', blocks.join('\n\n'));
    });
    return parts;
}

function compileResidualSection(tjanster, ovriga) {
    const tjanstBlocks = (Array.isArray(tjanster) ? tjanster : [])
        .map(formatTjanstResidualBlock)
        .filter(Boolean);
    const ovrigParts = groupedOvrigParts(ovriga, formatOvrigResidualBlock);
    const parts = [];
    if (tjanstBlocks.length) {
        parts.push('**Tjänster**', '', tjanstBlocks.join('\n\n'));
    }
    parts.push(...ovrigParts);
    if (!parts.length) return '';
    return ['**Fördjupad riskanalys och residualrisk**', '', ...parts].join('\n\n');
}

/**
 * Kort text för sektion 4 i AR-formuläret.
 * Själva underlaget ligger på Byråns tjänster / Övriga riskfaktorer
 * och ska visas i Dokumentation + Länsstyrelsen-PDF, inte dupliceras här.
 */
function referralIdentifieradeRisker() {
    return [
        'Identifierade risker och sårbarheter fylls i på **Byråns tjänster** och **Övriga riskfaktorer**.',
        '',
        'Hela underlaget från de sidorna visas i **Dokumentationen** och i den exporterade PDF:en till Länsstyrelsen.'
    ].join('\n');
}

function isIdentifieradeCompiledDump(text) {
    const t = String(text || '');
    return /\*\*Tjänst:|\*\*Produkter och tjänster\*\*|Tjänsten|Tjänstebeskrivning(?: och inneboende risk)?/.test(t);
}

function compileIdentifieradeRisker({ tjanster, ovriga } = {}) {
    const tjanstBlocks = (Array.isArray(tjanster) ? tjanster : [])
        .map(formatTjanstBlock)
        .filter(Boolean);
    const ovrigParts = groupedOvrigParts(ovriga, formatOvrigBlock);

    const parts = [];
    if (tjanstBlocks.length) {
        parts.push('**Produkter och tjänster**', '', tjanstBlocks.join('\n\n'));
    }
    if (ovrigParts.length) {
        parts.push('**Övriga riskfaktorer**', '', ovrigParts.join('\n\n'));
    }
    const residual = compileResidualSection(tjanster, ovriga);
    if (residual) parts.push(residual);
    if (!parts.length) {
        return 'Inga tjänster eller övriga riskfaktorer är ifyllda ännu. Gå till Byråns tjänster och Övriga riskfaktorer.';
    }
    return parts.join('\n\n').trim();
}

module.exports = {
    compileIdentifieradeRisker,
    referralIdentifieradeRisker,
    isIdentifieradeCompiledDump,
    mapOvrigRiskRecord,
    formatTjanstBlock,
    formatTjanstResidualBlock,
    formatOvrigBlock,
    formatOvrigResidualBlock,
    sortOvriga,
    groupedOvrigParts
};
