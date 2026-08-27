# License decisions

Hookflow itself is [MIT](../../LICENSE). This records the two license
questions an evaluating company's legal team is most likely to raise,
plus how they were checked.

## MinIO is AGPL-3.0 — decision: keep it, but it is opt-in and undeployed by default

`docker-compose.yml`'s `minio` service is the only AGPL-3.0-licensed component
anywhere in this repo's dependency graph (confirmed below — nothing in the
Maven or npm dependency trees is AGPL/GPL/SSPL/BSL). Three things keep it from
being a problem for the MIT-branded default distribution:

1. **It is not started by default.** `minio` sits behind its own Compose
   profile (`profiles: [minio]` in `docker-compose.yml`), which neither
   `make up` (`--profile embedded-db`) nor `install.sh` activates. A fresh
   install never pulls the MinIO image.
2. **Nothing in the application calls it yet.** `.env.dist` labels it
   `# MINIO (OPTIONAL - for future file storage)`
   (`.env.dist:616`) — grepping `webhook-platform-api/src` and
   `webhook-platform-worker/src` for MinIO/S3 client usage finds nothing;
   `ProductionSafetyValidator`'s one hit is unrelated config validation, not an
   S3 client. There is no code path today where running Hookflow requires
   accepting MinIO's terms.
3. **Running an unmodified AGPL service as a separate container, talked to
   only over its network API, does not put Hookflow's own MIT code under
   AGPL.** AGPL-3.0's network-copyleft clause (§13) is triggered by modifying
   and distributing/running a *modified* copy of the covered work and offering
   it to users over a network; it does not reach out and relicense an
   unrelated program that merely happens to call it over HTTP. This is the
   same reasoning under which most self-hosted stacks that offer a MinIO
   profile operate.

**Decision:** keep MinIO as an explicit opt-in profile for future
object-storage work (large payload bodies, replay archives), not part of the
default install. When that feature actually ships, document the AGPL
obligation explicitly at that point (anyone who enables the `minio` profile
and *modifies* MinIO's own source would need to comply with AGPL for their
modified copy — vanilla/unmodified use does not), and offer a non-copyleft
alternative for operators who'd rather not carry AGPL infrastructure at all,
e.g. [SeaweedFS](https://github.com/seaweedfs/seaweedfs) (Apache-2.0) or any
external S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2) via the
same S3 API — nothing in the (not-yet-written) integration should be
MinIO-specific.

## Bitnami subchart pins (Helm chart)

`deploy/helm/hookflow/Chart.yaml` declares three optional subchart
dependencies from `https://charts.bitnami.com/bitnami`:

```yaml
- name: postgresql
  version: "12.x.x"
  condition: postgresql.enabled
- name: redis
  version: "18.x.x"
  condition: redis.enabled
- name: kafka
  version: "26.x.x"
  condition: kafka.enabled
```

All three are themselves Apache-2.0 (the Bitnami *chart* wraps upstream
PostgreSQL/Redis/Kafka, all permissively licensed). The relevant risk here
isn't license, it's *availability*: Bitnami's free container registry
retention/tagging policy has changed unfavorably before, and the exact image
tags these subchart versions resolve to are outside this repo's control —
that's tracked separately as an infrastructure/supply-chain concern, not a
license one. This document only records that the pins exist and are
Apache-2.0, so there is no license exception to write up for them — only an
availability one to watch.

## How this was verified (not just asserted)

```bash
# Backend: 230 direct+transitive Maven dependencies scanned
mvn org.codehaus.mojo:license-maven-plugin:2.4.0:aggregate-add-third-party -DskipTests
# -> target/generated-sources/license/THIRD-PARTY.txt (copied here as backend-THIRD-PARTY.txt)
grep -iE "gpl|agpl|affero|sspl|commons clause|bsl|business source" backend-THIRD-PARTY.txt
# -> only "GPL2 w/ CPE" hits (Jakarta EE's standard Classpath-Exception dual license,
#    not copyleft in practice) and one Apache-2.0/LGPL dual-licensed dependency
#    (JNA) where the permissive option applies. No AGPL/SSPL/BSL anywhere.

# Backend SBOM (CycloneDX 1.5, 191 components)
mvn org.cyclonedx:cyclonedx-maven-plugin:2.8.0:makeAggregateBom -DskipTests -DoutputFormat=json -DoutputName=sbom
# -> target/sbom.json (copied here as backend-sbom.json)

# Frontend: 654 npm packages scanned
cd webhook-platform-ui && npm ci
npx license-checker --summary
# -> 563 MIT, 49 ISC, 14 Apache-2.0, 10 BSD-2-Clause, 9 BSD-3-Clause, 2 MPL-2.0,
#    1 MIT-0, 1 Python-2.0, 1 CC-BY-4.0, 1 0BSD, 1 (MIT OR CC0-1.0), 1 MIT AND ISC
#    — no copyleft.
npx license-checker --json --excludePrivatePackages > frontend-licenses.json

# Frontend SBOM (CycloneDX 1.6, 619 components)
npx @cyclonedx/cyclonedx-npm --output-format json --output-file frontend-sbom.json
```

These are real, one-time-generated reports as of 2026-08-22 (commit at the
time this task landed) — see `README.md` in this directory for how to keep
them current.
