function parseJsonList(raw) {
    if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object');
    if (raw == null || raw === '') return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x === 'object') : [];
    } catch (_) {
        return [];
    }
}

function text(value) {
    return String(value == null ? '' : value).trim();
}

function formatAtgarder(atgarder) {
    return atgarder
        .map((a) => [text(a.titel || a.title || a.namn), text(a.beskrivning || a.description)].filter(Boolean).join(' — '))
        .filter(Boolean)
        .join('\n');
}

function mapByraTjanstRecord(record) {
    const f = record?.fields || {};
    const hot = parseJsonList(f['Hot']);
    const sarbarheter = parseJsonList(f['Sårbarheter']);
    const atgarder = parseJsonList(f['Tjänstespecifika åtgärder']);
    const tjanstebeskrivning = text(f['Tjänstebeskrivning']);
    const legacyBeskrivning = text(f['Beskrivning av riskfaktor']);
    const legacyAtgard = text(f['Åtgjärd']);

    return {
        id: record?.id || '',
        namn: text(f['Task Name']),
        typ: text(f['TJÄNSTTYP']),
        riskbedomning: text(f['Riskbedömning']),
        tjanstebeskrivning,
        hot,
        sarbarheter,
        atgarder,
        beskrivning: tjanstebeskrivning || legacyBeskrivning,
        atgard: atgarder.length ? formatAtgarder(atgarder) : legacyAtgard
    };
}

module.exports = {
    parseJsonList,
    mapByraTjanstRecord,
    formatAtgarder
};
