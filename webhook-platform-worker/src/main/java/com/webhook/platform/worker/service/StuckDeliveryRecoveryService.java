package com.webhook.platform.worker.service;

import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@Slf4j
@RequiredArgsConstructor
public class StuckDeliveryRecoveryService {

    private final DeliveryRepository deliveryRepository;

    @Value("${stuck-delivery.threshold-minutes:5}")
    private int thresholdMinutes;

    @Scheduled(fixedRateString = "${stuck-delivery.check-interval-ms:60000}")
    @Transactional
    public void recoverStuckDeliveries() {
        Instant threshold = Instant.now().minusSeconds(thresholdMinutes * 60L);
        int recovered = deliveryRepository.resetStuckDeliveries(threshold);
        
        if (recovered > 0) {
            log.warn("Recovered {} stuck deliveries (PROCESSING > {} minutes)", recovered, thresholdMinutes);
        }
    }
}
