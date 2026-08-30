<div align="center">

# Hookflow

**Self-hosted webhook infrastructure. Outgoing delivery + incoming ingress.**

[![CI](https://github.com/vadymkykalo/webhook-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/vadymkykalo/webhook-platform/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/vadymkykalo/webhook-platform?label=release)](https://github.com/vadymkykalo/webhook-platform/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Java 17](https://img.shields.io/badge/Java-17-orange)](https://openjdk.org/projects/jdk/17/)
[![Spring Boot 3.5](https://img.shields.io/badge/Spring%20Boot-3.5-green)](https://spring.io/projects/spring-boot)
[![Docker](https://img.shields.io/badge/Docker-Required-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![GHCR](https://img.shields.io/badge/GHCR-ghcr.io%2Fvadymkykalo%2Fhookflow-blue?logo=docker&logoColor=white)](https://github.com/vadymkykalo?tab=packages&repo_name=webhook-platform)

```bash
curl -fsSL https://raw.githubusercontent.com/vadymkykalo/webhook-platform/main/install.sh | bash
```

Checks the machine, writes a Compose file pinned to the latest release and a
`.env` with freshly generated secrets, and starts the stack. No clone, no
config to write, no secrets to invent.

**Open → http://localhost** &nbsp;·&nbsp; register, and you are in the dashboard.

</div>

<div align="center">
  <img src="docs/screenshots/deliveries.png" alt="Every delivery, its attempts and the response each one got" width="100%">
  <p><em>Deliveries — every attempt on the record, with the retry ladder each one is on.</em></p>
  <p><sub><a href="docs/screenshots/">More screenshots</a> · <a href="docs/DEMO.md">a public demo is planned, not deployed</a></sub></p>
</div>

---

## Quick Start

**Prerequisites:** Docker 20.10+, Compose v2, and about 4 GB of RAM. The images
are [multi-arch](https://github.com/vadymkykalo?tab=packages&repo_name=webhook-platform)
(amd64 + arm64), so nothing is compiled on your machine.

```bash
curl -fsSL https://raw.githubusercontent.com/vadymkykalo/webhook-platform/main/install.sh | bash

# Somewhere other than ~/hookflow, or on a port other than 80:
#   ... | bash -s -- --dir /opt/hookflow --port 8080
```

The installer refuses to start until Docker, memory, disk and the port all
check out, and it verifies the configuration it wrote before starting anything.
Then open **http://localhost**, register, and create a project. Nothing is
gated behind a verification email you never receive — with no SMTP configured,
the account is active immediately.

```bash
# Send your first event, with the API key the dashboard just gave you
curl -X POST http://localhost/api/v1/projects/{projectId}/events \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "user.signup", "payload": {"userId": "usr_42"}}'
```

**One published port.** nginx serves the dashboard and proxies every API path
to the backend, so there is a single URL to hand out, a single certificate to
obtain and a single firewall rule to write. Postgres, Kafka, Redis and the API
itself are reachable only from inside the Docker network.

### On a domain, with HTTPS

Point the A record at the server, then:

```bash
curl -fsSL .../install.sh | bash -s -- --domain hooks.example.com --email ops@example.com
```

That brings up a TLS terminator which obtains and renews the certificate itself
— no cron entry, no renewal hook — moves the dashboard behind it onto loopback,
and switches the platform to production mode, where it refuses to start on
unsafe configuration rather than running with it.

### Day two

```bash
cd ~/hookflow
./hookflow status | logs | stop | start | backup | doctor
```

`doctor` re-runs the machine and configuration checks against what is on disk,
so a hand-edited `.env` gets caught before it becomes a support question. `.env`
holds your secrets — **back it up**: `WEBHOOK_ENCRYPTION_KEY` is what every
endpoint secret in the database is encrypted with, and a database backup
without it restores rows nothing can read.

To remove it: `... install.sh | bash -s -- --uninstall` keeps your data,
`--purge` deletes it.

### Running it from a clone (contributors)

Different command, same stack: this builds the three services from your
working tree instead of pulling a release.

```bash
git clone https://github.com/vadymkykalo/webhook-platform.git && cd webhook-platform
make up            # build everything and start it
make health        # is it up
make logs-api      # or logs-worker, logs-ui
make down          # stop
```

`make up` copies `.env.dist` to `.env` for you and creates the Kafka topics.
`make dev-api` / `dev-worker` / `dev-ui` rebuild and restart one service — the
fast loop once the stack is running. `make help` lists the rest.

**http://localhost:8080** — the same one-port shape as an installed deployment,
so nothing you learn here stops working when you deploy. There is one Compose
file, `docker-compose.yml`, which resolves every service to a published image;
`docker-compose.build.yml` is a 25-line overlay that builds the three services
this project owns from your working tree instead, and that is the only
difference between running from a clone and running a release.

[`CONTRIBUTING.md`](./CONTRIBUTING.md) has the prerequisites, the test commands
that match CI, and what each build guard means when it fails.

---

## What it does

**Outgoing** — your system announces an event; Hookflow gets it to every endpoint
your customers registered. Written to a transactional outbox in the same
statement as the work itself, so an event cannot be accepted and then lost.
Signed with HMAC-SHA256, ordered per endpoint, retried on a six-rung ladder
(1m → 24h), and parked in a DLQ for a human once the ladder runs out. Every
attempt is on the record with the response it got.

**Incoming** — a provider posts to a URL you own; Hookflow verifies the
signature and forwards it to the destinations you nominated. Stripe, GitHub,
GitLab, Shopify, Slack and Twilio are understood out of the box, plus generic
HMAC for anything else.

Both directions run the same claim → send → classify → finalise loop, so a fix
to attempt behaviour lands once rather than twice.

Also: a schema registry that detects breaking changes and refuses the ones that
break the compatibility mode an event type declared, wildcard subscriptions,
JSONPath transforms, replay, a CLI that tunnels webhooks to `localhost` while
you develop, per-org rate limits, AES-256-GCM at rest, SSRF protection,
Prometheus metrics and an audit log. Organizations → Projects → Endpoints, with
Owner/Developer/Viewer roles.

## Architecture

Two directions, one attempt lifecycle. **Outgoing** carries a customer's events
to endpoints their users registered; Hookflow signs what it sends. **Incoming**
carries third-party webhooks to destinations the customer nominated; Hookflow
verifies what it receives. Both go through the same claim → admit → send →
classify → finalise loop, so a fix to attempt behaviour lands once.

The write path never publishes to Kafka directly: work and its announcement are
written to a transactional outbox in the same statement, so they cannot
disagree. The worker consumes, attempts delivery, and reschedules onto one of
six delay topics that make up the retry ladder.

```
Outgoing   your app ──▶ api ──▶ outbox (same txn) ──▶ Kafka ──▶ worker ──▶ endpoint
                                                        ▲                     │
                                                        └─── retry ladder ◀───┘
                                                        1m 5m 15m 1h 6h 24h → DLQ

Incoming   provider ──▶ /ingress/{token} ──▶ verify signature ──▶ Kafka ──▶ worker ──▶ destination
```

**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** has the component diagram and
the full sequence diagrams for both directions and the CLI tunnel.
**[`CONTEXT.md`](CONTEXT.md)** is the vocabulary all of it uses.


## API Reference & SDKs

- **In-app docs** — the dashboard's [Documentation page](webhook-platform-ui/src/pages/DocumentationPage.tsx) has prose, concepts and per-language quick-start samples for every endpoint (open `/docs` — it needs no account).
- **OpenAPI spec** — [`openapi.yaml`](./openapi.yaml), committed at the repo root and generated by `springdoc-openapi` from the controllers. `OpenApiDriftIntegrationTest` fails the build if it drifts from what the API actually serves; after an intentional API change, regenerate and commit it with `mvn test -pl webhook-platform-api -Dtest=OpenApiDriftIntegrationTest -Dopenapi.regenerate=true`. Browse it rendered at [`docs/api-reference.html`](docs/api-reference.html) (Redoc) — served live at the project's GitHub Pages site once `Settings → Pages → Source = GitHub Actions` is enabled, or open it locally: `python3 -m http.server 8000` from the repo root, then visit `http://localhost:8000/docs/api-reference.html`.
- **Swagger UI** — `http://localhost:8080/swagger-ui.html` against a running instance (`SWAGGER_ENABLED=true`).

### SDKs

Official SDKs for [Node](sdks/node) (`@webhook-platform/node`),
[Python](sdks/python) (`webhook-platform`) and [PHP](sdks/php)
(`webhook-platform/php`). They cover the send-an-event / manage-endpoints /
verify-a-signature workflow — 7 of the platform's 35 REST controllers — and each
exposes a generic authenticated-request escape hatch for the rest. All three
authenticate with `X-API-Key` only, so minting that key is a one-time step in
the dashboard. Each SDK's README has the coverage table and its live-API smoke
check.

---

## Running it in production

[`docs/SELF_HOSTED_GUIDE.md`](docs/SELF_HOSTED_GUIDE.md) is the operator's
document: sizing, the port table, TLS and mTLS, backup and restore, the upgrade
path, and what to check when something is wrong. `make help` lists every
development target. [`docs/OPERATIONS.md`](docs/OPERATIONS.md) covers the
runbooks.

## CLI

Receive webhooks on `localhost` while you develop — no deploy, no ngrok.

```bash
curl -fsSL https://raw.githubusercontent.com/vadymkykalo/webhook-platform/main/webhook-platform-cli/install.sh | bash -s -- --with-java

hookflow login              # device-code flow, like `gh auth login`
hookflow listen 3000        # public URL → your machine, responses flow back
hookflow events <projectId> --follow
hookflow replay <projectId> --dry-run
```

`hookflow -h` lists the rest: tunnel management, config profiles for switching
between staging and production, and diagnostics.

## Contributing

Contributions are welcome — bug reports, docs fixes and features alike.

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to set up, which branch to target
  (`develop`, never `main`), the test commands CI actually runs, and what each
  build guard means when it fails.
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) — the Contributor Covenant.
- [`SECURITY.md`](./SECURITY.md) — report vulnerabilities privately, not as an issue.
- [`CONTEXT.md`](./CONTEXT.md) — the domain vocabulary. Every term carries a list
  of near-synonyms *not* to use; read it before naming a class, column or UI string.

## Is this really MIT? What is the billing code doing here?

Yes, really MIT — and self-hosting gets **every** feature, with no licence key,
no locked modules and no paid tier. `BILLING_ENABLED` defaults to `false`, which
is what makes that true: with billing off, quota and feature checks are
short-circuited and nothing is gated.

The `Plan`/`Subscription` entities, the Stripe and WayForPay providers and the
seeded price rows in `V036__billing_plans.sql` exist because we also run a
managed cloud instance of this same code, and that is the only thing we sell.
Selling hosting rather than features is why none of it needs to be closed —
so it lives in the open repository like everything else, dormant unless you
turn it on.

If you would rather not carry the price rows at all, they are inert data in
five table rows; nothing reads them while billing is off.

---

## License

[MIT](./LICENSE) © Vadym Kykalo — see [`NOTICE`](./NOTICE) for third-party
attributions and [`docs/licenses/`](docs/licenses/) for the generated
dependency license report and SBOM (backend: 230 Maven dependencies scanned,
0 copyleft; frontend: 654 npm packages scanned, 0 copyleft), plus the
recorded decisions on MinIO's AGPL-3.0 license and the Helm chart's Bitnami
subchart pins.
