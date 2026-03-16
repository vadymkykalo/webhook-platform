# Runbook: Secret Rotation

> Procedures for rotating all Hookflow secrets with minimal downtime.

---

## Secret Inventory

| Secret | Location | Rotation Impact | Rotation Strategy |
|--------|----------|----------------|-------------------|
| JWT Secret | `JWT_SECRET` env var | All user sessions invalidated | Rolling restart |
| Encryption Key | `WEBHOOK_ENCRYPTION_KEY` | Cannot decrypt stored endpoint secrets | Re-encrypt migration |
| Encryption Salt | `WEBHOOK_ENCRYPTION_SALT` | Cannot decrypt stored endpoint secrets | Re-encrypt migration |
| DB Password | `DB_PASSWORD` | Connection failure if mismatched | Blue-green |
| Redis Password | `REDIS_PASSWORD` | Cache connection failure (recoverable) | Blue-green |
| Stripe Secret Key | `STRIPE_SECRET_KEY` | Billing API calls fail | Hot swap |
| Stripe Webhook Secret | `STRIPE_WEBHOOK_SECRET` | Webhook signature verification fails | Hot swap |
| WayForPay Merchant Secret | `WAYFORPAY_MERCHANT_SECRET` | Payment calls fail | Hot swap |

---

## 1. JWT Secret Rotation

**Impact:** All existing JWT tokens become invalid. Users must re-login.

**Procedure:**

```bash
# 1. Generate new secret (min 64 characters)
NEW_JWT_SECRET=$(openssl rand -base64 48)

# 2. Update Kubernetes secret
kubectl create secret generic hookflow-secrets \
  --from-literal=jwt-secret=$NEW_JWT_SECRET \
  --from-literal=encryption-key=$EXISTING_ENCRYPTION_KEY \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Rolling restart API pods (picks up new secret)
kubectl rollout restart deployment hookflow-api

# 4. Verify
kubectl rollout status deployment hookflow-api
curl -s http://api:8080/actuator/health | jq .status
```

**Timing:** Best during low-traffic window. All active sessions will be invalidated.

---

## 2. Encryption Key Rotation (Zero-Downtime)

**Impact:** All endpoint secrets, incoming source HMAC secrets, and incoming destination auth configs are encrypted with this key. Rotation is **zero-downtime** thanks to key versioning — old and new keys coexist during migration.

**Overview:**
1. Add new key to config alongside old key
2. Deploy (new data encrypted with new key, old data still decrypts with old key)
3. Call rotation API to re-encrypt all existing data
4. Verify, then remove old key from config

### Step 1: Generate new key

```bash
NEW_KEY=$(openssl rand -hex 16)
echo "New encryption key: $NEW_KEY"
```

### Step 2: Add new key to environment (keep old key)

```bash
# Format: "version:key,version:key"
# Old key was version 1 (implicit when using single-key mode)
export WEBHOOK_ENCRYPTION_KEYS="1:${OLD_KEY},2:${NEW_KEY}"
export WEBHOOK_ENCRYPTION_KEY_ACTIVE_VERSION=2
# WEBHOOK_ENCRYPTION_SALT stays the same — it is shared across versions
```

Or in Kubernetes:

```bash
kubectl create secret generic hookflow-secrets \
  --from-literal=encryption-keys="1:${OLD_KEY},2:${NEW_KEY}" \
  --from-literal=encryption-key-active-version=2 \
  --from-literal=encryption-salt=$EXISTING_SALT \
  --from-literal=jwt-secret=$EXISTING_JWT_SECRET \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 3: Deploy API + Worker

```bash
kubectl rollout restart deployment hookflow-api
kubectl rollout restart deployment hookflow-worker
kubectl rollout status deployment hookflow-api
kubectl rollout status deployment hookflow-worker
```

At this point: new secrets are encrypted with version 2, old secrets still decrypt with version 1. **No downtime.**

### Step 4: Check encryption status

```bash
curl -s -X GET http://api:8080/api/v1/admin/encryption/status \
  -H "Authorization: Bearer $OWNER_JWT" | jq .
```

Expected:
```json
{
  "activeKeyVersion": 2,
  "availableVersions": [1, 2]
}
```

### Step 5: Trigger re-encryption of all existing data

```bash
curl -s -X POST http://api:8080/api/v1/admin/encryption/rotate \
  -H "Authorization: Bearer $OWNER_JWT" | jq .
