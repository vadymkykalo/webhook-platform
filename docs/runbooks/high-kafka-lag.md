# Runbook: High Kafka Consumer Lag

> **Alert:** `kafka_consumer_lag_high`
> **Severity:** Warning → Critical
> **Triggers:** Consumer lag > 1000 messages for 5 minutes (warning), > 10000 for 5 minutes (critical)

---

## Symptoms

- Deliveries are delayed (increased first-attempt latency)
- Events are ingested but not being delivered
- Dashboard shows growing "pending" delivery count
- Kafka consumer group shows increasing lag

---

## Quick Diagnosis

### 1. Check consumer lag

```bash
# Using kafka-consumer-groups CLI
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BOOTSTRAP \
  --describe --group hookflow-worker

# Key columns: TOPIC, PARTITION, CURRENT-OFFSET, LOG-END-OFFSET, LAG
```

### 2. Check worker pod health

```bash
kubectl get pods -l app.kubernetes.io/component=worker
kubectl logs -l app.kubernetes.io/component=worker --tail=100 | grep -i error
```

### 3. Check worker metrics

```bash
# Actuator endpoint on worker
curl http://worker:8081/actuator/metrics/kafka.consumer.fetch.manager.records.lag.max
curl http://worker:8081/actuator/metrics/delivery.processing.duration
```

---

## Root Causes & Remediation

### A. Worker pods crashed or not enough replicas

**Check:**
```bash
kubectl get pods -l app.kubernetes.io/component=worker
kubectl describe pod <worker-pod>  # Check Events section
```

**Fix:**
```bash
# Scale up workers
kubectl scale deployment hookflow-worker --replicas=5

# Or if HPA is enabled, check if it's hitting limits
kubectl get hpa hookflow-worker
```

### B. Slow delivery processing (endpoint latency)

**Check:**
```bash
# Look for slow endpoints in worker logs
kubectl logs -l app.kubernetes.io/component=worker --tail=500 | grep "durationMs"
```

**Fix:**
- If specific endpoints are slow: circuit breaker will eventually trip
- Increase `KAFKA_DELIVERY_CONCURRENCY` (default: 8)
- Increase worker replicas

### C. Database connection exhaustion

**Check:**
```bash
# Check HikariCP pool metrics
curl http://worker:8081/actuator/metrics/hikaricp.connections.active
curl http://worker:8081/actuator/metrics/hikaricp.connections.pending
```

**Fix:**
- Increase `DB_POOL_MAX_SIZE` in worker env
- Check for long-running transactions: `SELECT * FROM pg_stat_activity WHERE state = 'active' ORDER BY query_start;`
- Check for lock contention: `SELECT * FROM pg_locks WHERE NOT granted;`

### D. Kafka broker issues

**Check:**
```bash
# Check broker health
kafka-metadata.sh --snapshot /var/kafka-logs/__cluster_metadata-0/00000000000000000000.log --cluster-id <id>

# Check under-replicated partitions
kafka-topics.sh --bootstrap-server $KAFKA_BOOTSTRAP --describe --under-replicated-partitions
```

**Fix:**
- If broker is down: check broker logs, restart if needed
- If disk full: expand PVC or clean up old segments
- If under-replicated: wait for ISR catch-up or reassign partitions

---

## Escalation

| Lag Duration | Action |
|-------------|--------|
| < 5 min | Monitor, likely transient |
| 5-15 min | Scale workers, check endpoints |
| 15-60 min | Page on-call, investigate root cause |
| > 1 hour | Incident — consider pausing non-critical processing |

---

## Prevention

- Set HPA `targetCPUUtilizationPercentage: 60` for workers (aggressive scaling)
- Monitor `retry_governor_pending_count` for early warning
- Set up alerts on consumer lag per topic
- Ensure worker `DB_POOL_MAX_SIZE` >= `KAFKA_DELIVERY_CONCURRENCY` × 2
