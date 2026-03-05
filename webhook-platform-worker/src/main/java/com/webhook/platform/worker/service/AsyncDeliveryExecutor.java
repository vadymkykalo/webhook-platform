package com.webhook.platform.worker.service;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Bounded async executor for webhook delivery and incoming forward processing.
 * Decouples Kafka consumer threads from blocking HTTP calls.
 *
 * <p>Kafka consumer threads submit work here and return immediately,
 * freeing them to poll Kafka. HTTP {@code .block()} calls now run on
 * this pool's threads instead of Kafka consumer threads.</p>
 *
 * <h3>Backpressure</h3>
 * A {@link Semaphore} limits in-flight tasks. When the pool is full,
 * the Kafka consumer thread blocks on {@code semaphore.acquire()},
 * naturally slowing down consumption (no message loss, no busy-wait).
 *
 * <h3>Ack safety</h3>
 * {@code Acknowledgment.acknowledge()} is called only after successful
 * processing. On failure, the message is NOT acked — Kafka will redeliver
 * it after rebalance. Processing must be idempotent (already is: claim-based).
 */
@Component
@Slf4j
public class AsyncDeliveryExecutor {

    private final ExecutorService executor;
    private final Semaphore semaphore;
    private final int maxConcurrent;
    private final long shutdownTimeoutSeconds;
    private final AtomicInteger inFlight = new AtomicInteger(0);
    private final AtomicInteger queued = new AtomicInteger(0);

    public AsyncDeliveryExecutor(
            MeterRegistry meterRegistry,
            @Value("${webhook.async-pool-size:50}") int poolSize,
            @Value("${webhook.async-shutdown-timeout-seconds:60}") long shutdownTimeoutSeconds) {
        this.maxConcurrent = poolSize;
        this.shutdownTimeoutSeconds = shutdownTimeoutSeconds;
        this.semaphore = new Semaphore(poolSize);

        this.executor = new ThreadPoolExecutor(
                poolSize, poolSize,
                60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(poolSize * 2),
                r -> {
                    Thread t = new Thread(r);
                    t.setName("delivery-worker-" + t.getId());
                    t.setDaemon(true);
                    return t;
                },
                new ThreadPoolExecutor.CallerRunsPolicy() // backpressure: caller thread runs if queue full
        );

        Gauge.builder("async_delivery_in_flight", inFlight, AtomicInteger::doubleValue)
                .register(meterRegistry);
        Gauge.builder("async_delivery_available_permits", semaphore, s -> (double) s.availablePermits())
                .register(meterRegistry);
        Gauge.builder("async_delivery_queued", queued, AtomicInteger::doubleValue)
                .register(meterRegistry);

        log.info("AsyncDeliveryExecutor initialized: poolSize={}, shutdownTimeout={}s", poolSize, shutdownTimeoutSeconds);
    }

    /**
     * Submit a delivery task for async processing.
     * Blocks the caller (Kafka consumer thread) only when the pool is full (backpressure).
     * Calls {@code ack.acknowledge()} after successful processing.
     *
     * @param task the processing logic (e.g. {@code () -> service.processDelivery(msg)})
     * @param ack  Kafka acknowledgment — called on success, skipped on failure
     * @param id   identifier for logging (deliveryId or eventId)
     */
    public void submit(Runnable task, Acknowledgment ack, String id) {
        Map<String, String> mdcContext = MDC.getCopyOfContextMap();

        try {
            queued.incrementAndGet();
            semaphore.acquire();
            queued.decrementAndGet();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            queued.decrementAndGet();
            log.warn("Interrupted waiting for async delivery permit: {}", id);
            return; // Don't ack — message will be redelivered
        }

        inFlight.incrementAndGet();
        executor.execute(() -> {
            if (mdcContext != null) {
                MDC.setContextMap(mdcContext);
            }
            try {
                task.run();
                ack.acknowledge();
            } catch (Exception e) {
                // Don't ack — Kafka will redeliver after rebalance
                log.error("Async delivery failed, not acking (will be redelivered): id={}, error={}",
                        id, e.getMessage(), e);
            } finally {
                inFlight.decrementAndGet();
                semaphore.release();
                MDC.clear();
            }
        });
    }

    /**
     * Current number of in-flight tasks (for testing/monitoring).
     */
    public int getInFlightCount() {
        return inFlight.get();
    }

    @PreDestroy
    public void shutdown() {
        log.info("Shutting down AsyncDeliveryExecutor, waiting for {} in-flight tasks...", inFlight.get());
        executor.shutdown();
        try {
            if (!executor.awaitTermination(shutdownTimeoutSeconds, TimeUnit.SECONDS)) {
                log.warn("AsyncDeliveryExecutor did not terminate in {}s, forcing shutdown. {} tasks may be lost.",
                        shutdownTimeoutSeconds, inFlight.get());
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            executor.shutdownNow();
        }
        log.info("AsyncDeliveryExecutor shutdown complete");
    }
}
