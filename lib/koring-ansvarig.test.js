/**
 * Tester för tilldelning av uppdragskörning.
 * Kör: node --test lib/koring-ansvarig.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const KA = require('../public/js/koring-ansvarig');

const users = [
    { id: 'recLedare', name: 'Lisa Ledare', role: 'Ledare' },
    { id: 'recAnna', name: 'Anna Anställd', role: 'Anställd' },
    { id: 'recBertil', name: 'Bertil Byrå', role: 'Anställd' },
    { id: 'recAdmin', name: 'Ada Admin', role: 'ClientFlowAdmin' }
];

describe('eligibleAssigneeNames', () => {
    it('inkluderar ledare, admin och anställda med kundbehörighet', () => {
        const names = KA.eligibleAssigneeNames({
            users,
            customerAnvandareIds: ['recAnna'],
            klientansvarig: 'Karin Klient',
            uppdragAnsvarig: 'Oskar Uppdrag'
        });
        assert.deepEqual(names, ['Ada Admin', 'Anna Anställd', 'Karin Klient', 'Lisa Ledare', 'Oskar Uppdrag']);
    });

    it('utesluter anställd utan behörighet till kunden', () => {
        const names = KA.eligibleAssigneeNames({
            users,
            customerAnvandareIds: ['recAnna']
        });
        assert.equal(names.includes('Bertil Byrå'), false);
        assert.equal(names.includes('Anna Anställd'), true);
    });

    it('behåller nuvarande tilldelning även om personen inte längre är listad', () => {
        const names = KA.eligibleAssigneeNames({
            users,
            customerAnvandareIds: ['recAnna'],
            currentRunAnsvarig: 'Bertil Byrå'
        });
        assert.equal(names.includes('Bertil Byrå'), true);
    });
});

describe('isEligibleAssignee', () => {
    const eligible = ['Anna Anställd', 'Lisa Ledare'];

    it('tillåter tomt värde (ärv från uppdraget)', () => {
        assert.equal(KA.isEligibleAssignee('', eligible), true);
        assert.equal(KA.isEligibleAssignee('   ', eligible), true);
    });

    it('matchar namn utan att bry sig om skiftläge', () => {
        assert.equal(KA.isEligibleAssignee('anna anställd', eligible), true);
        assert.equal(KA.isEligibleAssignee('Bertil Byrå', eligible), false);
    });
});

describe('resolveRunAnsvarig', () => {
    it('använder körningens tilldelning när den finns', () => {
        assert.deepEqual(KA.resolveRunAnsvarig('Anna', 'Lisa'), { name: 'Anna', inherited: false });
    });

    it('ärver uppdragets ansvarig när körningen saknar tilldelning', () => {
        assert.deepEqual(KA.resolveRunAnsvarig('', 'Lisa'), { name: 'Lisa', inherited: true });
        assert.deepEqual(KA.resolveRunAnsvarig(null, ''), { name: '', inherited: false });
    });
});

describe('ansvarigFromHistory', () => {
    it('läser ansvarig för rätt period', () => {
        const fields = {
            Historik: JSON.stringify([
                { periodKey: '2026-Q1', ansvarig: 'Gammal' },
                { periodKey: '2026-Q2', ansvarig: 'Anna Anställd', status: 'Planerad' }
            ])
        };
        assert.equal(KA.ansvarigFromHistory(fields, '2026-Q2'), 'Anna Anställd');
        assert.equal(KA.ansvarigFromHistory(fields, '2026-Q3'), '');
    });
});
