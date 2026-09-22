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
  assert.match(q, /newer_than:30d/);
  assert.equal(q.includes('INBOX'), false);
  assert.equal(q.includes('Privat'), false);
});

test('buildKunderSearchQuery sent-mapp', () => {
  const q = buildKunderSearchQuery(LABELS, 'KUNDER', 'sent');
  assert.match(q, /in:sent/);
  assert.match(q, /-in:trash/);
  assert.match(q, /newer_than:30d/);
  assert.equal(/-in:sent/.test(q), false);
});

test('buildKunderSearchQuery kan stänga av datumfönster', () => {
  const q = buildKunderSearchQuery(LABELS, 'KUNDER', 'inbox', { includeDateWindow: false });
  assert.equal(/newer_than:/.test(q), false);
});

test('buildInboxMessages respekterar mapp inbox vs sent', () => {
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
  const messages = [
    {
      id: 'in1',
      from: 'a@x.se',
      subject: 'inkorg',
      labelIds: ['L2', 'INBOX'],
      internalDate: 200
    },
    {
      id: 'sent1',
      from: 'a@x.se',
      subject: 'skickat',
      labelIds: ['L2', 'SENT'],
      internalDate: 300
    },
    {
      id: 'trash1',
      from: 'a@x.se',
      subject: 'papperskorg',
      labelIds: ['L2', 'TRASH'],
      internalDate: 400
    }
  ];
  const inboxOnly = buildInboxMessages(messages, {
    labels: LABELS,
    matches,
    customers,
    folder: 'inbox',
    limit: 40
  });
  assert.deepEqual(
    inboxOnly.map((m) => m.id),
    ['in1']
  );
  const sentOnly = buildInboxMessages(messages, {
    labels: LABELS,
    matches,
    customers,
    folder: 'sent',
    limit: 40
  });
  assert.deepEqual(
    sentOnly.map((m) => m.id),
    ['sent1']
  );
});

test('buildInboxMessages filtrerar bort mejl till underlag@', () => {
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
      id: 'underlag',
      from: 'Anna <anna@truehorses.se>',
      to: 'underlag@rydenredovisning.se',
      subject: 'Löneunderlag',
      labelIds: ['L1'],
      internalDate: 500
    },
    {
      id: 'vanlig',
      from: 'Anna <anna@truehorses.se>',
      to: 'annika@rydenredovisning.se',
      subject: 'Hej',
      labelIds: ['L1'],
      internalDate: 100
    }
  ];
  const inbox = buildInboxMessages(messages, {
    labels: LABELS,
    matches,
    customers,
    limit: 40
  });
  assert.deepEqual(
    inbox.map((m) => m.id),
    ['vanlig']
  );
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
  // github-mejlet får ingen e-postmatch (byråadressen exkluderas) men syns som omatchat
  // under KUNDER-roten i stället för att försvinna helt.
  assert.equal(inbox.length, 2);
  assert.equal(inbox[0].id, 'gh');
  assert.equal(inbox[0].matchReason, 'unmatched');
  assert.equal(inbox[1].id, 'real');
  assert.equal(inbox[1].customerId, 'c1');
  assert.equal(inbox[1].matchReason, 'email');
});

test('resolveCustomerForMessage prioriterar e-post före fuzzy etikett', () => {
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
    ],
    labels: [{ id: 'L2', name: 'KUNDER/Acme AB' }],
    kunderLabelIds: new Set(['L2'])
  });
  assert.equal(resolved.customerId, 'c-th');
  assert.equal(resolved.matchReason, 'email');
});

test('resolveCustomerForMessage: sparad koppling vinner över e-post', () => {
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
      { id: 'c-th', namn: 'TRUE HORSES AB', emails: ['info@truehorses.se'] },
      { id: 'c-link', namn: 'Länkad' }
    ],
    labels: [{ id: 'L2', name: 'KUNDER/Acme AB' }],
    kunderLabelIds: new Set(['L2']),
    labelLinks: [{ labelId: 'L2', labelName: 'KUNDER/Acme AB', kundId: 'c-link' }]
  });
  assert.equal(resolved.customerId, 'c-link');
  assert.equal(resolved.matchReason, 'link');
});

test('buildInboxMessages inkluderar resolved labels', () => {
  const customers = [{ id: 'c1', namn: 'True Horses AB', email: 'a@truehorses.se' }];
  const matches = [
    {
      labelId: 'L1',
      labelName: 'KUNDER/True Horses',
      customerId: 'c1',
      customerName: 'True Horses AB'
    }
  ];
  const out = buildInboxMessages(
    [
      {
        id: 'm1',
        labelIds: ['INBOX', 'L1'],
        internalDate: 2,
        subject: 'Hej',
        from: 'Anna <a@truehorses.se>',
        snippet: 'x'
      }
    ],
    { labels: LABELS, matches, customers, kunderRoot: 'KUNDER' }
  );
  assert.equal(out.length, 1);
  assert.ok(Array.isArray(out[0].labels));
  assert.ok(out[0].labels.some((l) => l.isKunderChild && l.leaf === 'True Horses'));
});

test('buildInboxMessages visar omatchade KUNDER-mejl i stället för att dölja dem', () => {
  const customers = [{ id: 'c1', namn: 'Jens Nyman Invest AB', emails: [] }];
  const matches = [
    {
      labelId: 'L2',
      labelName: 'KUNDER/Acme AB',
      customerId: 'c1',
      customerName: 'Jens Nyman Invest AB',
      matchReason: 'label'
    }
  ];
  const labels = [
    ...LABELS,
    { id: 'L4', name: 'KUNDER/Fredo consulting' }
  ];
  const messages = [
    {
      id: 'matched',
      from: 'Jens <jens@x.se>',
      subject: 'Matchad',
      labelIds: ['L2', 'INBOX'],
      internalDate: 100
    },
    {
      id: 'unmatched',
      from: 'Fredo <fredo@x.se>',
      subject: 'Omatchad',
      labelIds: ['L4', 'INBOX'],
      internalDate: 200
    }
  ];
  const inbox = buildInboxMessages(messages, {
    labels,
    matches,
    customers,
    limit: 40
  });
  assert.equal(inbox.length, 2);
  assert.equal(inbox[0].id, 'unmatched');
  assert.equal(inbox[0].matchReason, 'unmatched');
  assert.equal(inbox[0].customerId, null);
  assert.equal(inbox[0].customerName, 'Fredo consulting');
  assert.equal(inbox[1].id, 'matched');
  assert.equal(inbox[1].customerId, 'c1');

  const onlyUnmatched = buildInboxMessages(messages, {
    labels,
    matches,
    customers,
    customerIdFilter: '__unmatched__',
    limit: 40
  });
  assert.deepEqual(
    onlyUnmatched.map((m) => m.id),
    ['unmatched']
  );

  const matchedOnly = buildInboxMessages(messages, {
    labels,
    matches,
    customers,
    matchedOnly: true,
    limit: 40
  });
  assert.deepEqual(
    matchedOnly.map((m) => m.id),
    ['matched']
  );
});
