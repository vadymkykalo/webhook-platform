# 0008 — CI splits backend tests purely by class-name suffix

**Status:** Accepted

## Context

The backend test suite splits into tests that need Docker (Testcontainers: Postgres, Kafka,
Redis) and tests that do not. Running everything in a Docker-enabled job wastes several
minutes per run on ~1000 pure unit tests; running everything without Docker is impossible.

Surefire has to be told which is which, before the tests run, without executing them.

## Decision

The split is by class-name suffix, nothing else. The `Backend Integration Tests` job runs
`*IntegrationTest`, `*IT`, `*RepositoryTest`, `*ConcurrencyTest`, `*RbacTest` and
`*IsolationTest`; `Backend Tests` runs everything else with those excluded.

Because nothing checks that a name matches what a test actually needs,
`scripts/check-test-routing.sh` runs before the unit job and fails the build when a class
that is *not* named for the integration job contains `@Testcontainers`, `@SpringBootTest`,
`AbstractIntegrationTest`, `GenericContainer`, `PostgreSQLContainer` or `KafkaContainer`.

## Consequences

- **The name of a test class is a build configuration decision.** Renaming
  `FooIntegrationTest` to `FooTest` moves it to a job with no Docker, where it fails —
  and the failure looks like a broken test, not a misnamed one.
- The inverse mistake is not caught and is not meant to be: a pure unit test named
  `*IntegrationTest` merely runs in the slower job.
- Both jobs pass `-DfailIfNoTests=false`, so an empty pattern match does not fail the
  build. The guard against "this run found zero tests" is the summary step, not surefire.
- A reflection-only test that inspects the classpath must stay a plain `*Test` even when
  its subject is integration-flavoured — `MutatingHandlerScopeDeclarationTest` says so in
  its own Javadoc, because naming it `*RbacTest` would route it to the Docker job for no
  reason.

## Alternatives rejected

- **JUnit 5 `@Tag` plus surefire groups.** Cleaner and self-describing, and the honest
  reason it was not chosen is that the suffix convention predates the split. Migrating is
  a mechanical change to ~109 classes; worth doing if the routing script ever has to grow
  a second heuristic.
- **Run everything with Docker.** Costs the whole unit suite's runtime on every push and
  makes the fast feedback loop depend on container startup.
- **Detect Docker need at runtime and skip.** Turns a misrouted test into a silent skip,
  which is worse than a loud failure.

## Follow-up

[ADR-0014](0014-ratchets-are-discovered-by-tag.md) introduces `@Tag("ratchet")` as a *second,
orthogonal* axis — "is this test a ratchet" — and deliberately not for routing. The rejection
above stands: the unit/integration split is still by class-name suffix.
