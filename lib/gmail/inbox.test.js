const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectKunderLabels,
  kunderLabelIdSet,
  messageHasKunderLabel,
  parseFromHeader,
  resolveCustomerForMessage,
  sortMessagesByInternalDateDesc,
  buildInboxMessages,
  buildKunderSearchQuery
} = require('./inbox');

const LABELS = [
  { id: 'INBOX', name: 'INBOX' },
  { id: 'L0', name: 'KUNDER' },
  { id: 'L1', name: 'KUNDER/True Horses' },
  { id: 'L2', name: 'KUNDER/Acme AB' },
  { id: 'L3', name: 'Privat' }
];

test('collectKunderLabels tar rot + barn, inte orelaterade', () => {
  const got = collectKunderLabels(LABELS);
  assert.deepEqual(
    got.map((l) => l.id).sort(),
    ['L0', 'L1', 'L2']
  );
});

test('messageHasKunderLabel kräver etikett under KUNDER', () => {
  const ids = kunderLabelIdSet(LABELS);
  assert.equal(messageHasKunderLabel({ labelIds: ['INBOX'] }, ids), false);
  assert.equal(messageHasKunderLabel({ labelIds: ['INBOX', 'L1'] }, ids), true);
  assert.equal(messageHasKunderLabel({ labelIds: ['L0'] }, ids), true);
});

test('parseFromHeader plockar namn och e-post', () => {
  assert.deepEqual(parseFromHeader('"cursor[bot]" <notifications@github.com>'), {
    name: 'cursor[bot]',
    email: 'notifications@github.com'
  });
  assert.deepEqual(parseFromHeader('Anna Rider <anna@truehorses.se>'), {
    name: 'Anna Rider',
    email: 'anna@truehorses.se'
  });
  assert.equal(parseFromHeader('solo@x.se').email, 'solo@x.se');
});

test('sortMessagesByInternalDateDesc: nyast först', () => {
  const sorted = sortMessagesByInternalDateDesc([
    { id: 'a', internalDate: 100 },
    { id: 'b', internalDate: 300 },
    { id: 'c', internalDate: 200 }
  ]);
  assert.deepEqual(
    sorted.map((m) => m.id),
    ['b', 'c', 'a']
  );
});

test('buildInboxMessages filtrerar bort mejl utan KUNDER-etikett även om e-post matchar', () => {
  const customers = [
    {
      id: 'c1',
      namn: 'TRUE HORSES AB',
      emails: ['anna@truehorses.se']
    }
  ];
  const matches = [
    {
      labelId: 'L1',
      labelName: 'KUNDER/True Horses',
      customerId: 'c1',
      customerName: 'TRUE HORSES AB',
      matchReason: 'label'
    }
  ];
  const messages = [
    {
      id: 'gh',
      from: 'cursor[bot] <notifications@github.com>',
      to: 'annika@rydenredovisning.se',
      subject: 'CI failed',
      labelIds: ['INBOX'],
      internalDate: 500
    },
    {
      id: 'cust',
      from: 'Anna <anna@truehorses.se>',
      to: 'annika@rydenredovisning.se',
      subject: 'Hej',
      labelIds: ['INBOX', 'L1'],
      internalDate: 100
    }
  ];
  const inbox = buildInboxMessages(messages, {
    labels: LABELS,
    matches,
    customers,
    limit: 40
  });
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].id, 'cust');
  assert.equal(inbox[0].customerName, 'TRUE HORSES AB');
  assert.equal(inbox[0].fromName, 'Anna');
});

test('buildInboxMessages: e-post kopplar kund bara bland KUNDER-filtrerade mejl', () => {
  const customers = [
    {
      id: 'c1',
      namn: 'TRUE HORSES AB',
      emails: ['info@truehorses.se']
    }
  ];
  const messages = [
    {
      id: 'm1',
      from: 'Info <info@truehorses.se>',
      to: 'annika@x.se',
      subject: 'Faktura',
      labelIds: ['L0', 'INBOX'],
      internalDate: 200
    },
    {
      id: 'm2',
      from: 'Info <info@truehorses.se>',
      to: 'annika@x.se',
      subject: 'Utan etikett',
      labelIds: ['INBOX'],
      internalDate: 900
    }
  ];
  const inbox = buildInboxMessages(messages, {
    labels: LABELS,
    matches: [],
    customers,
    limit: 40
  });
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].id, 'm1');
  assert.equal(inbox[0].matchReason, 'email');
  assert.equal(inbox[0].customerId, 'c1');
});

