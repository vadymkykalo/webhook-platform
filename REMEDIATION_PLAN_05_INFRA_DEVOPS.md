# План ремедиации — Часть 5: INFRASTRUCTURE / DevOps / SELF-HOSTED OPS

---

## 5.1 Нет k8s/helm/terraform enterprise packaging

### 1. Корневая причина
Deployment существует только как `docker-compose.yml` + `docker-compose.prod.yml` + `Makefile`. Нет:
- Helm chart для Kubernetes
- Terraform modules для cloud infrastructure
- Operator/controller для lifecycle management
- Reference architecture для production deployment
- Automated scaling configuration

**Слой:** Infrastructure / DevOps

### 2. Целевое состояние
- Helm chart с production-ready defaults
- Reference architecture document (minimum + HA)
- Terraform module для AWS/GCP infrastructure
- Horizontal Pod Autoscaler для API и Worker
- Production presets в helm values

### 3. План реализации

#### Quick fix (1 неделя) — Helm chart MVP

**Структура `deploy/helm/hookflow/`:**
```
hookflow/
├── Chart.yaml
├── values.yaml
├── values-production.yaml
├── values-ha.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── api-deployment.yaml
│   ├── api-service.yaml
│   ├── api-hpa.yaml
│   ├── worker-deployment.yaml
│   ├── worker-hpa.yaml
│   ├── ui-deployment.yaml
│   ├── ui-service.yaml
│   ├── ui-ingress.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── serviceaccount.yaml
│   ├── networkpolicy.yaml
│   └── tests/
│       └── test-connection.yaml
```

**values.yaml (defaults):**
```yaml
global:
  imageRegistry: ""
  imagePullSecrets: []

api:
  replicaCount: 2
  image:
    repository: hookflow/api
    tag: latest
  resources:
    requests: { cpu: 250m, memory: 512Mi }
    limits: { cpu: 1000m, memory: 1Gi }
  env:
    WEBHOOK_ALLOW_PRIVATE_IPS: "false"
    SWAGGER_ENABLED: "false"
    DB_POOL_MAX_SIZE: "20"
  livenessProbe:
    httpGet: { path: /actuator/health/liveness, port: 8080 }
    initialDelaySeconds: 30
  readinessProbe:
    httpGet: { path: /actuator/health/readiness, port: 8080 }
    initialDelaySeconds: 15
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPU: 70

worker:
  replicaCount: 2
  image:
    repository: hookflow/worker
    tag: latest
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits: { cpu: 2000m, memory: 1536Mi }
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 20
    targetCPU: 60

ui:
  replicaCount: 2
  image:
    repository: hookflow/ui
    tag: latest
  resources:
    requests: { cpu: 50m, memory: 64Mi }
    limits: { cpu: 200m, memory: 128Mi }
  ingress:
    enabled: true
    className: nginx
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
    hosts:
      - host: app.hookflow.dev
        paths: [{ path: /, pathType: Prefix }]
    tls:
      - secretName: hookflow-tls
        hosts: [app.hookflow.dev]

postgresql:
  # Option 1: embedded (subchart)
  enabled: false  # recommend external managed DB
  # Option 2: external
  external:
    host: ""
    port: 5432
    database: hookflow
    existingSecret: hookflow-db-credentials

kafka:
  # Option 1: embedded (subchart — bitnami/kafka)
  enabled: false  # recommend external managed Kafka
  external:
    bootstrapServers: ""

redis:
  # Option 1: embedded (subchart — bitnami/redis)
  enabled: true
  auth:
    existingSecret: hookflow-redis-credentials
  master:
    resources:
      requests: { cpu: 100m, memory: 128Mi }

secrets:
  # Reference to existing K8s secrets
  encryptionKey:
    existingSecret: hookflow-secrets
    key: encryption-key
  jwtSecret:
    existingSecret: hookflow-secrets
    key: jwt-secret
```

**values-production.yaml (overrides):**
```yaml
api:
  replicaCount: 3
  resources:
    requests: { cpu: 500m, memory: 768Mi }
    limits: { cpu: 2000m, memory: 1536Mi }
  env:
    APP_ENV: production
    LOG_LEVEL: WARN
    EMAIL_ENABLED: "true"

worker:
  replicaCount: 3
  resources:
    requests: { cpu: 1000m, memory: 1Gi }
    limits: { cpu: 4000m, memory: 2Gi }
  env:
    APP_ENV: production
    LOG_LEVEL: WARN

# Pod Disruption Budgets
api:
  pdb:
    enabled: true
    minAvailable: 1
worker:
  pdb:
    enabled: true
    minAvailable: 1
```

