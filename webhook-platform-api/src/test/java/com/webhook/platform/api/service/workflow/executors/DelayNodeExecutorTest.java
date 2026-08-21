package com.webhook.platform.api.service.workflow.executors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.WorkflowStepExecution.StepStatus;
import com.webhook.platform.api.service.workflow.StepResult;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class DelayNodeExecutorTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final DelayNodeExecutor executor = new DelayNodeExecutor();

    @Test
    void getType_returnsDelay() {
        assertThat(executor.getType()).isEqualTo("delay");
    }

    @Test
    void execute_sleepsRoughlyConfiguredSeconds_andPassesInputThrough() throws Exception {
        JsonNode config = mapper.readTree("{\"delaySeconds\":1}");
        JsonNode input = mapper.readTree("{\"a\":1}");

        long start = System.currentTimeMillis();
        StepResult result = executor.execute(config, input);
        long elapsed = System.currentTimeMillis() - start;

        assertThat(result.status()).isEqualTo(StepStatus.SUCCESS);
        assertThat(result.output()).isEqualTo(input);
        assertThat(elapsed).isGreaterThanOrEqualTo(1000);
    }

    @Test
    void delaySecondsZero_isClampedToOneSecondMinimum() throws Exception {
        JsonNode config = mapper.readTree("{\"delaySeconds\":0}");
        JsonNode input = mapper.readTree("{}");

        long start = System.currentTimeMillis();
        StepResult result = executor.execute(config, input);
        long elapsed = System.currentTimeMillis() - start;

        assertThat(result.status()).isEqualTo(StepStatus.SUCCESS);
        assertThat(elapsed).isGreaterThanOrEqualTo(900); // clamped to 1s min, allow small scheduling jitter
    }

    @Test
    void delaySecondsNegative_isClampedToOneSecondMinimum() throws Exception {
        JsonNode config = mapper.readTree("{\"delaySeconds\":-5}");
        JsonNode input = mapper.readTree("{}");

        long start = System.currentTimeMillis();
        StepResult result = executor.execute(config, input);
        long elapsed = System.currentTimeMillis() - start;

        assertThat(result.status()).isEqualTo(StepStatus.SUCCESS);
        assertThat(elapsed).isGreaterThanOrEqualTo(900);
    }

    @Test
    void interruptedDuringDelay_returnsFailedAndRestoresInterruptFlag() throws Exception {
        JsonNode config = mapper.readTree("{\"delaySeconds\":60}");
        JsonNode input = mapper.readTree("{}");

        AtomicReference<StepResult> resultRef = new AtomicReference<>();
        AtomicReference<Boolean> interruptedFlag = new AtomicReference<>();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(1);

        Thread worker = new Thread(() -> {
            started.countDown();
            resultRef.set(executor.execute(config, input));
            interruptedFlag.set(Thread.currentThread().isInterrupted());
            finished.countDown();
        });
        worker.start();
        started.await(2, TimeUnit.SECONDS);
        Thread.sleep(100); // let it enter Thread.sleep()
        worker.interrupt();
        boolean completed = finished.await(5, TimeUnit.SECONDS);

        assertThat(completed).isTrue();
        assertThat(resultRef.get().status()).isEqualTo(StepStatus.FAILED);
        assertThat(resultRef.get().errorMessage()).isEqualTo("Delay interrupted");
        assertThat(interruptedFlag.get()).isTrue();
    }
}