test('buildInboxMessages sorterar nyast först oavsett inmatningsordning (slice efter sort)', () => {
  const customers = [{ id: 'c1', namn: 'Acme AB', emails: [] }];
  const matches = [
    {
      labelId: 'L2',
      labelName: 'KUNDER/Acme AB',
      customerId: 'c1',
      customerName: 'Acme AB',
      matchReason: 'label'
    }
  ];
  const messages = [];
  for (let i = 1; i <= 5; i += 1) {
    messages.push({
      id: `old-${i}`,
      from: 'a@x.se',
      subject: `old ${i}`,
      labelIds: ['L2'],
      internalDate: i
    });
  }
  messages.push({
    id: 'newest',
    from: 'a@x.se',
    subject: 'fresh',
    labelIds: ['L2'],
    internalDate: 9999
  });
  const inbox = buildInboxMessages(messages, {
    labels: LABELS,
    matches,
    customers,
    limit: 3
  });
  assert.equal(inbox.length, 3);
  assert.equal(inbox[0].id, 'newest');
  assert.ok(inbox[0].internalDate >= inbox[1].internalDate);
  assert.ok(inbox[1].internalDate >= inbox[2].internalDate);
});

test('buildKunderSearchQuery inkluderar rot och barn med citat vid snedstreck', () => {
  const q = buildKunderSearchQuery(LABELS);
  assert.match(q, /label:KUNDER/);
  assert.match(q, /label:"KUNDER\/True Horses"/);
  assert.match(q, /label:"KUNDER\/Acme AB"/);
  assert.match(q, /-in:sent/);
  assert.match(q, /-in:trash/);
  assert.equal(q.includes('INBOX'), false);
  assert.equal(q.includes('Privat'), false);
});

test('buildKunderSearchQuery sent-mapp', () => {
  const q = buildKunderSearchQuery(LABELS, 'KUNDER', 'sent');
  assert.match(q, /in:sent/);
  assert.match(q, /-in:trash/);
});

test('buildInboxMessages ignorerar byråns egen adress vid e-postmatch', () => {
  const customers = [
    {
      id: 'c1',
      namn: 'TRUE HORSES AB',
      emails: ['annika@rydenredovisning.se', 'info@truehorses.se']
    }
  ];
  const messages = [
    {
      id: 'gh',
      from: 'github <notifications@github.com>',
      to: 'annika@rydenredovisning.se',
      subject: 'CI',
      labelIds: ['L0'],
      internalDate: 500
    },
    {
      id: 'real',
      from: 'Info <info@truehorses.se>',
      to: 'annika@rydenredovisning.se',
      subject: 'Hej',
      labelIds: ['L0'],
      internalDate: 100
    }
  ];
  const inbox = buildInboxMessages(messages, {
    labels: LABELS,
    matches: [],
    customers,
    excludeEmails: ['annika@rydenredovisning.se'],
    limit: 40
  });
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].id, 'real');
});

test('resolveCustomerForMessage prioriterar etikett före e-post', () => {
  const msg = {
    from: 'Info <info@truehorses.se>',
    labelIds: ['L2']
  };
  const resolved = resolveCustomerForMessage(msg, {
    matches: [
      {
        labelId: 'L2',
        labelName: 'KUNDER/Acme AB',
        customerId: 'c-acme',
        customerName: 'Acme AB',
        matchReason: 'label'
      }
    ],
    customers: [
      { id: 'c-th', namn: 'TRUE HORSES AB', emails: ['info@truehorses.se'] }
    ]
  });
  assert.equal(resolved.customerId, 'c-acme');
  assert.equal(resolved.matchReason, 'label');
});
