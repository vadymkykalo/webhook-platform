package com.webhook.platform.worker.service;

import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
@RequiredArgsConstructor
public class StuckDeliveryRecoveryService {

    private static final String LOCK_KEY = "lock:stuck-delivery-recovery";

    private final DeliveryRepository deliveryRepository;
    private final RedissonClient redissonClient;

    @Value("${stuck-delivery.threshold-minutes:5}")
    private int thresholdMinutes;

    @Scheduled(fixedRateString = "${stuck-delivery.check-interval-ms:60000}")
    @Transactional
    public void recoverStuckDeliveries() {
        RLock lock = redissonClient.getLock(LOCK_KEY);
        boolean acquired = false;
        try {
            acquired = lock.tryLock(0, 30, TimeUnit.SECONDS);
            if (!acquired) {
                log.debug("Stuck delivery recovery already running on another instance, skipping");
                return;
            }

            Instant threshold = Instant.now().minusSeconds(thresholdMinutes * 60L);
            int recovered = deliveryRepository.resetStuckDeliveries(threshold);

            if (recovered > 0) {
                log.warn("Recovered {} stuck deliveries (PROCESSING > {} minutes)", recovered, thresholdMinutes);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while acquiring stuck delivery recovery lock");
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
}
