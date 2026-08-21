# Runbook: Disaster Recovery

> Procedures for recovering Hookflow from data loss, infrastructure failure, or corruption.

---

## Recovery Priority Order

1. **PostgreSQL** — source of truth for all state (events, deliveries, endpoints, users)
2. **Kafka** — transient message bus; topics can be recreated, messages re-derived from DB
3. **Redis** — ephemeral caches (rate limiters, quota counters); auto-rebuilds from DB

---

## 1. PostgreSQL Recovery

### 1.0 Docker Compose path

**Prerequisites:** a backup produced by `make backup-db` or the `db-backup`
Compose sidecar (custom format `.dump`; see `docs/OPERATIONS.md` "Backup &
Restore" and `deploy/scripts/db-backup.sh`).

```bash
# List available backups
ls -la ./backups/webhook_platform_*.dump

# Stop API and Worker first — see §1.4 below for why this matters more than
# it looks like it should.
docker compose stop api worker

# Restore (drops and recreates objects inside the existing database)
make restore-db FILE=backups/webhook_platform_20260101_120000.dump CONFIRM=YES

docker compose start api worker
make wait-healthy
```

This exact sequence (backup → destroy data → restore → assert integrity) runs
in CI on every change to the backup/restore scripts — see the `restore-drill`
job in `.github/workflows/ci.yml`.

### 1.1 Full Database Restore from Backup (Kubernetes)

**Prerequisites:** Backup file created by the `hookflow-db-backup` CronJob (custom format `.dump`).

```bash
# List available backups
ls -la /backup/hookflow-*.dump

# Stop API and Worker to prevent writes during restore
kubectl scale deployment hookflow-api --replicas=0
kubectl scale deployment hookflow-worker --replicas=0

# Restore (drop existing and recreate)
pg_restore \
  -h $DB_HOST -p $DB_PORT -U $DB_USERNAME -d $DB_NAME \
  --clean --if-exists --no-owner --no-privileges \
  /backup/hookflow-YYYYMMDD-HHMMSS.dump

# Restart services
kubectl scale deployment hookflow-api --replicas=2
kubectl scale deployment hookflow-worker --replicas=2

# Verify
curl http://api:8080/actuator/health
```

### 1.2 Point-in-Time Recovery (PITR)

If using WAL archiving (recommended for production):

```bash
# 1. Stop PostgreSQL
pg_ctl stop -D /var/lib/postgresql/data

# 2. Create recovery.conf (or postgresql.auto.conf for PG >= 12)
cat > /var/lib/postgresql/data/postgresql.auto.conf << EOF
restore_command = 'cp /wal_archive/%f %p'
recovery_target_time = '2024-01-15 14:30:00 UTC'
recovery_target_action = 'promote'
EOF

# 3. Create recovery signal
touch /var/lib/postgresql/data/recovery.signal

# 4. Start PostgreSQL
pg_ctl start -D /var/lib/postgresql/data
```

### 1.3 Failover to Read Replica

If using streaming replication:

```bash
# On the replica
pg_ctl promote -D /var/lib/postgresql/data

# Update Hookflow config to point to new primary
# Helm: update postgresql.external.host in values.yaml
helm upgrade hookflow deploy/helm/hookflow \
  --set postgresql.external.host=new-primary.example.com

# Verify
psql -h new-primary -c "SELECT pg_is_in_recovery();"
# Should return: f (false = primary)
```

### 1.4 After restoring Postgres: outbox, Kafka and Redis consistency

**This is the question the rest of this runbook doesn't answer (P1-20).**
Restoring Postgres — full restore or point-in-time — rolls back *only*
Postgres. Kafka keeps every message it already has and every consumer offset
it already committed; Redis keeps every key it already holds. Neither one
knows the database just moved backward in time, and that mismatch has three
concrete consequences:

1. **Outbox rows re-publish, which can re-deliver webhooks that already went
   out.** `OutboxPublisherService` (see root `CLAUDE.md` "Two delivery
   pipelines") marks an outbox row dispatched only after Kafka accepts it. If
   the restore point is *before* that row was marked dispatched — but *after*
   the corresponding webhook was actually delivered to the customer's endpoint
   (delivery and outbox-row-update aren't the same transaction) — the restored
   row comes back as `PENDING`, the publisher republishes it, and the worker
   delivers it again. There is no dedupe layer between "Postgres says pending"
   and "customer already got this" once the DB has been wound back; the
   customer's endpoint is the only place that still knows. **Action:** before
   restarting API/worker after a restore, query
   `SELECT id, event_id, endpoint_id, delivered_at FROM deliveries WHERE status IN ('SENT','DELIVERED') AND delivered_at > '<restore/backup timestamp>'`
   in the *pre-restore* database (or the backup you're restoring, mounted
   read-only) — that's the set of deliveries the restore is about to make
   Hookflow forget it already sent. If it's non-trivial, warn affected
   customers that some webhooks may repeat and confirm your webhook consumer
   guidance already tells them to dedupe by event ID (it's inherently
   at-least-once even without a restore).

2. **Sequence numbers can collide, confusing FIFO ordering.**
   `SequenceGeneratorService` (API) stamps per-endpoint sequence numbers in
   Postgres; `OrderingBufferService` (worker) tracks "highest delivered
   sequence per endpoint" **in Redis**, with `ordering_cursors` in Postgres as
   the durable fallback (root `CLAUDE.md` "FIFO ordering"). A Postgres restore
   rolls the sequence generator and `ordering_cursors` back, but **not**
   Redis's already-delivered-sequence state. New events created after the
   restore can be assigned sequence numbers that the Redis-side cursor has
   already seen as delivered — `OrderingBufferService` will treat them as
   stale duplicates and silently drop or misorder them. **Action:** flush the
   ordering-related Redis keys (or the whole instance — Redis is documented in
   §3 below as safe to wipe and rebuild) as part of every Postgres restore,
   not just an ad-hoc "if things look wrong" step. Do this *before* restarting
   the worker.

3. **In-flight Kafka messages can reference deliveries/events the restore just
   erased or changed.** A message published to `deliveries.dispatch` (or any
   retry/incoming-forward topic) between the restore point and "now" points at
   a DB row that, post-restore, may not exist or may have different content.
   The worker will fail to look it up (logged, not silently lost — but still
   noise during an already-stressful recovery) or, worse, act on stale data if
   the row exists but was reverted. **Action:** for a restore that rewinds
   more than a few minutes, treat it like the "Full Cluster Recovery" case in
   §2.1 and delete + recreate the delivery-related topics rather than let the
   worker process whatever's still sitting in them — Kafka is documented
   throughout this runbook as safe to recreate because Postgres is the source
   of truth, but that assumption specifically requires Postgres to be
   *current*, which right after a restore it deliberately isn't.

**Recommended order, tying the three together:**
`docker compose stop api worker` (or scale K8s deployments to 0) → restore
Postgres → flush ordering-related Redis keys → decide whether to
delete/recreate the delivery Kafka topics (skip for a restore of a few minutes
or less; do it for anything that rewinds hours+) → restart worker, then API →
run the query in point 1 and communicate to affected customers if needed.

---

## 2. Kafka Recovery

### 2.1 Topic Deletion + Recreation

Kafka topics are transient — messages are consumed and state is in PostgreSQL. Safe to recreate.

```bash
# Delete and recreate all topics
for topic in deliveries.dispatch deliveries.retry.1m deliveries.retry.5m \
  deliveries.retry.15m deliveries.retry.1h deliveries.retry.6h \
  deliveries.retry.24h deliveries.dlq \
  incoming.forward.dispatch incoming.forward.retry; do
  
  kafka-topics.sh --bootstrap-server $KAFKA_BOOTSTRAP \
    --delete --topic $topic 2>/dev/null || true
  
  kafka-topics.sh --bootstrap-server $KAFKA_BOOTSTRAP \
    --create --topic $topic \
    --partitions 12 --replication-factor 3
done
```

### 2.2 Consumer Offset Reset

If consumer offsets are corrupted:

```bash
# Reset to latest (skip old messages — they're already processed)
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BOOTSTRAP \
  --group hookflow-worker \
  --reset-offsets --to-latest \
  --all-topics --execute
```

### 2.3 After Kafka Recovery — Re-dispatch Pending Deliveries

Deliveries that were in-flight when Kafka died are in `PENDING` state in DB. The `RetrySchedulerService` will automatically pick them up. Verify:

```sql
SELECT status, COUNT(*)
FROM deliveries
WHERE updated_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```

---

## 3. Redis Recovery

### 3.1 Redis is Ephemeral

Redis stores:
- **Rate limiter state** — auto-rebuilds from config
- **Quota counters** — auto-re-seeds from DB on next check (`QuotaCounterService.getCurrentCount()`)
- **Circuit breaker state** — resets to CLOSED (safe default)
- **Plan cache** — refills on next access (`EntitlementService.planCache`)

**Action:** Just restart Redis. No data migration needed.

```bash
kubectl delete pod -l app=redis
# Wait for pod to restart
kubectl wait --for=condition=ready pod -l app=redis --timeout=120s
```

### 3.2 Verify After Redis Recovery

```bash
# Check Redis connectivity from API
curl http://api:8080/actuator/health/redis

# Check quota counter re-seeding (should fall back to DB)
curl http://api:8080/actuator/metrics/quota.counter.fallback
```

---

## 4. Full Cluster Recovery

If the entire Kubernetes cluster is lost:

### Recovery Order

1. **Provision new cluster** (EKS/GKE/AKS or bare metal)
2. **Deploy infrastructure:**
   ```bash
   # Install cert-manager
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml
   
   # Install ingress-nginx
   helm install ingress-nginx ingress-nginx/ingress-nginx
   ```
3. **Restore PostgreSQL** from backup to new PG instance
4. **Deploy Hookflow:**
   ```bash
   # Create secrets
   kubectl create secret generic hookflow-secrets \
     --from-literal=encryption-key=$ENCRYPTION_KEY \
     --from-literal=jwt-secret=$JWT_SECRET
   
   kubectl create secret generic hookflow-postgresql-secret \
     --from-literal=password=$DB_PASSWORD
   
   kubectl create secret generic hookflow-redis-secret \
     --from-literal=password=$REDIS_PASSWORD
   
   # Deploy
   helm install hookflow deploy/helm/hookflow -f values-production.yaml
   ```
5. **Verify** all endpoints respond, deliveries are flowing

### Data That Cannot Be Recovered Without Backup

| Data | Impact | Mitigation |
|------|--------|------------|
| PostgreSQL data | **Total loss** — all events, deliveries, users, configs | Daily backups + WAL archiving |
| Webhook endpoint secrets | Cannot re-derive (AES-GCM encrypted) | Backup encryption key separately |
| JWT secret | All sessions invalidated (users must re-login) | Store in external secret manager |
| Encryption key + salt | Cannot decrypt any stored secrets | **Critical** — must be backed up offline |

---

## 5. Backup Verification Schedule

| Task | Frequency | Procedure |
|------|-----------|-----------|
| Backup file existence check | Daily (automated) | Verify CronJob/`db-backup` sidecar ran, check file size > 0 |
| Mechanical restore drill (backup → destroy → restore → assert data) | Every CI run touching backup/restore code (automated) | `restore-drill` job in `.github/workflows/ci.yml` — see §1.0 |
| Backup restore test | Monthly | Restore to staging environment, verify data |
| Full DR drill | Quarterly | Simulate cluster loss, measure recovery time |
| Encryption key backup verification | Monthly | Verify key exists in offline storage |

---

## Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single worker pod crash | < 1 min (auto-restart) | 0 (no data loss) |
| Database failover (replica) | 5-10 min | < 1 min (replication lag) |
| Database restore from backup | 30-60 min | Up to 24h (backup frequency) |
| Full cluster recovery | 2-4 hours | Up to 24h (backup frequency) |
| Full DR (new region) | 4-8 hours | Up to 24h |