**values-ha.yaml (high availability):**
```yaml
api:
  replicaCount: 5
  hpa:
    maxReplicas: 20
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule

worker:
  replicaCount: 5
  hpa:
    maxReplicas: 50

redis:
  sentinel:
    enabled: true
    replicaCount: 3
```

#### Proper fix (2-3 недели) — Terraform + full production packaging

**Terraform module `deploy/terraform/aws/`:**
```hcl
module "hookflow" {
  source = "./modules/hookflow"

  # Network
  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  # Database
  db_instance_class    = "db.r6g.large"
  db_allocated_storage = 100
  db_multi_az          = true

  # Kafka (MSK)
  kafka_broker_count    = 3
  kafka_instance_type   = "kafka.m5.large"
  kafka_ebs_volume_size = 100

  # Redis (ElastiCache)
  redis_node_type       = "cache.r6g.large"
  redis_num_cache_nodes = 2

  # EKS
  eks_node_instance_types = ["m5.xlarge"]
  eks_min_nodes          = 3
  eks_max_nodes          = 10

  # S3 (for payload archival)
  s3_bucket_name = "hookflow-payloads-${var.environment}"

  # Monitoring
  enable_cloudwatch_alarms = true
}
```

**Helm chart tests:**
```yaml
# templates/tests/test-connection.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ .Release.Name }}-test"
  annotations:
    "helm.sh/hook": test
spec:
  containers:
    - name: test
      image: curlimages/curl:latest
      command: ['curl', '-f', 'http://{{ .Release.Name }}-api:8080/actuator/health']
  restartPolicy: Never
```

### 4. Архитектура — Reference topologies

**Minimum production topology (self-hosted, medium load):**
```
┌─────────────────────────────────────────────┐
│ Kubernetes Cluster (3 nodes, m5.xlarge)     │
│                                             │
│  API (2 pods) ←── Ingress/LB ──→ UI (2)    │
│  Worker (2 pods)                            │
│  Redis (1 pod, persistent)                  │
│                                             │
│  External:                                  │
│    PostgreSQL (managed, 1 instance)         │
│    Kafka (3 brokers, KRaft)                 │
└─────────────────────────────────────────────┘
```

**HA reference architecture (enterprise, high load):**
```
┌──────────────────────────────────────────────────┐
│ Multi-AZ Kubernetes (6+ nodes across 3 AZs)     │
│                                                  │
│  API (3-10 pods, HPA) ←── ALB ──→ UI (2-4)     │
│  Worker (3-20 pods, HPA)                         │
│  Redis Sentinel (3 pods)                         │
│                                                  │
│  External (managed services):                    │
│    PostgreSQL (Multi-AZ, read replica)           │
│    Kafka/MSK (3 brokers, RF=3, ISR=2)           │
│    S3 (payload archival)                         │
│    CloudWatch/Prometheus (monitoring)            │
│                                                  │
│  Security:                                       │
│    Network Policies (namespace isolation)        │
│    mTLS (service mesh optional)                  │
│    Secrets via External Secrets Operator          │
│    Pod Security Standards (restricted)           │
└──────────────────────────────────────────────────┘
```

### 5. Риски и компромиссы
- Helm chart maintenance overhead → keep templates simple, use subchart dependencies
- Terraform module = opinionated (AWS-first) → document adaptation for GCP/Azure
- Self-hosted customers may not use K8s → keep docker-compose as supported alternative

### 6. Приоритет
Helm chart MVP: **Must do before enterprise self-hosted**
Terraform: **Must do before enterprise self-hosted** (if targeting cloud customers)
HA reference arch: **Must do before SaaS launch**

### 7. Трудозатраты: Helm MVP **M**, Terraform **L**, Full HA **L**
### 8. Порядок: Helm → Terraform → HA (last requires all other infra fixes)

---

## 5.2 Отсутствуют runbooks / SLO / operational maturity

