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

Metrics (Prometheus):
- `/actuator/prometheus` on both API and Worker

## Backup & Restore

```bash
# Backup (embedded DB only)
make backup-db

# Restore
make restore-db FILE=backups/webhook_platform_20240101_120000.sql.gz
```

## Scaling

```bash
# Docker Compose
make scale-worker N=5

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

## Support

- Docs: https://github.com/vadymkykalo/webhook-platform
- Issues: https://github.com/vadymkykalo/webhook-platform/issues
