# P1-20 — Alertmanager routing and Compose backup/restore automation

- **Status:** IN PROGRESS
- **Priority:** P1
- **Branch:** `feature/P1-20-alerting-and-backups`
- **Depends on:** nothing
- **Area:** `monitoring/`, `deploy/`, `Makefile`, `docs/`

## The defect

**No Alertmanager.** `grep -ri alertmanager monitoring/ deploy/` returns nothing.
There are 14 alert rules (`deploy/prometheus/alerts.yml`, mirrored in
`prometheusrule.yaml`) that evaluate correctly and route **nowhere** — no
receiver, no `alerting:` block in `monitoring/prometheus/prometheus.yml`, no
Slack/PagerDuty/email sink. A self-hoster believes they have alerting; what they
have is a red square on a dashboard nobody is watching during the incident.

**No automated backups on the Compose path.** `Makefile` `backup-db` is a manual
`pg_dump` that hard-fails unless `DB_MODE=embedded`. The only scheduled backup is
`deploy/helm/hookflow/templates/db-backup-cronjob.yaml` — Kubernetes only. Compose
is the documented on-ramp, and it has no backup automation, no retention, no
offsite copy, no restore verification.

**No restore drill.** `restore-db` exists and `docs/runbooks/disaster-recovery.md`
is written, but nothing ever exercises restore against a fresh volume. An
untested restore path is the most common cause of an unusable backup.

## Steps

- [ ] Add Alertmanager to `monitoring/docker-compose.yml` and the `alerting:`
      block to `prometheus.yml`.
- [ ] Ship a documented default receiver config (webhook/Slack/email) with
      placeholders, plus sane grouping and inhibition rules — 14 rules firing
      ungrouped at 3am is its own failure mode.
- [ ] Verify each of the 14 rules actually routes. Fire at least one for real.
- [ ] Add a backup service/cron for the Compose path with retention, mirroring
      what the Helm CronJob already does. Do not fork the logic — extract the
      shared script.
- [ ] Make `backup-db` work for external DBs too, or fail with a message that
      says what to do instead.
- [ ] Add a **restore drill** to CI: backup → destroy → restore → assert data
      integrity. This is the item that turns backups from hope into a guarantee.
- [ ] Document the in-flight question the runbooks do not answer: what happens to
      outbox messages mid-flight during a restore, and what the operator should
      do about Kafka/Redis state after a Postgres point-in-time restore.
- [ ] Resolve the metrics-scrape auth question: `SecurityConfig.java:57` requires
      auth for `/actuator/**` beyond health/info, but Prometheus must scrape
      `/actuator/prometheus`. Either document the credential or split
      `management.server.port`. Today the operator either opens `/actuator/**`
      (leaking org-cardinality metrics) or metrics silently stop.
- [ ] Note the Compose scaling blocker while here: `docker-compose.prod.yml` binds
      `127.0.0.1:${API_PORT}:8080`, a fixed host port, which prevents
      `--scale api=N` entirely. Fix or document.

## Verification

```bash
make monitoring-up
curl -s localhost:9093/api/v2/status         # Alertmanager up
# deliberately trigger one alert (e.g. stop the worker) and confirm it reaches
# the configured receiver. Paste the received payload.
```

```bash
# full restore drill, end to end:
make up && make wait-healthy
# ingest some events
make backup-db
make nuke CONFIRM=YES
make up && make wait-healthy
make restore-db FILE=backups/<file>
# assert the events and deliveries are present
```

## Definition of done

- [ ] Alerts reach a real receiver; proven with one fired alert.
- [ ] Compose path has scheduled backups with retention.
- [ ] Restore drill runs in CI and passes.
- [ ] Metrics-scrape auth and Compose API scaling both documented or fixed.

## Progress log
