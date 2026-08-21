// Scenario: ordered deliveries under backlog.
//
// This is the black-box reproduction of the condition P1-23 documents as
// silently disengaging FIFO ordering: a subscription with orderingEnabled
// forces one delivery to retry (by having load-receiver fail exactly once),
// then fires a burst of successor events immediately behind it. If ordering
// holds, load-receiver should see them arrive in seq order once the retried
// one finally succeeds — the successors should sit buffered
// (OrderingBufferService, worker-side) rather than racing ahead. If it
// doesn't hold, the receiver sees the successors before the retried one,
// which is caught by /_control/summary's outOfOrderTransitions count.
//
// This is a correctness probe more than a throughput one — it runs a small,
// fixed burst rather than sustained load. Run load/ingest.js or
// load/fanout.js first if you also want ordering-under-backlog numbers
// alongside general throughput ones.
//
// Usage:
//   k6 run load/ordering.js
//   k6 run -e BURST_SIZE=50 -e RETRY_WAIT_SECONDS=90 load/ordering.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, RECEIVER_CONTROL_URL } from './lib/config.js';
import { bootstrapProject, createSubscribedEndpoint } from './lib/setup.js';

// A non-zero count here after teardown means FIFO ordering broke down under
// the induced-retry backlog — the regression this whole scenario exists to
// catch (P1-23). The threshold below turns that into a non-zero `k6 run`
// exit code so this is CI-checkable, not just eyeballed from log output.
const orderingViolations = new Counter('ordering_violations');

const EVENT_TYPE = 'load.ordering_test';
const BURST_SIZE = Number(__ENV.BURST_SIZE || 20);
// Must exceed the subscription's first retry delay (default retry ladder is
// configured per-subscription via retryDelays — see SubscriptionRequest and
// RetrySchedulerService; 90s is a safe default covering typical
// seconds-to-low-minutes first-retry backoffs). Bump this if your
// subscription uses a longer ladder.
const RETRY_WAIT_SECONDS = Number(__ENV.RETRY_WAIT_SECONDS || 90);

export const options = {
  scenarios: {
    ordering_probe: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: `${RETRY_WAIT_SECONDS + 60}s`,
    },
  },
  thresholds: {
    ordering_violations: ['count==0'],
  },
};

export function setup() {
  const ctx = bootstrapProject('ordering');
  createSubscribedEndpoint(ctx, EVENT_TYPE, { orderingEnabled: true });

  const resetRes = http.post(`${RECEIVER_CONTROL_URL}/_control/reset`);
  if (resetRes.status !== 200) {
    console.warn(`load-receiver not reachable at ${RECEIVER_CONTROL_URL} — cannot run the ordering probe without it`);
  }

  return ctx;
}

function sendEvent(ctx, seq) {
  return http.post(
    `${BASE_URL}/api/v1/events`,
    JSON.stringify({ type: EVENT_TYPE, data: { seq, sentAtMs: Date.now() } }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ctx.apiKey,
        'Idempotency-Key': `ordering-${seq}`,
      },
    }
  );
}

export default function (ctx) {
  // seq 0: a normal, healthy delivery — establishes the ordering cursor.
  check(sendEvent(ctx, 0), { 'seq 0 accepted': (r) => r.status === 201 });
  sleep(1);

  // Force exactly one failure so the *next* delivery attempt (seq 1) fails
  // and goes to retry, opening the gap the rest of the burst arrives into.
  http.post(`${RECEIVER_CONTROL_URL}/_control/fail-next`, JSON.stringify({ count: 1 }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(sendEvent(ctx, 1), { 'seq 1 accepted': (r) => r.status === 201 });

  // Fire the rest of the burst immediately behind it, before seq 1's retry
  // has had a chance to succeed. If ordering holds, none of these should
  // reach load-receiver before seq 1's retried delivery does.
  for (let seq = 2; seq < BURST_SIZE; seq++) {
    check(sendEvent(ctx, seq), { [`seq ${seq} accepted`]: (r) => r.status === 201 });
  }

  console.log(`sent burst of ${BURST_SIZE} ordered events (seq 1 forced to retry once); waiting ${RETRY_WAIT_SECONDS}s for the retry + backlog to drain`);
  sleep(RETRY_WAIT_SECONDS);
}

export function teardown() {
  const summaryRes = http.get(`${RECEIVER_CONTROL_URL}/_control/summary`);
  if (summaryRes.status !== 200) {
    console.warn('could not fetch load-receiver summary — cannot verify ordering');
    return;
  }
  const summary = summaryRes.json();
  console.log(`ordering result: ${JSON.stringify(summary)}`);
  if (!summary.inOrder) {
    orderingViolations.add(summary.outOfOrderTransitions);
    console.error(`ORDERING VIOLATED: ${summary.outOfOrderTransitions} out-of-order transition(s) across ${summary.distinctSeqs} sequence numbers — see GET ${RECEIVER_CONTROL_URL}/_control/received for the raw arrival log`);
  } else {
    console.log(`ordering held across ${summary.distinctSeqs} sequence numbers despite the induced retry`);
  }
}
