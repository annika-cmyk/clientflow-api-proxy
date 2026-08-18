/**
 * Tilldelning av en enskild uppdragskörning till någon med behörighet till kunden.
 */
(function (global) {
    function normalizeAnsvarig(value) {
        return String(value == null ? '' : value).trim();
    }

    function isPrivilegedRole(role) {
        const r = String(role || '').trim().toLowerCase();
        return r === 'ledare' || r === 'clientflowadmin' || r === 'admin';
    }

    function userDisplayName(user) {
        return normalizeAnsvarig(user?.name || user?.fullName || user?.email || '');
    }

    function parseIdList(value) {
        if (value == null || value === '') return [];
        if (Array.isArray(value)) {
            return value.flatMap((v) => parseIdList(v));
        }
        return String(value)
            .split(/[,;\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }

    function eligibleAssigneeNames({
        users,
        customerAnvandareIds,
        klientansvarig,
        uppdragAnsvarig,
        currentRunAnsvarig
    } = {}) {
        const names = new Set();
        const idSet = new Set(parseIdList(customerAnvandareIds));
        (users || []).forEach((u) => {
            const id = String(u?.id || '').trim();
            if (!isPrivilegedRole(u?.role) && !(id && idSet.has(id))) return;
            const name = userDisplayName(u);
            if (name) names.add(name);
        });
        [klientansvarig, uppdragAnsvarig, currentRunAnsvarig].forEach((raw) => {
            const name = normalizeAnsvarig(raw);
            if (name) names.add(name);
        });
        return [...names].sort((a, b) => a.localeCompare(b, 'sv'));
    }

    function isEligibleAssignee(name, eligibleNames) {
        const n = normalizeAnsvarig(name);
        if (!n) return true;
        const set = new Set((eligibleNames || []).map((x) => normalizeAnsvarig(x).toLowerCase()).filter(Boolean));
        return set.has(n.toLowerCase());
    }

    function resolveRunAnsvarig(runAnsvarig, uppdragAnsvarig) {
        const run = normalizeAnsvarig(runAnsvarig);
        if (run) return { name: run, inherited: false };
        const inherited = normalizeAnsvarig(uppdragAnsvarig);
        return { name: inherited, inherited: !!inherited };
    }

    function ansvarigFromHistory(uppdragFields, periodKey) {
        const pk = String(periodKey || '').trim();
        if (!pk) return '';
        let history = [];
        try {
            const raw = String(uppdragFields?.Historik || uppdragFields?.['Historik'] || '').trim();
            if (raw && raw.startsWith('[')) history = JSON.parse(raw);
            if (!Array.isArray(history)) history = [];
        } catch (_) {
            history = [];
        }
        const hit = history.find((it) => it && String(it.periodKey || '').trim() === pk);
        return hit ? normalizeAnsvarig(hit.ansvarig) : '';
    }

    const api = {
        normalizeAnsvarig,
        isPrivilegedRole,
        userDisplayName,
        parseIdList,
        eligibleAssigneeNames,
        isEligibleAssignee,
        resolveRunAnsvarig,
        ansvarigFromHistory
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.KoringAnsvarig = api;
})(typeof window !== 'undefined' ? window : globalThis);
