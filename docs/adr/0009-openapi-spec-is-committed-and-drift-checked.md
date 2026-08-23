# 0009 — `openapi.yaml` is committed and semantically diffed by a test

**Status:** Accepted

## Context

Three SDKs (`sdks/node`, `sdks/python`, `sdks/php`), the published API reference and
external consumers all depend on the OpenAPI description. springdoc can serve it from a
running application, but that means the contract only exists while the stack is up — it
cannot be reviewed in a diff, and a breaking change is invisible until someone regenerates.

## Decision

`openapi.yaml` is committed at the repository root. `OpenApiDriftIntegrationTest` compares
it against the spec springdoc actually serves and fails on a semantic difference.

The comparison is semantic, not textual, and `OperationIdNamingConfig` makes operation IDs
deterministic — springdoc's defaults vary with method overloading and would otherwise
produce spurious diffs on unrelated changes.

Regeneration is a deliberate act, never a hand edit:

```
mvn test -pl webhook-platform-api -Dtest=OpenApiDriftIntegrationTest -Dopenapi.regenerate=true
```

then review the diff and commit it.

## Consequences

- **An intentional API change fails CI until the spec is regenerated**, and the reason is
  not visible in the diff that broke it. This is the intended behaviour and the most
  common way the check surprises people.
- The regenerated diff is the API change review. A one-line controller edit that alters a
  response shape shows up as a contract change, which is what a reviewer needs to see.
- The check runs as a test rather than against a booted stack, so it does not need the
  full docker-compose environment.
- Hand-editing `openapi.yaml` to make the build pass produces a spec that disagrees with
  the running application in exactly the way this check exists to prevent.

## Alternatives rejected

- **Generate the spec in CI and publish it, without committing.** Removes the review
  surface — the point is that a contract change appears in a pull request.
- **Spec-first: write `openapi.yaml` by hand and generate controllers.** A larger change
  to how the API is authored, and it would not have prevented the drift this check
  addresses.
- **Diff textually.** Fails on formatting and springdoc version bumps, which trains
  everyone to regenerate without reading.

## Follow-up

[ADR-0013](0013-ui-api-types-are-checked-against-the-spec.md) extends this guarantee to the
frontend: because `openapi.yaml` is trustworthy without a running server, the UI's types can be
generated from it and checked in CI.
