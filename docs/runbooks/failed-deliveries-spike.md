# Runbook: Failed Deliveries Spike

> **Alert:** `delivery_failure_rate_high`
> **Severity:** Warning → Critical
> **Triggers:** Delivery failure rate > 10% in 15 min (warning), > 25% in 5 min (critical)

---

## Symptoms

- Dashboard shows spike in failed/DLQ deliveries
- Endpoint owners report missing webhooks
- Circuit breakers tripping for multiple endpoints
- `delivery_status_total{status="FAILED"}` rate increasing

---

## Quick Triage (2 minutes)

### 1. Is it one endpoint or many?

```sql
-- Top failing endpoints in last hour
SELECT e.url, d.endpoint_id, COUNT(*) AS failures
FROM deliveries d
JOIN endpoints e ON e.id = d.endpoint_id
WHERE d.status IN ('FAILED', 'DLQ')
  AND d.updated_at > NOW() - INTERVAL '1 hour'
GROUP BY e.url, d.endpoint_id
ORDER BY failures DESC
LIMIT 10;
```

- **One endpoint:** Endpoint-specific issue → see Section A
- **Many endpoints:** Platform-wide issue → see Section B

### 2. Check recent error patterns

```sql
-- Recent delivery attempt errors
SELECT error_message, http_status_code, COUNT(*) AS cnt
FROM delivery_attempts
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND (http_status_code >= 400 OR error_message IS NOT NULL)
GROUP BY error_message, http_status_code
ORDER BY cnt DESC
LIMIT 10;
```

---

## A. Single Endpoint Failure

### Common causes

| Error | Cause | Action |
|-------|-------|--------|
| `Connection refused` | Endpoint is down | Wait for auto-retry, notify endpoint owner |
| `DNS resolution failed` | DNS issue or endpoint removed | Disable endpoint, notify owner |
| `SSRF_PROTECTION` | URL resolves to private IP | Expected behavior — endpoint URL is invalid |
| `HTTP 401/403` | Auth changed | Endpoint owner needs to update config |
| `HTTP 429` | Rate limited by endpoint | Reduce delivery rate, check rate limit settings |
| `HTTP 500/502/503` | Endpoint server error | Wait for auto-retry |
| `Timeout` | Endpoint too slow | Increase `timeout_seconds` on endpoint |

### Actions

1. **Check circuit breaker state:**
```bash
# Worker metrics
curl http://worker:8081/actuator/metrics/circuit_breaker_state
```

2. **If circuit breaker is OPEN:** Good — system is protecting itself. Deliveries will retry after cooldown.

3. **If endpoint is permanently broken:** Disable the endpoint to stop retry storms:
```sql
UPDATE endpoints SET deleted_at = NOW() WHERE id = '<endpoint_id>';
```

4. **Bulk retry after fix:** Once endpoint is healthy again:
```sql
UPDATE deliveries
SET status = 'PENDING', next_retry_at = NOW()
WHERE endpoint_id = '<endpoint_id>'
  AND status = 'FAILED'
  AND updated_at > NOW() - INTERVAL '24 hours';
```

---

## B. Platform-Wide Failure

### Check egress connectivity

```bash
# From a worker pod
kubectl exec -it <worker-pod> -- curl -v https://httpbin.org/post
```

If this fails → network/firewall issue.

### Check DNS resolution

```bash
kubectl exec -it <worker-pod> -- nslookup example.com
```

If this fails → CoreDNS issue.

### Check worker health

```bash
kubectl get pods -l app.kubernetes.io/component=worker
kubectl top pods -l app.kubernetes.io/component=worker
```

- OOMKilled? → Increase memory limits
- CrashLoopBackOff? → Check logs for startup errors
- High CPU? → Scale replicas

### Check database health

```bash
# Connection pool
curl http://worker:8081/actuator/metrics/hikaricp.connections.active

# Slow queries
psql -c "SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 5;"
```

See [database-issues.md](./database-issues.md) for detailed DB troubleshooting.

---

## Recovery Procedures

### Mass retry of failed deliveries

```sql
-- Retry all failed deliveries from the last 24h (batch of 1000)
UPDATE deliveries
SET status = 'PENDING',
    next_retry_at = NOW() + (random() * INTERVAL '300 seconds'),  -- spread over 5 min
    updated_at = NOW()
WHERE status = 'FAILED'
  AND updated_at > NOW() - INTERVAL '24 hours'
  AND id IN (
    SELECT id FROM deliveries
    WHERE status = 'FAILED'
      AND updated_at > NOW() - INTERVAL '24 hours'
    LIMIT 1000
  );
```

> **Important:** Add random jitter to `next_retry_at` to prevent thundering herd.

### DLQ replay

DLQ deliveries have exhausted all retries. To replay:

```sql
-- Reset DLQ deliveries to PENDING with fresh retry count
UPDATE deliveries
SET status = 'PENDING',
    attempt_count = 0,
    next_retry_at = NOW() + (random() * INTERVAL '60 seconds'),
    updated_at = NOW(),
    failed_at = NULL
WHERE status = 'DLQ'
  AND endpoint_id = '<endpoint_id>'
  AND updated_at > NOW() - INTERVAL '7 days';
```

---

## Escalation

| Failure Rate | Duration | Action |
|-------------|----------|--------|
| 10-25% | < 15 min | Monitor, likely transient |
| 10-25% | > 15 min | Investigate, check specific endpoints |
| 25-50% | Any | Page on-call, investigate platform-wide |
| > 50% | > 5 min | Incident — check connectivity, DB, Kafka |

---

## Prevention

- Monitor per-endpoint failure rates separately from global
- Set up circuit breakers with appropriate thresholds
- Configure endpoint-level rate limits to avoid overwhelming targets
- Use the `RetryGovernor` adaptive batch sizing (already implemented)
- Review DLQ weekly and clean up permanently-broken endpoints
