# Upgrading

## Upgrading from v1.x to v2.x

v2.0.0 is a breaking release. Read this whole section before upgrading a
running v1.x deployment — the default path (`git pull` + `docker compose up
-d` / `helm upgrade`) will start, but will silently lose access to existing
encrypted data and may become unreachable from outside `localhost`.

### 1. Existing encrypted secrets will not decrypt

Endpoint signing secrets, incoming-source secrets, and destination auth
credentials are AES-256-GCM encrypted at rest. The key derivation changed:

| | v1.x | v2.x |
|---|---|---|
| Algorithm | `SHA-256(masterKey)`, truncated to 16 bytes | `PBKDF2WithHmacSHA256`, 65,536 iterations, 256-bit output |
| Inputs | `WEBHOOK_ENCRYPTION_KEY` only | `WEBHOOK_ENCRYPTION_KEY` **and** `WEBHOOK_ENCRYPTION_SALT` |
| Effective key size | AES-128 | AES-256 |

(`webhook-platform-common/src/main/java/com/webhook/platform/common/util/CryptoUtils.java`,
`deriveKey`)

`EncryptionKeyRegistry` has no fallback to the old algorithm — it always
derives with PBKDF2. **Any secret encrypted before upgrading will fail to
decrypt after upgrading**, because the derived key is completely different,
not because of a missing salt value. There is no in-place migration for
this; you have two options:

- **Fresh deployment** (recommended if you don't have production traffic
  relying on existing secrets): stand up v2.x against a new database.
- **In-place upgrade**: after upgrading, every endpoint signing secret,
  incoming source secret, and destination auth credential must be manually
  re-entered through the dashboard/API. Deliveries using the old secrets
  will fail signature verification (outgoing) or be undeliverable
  (destinations needing auth) until re-entered. There is no bulk
  re-encryption tool.

Either way, set `WEBHOOK_ENCRYPTION_SALT` (16+ characters, unique per
deployment, see `.env.dist`) before starting v2.x — the app will derive a
wrong key silently if you reuse the v1.x `.env` without adding it.

### 2. Flyway schema history was reset, not extended

Between `v1.0.3` and `v2.0.0`, all pre-2.0 migrations (`V001`–`V025`) were
deleted and replaced with a new, consolidated set
(`V001__initial_schema.sql` … `V009__outbox_last_attempt_at.sql`). This is a
new baseline, not a continuation of the old numbering — a v1.x database
already has `V001`–`V025` recorded in `flyway_schema_history` with
checksums from the *old* files. Starting the v2.x API against that database
will fail Flyway validation (unknown/mismatched migrations).

This release is built for a **fresh database**. If you need to carry
forward existing data:

1. Take a full backup first.
2. Compare the old (`git show v1.0.3:webhook-platform-api/src/main/resources/db/migration/`)
   and new schemas by hand — table/column names changed in several places
   (e.g. `users`/`organizations`/`memberships` are now created directly in
   `V001` instead of across `V010`–`V012`).
3. Either `flyway baseline` the v2.x history against your already-migrated
   v1.x schema (only safe if you've manually verified the resulting schema
   matches `V001`–`V009` exactly) or write a one-off data migration into
   the new schema. There is no supported automated path — treat this as a
   manual, audited migration, not a `flyway migrate`.

### 3. Ports no longer bind to all interfaces by default

`docker-compose.yml` used to publish Kafka (`9092`/`9093`), Redis
(`6379`), and the API (`8080`) on `0.0.0.0`. In v2.x:

- Kafka and Redis are hardcoded to `127.0.0.1:<port>:<port>`.
- The API port now goes through a new `API_BIND` variable, **defaulting to
  `127.0.0.1`** (`.env.dist`).

If you expose the API directly (not through the `ui` service's nginx) —
for example a reverse proxy on the same host, or a deployment that skips
the bundled UI — set `API_BIND=0.0.0.0` explicitly in `.env`, or the API
becomes unreachable from outside the host after upgrading.

### 4. Redis requires a password

`docker-compose.yml`'s Redis service now runs with `--requirepass`, driven
by `REDIS_PASSWORD` (defaulted in `.env.dist`, but you should set your own
in production). If your v1.x `.env` doesn't define `REDIS_PASSWORD`, the
compose default (`webhook_redis_pass`) is used — change it before exposing
Redis beyond localhost.

### 5. `TEST_ENDPOINT_BASE_URL` default changed

`docker-compose.yml` no longer sets `container_name` on the `api`/`worker`/
`ui` services, so the old hostname `webhook-api` no longer resolves inside
the Docker network. The default `TEST_ENDPOINT_BASE_URL` changed from
`http://webhook-api:8080` to `http://api:8080` (Compose's service-name
DNS) to match. If your `.env` hardcodes the old value, update it or
generated Test Endpoint URLs will point at a host that doesn't resolve.

### Not breaking (mentioned for completeness)

- The PHP SDK's vendored dependencies (`sdks/php/vendor/`) were removed
  from version control — run `composer install` in `sdks/php` if you build
  the PHP SDK from source. Published Packagist releases are unaffected.
- Request/payload size limits, auth rate limiting, mTLS support, the
  incoming-webhooks (ingress) pipeline, DLQ management, payload
  transformation, and i18n are new, additive functionality — no action
  needed on upgrade beyond the encryption/schema/networking items above.

## Upgrading between other versions

- **v2.0.0 → v2.1.0 → v2.2.0 → v2.2.1**: purely additive Flyway migrations
  (`V010`–`V042`); a normal `flyway migrate` (i.e. just starting the new
  version against the existing v2.x database) applies them in order with
  no manual steps.
- **v2.2.0** added optional multi-key encryption for zero-downtime key
  rotation (`WEBHOOK_ENCRYPTION_KEYS`, `WEBHOOK_ENCRYPTION_KEY_ACTIVE_VERSION`).
  Leaving these unset keeps using `WEBHOOK_ENCRYPTION_KEY` as before — no
  action required unless you want to adopt key rotation.
- **v1.0.0 → v1.1.0 → v1.0.1 → v1.0.2 → v1.0.3**: no schema or config
  changes requiring action; these were CI/SDK-publishing and stability
  fixes. See [CHANGELOG.md](CHANGELOG.md) for the tag-numbering anomaly in
  this range (the `1.0.x` patch tags were cut after `1.1.0`, not before
  it).
