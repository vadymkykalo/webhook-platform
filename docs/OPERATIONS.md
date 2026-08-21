# Hookflow Operations Guide

## Quick Start (Docker Compose)

```bash
# Clone and start
git clone https://github.com/vadymkykalo/webhook-platform.git
cd webhook-platform
make up

# Check health
make health

# View logs
make logs
make logs-api
make logs-worker
```

## Production Deployment (Kubernetes)

```bash
# Create secrets
kubectl create secret generic hookflow-secrets \
  --from-literal=encryption-key="$(openssl rand -base64 32)" \
  --from-literal=jwt-secret="$(openssl rand -base64 64)"

kubectl create secret generic hookflow-postgresql-secret \
  --from-literal=password="$(openssl rand -base64 32)"

kubectl create secret generic hookflow-redis-secret \
  --from-literal=password="$(openssl rand -base64 32)"

# Install Helm chart (topics created automatically)
helm install hookflow ./deploy/helm/hookflow -f ./deploy/helm/hookflow/values-production.yaml \
  --set postgresql.external.host=your-postgres-host \
  --set kafka.external.bootstrapServers=your-kafka:9092 \
  --set ui.ingress.hosts[0].host=app.yourdomain.com

# Topics are auto-created via post-install hook:
# deliveries.dispatch, deliveries.retry.{1m,5m,15m,1h,6h,24h}, deliveries.dlq
```

## Common Issues

### High Kafka lag
- Scale workers: `make scale-worker N=5` or `kubectl scale deployment hookflow-worker --replicas=5`
- Check DB connection pool in logs
- Increase `KAFKA_DELIVERY_CONCURRENCY` env var

### Database issues
- Backup: `make backup-db` (docker-compose only)
- Check connections: `docker exec webhook-postgres pg_isready`
- Connection pool exhausted: increase `DB_POOL_MAX_SIZE`

### Failed deliveries spike
- Check DLQ: Navigate to UI → Failed Messages
- Bulk retry from UI
- Check endpoint availability

## Monitoring

Health endpoints:
- API: `http://localhost:8080/actuator/health`
- Worker: `http://localhost:8081/actuator/health` (internal)

Metrics (Prometheus): `/actuator/prometheus` — on port **8082** for the API,
**8081** for the worker (a separate `management.server.port` from the main app
port, so Prometheus can scrape without a JWT/API-key — the app's main-port
`/actuator/**` still requires one). See `monitoring/README.md` "Metrics-scrape
auth" for the full rationale and the one place this isn't fixed yet
(Kubernetes/Helm's `ServiceMonitor` for the API still scrapes the authenticated
main port and 401s — tracked below, not yet done).

Alerting: `make monitoring-up` also starts Alertmanager (`:9093`), which routes
the 14 rules in `deploy/prometheus/alerts.yml` to Slack/webhook/email via the
`ALERTMANAGER_*` env vars (`.env.dist`). See `monitoring/README.md` "Alerting".

**Kubernetes gap (open, P1-20):** `deploy/helm/hookflow/templates/servicemonitor.yaml`
scrapes the API's `/actuator/prometheus` on its main authenticated port — that
scrape 401s today. Fixing it means adding a management port to
`api-deployment.yaml` / `api-service.yaml` / `servicemonitor.yaml` /
`values.yaml` and re-pointing the liveness/readiness probes, which needs a real
cluster to validate before shipping; the app itself already supports it via the
`MANAGEMENT_PORT`/`MANAGEMENT_ADDRESS` env vars (same mechanism the Compose
path uses), the chart templates just don't set them yet. The worker's
ServiceMonitor is unaffected (worker has no auth on its actuator at all) but
was separately broken by `MANAGEMENT_ADDRESS` defaulting to `127.0.0.1` —
fixed in P1-20 (default is now `0.0.0.0`; not published to any host port).

## Backup & Restore

Both `backup-db` and `restore-db` work against the embedded Compose DB
(`docker exec`) or any external/managed Postgres (`DB_MODE=external`, via a
throwaway `postgres:16-alpine` container — no local `pg_dump`/`pg_restore`
needed). Backups are custom-format `.dump` files (`pg_dump -Fc`), restorable
with `pg_restore`; the pre-P1-20 plain-SQL `.sql.gz` format is still readable
by `restore-db` for anyone restoring an older backup.

```bash
# Backup — embedded DB (default) or external:
make backup-db
make backup-db DB_MODE=external DB_HOST=my-managed-pg.example.com DB_USER=... DB_PASSWORD=...

# Restore (prompts for confirmation; CONFIRM=YES skips the prompt, e.g. in CI):
make restore-db FILE=backups/webhook_platform_20260101_120000.dump
```

