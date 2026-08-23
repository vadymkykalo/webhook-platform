# 0014 — The live set of ratchet tests is discovered by tag, not listed in a doc

**Status:** Accepted, implemented

## Context

This repository has a growing family of tests that exist to keep a convention rather than to
test behaviour: the OpenAPI drift and operation-id checks, the two mutating-handler declaration
tests, the entity-mapping parity check, the retry-ladder schema check, the tenant-parameter
check, and now two more from ADR-0012.

`CLAUDE.md` listed them by name across four packages. Nothing connected the list to the tests,
so it went stale silently: adding a ratchet meant remembering to edit a doc, and a reader had no
way to ask the codebase what the real set was.

The framing above the list was at the right altitude — *several of these are ratchets; growing an
exemption list is a reviewed decision with a stated reason, never a way to get green.* The roster
under it was not.

## Decision

Guard tests carry `@Tag("ratchet")`. `mvn test -Dgroups=ratchet` — or `make ratchets` — is the
live set, and `CLAUDE.md` points at the command instead of enumerating classes.

**What earns the tag:** a test that asserts something about the codebase *as a whole* — that a
convention holds everywhere, or that two declarations of the same fact agree. Not a test of one
class's behaviour, even when that class is itself a guard. `TenantContextTransactionGuardTest`
tests what `TenantContext.callAs` does and is therefore not tagged; `NativeQueryTenantPredicate
Test` scans every repository and is.

**Two entries stay written out in `CLAUDE.md`**, because their remediation is a command nobody
guesses: `-Dopenapi.regenerate=true` for the spec, and `make version-set` for the seven places
the version lives. The rest are discoverable once the tag exists.

## This does not reopen ADR-0008

ADR-0008 rejected `@Tag` plus surefire groups **for routing tests between the two CI jobs**, and
that stands: the split is still by class-name suffix, and `scripts/check-test-routing.sh` still
enforces that a name matches what a test needs. This tag is a second, orthogonal axis — *is this
a ratchet* — and it deliberately does not touch routing. A ratchet that needs Docker is still
named `*IntegrationTest` and still runs in the Docker job.

The two were checked for interference before anything was tagged in bulk, since surefire's
`-Dtest=` patterns and JUnit tag filtering are separate mechanisms. They compose as AND: the unit
job's exclusion list plus `-Dgroups=ratchet` yields exactly the ratchets that need no Docker, and
plain `mvn test -Dgroups=ratchet` needs no extra flags on the modules that have none.

How many there are is deliberately not written here — that is the enumeration this ADR exists to
delete. Run `make ratchets`.

## Consequences

- **CI is unchanged.** Neither job passes `-Dgroups`, so every ratchet still runs where it
  always did. The tag adds a way to *ask*, not a way to skip.
- **`make ratchets` needs Docker**, because two of them boot Testcontainers
  (`OpenApiDriftIntegrationTest`, `EntityMappingParityIntegrationTest`). The rest are reflection
  or file reads.
- **It also found a landmine on its way in.** The Makefile does `include .env` + `export`, so
  every variable in a developer's `.env` reaches any maven it runs — including
  `SWAGGER_ENABLED=false`, which application.yml feeds to `springdoc.api-docs.enabled` and
  `springdoc.swagger-ui.enabled`. `OpenApiDriftIntegrationTest` then compared the committed spec
  against springdoc's bare default and reported the whole document as drift. It is the first
  make target to run maven, which is why nothing had hit this. The test now pins all three
  properties itself, so it asserts what the application serves rather than what the shell had
  set. Any other test that reads a variable `.env` also names is exposed the same way; this is
  the only one that does today.
- **A ratchet added without the tag is invisible to the command** and nothing catches that. A
  meta-ratchet over the tag was considered and is not worth its own exemption list; the tag is
  discoverable enough that the next author copies it from the neighbouring test.
- The class-name axis is now carrying one meaning and the tag another, which is the arrangement
  ADR-0008 asked for when it warned against overloading names with a second axis.

## Alternatives rejected

- **A naming convention (`*RatchetTest`).** Collides head-on with ADR-0008: names already route
  CI jobs, and `check-test-routing.sh` would have to learn a second heuristic.
- **Keep the list in `CLAUDE.md` and remember to update it.** The failure mode being fixed.
- **A surefire profile instead of a tag.** Same information, expressed in the build file rather
  than next to the test, and invisible when reading the test.

## Related

- ADR-0008 — test class names route CI jobs; why the tag cannot be a name
- ADR-0012 — the two ratchets this was written alongside
