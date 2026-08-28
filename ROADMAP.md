# Roadmap

What Hookflow is missing, why it matters, and roughly in what order. Written down because
"is this alive, and does the author know what it lacks?" is the first thing anyone evaluating
a self-hosted platform wants to answer — and because an honest list is more useful than a
feature grid that quietly omits the gaps.

Nothing here is dated. Items move when someone picks them up; the ordering is by how much it
costs a real deployment to live without them.

## Next

### Auto-disable an endpoint that keeps failing

`CircuitBreakerService` is Redis-backed and shared across pods, and it defers — it never
disables. So an endpoint whose owner deleted the receiving service goes on consuming retry
budget, queue depth and delivery rows until a human notices. Svix, Convoy and Hookdeck Outpost
all disable and notify; this is expected baseline behaviour, not a premium feature.

Most of the parts exist: `AlertType.CONSECUTIVE_FAILURES` already counts the condition,
`AlertChannel` already reaches email, Slack and a webhook, and `Endpoint.enabled` already
stops delivery. What is missing is the action that joins them — disable, notify, and give the
owner a clear way to re-enable once they have fixed their end.

### An app portal for the customer's own users

Today a Hookflow customer manages their end-users' endpoints on those users' behalf. There is
no view a customer can embed in their own product for their users to register an endpoint,
see why a delivery failed, and replay it. `SharedDebugLinkController` shares a single event —
useful, but not a portal.

This is the single largest structural gap against Svix, and it is the thing people pay for:
it moves webhook support out of the customer's inbox. It needs a scoped session model for a
non-Hookflow user, an embeddable surface, and enough theming not to look borrowed.

## Known gaps, not yet scheduled

Each of these is a real absence, listed so nobody has to discover it mid-evaluation.

**Standard Webhooks.** Signatures are Stripe-shaped — `X-Signature: t=…,v1=…` over
`<timestamp>.<body>`. The [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks)
convention (`webhook-id` / `webhook-timestamp` / `webhook-signature`) has been adopted by
OpenAI, Anthropic, Twilio, PagerDuty and Supabase, and receivers that follow it can verify
with an off-the-shelf library instead of reading our docs. Additive: both header sets can be
sent at once, so nothing existing breaks.

**SSO — SAML and OIDC.** Not implemented, and deliberately not advertised:
`V059__drop_unimplemented_sso_feature_flag.sql` removed the plan flag that claimed it. A hard
blocker for larger organizations.

**OpenTelemetry.** Prometheus metrics are thorough; there is no trace export, so a slow
delivery cannot be followed across ingest → Kafka → attempt. Correlation ids exist and would
carry it.

**RBAC granularity.** Three fixed roles (`OWNER` / `DEVELOPER` / `VIEWER`) and two API-key
scopes (`READ_WRITE` / `READ_ONLY`). No custom roles, no per-resource scoping.

**Terraform provider, and SDKs beyond Node/PHP/Python.** No Go SDK. The three that exist cover
the send-an-event / manage-endpoints / verify-a-signature path and offer a generic
authenticated-request escape hatch for the rest.

**Outgoing endpoints have no HTTP auth types.** `IncomingDestination` carries an `authType`
(bearer, basic, and so on); `Endpoint` does not, so an outgoing endpoint that needs
authentication is limited to a static custom header on the subscription. The asymmetry is
accidental.

**Filtering is project-level only.** The rules engine evaluates a full condition tree, but it
hangs off event ingestion. A subscription cannot carry its own filter, and the incoming
direction has no filtering at all — every incoming event goes to every enabled destination.

**No batching**, no static egress IPs, no PagerDuty or OpsGenie channel, no cold-storage
archival. MinIO is present in the Compose file but nothing consumes it yet.

**An organization switcher.** A user belonging to two organizations gets the oldest one on
login; there is no way to change it without a second account.

## Deliberately not planned

**A hosted-only tier.** Self-hosting gets every feature, with no licence key and nothing
gated. `BILLING_ENABLED` defaults to `false`, which is what makes that true. We sell hosting,
not features — see the README's "Is this really MIT?" for the full argument.

**A plugin system.** Transformations, the rules engine and the workflow builder cover the
cases a plugin API would, without asking operators to trust third-party code inside their
delivery path.
