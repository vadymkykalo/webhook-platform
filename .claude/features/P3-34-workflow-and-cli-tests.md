# P3-34 — Workflow engine and CLI command tests

- **Status:** DONE — with scope caveats, see Progress log
- **Priority:** P3 — post-launch, but say so publicly rather than implying coverage
- **Branch:** `feature/P3-34-workflow-and-cli-tests`
- **Depends on:** P1-28 (so the improvement is measurable)
- **Modules:** `webhook-platform-api`, `webhook-platform-cli`

## The gap

**Workflow engine — entirely untested.** No test references any of:
`WorkflowEngine`, `WorkflowService`, `WorkflowExecutionPersistence`,
`WorkflowTriggerService`, `WorkflowTriggerOutboxService`,
`WorkflowExecutionRecoveryJob`, or any of the 9 node executors
(`HttpNodeExecutor`, `BranchNodeExecutor`, `DelayNodeExecutor`,
`TransformNodeExecutor`, `SlackNodeExecutor`, `DeliveryNodeExecutor`,
`FilterNodeExecutor`, `CreateEventNodeExecutor`, `WebhookTriggerExecutor`).

This is a user-facing feature with a visual builder in the dashboard, executing
arbitrary user-defined graphs — including HTTP calls — with zero test coverage.

**CLI — 7 commands, zero real tests.** `Login`, `Listen`, `Replay`, `EventsTail`,
`Tunnels`, `Status`, `Config` are all untested. `HookflowCliTest` only asserts
help text:
```java
cmd.execute("--help");
assertTrue(output.contains("login"));
```

**Other untested API services** worth picking up here: `DeliveryService`,
`EventService`, `EndpointService`, `ProjectService`, `OrganizationService`,
`MembershipService`, `ApiKeyService`, `ReplayService`, `DlqService`,
`AnalyticsService`, `DashboardService`, `UsageService`, `RuleService` (only the
leaf `ConditionTreeEvaluator` is tested), `TransformationService`,
`PiiMaskingService`, `AlertService`, `IncidentService`, `AuthService`.

## Steps

- [x] Start with the workflow **node executors** — they are the most isolated and
      the highest risk per line. One focused test class per executor.
- [x] Then `WorkflowEngine` itself: branching, filtering, delays, depth limiting
      (`WorkflowTriggerService.getCurrentDepth()` guards recursion — test that the
      guard actually holds), and failure propagation mid-graph.
- [x] `WorkflowExecutionRecoveryJob`: an interrupted execution resumes correctly
      and does not re-run completed nodes.
- [x] CLI: test the commands' argument parsing and their behaviour against a
      stubbed backend. `LocalForwarderTest` and `CliConfigServiceTest` already
      exist — follow their setup rather than inventing one.
- [x] A tunnel round-trip test would be the most valuable CLI test: connect,
      forward a request to a local port, return the response. `TunnelFlowIntegrationTest`
      exists on the server side — check whether it can be extended rather than duplicated.
- [x] Then the API service layer, prioritising `DeliveryService`, `ReplayService`
      and `DlqService` — they mutate delivery state, so bugs there are
      user-visible in the same way the P0 defects were.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest='Workflow*Test,*NodeExecutorTest'
