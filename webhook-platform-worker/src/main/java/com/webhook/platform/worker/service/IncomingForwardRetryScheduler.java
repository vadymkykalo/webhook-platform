package com.webhook.platform.worker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.worker.domain.repository.IncomingForwardAttemptRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@Slf4j
public class IncomingForwardRetryScheduler {

    private final IncomingForwardAttemptRepository attemptRepository;
    private final KafkaTemplate<String, IncomingForwardMessage> kafkaTemplate;
    private final int batchSize;
    private final Counter retryScheduledCounter;

    public IncomingForwardRetryScheduler(
            IncomingForwardAttemptRepository attemptRepository,
            KafkaTemplate<String, IncomingForwardMessage> kafkaTemplate,
            MeterRegistry meterRegistry,
            @Value("${incoming-forward.retry.batch-size:50}") int batchSize) {
        this.attemptRepository = attemptRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.batchSize = batchSize;
        this.retryScheduledCounter = Counter.builder("incoming_forward_retries_scheduled_total")
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${incoming-forward.retry.poll-interval-ms:10000}")
    public void pollPendingRetries() {
        try {
            List<IncomingForwardAttempt> pendingRetries = attemptRepository
                    .findPendingRetries(ForwardAttemptStatus.PENDING, Instant.now(), PageRequest.of(0, batchSize));

            if (pendingRetries.isEmpty()) {
                return;
            }

            log.info("Found {} incoming forward retries to schedule", pendingRetries.size());

            for (IncomingForwardAttempt attempt : pendingRetries) {
                try {
                    IncomingForwardMessage message = IncomingForwardMessage.builder()
                            .incomingEventId(attempt.getIncomingEventId())
                            .destinationId(attempt.getDestinationId())
                            .attemptCount(attempt.getAttemptNumber())
                            .replay(false)
                            .build();

                    kafkaTemplate.send(
                            KafkaTopics.INCOMING_FORWARD_RETRY,
                            attempt.getDestinationId().toString(),
                            message
                    );

                    // Clear the next_retry_at so we don't re-pick it
                    attempt.setNextRetryAt(null);
                    attempt.setStatus(ForwardAttemptStatus.PROCESSING);
                    attemptRepository.save(attempt);

                    retryScheduledCounter.increment();

                    log.debug("Scheduled incoming forward retry: eventId={}, destId={}, attempt={}",
                            attempt.getIncomingEventId(), attempt.getDestinationId(),
                            attempt.getAttemptNumber());
                } catch (Exception e) {
                    log.error("Failed to schedule incoming forward retry: attemptId={}: {}",
                            attempt.getId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Error polling incoming forward retries: {}", e.getMessage(), e);
        }
    }
}