**Scheduled backups (Compose):** starting the platform with `make up`
(embedded-DB profile) also starts a `db-backup` sidecar that runs
`deploy/scripts/db-backup.sh` on a fixed interval (`DB_BACKUP_INTERVAL_SECONDS`,
default 86400/daily) with age-based retention (`BACKUP_RETENTION_DAYS`, default
30) — mirroring `deploy/helm/hookflow/templates/db-backup-cronjob.yaml`, the
only prior scheduled backup (Kubernetes-only). `docker compose logs db-backup`
shows each run; a failed backup logs and retries on the next interval rather
than crash-looping the container.

**Restore drill (CI):** `.github/workflows/ci.yml`'s `restore-drill` job runs
backup → destroy the table → restore → assert the data is back, on every push/PR
that touches `deploy/scripts/**`, `docker-compose.yml`, or the Makefile's
database targets — see that job for the exact steps. An untested restore path
is the most common cause of an unusable backup; this is what turns "we take
backups" into a guarantee that they're restorable.

**Open question this repo doesn't fully answer yet — Postgres PITR vs.
Kafka/Redis state:** see `docs/runbooks/disaster-recovery.md` §1.4
"After restoring Postgres: outbox, Kafka and Redis consistency" for what a
point-in-time (or full) Postgres restore does to in-flight outbox rows, Kafka
messages already published for events the restore rolled back, and Redis
counters that no longer agree with the restored DB.

## Scaling

```bash
# Docker Compose
make scale-worker N=5
make scale-api N=3     # P1-20: the base compose files bind the API to a fixed
                        # host port (127.0.0.1:8080) for direct `curl
                        # localhost:8080` access, which blocks `--scale api=N`
                        # outright — every replica would fight over the same
                        # host port. This target runs with API_PORT= (empty),
                        # which collapses that mapping to an ephemeral
                        # per-replica host port instead (see the API_PORT
                        # comment in docker-compose.yml). Traffic still reaches
                        # every replica because the UI's nginx proxies to
                        # `api:8080` by Compose DNS, which load-balances across
                        # replicas on its own. Trade-off: `curl localhost:8080`
                        # from the host no longer reaches a specific replica —
                        # use `docker compose exec api ...` or go through the UI.

# Kubernetes (auto-scales with HPA)
kubectl scale deployment hookflow-worker --replicas=10
```

## Upgrades

```bash
# Docker Compose
docker compose pull
make rebuild

# Kubernetes (zero-downtime)
helm upgrade hookflow ./deploy/helm/hookflow

# Rollback if needed
kubectl rollout undo deployment hookflow-api
```

## Security Checklist

Production must have:
- [ ] `WEBHOOK_ENCRYPTION_KEY` - unique 32-char random key
- [ ] `JWT_SECRET` - unique 64-char random key  
- [ ] `DB_PASSWORD` - strong password, not default
- [ ] `REDIS_PASSWORD` - strong password, not default
- [ ] `WEBHOOK_ALLOW_PRIVATE_IPS=false`
- [ ] `SWAGGER_ENABLED=false`
- [ ] `DB_SSL_MODE=require`
- [ ] TLS termination at ingress/load balancer

## Environment Variables

Key settings:
- `APP_ENV=production` - enables production mode
- `LOG_LEVEL=WARN` - reduces log verbosity
- `DB_POOL_MAX_SIZE=20` (API), `30` (Worker)
- `KAFKA_DELIVERY_CONCURRENCY=8` - parallel deliveries per worker

## Detailed Documentation

- **[Self-Hosted Deployment Guide](./SELF_HOSTED_GUIDE.md)** — hardware sizing, pre-flight checks, Helm install, TLS, monitoring
- **[SLOs & Error Budgets](./runbooks/SLOs.md)** — service level objectives, PromQL queries, dashboard panels
- **[High Kafka Lag](./runbooks/high-kafka-lag.md)** — diagnosis, worker scaling, Kafka broker issues
- **[Database Issues](./runbooks/database-issues.md)** — connection pools, slow queries, disk, locks, replication
- **[Failed Deliveries Spike](./runbooks/failed-deliveries-spike.md)** — triage, per-endpoint vs platform-wide, mass retry
- **[Disaster Recovery](./runbooks/disaster-recovery.md)** — PG restore, Kafka rebuild, full cluster recovery, RTO/RPO
- **[Secret Rotation](./runbooks/secret-rotation.md)** — JWT, encryption keys, DB/Redis passwords, Stripe keys

## Support

- Docs: https://github.com/vadymkykalo/webhook-platform
- Issues: https://github.com/vadymkykalo/webhook-platform/issues
