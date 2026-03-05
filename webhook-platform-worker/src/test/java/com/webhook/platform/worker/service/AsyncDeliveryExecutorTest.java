package com.webhook.platform.worker.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.support.Acknowledgment;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AsyncDeliveryExecutorTest {

    private AsyncDeliveryExecutor executor;

    @BeforeEach
    void setUp() {
        executor = new AsyncDeliveryExecutor(new SimpleMeterRegistry(), 4, 5);
    }

    @AfterEach
    void tearDown() {
        executor.shutdown();
    }

    @Test
    void submit_shouldRunTaskAndAck() throws Exception {
        Acknowledgment ack = mock(Acknowledgment.class);
        CountDownLatch latch = new CountDownLatch(1);

        executor.submit(() -> latch.countDown(), ack, "test-1");

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        // Give a moment for ack to be called after task completes
        Thread.sleep(100);
        verify(ack).acknowledge();
    }

    @Test
    void submit_shouldNotAckOnFailure() throws Exception {
        Acknowledgment ack = mock(Acknowledgment.class);
        CountDownLatch latch = new CountDownLatch(1);

        executor.submit(() -> {
            latch.countDown();
            throw new RuntimeException("boom");
        }, ack, "test-fail");

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        Thread.sleep(100);
        verify(ack, never()).acknowledge();
    }

    @Test
    void submit_shouldTrackInFlightCount() throws Exception {
        CountDownLatch blockLatch = new CountDownLatch(1);
        CountDownLatch startedLatch = new CountDownLatch(2);
        Acknowledgment ack = mock(Acknowledgment.class);

        // Submit 2 tasks that block
        executor.submit(() -> {
            startedLatch.countDown();
            try { blockLatch.await(10, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }, ack, "t1");

        executor.submit(() -> {
            startedLatch.countDown();
            try { blockLatch.await(10, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }, ack, "t2");

        assertTrue(startedLatch.await(5, TimeUnit.SECONDS));
        assertEquals(2, executor.getInFlightCount());

        // Release
        blockLatch.countDown();
        Thread.sleep(200);
        assertEquals(0, executor.getInFlightCount());
    }

    @Test
    void submit_shouldApplyBackpressure() throws Exception {
        // Pool size = 4, so 5th submission should block until one completes
        CountDownLatch blockLatch = new CountDownLatch(1);
        CountDownLatch allStarted = new CountDownLatch(4);
        Acknowledgment ack = mock(Acknowledgment.class);

        // Fill the pool
        for (int i = 0; i < 4; i++) {
            executor.submit(() -> {
                allStarted.countDown();
                try { blockLatch.await(10, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }, ack, "fill-" + i);
        }

        assertTrue(allStarted.await(5, TimeUnit.SECONDS));

        // 5th submission should block (semaphore exhausted)
        AtomicBoolean fifthStarted = new AtomicBoolean(false);
        Thread submitter = new Thread(() -> {
            executor.submit(() -> fifthStarted.set(true), ack, "fifth");
        });
        submitter.start();

        Thread.sleep(300);
        assertFalse(fifthStarted.get(), "5th task should be blocked by semaphore");

        // Release pool
        blockLatch.countDown();
        submitter.join(5000);
        Thread.sleep(200);
        assertTrue(fifthStarted.get(), "5th task should eventually run");
    }

    @Test
    void submit_shouldPreserveMdcContext() throws Exception {
        Acknowledgment ack = mock(Acknowledgment.class);
        CountDownLatch latch = new CountDownLatch(1);
        AtomicBoolean mdcOk = new AtomicBoolean(false);

        org.slf4j.MDC.put("testKey", "testValue");
        executor.submit(() -> {
            mdcOk.set("testValue".equals(org.slf4j.MDC.get("testKey")));
            latch.countDown();
        }, ack, "mdc-test");
        org.slf4j.MDC.clear();

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        assertTrue(mdcOk.get(), "MDC context should be propagated to worker thread");
    }

    @Test
    void concurrentSubmissions_shouldAllComplete() throws Exception {
        int count = 20;
        AtomicInteger completed = new AtomicInteger(0);
        CountDownLatch latch = new CountDownLatch(count);

        for (int i = 0; i < count; i++) {
            Acknowledgment ack = mock(Acknowledgment.class);
            executor.submit(() -> {
                completed.incrementAndGet();
                latch.countDown();
            }, ack, "concurrent-" + i);
        }

        assertTrue(latch.await(30, TimeUnit.SECONDS));
        assertEquals(count, completed.get());
    }
}