### 1. Корневая причина
Нет задокументированных:
- SLOs (Service Level Objectives) и SLIs (indicators)
- Runbooks для типичных инцидентов
- Alerting rules для production monitoring
- Backup/restore procedures
- Upgrade strategy
- Secret rotation procedure
- Capacity planning guidance

**Слой:** Operations / DevOps

### 2. Целевое состояние
- Определённые SLOs с measured SLIs
- Runbooks для top-10 incident scenarios
- Prometheus alerting rules
- Documented backup/restore/upgrade procedures
- Secret rotation automation

### 3. План реализации

#### Quick fix (1 неделя) — Documentation

**`docs/operations/slo.md`:**
```markdown
# Service Level Objectives

## API Availability
- SLO: 99.9% uptime (measured monthly)
- SLI: successful HTTP responses / total HTTP requests (excluding 4xx)
- Measurement: Prometheus `http_server_requests_seconds_count{status!~"5.."}`

## Delivery Latency (p95)
- SLO: <30s from event ingestion to first delivery attempt
- SLI: `event.created_at` to `delivery_attempt.created_at` p95
- Measurement: Prometheus histogram `delivery_latency_seconds`

## Delivery Success Rate
- SLO: >99% of deliveries succeed within retry window
- SLI: deliveries with status=SUCCESS / total deliveries (excluding endpoint errors)
- Measurement: `delivery_success_total / delivery_total`

## Event Ingestion Throughput
- SLO: sustain 1000 events/sec per worker instance
- SLI: events processed per second
- Measurement: Kafka consumer lag + throughput metrics
```

**`docs/operations/runbooks/`:**
```
runbooks/
├── high-kafka-consumer-lag.md
├── database-connection-pool-exhaustion.md
├── delivery-dlq-spike.md
├── retry-storm.md
├── disk-space-delivery-attempts.md
├── api-high-latency.md
├── redis-connection-failure.md
├── certificate-expiry.md
├── secret-rotation.md
└── upgrade-procedure.md
```

**Пример runbook — `high-kafka-consumer-lag.md`:**
```markdown
# Runbook: High Kafka Consumer Lag

## Symptoms
- Alert: `kafka_consumer_lag > 10000 for 5m`
- Deliveries delayed
- Dashboard shows increasing pending count

## Diagnosis
1. Check consumer group status:
   `kafka-consumer-groups.sh --describe --group webhook-worker`
2. Check worker pod health: `kubectl get pods -l app=hookflow-worker`
3. Check worker logs: `kubectl logs -l app=hookflow-worker --tail=100`
4. Check DB connection pool: Grafana dashboard → DB metrics

## Resolution
1. **If consumer pods are healthy but slow:**
   - Scale up workers: `kubectl scale deployment hookflow-worker --replicas=N`
   - Increase concurrency: `KAFKA_DELIVERY_CONCURRENCY=12`
2. **If consumer pods are crash-looping:**
   - Check OOM kills: `kubectl describe pod <pod>`
   - Increase memory limits
3. **If DB is bottleneck:**
   - Check slow queries: `pg_stat_activity`
   - Increase connection pool
4. **If endpoint is slow/down (causing backlog):**
   - Circuit breaker should activate automatically
   - Manual: disable endpoint temporarily

## Prevention
- HPA with CPU target 60%
- Consumer lag alerting threshold
- Circuit breaker per endpoint (already implemented)
```

**`docs/operations/backup-restore.md`:**
```markdown
# Backup & Restore

## PostgreSQL
### Backup (daily automated)
pg_dump -Fc -h $DB_HOST -U $DB_USER $DB_NAME > hookflow_$(date +%Y%m%d).dump

### Restore
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME hookflow_YYYYMMDD.dump

### Point-in-time recovery
- Requires WAL archiving enabled (managed DB: automatic)
- RDS: automated backups with 7-day retention

## Kafka
- Topic data is transient (deliveries re-processable from DB)
- Consumer offsets backed up via Kafka internal topics
- No backup needed if DB is intact

## Redis
- Ephemeral by design (rate limits, caches, circuit breakers)
- AOF persistence enabled in compose for crash recovery
- No backup needed — state rebuilds from DB

## Verification
- Monthly restore test: restore to staging, verify data integrity
- Flyway validates schema on startup (ddl-auto: validate)
```

