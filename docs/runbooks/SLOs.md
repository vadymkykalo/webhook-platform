# Hookflow — Service Level Objectives (SLOs)

> These SLOs define the reliability targets for Hookflow in production.
> All metrics should be measured over a **30-day rolling window** unless stated otherwise.

---

## SLO Summary

| SLO | Target | Measurement | Alert Threshold |
|-----|--------|-------------|-----------------|
| API Availability | 99.9% | HTTP 5xx rate < 0.1% over 30d | > 0.5% 5xx in 5 min |
| Ingestion Latency | p99 < 500ms | `event_ingest_duration_seconds` histogram | p99 > 1s for 5 min |
| Delivery Success Rate | > 95% | successful / total deliveries over 24h | < 90% in 1h window |
| First-Attempt Latency | p95 < 5s | time from event creation to first delivery attempt | p95 > 10s for 10 min |
| DLQ Rate | < 1% | DLQ entries / total deliveries over 24h | > 3% in 1h window |
| Retry Scheduler Lag | < 60s | max(now - next_retry_at) for pending deliveries | > 300s for 5 min |

---

## Detailed Definitions

### 1. API Availability — 99.9%

**What:** The API returns non-5xx responses to valid requests.

**Measurement:**
```promql
1 - (
  sum(rate(http_server_requests_seconds_count{status=~"5.."}[30d]))
  /
  sum(rate(http_server_requests_seconds_count[30d]))
)
```

**Error budget:** 0.1% = ~43 minutes of downtime per 30 days.

**Exclusions:**
- Health check endpoints (`/actuator/health`)
- Webhook callback endpoints (external system failures)
- Requests rejected by rate limiting (429s are expected, not errors)

---

### 2. Ingestion Latency — p99 < 500ms

**What:** Time from receiving `POST /api/v1/events` to returning the response (event persisted + outbox written).

**Measurement:**
```promql
histogram_quantile(0.99,
  sum(rate(http_server_requests_seconds_bucket{uri="/api/v1/events", method="POST"}[5m])) by (le)
)
```

**Dependencies:** PostgreSQL write latency, Kafka availability (outbox publish is async).

**Degradation signals:**
- DB connection pool saturation (`hikaricp_connections_active` near max)
- Slow PG queries (check `pg_stat_activity`)

---

### 3. Delivery Success Rate — > 95%

**What:** Percentage of deliveries that eventually succeed (status = `SUCCESS`) out of all deliveries created in the last 24 hours.

**Measurement:**
```promql
sum(delivery_status_total{status="SUCCESS"}) 
/ 
sum(delivery_status_total)
```

**Notes:**
- This includes retries — a delivery that fails 3 times then succeeds counts as success.
- Deliveries to permanently broken endpoints (SSRF-blocked, DNS failure) are expected to fail.
- Per-endpoint breakdown is useful: a single bad endpoint can skew the global rate.

---

### 4. First-Attempt Latency — p95 < 5s

**What:** Wall-clock time from event creation (`event.created_at`) to the first delivery attempt (`delivery_attempt.created_at`).

**Measurement:**
```promql
histogram_quantile(0.95,
  sum(rate(delivery_first_attempt_latency_seconds_bucket[5m])) by (le)
)
```

**Components:**
1. Outbox poll interval (~1-5s)
2. Kafka produce + consume (~100ms)
3. HTTP call to endpoint (~variable)

**If degraded:** Check Kafka consumer lag, outbox publisher health, worker pod count.

---

### 5. DLQ Rate — < 1%

**What:** Percentage of deliveries that exhaust all retries and land in the Dead Letter Queue.

**Measurement:**
```promql
sum(rate(delivery_status_total{status="DLQ"}[24h]))
/
sum(rate(delivery_status_total[24h]))
```

**Investigation:** High DLQ rate usually means:
- Endpoint is permanently down → check endpoint health
- Endpoint returns persistent 4xx → check payload format
- Network issue → check egress connectivity

---

### 6. Retry Scheduler Lag — < 60s

**What:** How far behind the retry scheduler is — the oldest delivery whose `next_retry_at` is in the past.

**Measurement:**
```sql
SELECT MAX(EXTRACT(EPOCH FROM (NOW() - next_retry_at)))
FROM deliveries
WHERE status = 'PENDING' AND next_retry_at < NOW();
```

Prometheus gauge: `retry_governor_pending_count`

**If degraded:**
- Check `RetryGovernor` metrics (cooldown, effective batch)
- Scale worker pods
- Check DB query performance for `findPendingRetryIds`

---

## Error Budget Policy

| Burn Rate | Action |
|-----------|--------|
| < 50% budget consumed | Normal operations |
| 50-75% budget consumed | Investigate, create incident ticket |
| 75-100% budget consumed | Freeze non-critical deployments, focus on reliability |
| Budget exhausted | All hands on reliability, roll back recent changes |

---

## Dashboard

Recommended Grafana dashboard panels:
1. **API request rate** — by status code (2xx, 4xx, 5xx)
2. **Ingestion latency** — p50, p95, p99 histogram
3. **Delivery funnel** — created → attempted → succeeded → failed → DLQ
4. **Retry scheduler** — pending count, effective batch, poll interval
5. **Kafka consumer lag** — per topic per consumer group
6. **DB connection pool** — active, idle, pending
7. **Error budget burn** — remaining % over 30d window
