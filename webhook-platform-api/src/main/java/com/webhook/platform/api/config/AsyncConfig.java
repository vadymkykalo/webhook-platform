package com.webhook.platform.api.config;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
@EnableAsync
@Slf4j
public class AsyncConfig {

    @Bean(name = "replayTaskExecutor")
    public Executor replayTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(10);
        executor.setThreadNamePrefix("replay-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }

    /**
     * Bounded thread pool for workflow execution.
     * - Core/Max threads limit concurrent workflow executions
     * - Queue buffers bursts
     * - When full: DISCARD + log warning (never block the caller thread!)
     *   CallerRunsPolicy is catastrophic here because the caller thread often holds
     *   a DB transaction — blocking it for minutes would exhaust the DB connection pool
     * - Prevents OOM from unbounded thread creation
     * - Graceful shutdown: waits for in-flight workflows before stopping
     */
    @Bean(name = "workflowTaskExecutor")
    public Executor workflowTaskExecutor(
            @Value("${workflow.pool.core-size:4}") int coreSize,
            @Value("${workflow.pool.max-size:8}") int maxSize,
            @Value("${workflow.pool.queue-capacity:50}") int queueCapacity,
            @Value("${workflow.shutdown.await-termination-seconds:30}") int awaitSeconds,
            MeterRegistry meterRegistry) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(coreSize);
        executor.setMaxPoolSize(maxSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("workflow-");
        executor.setRejectedExecutionHandler((runnable, pool) -> {
            Counter.builder("workflow_tasks_rejected_total").register(meterRegistry).increment();
            log.warn("Workflow task rejected (pool overloaded): active={}, queue={}/{}. " +
                            "Workflow will NOT execute — increase pool size or reduce load.",
                    pool.getActiveCount(), pool.getQueue().size(), queueCapacity);
        });
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(awaitSeconds);
        executor.initialize();
        return executor;
    }
}
