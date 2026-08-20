# P3-34 — Workflow engine and CLI command tests

- **Status:** TODO
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

- [ ] Start with the workflow **node executors** — they are the most isolated and
      the highest risk per line. One focused test class per executor.
- [ ] Then `WorkflowEngine` itself: branching, filtering, delays, depth limiting
      (`WorkflowTriggerService.getCurrentDepth()` guards recursion — test that the
      guard actually holds), and failure propagation mid-graph.
- [ ] `WorkflowExecutionRecoveryJob`: an interrupted execution resumes correctly
      and does not re-run completed nodes.
- [ ] CLI: test the commands' argument parsing and their behaviour against a
      stubbed backend. `LocalForwarderTest` and `CliConfigServiceTest` already
      exist — follow their setup rather than inventing one.
- [ ] A tunnel round-trip test would be the most valuable CLI test: connect,
      forward a request to a local port, return the response. `TunnelFlowIntegrationTest`
      exists on the server side — check whether it can be extended rather than duplicated.
- [ ] Then the API service layer, prioritising `DeliveryService`, `ReplayService`
      and `DlqService` — they mutate delivery state, so bugs there are
      user-visible in the same way the P0 defects were.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest='Workflow*Test,*NodeExecutorTest'
mvn test -pl webhook-platform-cli
mvn test
```

- [ ] Cite before/after coverage for the workflow package and the CLI module,
      using P1-28's tooling.

## Definition of done

- [ ] All 9 node executors plus the engine have tests.
- [ ] CLI commands tested beyond help text; tunnel round-trip covered.
- [ ] The three delivery-state services tested.
- [ ] Coverage numbers cited, not adjectives.

## Progress log
