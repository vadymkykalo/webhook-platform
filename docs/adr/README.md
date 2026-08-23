# Architecture Decision Records

Each file records one decision that is **load-bearing**: something a future reader would
otherwise re-litigate, because the code alone shows *what* was built and not *why the
obvious alternative was rejected*.

An ADR here is not documentation of a feature. If the answer is discoverable by reading
the class and its Javadoc, it does not need an ADR.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-transactional-outbox-for-both-pipelines.md) | Both delivery pipelines publish to Kafka through a transactional outbox | Accepted |
| [0002](0002-duplicated-jpa-entities-across-api-and-worker.md) | `api` and `worker` keep separate JPA entity copies of the shared tables | Accepted, with a stated revisit trigger |
| [0003](0003-fifo-ordering-outside-kafka.md) | FIFO ordering is enforced by sequence numbers and an ordering buffer, not by Kafka partitions | Accepted |
| [0004](0004-claim-tokens-fence-delivery-ownership.md) | A delivery row is owned by a claim token, not by its status | Accepted |
| [0005](0005-distributed-scheduling-lock-strategy.md) | Three scheduling strategies: ShedLock, Redisson lock, and unlocked-because-idempotent | Accepted |
| [0006](0006-layered-authorization-and-structural-enforcement.md) | Authorization is layered; tenancy confinement moves from opt-in calls to structural enforcement | Accepted |
| [0007](0007-release-merges-never-squash.md) | `release/*` and `hotfix/*` merge into `main` with a merge commit, never a squash | Accepted |
| [0008](0008-test-class-names-route-ci-jobs.md) | CI splits backend tests purely by class-name suffix | Accepted |
| [0009](0009-openapi-spec-is-committed-and-drift-checked.md) | `openapi.yaml` is committed and semantically diffed by a test | Accepted |
| [0010](0010-secrets-encrypted-with-versioned-keys.md) | Secrets at rest use AES-256-GCM with versioned keys | Accepted |
| [0011](0011-one-attempt-runner-for-both-directions.md) | One Attempt Runner owns the attempt lifecycle for both directions | Accepted, implemented |
| [0012](0012-tenancy-invariants-are-guarded-not-documented.md) | Three ADR-0006 tenancy invariants are held by guards, not by comments | Accepted, implemented |
| [0013](0013-ui-api-types-are-checked-against-the-spec.md) | The UI's API types are checked against `openapi.yaml`, not generated in place of it | Accepted, implemented |
| [0014](0014-ratchets-are-discovered-by-tag.md) | The live set of ratchet tests is discovered by `@Tag("ratchet")`, not listed in a doc | Accepted, implemented |

## Format

Short MADR: **Context** (the forces), **Decision**, **Consequences** (including the bad
ones), **Alternatives rejected** (with the reason, so nobody proposes them again).

Statuses: `Proposed`, `Accepted`, `Superseded by NNNN`, `Deprecated`.
