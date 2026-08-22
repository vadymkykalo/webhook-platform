package com.webhook.platform.worker.service;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import com.webhook.platform.worker.domain.repository.IncomingForwardAttemptRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.TopicPartitionInfo;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/**
 * Monitors the dead-letter path for <strong>both</strong> directions, from two genuinely
 * different angles each.
 *
 * <p>Per direction there is an actionable, DB-backed gauge and an informational, Kafka-side
 * one:
 *
 * <ul>
 *   <li>{@code webhook_dlq_depth} / {@code incoming_forward_dlq_depth} -- the ACTIONABLE
 *       backlog: how many Deliveries currently sit in {@code DeliveryStatus.DLQ}, and how many
 *       Forwards in {@code ForwardAttemptStatus.DLQ}, in Postgres -- i.e. have not yet been
 *       retried or purged (see {@code DlqService#retryDeliveries} / {@code #purgeAllDlq} on
 *       the API side). These are the numbers that should page someone, and they genuinely
 *       return to 0 once the backlog is worked through, because they are read from the same
 *       status column those operations mutate.
 *   <li>{@code webhook_dlq_topic_retained_total} / {@code
 *       incoming_forward_dlq_topic_retained_total} -- purely informational, Kafka-side
 *       signals: how many records physically remain in the {@code deliveries.dlq} and {@code
 *       incoming.forward.dlq} topics (latest minus earliest offset). Nothing consumes these
 *       topics, so the numbers reflect retention only, never remediation -- a record stays
 *       counted for the full retention window even after the underlying obligation has been
 *       retried or purged. They must never drive an alert.
 * </ul>
 *
 * <p>Previously there was only one gauge, {@code webhook_dlq_depth}, and it was computed
 * as the Kafka latest-earliest offset difference above. That number is structurally incapable
 * of representing "needs manual intervention" -- it counts every record retained in the topic,
 * remediated or not, so it never returned to 0 and the "manual intervention may be required"
 * warning fired every cycle indefinitely (an alert that never clears is one everyone learns to
 * ignore). The two concerns are now split, and only the DB-backed one is the actionable gauge.
 *
 * <p>The Incoming pair was added later still. Until then a Forward that exhausted its Retry
 * Ladder wrote {@code status = DLQ} on its {@code incoming_forward_attempts} row and nothing
 * else: no gauge, and so no alert could exist. Every abandoned Forward was invisible to
 * operators, however many of them piled up. Note that {@code incoming.forward.dlq} currently
 * carries only the listener container's poison records -- nothing produces a business DLQ
 * notification to it -- which is exactly why the retained-depth gauge on it is informational
 * and the row count is the one that matters.
 */
@Service
@Slf4j
public class DlqMonitoringService {

    private final AdminClient adminClient;
    private final DeliveryRepository deliveryRepository;
    private final IncomingForwardAttemptRepository incomingForwardAttemptRepository;
    private final AtomicLong actionableDlqDepth = new AtomicLong(0);
    private final AtomicLong topicRetainedDepth = new AtomicLong(0);
    private final AtomicLong incomingActionableDlqDepth = new AtomicLong(0);
    private final AtomicLong incomingTopicRetainedDepth = new AtomicLong(0);
    private final long adminClientTimeoutSeconds;

    public DlqMonitoringService(
            KafkaAdmin kafkaAdmin,
            DeliveryRepository deliveryRepository,
            IncomingForwardAttemptRepository incomingForwardAttemptRepository,
            MeterRegistry meterRegistry,
            @Value("${dlq.monitoring.admin-client-timeout-seconds:10}") long adminClientTimeoutSeconds) {
        this.adminClient = AdminClient.create(kafkaAdmin.getConfigurationProperties());
        this.deliveryRepository = deliveryRepository;
        this.incomingForwardAttemptRepository = incomingForwardAttemptRepository;
        this.adminClientTimeoutSeconds = adminClientTimeoutSeconds;

        Gauge.builder("webhook_dlq_depth", actionableDlqDepth, AtomicLong::get)
                .description("Deliveries currently in DLQ status awaiting manual retry or purge (actionable backlog)")
                .tag("topic", KafkaTopics.DELIVERIES_DLQ)
                .register(meterRegistry);

        Gauge.builder("webhook_dlq_topic_retained_total", topicRetainedDepth, AtomicLong::get)
                .description("Raw records retained in the DLQ Kafka topic (latest - earliest offset); informational only, does not reflect remediation")
                .tag("topic", KafkaTopics.DELIVERIES_DLQ)
                .register(meterRegistry);

        Gauge.builder("incoming_forward_dlq_depth", incomingActionableDlqDepth, AtomicLong::get)
                .description("Forwards currently in DLQ status awaiting manual retry or purge (actionable backlog)")
                .tag("topic", KafkaTopics.INCOMING_FORWARD_DLQ)
                .register(meterRegistry);

        Gauge.builder("incoming_forward_dlq_topic_retained_total", incomingTopicRetainedDepth, AtomicLong::get)
                .description("Raw records retained in the incoming forward DLQ Kafka topic (latest - earliest offset); informational only, does not reflect remediation")
                .tag("topic", KafkaTopics.INCOMING_FORWARD_DLQ)
                .register(meterRegistry);

        log.info("DLQ monitoring initialized");
    }

