/**
 * Sektion 4 i allmän riskbedömning ska spegla det som redan finns
 * på Byråns tjänster och Övriga riskfaktorer — inte en separat omskriven text.
 */

function text(value) {
    return String(value == null ? '' : value).trim();
}

function mapOvrigRiskRecord(record) {
    const f = record?.fields || record || {};
    return {
        id: record?.id || '',
        typ: text(f['Typ av riskfaktor']),
        namn: text(f.Riskfaktor || f.Namn || f.Name),
        beskrivning: text(f.Beskrivning),
        atgard: text(f['Åtgjärd'] || f['Åtgärd']),
        riskbedomning: text(f.Riskbedömning),
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
    const niva = text(t && t.riskbedomning);
    const atgard = text(t && t.atgard);
    const riskRad = [niva, atgard].filter(Boolean).join('. ');
    const lines = [`**Tjänst: ${namn}**`, ''];
    if (beskrivning) lines.push(beskrivning, '');
    if (hot) lines.push(`**Hot:** ${hot}`, '');
    if (sarbarhet) lines.push(`**Sårbarhet:** ${sarbarhet}`, '');
    if (riskRad) lines.push(`**Risknivå och åtgärder:** ${riskRad}`, '');
    return lines.join('\n').trim();
}

function formatOvrigBlock(r) {
    const namn = text(r && r.namn);
    const typ = text(r && r.typ);
    if (!namn && !text(r && r.beskrivning)) return '';
    const heading = typ && namn ? `**${typ}: ${namn}**` : `**${namn || typ}**`;
    const lines = [heading, ''];
    if (r.beskrivning) lines.push(r.beskrivning, '');
    if (r.atgard) lines.push(`**Åtgärd:** ${r.atgard}`, '');
    if (r.riskbedomning) lines.push(`**Risknivå:** ${r.riskbedomning}`, '');
    return lines.join('\n').trim();
}

const OVRIG_TYP_ORDER = ['kunder', 'distribution', 'distributionskanaler', 'geografi', 'geografiska riskfaktorer', 'verksamhet', 'verksamhetsspecifika omständigheter'];

function ovrigSortKey(r) {
    const typ = text(r && r.typ).toLowerCase();
    const idx = OVRIG_TYP_ORDER.findIndex((k) => typ === k || typ.includes(k));
    return idx === -1 ? 50 : idx;
}

function compileIdentifieradeRisker({ tjanster, ovriga } = {}) {
    const tjanstBlocks = (Array.isArray(tjanster) ? tjanster : [])
        .map(formatTjanstBlock)
        .filter(Boolean);
    const ovrigBlocks = (Array.isArray(ovriga) ? ovriga : [])
        .slice()
        .sort((a, b) => ovrigSortKey(a) - ovrigSortKey(b) || text(a.namn).localeCompare(text(b.namn), 'sv'))
        .map(formatOvrigBlock)
        .filter(Boolean);

    const parts = [];
    if (tjanstBlocks.length) {
        parts.push('**Produkter och tjänster**', '', tjanstBlocks.join('\n\n'));
    }
    if (ovrigBlocks.length) {
        parts.push('**Övriga riskfaktorer**', '', ovrigBlocks.join('\n\n'));
    }
    if (!parts.length) {
        return 'Inga tjänster eller övriga riskfaktorer är ifyllda ännu. Gå till Byråns tjänster och Övriga riskfaktorer.';
    }
    return parts.join('\n\n').trim();
}

module.exports = {
    compileIdentifieradeRisker,
    mapOvrigRiskRecord,
    formatTjanstBlock,
    formatOvrigBlock
};
