# Runbook: Trace One Webhook End to End (P3-36b)

> Given a delivery ID (or an event ID, or nothing but "a customer says their
> webhook didn't arrive around 14:32 UTC"), find every relevant log line across
> both `api` and `worker`, using Loki + Promtail (`monitoring/docker-compose.yml`).

---

## 0. Prerequisites

```bash
make monitoring-up
```

Grafana: http://localhost:3001 (`hookflow` / `hookflow_monitor_2024` by
default) → **Explore** (Loki datasource) or the pre-built **Hookflow — Logs**
dashboard. Everything below also works as raw `curl`/`logcli` against Loki
directly at `http://localhost:3100`, which is what this runbook shows —
translate to LogQL in Grafana's query box the same way.

---

## 1. You have a delivery ID

Deliveries don't carry their own Loki label (see §4 for why), but the
`correlationId` established when the *event* was ingested threads through the
whole pipeline: HTTP request → `outbox_messages.correlation_id` → Kafka
`X-Correlation-ID` header → worker's MDC. Look it up:

```sql
-- via `make shell-db`
SELECT correlation_id, created_at
FROM outbox_messages
WHERE aggregate_type = 'Delivery' AND aggregate_id = '<delivery-id>'
ORDER BY created_at DESC
LIMIT 1;
```

If that's empty (older row already retention-pruned, or a delivery created by
a path that doesn't set `correlation_id` — e.g. `ReplayService`/`DlqService`
manual replays don't currently propagate the original request's correlation
ID), skip straight to §3 (search by delivery ID text directly).

Then, with the correlation ID in hand:

```bash
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={service=~"api|worker"} |= "<correlation-id>"' \
  --data-urlencode 'start=<unix-nanos-start>' \
  --data-urlencode 'end=<unix-nanos-end>' \
  --data-urlencode 'limit=200' | jq .
```

Or in Grafana Explore / the **Hookflow — Logs** dashboard: set the
`correlation_id` template variable and read the Logs panel — it runs exactly
this query.

This returns every log line — from *both* containers, interleaved by
timestamp when viewed in Grafana — for that one request: the API accepting
the event, the outbox publish, the worker consuming the dispatch, every retry
attempt, and the final success/failure.

---

## 2. You have an event ID instead

Same idea, one join earlier:

```sql
SELECT id AS delivery_id, endpoint_id, status
FROM deliveries
WHERE event_id = '<event-id>';
```

Then follow §1 per delivery (an event can fan out to multiple deliveries, one
per subscribed endpoint).

---

## 3. You don't have an ID at all — just a time window

`deliveryId` isn't a Loki label (see §4), but it *is* free text in both
services' log messages (`DeliveryConsumer`: `"Received delivery from {}:
deliveryId={}, endpointId={}"`, and similar in the API's `DeliveryService`/
`RetrySchedulerService`). Two options, cheapest first:

```logql
# If you know roughly which endpoint or organization:
{service=~"api|worker"} | json | organizationId="<org-id>"

# Broadest: everything, filtered by time range in Grafana's picker, then read.
{service=~"api|worker"}
```

Once you spot a `deliveryId=<uuid>` in any line, pivot straight to §1 with
that UUID, or just line-filter directly:

```logql
{service=~"api|worker"} |= "<delivery-id>"
```

---

## 4. Why `correlationId`/`organizationId`/`deliveryId` aren't Loki *labels*

Promtail (`monitoring/promtail/promtail-config.yml`) deliberately extracts
only `level` (and the container-derived `service`/`container` labels) as
indexed Loki labels. Per-request and per-tenant identifiers stay inside the
JSON log line body, queried with `| json` or a plain substring filter (`|=`)
instead of `{label="value"}`. This is a hard Loki design constraint, not
laziness: every distinct label *value* creates a separate index stream, so
turning a high-cardinality field like `correlationId` (one new value per
request, forever) into a label would make Loki's index grow without bound and
degrade every query, including this runbook's. Filtering by a value *inside*
the log line, with the LogQL patterns above, is the correct way to search these
fields.

