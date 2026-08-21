# P1-15 — Publish Docker images (the product is uninstallable today)

- **Status:** DONE
- **Priority:** P1 — the single biggest gap between "impressive repo" and "product"
- **Branch:** `feature/P1-15-publish-docker-images`
- **Depends on:** nothing
- **Area:** `.github/workflows/`, `deploy/helm/`, `docker-compose*.yml`

## The defect

```bash
grep -rn "push: true\|ghcr.io\|docker/login-action\|docker push" .github/
```
Returns **nothing**. The `docker-build` job in `ci.yml` builds three images
tagged `:test` and throws them away.

Meanwhile `deploy/helm/hookflow/values.yaml:12,68,119` references
`hookflow/api`, `hookflow/worker`, `hookflow/ui` — images **nobody has ever
published**. So the documented production path in `docs/SELF_HOSTED_GUIDE.md`
§4.2 and `docs/OPERATIONS.md` (`helm install hookflow ./deploy/helm/hookflow`)
fails for every user with `ImagePullBackOff`.

And `docker-compose.yml` uses `build:` contexts, so even the README quick start
requires a full Maven + npm toolchain on the user's machine. The honest current
README line would be "clone and build from source for ~10 minutes."

## Steps

- [x] Add a publish job using `docker/build-push-action` with `docker/setup-qemu`
      + `setup-buildx` for **multi-arch** (`linux/amd64,linux/arm64` — Apple
      Silicon and Graviton users are a large fraction of self-hosters).
- [x] Publish to GHCR: `ghcr.io/vadymkykalo/hookflow-{api,worker,ui}`. Tag with
      semver, the git SHA, and `latest` — `docker/metadata-action` handles this.
- [x] Trigger on version tags, not every push. Keep the existing `:test` build on
      PRs so CI still catches Dockerfile breakage.
- [x] Update `deploy/helm/hookflow/values.yaml` to the published names, and set
      `appVersion` from the release (coordinate with P1-16, which owns versioning).
- [x] Add a **pull-based** compose file so the quick start needs no toolchain.
      Note that `docker-compose.prod.yml` currently only overrides images and env
      and sets no resource limits or replica counts, despite its name — decide
      whether to fix it or add a separate `docker-compose.pull.yml`, and say why.
- [x] Rewrite the README quick start around the pull path, and keep the
      build-from-source path documented separately for contributors.
- [x] Add a Helm chart publish (OCI to GHCR, or `chart-releaser` to gh-pages) so
      `helm install` works without cloning.
- [x] Generate and attach an SBOM per image (`docker/build-push-action` supports
      it) — cheap here, and it pre-empts the supply-chain question every
      enterprise evaluator asks.
- [x] Sanity-check image size and that the JRE base is current (P1-19 owns the
      base-image upgrade; do not duplicate it, just do not regress it).

## Verification

The verification **is** the test here, and it must be on a clean machine:

```bash
# on a VM or container WITHOUT maven, npm or the repo cloned:
docker pull ghcr.io/vadymkykalo/hookflow-api:<tag>
# then, with only the compose file and .env.dist:
docker compose -f docker-compose.pull.yml up -d
curl -f localhost:8080/actuator/health
curl -f localhost:5173
```

```bash
# Helm path, in kind or minikube — no local build:
kind create cluster
helm install hookflow oci://ghcr.io/vadymkykalo/charts/hookflow --version <v>
kubectl get pods    # no ImagePullBackOff
```

- [x] Add a CI smoke job that runs the pull-based compose and hits both health
      endpoints, so this cannot silently break again.

## Definition of done

- [ ] Multi-arch images published on tag, visible in GHCR. **Not verifiable in this
      sandbox** — no GHCR push credentials / no `secrets.GITHUB_TOKEN` outside a
      real Actions run, and no version tag has been pushed. The workflow that does
      this (`docker-publish.yml`) is written, YAML-validated, and its individual
      building blocks (multi-arch build, SBOM/provenance, metadata tagging,
      `helm package --version/--app-version`, `helm push` to an OCI ref) are all
      using the standard, current action versions per their docs. See Progress log
      for exactly what was and wasn't exercised.
