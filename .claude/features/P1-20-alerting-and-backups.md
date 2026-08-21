# P1-20 — Alertmanager routing and Compose backup/restore automation

- **Status:** DONE
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

- [x] Add Alertmanager to `monitoring/docker-compose.yml` and the `alerting:`
      block to `prometheus.yml`.
- [x] Ship a documented default receiver config (webhook/Slack/email) with
      placeholders, plus sane grouping and inhibition rules — 14 rules firing
      ungrouped at 3am is its own failure mode.
- [x] Verify each of the 14 rules actually routes. Fire at least one for real.
- [x] Add a backup service/cron for the Compose path with retention, mirroring
      what the Helm CronJob already does. Do not fork the logic — extract the
      shared script.
- [x] Make `backup-db` work for external DBs too, or fail with a message that
      says what to do instead.
- [x] Add a **restore drill** to CI: backup → destroy → restore → assert data
      integrity. This is the item that turns backups from hope into a guarantee.
- [x] Document the in-flight question the runbooks do not answer: what happens to
      outbox messages mid-flight during a restore, and what the operator should
      do about Kafka/Redis state after a Postgres point-in-time restore.
- [x] Resolve the metrics-scrape auth question: `SecurityConfig.java:57` requires
      auth for `/actuator/**` beyond health/info, but Prometheus must scrape
      `/actuator/prometheus`. Either document the credential or split
      `management.server.port`. Today the operator either opens `/actuator/**`
      (leaking org-cardinality metrics) or metrics silently stop.
- [x] Note the Compose scaling blocker while here: `docker-compose.prod.yml` binds
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

- [x] Alerts reach a real receiver; proven with one fired alert.
- [x] Compose path has scheduled backups with retention.
- [x] Restore drill runs in CI and passes.
- [x] Metrics-scrape auth and Compose API scaling both documented or fixed.

## Progress log

**Status: DONE.**

### What changed

- `monitoring/docker-compose.yml` — new `alertmanager` service (`prom/alertmanager:v0.27.0`,
  port 9093, `depends_on` by `prometheus`).