mvn test -pl webhook-platform-cli
mvn test
```

- [x] Cite before/after coverage for the workflow package and the CLI module,
      using P1-28's tooling.

## Definition of done

- [x] All 9 node executors plus the engine have tests.
- [x] CLI commands tested beyond help text; tunnel round-trip covered.
- [x] The three delivery-state services tested.
- [x] Coverage numbers cited, not adjectives.

## Progress log

**Branch:** `feature/P3-34-workflow-and-cli-tests`, cut from `develop` at `6b3e28a`.

### What was added, in the priority order the task specified

1. **9 node executor test classes** (`webhook-platform-api/src/test/java/.../service/workflow/executors/`):
   `BranchNodeExecutorTest`, `FilterNodeExecutorTest`, `WebhookTriggerExecutorTest`,
   `DelayNodeExecutorTest`, `TransformNodeExecutorTest`, `DeliveryNodeExecutorTest`,
   `CreateEventNodeExecutorTest`, `HttpNodeExecutorTest`, `SlackNodeExecutorTest`.
   `HttpNodeExecutorTest` and the round-trip half of `LocalForwarderTest` (CLI, see
   below) use a plain JDK `com.sun.net.httpserver.HttpServer` bound to loopback —
   no new test dependency needed — to exercise a real HTTP request/response instead
   of only mocking. Discovered along the way: `HttpNodeExecutor`'s own
   `statusCode >= 200 && < 300` branch is unreachable for real — WebClient's
   `.retrieve()` already throws `WebClientResponseException` on any non-2xx status
   before that check runs, so failures always surface via the generic catch block
   ("HTTP error: ..."), not the "HTTP `<code>`: ..." message the code appears to
   build for that case. Not fixed (out of scope for a test-only task) but the test
   asserts the *actual* message so it won't silently start asserting on dead code.

2. **`WorkflowEngineTest`** (14 cases): empty/malformed definitions, linear
   piping, branch routing (both handles), filter-driven skips, node failure
   stopping the graph mid-execution, unknown-node-type handling (discovered: an
   unregistered node type is marked FAILED at the step level but does **not**
   fail the overall execution — only a registered executor's own FAILED result
   does that), per-node timeout enforcement, whole-execution timeout, and —
   directly answering the task's callout — depth ThreadLocal propagation from the
   calling thread into the node-executor pool thread (`WorkflowTriggerService.
   setCurrentDepth`/`getCurrentDepth`), since that's the exact plumbing
   `CreateEventNodeExecutor`'s recursion guard depends on.

3. **`WorkflowTriggerServiceTest`** (16 cases): this is where the actual `depth >
   maxRecursionDepth` guard lives, so it gets its own file — depth-over-max is
   blocked before touching any repository, depth-at-max is let through (guard is
   strict `>`, not `>=`), depth propagates into `WorkflowEngine.execute()` via the
   ThreadLocal and is cleared afterward, idempotency (existing execution row / a
   racing `DataIntegrityViolationException`) short-circuits without invoking the
   engine, trigger-pattern matching (wildcard, no-pattern-matches-all, malformed
   trigger config), and one workflow throwing doesn't stop sibling workflows from
   still being triggered.

4. **`WorkflowExecutionRecoveryJob`**: a plain Mockito unit test
   (`WorkflowExecutionRecoveryJobTest` — cutoff computed from the configured
   threshold, repository exceptions swallowed not propagated) plus a Postgres
   integration test (`WorkflowExecutionRecoveryJobIntegrationTest`) that seeds
   RUNNING/COMPLETED/FAILED/CANCELLED rows at various ages and proves the bulk
   UPDATE only ever touches a stuck (old, RUNNING) row — never a fresh RUNNING
   row, never any already-terminal row regardless of age. Reframed from the
   task's "resumes correctly and does not re-run completed nodes" phrasing: the
   actual implementation doesn't resume node-level execution at all, it only
   marks stuck executions FAILED via one bulk query — so "does not re-run
   completed nodes" is tested as "does not touch terminal-status rows," which is
   the real guarantee the code provides.
   Discovered along the way and worth flagging: this environment's Postgres
   session timezone is `Europe/Kyiv` (UTC+3, matching the JVM default), and
   Hibernate binds `Instant` JPQL parameters as UTC-normalized values against the
   `TIMESTAMP WITHOUT TIME ZONE` column — a raw JDBC write of the same instant via
   `Timestamp.from(instant)` (no zone conversion) lands ~3h off from what Hibernate
   itself would have written. The integration test works around this by writing
   backdated timestamps through the same UTC-normalized path Hibernate uses
   (`Timestamp.valueOf(LocalDateTime.ofInstant(instant, ZoneOffset.UTC))`); it's
   noted here since the same class of mismatch would silently affect any other
   test — or migration script — that hand-writes timestamps into this schema.

5. **CLI commands**, using a new shared `CliCommandTestBase` (redirects
   `user.home` to a `@TempDir` before picocli builds its command tree, since none
   of `LoginCommand`/`StatusCommand`/etc. take `CliConfigService` via
   constructor injection — they all do `new CliConfigService()` internally,
   which only reads `XDG_CONFIG_HOME`/`HOOKFLOW_CONFIG`/`~/.config/hookflow/...`)
   and a per-test local `HttpServer` stub standing in for the backend:
   `StatusCommandTest`, `ConfigCommandTest` (including the profile subcommands),
   `ReplayCommandTest`, `EventsTailCommandTest`, `TunnelsCommandTest`,
   `LoginCommandTest`. `--password` turned out to be a picocli
   `interactive = true` option that prompts via stdin even when a value follows
   it on the command line (confirmed by a 30s hang before fixing it) — the login
   tests feed the password through redirected `System.in` instead.
   `ListenCommand` and `WebSocketTunnelClient` are **not** covered — the command
   blocks on `CountDownLatch.await()` until Ctrl+C or a real WS disconnect, which
   would need either reflection into private state or a real embedded WS server;
   deferred as out of proportion to the value versus the round-trip test below.

6. **Tunnel round-trip**: extended the existing `LocalForwarderTest` (per the
   task's instruction to extend rather than duplicate) with 6 new cases that
   spin up a local `HttpServer` and drive `LocalForwarder.forward(...)` against
   it for real — GET/POST/PUT/DELETE, query strings, custom headers, restricted
   headers stripped, non-2xx passed through unmodified (unlike
   `HttpNodeExecutor`, `LocalForwarder` must **not** translate a non-2xx local
   response into a synthetic tunnel error). This is the CLI-side half of the
   round trip; the server-side half (WS registration, `TUNNEL_REQUEST`
   dispatch, response correlation, disconnect/heartbeat/concurrency) was already
   thoroughly covered by the existing `TunnelFlowIntegrationTest` in
   `webhook-platform-api` — extending it further wasn't needed.

7. **API service layer** — `DlqServiceTest` (17), `DeliveryServiceTest` (25),
   `ReplayServiceTest` (26, including driving the `@Async` `executeReplayAsync`
   method directly and synchronously — since the test constructs `ReplayService`
   directly rather than through a Spring proxy, `@Async` never actually applies,
   so the full session state machine, including the batch loop, cancellation
   mid-loop, and resume-from-checkpoint, is directly testable). A
   `PlatformTransactionManager` mock backed by `SimpleTransactionStatus` stands in
   for the real `TransactionTemplate` dependency.

### Deferred (explicitly out of scope for this pass)

- `WorkflowService` (CRUD), `WorkflowExecutionPersistence`, and
  `WorkflowTriggerOutboxService` — named in "The gap" but not called out in the
  task's own "Steps" priority list; the engine, recovery job, node executors, and
  the depth guard (which is what "Steps" actually itemizes) are covered.
- `ListenCommand` / `WebSocketTunnelClient` (see above).
- The other ~15 untested API services listed in "The gap"
  (`EventService`, `EndpointService`, `ProjectService`, `OrganizationService`,
  `MembershipService`, `ApiKeyService`, `AnalyticsService`, `DashboardService`,
  `UsageService`, `RuleService`, `TransformationService`, `PiiMaskingService`,
  `AlertService`, `IncidentService`, `AuthService`) — the task's priority list
  named `DeliveryService`/`ReplayService`/`DlqService` specifically as the ones
  worth doing here ("bugs there are user-visible in the same way the P0 defects
  were"); the rest is a reasonable follow-up task, not silently dropped.

### Coverage — before/after, via P1-28's JaCoCo aggregate (`mvn test` then
`target/site/jacoco-aggregate/jacoco.csv`, LINE metric)

**Before:** 0% for every class this task targets — confirmed by grep, not
assumed: no test file anywhere in the repo referenced `WorkflowEngine`,
`WorkflowTriggerService`, `WorkflowExecutionRecoveryJob`, any of the 9 node
executor classes, or any of `LoginCommand`/`StatusCommand`/`ReplayCommand`/
`EventsTailCommand`/`TunnelsCommand`/`ConfigCommand` before this branch (`git
log` on `develop` at `6b3e28a` and a repo-wide search both confirm this;
`HookflowCliTest` only asserted `--help` output contains certain words, per the
task's own description).

**After** (`com.webhook.platform.api.service.workflow` +
`com.webhook.platform.api.service.workflow.executors`, aggregated across both
packages):

```
LINE  covered=553 missed=165 total=718  → 77.0%
INSTR covered=2541 missed=726 total=3267 → 77.8%
```

**After** (`webhook-platform-cli` module, all packages):

```
LINE  covered=558 missed=367 total=925  → 60.3%
INSTR covered=2617 missed=1629 total=4246 → 61.6%
```

The CLI number is pulled down by two classes that are 0% by design given what's
deferred above: `WebSocketTunnelClient` (112 missed lines) and most of
`ListenCommand` (61 missed lines, only its input-validation branches are
reachable without a live tunnel). Excluding just those two from the LINE total
(925 − 173 = 752 total, 558 covered) gives **74.2%** for the classes that are
actually in scope for this task — cited here for transparency, not to inflate
the headline number.

### Verification block — real output

`mvn test -pl webhook-platform-api -Dtest='Workflow*Test,*NodeExecutorTest'`:
```
[INFO] Tests run: 95, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```
(11 classes: WorkflowEngineTest, WorkflowExecutionRecoveryJobIntegrationTest,
WorkflowExecutionRecoveryJobTest, WorkflowTriggerServiceTest, and the 7 classes
matching `*NodeExecutorTest` — `WebhookTriggerExecutorTest` doesn't match this
particular glob since it doesn't end in "NodeExecutorTest," but it does run as
part of the full suite below.)

`mvn test -pl webhook-platform-cli`:
```
[INFO] Tests run: 64, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

