package com.webhook.platform.worker.service;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.support.Acknowledgment;

import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Non-blocking bounded async executor with Kafka container pause/resume backpressure.
 *
 * <p>Unlike the old blocking semaphore approach, this executor uses
 * {@link Semaphore#tryAcquire()} (non-blocking). When permits are exhausted,
 * the executor <b>pauses</b> the associated Kafka listener containers, stopping
 * further polling. When a task completes and releases a permit, the containers
 * are <b>resumed</b> automatically.</p>
 *
 * <h3>Why this is better than blocking acquire()</h3>
 * <ul>
 *   <li>Consumer threads never block — no risk of {@code max.poll.interval.ms} breach</li>
 *   <li>No rebalance storms from slow consumers</li>
 *   <li>No CallerRunsPolicy risk (consumer thread running HTTP calls)</li>
 *   <li>Clean backpressure: Kafka simply stops polling until capacity is available</li>
 * </ul>
 *
 * <h3>Thread safety</h3>
 * Pause/resume uses {@link AtomicBoolean} CAS with double-check to prevent
 * the TOCTOU race where a permit is released between {@code trySubmit()} failure
 * and {@code pause()} call.
 *
 * <h3>Ack safety</h3>
 * {@code Acknowledgment.acknowledge()} is called only after successful processing.
 * On failure, the message is NOT acked — Kafka redelivers after rebalance.
 * On pool-full rejection, the message is also NOT acked — it will be re-polled
 * when containers resume.
 */
@Slf4j
public class BoundedAsyncExecutor {

    private final String name;
    private final ExecutorService executor;
    private final Semaphore semaphore;
    private final int maxConcurrent;
    private final long shutdownTimeoutSeconds;
    private final AtomicInteger inFlight = new AtomicInteger(0);
    private final AtomicBoolean containersPaused = new AtomicBoolean(false);

    /** Kafka listener containers managed by this executor for pause/resume. */
    private final CopyOnWriteArrayList<MessageListenerContainer> managedContainers = new CopyOnWriteArrayList<>();

    public BoundedAsyncExecutor(
            String name,
            int poolSize,
            long shutdownTimeoutSeconds,
            MeterRegistry meterRegistry) {
        this.name = name;
        this.maxConcurrent = poolSize;
        this.shutdownTimeoutSeconds = shutdownTimeoutSeconds;
        this.semaphore = new Semaphore(poolSize);

        this.executor = new ThreadPoolExecutor(
                poolSize, poolSize,
                60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(poolSize * 2),
                r -> {
                    Thread t = new Thread(r);
                    t.setName(name + "-worker-" + t.getId());
                    t.setDaemon(true);
                    return t;
                },
                // AbortPolicy: if queue is also full, reject. This should never happen
                // because semaphore limits submissions to poolSize, and queue is poolSize*2.
                new ThreadPoolExecutor.AbortPolicy()
        );

        String metricPrefix = name.replace("-", "_");
        Gauge.builder(metricPrefix + "_in_flight", inFlight, AtomicInteger::doubleValue)
                .description("Number of in-flight tasks in " + name + " executor")
                .register(meterRegistry);
        Gauge.builder(metricPrefix + "_available_permits", semaphore, s -> (double) s.availablePermits())
                .description("Available permits in " + name + " executor")
                .register(meterRegistry);
        Gauge.builder(metricPrefix + "_paused", containersPaused, p -> p.get() ? 1.0 : 0.0)
                .description("Whether " + name + " executor has paused Kafka containers")
                .register(meterRegistry);

        log.info("{} executor initialized: poolSize={}, shutdownTimeout={}s",
                name, poolSize, shutdownTimeoutSeconds);
    }

    /**
     * Register a Kafka listener container for pause/resume management.
     * Call this after application startup when containers are available.
     */
    public void registerContainer(MessageListenerContainer container) {
        managedContainers.add(container);
        log.info("{} executor registered Kafka container: {}", name, container);
    }

    /**
     * Try to submit a task for async processing. Non-blocking.
     *
     * @param task the processing logic
     * @param ack  Kafka acknowledgment — called on success, skipped on failure
     * @param id   identifier for logging
     * @return {@code true} if accepted, {@code false} if executor is full (caller must NOT ack)
     */
    public boolean trySubmit(Runnable task, Acknowledgment ack, String id) {
        if (!semaphore.tryAcquire()) {
            pauseContainers();
            return false;
        }

        Map<String, String> mdcContext = MDC.getCopyOfContextMap();
        inFlight.incrementAndGet();

        try {
            executor.execute(() -> {
                if (mdcContext != null) {
                    MDC.setContextMap(mdcContext);
                }
                try {
                    task.run();
                    ack.acknowledge();
                } catch (ShutdownRejectedException e) {
                    log.warn("{}: shutdown rejected, not acking: id={}", name, id);
                    throw e; // propagate to Kafka error handler → DLT
                } catch (Exception e) {
                    // Don't ack — Kafka will redeliver after rebalance
                    log.error("{}: async task failed, not acking (will be redelivered): id={}, error={}",
                            name, id, e.getMessage(), e);
                } finally {
                    inFlight.decrementAndGet();
                    semaphore.release();
                    MDC.clear();
                    resumeContainersIfNeeded();
                }
            });
        } catch (RejectedExecutionException e) {
            // Should not happen (semaphore guards submissions), but handle gracefully
            inFlight.decrementAndGet();
            semaphore.release();
            log.error("{}: executor rejected task (unexpected): id={}", name, id, e);
            resumeContainersIfNeeded();
            return false;
        }

        return true;
    }

    /**
     * Pause all managed Kafka containers to stop polling.
     * Uses CAS + double-check to prevent TOCTOU race.
     */
    private void pauseContainers() {
        if (containersPaused.compareAndSet(false, true)) {
            for (MessageListenerContainer c : managedContainers) {
                if (c.isRunning() && !c.isContainerPaused()) {
                    c.pause();
                }
            }
            log.info("{}: paused {} Kafka containers (executor full, {} in-flight)",
                    name, managedContainers.size(), inFlight.get());

            // Double-check: a permit might have been released between tryAcquire() and pause().
            // If permits are available now, resume immediately to prevent deadlock.
            if (semaphore.availablePermits() > 0) {
                if (containersPaused.compareAndSet(true, false)) {
                    for (MessageListenerContainer c : managedContainers) {
                        if (c.isRunning() && c.isContainerPaused()) {
                            c.resume();
                        }
                    }
                    log.debug("{}: immediate resume after pause (permits available)", name);
                }
            }
        }
    }

    /**
     * Resume containers after a permit is released.
     * Only resumes if containers are currently paused.
     */
    private void resumeContainersIfNeeded() {
        if (containersPaused.get() && semaphore.availablePermits() > 0) {
            if (containersPaused.compareAndSet(true, false)) {
                for (MessageListenerContainer c : managedContainers) {
                    if (c.isRunning() && c.isContainerPaused()) {
                        c.resume();
                    }
                }
                log.info("{}: resumed Kafka containers ({} permits available)",
                        name, semaphore.availablePermits());
            }
        }
    }

    /** Current number of in-flight tasks (for testing/monitoring). */
    public int getInFlightCount() {
        return inFlight.get();
    }

    /** Available permits in the semaphore (for testing). */
    public int getAvailablePermits() {
        return semaphore.availablePermits();
    }

    /** Whether containers are currently paused (for testing/monitoring). */
    public boolean isContainersPaused() {
        return containersPaused.get();
    }

    @PreDestroy
    public void shutdown() {
        log.info("Shutting down {} executor, waiting for {} in-flight tasks...", name, inFlight.get());
        executor.shutdown();
        try {
            if (!executor.awaitTermination(shutdownTimeoutSeconds, TimeUnit.SECONDS)) {
                log.warn("{} executor did not terminate in {}s, forcing shutdown. {} tasks may be lost.",
                        name, shutdownTimeoutSeconds, inFlight.get());
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            executor.shutdownNow();
        }
        log.info("{} executor shutdown complete", name);
    }
}