- [ ] `helm install` works from a clean cluster with no local build. Verified
      `helm lint` / `helm template` / `helm package --version --app-version`
      locally against the real chart (after `helm dependency build` pulled the
      Bitnami subchart deps) — all pass, and the rendered manifests show the
      correct `ghcr.io/vadymkykalo/hookflow-{api,worker,ui}` image references.
      Did **not** spin up a kind/minikube cluster and `helm install` the
      OCI chart end-to-end, because that chart doesn't exist yet (nothing has
      been published to `oci://ghcr.io/vadymkykalo/charts/hookflow` — this PR is
      what makes the first publish possible, not something after it).
- [x] Compose quick start works with no Maven/npm installed. Verified for real —
      see Progress log for the full transcript. Built the three images locally
      (standing in for a `docker pull` from GHCR, which isn't reachable from here
      without publishing first) and ran `docker-compose.pull.yml` unmodified
      apart from pointing `DOCKER_REGISTRY`/`*_IMAGE_TAG` at those local tags —
      exactly what the new CI `docker-compose-smoke` job in `ci.yml` now does on
      every push. All 6 services (postgres, kafka, redis, api, worker, ui) came
      up healthy; `kafka-init` created all 11 topics; both `curl -f
      localhost:8082/actuator/health/liveness` and `curl -f localhost:5173`
      succeeded.
- [x] README quick start rewritten to match reality.

## Progress log

**New files:**
- `.github/workflows/docker-publish.yml` — triggers on `v*.*.*` tags (+
  `workflow_dispatch` for a manual re-run of an existing tag). Three jobs:
  `resolve-version` (validates/strips the `v` prefix once), `build-and-push`
  (matrix over api/worker/ui — `setup-qemu` + `setup-buildx` +
  `docker/login-action` to GHCR + `docker/metadata-action` for
  semver/latest/short-sha tags + `docker/build-push-action` with
  `platforms: linux/amd64,linux/arm64`, `sbom: true`, `provenance: true`, GHA
  layer caching), `helm-publish` (installs Helm, `helm dependency build` +
  `helm lint` + `helm package --version --app-version <resolved semver>` +
  `helm push` to `oci://ghcr.io/vadymkykalo/charts`). `ci.yml`'s existing
  `docker-build` job (`:test` tags, never pushed) is untouched, so PR/branch
  CI still catches Dockerfile breakage the same way it always has.
- `docker-compose.pull.yml` — standalone (not an overlay) compose file: every
  service resolves to a pre-built image, so it works with nothing but this
  file + `.env.dist` copied to `.env`, no repo clone. Reuses the same
  `DOCKER_REGISTRY`/`API_IMAGE_TAG`/`WORKER_IMAGE_TAG`/`UI_IMAGE_TAG` env vars
  `docker-compose.prod.yml` already used (now documented in `.env.dist`),
  defaulting to `ghcr.io/vadymkykalo/hookflow-*:latest`. Adds a one-shot
  `kafka-init` service that creates all 11 topics from `KafkaTopics.java`
  (mirroring the Makefile's `create-topics` target, since there's no `make`
  step available here) — api/worker use
  `depends_on: kafka-init: condition: service_completed_successfully`, which
  is actually *more* correct than `make up`'s own topics-after-start race.

**Decision — `docker-compose.prod.yml` vs. a separate pull file (the task
explicitly asks to decide and say why):** did both, for different problems.
(1) `docker-compose.prod.yml`'s own image-name bug (`${DOCKER_REGISTRY:-webhook-platform}-api`
— pointing at images nobody publishes) is fixed in place: the fallback is now
`ghcr.io/vadymkykalo/hookflow`, so the *existing* `docs/SELF_HOSTED_GUIDE.md`
§4.1 / `make up-prod` path resolves to real, published images with no `.env`
changes required. That file also picked up a comment clarifying that its
"despite its name, no resource limits" note is describing something that
isn't actually missing: it's an *overlay* merged onto `docker-compose.yml`,
which already sets `deploy.resources.limits` per service, and merging doesn't
drop them; "replica counts" isn't a plain-Compose concept without Swarm
(`--scale` / `make scale-worker` covers it). (2) `docker-compose.pull.yml` is
still a separate, new, standalone file, because the *actual* gap the task
opens with — "so even the README quick start requires a full Maven + npm
toolchain" / the verification block's "with only the compose file and
.env.dist" — needs a file that doesn't depend on `docker-compose.yml` being
present at all. An overlay can't do that by definition.