**`docs/operations/upgrade-procedure.md`:**
```markdown
# Upgrade Procedure

## Rolling Update (zero-downtime)
1. Pull new images: `docker compose pull` or Helm `upgrade`
2. API first (has Flyway migrations):
   - `kubectl rollout restart deployment hookflow-api`
   - Wait for readiness probes
3. Worker second (consumes from Kafka):
   - `kubectl rollout restart deployment hookflow-worker`
   - Monitor consumer lag during rollback
4. UI last (static assets):
   - `kubectl rollout restart deployment hookflow-ui`

## Database Migration
- Flyway runs automatically on API startup
- Backward-compatible migrations only (additive columns, new tables)
- Breaking migrations: deploy new API reading old + new, migrate, then deploy final

## Rollback
1. `kubectl rollout undo deployment hookflow-api`
2. If Flyway migration was applied:
   - Additive: no rollback needed (old code ignores new columns)
   - Breaking: manual SQL rollback required (document in migration file)
```

**`docs/operations/secret-rotation.md`:**
```markdown
# Secret Rotation

## JWT Secret
1. Deploy new API with both old and new secret (accept either)
2. Wait for all existing tokens to expire (max 15 min for access, 7 days for refresh)
3. Remove old secret

## Encryption Key (AES-GCM for webhook secrets)
1. Add new key as secondary in config
2. Re-encrypt all secrets with new key (migration job)
3. Remove old key
- Note: CryptoUtils must support key versioning for rotation

## API Keys
- API keys are hashed (SHA-256) — no rotation needed for stored hashes
- User regenerates key through UI → old hash invalidated

## Database Password
1. Create new DB user with new password
2. Update connection string in secrets
3. Rolling restart API + Worker
4. Drop old DB user

## TLS Certificates
- cert-manager auto-renews Let's Encrypt certs
- Self-signed: document renewal procedure
```

#### Proper fix (2-3 недели) — Prometheus alerting + Grafana dashboards

**Prometheus alerting rules (`deploy/monitoring/alerts.yaml`):**
```yaml
groups:
  - name: hookflow.rules
    rules:
      - alert: HighKafkaConsumerLag
        expr: kafka_consumer_group_lag > 10000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Kafka consumer lag is high ({{ $value }})"
          runbook_url: docs/operations/runbooks/high-kafka-consumer-lag.md

      - alert: HighDLQRate
        expr: rate(deliveries_dlq_total[5m]) > 0.1
        for: 10m
        labels:
          severity: critical

      - alert: APIHighLatency
        expr: histogram_quantile(0.95, rate(http_server_requests_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning

      - alert: DatabaseConnectionPoolExhausted
        expr: hikaricp_connections_active / hikaricp_connections_max > 0.9
        for: 2m
        labels:
          severity: critical

      - alert: RetryStorm
        expr: rate(retry_governor_effective_batch[5m]) < 5 and retry_governor_consecutive_failures > 3
        for: 10m
        labels:
          severity: warning

      - alert: DiskSpaceDeliveryAttempts
        expr: pg_database_size_bytes{datname="hookflow"} > 50e9
        for: 1h
        labels:
          severity: warning
```

**Grafana dashboard JSON (`deploy/monitoring/dashboards/hookflow-overview.json`):**
- Panels: event ingestion rate, delivery success rate, p95 latency, consumer lag, DB connections, Redis ops, retry governor state, DLQ rate, per-endpoint health

### 4. Предлагаемая архитектура

**TLS / mTLS guidance:**
```
External traffic:
  Client → TLS → Ingress/LB → HTTP → API pods
  (TLS termination at ingress, cert-manager for Let's Encrypt)

Internal traffic (optional mTLS):
  API ←→ Kafka: SASL_SSL (MSK) or mTLS (self-hosted)
  API ←→ PostgreSQL: SSL (require)
  API ←→ Redis: TLS (if Redis 6+ with TLS)
  Worker ←→ destination endpoints: TLS (WebClient validates certs)

Service Mesh (optional, for enterprise):
  Istio/Linkerd: automatic mTLS between all pods
  → adds latency (~1-2ms) but full encryption at rest
```

### 5. Риски
- Documentation becomes stale → link runbooks to code (markdown in repo)
- Prometheus rules need tuning per deployment → provide defaults with override guidance
- Too many alerts → alert fatigue → start with 5-7 critical alerts only

