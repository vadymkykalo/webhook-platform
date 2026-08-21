# P1-21 — End-to-end delivery test (highest-value test in the whole list)

- **Status:** IN PROGRESS
- **Priority:** P1 — would have caught P0-01, P0-02, P0-03 and P0-05
- **Branch:** `feature/P1-21-e2e-delivery-test`
- **Depends on:** nothing (but it is what proves the P0 fixes)
- **Module:** `webhook-platform-api` / `webhook-platform-worker`

## The gap

There is no test anywhere that ingests an event and asserts it gets delivered.

`AbstractIntegrationTest.java:29` deliberately disables the real path:
```java
"spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration,
 org.redisson.spring.starter.RedissonAutoConfigurationV2"
```
plus `@MockBean` on `OutboxPublisherService`, `RedissonClient`,
`SequenceGeneratorService`, `RedisRateLimiterService`. The only Testcontainer is
`PostgreSQLContainer`.

Verify the scale of the gap yourself:
```bash
grep -rn "KafkaContainer\|EmbeddedKafka\|GenericContainer\|RedisContainer" --include="*.java" .
grep -rn "WireMock\|MockWebServer" --include="*.java" .
```
Both return nothing. So the README's headline claim — "transactional outbox →
Kafka — at-least-once, zero event loss" — is asserted by no test, and no test
anywhere proves a webhook was sent over HTTP with the right signature.

## Steps

- [ ] Add test dependencies: `org.testcontainers:kafka`, a Redis container
      (Testcontainers Redis module or `GenericContainer`), and WireMock.
- [ ] Build a harness that stands up Postgres + Kafka + Redis containers, with the
      real autoconfiguration **enabled** — deliberately not extending
      `AbstractIntegrationTest`, which exists to avoid exactly this. Make the
      relationship between the two explicit in a class comment so the next
      person does not "fix" one to match the other.
- [ ] Write the core test: `POST /api/v1/projects/{id}/events` → outbox row →
      Kafka → worker → WireMock receives a POST → assert the HMAC-SHA256
      signature header verifies against the endpoint secret, and the delivery
      row ends `SUCCESS`.
- [ ] Then the failure paths, which is where the value is:
  - [ ] endpoint returns 500 → delivery lands on the correct retry tier and is
        eventually retried
  - [ ] endpoint stays down through all attempts → delivery reaches DLQ
  - [ ] worker killed mid-flight → delivery is recovered, not stranded
        (**this is P0-01's regression test**)
  - [ ] duplicate Kafka delivery → at-least-once holds, no lost update
  - [ ] slow 2xx near the timeout boundary → exactly one POST received
        (**this is P0-05's regression test**)
- [ ] Name it with an integration suffix so it routes to the Docker CI job, and
      check the runtime — if it is slow, keep it as one class rather than many,
      because each class pays a context restart.
- [ ] Wire it into `ci.yml`'s integration job and confirm it runs there, not just
      locally.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=DeliveryEndToEndIntegrationTest   # needs Docker
mvn test -Dtest='*IntegrationTest,*IT' -DfailIfNoTests=false
```

- [ ] Confirm it genuinely fails when you revert any one of the P0 fixes. A
      green end-to-end test that passes against known-broken code is worse than
      no test, because it manufactures confidence.

## Definition of done

- [ ] Real Kafka + Redis + Postgres containers, real autoconfiguration.
- [ ] Signature verified on the wire, not just "a request arrived".
- [ ] All five failure paths covered.
- [ ] Runs in CI; proven to fail against reverted P0 fixes.

## Progress log
