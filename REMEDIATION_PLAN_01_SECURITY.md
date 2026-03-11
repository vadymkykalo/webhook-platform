# План ремедиации — Часть 1: БЕЗОПАСНОСТЬ

> Дата: 2026-03-11 | Статус: ЧАСТИЧНО ГОТОВА

---

## 1.1 API Key scope не применяется в auth filter

### 1. Корневая причина
`ApiKeyAuthenticationFilter` (строки 31–59) проверяет `revokedAt`/`expiresAt`, но **игнорирует `scope`** (READ_WRITE/READ_ONLY). `ApiKeyAuthenticationToken` не несёт scope. `AuthContextArgumentResolver` жёстко ставит `MembershipRole.API_KEY`. `RbacUtil.requireWriteAccess()` пропускает API_KEY всегда — READ_ONLY key может писать данные.

**Слой:** Security / Backend

### 2. Целевое состояние
- READ_ONLY API key блокируется на POST/PUT/PATCH/DELETE
- Scope в цепочке: Filter → Token → AuthContext → RbacUtil
- Deny-by-default: неизвестный scope = блокировка

### 3. План реализации

**Quick fix (1-2 дня):**
1. `ApiKeyAuthenticationToken` — добавить `ApiKeyScope scope`
2. `ApiKeyAuthenticationFilter` — передать `apiKey.getScope()` в token
3. `AuthContext` — добавить `ApiKeyScope apiKeyScope`
4. `AuthContextArgumentResolver` — пробросить scope из token
5. `RbacUtil.requireWriteAccess()` — блокировать `API_KEY + READ_ONLY`

**Proper fix (1 неделя):**
- Granular scopes: `events:write`, `events:read`, `endpoints:manage`, `deliveries:read`
- Flyway: `ALTER TABLE api_keys ADD COLUMN scopes TEXT[] DEFAULT '{events:write,events:read}'`
- Аннотация `@RequireScope("events:write")` + `ScopeCheckInterceptor`
- Endpoint-to-scope matrix в коде

**Long-term:**
- Scope matrix в конфигурации (YAML/DB)
- Self-service управление scopes в UI
- Audit log denied scope attempts

### 4. Архитектура
```
Request → ApiKeyAuthFilter(scope из DB) → Token(scope)
  → AuthContextResolver → AuthContext(scopes[])
  → @RequireScope("events:write") — Interceptor
  → Controller method
```

### 5. Риски
- Quick fix может сломать существующие READ_ONLY keys → трактовать без scope как READ_WRITE
- Granular scopes усложняют UI создания ключей

### 6. Приоритет: **Must do before limited prod**
### 7. Трудозатраты: Quick **S**, Proper **M**
### 8. Порядок: Первым — P0 security, нет зависимостей

---

## 1.2 Invite token утекает в ответе addMember

### 1. Корневая причина
`MembershipService.addMember()` строка 125: `.inviteToken(membership.getInviteToken())` включается в `MemberResponse`. Plaintext invite token возвращается в HTTP response → логи, devtools, прокси. Token предназначен для email, не для вызывающего.

**Слой:** Security / Backend

### 2. Целевое состояние
- `MemberResponse` не содержит `inviteToken`
- Token отправляется только через email
- В DB token хранится хэшированным

### 3. План реализации

**Quick fix (30 мин):**
1. Удалить `private String inviteToken` из `MemberResponse.java`
2. Убрать `.inviteToken(...)` из builder в `addMember()`

**Proper fix (2-3 дня):**
1. Хэшировать token: `CryptoUtils.hashApiKey(inviteToken)` → save hash to DB
2. `sendInviteEmail()` получает plaintext (до хэширования)
3. `acceptInvite()` хэширует входящий token для lookup

### 4. Архитектура
```
Owner → POST /members → generate token → hash → save hash to DB
  → sendEmail(plaintext) → Response(БЕЗ token)
Invitee → POST /accept-invite?token=xxx → hash(xxx) → lookup → accept
```

### 5. Риски
- Proper fix: существующие незакрытые инвайты станут невалидными → grace period

### 6. Приоритет: Quick **Must do before limited prod**, Proper **before SaaS**
### 7. Трудозатраты: **S**
### 8. Порядок: Quick fix немедленно, нет зависимостей

---

## 1.3 UI хранит tokens в localStorage

