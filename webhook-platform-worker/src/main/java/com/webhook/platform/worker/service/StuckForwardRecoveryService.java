package com.webhook.platform.worker.service;

import com.webhook.platform.worker.domain.repository.IncomingForwardAttemptRepository;
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
public class StuckForwardRecoveryService {

    private static final String LOCK_KEY = "lock:stuck-forward-recovery";

    private final IncomingForwardAttemptRepository attemptRepository;
    private final RedissonClient redissonClient;

    @Value("${stuck-forward.threshold-minutes:5}")
    private int thresholdMinutes;

    @Scheduled(fixedRateString = "${stuck-forward.check-interval-ms:60000}")
    @Transactional
    public void recoverStuckForwardAttempts() {
        RLock lock = redissonClient.getLock(LOCK_KEY);
        boolean acquired = false;
        try {
            acquired = lock.tryLock(0, 30, TimeUnit.SECONDS);
            if (!acquired) {
                log.debug("Stuck forward recovery already running on another instance, skipping");
                return;
            }

            Instant threshold = Instant.now().minusSeconds(thresholdMinutes * 60L);
            int recovered = attemptRepository.resetStuckForwardAttempts(threshold);

            if (recovered > 0) {
                log.warn("Recovered {} stuck incoming forward attempts (PROCESSING > {} minutes)",
                        recovered, thresholdMinutes);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while acquiring stuck forward recovery lock");
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
}
