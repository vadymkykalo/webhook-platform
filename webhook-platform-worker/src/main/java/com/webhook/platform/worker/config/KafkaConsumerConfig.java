package com.webhook.platform.worker.config;

import com.webhook.platform.common.dto.DeliveryMessage;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.util.backoff.FixedBackOff;

import java.util.HashMap;
import java.util.Map;

@Configuration
@EnableKafka
@Slf4j
public class KafkaConsumerConfig {

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;

    @Value("${spring.kafka.consumer.group-id}")
    private String groupId;
    
    @Value("${kafka.consumer.max-retries:3}")
    private int maxRetries;
    
    @Value("${kafka.consumer.retry-interval-ms:5000}")
    private long retryIntervalMs;

    @Bean
    public ConsumerFactory<String, DeliveryMessage> consumerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        props.put(JsonDeserializer.TRUSTED_PACKAGES, "com.webhook.platform.common.dto");
        props.put(JsonDeserializer.VALUE_DEFAULT_TYPE, DeliveryMessage.class.getName());
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 10);
        props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 300000);
        return new DefaultKafkaConsumerFactory<>(props);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, DeliveryMessage> kafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, DeliveryMessage> factory = 
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory());
        factory.setConcurrency(3);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL);
        factory.getContainerProperties().setShutdownTimeout(30_000L);
        
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(
            (consumerRecord, exception) -> {
                log.error("Message processing failed after {} retries. Topic: {}, Partition: {}, Offset: {}, Key: {}. Error: {}", 
                    maxRetries, 
                    consumerRecord.topic(), 
                    consumerRecord.partition(), 
                    consumerRecord.offset(), 
                    consumerRecord.key(),
                    exception.getMessage());
            },
            new FixedBackOff(retryIntervalMs, maxRetries)
        );
        
        factory.setCommonErrorHandler(errorHandler);
        
        log.info("Kafka consumer configured with max retries: {}, retry interval: {}ms", maxRetries, retryIntervalMs);
        
        return factory;
    }
}