    @PreDestroy
    public void close() {
        try {
            adminClient.close();
            log.info("DLQ monitoring AdminClient closed");
        } catch (Exception e) {
            log.warn("Failed to close DLQ AdminClient: {}", e.getMessage());
        }
    }

    @Scheduled(fixedDelayString = "${dlq.monitoring.interval-ms:60000}")
    public void monitorDlqDepth() {
        // Independent try/catches all the way down: a DB outage must not suppress the
        // Kafka-side signals, a broker outage must not suppress the actionable (DB-backed)
        // ones, and neither direction may suppress the other -- an Incoming backlog is
        // exactly as invisible as an Outgoing one if one failing query silently ends the poll.
        refreshActionableDepth("Deliveries", deliveryRepository::countDlqTotal, actionableDlqDepth);
        refreshActionableDepth("Forwards", incomingForwardAttemptRepository::countDlqTotal, incomingActionableDlqDepth);
        refreshTopicRetainedDepth(KafkaTopics.DELIVERIES_DLQ, topicRetainedDepth);
        refreshTopicRetainedDepth(KafkaTopics.INCOMING_FORWARD_DLQ, incomingTopicRetainedDepth);
    }

    private void refreshActionableDepth(String what, LongSupplier count, AtomicLong gaugeValue) {
        try {
            long depth = count.getAsLong();
            long previous = gaugeValue.getAndSet(depth);

            if (depth > 0) {
                log.warn("{} {} in DLQ status - manual intervention may be required (retry or purge via DlqService)", depth, what);
            } else if (previous > 0) {
                log.info("DLQ backlog cleared - 0 {} remain in DLQ status", what);
            }
        } catch (Exception e) {
            log.error("Failed to refresh actionable DLQ depth for {}: {}", what, e.getMessage());
        }
    }

    private void refreshTopicRetainedDepth(String topic, AtomicLong gaugeValue) {
        try {
            // Discover all partitions dynamically. Bounded .get() - an unbounded call here sat
            // on a scheduler thread indefinitely if the broker was slow/unreachable, starving
            // every other @Scheduled job sharing the pool.
            TopicDescription description = adminClient
                    .describeTopics(Collections.singletonList(topic))
                    .topicNameValues()
                    .get(topic)
                    .get(adminClientTimeoutSeconds, TimeUnit.SECONDS);

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
                    .listOffsets(latestRequest).all().get(adminClientTimeoutSeconds, TimeUnit.SECONDS);
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> earliestOffsets = adminClient
                    .listOffsets(earliestRequest).all().get(adminClientTimeoutSeconds, TimeUnit.SECONDS);

            // Compute retained volume per partition: latest - earliest. This is retention
            // volume, not backlog -- see the class Javadoc. It never drives the "manual
            // intervention" warning.
            long totalMessages = 0;
            for (TopicPartitionInfo partitionInfo : partitions) {
                TopicPartition tp = new TopicPartition(topic, partitionInfo.partition());
                long latest = latestOffsets.get(tp).offset();
                long earliest = earliestOffsets.get(tp).offset();
                long partitionDepth = latest - earliest;
                totalMessages += partitionDepth;

                if (partitionDepth > 0) {
                    log.debug("DLQ topic {} partition {} retained: {} (earliest={}, latest={})",
                            topic, partitionInfo.partition(), partitionDepth, earliest, latest);
                }
            }

            gaugeValue.set(totalMessages);
        } catch (Exception e) {
            log.error("Failed to monitor DLQ topic retained depth for {}: {}", topic, e.getMessage());
        }
    }
}
