/**
 * Sektion 4 i allmän riskbedömning ska spegla det som redan finns
 * på Byråns tjänster och Övriga riskfaktorer — inte en separat omskriven text.
 *
 * Inneboende risk (beskrivning/hot/sårbarhet + S×K) ligger i huvudavsnitten.
 * Åtgärd + residual-S×K ligger i "Fördjupad riskanalys och residualrisk".
 */

const RiskSkala = require('../public/js/risk-skala');
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

function tfTag(value) {
    return RiskSkala.isTfRelevant(value) ? ' [TF]' : '';
}

function inherentLine(item) {
    const inherent = RiskSkala.assessRisk(item && item.sannolikhet, item && item.konsekvens);
    if (inherent.level) return `**Inneboende risk:** ${inherent.badge}`;
    const niva = riskLabel(item && item.riskbedomning);
    return niva ? `**Inneboende risk:** ${niva}` : '';
}

function residualLines(item) {
    const residual = RiskSkala.assessRisk(item && item.sannolikhetEfter, item && item.konsekvensEfter);
    const atgard = text(item && item.atgard);
    const lines = [];
    if (atgard) lines.push(`**Åtgärd:** ${atgard}`, '');
    if (residual.level) lines.push(`**Residualrisk:** ${residual.badge}`, '');
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
    const hot = joinNamedBits(t && t.hot, ['titel', 'title'], ['beskrivning', 'description']);
    const sarbarhet = joinNamedBits(t && t.sarbarheter, ['titel', 'title'], ['beskrivning', 'description']);
    const lines = [`**Tjänst: ${namn}**${tfTag(t && t.ptTfRelevans)}`, ''];
    if (beskrivning) lines.push(`**${TJANST_BESKRIVNING_LABEL}:** ${beskrivning}`, '');
    if (hot) lines.push(`**Hot:** ${hot}`, '');
    if (sarbarhet) lines.push(`**Sårbarhet:** ${sarbarhet}`, '');
    const niva = inherentLine(t);
    if (niva) lines.push(niva, '');
    return lines.join('\n').trim();
}

function formatTjanstResidualBlock(t) {
    const namn = text(t && (t.namn || t.title));
    if (!namn) return '';
    const extra = residualLines(t);
    if (!extra.length) return '';
    return [`**Tjänst: ${namn}**${tfTag(t && t.ptTfRelevans)}`, '', ...extra].join('\n').trim();
}

function formatOvrigBlock(r) {
    const namn = text(r && r.namn);
    const typ = text(r && r.typ);
    if (!namn && !text(r && r.beskrivning)) return '';
    const heading = typ && namn ? `**${typ}: ${namn}**` : `**${namn || typ}**`;
    const lines = [heading + tfTag(r && r.ptTfRelevans), ''];
    if (r.beskrivning) lines.push(`**${OVRIG_BESKRIVNING_LABEL}:** ${r.beskrivning}`, '');
    const niva = inherentLine(r);
    if (niva) lines.push(niva, '');
    return lines.join('\n').trim();
}

function formatOvrigResidualBlock(r) {
    const namn = text(r && r.namn);
    const typ = text(r && r.typ);
    if (!namn && !text(r && r.atgard) && !r.sannolikhetEfter) return '';
    const extra = residualLines(r);
    if (!extra.length) return '';
    const heading = typ && namn ? `**${typ}: ${namn}**` : `**${namn || typ}**`;
    return [heading + tfTag(r && r.ptTfRelevans), '', ...extra].join('\n').trim();
}

const OVRIG_TYP_ORDER = ['kunder', 'distribution', 'distributionskanaler', 'geografi', 'geografiska riskfaktorer', 'verksamhet', 'verksamhetsspecifika omständigheter'];

function ovrigSortKey(r) {
    const typ = text(r && r.typ).toLowerCase();
    const idx = OVRIG_TYP_ORDER.findIndex((k) => typ === k || typ.includes(k));
    return idx === -1 ? 50 : idx;
}

function sortOvriga(ovriga) {
    return (Array.isArray(ovriga) ? ovriga : [])
        .slice()
        .sort((a, b) => ovrigSortKey(a) - ovrigSortKey(b) || text(a.namn).localeCompare(text(b.namn), 'sv'));
}

function compileResidualSection(tjanster, ovriga) {
    const tjanstBlocks = (Array.isArray(tjanster) ? tjanster : [])
        .map(formatTjanstResidualBlock)
        .filter(Boolean);
    const grouped = new Map();
    sortOvriga(ovriga).forEach((r) => {
        const block = formatOvrigResidualBlock(r);
        if (!block) return;
        const typ = text(r.typ) || 'Övriga riskfaktorer';
        if (!grouped.has(typ)) grouped.set(typ, []);
        grouped.get(typ).push(block);
    });
    const parts = [];
    if (tjanstBlocks.length) {
        parts.push('**Tjänster**', '', tjanstBlocks.join('\n\n'));
    }
    grouped.forEach((blocks, typ) => {
        parts.push(`**${typ}**`, '', blocks.join('\n\n'));
    });
    if (!parts.length) return '';
    return ['**Fördjupad riskanalys och residualrisk**', '', ...parts].join('\n\n');
}

function compileIdentifieradeRisker({ tjanster, ovriga } = {}) {
    const tjanstBlocks = (Array.isArray(tjanster) ? tjanster : [])
        .map(formatTjanstBlock)
        .filter(Boolean);
    const ovrigBlocks = sortOvriga(ovriga)
        .map(formatOvrigBlock)
        .filter(Boolean);

    const parts = [];
    if (tjanstBlocks.length) {
        parts.push('**Produkter och tjänster**', '', tjanstBlocks.join('\n\n'));
    }
    if (ovrigBlocks.length) {
        parts.push('**Övriga riskfaktorer**', '', ovrigBlocks.join('\n\n'));
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
    mapOvrigRiskRecord,
    formatTjanstBlock,
    formatTjanstResidualBlock,
    formatOvrigBlock,
    formatOvrigResidualBlock
};
