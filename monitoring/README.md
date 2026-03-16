# Hookflow Monitoring Stack

**Prometheus + Grafana** — fully pre-configured, decoupled from the main platform.

## Quick Start

```bash
# From project root:
make monitoring-up

# Open Grafana:
#   http://localhost:3001
#   Login: hookflow / hookflow_monitor_2024
```

## What's Included

### Prometheus
- **Scrapes:** API (`:8080/actuator/prometheus`), Worker (`:8081/actuator/prometheus`)
- **Alert rules:** retry backlog, DLQ growth, circuit breaker, oldest pending delivery, API error rate
- **Retention:** 30 days
- **Port:** 9090 (localhost only)

### Grafana Dashboards

| Dashboard | Description |
|---|---|
| **Hookflow — Overview** | Events ingested, delivery pipeline, queue depth, DLQ, table sizes, billing reconciliation, error rates |
| **Hookflow — Worker & Circuit Breaker** | Circuit breaker trips/rejects/slow-trips, retry governor, async pool threads, queue depths |
| **Hookflow — JVM & Micrometer** | Heap memory, GC pauses, threads, HTTP request rates & latency percentiles, HikariCP pool, CPU |
| **Hookflow — Kafka** | Consumer lag by topic/partition, records consumed rate, fetch latency, producer queue time |

### Auto-provisioned
- Prometheus datasource (no manual setup needed)
- All 4 dashboards loaded on first boot
- Home dashboard: Hookflow Overview

## Configuration

All config is via environment variables (defaults in `docker-compose.yml`):

| Variable | Default | Description |
|---|---|---|
| `GF_ADMIN_USER` | `hookflow` | Grafana admin username |
| `GF_ADMIN_PASSWORD` | `hookflow_monitor_2024` | Grafana admin password |
| `GRAFANA_PORT` | `3001` | Grafana external port |

To override, create a `.env` file in `monitoring/` or pass env vars:

```bash
GF_ADMIN_PASSWORD=my_secret_password make monitoring-up
```

## Commands

```bash
make monitoring-up      # Start Prometheus + Grafana
make monitoring-down    # Stop monitoring stack
make monitoring-logs    # Follow monitoring logs
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 Docker Network                    │
│            webhook-platform_webhook-network       │
│                                                   │
│  ┌─────────┐   ┌──────────┐   ┌───────────────┐ │
│  │   API    │   │  Worker   │   │  Prometheus   │ │
│  │  :8080   │◄──│  :8081   │◄──│    :9090      │ │
│  └─────────┘   └──────────┘   └───────┬───────┘ │
│                                        │         │
│                                ┌───────▼───────┐ │
│                                │   Grafana     │ │
│                                │   :3001       │ │
│                                └───────────────┘ │
└──────────────────────────────────────────────────┘
```

Monitoring connects to the platform's existing Docker network as an **external** network, so it can scrape metrics without any changes to the main `docker-compose.yml`.

## Production (Kubernetes)

For Kubernetes deployments, use the Helm chart values or deploy kube-prometheus-stack:

```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
  --set prometheus.prometheusSpec.additionalScrapeConfigs[0].job_name=hookflow-api \
  --set prometheus.prometheusSpec.additionalScrapeConfigs[0].metrics_path=/actuator/prometheus \
  --set prometheus.prometheusSpec.additionalScrapeConfigs[0].static_configs[0].targets[0]=hookflow-api:8080
```

The Grafana dashboard JSONs in `monitoring/grafana/dashboards/` can be imported directly into any Grafana instance.