**Bugs found while actually testing `docker-compose.pull.yml` (not
theoretical — see the transcript below) — same fixes applied to
`docs/SELF_HOSTED_GUIDE.md`, `docs/OPERATIONS.md`, `README.md`, `Makefile`
(`up-pull`), and `ci.yml` (`docker-compose-smoke`) wherever they referenced
the same thing:**
1. My first draft of `docker-compose.pull.yml` dropped the API's
   `MANAGEMENT_PORT: 8082` / `MANAGEMENT_ADDRESS` env vars when I hand-copied
   `docker-compose.yml`'s ~100-line api environment block. Without them,
   `management.server.port` and `management.server.address` both resolve to
   Spring's YAML defaults (same port as `server.port`, address `0.0.0.0`),
   which Spring Boot refuses at startup: *"Management-specific server address
   cannot be configured as the management server is not listening on a
   separate port"* — the API crash-looped. Fixed by copying those two env
   vars over (a python diff of the two files' env-var key sets confirmed
   these were the *only* two missing across api/worker/ui).
2. Relatedly, my healthcheck for `api` pointed at port 8080; the real
   liveness endpoint is on 8082 (`docker-compose.yml`'s own healthcheck
   already does this — I'd mistranscribed it). Fixed, and also *published*
   8082 to `127.0.0.1` in `docker-compose.pull.yml` specifically (unlike
   `docker-compose.yml`, which deliberately never publishes it) — same trust
   boundary as the already-loopback-published postgres/kafka/redis ports in
   the same file, and needed so a bare `curl` from the host works for this
   file's specific "no docker exec, no make, just curl" audience.
3. The task's own verification snippet (`curl -f localhost:8080/actuator/health`)
   doesn't match this repo: actuator is intentionally split off port 8080
   (P1-20, so Prometheus can scrape without the JWT/API-key chain). Fixed the
   port in every doc/script I touched. Separately, discovered the *aggregate*
   `/actuator/health` returns `503` in this stack's default dev config even
   when everything is actually fine, because Spring Boot's autoconfigured
   mail health indicator tries to reach `localhost:1025` and fails — true
   regardless of the app's own `EMAIL_ENABLED=false` flag, since that's a
   custom app setting, not something the Mail actuator indicator knows about.
   `/actuator/health/liveness` (which is what `docker-compose.yml`'s own
   HEALTHCHECK and the Makefile's `wait-healthy`/`health` already correctly
   use) excludes it. Switched every gating health check I added
   (`docker-compose.pull.yml`'s own HEALTHCHECK, `make up-pull`, the new
   `docker-compose-smoke` CI job, README/docs quick-start snippets) to
   `/liveness`; left the one "detailed health" diagnostic line in
   `docs/SELF_HOSTED_GUIDE.md` on the plain aggregate endpoint since showing
   full component detail is the point there. This mail-indicator quirk is a
   pre-existing app behavior, not something introduced or fixed by this PR —
   flagging it here in case it's worth a follow-up ticket (make the Mail
   health indicator respect `EMAIL_ENABLED`, or drop it from the `liveness`
   group explicitly rather than relying on Spring's default grouping).

**What was verified for real, in this sandbox (has Docker + a daemon, no
GHCR/registry credentials):**
- `docker build` all three Dockerfiles unmodified (no regression risk — this
  PR never touches them): `webhook-platform-api:test` 296MB,
  `webhook-platform-worker:test` 264MB, `webhook-platform-ui:test` 51.2MB, all
  still on `eclipse-temurin:17-jre-alpine` (P1-19's territory to bump, not
  touched here, not regressed).
- `docker-compose -f docker-compose.pull.yml config` validates with only
  `.env.dist` copied to `.env` (no other env vars set).
- Ran the exact flow `docker-compose-smoke` (the new CI job) runs — built the
  three `:test` images, then:
  ```
  $ DOCKER_REGISTRY=webhook-platform API_IMAGE_TAG=test WORKER_IMAGE_TAG=test UI_IMAGE_TAG=test \
      docker compose -f docker-compose.pull.yml --env-file .env up -d
  ...
   Container webhook-kafka  Healthy
   Container webhook-redis  Healthy
   Container webhook-kafka-init  Exited          (0 — created all 11 topics, log confirmed)
   Container webhook-api  Started
   Container webhook-worker  Started
   Container webhook-ui  Started

  $ docker compose -f docker-compose.pull.yml ps
  NAME               STATUS                   PORTS
  webhook-api        Up (healthy)             0.0.0.0:8080->8080/tcp, 127.0.0.1:8082->8082/tcp
  webhook-kafka      Up (healthy)             127.0.0.1:9092-9093->9092-9093/tcp
  webhook-postgres   Up (healthy)             127.0.0.1:5432->5432/tcp
  webhook-redis      Up (healthy)             127.0.0.1:6379->6379/tcp
  webhook-ui         Up                       0.0.0.0:5173->5173/tcp
  webhook-worker     Up (healthy)             8081/tcp (internal)

  $ curl -sf http://localhost:8082/actuator/health/liveness ; echo
  {"status":"UP"}

  $ curl -sf -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:5173
  HTTP 200

  $ docker compose -f docker-compose.pull.yml down -v   # clean teardown, confirmed
  ```
  Flyway ran all 50 migrations cleanly; app boot took ~75s cold (no `.m2`/npm
  cache reused across the container build, matching a genuine clean-machine
  timing).
- `helm lint` / `helm template` (after `helm dependency build` fetched the
  Bitnami postgresql/redis/kafka subchart deps from
  `charts.bitnami.com/bitnami`, reachable from here) — 0 errors, and
  `helm template` output confirms `image: "ghcr.io/vadymkykalo/hookflow-api:latest"`
  / `-worker:latest` / `-ui:latest` render correctly.
  `helm package --version 1.2.3 --app-version 1.2.3` (the exact invocation
  `docker-publish.yml`'s `helm-publish` job uses) succeeds and produces a
  valid `.tgz`.
- Both new GitHub Actions YAML files parse cleanly with `yaml.safe_load`.

**What could NOT be verified here, and why (documented rather than faked):**
- Actual `docker push`/`helm push` to `ghcr.io/vadymkykalo/...` — this
  sandbox has no `GITHUB_TOKEN`/GHCR credentials and isn't running inside a
  real Actions job, so there's no way to exercise `docker/login-action` or
  `helm registry login` against the real registry. The building blocks
  (`docker/build-push-action` with `sbom`/`provenance`/`platforms`,
  `docker/metadata-action`, `helm push oci://...`) are all standard,
  currently-maintained actions used per their documented interface; nothing
  about them is repo-specific enough to fail if the credentials are valid in
  CI, but that's still an inference, not something I watched succeed.
- A real `kind`/`minikube` `helm install hookflow oci://ghcr.io/vadymkykalo/charts/hookflow`
  — can't, because nothing has been published to that OCI ref yet (this PR is
  what makes the first publish possible; there's no chart there to pull until
  `docker-publish.yml` runs once against a real tag push).
- Multi-arch (`linux/arm64`) build correctness beyond `docker buildx` accepting
  the Dockerfiles as-is — no QEMU userspace emulation set up in this sandbox
  to actually execute an arm64 build and boot it.

**Deliberately left out / deferred:**
- `deploy/helm/hookflow/Chart.yaml`'s own `version`/`appVersion` fields stay
  at their current `1.0.0` baseline for local `helm install` from a clone —
  the publish workflow overrides both via `--version`/`--app-version` flags
  at package time, so the two never need to agree, and I didn't want to
  preempt P1-16 (versioning) by picking a scheme for the checked-in file.
- Did not touch `CHANGELOG.md`/`UPGRADING.md` (P1-16) or
  `webhook-platform-cli/install.sh` (P1-18), per the coordinator's note.
- Did not touch the Kubernetes/Helm `ServiceMonitor`'s Prometheus scrape
  port for the API — `docs/OPERATIONS.md` already flags that as a known,
  separately-tracked gap ("scrapes the authenticated main port and 401s —
  tracked below, not yet done"), so fixing it here would be scope creep on
  someone else's tracked item.
- Kept `docker-compose.yml` and the three Dockerfiles completely untouched —
  no changes needed for this task, and P1-19 owns the base-image bump.
