async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  const user = {
    user: { id: 'u1', email: 'vadym@hookflow.dev', fullName: 'Vadym K', status: 'ACTIVE', emailVerified: true, createdAt: '2026-01-01T00:00:00Z' },
    organization: { id: 'o1', name: 'Acme Payments', createdAt: '2026-01-01T00:00:00Z' },
    role: 'OWNER',
  };
  const project = { id: PID, name: 'Production', description: 'Live traffic', schemaValidationEnabled: true, schemaValidationPolicy: 'WARN', idempotencyPolicy: 'AUTO', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };

  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  const endpoints = [
    { id: 'e1', projectId: PID, url: 'https://api.acme.com/hooks/orders', description: 'Order service', enabled: true, verificationStatus: 'VERIFIED', mtlsEnabled: false, rateLimitPerSecond: 50, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 'e2', projectId: PID, url: 'https://billing.internal.acme.com/webhooks', description: 'Billing', enabled: true, verificationStatus: 'VERIFIED', mtlsEnabled: true, createdAt: iso(8e8), updatedAt: iso(1e7) },
    { id: 'e3', projectId: PID, url: 'https://hooks.partner.io/v2/inbound', description: 'Partner sync', enabled: false, verificationStatus: 'FAILED', createdAt: iso(4e8), updatedAt: iso(2e6) },
  ];
  const subscriptions = endpoints.map((e, i) => ({
    id: 's' + i, projectId: PID, endpointId: e.id, eventType: ['order.*', 'payment.failed', '**'][i], enabled: i !== 2, createdAt: iso(9e8), updatedAt: iso(1e7),
  }));
  const events = Array.from({ length: 12 }, (_, i) => ({
    id: 'ev' + i, projectId: PID,
    eventType: ['order.completed', 'payment.failed', 'user.created', 'invoice.finalized', 'subscription.canceled'][i % 5],
    payload: JSON.stringify({ id: 'obj_' + i, amount: 1200 + i * 37, currency: 'USD', customer: { name: 'Jane Doe', email: 'jane@example.com' } }),
    createdAt: iso(i * 6e5), deliveriesCreated: (i % 3) + 1,
  }));

  const transformations = [
    { id: 't1', projectId: PID, name: 'Stripe v2 → CRM v1', description: 'Flatten the Stripe envelope', template: '{"event":"${$.type}","amount":"${$.data.amount}"}', version: 3, enabled: true, subscriptionCount: 2, destinationCount: 1, createdAt: iso(9e8), updatedAt: iso(3e7) },
    { id: 't2', projectId: PID, name: 'Slack format', description: 'Human-readable message body', template: '{"text":"${$.type}"}', version: 1, enabled: false, subscriptionCount: 0, destinationCount: 0, createdAt: iso(5e8), updatedAt: iso(9e6) },
  ];

  const rules = [
    { id: 'r1', projectId: PID, name: 'Route high-value orders', description: 'Anything over 10k also goes to billing.', enabled: true, priority: 10, eventTypePattern: 'order.*',
      conditions: { type: 'group', op: 'AND', children: [ { type: 'predicate', field: 'data.amount', operator: 'GT', value: 10000, valueType: 'NUMBER' }, { type: 'predicate', field: 'data.currency', operator: 'EQ', value: 'USD', valueType: 'STRING' } ] },
      actions: [ { type: 'ROUTE', endpointId: 'e2', endpointUrl: 'https://billing.internal.acme.com/webhooks', sortOrder: 0 }, { type: 'TAG', config: { tag: 'high-value' }, sortOrder: 1 } ],
      totalExecutions: 48210, totalMatches: 1290, createdAt: iso(9e8), updatedAt: iso(2e7) },
    { id: 'r2', projectId: PID, name: 'Drop internal test traffic', description: null, enabled: false, priority: 0, eventTypePattern: 'internal.**',
      conditions: { type: 'group', op: 'OR', children: [ { type: 'predicate', field: 'data.source', operator: 'EQ', value: 'loadtest', valueType: 'STRING' } ] },
      actions: [ { type: 'DROP', sortOrder: 0 } ], totalExecutions: 900, totalMatches: 900, createdAt: iso(6e8), updatedAt: iso(6e8) },
    { id: 'r3', projectId: PID, name: 'Normalise partner payloads', description: null, enabled: true, priority: 5, eventTypePattern: null,
      conditions: null, actions: [ { type: 'TRANSFORM', transformationId: 't1', transformationName: 'Stripe v2 → CRM v1', sortOrder: 0 } ],
      totalExecutions: 12000, totalMatches: 4400, createdAt: iso(3e8), updatedAt: iso(1e7) },
  ];

  const piiRules = [
    { id: 'p1', projectId: PID, patternName: 'email', jsonPath: null, ruleType: 'BUILTIN', maskStyle: 'PARTIAL', enabled: true, createdAt: iso(9e8) },
    { id: 'p2', projectId: PID, patternName: 'card', jsonPath: '$.payment.card.number', ruleType: 'BUILTIN', maskStyle: 'FULL', enabled: true, createdAt: iso(9e8) },
    { id: 'p3', projectId: PID, patternName: 'phone', jsonPath: null, ruleType: 'BUILTIN', maskStyle: 'PARTIAL', enabled: false, createdAt: iso(9e8) },
    { id: 'p4', projectId: PID, patternName: 'ssn', jsonPath: '$.customer.ssn', ruleType: 'CUSTOM', maskStyle: 'HASH', enabled: true, createdAt: iso(2e8) },
  ];

  const eventTypes = [
    { id: 'et1', projectId: PID, name: 'order.completed', description: 'An order finished checkout', latestVersion: 3, activeVersionStatus: 'ACTIVE', hasBreakingChanges: true, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 'et2', projectId: PID, name: 'payment.failed', description: null, latestVersion: 1, activeVersionStatus: 'ACTIVE', hasBreakingChanges: false, createdAt: iso(8e8), updatedAt: iso(1e7) },
    { id: 'et3', projectId: PID, name: 'user.created', description: null, latestVersion: 2, activeVersionStatus: null, hasBreakingChanges: false, createdAt: iso(7e8), updatedAt: iso(1e7) },
  ];
  const schemaJson = JSON.stringify({ type: 'object', properties: { id: { type: 'string' }, amount: { type: 'number' }, currency: { type: 'string' } }, required: ['id', 'amount'] }, null, 2);
  const versions = [
    { id: 'v3', eventTypeId: 'et1', version: 3, schemaJson, fingerprint: 'a1b2c3d4e5f67890abcdef1234567890', status: 'ACTIVE', compatibilityMode: 'BACKWARD', description: 'Added currency', createdBy: 'vadym', createdAt: iso(1e7) },
    { id: 'v2', eventTypeId: 'et1', version: 2, schemaJson, fingerprint: 'bb22cc33dd44ee55ff6600112233aabb', status: 'DEPRECATED', compatibilityMode: 'BACKWARD', description: null, createdBy: 'vadym', createdAt: iso(2e8) },
    { id: 'v1', eventTypeId: 'et1', version: 1, schemaJson, fingerprint: 'cc33dd44ee55ff660011223344556677', status: 'DRAFT', compatibilityMode: 'NONE', description: 'First contract', createdBy: 'vadym', createdAt: iso(4e8) },
  ];
  const changes = [
    { id: 'c1', eventTypeId: 'et1', eventTypeName: 'order.completed', fromVersionId: 'v2', fromVersion: 2, toVersionId: 'v3', toVersion: 3, breaking: true, createdAt: iso(1e7),
      changeSummary: JSON.stringify({ added: [{ path: '$.currency', type: 'string', required: true }], removed: [{ path: '$.legacyTotal' }], changed: [{ path: '$.amount', oldType: 'string', type: 'number' }], breaking: true }) },
    { id: 'c2', eventTypeId: 'et1', eventTypeName: 'order.completed', fromVersionId: 'v1', fromVersion: 1, toVersionId: 'v2', toVersion: 2, breaking: false, createdAt: iso(2e8),
      changeSummary: JSON.stringify({ added: [{ path: '$.items', type: 'array' }], removed: [], changed: [], breaking: false }) },
  ];

  const testEndpoints = [
    { id: 'te1', projectId: PID, slug: 'quiet-lark-4821', url: 'https://hkf.dev/t/quiet-lark-4821', requestCount: 3, expiresAt: new Date(now + 7.4e6).toISOString(), createdAt: iso(6e5) },
    { id: 'te2', projectId: PID, slug: 'bold-otter-9017', url: 'https://hkf.dev/t/bold-otter-9017', requestCount: 0, expiresAt: new Date(now + 3.1e6).toISOString(), createdAt: iso(9e5) },
  ];
  const captured = [
    { id: 'cr1', method: 'POST', receivedAt: iso(3e5), sourceIp: '203.0.113.9', headers: JSON.stringify({ 'content-type': 'application/json', 'webhook-signature': 'v1,1710000000.a1b2c3' }), body: JSON.stringify({ id: 'obj_9', amount: 4200, currency: 'USD' }), queryString: 'retry=1' },
    { id: 'cr2', method: 'GET', receivedAt: iso(6e5), sourceIp: '198.51.100.4', headers: JSON.stringify({ accept: '*/*' }), body: null, queryString: null },
  ];

  const attempts = [
    { id: 'a1', deliveryId: 'd0', attemptNumber: 1, httpStatusCode: 500, responseBody: '{"error":"upstream timeout"}', responseHeaders: '{"content-type":"application/json"}', requestBody: '{"id":"obj_0"}', requestHeaders: '{"webhook-signature":"v1,171.abc"}', durationMs: 812, errorMessage: 'HTTP 500 from endpoint', createdAt: iso(6e5) },
    { id: 'a2', deliveryId: 'd0', attemptNumber: 2, httpStatusCode: 200, responseBody: '{"ok":true}', responseHeaders: '{"content-type":"application/json"}', requestBody: '{"id":"obj_0"}', requestHeaders: '{"webhook-signature":"v1,171.abc"}', durationMs: 143, createdAt: iso(2.4e5) },
  ];
  const deliveries = [
    { id: 'd0', eventId: 'evNew', endpointId: 'e1', subscriptionId: 's0', status: 'SUCCESS', attemptCount: 2, maxAttempts: 8, createdAt: iso(6e5), lastAttemptAt: iso(2.4e5), succeededAt: iso(2.4e5) },
    { id: 'd1', eventId: 'evNew', endpointId: 'e2', subscriptionId: 's1', status: 'FAILED', attemptCount: 3, maxAttempts: 8, createdAt: iso(6e5), lastAttemptAt: iso(1e5) },
  ];

  const paged = (content) => ({ content, totalElements: content.length, totalPages: 1, size: 20, number: 0, first: true, last: true, empty: content.length === 0 });

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const p = url.split('?')[0];
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (p.endsWith('/auth/refresh')) return json({ accessToken: 'fake.jwt.token', refreshToken: 'r', emailVerified: true });
    if (p.endsWith('/auth/me')) return json(user);
    if (p.endsWith('/api/v1/projects')) return json([project]);
    if (/\/projects\/[0-9a-f-]+$/.test(p)) return json(project);
    if (p.endsWith('/onboarding')) return json({ hasEndpoints: true, hasSubscriptions: true, hasApiKeys: true, hasEvents: true, hasDeliveries: true, hasIncomingSources: false, hasIncomingDestinations: false });

    if (p.endsWith('/endpoints')) return json(paged(endpoints));
    if (p.endsWith('/subscriptions')) return json(paged(subscriptions));
    if (p.includes('/events/diff')) return json({
      leftEventId: 'ev0', rightEventId: 'ev5', eventType: 'order.completed',
      leftCreatedAt: iso(9e5), rightCreatedAt: iso(3e5),
      leftPayload: JSON.stringify({ id: 'obj_0', amount: 1200, currency: 'USD', legacyTotal: 1200 }, null, 2),
      rightPayload: JSON.stringify({ id: 'obj_5', amount: 1385, currency: 'USD', items: 2 }, null, 2),
      diffs: [
        { path: '$.id', type: 'CHANGED', leftValue: 'obj_0', rightValue: 'obj_5' },
        { path: '$.amount', type: 'CHANGED', leftValue: 1200, rightValue: 1385 },
        { path: '$.items', type: 'ADDED', rightValue: 2 },
        { path: '$.legacyTotal', type: 'REMOVED', leftValue: 1200 },
      ],
    });
    if (p.endsWith('/events/test')) return json({ id: 'evNew', projectId: PID, eventType: 'order.completed', payload: '{}', createdAt: iso(0), deliveriesCreated: 2 });
    if (p.endsWith('/events')) return json(paged(events));
    if (/\/deliveries\/[^/]+\/attempts$/.test(p)) return json(attempts.filter((a) => p.includes(a.deliveryId)));
    if (p.endsWith('/deliveries')) return json(paged(deliveries));
    if (/\/endpoints\/[^/]+\/test$/.test(p)) return json({ success: true, httpStatusCode: 200, responseBody: '{"ok":true}', latencyMs: 143, message: 'Endpoint answered in 143 ms.' });

    if (p.endsWith('/transformations')) return json(transformations);
    if (p.endsWith('/rules')) return json(rules);
    if (p.endsWith('/pii-rules')) return json(piiRules);

    if (p.endsWith('/transform-preview')) return json({ outputPayload: JSON.stringify({ orderId: 'ord_12345', total: 89.97, currency: 'USD' }, null, 2), outputHeaders: JSON.stringify({ 'X-Custom': 'value' }, null, 2), success: true, errors: [] });
    if (p.endsWith('/transform-preview/delivery-dry-run')) return json({ transformedPayload: JSON.stringify({ orderId: 'ord_12345', total: 89.97 }, null, 2), requestHeaders: { 'content-type': 'application/json', 'webhook-signature': 'v1,1710000000.a1b2c3', 'webhook-id': 'evt_1' }, signature: 'v1,1710000000.a1b2c3d4e5f60718293a4b5c6d7e8f90', endpointUrl: 'https://api.acme.com/hooks/orders', success: true, errors: [], transformationName: 'Stripe v2 → CRM v1', transformationVersion: 3 });

    if (p.endsWith('/schemas/changes')) return json(changes);
    if (/\/schemas\/[^/]+\/versions$/.test(p)) return json(versions);
    if (/\/schemas\/[^/]+\/changes$/.test(p)) return json(changes);
    if (p.endsWith('/schemas')) return json(eventTypes);

    if (/\/test-endpoints\/[^/]+\/requests$/.test(p)) return json(paged(captured));
    if (p.endsWith('/test-endpoints')) return json(testEndpoints);

    if (p.endsWith('/tunnels')) return json([]);
    if (p.endsWith('/api-keys')) return json([]);
    if (p.endsWith('/members')) return json([]);
    return json(paged([]));
  });

  await page.addInitScript((u) => {
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('theme', 'light');
  }, user);

  await page.goto('http://localhost:5173/admin/projects/11111111-1111-1111-1111-111111111111/transformations');
  await page.waitForTimeout(2500);
  return { url: page.url(), title: await page.title() };
}
