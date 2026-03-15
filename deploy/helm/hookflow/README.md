# Hookflow Helm Chart

Self-hosted webhook infrastructure platform for Kubernetes.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.8+
- PostgreSQL 16+ (external or subchart)
- Kafka 3.7+ (external or subchart)
- Redis 7+ (subchart enabled by default)

## Quick Start

### 1. Create secrets

```bash
# Generate random secrets
ENCRYPTION_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
DB_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# Create Kubernetes secrets
kubectl create secret generic hookflow-secrets \
  --from-literal=encryption-key="$ENCRYPTION_KEY" \
  --from-literal=jwt-secret="$JWT_SECRET"

kubectl create secret generic hookflow-postgresql-secret \
  --from-literal=password="$DB_PASSWORD"

kubectl create secret generic hookflow-redis-secret \
  --from-literal=password="$REDIS_PASSWORD"
```

### 2. Configure external services

Edit `values.yaml` to point to your external PostgreSQL and Kafka:

```yaml
postgresql:
  enabled: false
  external:
    host: "postgres.example.com"
    port: 5432
    database: hookflow
    username: webhook_user
    existingSecret: hookflow-postgresql-secret

kafka:
  enabled: false
  external:
    bootstrapServers: "kafka-1:9092,kafka-2:9092,kafka-3:9092"
```

### 3. Install chart

```bash
# Development (embedded DB and Kafka)
helm install hookflow ./hookflow

# Production (external services)
helm install hookflow ./hookflow -f values-production.yaml \
  --set postgresql.external.host=postgres.prod.local \
  --set kafka.external.bootstrapServers=kafka.prod.local:9092 \
  --set ui.ingress.hosts[0].host=app.hookflow.yourdomain.com
```

### 4. Access the UI

```bash
# Port-forward (development)
kubectl port-forward svc/hookflow-ui 8080:80

# Production (via ingress)
# Visit https://app.hookflow.yourdomain.com
```

## Configuration

See `values.yaml` for all configuration options.

### Common overrides

```yaml
# Scale API and Worker
api:
  replicaCount: 3
worker:
  replicaCount: 5

# Resource limits
api:
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 2Gi

# Custom domain
ui:
  ingress:
    hosts:
      - host: webhooks.company.com
        paths:
          - path: /
            pathType: Prefix
```

## Production Deployment

See `values-production.yaml` for production-ready defaults:

- 3+ replicas for API and Worker
- HPA enabled with conservative targets
- PodDisruptionBudgets for HA
- Network policies enabled
- Pod anti-affinity for zone distribution

```bash
helm install hookflow ./hookflow -f values-production.yaml
```

## Database Migrations

Flyway migrations run automatically via an **init container** before the API pod starts.
This ensures:
- Migrations complete before the app accepts traffic
- Only one pod runs migrations at a time (Flyway's built-in locking)
- Worker pods wait for API migration to finish before starting

## Automated Backups

Enable the PostgreSQL backup CronJob:

```yaml
backup:
  enabled: true
  schedule: "0 2 * * *"  # Daily at 2 AM UTC
  retainCount: 14          # Keep 2 weeks
  storageSize: 50Gi
```

Backups are stored as `pg_dump` custom format files on a PVC. Old backups are automatically pruned.

## Kafka Topic Configuration

```yaml
kafka:
  topicPartitions: 12        # Partitions per topic (default: 12)
  topicReplicationFactor: 3  # Set to 3 for production multi-broker clusters
```

Topics are created automatically via a post-install/post-upgrade Helm hook job.

## Upgrading

```bash
# Pull new images
helm upgrade hookflow ./hookflow

# Zero-downtime rollout
# Flyway migrations run in init container before API starts
# Worker HPA scales based on Kafka consumer lag
```

## Monitoring

API and Worker expose Actuator endpoints:

- `/actuator/health/liveness` - Liveness probe
- `/actuator/health/readiness` - Readiness probe
- `/actuator/prometheus` - Prometheus metrics (if enabled)

## Uninstall

```bash
helm uninstall hookflow

# Clean up persistent volumes (WARNING: data loss)
kubectl delete pvc -l app.kubernetes.io/instance=hookflow
```

## Further Reading

- **[Self-Hosted Guide](../../../docs/SELF_HOSTED_GUIDE.md)** — hardware sizing, pre-flight checks, TLS, monitoring
- **[Operations Guide](../../../docs/OPERATIONS.md)** — quick start, scaling, common issues
- **[Runbooks](../../../docs/runbooks/)** — SLOs, Kafka lag, DB issues, DR, secret rotation

## Support

- Documentation: https://github.com/vadymkykalo/webhook-platform/tree/main/docs
- Issues: https://github.com/vadymkykalo/webhook-platform/issues
