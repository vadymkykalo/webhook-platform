# P1-15 — Publish Docker images (the product is uninstallable today)

- **Status:** IN PROGRESS
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

- [ ] Add a publish job using `docker/build-push-action` with `docker/setup-qemu`
      + `setup-buildx` for **multi-arch** (`linux/amd64,linux/arm64` — Apple
      Silicon and Graviton users are a large fraction of self-hosters).
- [ ] Publish to GHCR: `ghcr.io/vadymkykalo/hookflow-{api,worker,ui}`. Tag with
      semver, the git SHA, and `latest` — `docker/metadata-action` handles this.
- [ ] Trigger on version tags, not every push. Keep the existing `:test` build on
      PRs so CI still catches Dockerfile breakage.
- [ ] Update `deploy/helm/hookflow/values.yaml` to the published names, and set
      `appVersion` from the release (coordinate with P1-16, which owns versioning).
- [ ] Add a **pull-based** compose file so the quick start needs no toolchain.
      Note that `docker-compose.prod.yml` currently only overrides images and env
      and sets no resource limits or replica counts, despite its name — decide
      whether to fix it or add a separate `docker-compose.pull.yml`, and say why.
- [ ] Rewrite the README quick start around the pull path, and keep the
      build-from-source path documented separately for contributors.
- [ ] Add a Helm chart publish (OCI to GHCR, or `chart-releaser` to gh-pages) so
      `helm install` works without cloning.
- [ ] Generate and attach an SBOM per image (`docker/build-push-action` supports
      it) — cheap here, and it pre-empts the supply-chain question every
      enterprise evaluator asks.
- [ ] Sanity-check image size and that the JRE base is current (P1-19 owns the
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

- [ ] Add a CI smoke job that runs the pull-based compose and hits both health
      endpoints, so this cannot silently break again.

## Definition of done

- [ ] Multi-arch images published on tag, visible in GHCR.
- [ ] `helm install` works from a clean cluster with no local build.
- [ ] Compose quick start works with no Maven/npm installed. Paste the clean-machine output.
- [ ] README quick start rewritten to match reality.

## Progress log