```

Expected:
```json
{
  "status": "completed",
  "targetVersion": 2,
  "endpointsRotated": 150,
  "sourcesRotated": 30,
  "destinationsRotated": 45,
  "errors": 0
}
```

If `errors > 0`, check API logs and re-run — the operation is idempotent (skips already-rotated rows).

### Step 6: Remove old key from config

Once all rows are on version 2, remove version 1:

```bash
export WEBHOOK_ENCRYPTION_KEYS="2:${NEW_KEY}"
export WEBHOOK_ENCRYPTION_KEY_ACTIVE_VERSION=2
```

Redeploy. Done.

### Rollback

If something goes wrong before step 5, simply revert to single-key mode:

```bash
export WEBHOOK_ENCRYPTION_KEY=${OLD_KEY}
# Remove multi-key vars
unset WEBHOOK_ENCRYPTION_KEYS
unset WEBHOOK_ENCRYPTION_KEY_ACTIVE_VERSION
```

### Getting an OWNER JWT for the API call

```bash
# Login as an OWNER user
OWNER_JWT=$(curl -s -X POST http://api:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"..."}' | jq -r .accessToken)
```

---

## 3. Database Password Rotation

**Impact:** Connection failure during the gap between DB password change and app restart.

**Procedure (blue-green):**

```bash
# 1. Create new password
NEW_DB_PASSWORD=$(openssl rand -base64 32)

# 2. Set new password in PostgreSQL (allows BOTH old and new temporarily)
psql -U postgres -c "ALTER USER webhook_user PASSWORD '$NEW_DB_PASSWORD';"

# 3. Update Kubernetes secret
kubectl create secret generic hookflow-postgresql-secret \
  --from-literal=password=$NEW_DB_PASSWORD \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. Rolling restart all services (picks up new password from secret)
kubectl rollout restart deployment hookflow-api
kubectl rollout restart deployment hookflow-worker

# 5. Verify connections
kubectl rollout status deployment hookflow-api
curl http://api:8080/actuator/health/db | jq .status
```

**Downtime:** Near-zero with rolling restart (pods pick up new secret one by one).

---

## 4. Redis Password Rotation

**Impact:** Temporary cache miss (recoverable — app falls back to DB for quota checks).

**Procedure:**

```bash
# 1. Set new password in Redis
NEW_REDIS_PASSWORD=$(openssl rand -base64 32)
redis-cli -a $OLD_PASSWORD CONFIG SET requirepass $NEW_REDIS_PASSWORD

# 2. Update Kubernetes secret
kubectl create secret generic hookflow-redis-secret \
  --from-literal=password=$NEW_REDIS_PASSWORD \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Rolling restart
kubectl rollout restart deployment hookflow-api
kubectl rollout restart deployment hookflow-worker

# 4. Verify
curl http://api:8080/actuator/health/redis | jq .status
```

---

## 5. Stripe / Payment Provider Keys

**Impact:** Billing operations fail during the gap.

**Procedure:**

```bash
# 1. Generate new keys in Stripe Dashboard
#    Dashboard → Developers → API keys → Roll key

# 2. Update env vars (ConfigMap or Secret)
kubectl create secret generic hookflow-billing-secrets \
  --from-literal=stripe-secret-key=$NEW_STRIPE_KEY \
  --from-literal=stripe-webhook-secret=$NEW_WEBHOOK_SECRET \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Restart API only (worker doesn't use Stripe directly)
kubectl rollout restart deployment hookflow-api

# 4. Verify: trigger a test webhook from Stripe Dashboard
```

**Note:** Stripe supports rolling key rotation — both old and new keys are valid for 24h.

---

## 6. API Key Rotation (User-Facing)

Users rotate their own API keys via the UI or API:

```bash
# Create new key
curl -X POST /api/v1/projects/{projectId}/api-keys \
  -H "Authorization: Bearer $JWT" \
  -d '{"name": "new-key-2024", "scope": "READ_WRITE"}'

# Revoke old key
curl -X DELETE /api/v1/projects/{projectId}/api-keys/{keyId} \
  -H "Authorization: Bearer $JWT"
```

API keys are hashed (SHA-256) in the database — the plaintext is only shown once at creation.

---

## Rotation Schedule

| Secret | Rotation Frequency | Automation |
|--------|-------------------|------------|
| JWT Secret | Every 90 days | Manual (session invalidation) |
| Encryption Key | Every 180 days or when compromised | Zero-downtime via `POST /api/v1/admin/encryption/rotate` |
| DB Password | Every 90 days | Scriptable |
| Redis Password | Every 90 days | Scriptable |
| Stripe Keys | Yearly or when compromised | Semi-automated (Stripe rolling keys) |

---

## Emergency: Secret Compromised

1. **Immediately rotate the compromised secret** using procedures above
2. **Audit:** Check `audit_logs` table for suspicious activity
3. **If encryption key compromised:**
   - Rotate key + re-encrypt all secrets
   - Notify affected endpoint owners to rotate their webhook secrets
4. **If JWT secret compromised:**
   - Rotate immediately (invalidates all sessions)
   - Review recent API activity for unauthorized access
5. **If DB password compromised:**
   - Rotate immediately
   - Check `pg_stat_activity` for unknown connections
   - Review PostgreSQL logs for unusual queries
