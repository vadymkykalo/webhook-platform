// Shared configuration for the k6 load harness. Every value is overridable
// via `k6 run -e VAR=value ...` or an exported environment variable, so the
// same scripts run against a local `make up` stack, a staging deploy, or CI.
//
// See load/README.md for the full list and defaults.

// Where k6 (running on the host, or in the `k6` CI container attached to the
// same Docker network) reaches the API.
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// Where k6 reaches the load-receiver's control API (mode switching, reading
// back what it captured). Published to the host by load/docker-compose.load.yml.
export const RECEIVER_CONTROL_URL = __ENV.RECEIVER_CONTROL_URL || 'http://localhost:9000';

// Where the *worker* (inside the Docker network) reaches the load-receiver.
// This is the URL registered as the Endpoint's target — it must resolve
// inside webhook-network, not on the host, hence the different hostname.
export const RECEIVER_INTERNAL_URL = __ENV.RECEIVER_INTERNAL_URL || 'http://load-receiver:9000';

// A fixed password meeting AuthController's complexity policy (upper, lower,
// digit, special char, 8-128 chars) — see RegisterRequest.java.
export const LOAD_TEST_PASSWORD = __ENV.LOAD_TEST_PASSWORD || 'LoadTest!2026x';

// Target throughput knobs, read by individual scenario files.
export const TARGET_RPS = Number(__ENV.TARGET_RPS || 50);
export const DURATION = __ENV.DURATION || '2m';
export const FANOUT_N = Number(__ENV.FANOUT_N || 20);

export function uniqueSuffix() {
  // __VU/__ITER are k6 execution-context globals; Date.now() keeps setup()
  // (which runs once, outside any VU loop) unique across repeated `k6 run`s.
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
