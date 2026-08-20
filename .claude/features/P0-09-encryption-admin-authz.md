# P0-09 — Any registered user can rotate every tenant's encryption keys

- **Status:** IN PROGRESS
- **Priority:** P0 — platform-wide denial of service
- **Branch:** `feature/P0-09-encryption-admin-authz`
- **Depends on:** nothing
- **Module:** `webhook-platform-api`

## The defect

`EncryptionAdminController.java:38` gates the rotate endpoint on
`auth.requireOwnerAccess()`. That resolves to:

`security/RbacUtil.java`
```java
public static void requireOwnerAccess(MembershipRole role) {
    if (role != MembershipRole.OWNER) {
        throw new ForbiddenException("Only owners can perform this action");
    }
}
```
A pure role check with **no organization context**. And `AuthService.register`
makes every self-registering user `MembershipRole.OWNER` of their own new org
(verified around lines 95-108).

The operation itself is cluster-wide — `EncryptionKeyRotationService` lines
103, 171, 211 all use `findAll(PageRequest…)` with **no organization predicate**,
re-encrypting every tenant's endpoint signing secrets and provider HMAC secrets.

**Exploit:** anyone who signs up on a shared instance can
`POST /api/v1/admin/encryption/rotate` and force a full-table re-encryption of
all tenants' secrets. Partial failure is tolerated (`result.errors()`), so a
half-failed rotation leaves other tenants' secrets undecryptable → platform-wide
delivery outage. `GET /status` additionally leaks the deployment's active key
version to any registered user.

## Steps

- [ ] Reproduce first: register a fresh user, call the rotate endpoint, watch it
      succeed. **This is the whole bug in one request.**
- [ ] Recognise the category: these are **operator** endpoints, not tenant
      endpoints. `MembershipRole.OWNER` is the wrong axis entirely.
- [ ] Pick a mechanism and implement it. Options, in rough order of preference:
      a dedicated platform-admin authority independent of org membership; or
      binding these routes to the management port / an operator credential
      separate from user auth. State the choice and reasoning in the log.
- [ ] Apply to **both** `/rotate` and `/status` — the status leak is smaller but
      it is the same authorization mistake.
- [ ] Sweep for the same pattern elsewhere:
      `grep -rn "requireOwnerAccess" webhook-platform-api/src/main/java`
      and for each hit decide whether it is genuinely org-scoped or is another
      platform-global operation wearing tenant clothes. Record the list.
- [ ] While here: partial rotation failure leaving secrets undecryptable is its
      own hazard. At minimum make it loudly observable (counter + non-200);
      note in the log if a proper transactional/resumable design is needed later.

## Tests to write

`EncryptionAdminRbacTest.java` (RbacTest suffix → Docker CI job):

- a plain registered user (OWNER of their own org) gets 403 on `/rotate` and `/status`;
- a platform admin (however you modelled it) gets 200;
- rotation still works end-to-end for the authorised principal — extend the
  existing `EncryptionKeyRotationServiceTest` rather than duplicating it.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=EncryptionAdminRbacTest        # needs Docker
mvn test -pl webhook-platform-api -Dtest=EncryptionKeyRotationServiceTest
```

Manual:
```bash
make up && make wait-healthy
# register a normal user, obtain JWT, POST /api/v1/admin/encryption/rotate
# expect 403
```

## Definition of done

- [ ] Rotation and status are unreachable by ordinary tenant users.
- [ ] The `requireOwnerAccess` sweep is done and its findings listed in the log.
- [ ] Existing rotation tests still pass for the authorised path.

## Progress log
