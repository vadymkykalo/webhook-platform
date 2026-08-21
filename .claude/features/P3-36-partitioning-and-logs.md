# P3-36 — Table partitioning and log aggregation

- **Status:** IN PROGRESS
- **Priority:** P3 — matters at volume, not at launch
- **Branch:** `feature/P3-36-partitioning-and-logs`
- **Depends on:** nothing
- **Area:** `webhook-platform-api/src/main/resources/db/migration/`, `monitoring/`

## 36a — High-volume tables are not partitioned

48 tables, 195 indexes, 49 migrations — and `grep -rl PARTITION db/migration/`
matches only `V047__p1_outbox_kafka_key_index.sql`. The high-volume tables —
`deliveries`, `delivery_attempts`, `incoming_events`, and the tunnel request log
— grow unbounded and are pruned by `DELETE`, per the retention config in
`application.yml:94-105`.

`DELETE`-based retention on a busy table means bloat, vacuum pressure, and
retention jobs that get slower exactly as the platform gets busier.

- [ ] Convert the high-volume tables to time-based partitioning (monthly or
      weekly, depending on measured volume). Postgres declarative partitioning.
- [ ] Replace `DELETE`-based retention with `DROP PARTITION` — an O(1) operation
      instead of an O(rows) one.
- [ ] Read the `db-migration` skill before starting. **Both** `api` and `worker`
      keep their own JPA entity copies of these tables, and both run
      `ddl-auto: validate`, so a partitioning migration that Hibernate does not
      recognise will fail startup in both services.
- [ ] Plan the migration for an existing populated database. Partitioning a live
      table is not a one-statement change — document the procedure in
      `docs/runbooks/` and rehearse it against a restored backup.
- [ ] Check the 195 indexes while you are here: some are likely redundant, and
      each one costs write throughput on the hottest tables in the system.

## 36b — No log aggregation

No Loki, Promtail, Fluent Bit or Vector in `monitoring/docker-compose.yml` or
`deploy/`. `docker-compose.prod.yml:37` sets `LOG_LEVEL: WARN` and logs go to
stdout with no collector and no `logging:` driver or rotation config.

The frustrating part: `JwtAuthenticationFilter.java:67-68` populates MDC with
`organizationId` / `userId` / `projectId`, and `CorrelationIdFilter` adds a
correlation ID — excellent structured-logging groundwork that is thrown away
because nothing ships or indexes it. Post-incident forensics on a restarted
container is impossible.

- [ ] Add a log collector to the monitoring stack (Loki + Promtail is the natural
      fit next to the existing Prometheus/Grafana, and correlates with the
      dashboards you already have).
- [ ] Configure retention and rotation so a self-hoster does not fill their disk.
- [ ] Add a Grafana dashboard or saved queries that pivot on `correlationId` and
      `organizationId` — that is the payoff for the MDC work already done.
- [ ] Document the "trace one webhook end to end" procedure in a runbook: given a
      delivery ID, find every log line across api and worker.

## Verification

```bash
# partitioning:
make shell-db
# \d+ deliveries  → confirm partitioned; check a retention run drops a partition
# then confirm both services still start (ddl-auto: validate is the gate)
make up && make health
```

```bash
# logs:
make monitoring-up
# generate a delivery, then query Loki by correlationId and confirm lines from
# BOTH api and worker are returned
```

## Definition of done

- [ ] High-volume tables partitioned; retention drops partitions instead of rows.
- [ ] Migration procedure for existing databases documented and rehearsed.
- [ ] Both services start clean under `ddl-auto: validate`.
- [ ] Logs collected, searchable by correlation ID across services.

## Progress log
