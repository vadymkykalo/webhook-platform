# Runbook: Database Issues

> Covers: connection pool exhaustion, slow queries, disk space, lock contention, replication lag.

---

## 1. Connection Pool Exhaustion

### Symptoms
- API returns 503 / connection timeout errors
- Worker logs: `HikariPool - Connection is not available, request timed out`
- Metric: `hikaricp.connections.pending` > 0 sustained

### Diagnosis

```bash
# Check active connections
curl http://api:8080/actuator/metrics/hikaricp.connections.active
curl http://api:8080/actuator/metrics/hikaricp.connections.idle
curl http://api:8080/actuator/metrics/hikaricp.connections.pending

# Check PostgreSQL side
psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
psql -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

### Remediation

1. **Immediate:** Kill idle-in-transaction sessions:
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND query_start < NOW() - INTERVAL '5 minutes';
```

2. **Short-term:** Increase pool size:
```yaml
# Helm values
api:
  env:
    DB_POOL_MAX_SIZE: "30"   # default: 20
    DB_POOL_MIN_IDLE: "20"   # default: 15
worker:
  env:
    DB_POOL_MAX_SIZE: "40"   # default: 30
    DB_POOL_MIN_IDLE: "25"   # default: 20
```

3. **Long-term:** Check for connection leaks, add `leak-detection-threshold: 30000` to HikariCP config.

---

## 2. Slow Queries

### Diagnosis

```sql
-- Top 10 slowest active queries
SELECT pid, now() - query_start AS duration, state, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC
LIMIT 10;

-- Top 10 slowest query patterns (requires pg_stat_statements)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Common Slow Queries in Hookflow

| Query Pattern | Likely Cause | Fix |
|--------------|-------------|-----|
| `SELECT ... FROM delivery_attempts WHERE delivery_id = ?` | Missing index | `CREATE INDEX idx_delivery_attempts_delivery_id ON delivery_attempts(delivery_id);` |
| `SELECT ... FROM deliveries WHERE status = 'PENDING' AND next_retry_at < ?` | Full table scan on large table | Ensure index on `(status, next_retry_at)` exists |
| `COUNT(*) FROM events WHERE organization_id = ? AND created_at BETWEEN ? AND ?` | Quota check on large events table | Use Redis counter (`QuotaCounterService`) — already implemented |
| `SELECT ... FROM delivery_attempts ORDER BY created_at DESC` | Analytics on unpartitioned table | Consider table partitioning (see scale fixes) |

### Remediation

```sql
-- Check existing indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'deliveries';

-- Check if index is being used
EXPLAIN ANALYZE <slow_query>;

-- Add missing index (if needed)
CREATE INDEX CONCURRENTLY idx_deliveries_retry
ON deliveries(status, next_retry_at)
WHERE status = 'PENDING' AND next_retry_at IS NOT NULL;
```

---

## 3. Disk Space

### Diagnosis

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size('hookflow'));

-- Largest tables
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;

-- Table bloat estimate
SELECT schemaname, relname,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_dead_tup, n_live_tup,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 1) AS dead_pct
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
```

### Remediation

1. **VACUUM:** Run manual vacuum on bloated tables:
```sql
VACUUM (VERBOSE, ANALYZE) delivery_attempts;
VACUUM (VERBOSE, ANALYZE) deliveries;
VACUUM (VERBOSE, ANALYZE) events;
```

2. **Cleanup old data:**
```sql
-- Delete delivery attempts older than retention period
-- WARNING: run in batches to avoid long locks
DELETE FROM delivery_attempts
WHERE created_at < NOW() - INTERVAL '90 days'
LIMIT 10000;
```

3. **Monitor autovacuum:**
```sql
SELECT relname, last_vacuum, last_autovacuum, n_dead_tup
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;
```

---

## 4. Lock Contention

### Diagnosis

```sql
-- Blocked queries
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_query,
       blocking_activity.query AS blocking_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

### Remediation

- Hookflow uses `SELECT ... FOR UPDATE SKIP LOCKED` for retry scheduling — this should prevent most lock contention
- If seeing lock issues: check for long-running migrations, manual admin queries, or stuck transactions
- Kill blocking session if safe: `SELECT pg_terminate_backend(<blocking_pid>);`

---

## 5. Replication Lag (if using read replicas)

### Diagnosis

```sql
-- On primary
SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes
FROM pg_stat_replication;

-- On replica
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;
```

### Remediation

- If lag < 10s: normal, monitor
- If lag > 60s: check network between primary and replica, check replica I/O
- If lag > 5 min: consider promoting replica or switching to primary-only reads