`mvn test` (full reactor — common, api, worker, cli, coverage-report):
```
[INFO] Webhook Platform Common ............................. SUCCESS
[INFO] Webhook Platform API ................................ SUCCESS (706 tests)
[INFO] Webhook Platform Worker ............................. SUCCESS (180 tests)
[INFO] Webhook Platform CLI ................................ SUCCESS (64 tests)
[INFO] Webhook Platform Coverage Report .................... SUCCESS
[INFO] BUILD SUCCESS
[INFO] Total time:  08:29 min
```
950 tests total (706 + 180 + 64), 0 failures, 0 errors, 0 skipped.

### Files added

```
webhook-platform-api/src/test/java/com/webhook/platform/api/service/workflow/executors/
  BranchNodeExecutorTest.java, FilterNodeExecutorTest.java, WebhookTriggerExecutorTest.java,
  DelayNodeExecutorTest.java, TransformNodeExecutorTest.java, DeliveryNodeExecutorTest.java,
  CreateEventNodeExecutorTest.java, HttpNodeExecutorTest.java, SlackNodeExecutorTest.java
webhook-platform-api/src/test/java/com/webhook/platform/api/service/workflow/
  WorkflowEngineTest.java, WorkflowTriggerServiceTest.java,
  WorkflowExecutionRecoveryJobTest.java, WorkflowExecutionRecoveryJobIntegrationTest.java
webhook-platform-api/src/test/java/com/webhook/platform/api/service/
  DlqServiceTest.java, DeliveryServiceTest.java, ReplayServiceTest.java
webhook-platform-cli/src/test/java/com/webhook/platform/cli/command/
  CliCommandTestBase.java, StatusCommandTest.java, ConfigCommandTest.java,
  ReplayCommandTest.java, EventsTailCommandTest.java, TunnelsCommandTest.java, LoginCommandTest.java
webhook-platform-cli/src/test/java/com/webhook/platform/cli/tunnel/LocalForwarderTest.java (extended)
```
