package com.webhook.platform.worker.service;

import com.webhook.platform.common.constants.KafkaTopics;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.common.TopicPartition;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Service
@Slf4j
public class DlqMonitoringService {

    private final AdminClient adminClient;
    private final AtomicLong dlqDepth = new AtomicLong(0);
    private final MeterRegistry meterRegistry;

    public DlqMonitoringService(KafkaAdmin kafkaAdmin, MeterRegistry meterRegistry) {
        this.adminClient = AdminClient.create(kafkaAdmin.getConfigurationProperties());
        this.meterRegistry = meterRegistry;
        
        Gauge.builder("webhook_dlq_depth", dlqDepth, AtomicLong::get)
            .description("Number of messages in DLQ topic")
            .tag("topic", KafkaTopics.DELIVERIES_DLQ)
            .register(meterRegistry);
        
        log.info("DLQ monitoring initialized");
    }

    @Scheduled(fixedDelayString = "${dlq.monitoring.interval-ms:60000}")
    public void monitorDlqDepth() {
        try {
            Map<TopicPartition, Long> endOffsets = adminClient
                .listOffsets(Collections.singletonMap(
                    new TopicPartition(KafkaTopics.DELIVERIES_DLQ, 0),
                    org.apache.kafka.clients.admin.OffsetSpec.latest()
                ))
                .all()
                .get()
                .entrySet()
                .stream()
                .collect(java.util.stream.Collectors.toMap(
                    Map.Entry::getKey,
                    e -> e.getValue().offset()
                ));

            long totalMessages = endOffsets.values().stream().mapToLong(Long::longValue).sum();
            dlqDepth.set(totalMessages);
            
            if (totalMessages > 0) {
                log.warn("DLQ contains {} messages - manual intervention may be required", totalMessages);
            }
            
        } catch (Exception e) {
            log.error("Failed to monitor DLQ depth: {}", e.getMessage());
        }
    }
}
