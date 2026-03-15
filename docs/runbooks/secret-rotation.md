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

## 2. Encryption Key Rotation

**Impact:** **Critical** — endpoint webhook secrets are encrypted with this key. Changing it without re-encryption breaks all signature verification.

**Current limitation:** Hookflow does not support key versioning. Rotation requires re-encryption of all stored secrets.

**Procedure:**

```bash
# 1. Generate new key (exactly 32 characters for AES-256)
NEW_KEY=$(openssl rand -hex 16)
NEW_SALT=$(openssl rand -hex 16)

# 2. BEFORE changing the key — re-encrypt all secrets
# This requires a custom migration script:
psql -c "
  -- Export current encrypted values (for rollback)
  COPY (SELECT id, signing_secret FROM endpoints WHERE signing_secret IS NOT NULL)
  TO '/tmp/endpoints_secrets_backup.csv' CSV;
"

# 3. Run re-encryption (application-level — needs both old and new keys)
# This is a TODO: implement a CLI command like:
# java -jar app.jar --hookflow.reencrypt --old-key=$OLD_KEY --new-key=$NEW_KEY

# 4. Update secret and restart
kubectl create secret generic hookflow-secrets \
  --from-literal=encryption-key=$NEW_KEY \
  --from-literal=encryption-salt=$NEW_SALT \
  --from-literal=jwt-secret=$EXISTING_JWT_SECRET \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment hookflow-api
kubectl rollout restart deployment hookflow-worker
```

**TODO:** Implement key versioning in `CryptoUtils` to support zero-downtime rotation:
- Store key version prefix in encrypted data
- Support decrypting with old key + encrypting with new key
- Lazy re-encryption on read

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
| Encryption Key | Only when compromised | Manual (requires re-encryption) |
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
