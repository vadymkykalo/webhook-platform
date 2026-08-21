// Scenario: fan-out burst — 1 event, N subscribed endpoints, N deliveries.
//
// setup() creates FANOUT_N endpoints (default 20) all subscribed to the same
// event type, all pointed at load-receiver. The VU body then sends a burst
// of distinct events; each should turn into FANOUT_N deliveries. After a
// settle period, teardown() compares what load-receiver actually saw against
// the expected total (EVENTS_TO_SEND * FANOUT_N) — this is the number to
// record for "how much fan-out amplification can the outbox/worker absorb
// before it falls behind" (see load/README.md "Target numbers").
//
// Usage:
//   k6 run load/fanout.js
//   k6 run -e FANOUT_N=100 -e EVENTS_TO_SEND=10 load/fanout.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, FANOUT_N, RECEIVER_CONTROL_URL } from './lib/config.js';
import { bootstrapProject, createSubscribedEndpoint } from './lib/setup.js';

const EVENT_TYPE = 'load.fanout_test';
const EVENTS_TO_SEND = Number(__ENV.EVENTS_TO_SEND || 5);
// How long to wait after the burst for delivery workers to drain the
// fan-out before teardown() reads the receiver's summary.
const SETTLE_SECONDS = Number(__ENV.SETTLE_SECONDS || 30);

export const options = {
  scenarios: {
    fanout_burst: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: EVENTS_TO_SEND,
      maxDuration: '2m',
    },
  },
};

export function setup() {
  const ctx = bootstrapProject('fanout');

  const endpoints = [];
  for (let i = 0; i < FANOUT_N; i++) {
    endpoints.push(createSubscribedEndpoint(ctx, EVENT_TYPE, { path: `/webhook?ep=${i}` }));
  }

  const resetRes = http.post(`${RECEIVER_CONTROL_URL}/_control/reset`);
  if (resetRes.status !== 200) {
    console.warn(`load-receiver not reachable at ${RECEIVER_CONTROL_URL} — cannot verify fan-out counts this run`);
  }

  console.log(`fanout setup: ${endpoints.length} endpoints subscribed to ${EVENT_TYPE}, sending ${EVENTS_TO_SEND} events (expecting ${EVENTS_TO_SEND * FANOUT_N} deliveries)`);
  return ctx;
}

export default function (ctx) {
  const seq = __ITER;
  const res = http.post(
    `${BASE_URL}/api/v1/events`,
    JSON.stringify({
      type: EVENT_TYPE,
      data: { seq, sentAtMs: Date.now() },
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ctx.apiKey,
        'Idempotency-Key': `fanout-${seq}`,
      },
    }
  );

  check(res, {
    'fanout event accepted (201)': (r) => r.status === 201,
    [`deliveriesCreated === ${FANOUT_N}`]: (r) => {
      if (r.status !== 201) return false;
      const body = r.json();
      return body.deliveriesCreated === FANOUT_N;
    },
  });
}

export function teardown() {
  sleep(SETTLE_SECONDS);
  const summaryRes = http.get(`${RECEIVER_CONTROL_URL}/_control/summary`);
  if (summaryRes.status !== 200) {
    console.warn('could not fetch load-receiver summary for fan-out verification');
    return;
  }
  const summary = summaryRes.json();
  const expected = EVENTS_TO_SEND * FANOUT_N;
  console.log(`fanout result: expected ${expected} deliveries, load-receiver saw ${summary.totalReceived} (p50=${summary.latencyMsP50}ms p99=${summary.latencyMsP99}ms)`);
}
