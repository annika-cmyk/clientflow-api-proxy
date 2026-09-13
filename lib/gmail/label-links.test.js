const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseLinksJson,
  serializeLinks,
  upsertLink,
  removeLink,
  findLinkForLabel,
  resolveLinkedCustomer,
  applyLinksToMatchResult
} = require('./label-links');
const { matchLabelsToCustomers } = require('./match');
const { resolveCustomerForMessage, buildInboxMessages } = require('./inbox');

test('parseLinksJson / serializeLinks roundtrip', () => {
  const raw = serializeLinks([
    { labelId: 'L1', labelName: 'KUNDER/Foo', kundId: 'c1' },
    { labelId: '', labelName: '', kundId: 'x' }
  ]);
  const parsed = parseLinksJson(raw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].kundId, 'c1');
  assert.equal(parsed[0].labelId, 'L1');
});

test('upsertLink ersätter samma labelId', () => {
  let links = upsertLink([], { labelId: 'L1', labelName: 'KUNDER/A', kundId: 'c1' });
  links = upsertLink(links, { labelId: 'L1', labelName: 'KUNDER/A', kundId: 'c2' });
  assert.equal(links.length, 1);
  assert.equal(links[0].kundId, 'c2');
});

test('findLinkForLabel matchar id eller namn (fold)', () => {
  const links = [{ labelId: 'L1', labelName: 'KUNDER/True Horses', kundId: 'c1' }];
  assert.equal(findLinkForLabel(links, { id: 'L1', name: 'x' }).kundId, 'c1');
  assert.equal(
    findLinkForLabel(links, { id: 'other', name: 'kunder/true horses' }).kundId,
    'c1'
  );
  assert.equal(findLinkForLabel(links, { id: 'x', name: 'KUNDER/Nej' }), null);
});

test('removeLink tar bort via id', () => {
  const links = [
    { labelId: 'L1', labelName: 'KUNDER/A', kundId: 'c1' },
    { labelId: 'L2', labelName: 'KUNDER/B', kundId: 'c2' }
  ];
  const next = removeLink(links, { labelId: 'L1' });
  assert.equal(next.length, 1);
  assert.equal(next[0].labelId, 'L2');
});

test('applyLinksToMatchResult: koppling vinner över fuzzy', () => {
  const labels = [
    { id: 'L0', name: 'KUNDER' },
    { id: 'L1', name: 'KUNDER/True Horses' }
  ];
  const customers = [
    { id: 'c-th', namn: 'TRUE HORSES AB' },
    { id: 'c-other', namn: 'Annan Kund AB' }
  ];
  const base = matchLabelsToCustomers(labels, customers);
  assert.equal(base.matches[0].customerId, 'c-th');

  const withLink = applyLinksToMatchResult(
    base,
    [{ labelId: 'L1', labelName: 'KUNDER/True Horses', kundId: 'c-other' }],
    customers
  );
  assert.equal(withLink.matches[0].matchReason, 'link');
  assert.equal(withLink.matches[0].customerId, 'c-other');
  assert.ok(!withLink.matches.some((m) => m.matchReason === 'label' && m.labelId === 'L1'));
});

test('resolveLinkedCustomer hittar kund via etikett-id', () => {
  const resolved = resolveLinkedCustomer(
    { labelIds: ['INBOX', 'L1'] },
    {
      links: [{ labelId: 'L1', labelName: 'KUNDER/Foo', kundId: 'c9' }],
      labels: [
        { id: 'L0', name: 'KUNDER' },
        { id: 'L1', name: 'KUNDER/Foo' }
      ],
      customers: [{ id: 'c9', namn: 'Foo AB' }],
      kunderLabelIds: new Set(['L0', 'L1']),
      kunderRoot: 'KUNDER'
    }
  );
  assert.equal(resolved.matchReason, 'link');
  assert.equal(resolved.customerId, 'c9');
  assert.equal(resolved.customerName, 'Foo AB');
});

test('resolveCustomerForMessage: link > email > fuzzy', () => {
  const labels = [
    { id: 'L1', name: 'KUNDER/Acme' },
    { id: 'L2', name: 'KUNDER/Wrong' }
  ];
  const customers = [
    { id: 'c-acme', namn: 'Acme AB' },
    { id: 'c-mail', namn: 'Mail Kund', emails: ['info@mail.se'] },
    { id: 'c-link', namn: 'Länkad Kund' }
  ];
  const msg = {
    from: 'Info <info@mail.se>',
    labelIds: ['L2']
  };

  const viaEmail = resolveCustomerForMessage(msg, {
    matches: [
      {
        labelId: 'L2',
        labelName: 'KUNDER/Wrong',
        customerId: 'c-acme',
        customerName: 'Acme AB',
        matchReason: 'label'
      }
    ],
    customers,
    labels,
    kunderLabelIds: new Set(['L1', 'L2'])
  });
  assert.equal(viaEmail.customerId, 'c-mail');
  assert.equal(viaEmail.matchReason, 'email');

  const viaLink = resolveCustomerForMessage(msg, {
    matches: [
      {
        labelId: 'L2',
        labelName: 'KUNDER/Wrong',
        customerId: 'c-acme',
        customerName: 'Acme AB',
        matchReason: 'label'
      }
    ],
    customers,
    labels,
    kunderLabelIds: new Set(['L1', 'L2']),
    labelLinks: [{ labelId: 'L2', labelName: 'KUNDER/Wrong', kundId: 'c-link' }]
  });
  assert.equal(viaLink.customerId, 'c-link');
  assert.equal(viaLink.matchReason, 'link');
});

test('buildInboxMessages använder sparad koppling', () => {
  const labels = [
    { id: 'L0', name: 'KUNDER' },
    { id: 'L1', name: 'KUNDER/Fel Namn' }
  ];
  const customers = [
    { id: 'c-right', namn: 'Rätt Kund AB' },
    { id: 'c-fuzzy', namn: 'Fel Namn AB' }
  ];
  const matches = [
    {
      labelId: 'L1',
      labelName: 'KUNDER/Fel Namn',
      customerId: 'c-fuzzy',
      customerName: 'Fel Namn AB',
      matchReason: 'label'
    }
  ];
  const out = buildInboxMessages(
    [
      {
        id: 'm1',
        labelIds: ['INBOX', 'L1'],
        internalDate: 1,
        subject: 'Hej',
        from: 'x@y.se',
        snippet: ''
      }
    ],
    {
      labels,
      matches,
      customers,
      kunderRoot: 'KUNDER',
      labelLinks: [{ labelId: 'L1', labelName: 'KUNDER/Fel Namn', kundId: 'c-right' }]
    }
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].customerId, 'c-right');
  assert.equal(out[0].matchReason, 'link');
});
