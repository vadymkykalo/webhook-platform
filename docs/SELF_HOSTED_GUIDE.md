# Hookflow — Self-Hosted Deployment Guide

> Complete guide for deploying Hookflow in your own infrastructure.

---

## Table of Contents

1. [Hardware Requirements](#1-hardware-requirements)
2. [Network Requirements](#2-network-requirements)
3. [Pre-flight Checks](#3-pre-flight-checks)
4. [Installation Methods](#4-installation-methods)
5. [Configuration Reference](#5-configuration-reference)
6. [Upgrade Strategy](#6-upgrade-strategy)
7. [Backup & Restore](#7-backup--restore)
8. [TLS & mTLS](#8-tls--mtls)
9. [Monitoring](#9-monitoring)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Hardware Requirements

### Sizing Guide

| Profile | Events/day | API Pods | Worker Pods | PostgreSQL | Kafka | Redis | Total RAM |
|---------|-----------|----------|-------------|------------|-------|-------|-----------|
| **Small** | < 10K | 2 × 512Mi | 2 × 512Mi | 1 × 1Gi | 1 × 1Gi | 1 × 256Mi | ~5 Gi |
| **Medium** | < 100K | 3 × 1Gi | 3 × 1.5Gi | Primary + replica, 2Gi each | 3 × 2Gi | Sentinel, 512Mi each | ~20 Gi |
| **Large** | < 1M | 5 × 2Gi | 10 × 2Gi | Primary + 2 replicas, 4Gi each | 5 × 4Gi | Cluster (3 nodes), 1Gi each | ~65 Gi |

### Disk Requirements

| Component | Small | Medium | Large |
|-----------|-------|--------|-------|
| PostgreSQL | 10 Gi | 50 Gi | 200 Gi (SSD) |
| Kafka | 10 Gi | 50 Gi | 200 Gi (SSD) |
| Redis | 1 Gi | 2 Gi | 5 Gi |
| Backups | 10 Gi | 50 Gi | 200 Gi |

### CPU Requirements

- **API:** 250m-1000m per pod (bursty: JSON parsing, encryption)
- **Worker:** 500m-2000m per pod (sustained: HTTP calls, retry scheduling)
- **PostgreSQL:** 250m-2000m (I/O bound, benefits from fast storage)
- **Kafka:** 500m-2000m per broker (network + disk I/O)

---

## 2. Network Requirements

### Ports

| Service | Port | Protocol | Direction | Notes |
|---------|------|----------|-----------|-------|
| API (HTTP) | 8080 | TCP | Inbound | REST API + webhook ingestion |
| API (Actuator) | 8080 | TCP | Internal | `/actuator/health` on same port |
| Worker (Actuator) | 8081 | TCP | Internal | Health checks + metrics |
| UI (HTTP) | 80/443 | TCP | Inbound | Web dashboard |
| PostgreSQL | 5432 | TCP | Internal | Database |
| Kafka | 9092 | TCP | Internal | Message bus |
| Redis | 6379 | TCP | Internal | Cache + rate limiting |

### Egress Requirements

- **Worker → Internet:** Must be able to reach webhook endpoints (HTTP/HTTPS on arbitrary ports)
- **API → Kafka:** For outbox publishing
- **Worker → Kafka:** For consuming deliveries
- **API/Worker → PostgreSQL:** For persistence
- **API/Worker → Redis:** For caching and rate limiting
- **API → Stripe/WayForPay:** If billing enabled (HTTPS to `api.stripe.com`, `api.wayforpay.com`)

### SSRF Protection

By default in production, Hookflow blocks webhook delivery to private/internal IPs:

```yaml
WEBHOOK_ALLOW_PRIVATE_IPS: "false"  # Always false in production
WEBHOOK_ALLOWED_HOSTS: ""           # Comma-separated allowlist for internal services
```

If you need to deliver webhooks to internal services:
```yaml
WEBHOOK_ALLOWED_HOSTS: "internal-service.default.svc.cluster.local,10.0.1.50"
```

---

## 3. Pre-flight Checks

Before deploying, verify:

### 3.1 Infrastructure Connectivity

```bash
# PostgreSQL
psql -h $DB_HOST -p $DB_PORT -U $DB_USERNAME -d $DB_NAME -c "SELECT 1;"

# Kafka
kafka-topics.sh --bootstrap-server $KAFKA_BOOTSTRAP --list

# Redis
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping
```

### 3.2 Security Configuration

```bash
# Encryption key must not be the default
[ "$WEBHOOK_ENCRYPTION_KEY" = "change-me-to-a-32-char-secret!!" ] && echo "  CHANGE ENCRYPTION KEY"

# JWT secret must be strong (min 32 chars)
[ ${#JWT_SECRET} -lt 32 ] && echo "  JWT_SECRET too short"

# SSRF protection must be enabled
[ "$WEBHOOK_ALLOW_PRIVATE_IPS" = "true" ] && echo "  SSRF protection disabled"
```

### 3.3 Resource Availability

```bash
# Kubernetes: check available resources
kubectl top nodes
kubectl describe nodes | grep -A5 "Allocated resources"
```

---

## 4. Installation Methods

### 4.1 Docker Compose (Small / Dev)

```bash
# Clone repository
git clone https://github.com/vadymkykalo/webhook-platform.git
cd webhook-platform

# Copy environment template
cp .env.dist .env

# Edit .env — set required secrets:
#   WEBHOOK_ENCRYPTION_KEY (32 chars)
#   WEBHOOK_ENCRYPTION_SALT (32 chars)
#   JWT_SECRET (64+ chars)
#   DB_PASSWORD
#   REDIS_PASSWORD

# Start with production overrides
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Verify
curl http://localhost:8080/actuator/health
```

**Or via Makefile:**
```bash
make up-prod           # Embedded PostgreSQL + Kafka + Redis
make up-prod-external  # External managed services (provide connection strings in .env)
```

### 4.2 Kubernetes + Helm (Medium / Large / Production)

```bash
# Add Hookflow Helm chart (or use local chart)
cd deploy/helm

# Create namespace
kubectl create namespace hookflow

# Create required secrets
kubectl -n hookflow create secret generic hookflow-secrets \
  --from-literal=encryption-key=$(openssl rand -hex 16) \
  --from-literal=jwt-secret=$(openssl rand -base64 48)

kubectl -n hookflow create secret generic hookflow-postgresql-secret \
  --from-literal=password=$DB_PASSWORD

kubectl -n hookflow create secret generic hookflow-redis-secret \
  --from-literal=password=$REDIS_PASSWORD

# Install with external services (recommended for production)
helm install hookflow ./hookflow -n hookflow \
  --set postgresql.external.host=your-postgres.example.com \
  --set postgresql.external.database=hookflow \
  --set postgresql.external.username=webhook_user \
  --set kafka.external.bootstrapServers=kafka-1:9092,kafka-2:9092,kafka-3:9092 \
  --set redis.external.host=your-redis.example.com \
  --set ui.ingress.hosts[0].host=hookflow.yourdomain.com

# Verify
kubectl -n hookflow get pods
kubectl -n hookflow logs -l app.kubernetes.io/component=api --tail=20
```

### Production Values Override

Create `values-mycompany.yaml`:

```yaml
api:
  replicaCount: 3
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 2Gi
  hpa:
    enabled: true
    minReplicas: 3
    maxReplicas: 15
  pdb:
    enabled: true
    minAvailable: 2

worker:
  replicaCount: 3
  env:
    KAFKA_DELIVERY_CONCURRENCY: "16"
    DB_POOL_MAX_SIZE: "40"
  hpa:
    enabled: true
    minReplicas: 3
    maxReplicas: 30
  pdb:
    enabled: true
    minAvailable: 2

kafka:
  topicPartitions: 24
  topicReplicationFactor: 3

backup:
  enabled: true
  schedule: "0 2 * * *"
  retainCount: 14
  storageSize: 50Gi

networkPolicy:
  enabled: true

postgresql:
  external:
    host: hookflow-db.abc123.us-east-1.rds.amazonaws.com
    port: 5432
    database: hookflow
    username: hookflow_app
```

```bash
helm install hookflow ./hookflow -n hookflow -f values-mycompany.yaml
```

---

## 5. Configuration Reference

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `WEBHOOK_ENCRYPTION_KEY` | AES-256 key for encrypting secrets (32 hex chars) | `a1b2c3d4e5f6...` |
| `WEBHOOK_ENCRYPTION_SALT` | Salt for key derivation (32 hex chars) | `f6e5d4c3b2a1...` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `super-secret-jwt-key-...` |
| `DB_HOST` | PostgreSQL host | `postgres.example.com` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `hookflow` |
| `DB_USERNAME` | Database user | `webhook_user` |
| `DB_PASSWORD` | Database password | (from secret) |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka brokers | `kafka-1:9092,kafka-2:9092` |
| `REDIS_HOST` | Redis host | `redis.example.com` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | (from secret) |

### Optional Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_ALLOW_PRIVATE_IPS` | `false` (prod) | Allow delivery to private IPs |
| `WEBHOOK_ALLOWED_HOSTS` | (empty) | Comma-separated internal hosts allowlist |
| `DB_POOL_MAX_SIZE` | `20` (API), `30` (Worker) | HikariCP max connections |
| `KAFKA_DELIVERY_CONCURRENCY` | `8` | Worker Kafka consumer threads |
| `SWAGGER_ENABLED` | `false` (prod) | Enable Swagger UI |
| `BILLING_ENABLED` | `false` | Enable billing/quotas (SaaS mode) |
| `BILLING_DEFAULT_PROVIDER` | `noop` | `stripe`, `wayforpay`, or `noop` |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARN`, `ERROR` |

---

## 6. Upgrade Strategy

### Rolling Update (zero-downtime)

Hookflow is designed for rolling updates:

1. **Database migrations run first** via init container (Flyway with built-in locking — only one pod runs migration)
2. **API pods update** with rolling strategy (new pods start before old ones terminate)
3. **Worker pods update** last (in-flight deliveries complete before pod terminates)

```bash
# Update image tags
helm upgrade hookflow ./hookflow -n hookflow \
  --set api.image.tag=v1.5.0 \
  --set worker.image.tag=v1.5.0 \
  --set ui.image.tag=v1.5.0

# Monitor rollout
kubectl -n hookflow rollout status deployment hookflow-api
kubectl -n hookflow rollout status deployment hookflow-worker
```

### Rollback

```bash
# Rollback to previous revision
helm rollback hookflow -n hookflow

# Or to specific revision
helm history hookflow -n hookflow
helm rollback hookflow 3 -n hookflow
```

### Migration Compatibility

- **Flyway migrations are forward-only** — no down migrations
- **Kafka message format is backward-compatible** — old workers can consume new messages
- **API responses are additive** — new fields don't break old clients

---

## 7. Backup & Restore

### Automated Backups (Helm)

Enable the backup CronJob in your values:

```yaml
backup:
  enabled: true
  schedule: "0 2 * * *"  # Daily at 2 AM UTC
  retainCount: 14         # Keep 2 weeks of backups
  storageSize: 50Gi
```

### Manual Backup

```bash
# PostgreSQL custom format (compressed, supports selective restore)
pg_dump -h $DB_HOST -U $DB_USERNAME -d $DB_NAME -Fc -f hookflow-$(date +%Y%m%d).dump
```

### Restore

```bash
# Stop services first
kubectl -n hookflow scale deployment hookflow-api hookflow-worker --replicas=0

# Restore
pg_restore -h $DB_HOST -U $DB_USERNAME -d $DB_NAME \
  --clean --if-exists --no-owner hookflow-20240115.dump

# Restart services
kubectl -n hookflow scale deployment hookflow-api --replicas=3
kubectl -n hookflow scale deployment hookflow-worker --replicas=3
```

### What to Backup

| Data | Method | Frequency | Critical? |
|------|--------|-----------|-----------|
| PostgreSQL | `pg_dump` or WAL archiving | Daily + continuous WAL | **Yes** |
| Encryption key + salt | Copy to offline vault | On creation/rotation | **Critical** |
| JWT secret | Copy to offline vault | On creation/rotation | **Critical** |
| Kafka topics | Recreatable from Helm job | N/A | No |
| Redis data | Not needed (ephemeral) | N/A | No |
| Helm values | Store in Git | Every change | Yes |

---

## 8. TLS & mTLS

### Ingress TLS (cert-manager + Let's Encrypt)

The Helm chart supports cert-manager out of the box:

```yaml
ui:
  ingress:
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
    tls:
      - secretName: hookflow-tls
        hosts:
          - hookflow.yourdomain.com
```

### Database SSL

```yaml
api:
  env:
    DB_SSL_MODE: require  # or verify-full for strict verification
worker:
  env:
    DB_SSL_MODE: require
```

### mTLS for Webhook Delivery

Hookflow supports per-endpoint mTLS for webhook delivery:

1. Upload client certificate via API:
   ```bash
   curl -X PUT /api/v1/projects/{projectId}/endpoints/{endpointId}/mtls \
     -F "certificate=@client.pem" \
     -F "privateKey=@client-key.pem"
   ```

2. Enable mTLS on the endpoint:
   ```bash
   curl -X PATCH /api/v1/projects/{projectId}/endpoints/{endpointId} \
     -d '{"mtlsEnabled": true}'
   ```

### Service-to-Service mTLS

For service mesh mTLS (Istio/Linkerd):
- Hookflow services work with automatic sidecar injection
- No application-level changes needed
- Ensure mesh allows egress to external webhook endpoints

---

## 9. Monitoring

### Health Checks

```bash
# API health
curl http://api:8080/actuator/health

# Worker health
curl http://worker:8081/actuator/health

# Detailed health (includes DB, Kafka, Redis status)
curl http://api:8080/actuator/health | jq .
```

### Prometheus Metrics

Both API and Worker expose Prometheus metrics:

```yaml
# Kubernetes annotations for Prometheus scraping
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"   # API
  prometheus.io/port: "8081"   # Worker
  prometheus.io/path: "/actuator/prometheus"
```

### Key Metrics to Monitor

| Metric | Component | Alert Threshold |
|--------|-----------|-----------------|
| `http_server_requests_seconds_count{status=~"5.."}` | API | > 1% of total |
| `hikaricp_connections_pending` | API/Worker | > 0 for 1 min |
| `kafka_consumer_fetch_manager_records_lag_max` | Worker | > 1000 for 5 min |
| `retry_governor_pending_count` | Worker | > 5000 for 10 min |
| `delivery_status_total{status="DLQ"}` | Worker | > 1% of total/24h |
| `circuit_breaker_state{state="OPEN"}` | Worker | Any (informational) |

### Recommended Dashboards

See [SLOs.md](./runbooks/SLOs.md) for Grafana dashboard panel recommendations.

---

## 10. Troubleshooting

### Common Issues

| Issue | Likely Cause | Quick Fix |
|-------|-------------|-----------|
| API returns 503 | DB connection pool exhausted | Increase `DB_POOL_MAX_SIZE`, check slow queries |
| Deliveries not being sent | Worker pods down or Kafka lag | Check worker pods, scale up |
| High DLQ rate | Endpoint permanently broken | Disable endpoint, check URL |
| Slow ingestion | DB write latency | Check PG `pg_stat_activity`, vacuum |
| Billing not working | `BILLING_ENABLED=false` | Set to `true` and configure provider |
| Login fails after upgrade | JWT secret changed | Expected — users must re-login |

### Logs

```bash
# API logs
kubectl -n hookflow logs -l app.kubernetes.io/component=api -f --tail=100

# Worker logs (delivery processing)
kubectl -n hookflow logs -l app.kubernetes.io/component=worker -f --tail=100

# Filter for errors only
kubectl -n hookflow logs -l app.kubernetes.io/component=api | grep -i error
```

### Detailed Runbooks

- [SLOs & Error Budgets](./runbooks/SLOs.md)
- [High Kafka Lag](./runbooks/high-kafka-lag.md)
- [Database Issues](./runbooks/database-issues.md)
- [Failed Deliveries Spike](./runbooks/failed-deliveries-spike.md)
- [Disaster Recovery](./runbooks/disaster-recovery.md)
- [Secret Rotation](./runbooks/secret-rotation.md)