---

## 5. Verification performed for this task

`make up && make monitoring-up` end to end (a real API/worker delivery,
observed live in Grafana) was **not** run for this task: the two compose
files are wired together via an `external: true` Docker network named
`webhook-platform_webhook-network` (`monitoring/docker-compose.yml`), which
Compose derives from the *directory name* the main stack is brought up
from — this repo is checked out into a per-agent worktree directory for this
task, so that network would come up as
`<worktree-dirname>_webhook-network` instead, and the monitoring stack's
hardcoded reference wouldn't resolve. (Pre-existing property of this repo's
Compose setup, unrelated to this change — pin `COMPOSE_PROJECT_NAME=webhook-platform`
if you need to run both from a non-standard directory.)

What **was** verified instead, end to end, against real Loki 3.0.0 and
Promtail 3.0.0 containers (not mocked): two throwaway containers labeled
`com.docker.compose.service=api` / `=worker` (matching the label Promtail's
`docker_sd_configs` relabeling keys off) each emitted one line of realistic
LogstashEncoder-shaped JSON — the `api` line included `correlationId`,
`organizationId`, and `deliveryId` fields; the `worker` line included the same
`correlationId` — and:

- Promtail correctly discovered both via the Docker label (not container name),
  dropped every other container's logs per the `keep` relabel rule, and shipped
  both lines to Loki with `service=api` / `service=worker` and `level=INFO`
  labels extracted from the JSON.
- Querying `{service=~"api|worker"} |= "<the shared correlationId>"` against
  Loki returned **both** lines — proof the cross-service correlationId pivot
  this runbook describes actually works, not just that the LogQL parses.

```
$ curl -sG http://localhost:13100/loki/api/v1/query_range \
    --data-urlencode 'query={service=~"api|worker"} |= "corr-abc-123"' ...
worker -> {"...","message":"Received delivery: deliveryId=del-555","correlationId":"corr-abc-123"}
api    -> {"...","message":"dispatching delivery","correlationId":"corr-abc-123","organizationId":"org-999","deliveryId":"del-555"}
total streams: 2
```

This exercised the real config files this task ships
(`monitoring/loki/loki-config.yml`, `monitoring/promtail/promtail-config.yml`)
unmodified except for the Loki push URL (pointed at the throwaway container
instead of the Compose service name `loki`).

The `logback-spring.xml` MDC fix (removing the `<includeMdcKeyName>` allow-list
so the full MDC map is emitted) was independently verified against a real,
live Spring Boot process: a throwaway test booted a minimal Spring context with
`spring.profiles.active=production` (needed because `<springProfile>` only
resolves through Boot's own `LoggingApplicationListener`, not plain Logback
config loading), set `correlationId`/`organizationId`/`userId` in MDC exactly
as `JwtAuthenticationFilter`/`CorrelationIdFilter` do, logged one line through
the real `logback-spring.xml`, and captured stdout:

```json
{"@timestamp":"2026-08-21T17:49:39.505336869+03:00","@version":"1","message":"mdc verification line","logger_name":"com.webhook.platform.api.TempLogbackMdcCheck","thread_name":"main","level":"INFO","level_value":20000,"organizationId":"org-verify-2","userId":"user-verify-3","correlationId":"corr-verify-1"}
```

Before this fix, `organizationId`/`userId` would have been silently absent
from that line (`includeMdcKeyName` limited to `correlationId`) — this is the
exact bug the task description named. The worker's equivalent fix (which also
corrected a stale allow-list referencing `deliveryId`/`endpointId`, MDC keys
worker code never actually sets — see the file's comment) wasn't re-verified
the same way since it's the identical encoder change; it follows from the same
documented `LogstashEncoder` behavior.

Not covered by this session: Grafana's provisioned Loki datasource /
**Hookflow — Logs** dashboard rendering correctly in a browser (the JSON was
validated as parseable and schema-consistent with the other dashboards, but
not screenshotted), and the full `make up && make monitoring-up` path once run
from a checkout where the network-name mismatch in §5 above doesn't apply.
