# Access control and tenancy

Two separate mechanisms that are easy to confuse. **Tenancy** decides which rows exist for you at
all. **RBAC** decides what you may do with the rows that do. They are enforced in different
layers, and only one of them is something application code can get wrong.

## Tenancy: rows you cannot see do not exist

Everything a customer owns hangs off exactly one **Organization** — that is the tenant.
A **Project** is a division of an Organization's work that Endpoints, Sources and API keys
belong to. Projects are not a security boundary; the Organization is.

Isolation is a Hibernate `@TenantId` on roughly 35 entities, not a `WHERE` clause anyone writes:

```
request → authenticate → bind the Organization to the thread → any repository call
                                                                      ↓
                                        Hibernate appends organization_id = ?
```

Three consequences that follow from *where* this sits:

- **`findById` is scoped too.** Guessing another Organization's UUID returns empty, not a 403.
  There is no code path that loads a row first and checks ownership second, because there is no
  moment at which the unscoped row exists.
- **A new repository method inherits it.** It cannot forget, because it never had to remember.
- **An unset tenant throws.** Failing loudly turns an uncovered path into a 500 in a test run
  rather than a cross-tenant read in production. A sentinel organization id was rejected for the
  opposite failure: it would have filtered every background query down to zero rows — the same
  bug as forgetting the filter, silent in the other direction.

### Never hand-roll an org check

The build enforces this: **a service method that takes an `organizationId` parameter fails the
build.** Such a parameter is either redundant with `@TenantId`, or it is a second and weaker
mechanism that will eventually disagree with the first.

### What `@TenantId` does not cover

Four gaps, each of which has its own ratchet that tells you what to do when it fires:

| Gap | What is required |
|---|---|
| Work with no request behind it (schedulers, consumers) | Enter a scope explicitly — `TenantContext.runAs` / `callAs`, or `runAsSystem` for genuinely cross-tenant work |
| Entering a scope inside a transaction | The session is already open with the old tenant. Enter it **outside**. |
| Native queries | Hibernate builds no predicate for SQL it did not compose. Scope by hand, and say why. |
| Your own thread pool | A new thread does not inherit the binding |

`TenantContext.runAsSystem` is the one sanctioned way to see across Organizations. It is not a
convenience; every use is a place where a reviewer should ask why.

## RBAC: what you may do

Two independent axes, because a human and a program are different kinds of caller.

### Roles, for people

| Role | May |
|---|---|
| `OWNER` | Everything, including billing, members and organization settings |
| `DEVELOPER` | Read and write the delivery configuration — endpoints, subscriptions, sources, rules |
| `VIEWER` | Read only |
| `API_KEY` | Not a human role. See below. |

### Scopes, for API keys

`READ_WRITE` or `READ_ONLY`. That is the whole vocabulary.

### Why the four roles are not a ladder

`OWNER`, `DEVELOPER` and `VIEWER` order naturally. `API_KEY` sits outside that order entirely —
a key is neither above nor below a Viewer; it is a different kind of caller whose permissions come
from its scope. So handlers do not declare "a minimum role", which would have forced someone to
invent a position for `API_KEY`. They declare what they require of the caller:

| `AccessLevel` | Passes | Rejects |
|---|---|---|
| `READ` | Any authenticated caller | — |
| `WRITE` | Owners, Developers, `READ_WRITE` keys | Viewers, `READ_ONLY` keys |
| `OWNER` | Owners | Everyone else, **including every API key** — a key never holds `OWNER` |

`READ` is declared rather than omitted on purpose: "this handler needs nothing" should be a
statement somebody made, not a line somebody forgot.

The annotations are `@RequireAccess`, `@RequireScope` and `@RequireOrgAccess`, applied at the
handler and enforced by an aspect.

## Credentials

| Credential | For | Carries |
|---|---|---|
| JWT session | The dashboard | A user, their Organization, their role |
| API key | Programmatic ingest and management | An Organization, a Project, a scope |
| Platform admin token | Operating the deployment itself | Crosses Organizations by design |
| Device code | CLI login | Exchanges for a JWT session |

API keys support rotation with a grace window, and sessions can be listed and revoked
individually. Repeated failed logins trigger lockout with exponential backoff.

## What is not here

Stated plainly, because discovering it mid-evaluation is worse than reading it now:

- **No custom roles and no per-resource scoping.** Three human roles and two key scopes, fixed.
  You cannot grant someone write access to one Project and read access to another within the same
  Organization.
- **No SSO — neither SAML nor OIDC — and no SCIM.** Not implemented and deliberately not
  advertised; a migration removed a plan flag that had claimed it. This is a hard blocker for
  larger organizations. See `ROADMAP.md`.
- **Projects are not a permission boundary.** They organize work; they do not confine it.