### 1. Корневая причина
`App.tsx` строки 88-92, `http.ts` строки 64-65: `localStorage.setItem('auth_token', ...)`. XSS → полный доступ к токенам.

**Слой:** Frontend / Security

### 2. Целевое состояние
- Access token только в памяти (JS variable)
- Refresh token в httpOnly Secure SameSite=Strict cookie
- Page reload → silent refresh через cookie

### 3. План реализации

**Quick fix (2-3 дня):**

Backend:
1. `AuthController.login/refresh` → refresh token в Set-Cookie (httpOnly, Secure, SameSite=Strict, Path=/api/v1/auth)
2. Response body содержит только accessToken
3. `AuthController.refresh()` → `@CookieValue("refresh_token")`
4. CorsConfig: `setAllowCredentials(true)`

Frontend:
1. Убрать `localStorage` для tokens полностью
2. Access token → только в `http.ts` memory variable
3. Page reload → POST `/auth/refresh` (cookie auto-sent) → новый access token
4. `auth_user` в localStorage — допустимо (не секрет)

**Proper fix (+2-3 дня):**
- Short-lived access token (5-15 мин)
- Refresh token rotation: каждый refresh = новый refresh token
- Family detection: использование старого token → revoke всей семьи

### 4. Архитектура
```
Login: POST /auth/login → { accessToken } + Set-Cookie: refresh_token
API:   GET /projects (Authorization: Bearer <memory-token>)
Refresh: POST /auth/refresh (cookie auto) → { accessToken } + new cookie
Reload: POST /auth/refresh → restore | 401 → login
```

### 5. Риски
- Breaking change: все auth flows переписываются
- SameSite=Strict может блокировать OAuth redirect → использовать Lax если нужен OAuth
- Пользователи разлогинятся после деплоя

### 6. Приоритет: **Must do before SaaS launch** (quick fix можно до limited prod)
### 7. Трудозатраты: **M** (frontend + backend координация)
### 8. Порядок: После scope enforcement (#1.1), до SaaS launch

---

## 1.4 allow_private_ips=true — защита от случайного использования в production

### 1. Корневая причина
`docker-compose.yml` — это **dev среда**, и `WEBHOOK_ALLOW_PRIVATE_IPS:-true` там **корректен**: разработчику нужно отправлять webhooks на localhost, Docker-сеть и т.д. `docker-compose.prod.yml` правильно перезаписывает на `false`.

Реальный риск: кто-то запускает base `docker-compose.yml` напрямую в production (без prod overlay) или забывает выставить переменную в Kubernetes/VM deployment. В `application.yml` Spring default уже `false`, но env variable из compose перезаписывает его.

**Слой:** Security / Runtime

### 2. Целевое состояние
- `docker-compose.yml` default `true` — **оставить как есть** (dev среда)
- `docker-compose.prod.yml` default `false` — **уже корректно**
- **Runtime fail-safe:** при `APP_ENV=production` + `allowPrivateIps=true` → приложение отказывается стартовать
- WARNING лог при `allowPrivateIps=true` в любом окружении

### 3. План реализации

**Единственный необходимый фикс (1 час):**

Startup validator в API и Worker:
```java
@Component
public class SecurityConfigValidator {
    @Value("${webhook.url-validation.allow-private-ips:false}")
    private boolean allowPrivateIps;

    @Value("${app.env:development}")
    private String appEnv;

    @PostConstruct
    public void validate() {
        if (allowPrivateIps && "production".equals(appEnv)) {
            throw new IllegalStateException(
                "FATAL: allow-private-ips=true is forbidden in production. " +
                "SSRF protection is disabled. Set WEBHOOK_ALLOW_PRIVATE_IPS=false " +
                "or remove the override.");
        }
        if (allowPrivateIps) {
            log.warn("SECURITY: SSRF protection disabled (allow-private-ips=true). " +
                     "Acceptable for development only.");
        }
    }
}
```

Тесты:
- Unit: `appEnv=production` + `allowPrivateIps=true` → IllegalStateException
- Unit: `appEnv=development` + `allowPrivateIps=true` → OK, WARNING log
- Unit: `appEnv=production` + `allowPrivateIps=false` → OK, no warning

### 4. Риски: Нет — dev compose не меняется, production защищён runtime проверкой
### 5. Приоритет: **Must do before limited prod**
### 6. Трудозатраты: **S** (1 час)
### 7. Порядок: Независимый фикс, нет зависимостей