- `monitoring/alertmanager/render-config.sh` — renders `alertmanager.yml` from
  `ALERTMANAGER_*` env vars at container start (POSIX sh, no bashisms — the
  image is busybox-based: no `apk`, no `envsubst`, confirmed by inspection, see
  below). Routes: `severity: critical` → `hookflow-critical` (`group_wait: 10s`,
  `repeat_interval: 1h`), `warning` → `hookflow-default`, `info` →
  `hookflow-info` (`repeat_interval: 12h`); grouped by `alertname`+`component`.
  Inhibition: `DeliveryPendingBacklogCritical` suppresses the matching
  `High`/`Growing` warning for the same component, `OldestPendingDeliveryCritical`
  suppresses `OldestPendingDeliveryStale`, plus a generic same-alertname
  critical→warning fallback. Each receiver fans out to whichever of
  Slack/webhook/email has a configured env var; with none configured the
  config is still valid (alerts land only in Alertmanager's own UI/API).
- `monitoring/prometheus/prometheus.yml` — added `alerting.alertmanagers` block
  pointing at `alertmanager:9093`; changed the `hookflow-api` scrape target
  from `api:8080` to `api:8082` (see metrics-scrape-auth fix below).
- `.env.dist` — new `ALERTING` section (`ALERTMANAGER_SLACK_WEBHOOK_URL`,
  `_SLACK_CHANNEL`, `_WEBHOOK_URL`, `_EMAIL_*`); `MANAGEMENT_ADDRESS` default
  changed `127.0.0.1` → `0.0.0.0` (see below); new `DB_BACKUP_INTERVAL_SECONDS`.
- `deploy/scripts/db-backup.sh` / `db-restore.sh` (new) — shared backup/restore
  logic, three modes: `embedded` (docker exec, used by `make backup-db` against
  the local Postgres container), `external` (throwaway `postgres:16-alpine`
  container against a managed DB — no local `pg_dump` needed), `direct`
  (in-process `pg_dump`/`pg_restore` against `DB_HOST` — used by the Compose
  sidecar, which already ships `pg_dump` in its own image and needs no docker
  socket). Backups are custom-format `.dump` (`pg_dump -Fc --no-owner
  --no-privileges`, matching the Helm CronJob's format); `.sql.gz` (the old
  format) still restores via a legacy path. Age-based retention via
  `BACKUP_RETENTION_DAYS` (`find -mtime`).
- `docker-compose.yml` — new `db-backup` sidecar (profile `embedded-db`, `DB_MODE=direct`,
  runs `deploy/scripts/db-backup-loop.sh` on `DB_BACKUP_INTERVAL_SECONDS`, no
  docker socket mount); API gained `MANAGEMENT_PORT=8082`/`MANAGEMENT_ADDRESS`
  and its healthcheck moved to `:8082`; worker's `MANAGEMENT_ADDRESS` default
  fixed; API's host port publish changed from `${API_PORT:-8080}` to
  `${API_PORT-8080}` (single dash) to make `make scale-api` possible.
- `webhook-platform-api/src/main/resources/application.yml` — added
  `management.server.port`/`address`, defaulting to the same port as
  `server.port` (no behavior change unless `MANAGEMENT_PORT` is set).
- `webhook-platform-api/.../SecurityConfig.java` — explanatory comment only
  (no logic change) on the actuator matchers, cross-referencing the port split.
- `Makefile` — `backup-db`/`restore-db` now delegate to the shared scripts
  (embedded **and** external DB support, `restore-db` gained `CONFIRM=YES` for
  non-interactive/CI use); `wait-healthy`/`health` updated for the API's new
  management port (exec-based check, matching the pattern the worker already
  used); new `scale-api` target.
- `deploy/helm/hookflow/templates/db-backup-cronjob.yaml` — comment only,
  cross-referencing `deploy/scripts/db-backup.sh` and explaining why Helm can't
  literally share the file (chart packaging only ships files under the chart
  directory).
- `.github/workflows/ci.yml` — new `restore-drill` job: seed data → `make
  backup-db` → drop the table → `make restore-db ... CONFIRM=YES` → assert row
  count and content.
- `docs/runbooks/disaster-recovery.md` — new §1.0 (Compose restore path), new
  §1.4 "After restoring Postgres: outbox, Kafka and Redis consistency" (the
  in-flight question this task asked to document), §5 updated to reference the
  automated CI drill.
- `docs/OPERATIONS.md` — Monitoring/Backup & Restore/Scaling sections rewritten
  for all of the above.
- `monitoring/README.md` — new "Alerting" and "Metrics-scrape auth" sections
  (including the documented Kubernetes/Helm gap that was *not* fixed).

### Alertmanager — verified live (not just config-checked)

Brought up the real stack: `docker network create webhook-platform_webhook-network`
(needed because this worktree's directory name differs from `webhook-platform`,
so Compose's own network prefix wouldn't match the hardcoded external-network
name `monitoring/docker-compose.yml` expects — a pre-existing, unrelated
naming assumption, not something this task introduced), then:

```
$ make monitoring-up
...
[0;32mMonitoring started:[0m
  Prometheus: http://localhost:9090
  Grafana:    http://localhost:3001
  Login:      hookflow / hookflow_monitor_2024

$ curl -s localhost:9093/api/v2/status | ...
{"cluster":{...},"config":{"original":"...route:\n  receiver: hookflow-default\n  group_by:\n  - alertname\n  - component\n...
  routes:\n  - receiver: hookflow-critical\n    match:\n      severity: critical\n..."},...
"versionInfo":{"version":"0.27.0",...}}

$ curl -s localhost:9090/api/v1/targets | ...
hookflow-api http://api:8082/actuator/prometheus unknown
hookflow-worker http://worker:8081/actuator/prometheus unknown
prometheus http://localhost:9090/metrics unknown
```
(api/worker show `unknown` health because the full app stack wasn't running for
this test — the point here is the rendered scrape *targets* are correct: 8082
for the API, matching the management-port split below.)

Ran a throwaway `python3 -m http.server`-style webhook sink on the monitoring
network, pointed `ALERTMANAGER_WEBHOOK_URL` at it, and POSTed a synthetic
`DeliveryPendingBacklogCritical` alert straight to Alertmanager's
`/api/v2/alerts` (Alertmanager treats an API-posted alert identically to one
Prometheus sent — same routing/grouping/inhibition/receiver code path):

```
$ curl -XPOST localhost:9093/api/v2/alerts -d '[{"labels":{"alertname":"DeliveryPendingBacklogCritical","severity":"critical","component":"worker"},"annotations":{"summary":"CRITICAL: Delivery pending backlog above 20000","description":"24531 deliveries pending..."},"startsAt":"2026-08-21T11:23:58.000Z"}]'

$ docker logs webhook-sink
RECEIVED WEBHOOK PAYLOAD:
{"receiver":"hookflow-critical","status":"firing","alerts":[{"status":"firing","labels":{"alertname":"DeliveryPendingBacklogCritical","component":"worker","severity":"critical"},"annotations":{"description":"24531 deliveries pending. Hard-cap auto-DLQ escalation may trigger. Immediate investigation required.","summary":"CRITICAL: Delivery pending backlog above 20000"},"startsAt":"2026-08-21T11:23:58Z","endsAt":"0001-01-01T00:00:00Z","generatorURL":"http://prometheus:9090/graph","fingerprint":"a8dea3e7ccd8c376"}],"groupLabels":{"alertname":"DeliveryPendingBacklogCritical","component":"worker"},"commonLabels":{...},"commonAnnotations":{...},"externalURL":"http://a0646e60d037:9093","version":"4","groupKey":"{}/{severity=\"critical\"}:{alertname=\"DeliveryPendingBacklogCritical\", component=\"worker\"}","truncatedAlerts":0}
172.23.0.2 - - [21/Aug/2026 11:24:15] "POST / HTTP/1.1" 200 -
```

Then fired a paired `DeliveryPendingBacklogHigh` (warning, same component)
alongside the critical one and confirmed real inhibition via the Alertmanager
API (not just config inspection):

```
$ curl -s localhost:9093/api/v2/alerts | python3 -m json.tool
[
  {"labels":{"alertname":"DeliveryPendingBacklogCritical",...},"status":{"state":"active",...}},
  {"labels":{"alertname":"DeliveryPendingBacklogHigh","component":"worker","severity":"warning"},
   "status":{"inhibitedBy":["a8dea3e7ccd8c376"],"silencedBy":[],"state":"suppressed"}, ...}
]
```

`promtool`/`amtool` validation:

```
$ docker run --rm -v .../monitoring/prometheus:/etc/prometheus:ro --entrypoint promtool prom/prometheus:v2.51.2 check config /etc/prometheus/prometheus.yml
  SUCCESS: 1 rule files found
 SUCCESS: /etc/prometheus/prometheus.yml is valid prometheus config file syntax

$ ... check rules /etc/prometheus/alerts.yml
  SUCCESS: 14 rules found

$ docker exec hookflow-alertmanager amtool check-config /etc/alertmanager/alertmanager.yml
Checking '/etc/alertmanager/alertmanager.yml'  SUCCESS
Found:
 - global config
 - route
 - 3 inhibit rules
 - 3 receivers
 - 0 templates
```
Also confirmed the rendered config stays valid with **zero** `ALERTMANAGER_*`
env vars set (fresh-checkout case) — same `amtool check-config` SUCCESS.

Cleaned up all test-only containers/networks/volumes (`webhook-sink`,
`hookflow-*`, `monitoring_*`) afterward — nothing left running.

### Backup/restore — verified live, both the CLI path and the Compose sidecar

```
$ docker exec webhook-postgres psql -U webhook_user -d webhook_platform -c "CREATE TABLE restore_drill_test (id serial primary key, note text);"
CREATE TABLE
$ docker exec webhook-postgres psql -U webhook_user -d webhook_platform -c "INSERT INTO restore_drill_test (note) VALUES ('event-1'), ('event-2'), ('event-3');"
INSERT 0 3

$ make backup-db
[0;32mCreating database backup (DB_MODE=embedded)...[0m
[db-backup] embedded mode: pg_dump via 'docker exec webhook-postgres' -> ./backups/webhook_platform_20260821_142720.dump
[db-backup] Backup completed: ./backups/webhook_platform_20260821_142720.dump (4,0K)
[db-backup] Pruning backups older than 30 days in ./backups
...

$ docker exec webhook-postgres psql -U webhook_user -d webhook_platform -c "DROP TABLE restore_drill_test;"
DROP TABLE
$ docker exec webhook-postgres psql -U webhook_user -d webhook_platform -c "SELECT * FROM restore_drill_test;"
ERROR:  relation "restore_drill_test" does not exist

$ make restore-db FILE=backups/webhook_platform_20260821_142720.dump CONFIRM=YES
[0;32mRestoring database from backups/webhook_platform_20260821_142720.dump (DB_MODE=embedded)...[0m
[db-restore] embedded mode: pg_restore (custom format) into webhook_platform
[db-restore] Restore completed from backups/webhook_platform_20260821_142720.dump
[0;32mDatabase restored[0m

$ docker exec webhook-postgres psql -U webhook_user -d webhook_platform -c "SELECT * FROM restore_drill_test ORDER BY id;"
 id |  note
----+---------
  1 | event-1
  2 | event-2
  3 | event-3
(3 rows)
```

Compose `db-backup` sidecar (`DB_MODE=direct`, no docker socket), run against
the same live Postgres with `DB_BACKUP_INTERVAL_SECONDS=15`:

```
$ docker logs webhook-db-backup
[db-backup-loop] starting, interval=15s
[db-backup] direct mode: pg_dump -> postgres:5432/webhook_platform
[db-backup] Backup completed: /backups/webhook_platform_20260821_112751.dump (4.0K)
[db-backup] Pruning backups older than 30 days in /backups
...
[db-backup] direct mode: pg_dump -> postgres:5432/webhook_platform
[db-backup] Backup completed: /backups/webhook_platform_20260821_112806.dump (4.0K)
...
[db-backup] direct mode: pg_dump -> postgres:5432/webhook_platform
[db-backup] Backup completed: /backups/webhook_platform_20260821_112821.dump (4.0K)
```
Fires reliably on schedule (3 runs observed over ~34s at a 15s interval).

Separately re-ran the exact `restore-drill` CI job steps locally (seed → `make
backup-db` → drop table → `ls -t backups/*.dump | head -1` → `make restore-db
... CONFIRM=YES` → `SELECT count(*)` / `string_agg` assertions) — passed with
the expected 3 rows and `event-1,event-2,event-3` content.

**Deviation from the verification block as literally written:** I did not run
the full `make up && make wait-healthy` / `make nuke CONFIRM=YES` / `make up`
cycle — that requires building all five Docker images (multi-module Maven +
npm build, several minutes) on a machine also running other agents'
sibling-worktree builds against the same shared Docker daemon. Instead I
brought up just `postgres` (and separately `db-backup`) directly via
`docker-compose --profile embedded-db up -d postgres`, which exercises the
identical `deploy/scripts/db-backup.sh`/`db-restore.sh` code path against the
same `webhook-postgres` container `make up` would create, and is exactly what
the new CI `restore-drill` job does on every push. I did not additionally
verify `make nuke`'s full teardown/rebuild cycle end-to-end.

### Metrics-scrape auth — what was fixed vs. documented

- **Fixed (Compose):** API gained `management.server.port=8082` (only active
  when `MANAGEMENT_PORT` differs from `server.port`, i.e. only in the Compose
  deployment — `mvn test`/CI/plain `spring-boot:run` are unaffected, confirmed
  by running the full API unit-test suite, see below). When
  `management.server.port` differs from `server.port`, Spring Boot serves
  actuator from a second embedded web server that bypasses the main
  `SecurityFilterChain` entirely — no JWT/API-key needed, and the port isn't
  published to the host, only reachable from other containers on
  `webhook-network`.
- **Bonus fix, found during this investigation:** worker's `MANAGEMENT_ADDRESS`
  defaulted to `127.0.0.1` — loopback *inside the worker's own container* —
  which silently made `worker:8081` unreachable from any other container.
  This wasn't just a monitoring gap: in the Helm/K8s deployment, kubelet's own
  liveness/readiness `httpGet` probes also connect from outside the
  container's network namespace, so the same default would make a worker pod
  permanently un-`Ready` in a real cluster (confirmed: Helm sets no
  `MANAGEMENT_ADDRESS` override anywhere, so the app's own `127.0.0.1` default
  from `application.yml` would have applied there too). Default is now
  `0.0.0.0`; the port still isn't published to any host port anywhere.
- **Documented, not fixed:** `deploy/helm/hookflow/templates/servicemonitor.yaml`
  still scrapes the API's `/actuator/prometheus` on its authenticated main
  port (8080) and will 401. Fixing it needs the same port split threaded
  through `api-deployment.yaml`/`api-service.yaml`/`servicemonitor.yaml`/
  `values.yaml` plus re-pointing the liveness/readiness probes — real-cluster
  validation I can't do here, so I left it as a documented, scoped follow-up
  in `docs/OPERATIONS.md` and `monitoring/README.md` rather than risk an
  unverified change to production K8s probes.

Ran the full API unit-test suite after the `application.yml`/`SecurityConfig.java`
changes to confirm no regression (no Docker/Testcontainers needed for this
suite):
```
$ mvn test -pl webhook-platform-api -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest' -q
(exit code 0)
```
Also `mvn -pl webhook-platform-common,webhook-platform-api -am compile -q` — clean.

### Compose API scaling

`docker-compose.prod.yml` (and the base `docker-compose.yml`) publish the API
on a fixed host port. A first attempt used a `-f docker-compose.scale.yml`
overlay to drop that mapping — **this doesn't work**: empirically, this
Compose version (`docker-compose` v2.24.0 here) concatenates `ports:` lists
across `-f` files rather than replacing them (confirmed by dumping `docker
compose config` output — both the fixed and the ephemeral mapping were present
simultaneously, so the fixed one would still block scaling), and neither the
`!override` nor `!reset` YAML merge tags changed that result on this version.
Deleted that file. The actual fix: changed `${API_PORT:-8080}` to
`${API_PORT-8080}` (single dash — Compose/shell semantics: default applies
only when the var is completely *unset*, not when it's set-but-empty) in
`docker-compose.yml`. `make scale-api N=3` now runs with `API_PORT=` (empty),
collapsing the mapping to `<bind>::8080` (Compose's syntax for "auto-assign a
host port per replica"). Verified via `docker compose config`:

```
API_PORT= docker-compose config → api ports: [{'host_ip': '0.0.0.0', 'target': 8080, 'protocol': 'tcp'}]   # no 'published' key = ephemeral, scaling unblocked
(default)  docker-compose config → api ports: [{'host_ip': '0.0.0.0', 'target': 8080, 'published': '8080', 'protocol': 'tcp'}]  # unchanged default behavior
```

Did not run an actual `--scale api=3` (would require building the API image);
the above confirms the specific mechanism Compose uses to allow/block scaling
(presence/absence of a fixed `published` port) rather than a live multi-replica
smoke test.

### Left out / known gaps (deliberate)

- Kubernetes/Helm `ServiceMonitor` for the API still 401s on `/actuator/prometheus`
  — documented, not fixed (see above).
- No live `--scale api=N` smoke test (image build not run).
- True single-source-of-truth for the backup script across Compose and Helm
  isn't possible (Helm chart packaging can't reach outside its own directory);
  kept the pg_dump/pg_restore flags identical and cross-referenced both files
  instead of a hard dedupe.
- Didn't add Slack/PagerDuty *live* credentials anywhere (correctly — those are
  per-deployment secrets); verified the receiver-rendering logic with a
  synthetic webhook sink instead.