### 6. Приоритет
Runbooks + SLO: **Must do before enterprise self-hosted**
Prometheus rules + Grafana: **Must do before SaaS launch**

### 7. Трудозатраты: Docs **M** (1 неделя), Monitoring **M** (1-2 недели)
### 8. Порядок: Docs → Helm chart → Monitoring rules → Grafana dashboards

---

## 5.3 Production presets и hardening

### 1. Корневая причина
`docker-compose.prod.yml` содержит базовые overrides (SSRF off, SSL, no Swagger), но нет:
- Production security hardening checklist
- Non-root container images
- Read-only filesystems
- Network policies
- Resource limits tuning guide
- Health check tuning

**Слой:** Infrastructure / Security

### 2. Целевое состояние
- Container images: non-root, minimal base, no shell
- Kubernetes: NetworkPolicy, PodSecurityStandard=restricted
- Production checklist document
- Automated security scanning (Trivy/Snyk)

### 3. План реализации

**Quick fix (3-5 дней):**

1. **Dockerfile hardening (API и Worker):**
```dockerfile
FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -g 1001 hookflow && adduser -u 1001 -G hookflow -s /bin/false -D hookflow
COPY --from=build /app/target/*.jar /app/app.jar
RUN chown -R hookflow:hookflow /app
USER 1001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

2. **Kubernetes NetworkPolicy:**
```yaml
# templates/networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: hookflow-api
spec:
  podSelector:
    matchLabels:
      app: hookflow-api
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: hookflow-ui  # UI → API
      ports:
        - port: 8080
    - from:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              app: ingress-nginx  # Ingress → API
      ports:
        - port: 8080
  egress:
    - to: # PostgreSQL, Kafka, Redis
        - podSelector: {}
      ports:
        - port: 5432
        - port: 9092
        - port: 6379
    - to: # External webhook destinations
        - ipBlock:
            cidr: 0.0.0.0/0
            except: [10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16]
      ports:
        - port: 443
        - port: 80
```

3. **Production checklist (`docs/production-checklist.md`):**
```markdown
# Production Deployment Checklist

## Security
- [ ] WEBHOOK_ALLOW_PRIVATE_IPS=false
- [ ] SWAGGER_ENABLED=false
- [ ] JWT_SECRET: random 256-bit key (not default)
- [ ] WEBHOOK_ENCRYPTION_KEY: random 32-char key
- [ ] DB_SSL_MODE=require
- [ ] CORS_ALLOWED_ORIGINS: specific domain (not *)
- [ ] Container running as non-root (UID 1001)
- [ ] Network policies applied
- [ ] Secrets in K8s Secrets or external vault (not env vars in manifests)

## Database
- [ ] PostgreSQL 16+ with SSL
- [ ] Automated backups enabled (daily, 7-day retention)
- [ ] Connection pool sized: API=20, Worker=30
- [ ] Flyway migrations pass on startup

## Kafka
- [ ] 3+ brokers with RF=3, ISR=2
- [ ] Topic partitions >= worker_replicas × concurrency
- [ ] Consumer group lag monitoring

## Redis
- [ ] Password authentication enabled
- [ ] maxmemory-policy: allkeys-lru
- [ ] AOF persistence for crash recovery

## Monitoring
- [ ] /actuator/health exposed for liveness/readiness probes
- [ ] Prometheus metrics scraping configured
- [ ] Alerting rules for: consumer lag, DLQ rate, DB connections, latency
- [ ] Log aggregation (ELK/Loki/CloudWatch)

## Capacity
- [ ] API: 2+ replicas, HPA configured
- [ ] Worker: 2+ replicas, HPA configured
- [ ] DB: sized for expected event volume
- [ ] Kafka: sized for peak throughput

## Operations
- [ ] Backup restore tested
- [ ] Upgrade procedure documented and tested
- [ ] Secret rotation procedure documented
- [ ] Incident runbooks available
- [ ] On-call rotation defined
```

### 4. Риски: Hardened containers may break debugging → provide debug sidecar option
### 5. Приоритет: **Must do before enterprise self-hosted**
### 6. Трудозатраты: **M** (3-5 дней)
### 7. Порядок: Вместе с Helm chart development
