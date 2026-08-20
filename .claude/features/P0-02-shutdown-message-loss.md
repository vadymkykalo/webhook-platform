# P0-02 — Deliveries dropped on every rolling deploy

- **Status:** IN PROGRESS
- **Priority:** P0 — loss happens on every deploy
- **Branch:** `feature/P0-02-shutdown-message-loss`
- **Depends on:** nothing (but land P0-01 first if you can; they touch adjacent code)
- **Module:** `webhook-platform-worker`

## The defect

`BoundedAsyncExecutor.java:126-146` throws `ShutdownRejectedException` from
**inside the `Runnable` handed to the executor**:

```java
} catch (ShutdownRejectedException e) {
    ...
    throw e; // propagate to Kafka error handler → DLT
}
```

The comment is wrong. By the time that task runs, the listener method
(`DeliveryConsumer.java:71-78`) has already returned on the consumer thread. The
throw only reaches the pool thread's uncaught-exception handler. Consequently
`KafkaConsumerConfig.java:139-141`
(`errorHandler.addNotRetryableExceptions(ShutdownRejectedException.class)`) is
**dead code for this path**.

`WebhookDeliveryService.java:148-155` throws it for every message consumed after
`@PreDestroy` sets `shuttingDown`.

Result on a rolling deploy: worker A gets `@PreDestroy`, `shuttingDown = true`,
but the container keeps handing it the ~10 already-polled records. Each throws,
is **not acked**, is **not sent to the DLT**, and sibling records that succeeded
ack higher offsets — so the rejected ones are skipped and never redelivered.

There is a second wrong comment nearby to fix while you are here:
`BoundedAsyncExecutor.java:137` claims "Kafka will redeliver after rebalance".
With the current ack strategy it will not (see P0-03).

## Steps

- [ ] Reproduce first: a test that submits work while `shuttingDown` is true and
      asserts the record is neither acked nor routed to the DLT.
- [ ] Move the shutdown check to the **listener method**, before `trySubmit`, so
      the exception is thrown on the consumer thread where the Kafka error
      handler can see it. (`DeliveryConsumer.java:71-78` and the incoming twin.)
- [ ] Alternatively/additionally: handle it inside the task by resetting the
      delivery so a sweep recovers it. Decide which and say why in the log —
      do not do a half-measure of both.
- [ ] Apply the same treatment to `IncomingForwardConsumer` if it shares the
      pattern (check before assuming).
- [ ] Fix the two misleading comments (`BoundedAsyncExecutor.java:133-137`).
- [ ] Confirm graceful shutdown still drains in-flight work within
      `webhook.async-shutdown-timeout-seconds` (worker `application.yml:92`) —
      the fix must not turn a clean drain into a stampede of rejections.

## Tests to write

- `BoundedAsyncExecutorTest.java` (exists — extend): during shutdown, submission
  is rejected on the caller's thread, not swallowed on a pool thread.
- New `DeliveryConsumerTest.java`: with `shuttingDown` true, the listener throws
  before acking; with it false, the record is submitted normally.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=BoundedAsyncExecutorTest
mvn test -pl webhook-platform-worker -Dtest=DeliveryConsumerTest
```

Manual, and this is the one that matters — it is the actual production scenario:
```bash
make up && make wait-healthy
# drive sustained event ingestion against an endpoint you control and can count
make rebuild-worker          # rolling restart under load
# assert: events sent == deliveries received (allowing at-least-once duplicates,
# never fewer). Record both numbers in the log.
```

## Definition of done

- [ ] Rejected-on-shutdown records are visibly handled (DLT or DB reset), never
      silently skipped.
- [ ] The load-plus-restart count check shows no loss. Numbers pasted in the log.
- [ ] Misleading comments corrected.
- [ ] `mvn test` green for `webhook-platform-worker`.

## Progress log
