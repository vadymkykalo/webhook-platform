# License decisions

Hookflow itself is [MIT](../../LICENSE). This records the license questions an evaluating company's legal team is
most likely to raise, plus how they were checked.

## MinIO was AGPL-3.0 — decision: removed, because nothing ever used it

`docker-compose.yml` used to carry a `minio` service behind its own Compose
profile: the only AGPL-3.0-licensed component anywhere in this repo's
dependency graph. It was kept on the argument that it was opt-in, undeployed
by default, and reserved for future object-storage work.

That future never arrived. Two years on, no application code referenced it —
no `minio`, `S3Client`, `amazonaws` or `software.amazon` import in any module,
and no object-storage dependency in any `pom.xml`. The only hit outside the
Compose file was `ProductionSafetyValidator` checking a password for a service
that nothing connected to. What it did carry was a pinned
`RELEASE.2024-01-16` image, ageing into CVE-scanner findings on a service the
product could not use, and a licensing question every evaluating legal team
had to be walked through for no benefit.

**Decision:** removed from `docker-compose.yml`, `.env.dist`, the `Makefile`,
`NOTICE` and `ProductionSafetyValidator`. Hookflow's dependency graph now
contains no AGPL/GPL/SSPL/BSL component at all, which is a simpler and more
honest answer than the one this section used to give.

When object storage is actually built, the integration should target the S3
API rather than MinIO specifically, so an operator can point it at MinIO,
[SeaweedFS](https://github.com/seaweedfs/seaweedfs) (Apache-2.0), or any
hosted bucket (AWS S3, Cloudflare R2, Backblaze B2). The AGPL obligation is
then a choice the operator makes, not one the default distribution ships.

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
