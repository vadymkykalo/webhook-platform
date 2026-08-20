# P1-19 — Upgrade Spring Boot 3.2.0 (EOL) and stale base images

- **Status:** TODO
- **Priority:** P1
- **Branch:** `feature/P1-19-framework-upgrade`
- **Depends on:** P1-21 and P1-22 ideally land first — upgrading a delivery engine
  with no tests is how you find out about regressions in production
- **Area:** repo-wide

## The defect

`pom.xml:27` — `<spring-boot.version>3.2.0</spring-boot.version>`. Released
November 2023; OSS support ended in 2024. For a 2026 launch that means **no
security patches** on the framework carrying every request.

Also stale:
- `node:18-alpine` in the UI build stage — Node 18 went EOL April 2025
- `nginx:1.25-alpine`
- Vite 5
- Bitnami subchart pins in `deploy/helm/hookflow/values.yaml` (`12.x`/`18.x`/`26.x`)
  — Bitnami images moved to a restricted catalog in 2025, so these defaults will
  break for new users

## Steps

- [ ] Upgrade Spring Boot to the current 3.5.x line. Read the release notes for
      **every** minor between 3.2 and target — this is not a version-bump task,
      it is a migration. Pay attention to Spring Security config changes,
      Jackson, and Hibernate 6.x behaviour.
- [ ] Re-check the pinned third-party versions that are managed independently of
      the BOM: Redisson `3.24.3`, ShedLock `5.10.0`, jjwt `0.12.3`, bucket4j
      `8.10.1`, springdoc `2.3.0`, Testcontainers `1.21.4`, stripe-java `28.2.0`.
      Several will need bumping to stay compatible.
- [ ] Bump base images: JRE, `node:20-alpine` or newer, current nginx alpine.
- [ ] Consider Java 21 (LTS). Optional and separable — if you do it, do it as its
      own commit so a revert is clean. **Note the virtual-threads trap:**
      `JwtUtil.java:26-27,91-93` caches parsed claims in a static `ThreadLocal`
      cleared in `JwtAuthenticationFilter`'s `finally`. That is correct for the
      current servlet model but will leak identity across requests if anyone
      enables virtual threads without revisiting it. Document the invariant, and
      add a test that asserts the ThreadLocal is empty after a request.
- [ ] Resolve the Bitnami subchart situation — repin, switch charts, or document
      that users must supply their own datastores. Say which and why.
- [ ] Run the full suite plus a real end-to-end `make up` smoke after each major
      step, not once at the end.

## Verification

```bash
mvn clean verify
mvn test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'
mvn test -Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest' -DfailIfNoTests=false
cd webhook-platform-ui && npm run lint && npm run typecheck && npm run build && npm run test:ci
```

```bash
make up && make wait-healthy && make health
# send an event end to end; confirm delivery, signature, and dashboard all work
```

- [ ] Re-run the Trivy scan from P1-17 and record the before/after CVE count —
      that number is the justification for this task.

## Definition of done

- [ ] Spring Boot on a supported release line.
- [ ] Base images current; Bitnami question resolved.
- [ ] Full suite green, end-to-end smoke passes.
- [ ] Before/after CVE counts in the log.
- [ ] If virtual threads were enabled, the `ThreadLocal` invariant is tested.

## Progress log
