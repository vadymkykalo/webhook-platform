package com.webhook.platform.worker.service;

import com.webhook.platform.common.constants.KafkaTopics;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.TopicPartitionInfo;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
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
                .description("Number of messages in DLQ topic across all partitions")
                .tag("topic", KafkaTopics.DELIVERIES_DLQ)
                .register(meterRegistry);

        log.info("DLQ monitoring initialized");
    }

    @Scheduled(fixedDelayString = "${dlq.monitoring.interval-ms:60000}")
    public void monitorDlqDepth() {
        try {
            String topic = KafkaTopics.DELIVERIES_DLQ;

            // Discover all partitions dynamically
            TopicDescription description = adminClient
                    .describeTopics(Collections.singletonList(topic))
                    .topicNameValues()
                    .get(topic)
                    .get();

            List<TopicPartitionInfo> partitions = description.partitions();

            // Build offset requests for all partitions
            Map<TopicPartition, OffsetSpec> latestRequest = new HashMap<>();
            Map<TopicPartition, OffsetSpec> earliestRequest = new HashMap<>();
            for (TopicPartitionInfo partitionInfo : partitions) {
                TopicPartition tp = new TopicPartition(topic, partitionInfo.partition());
                latestRequest.put(tp, OffsetSpec.latest());
                earliestRequest.put(tp, OffsetSpec.earliest());
            }

            // Query latest and earliest offsets for all partitions
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latestOffsets = adminClient
                    .listOffsets(latestRequest).all().get();
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> earliestOffsets = adminClient
                    .listOffsets(earliestRequest).all().get();

            // Compute depth per partition: latest - earliest
            long totalMessages = 0;
            for (TopicPartitionInfo partitionInfo : partitions) {
                TopicPartition tp = new TopicPartition(topic, partitionInfo.partition());
                long latest = latestOffsets.get(tp).offset();
                long earliest = earliestOffsets.get(tp).offset();
                long partitionDepth = latest - earliest;
                totalMessages += partitionDepth;

                if (partitionDepth > 0) {
                    log.debug("DLQ partition {} depth: {} (earliest={}, latest={})",
                            partitionInfo.partition(), partitionDepth, earliest, latest);
                }
            }

            dlqDepth.set(totalMessages);

            if (totalMessages > 0) {
                log.warn("DLQ contains {} messages across {} partitions - manual intervention may be required",
                        totalMessages, partitions.size());
            }

        } catch (Exception e) {
            log.error("Failed to monitor DLQ depth: {}", e.getMessage());
        }
    }
}
