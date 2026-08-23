# 0012 — Three ADR-0006 tenancy invariants are held by guards, not by comments

**Status:** Accepted, implemented

## Context

ADR-0006 made org ownership a property of data access rather than something an endpoint does,
and backed the parts it could with checks: `ServiceTenantParameterTest` for the parameter it
removed, the mutating-handler declaration tests for the annotations it introduced.

Three of its invariants got no such backing:

1. **A pool built outside `AsyncConfig` gets no `TenantPropagatingTaskDecorator`.** Spring's
   `TaskDecorator` is a bean hook, so it reaches the three executors declared there and nothing
   else. `AsyncConfig`'s own javadoc said "every executor here gets it", which was true of the
   file and false of the codebase.
2. **A native query is outside Hibernate's `@TenantId` discriminator** and must carry its own
   `organization_id`. Stated in the repository package's `package-info`, checked by nobody.
3. **A tenant scope entered inside an open transaction arrives too late.** Hibernate resolves the
   tenant when it opens the session, so the row is stamped with whatever scope was in effect when
   the transaction began.

Each was violated at least once during the tenant-scope work, and each failed silently:

- The two hand-built pools (`AuditLogAspect`'s audit writer, `WorkflowEngine`'s node-timeout pool)
  were discovered separately and patched *differently* — one wrapping every task body in
  `runAs`, the other re-implementing the decorator inline, already missing its
  `captured == null` pass-through.
- `usage_daily.organization_id` went NOT NULL in V056 while its INSERT stayed native. The
  constraint violation fired at 00:05 every night and was swallowed by the per-project `catch` in
  `aggregateYesterday`; the table simply stopped filling.
- The transaction ordering has no failure signal at all. The row is written, the request
  succeeds, and it belongs to the wrong organization.

## Decision

Each invariant gets a check, and the guards follow the shape the existing ratchets already use:
a frozen exemption list with a stated reason per entry.

| Invariant | Check | Kind |
|---|---|---|
| Hand-built pools propagate the tenant | `HandBuiltExecutorTenantPropagationTest` | source scan, empty exemption list |
| Native queries name `organization_id` | `NativeQueryTenantPredicateTest` | reflection over `@Query`, 19 documented system paths |
| Scope is entered outside the transaction | `TenantContext.callAs` throws | runtime, with `TenantContextTransactionGuardTest` |

Four decisions inside that are worth stating, because each has an obvious-looking alternative:

- **The two hand-built pools are wrapped where they are, not moved into `AsyncConfig`.**
  `TenantPropagatingTaskDecorator.wrap(ExecutorService)` decorates every task an existing pool
  runs while leaving the pool alone. Both pools exist for a reason a `ThreadPoolTaskExecutor`
  bean would flatten: the audit writer is deliberately single-threaded and daemon, the node
  pool has its own saturation counter and `AbortPolicy`.
- **The transaction guard throws; it does not warn.** A wrong `organization_id` on a row is not
  recoverable by reading logs later, and ADR-0006 has no legitimate case for entering a
  *different* tenant inside an open transaction — so there is nothing to carve out.
- **`runAsSystem` / `callAsSystem` stay unguarded.** They enter Hibernate's *root* tenant, for
  which no predicate is built and no discriminator is stamped, so entering one inside a
  transaction cannot put the wrong organization on a row. Authentication also genuinely needs to
  widen to root from inside whatever scope it is in.
- **The native-query check asserts on the SQL string, not on runtime behaviour.** `@Query` is
  `RUNTIME`-retained, so it is plain reflection and runs in the no-Docker unit job. A runtime
  check would need a container and would still only cover the queries some test happens to call.

The transaction guard was swept before it landed, not after: the full api suite — 598 unit and
213 integration tests — ran with it in place, and no existing call site violates it.

## Consequences

- **`TenantContext.callAs` can now fail a request that used to succeed.** That is the point, and
  it is why the sweep came first. The fix at a call site is always the same shape: enter the
  scope, then start the transaction inside it, as `IngressService` and `TestEndpointService` do.
- **`AuditLogAspect` states its SYSTEM sentinel** instead of leaving the field unset for
  Hibernate's `@TenantId` generator to fill in with the root value. Same value on the row; it
  took 16 lines of comment across the aspect and its test to explain the old way.
- **19 native queries are now on the record as deliberately cross-tenant.** Each entry asserts
  the method is unreachable from a request thread. Two of them (`AlertEventRepository
  .deleteOlderThan`, `OutboxMessageRepository.batchMarkDead`) have no caller at all today.
- **A gap remains and is named in the test:** a bare `@Async` with no qualifier lands on Spring
  Boot's auto-configured `applicationTaskExecutor`, which is not decorated either. There is one
  (`AlertNotificationService.dispatch`) and it is safe today because it touches no `@TenantId`
  entity. Closing it means either giving that method a decorated executor or exempting it, which
  is a decision rather than a ratchet.

## Alternatives rejected

- **Warn instead of throwing on the transaction guard.** See above: the damage is a wrong row,
  and a log line about it is read after the fact if at all.
- **Move the hand-built pools into `AsyncConfig`.** Flattens the two properties each pool exists
  for, to fix a propagation problem that wrapping fixes without touching them.
- **A runtime check for native-query confinement.** Needs a container, and only ever covers the
  queries a test exercises — the opposite of what a ratchet is for.
- **A Hibernate `PreInsertEventListener` rejecting an unstamped `@TenantId` entity under root.**
  Would turn "forgot to stamp" into one uniform error instead of 31 different constraint
  violations, but it needs `AuditLog`'s deliberate SYSTEM row exempted — and what the real
  exception set looks like is a question these three guards are the way to answer. Revisit once
  their exemption lists have settled.

## Related

- ADR-0006 — layered authorization and structural enforcement; the invariants this finishes
- ADR-0014 — how the live set of guard tests is discovered
