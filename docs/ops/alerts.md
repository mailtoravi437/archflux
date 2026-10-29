# ArchFlux — Prometheus Alerts (Phase 2)

Example alert rules for the hosted beta. **All thresholds below are starting
points to tune** against a week of representative traffic — tighten them once
baselines (per-endpoint latency, normal conflict rate, backup duration) are
measured. Pair each alert with its runbook in `docs/ops/runbooks.md`.

Custom ArchFlux meters referenced here (Micrometer, `archflux.*` namespace;
standard Spring Boot + postgres-exporter metrics cover the rest):

- `archflux.sync.runs` (counter, tags `status`, `connector`) — sync outcomes.
- `archflux.webhook.events` (counter, tags `status`: `received|duplicate|
  failed`, `provider`) — webhook ingress + dedup + terminal failures.
- `archflux.diagrams.conflicts` (counter, tag `resolution`: e.g.
  `force|merged|rejected`) — optimistic-concurrency conflicts (409s).

Scrape targets assumed: Spring Boot Actuator `/actuator/prometheus` for the
server, `postgres-exporter` for the DB, `redis_exporter` for Redis.

```yaml
groups:
  - name: archflux-api
    interval: 30s
    rules:
      # Elevated 5xx rate (tune: 1% is a starting point).
      - alert: ArchFluxHigh5xx
        expr: |
          sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
          /
          sum(rate(http_server_requests_seconds_count[5m])) > 0.01
        for: 5m
        labels: { severity: page }
        annotations:
          summary: "Elevated 5xx rate on ArchFlux API"

      # Elevated auth-401 rate (credential outage or attack; tune baseline).
      - alert: ArchFluxHighAuthFailures
        expr: |
          sum(rate(http_server_requests_seconds_count{status="401"}[5m])) > 0.5
        for: 10m
        labels: { severity: ticket }
        annotations:
          summary: "Sustained 401 rate — check JWT/AuthFilter, runbook §3"

      # Readiness down: process alive but schema/dependency not ready.
      - alert: ArchFluxNotReady
        expr: |
          probe_success{job="archflux-ready"} == 0
        for: 3m
        labels: { severity: page }
        annotations:
          summary: "/ready down — migrations or DB health, runbook §1/§2"
          # Blackbox probe: GET <base>/api/ready expecting {"ready":true}.

      # p95 latency over SLO (300 ms for ordinary DB-backed reads/writes).
      - alert: ArchFluxHighP95Latency
        expr: |
          histogram_quantile(0.95,
            sum by (le, uri) (rate(http_server_requests_seconds_bucket[5m]))
          ) > 0.3
        for: 10m
        labels: { severity: ticket }
        annotations:
          summary: "p95 latency above 300 ms SLO"

  - name: archflux-webhooks-sync
    interval: 30s
    rules:
      # Webhook failure growth (tune: >5 failed/min sustained).
      - alert: ArchFluxWebhookFailures
        expr: |
          sum(rate(archflux_webhook_events_total{status="failed"}[5m])) > 0.083
        for: 10m
        labels: { severity: ticket }
        annotations:
          summary: "Webhook terminal failures growing — replay per runbook §6"

      # Dead-letter depth (failed events awaiting replay).
      - alert: ArchFluxWebhookDeadLetter
        expr: |
          sum(archflux_webhook_events_total{status="failed"})
          - sum(archflux_webhook_events_total{status="replayed_ok"}) > 100
        for: 15m
        labels: { severity: ticket }
        annotations:
          summary: "Webhook dead-letter backlog above 100"

      # Sync errors by connector.
      - alert: ArchFluxSyncErrors
        expr: |
          sum by (connector) (rate(archflux_sync_runs_total{status="error"}[15m])) > 0.05
        for: 15m
        labels: { severity: ticket }
        annotations:
          summary: "Sync error rate elevated for a connector"

      # 409 conflict-rate spike (possible client bug or hot diagram).
      - alert: ArchFluxConflictSpike
        expr: |
          sum(rate(archflux_diagrams_conflicts_total[10m]))
          /
          sum(rate(http_server_requests_seconds_count{uri="/api/v1/diagrams/{id}"}[10m])) > 0.05
        for: 15m
        labels: { severity: ticket }
        annotations:
          summary: "409 conflict rate spiking — check autosave/retry behavior"

  - name: archflux-data
    interval: 1m
    rules:
      # Backup age: RPO ≤ 15 min means a successful backup at least every 15 min.
      # Exposes backup_last_success_unixtime via the backup cron pushgateway/job.
      - alert: ArchFluxBackupStale
        expr: |
          time() - backup_last_success_unixtime > 900
        for: 5m
        labels: { severity: page }
        annotations:
          summary: "No successful backup in 15 min (RPO breach) — runbook §1"

      # Postgres disk / quota pressure (tune percentages to the volume).
      - alert: ArchFluxPgDiskPressure
        expr: |
          pg_database_size_bytes / pg_tablespace_size_bytes > 0.8
        for: 15m
        labels: { severity: ticket }
        annotations:
          summary: "Postgres disk above 80% — retention/archival per runbook §1"

      # Connection pool exhaustion (HikariCP via Actuator).
      - alert: ArchFluxPoolExhaustion
        expr: |
          hikaricp_connections_pending > 0
        for: 5m
        labels: { severity: page }
        annotations:
          summary: "DB pool exhausted — check slow queries, pool sizing"

      # Redis down (sessions/magic-links impacted; diagrams safe).
      - alert: ArchFluxRedisDown
        expr: |
          up{job="redis"} == 0
        for: 2m
        labels: { severity: page }
        annotations:
          summary: "Redis down — sessions affected, runbook §4"
```

Notes:

- `probe_success{job="archflux-ready"}` and `backup_last_success_unixtime`
  are operator-owned signals: a blackbox exporter hitting `/api/ready` and
  the backup cron reporting success. Set both up before relying on
  `ArchFluxNotReady` / `ArchFluxBackupStale`.
- Abnormal tenant authorization denials (403 spike per workspace) ride the
  standard `http_server_requests_seconds_count{status="403"}` series —
  add a per-workspace variant once the label exists.
- Repeated connector credential failures surface as
  `archflux_sync_runs_total{status="auth_error"}` — alert per connector
  with the same shape as `ArchFluxSyncErrors`.
